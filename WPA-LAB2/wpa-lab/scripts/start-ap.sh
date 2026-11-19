#!/usr/bin/env bash
# =============================================================================
# start-ap.sh  —  Bring up the isolated lab AP(s) on VIRTUAL radios (Linux)
# CS4389 isolated Wi-Fi test lab. 100% virtual — NO physical adapter.
#
# Usage:  sudo ./start-ap.sh <wpa2|wpa3|transition|all>
#
# Each mode runs on its own simulated interface (from the setup-virtual.sh role
# map) and its own isolated /24, so all three APs can run at once:
#   wpa2       -> 192.168.50.1/24   (LAB-WPA2-TEST)
#   wpa3       -> 192.168.51.1/24   (LAB-WPA3-TEST)
#   transition -> 192.168.52.1/24   (LAB-TRANSITION-TEST)
#
# For a single mode, hostapd runs in the FOREGROUND (handy for screenshots).
# For 'all', the three instances run in the BACKGROUND with logs under
# /run/wpa-lab/. Nothing here enables IP forwarding or NAT — the lab stays
# air-gapped. dnsmasq serves DHCP ONLY (no gateway, no DNS) per subnet.
# =============================================================================
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  wpa2|wpa3|transition|all) : ;;
  *) echo "Usage: sudo $0 <wpa2|wpa3|transition|all>"; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONF_DIR="${ROOT_DIR}/configs"
DNSMASQ_CONF="${CONF_DIR}/dnsmasq.conf"
RUN_DIR="/run/wpa-lab"
# shellcheck source=lib-roles.sh
. "${SCRIPT_DIR}/lib-roles.sh"
load_roles

[ "$(id -u)" -eq 0 ] || { echo "[FAIL] Run as root (sudo)."; exit 2; }
[ -f "$DNSMASQ_CONF" ] || { echo "[FAIL] Missing $DNSMASQ_CONF"; exit 2; }
for t in hostapd dnsmasq ip iw; do
  command -v "$t" >/dev/null 2>&1 || { echo "[FAIL] '$t' missing: sudo apt install -y hostapd dnsmasq iproute2 iw"; exit 2; }
done
if ! lsmod 2>/dev/null | grep -q '^mac80211_hwsim'; then
  echo "[FAIL] mac80211_hwsim not loaded. Run first:  sudo ./scripts/setup-virtual.sh"
  exit 2
fi

mkdir -p "$RUN_DIR"

# Start one AP (mode) on its mapped interface + subnet. Backgrounds dnsmasq
# always; backgrounds hostapd only when $1 == background.
start_one() {
  local mode="$1" run_mode="${2:-foreground}"
  local conf iface oct ap_ip ap_cidr rconf
  conf="${CONF_DIR}/hostapd-${mode}.conf"
  [ -f "$conf" ] || { echo "[FAIL] Missing $conf"; return 2; }
  iface="$(iface_for_mode "$mode")"
  oct="$(subnet_octet_for_mode "$mode")"
  ap_ip="192.168.${oct}.1"
  ap_cidr="${ap_ip}/24"

  [ -d "/sys/class/net/${iface}" ] || { echo "[FAIL] interface ${iface} missing (run setup-virtual.sh)"; return 2; }

  # SAE preflight for modes that need it.
  if { [ "$mode" = "wpa3" ] || [ "$mode" = "transition" ]; } \
     && ! hostapd -v 2>&1 | grep -qi "SAE"; then
    echo "[WARN] hostapd -v did not advertise SAE; ${mode} may fail (see check-adapter.sh)."
  fi

  # If the config's interface= line doesn't match the live role map, write a
  # runtime copy with the correct interface. Keeps the committed .conf clean
  # while staying robust to interface renaming.
  local conf_iface
  conf_iface=$(awk -F= '/^interface=/{print $2; exit}' "$conf")
  if [ "$conf_iface" != "$iface" ]; then
    rconf="${RUN_DIR}/hostapd-${mode}.runtime.conf"
    sed "s/^interface=.*/interface=${iface}/" "$conf" > "$rconf"
    echo "[*] [${mode}] using ${iface} (config had ${conf_iface}); runtime conf: ${rconf}"
    conf="$rconf"
  fi

  echo "[*] [${mode}] configuring ${iface} with static ${ap_cidr}..."
  ip link set "$iface" down 2>/dev/null || true
  ip addr flush dev "$iface" 2>/dev/null || true
  ip link set "$iface" up
  ip addr add "$ap_cidr" dev "$iface"

  echo "[*] [${mode}] starting dnsmasq (DHCP only, no uplink) on ${iface}..."
  local leasefile pidfile
  leasefile="${RUN_DIR}/dnsmasq-${mode}.leases"
  pidfile="${RUN_DIR}/dnsmasq-${mode}.pid"
  : > "$leasefile" 2>/dev/null || true
  dnsmasq --conf-file="$DNSMASQ_CONF" \
          --interface="$iface" \
          --bind-dynamic \
          --dhcp-range="192.168.${oct}.50,192.168.${oct}.150,255.255.255.0,12h" \
          --dhcp-leasefile="$leasefile" \
          --pid-file="$pidfile" \
          --except-interface=lo
  echo "    [${mode}] dnsmasq PID $(cat "$pidfile" 2>/dev/null || echo '?'), leases: ${leasefile}"

  local ssid hpid
  ssid=$(awk -F= '/^ssid=/{print $2; exit}' "$conf")
  hpid="${RUN_DIR}/hostapd-${mode}.pid"
  echo "   ------------------------------------------------------------"
  echo "    [${mode}] SSID: ${ssid}   iface: ${iface}   AP: ${ap_ip} (no gateway/DNS)"
  echo "    [${mode}] credentials: see ${CONF_DIR}/hostapd-${mode}.conf (change placeholders!)"
  echo "   ------------------------------------------------------------"

  if [ "$run_mode" = "background" ]; then
    local log="${RUN_DIR}/hostapd-${mode}.log"
    hostapd -B -P "$hpid" "$conf" > "$log" 2>&1
    echo "    [${mode}] hostapd backgrounded (PID $(cat "$hpid" 2>/dev/null || echo '?')), log: ${log}"
  else
    echo "[*] [${mode}] starting hostapd (foreground; Ctrl-C to stop, then stop-ap.sh)..."
    hostapd -P "$hpid" "$conf"
  fi
}

echo "============================================================"
echo " Starting virtual lab AP(s)   mode=${MODE}"
echo "============================================================"

if [ "$MODE" = "all" ]; then
  for m in wpa2 wpa3 transition; do
    echo
    start_one "$m" background
  done
  echo
  echo "============================================================"
  echo " All three APs are up (background). Verify / tear down with:"
  echo "   iw dev ; ip addr | grep 192.168.5"
  echo "   sudo ./scripts/stop-ap.sh            # stops everything"
  echo " Logs: ${RUN_DIR}/hostapd-*.log"
  echo "============================================================"
else
  start_one "$MODE" foreground
fi
