#!/usr/bin/env bash
# =============================================================================
# client-check.sh  —  Prove association + DHCP + negotiated security (Linux)
# CS4389 isolated Wi-Fi test lab.
#
# Run this FROM A CONNECTED LINUX CLIENT (a test client joined to the lab AP).
# It shows the association state, the DHCP lease on the 192.168.50.0/24 subnet,
# and the negotiated cipher / key-management so you can prove WPA2 vs WPA3 vs
# transition actually took effect.
#
# Usage:  ./client-check.sh [iface]   (default iface: wlan0)
# =============================================================================
set -euo pipefail

IFACE="${1:-wlan0}"

command -v iw >/dev/null 2>&1 || { echo "[FAIL] 'iw' missing: sudo apt install -y iw"; exit 2; }

echo "============================================================"
echo " Client association & security check on ${IFACE}"
echo "============================================================"

# --- 1. Association ----------------------------------------------------------
echo
echo "[1] Association (iw dev ${IFACE} link):"
LINK=$(iw dev "$IFACE" link 2>/dev/null || true)
if echo "$LINK" | grep -qi "Connected to"; then
  echo "$LINK" | sed 's/^/    /'
  SSID=$(echo "$LINK" | awk -F': ' '/SSID/{print $2; exit}')
  echo "    [PASS] Associated to SSID: ${SSID:-<unknown>}"
else
  echo "    [FAIL] Not associated on ${IFACE}. Join the lab SSID first."
  echo "           (nmcli dev wifi connect 'LAB-WPA2-TEST' password '<yours>')"
  exit 1
fi

# --- 2. DHCP lease on the isolated subnet ------------------------------------
echo
echo "[2] IP / DHCP lease:"
IPLINE=$(ip -4 addr show "$IFACE" | awk '/inet /{print $2}')
echo "    Address: ${IPLINE:-<none>}"
if echo "$IPLINE" | grep -q "^192\.168\.50\."; then
  echo "    [PASS] Got a lease on the isolated lab subnet (192.168.50.0/24)."
else
  echo "    [WARN] No 192.168.50.x address. DHCP may not have completed."
fi
# Confirm air-gap: there should be NO default route via this interface.
if ip route show default dev "$IFACE" 2>/dev/null | grep -q default; then
  echo "    [WARN] A default route exists via ${IFACE} — lab should have NONE."
else
  echo "    [PASS] No default gateway via ${IFACE} (air-gap intact)."
fi

# --- 3. Negotiated security (cipher / key management) ------------------------
echo
echo "[3] Negotiated security:"
# 'iw dev <if> link' shows RSN info on many drivers; station dump has more.
RSN=$(iw dev "$IFACE" link 2>/dev/null | grep -iE "RSN|cipher|authentication|group" || true)
if [ -z "$RSN" ]; then
  # Fall back to the station dump against the connected BSSID.
  RSN=$(iw dev "$IFACE" station dump 2>/dev/null | grep -iE "cipher|authent|rsn" || true)
fi
if [ -n "$RSN" ]; then
  echo "$RSN" | sed 's/^/    /'
else
  echo "    [info] Driver did not expose cipher via iw. Try wpa_cli:"
  echo "           wpa_cli -i ${IFACE} status | grep -E 'key_mgmt|pairwise|group|pmf'"
fi

# wpa_cli gives the clearest key_mgmt readout when wpa_supplicant manages the link.
if command -v wpa_cli >/dev/null 2>&1; then
  echo
  echo "    wpa_cli status (key_mgmt / cipher / pmf):"
  wpa_cli -i "$IFACE" status 2>/dev/null \
    | grep -iE "key_mgmt|pairwise_cipher|group_cipher|pmf|ieee80211w" \
    | sed 's/^/      /' || echo "      (wpa_supplicant not managing ${IFACE})"
fi

echo
echo "    Interpretation:"
echo "      - WPA2  : key_mgmt=WPA-PSK, pairwise=CCMP, pmf often disabled"
echo "      - WPA3  : key_mgmt=SAE, pairwise=CCMP, pmf=1/required (ieee80211w=2)"
echo "      - Trans.: SAE-capable clients show SAE+PMF; legacy show WPA-PSK"
echo
echo "============================================================"
echo " Done. Capture this output as proof of the negotiated mode."
echo "============================================================"
