#!/usr/bin/env bash
# =============================================================================
# stop-ap.sh  —  Tear down the lab AP and restore the interface (Linux)
# CS4389 isolated Wi-Fi test lab.
#
# Usage:  sudo ./stop-ap.sh
#   Stops hostapd + dnsmasq, removes the static IP, and returns the interface
#   to NetworkManager/managed mode.
# =============================================================================
set -euo pipefail

IFACE="${IFACE:-wlan0}"
AP_IP="192.168.50.1/24"
RUN_DIR="/run/wpa-lab"

[ "$(id -u)" -eq 0 ] || { echo "[FAIL] Run as root (sudo)."; exit 2; }

echo "============================================================"
echo " Stopping lab AP on ${IFACE}"
echo "============================================================"

echo "[*] Stopping hostapd..."
if [ -f "${RUN_DIR}/hostapd.pid" ]; then
  kill "$(cat "${RUN_DIR}/hostapd.pid")" 2>/dev/null || true
fi
pkill -x hostapd 2>/dev/null || true

echo "[*] Stopping dnsmasq..."
if [ -f "${RUN_DIR}/dnsmasq.pid" ]; then
  kill "$(cat "${RUN_DIR}/dnsmasq.pid")" 2>/dev/null || true
fi
# Only kill the dnsmasq we started (matches our conf path), not a system one.
pkill -f "dnsmasq.*wpa-lab" 2>/dev/null || true

echo "[*] Removing static IP from ${IFACE}..."
ip addr del "$AP_IP" dev "$IFACE" 2>/dev/null || true
ip addr flush dev "$IFACE" 2>/dev/null || true

echo "[*] Returning ${IFACE} to managed / NetworkManager..."
iw dev "$IFACE" set type managed 2>/dev/null || true
nmcli dev set "$IFACE" managed yes >/dev/null 2>&1 || true
ip link set "$IFACE" up 2>/dev/null || true

rm -f "${RUN_DIR}/hostapd.pid" "${RUN_DIR}/dnsmasq.pid" 2>/dev/null || true

echo "[*] Teardown complete. Verify with: iw dev ; ip addr show ${IFACE}"
