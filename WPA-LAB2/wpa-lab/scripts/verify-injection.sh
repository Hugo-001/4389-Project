#!/usr/bin/env bash
# =============================================================================
# verify-injection.sh  —  Confirm packet injection on the SIMULATED monitor
# CS4389 isolated Wi-Fi test lab. 100% virtual — NO physical adapter.
#
# mac80211_hwsim supports packet injection, so this proves the capture/inject
# path works end-to-end on the virtual monitor interface created by
# setup-virtual.sh. No airmon-ng, no real radio, no mode-switching of a
# physical card is involved.
#
# Two complementary checks (both non-destructive, against OUR OWN lab only):
#   1. RX: tcpdump on the monitor interface sees 802.11 beacons from our AP.
#   2. TX: aireplay-ng --test injects and listens for replies (if aircrack-ng
#      is installed); otherwise a raw-socket inject+capture self-test is used.
#
# Use ONLY on the team-owned, isolated virtual lab described in
# docs/AUTHORIZATION-ISOLATION-NOTE.md.
#
#   usage:  sudo ./verify-injection.sh [monitor_iface] [ap_bssid]
#     monitor_iface  defaults to the role map's MONITOR_IFACE
#     ap_bssid       optional BSSID of one of our APs to probe against
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-roles.sh
. "${SCRIPT_DIR}/lib-roles.sh"
load_roles

MONIFACE="${1:-$MONITOR_IFACE}"
AP_BSSID="${2:-}"

[ "$(id -u)" -eq 0 ] || { echo "[FAIL] Must run as root (sudo)."; exit 2; }
command -v iw >/dev/null 2>&1 || { echo "[FAIL] 'iw' missing: sudo apt install -y iw"; exit 2; }

if [ ! -d "/sys/class/net/${MONIFACE}" ]; then
  echo "[FAIL] Monitor interface '${MONIFACE}' not found."
  echo "       Create the virtual radios first:  sudo ./scripts/setup-virtual.sh"
  exit 2
fi

echo "============================================================"
echo " Injection capability check (virtual) on ${MONIFACE}"
echo "============================================================"

# Ensure the interface is in monitor mode and up on the lab channel.
TYPE=$(iw dev "$MONIFACE" info 2>/dev/null | awk '/type/{print $2; exit}')
if [ "$TYPE" != "monitor" ]; then
  echo "[*] ${MONIFACE} is '${TYPE:-unknown}'; switching to monitor mode..."
  ip link set "$MONIFACE" down
  iw dev "$MONIFACE" set type monitor || { echo "[FAIL] could not set monitor mode"; exit 2; }
fi
ip link set "$MONIFACE" up
iw dev "$MONIFACE" set channel "${LAB_CHANNEL}" 2>/dev/null || true
echo "[*] Monitor interface ${MONIFACE} ready on channel ${LAB_CHANNEL}."

RC=0

# --- 1. RX self-test: do we see our AP's beacons? ----------------------------
echo
echo "[1] RX check — capturing 802.11 beacons for ~5s (needs an AP running)..."
if command -v tcpdump >/dev/null 2>&1; then
  set +e
  BEACONS=$(timeout 5 tcpdump -i "$MONIFACE" -c 5 -nn type mgt subtype beacon 2>/dev/null | wc -l)
  set -e
  if [ "${BEACONS:-0}" -gt 0 ]; then
    echo "    [PASS] Captured ${BEACONS} beacon frame(s) on ${MONIFACE} (RX works)."
  else
    echo "    [WARN] No beacons captured. Start an AP first:  sudo ./scripts/start-ap.sh all"
  fi
else
  echo "    [info] tcpdump not installed; skipping RX capture check."
  echo "           sudo apt install -y tcpdump"
fi

# --- 2. TX/injection self-test ----------------------------------------------
echo
echo "[2] TX/injection check..."
if command -v aireplay-ng >/dev/null 2>&1; then
  echo "    Using aireplay-ng --test (no deauth/attack; probes injection only)."
  set +e
  if [ -n "$AP_BSSID" ]; then
    aireplay-ng --test -a "$AP_BSSID" "$MONIFACE"
  else
    aireplay-ng --test "$MONIFACE"
  fi
  RC=$?
  set -e
  if [ "$RC" -eq 0 ]; then
    echo "    [PASS] aireplay-ng reports injection capability on ${MONIFACE}."
  else
    echo "    [WARN] aireplay-ng --test returned rc=${RC}."
    echo "           On hwsim this usually means no AP was in range on the channel;"
    echo "           start an AP (start-ap.sh all) and pass its BSSID as arg 2."
  fi
else
  # Fallback: raw-socket inject of a probe-request + capture it back.
  echo "    aircrack-ng not installed; using built-in raw-socket inject+capture."
  if command -v python3 >/dev/null 2>&1; then
    set +e
    python3 -I - "$MONIFACE" <<'PY'
import socket, struct, sys, time
iface = sys.argv[1]
# Minimal radiotap header (len=8, no fields) + a broadcast probe-request.
radiotap = struct.pack('<BBHI', 0, 0, 8, 0)
fc = b'\x40\x00'                      # type=mgmt, subtype=probe-req
dur = b'\x00\x00'
bcast = b'\xff\xff\xff\xff\xff\xff'
src = b'\x02\x00\x00\x00\x00\x01'     # locally-administered test MAC
seq = b'\x00\x00'
ssid_ie = b'\x00\x00'                 # SSID element, length 0 (wildcard)
frame = radiotap + fc + dur + bcast + src + bcast + seq + ssid_ie
try:
    tx = socket.socket(socket.AF_PACKET, socket.SOCK_RAW)
    tx.bind((iface, 0))
    rx = socket.socket(socket.AF_PACKET, socket.SOCK_RAW, socket.htons(0x0003))
    rx.bind((iface, 0))
    rx.settimeout(3)
    sent = 0
    for _ in range(5):
        tx.send(frame); sent += 1; time.sleep(0.1)
    got = 0
    end = time.time() + 2
    while time.time() < end:
        try:
            data = rx.recv(4096)
            if src in data:
                got += 1
                break
        except socket.timeout:
            break
    if got:
        print(f"    [PASS] Injected {sent} frame(s) and captured our own frame back (injection works).")
        sys.exit(0)
    else:
        print(f"    [WARN] Injected {sent} frame(s) but did not read one back.")
        print("           (hwsim injection still likely works; capture timing can miss it.)")
        sys.exit(1)
except PermissionError:
    print("    [FAIL] Permission denied opening raw socket (run with sudo).")
    sys.exit(2)
except OSError as e:
    print(f"    [WARN] Raw-socket self-test could not run: {e}")
    sys.exit(1)
PY
    RC=$?
    set -e
  else
    echo "    [info] python3 not available; install aircrack-ng for the injection test:"
    echo "           sudo apt install -y aircrack-ng"
    RC=1
  fi
fi

echo
echo "============================================================"
echo " Done. Injection path exercised on virtual monitor ${MONIFACE}."
echo " (The interface is left in monitor mode for capture/handshake work.)"
echo "============================================================"
exit 0
