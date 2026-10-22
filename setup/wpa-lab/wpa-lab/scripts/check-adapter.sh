#!/usr/bin/env bash
# =============================================================================
# check-adapter.sh  —  Verify the Wi-Fi adapter is lab-ready (Linux)
# CS4389 isolated Wi-Fi test lab.
#
# Detects wireless interfaces, shows chipset/driver, confirms AP mode and
# monitor mode support, and prints a PASS/FAIL summary. Also confirms the
# adapter is visible as a passed-through USB device (VM case) and checks that
# the hostapd build supports SAE (needed for WPA3 / transition configs).
#
# Read-only / non-destructive: it does not change interface state.
# =============================================================================
set -euo pipefail

PASS=0; FAIL=0
pass(){ echo "  [PASS] $*"; PASS=$((PASS+1)); }
fail(){ echo "  [FAIL] $*"; FAIL=$((FAIL+1)); }
info(){ echo "  [info] $*"; }

need_pkg() {
  # need_pkg <command> <apt-package>
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "'$1' not found. Install with:  sudo apt update && sudo apt install -y $2"
    return 1
  fi
  return 0
}

echo "============================================================"
echo " CS4389 Wi-Fi Lab — Adapter Capability Check"
echo " Host: $(uname -srm)   Date: $(date)"
echo "============================================================"

# -----------------------------------------------------------------------------
echo
echo "[1/6] Required tools"
HAVE_IW=1;  need_pkg iw iw            || HAVE_IW=0
HAVE_AMON=1;need_pkg airmon-ng aircrack-ng || HAVE_AMON=0
need_pkg lsusb usbutils || true
need_pkg hostapd hostapd || true

# -----------------------------------------------------------------------------
echo
echo "[2/6] USB passthrough (VM / Raspberry Pi note)"
# The Alfa AWUS036NHA uses the Atheros AR9271 (USB ID 0cf3:9271).
# Inside a VM the adapter must be PASSED THROUGH from the macOS host, or Linux
# never sees it and driver troubleshooting is pointless. Confirm it here FIRST.
if command -v lsusb >/dev/null 2>&1; then
  if lsusb | grep -iE "0cf3:9271|Atheros|AR9271" >/dev/null 2>&1; then
    pass "Atheros AR9271 visible on USB bus:"
    lsusb | grep -iE "0cf3:9271|Atheros|AR9271" | sed 's/^/        /'
  else
    fail "No Atheros AR9271 on the USB bus. In a VM this almost always means"
    echo "        USB passthrough is NOT active. Before touching drivers:"
    echo "          - UTM:            select the AWUS036NHA under USB devices."
    echo "          - VMware Fusion:  Virtual Machine > USB & Bluetooth > connect it."
    echo "          - Parallels:      Devices > USB & Bluetooth > AR9271."
    echo "        Then re-run 'lsusb' and confirm '0cf3:9271' appears."
    echo "        (On a Raspberry Pi: just confirm the dongle is plugged in.)"
  fi
else
  info "lsusb unavailable; skipped USB passthrough check."
fi

# -----------------------------------------------------------------------------
echo
echo "[3/6] Wireless interfaces"
WIFACE=""
if [ "$HAVE_IW" -eq 1 ]; then
  if iw dev 2>/dev/null | grep -q Interface; then
    iw dev | sed 's/^/      /'
    WIFACE=$(iw dev | awk '/Interface/{print $2; exit}')
    pass "Found wireless interface: ${WIFACE}"
  else
    fail "No wireless interface reported by 'iw dev'."
    echo "        If USB passthrough is active (step 2 PASS) but no interface"
    echo "        shows, the ath9k_htc driver/firmware may be missing:"
    echo "          sudo apt install -y firmware-atheros && sudo modprobe ath9k_htc"
  fi
else
  info "Skipping interface detection (iw missing)."
fi

# -----------------------------------------------------------------------------
echo
echo "[4/6] Driver / chipset"
if [ -n "$WIFACE" ] && [ -e "/sys/class/net/${WIFACE}/device/driver" ]; then
  DRV=$(basename "$(readlink -f "/sys/class/net/${WIFACE}/device/driver")")
  info "Interface ${WIFACE} uses driver: ${DRV}"
  [ "$DRV" = "ath9k_htc" ] && pass "ath9k_htc loaded (expected for AR9271)." \
                           || info "Driver is '${DRV}' (fine if not the AR9271)."
else
  info "Could not resolve driver via sysfs (continuing)."
fi

# -----------------------------------------------------------------------------
echo
echo "[5/6] AP mode & monitor mode support"
if [ "$HAVE_IW" -eq 1 ]; then
  # 'iw list' reports the phy's supported interface modes.
  MODES=$(iw list 2>/dev/null | awk '/Supported interface modes/{f=1;next} /^[^ \t]/{f=0} f' || true)
  if [ -n "$MODES" ]; then
    echo "$MODES" | sed 's/^/      /'
    echo "$MODES" | grep -qiE "\bAP\b"      && pass "AP mode supported."      || fail "AP mode NOT advertised by this adapter."
    echo "$MODES" | grep -qiE "monitor"     && pass "Monitor mode supported." || fail "Monitor mode NOT advertised by this adapter."
  else
    fail "Could not read supported modes from 'iw list'."
  fi
else
  info "Skipping mode check (iw missing)."
fi

# airmon-ng cross-check (lists PHY + driver + chipset in one view)
if [ "$HAVE_AMON" -eq 1 ]; then
  echo
  info "airmon-ng view (chipset/driver cross-check):"
  sudo airmon-ng 2>/dev/null | sed 's/^/      /' || info "Run with sudo for full airmon-ng output."
fi

# -----------------------------------------------------------------------------
echo
echo "[6/6] hostapd SAE support (needed for WPA3 + transition configs)"
if command -v hostapd >/dev/null 2>&1; then
  HV=$(hostapd -v 2>&1 | head -n1 || true)
  info "hostapd version: ${HV}"
  # hostapd -v prints compiled-in feature flags on modern builds.
  if hostapd -v 2>&1 | grep -qi "SAE"; then
    pass "hostapd advertises SAE (WPA3 configs will work)."
  else
    # Fallback: many distro builds DO have SAE even if -v doesn't list it.
    info "hostapd -v did not list SAE. It may still be compiled in."
    echo "        Quick empirical test (safe, exits immediately):"
    echo "          printf 'interface=lo\\nssid=x\\nwpa=2\\nwpa_key_mgmt=SAE\\nsae_password=x\\n' > /tmp/sae-test.conf"
    echo "          sudo hostapd -dd /tmp/sae-test.conf  # 'unknown/unsupported SAE' => no SAE"
    echo "        If SAE is missing: Kali/Ubuntu ship SAE-enabled hostapd in the"
    echo "        'hostapd' package — 'sudo apt install --reinstall hostapd'. If a"
    echo "        custom/old build lacks it, rebuild from source with CONFIG_SAE=y"
    echo "        in hostapd/.config, or use the distro package instead."
  fi
else
  fail "hostapd not installed: sudo apt install -y hostapd"
fi

# -----------------------------------------------------------------------------
echo
echo "============================================================"
echo " SUMMARY:  ${PASS} PASS / ${FAIL} FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo " RESULT: Adapter appears lab-ready."
else
  echo " RESULT: Resolve the FAIL items above before starting an AP."
fi
echo "============================================================"
exit 0
