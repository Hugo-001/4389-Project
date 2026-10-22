#!/usr/bin/env bash
# =============================================================================
# verify-injection.sh  —  Confirm the adapter's injection capability (Linux)
# CS4389 isolated Wi-Fi test lab.
#
# This is a HARDWARE SANITY CHECK ONLY. It runs the standard
# 'aireplay-ng --test' capability probe against OUR OWN lab AP to confirm the
# adapter can transmit/inject in monitor mode, then restores managed mode.
# It performs NO attack, no deauth, no capture against third parties.
#
# Use ONLY on the team-owned, air-gapped lab described in
# docs/AUTHORIZATION-ISOLATION-NOTE.md.
#
# Usage:  sudo ./verify-injection.sh <iface> [ap_bssid]
#   <iface>    wireless interface (e.g. wlan0) — see check-adapter.sh
#   [ap_bssid] optional: BSSID of our own test AP to probe against
# =============================================================================
set -euo pipefail

IFACE="${1:-}"
AP_BSSID="${2:-}"
MONIFACE=""

if [ -z "$IFACE" ]; then
  echo "Usage: sudo $0 <iface> [our_ap_bssid]"
  exit 2
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "[FAIL] Must run as root (sudo) to change interface mode."
  exit 2
fi
for t in airmon-ng aireplay-ng iw; do
  command -v "$t" >/dev/null 2>&1 || { echo "[FAIL] '$t' missing: sudo apt install -y aircrack-ng iw"; exit 2; }
done

cleanup() {
  echo
  echo "[*] Restoring managed mode..."
  if [ -n "$MONIFACE" ]; then
    airmon-ng stop "$MONIFACE" >/dev/null 2>&1 || true
  fi
  # Best-effort: bring the base interface back up in managed mode.
  iw dev "$IFACE" set type managed >/dev/null 2>&1 || true
  ip link set "$IFACE" up >/dev/null 2>&1 || true
  echo "[*] Done. '$IFACE' should be back in managed mode (verify: iw dev)."
}
trap cleanup EXIT INT TERM

echo "============================================================"
echo " Injection capability check (hardware only) on ${IFACE}"
echo "============================================================"

echo "[*] Clearing interfering processes (airmon-ng check kill)..."
airmon-ng check kill >/dev/null 2>&1 || true

echo "[*] Enabling monitor mode on ${IFACE}..."
airmon-ng start "$IFACE" >/dev/null 2>&1 || true
# Resolve the monitor interface name (often <iface>mon or wlan0mon).
MONIFACE=$(iw dev 2>/dev/null | awk '/Interface/{i=$2} /type monitor/{print i; exit}')
MONIFACE="${MONIFACE:-${IFACE}mon}"
echo "[*] Monitor interface: ${MONIFACE}"

echo
echo "[*] Running single injection capability test (aireplay-ng --test)..."
echo "    (Point this at OUR lab AP only. No deauth or attack is performed.)"
set +e
if [ -n "$AP_BSSID" ]; then
  aireplay-ng --test -a "$AP_BSSID" "$MONIFACE"
else
  # No BSSID given: generic self-test of the card's injection ability.
  aireplay-ng --test "$MONIFACE"
fi
RC=$?
set -e

echo
if [ "$RC" -eq 0 ]; then
  echo "[PASS] Adapter reported injection capability."
else
  echo "[WARN] aireplay-ng --test returned non-zero (rc=$RC)."
  echo "       Common causes: no nearby lab AP to probe, driver quirk, or"
  echo "       monitor mode not fully applied. This only reflects the HW test."
fi
# cleanup() runs on EXIT and restores managed mode.
