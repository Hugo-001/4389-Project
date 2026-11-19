#!/usr/bin/env bash
# =============================================================================
# check-adapter.sh  —  Verify the VIRTUAL lab radios are ready (Linux)
# CS4389 isolated Wi-Fi test lab. 100% virtual — NO physical adapter.
#
# Confirms the mac80211_hwsim module is loaded, that the expected simulated
# interfaces exist and are mapped to roles, that each phy advertises AP and
# monitor modes, that the monitor interface is actually in monitor mode, and
# that the hostapd build supports SAE (needed for WPA3 / transition configs).
#
# Read-only / non-destructive: it does not change interface state. Run
# setup-virtual.sh first if the role map is missing.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-roles.sh
. "${SCRIPT_DIR}/lib-roles.sh"
load_roles

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
echo " CS4389 Wi-Fi Lab — Virtual Radio Capability Check"
echo " Host: $(uname -srm)   Date: $(date)"
echo "============================================================"

# -----------------------------------------------------------------------------
echo
echo "[1/6] Required tools"
HAVE_IW=1; need_pkg iw iw || HAVE_IW=0
need_pkg hostapd hostapd || true
need_pkg dnsmasq dnsmasq || true
command -v aireplay-ng >/dev/null 2>&1 \
  && info "aircrack-ng present (optional, used by verify-injection.sh)." \
  || info "aircrack-ng not installed (optional; verify-injection.sh has a built-in test)."

# -----------------------------------------------------------------------------
echo
echo "[2/6] mac80211_hwsim kernel module (virtual radios)"
if lsmod 2>/dev/null | grep -q '^mac80211_hwsim'; then
  pass "mac80211_hwsim is loaded (virtual radios active)."
else
  fail "mac80211_hwsim NOT loaded. Create the virtual radios first:"
  echo "        sudo ./scripts/setup-virtual.sh"
fi

# -----------------------------------------------------------------------------
echo
echo "[3/6] Simulated interfaces & role map"
if [ -f "$ROLES_ENV" ]; then
  pass "Role map present: ${ROLES_ENV}"
else
  info "No role map file yet (using defaults). Run setup-virtual.sh to create it."
fi
for pair in \
  "LAB-WPA2-TEST:$AP_WPA2_IFACE" \
  "LAB-WPA3-TEST:$AP_WPA3_IFACE" \
  "LAB-TRANSITION-TEST:$AP_TRANSITION_IFACE" \
  "client/station:$CLIENT_IFACE" \
  "monitor/capture:$MONITOR_IFACE"; do
  role="${pair%%:*}"; iface="${pair##*:}"
  if [ -d "/sys/class/net/${iface}" ]; then
    pass "${role} -> ${iface} exists."
  else
    fail "${role} -> ${iface} MISSING. Run setup-virtual.sh."
  fi
done

# -----------------------------------------------------------------------------
echo
echo "[4/6] AP mode & monitor mode support (per phy)"
if [ "$HAVE_IW" -eq 1 ]; then
  MODES=$(iw list 2>/dev/null | awk '/Supported interface modes/{f=1;next} /^[^ \t]/{f=0} f' | sort -u || true)
  if [ -n "$MODES" ]; then
    echo "$MODES" | sed 's/^/      /'
    echo "$MODES" | grep -qiE "\* AP" && pass "AP mode supported."      || fail "AP mode NOT advertised."
    echo "$MODES" | grep -qi  "monitor" && pass "Monitor mode supported." || fail "Monitor mode NOT advertised."
  else
    fail "Could not read supported modes from 'iw list' (is hwsim loaded?)."
  fi
else
  info "Skipping mode check (iw missing)."
fi

# -----------------------------------------------------------------------------
echo
echo "[5/6] Monitor interface is actually in monitor mode"
if [ "$HAVE_IW" -eq 1 ] && [ -d "/sys/class/net/${MONITOR_IFACE}" ]; then
  TYPE=$(iw dev "$MONITOR_IFACE" info 2>/dev/null | awk '/type/{print $2; exit}')
  info "${MONITOR_IFACE} type: ${TYPE:-unknown}"
  [ "$TYPE" = "monitor" ] && pass "${MONITOR_IFACE} is in monitor mode." \
                          || fail "${MONITOR_IFACE} is not in monitor mode (run setup-virtual.sh)."
else
  info "Monitor interface not present or iw missing; skipped."
fi

# -----------------------------------------------------------------------------
echo
echo "[6/6] hostapd SAE support (needed for WPA3 + transition configs)"
if command -v hostapd >/dev/null 2>&1; then
  HV=$(hostapd -v 2>&1 | head -n1 || true)
  info "hostapd version: ${HV}"
  if hostapd -v 2>&1 | grep -qi "SAE"; then
    pass "hostapd advertises SAE (WPA3 configs will work)."
  else
    info "hostapd -v did not list SAE. It may still be compiled in."
    echo "        Quick empirical test (safe, exits immediately):"
    echo "          printf 'interface=lo\\nssid=x\\nwpa=2\\nwpa_key_mgmt=SAE\\nsae_password=x\\n' > /tmp/sae-test.conf"
    echo "          sudo hostapd -dd /tmp/sae-test.conf  # 'unknown/unsupported SAE' => no SAE"
    echo "        Kali/Ubuntu ship a SAE-enabled hostapd:"
    echo "          sudo apt install --reinstall hostapd"
  fi
else
  fail "hostapd not installed: sudo apt install -y hostapd"
fi

# -----------------------------------------------------------------------------
echo
echo "============================================================"
echo " SUMMARY:  ${PASS} PASS / ${FAIL} FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo " RESULT: Virtual radios appear lab-ready."
else
  echo " RESULT: Resolve the FAIL items above (usually: run setup-virtual.sh)."
fi
echo "============================================================"
exit 0
