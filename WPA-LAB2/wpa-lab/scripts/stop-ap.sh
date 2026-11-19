#!/usr/bin/env bash
# =============================================================================
# stop-ap.sh  —  Tear down the lab AP(s) on the VIRTUAL radios (Linux)
# CS4389 isolated Wi-Fi test lab. 100% virtual — NO physical adapter.
#
# Usage:  sudo ./stop-ap.sh [wpa2|wpa3|transition|all]   (default: all)
#   Stops the hostapd + dnsmasq instance(s), removes the static AP IP(s), and
#   returns the AP interface(s) to managed mode. The virtual radios themselves
#   stay loaded — use 'setup-virtual.sh --down' to unload mac80211_hwsim.
# =============================================================================
set -euo pipefail

TARGET="${1:-all}"
case "$TARGET" in
  wpa2|wpa3|transition|all) : ;;
  *) echo "Usage: sudo $0 [wpa2|wpa3|transition|all]"; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="/run/wpa-lab"
# shellcheck source=lib-roles.sh
. "${SCRIPT_DIR}/lib-roles.sh"
load_roles

[ "$(id -u)" -eq 0 ] || { echo "[FAIL] Run as root (sudo)."; exit 2; }

echo "============================================================"
echo " Stopping virtual lab AP(s): ${TARGET}"
echo "============================================================"

stop_one() {
  local mode="$1" iface oct
  iface="$(iface_for_mode "$mode")"
  oct="$(subnet_octet_for_mode "$mode")"

  echo "[*] [${mode}] stopping hostapd + dnsmasq..."
  for svc in hostapd dnsmasq; do
    local pf="${RUN_DIR}/${svc}-${mode}.pid"
    [ -f "$pf" ] && { kill "$(cat "$pf")" 2>/dev/null || true; rm -f "$pf"; }
  done

  echo "[*] [${mode}] removing static IP from ${iface}..."
  ip addr del "192.168.${oct}.1/24" dev "$iface" 2>/dev/null || true
  ip addr flush dev "$iface" 2>/dev/null || true
  iw dev "$iface" set type managed 2>/dev/null || true

  rm -f "${RUN_DIR}/hostapd-${mode}.runtime.conf" \
        "${RUN_DIR}/hostapd-${mode}.log" \
        "${RUN_DIR}/dnsmasq-${mode}.leases" 2>/dev/null || true
}

if [ "$TARGET" = "all" ]; then
  for m in wpa2 wpa3 transition; do stop_one "$m"; done
  # Belt-and-suspenders: clean up any stragglers from this lab only.
  pkill -x hostapd 2>/dev/null || true
  pkill -f "dnsmasq.*wpa-lab" 2>/dev/null || true
else
  stop_one "$TARGET"
fi

echo
echo "[*] Teardown complete."
echo "    Verify:  iw dev ; ip addr | grep -c 192.168.5   (expect 0)"
echo "    To unload the virtual radios entirely:  sudo ./scripts/setup-virtual.sh --down"
