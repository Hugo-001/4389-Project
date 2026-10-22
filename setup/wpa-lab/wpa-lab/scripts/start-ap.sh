#!/usr/bin/env bash
# =============================================================================
# start-ap.sh  —  Bring up the isolated lab AP in a chosen mode (Linux)
# CS4389 isolated Wi-Fi test lab. Team-owned, air-gapped hardware only.
#
# Usage:  sudo ./start-ap.sh <wpa2|wpa3|transition>
#
# Sets a static IP on the AP interface, starts dnsmasq (DHCP, NO uplink/NAT),
# and launches the matching hostapd config. Prints the SSID clients should join.
# Nothing here enables IP forwarding or NAT — the lab stays air-gapped.
# =============================================================================
set -euo pipefail

MODE="${1:-}"
case "$MODE" in
  wpa2|wpa3|transition) : ;;
  *) echo "Usage: sudo $0 <wpa2|wpa3|transition>"; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CONF_DIR="${ROOT_DIR}/configs"
HOSTAPD_CONF="${CONF_DIR}/hostapd-${MODE}.conf"
DNSMASQ_CONF="${CONF_DIR}/dnsmasq.conf"

IFACE="${IFACE:-wlan0}"     # override with: IFACE=wlan1 sudo ./start-ap.sh ...
AP_IP="192.168.50.1"
AP_CIDR="${AP_IP}/24"
RUN_DIR="/run/wpa-lab"
HOSTAPD_PID="${RUN_DIR}/hostapd.pid"
DNSMASQ_PID="${RUN_DIR}/dnsmasq.pid"

[ "$(id -u)" -eq 0 ] || { echo "[FAIL] Run as root (sudo)."; exit 2; }
[ -f "$HOSTAPD_CONF" ] || { echo "[FAIL] Missing $HOSTAPD_CONF"; exit 2; }
[ -f "$DNSMASQ_CONF" ] || { echo "[FAIL] Missing $DNSMASQ_CONF"; exit 2; }
for t in hostapd dnsmasq ip; do
  command -v "$t" >/dev/null 2>&1 || { echo "[FAIL] '$t' missing: sudo apt install -y hostapd dnsmasq iproute2"; exit 2; }
done

# SAE preflight for modes that need it.
if [ "$MODE" = "wpa3" ] || [ "$MODE" = "transition" ]; then
  if ! hostapd -v 2>&1 | grep -qi "SAE"; then
    echo "[WARN] hostapd -v did not advertise SAE; WPA3/transition may fail."
    echo "       See scripts/check-adapter.sh step 6 for how to get a SAE build."
  fi
fi

mkdir -p "$RUN_DIR"

echo "============================================================"
echo " Starting lab AP   mode=${MODE}   iface=${IFACE}"
echo " Config: ${HOSTAPD_CONF}"
echo "============================================================"

# Free the radio of NetworkManager/wpa_supplicant interference.
echo "[*] Releasing interface from NetworkManager (if present)..."
nmcli dev set "$IFACE" managed no >/dev/null 2>&1 || true
systemctl stop wpa_supplicant >/dev/null 2>&1 || true

echo "[*] Assigning static IP ${AP_CIDR} to ${IFACE}..."
ip link set "$IFACE" down
ip addr flush dev "$IFACE"
ip link set "$IFACE" up
ip addr add "$AP_CIDR" dev "$IFACE"

echo "[*] Starting dnsmasq (DHCP only, no uplink)..."
# Clear any stale lease file so client-check.sh reads fresh leases.
: > /var/lib/misc/dnsmasq.leases 2>/dev/null || true
dnsmasq --conf-file="$DNSMASQ_CONF" \
        --interface="$IFACE" \
        --pid-file="$DNSMASQ_PID" \
        --except-interface=lo
echo "    dnsmasq PID $(cat "$DNSMASQ_PID" 2>/dev/null || echo '?')"

echo "[*] Starting hostapd (foreground; Ctrl-C to stop, then run stop-ap.sh)..."
SSID=$(awk -F= '/^ssid=/{print $2; exit}' "$HOSTAPD_CONF")
echo
echo "   ------------------------------------------------------------"
echo "    AP is coming up. Clients should join SSID:  ${SSID}"
echo "    Lab subnet: 192.168.50.0/24   AP: ${AP_IP}   (no gateway/DNS)"
echo "    Credentials: see ${HOSTAPD_CONF} (remember you changed the placeholder!)"
echo "   ------------------------------------------------------------"
echo

# Run hostapd in foreground so logs are visible for screenshots.
# Record PID for stop-ap.sh even though it's foreground (backgrounded shell PID).
hostapd -P "$HOSTAPD_PID" "$HOSTAPD_CONF"
