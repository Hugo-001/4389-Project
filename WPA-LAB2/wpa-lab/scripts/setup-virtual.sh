#!/usr/bin/env bash
# =============================================================================
# setup-virtual.sh  —  Create the fully-virtual lab radios (mac80211_hwsim)
# CS4389 isolated Wi-Fi test lab. 100% virtual — NO physical adapter.
#
# Loads the mac80211_hwsim kernel module to create simulated Wi-Fi interfaces,
# then assigns them deterministically to lab roles (3 APs + 1 client + 1
# monitor) and records the map in /run/wpa-lab/interfaces.env so every other
# script can rely on the names.
#
#   usage:  sudo ./setup-virtual.sh            # create / ensure radios exist
#           sudo ./setup-virtual.sh --reload    # unload + reload the module
#           sudo ./setup-virtual.sh --status    # show current role map
#           sudo ./setup-virtual.sh --down      # tear down (unload module)
#
# Idempotent: safe to re-run. Nothing here touches a real radio, USB device,
# firmware, or the VM's uplink — it only creates virtual radios.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-roles.sh
. "${SCRIPT_DIR}/lib-roles.sh"

RADIOS=5                       # 3 APs + 1 client + 1 monitor
RUN_DIR="/run/wpa-lab"
ACTION="${1:-up}"

pass(){ echo "  [PASS] $*"; }
fail(){ echo "  [FAIL] $*"; }
info(){ echo "  [info] $*"; }
die(){ echo "[FAIL] $*" >&2; exit 2; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo) — loading a kernel module needs it."
command -v iw >/dev/null 2>&1 || die "'iw' missing: sudo apt install -y iw"
command -v modprobe >/dev/null 2>&1 || die "'modprobe' missing (kmod package)."

# List the wlan interfaces backed by mac80211_hwsim, ordered by phy index.
# In a VM with no real Wi-Fi these are the only wireless interfaces, but we
# match on the hwsim device path so we never grab a real radio by mistake.
list_hwsim_ifaces() {
  local phypath phy dev ifpath iface
  for phypath in /sys/class/ieee80211/*; do
    [ -e "$phypath" ] || continue
    phy="$(basename "$phypath")"
    dev="$(readlink -f "$phypath/device" 2>/dev/null || true)"
    case "$dev" in
      *mac80211_hwsim*) ;;
      *) continue ;;
    esac
    for ifpath in "$phypath"/device/net/*; do
      [ -e "$ifpath" ] || continue
      iface="$(basename "$ifpath")"
      # emit "<phyindex> <iface>" for stable numeric sorting
      printf '%s %s\n' "${phy#phy}" "$iface"
    done
  done | sort -n | awk '{print $2}'
}

module_loaded() { lsmod 2>/dev/null | grep -q '^mac80211_hwsim'; }

teardown() {
  echo "[*] Tearing down virtual radios..."
  if module_loaded; then
    # Bring interfaces down first so nothing holds the module.
    for i in $(list_hwsim_ifaces); do ip link set "$i" down 2>/dev/null || true; done
    rmmod mac80211_hwsim 2>/dev/null || modprobe -r mac80211_hwsim 2>/dev/null || true
  fi
  rm -f "${ROLES_ENV}" 2>/dev/null || true
  if module_loaded; then
    fail "mac80211_hwsim still loaded (a process may be holding it)."
  else
    pass "mac80211_hwsim unloaded; role map cleared."
  fi
}

case "$ACTION" in
  --down|down|teardown) teardown; exit 0 ;;
  --status|status)
    load_roles
    echo "Role map ($( [ -f "$ROLES_ENV" ] && echo "$ROLES_ENV" || echo defaults)):"
    printf '  %-22s %s\n' "LAB-WPA2-TEST"       "$AP_WPA2_IFACE"
    printf '  %-22s %s\n' "LAB-WPA3-TEST"       "$AP_WPA3_IFACE"
    printf '  %-22s %s\n' "LAB-TRANSITION-TEST" "$AP_TRANSITION_IFACE"
    printf '  %-22s %s\n' "client/station"      "$CLIENT_IFACE"
    printf '  %-22s %s\n' "monitor/capture"     "$MONITOR_IFACE"
    echo; echo "Live hwsim interfaces: $(list_hwsim_ifaces | tr '\n' ' ')"
    exit 0 ;;
  --reload|reload)
    module_loaded && { echo "[*] Reloading mac80211_hwsim..."; modprobe -r mac80211_hwsim 2>/dev/null || rmmod mac80211_hwsim 2>/dev/null || true; }
    ACTION=up ;;
  up|--up) : ;;
  *) die "Unknown action '$ACTION' (use: up | --reload | --status | --down)" ;;
esac

echo "============================================================"
echo " CS4389 Wi-Fi Lab — Virtual radio setup (mac80211_hwsim)"
echo " Host: $(uname -srm)   Date: $(date)"
echo "============================================================"

mkdir -p "$RUN_DIR"

# -----------------------------------------------------------------------------
echo
echo "[1/4] Load mac80211_hwsim (radios=${RADIOS})"
if module_loaded; then
  have=$(list_hwsim_ifaces | wc -l | tr -d ' ')
  info "Module already loaded with ${have} simulated interface(s)."
  if [ "$have" -lt "$RADIOS" ]; then
    fail "Need ${RADIOS} radios but only ${have} present."
    echo "        Re-run with --reload to recreate them:  sudo $0 --reload"
    exit 1
  fi
  pass "Sufficient simulated radios already present (idempotent no-op)."
else
  modprobe mac80211_hwsim radios="$RADIOS" || die "modprobe mac80211_hwsim failed."
  # Give udev a moment to create the netdevs.
  for _ in 1 2 3 4 5; do
    [ "$(list_hwsim_ifaces | wc -l | tr -d ' ')" -ge "$RADIOS" ] && break
    sleep 0.3
  done
  pass "Loaded mac80211_hwsim with radios=${RADIOS}."
fi

# -----------------------------------------------------------------------------
echo
echo "[2/4] Enumerate simulated interfaces"
mapfile -t IFACES < <(list_hwsim_ifaces)
if [ "${#IFACES[@]}" -lt "$RADIOS" ]; then
  die "Expected ${RADIOS} hwsim interfaces, found ${#IFACES[@]}: ${IFACES[*]:-none}"
fi
printf '      %s\n' "${IFACES[@]}"
pass "Found ${#IFACES[@]} simulated interface(s)."

# -----------------------------------------------------------------------------
echo
echo "[3/4] Assign roles (deterministic, first five by phy index)"
AP_WPA2_IFACE="${IFACES[0]}"
AP_WPA3_IFACE="${IFACES[1]}"
AP_TRANSITION_IFACE="${IFACES[2]}"
CLIENT_IFACE="${IFACES[3]}"
MONITOR_IFACE="${IFACES[4]}"

cat > "$ROLES_ENV" <<EOF
# Auto-generated by setup-virtual.sh on $(date)
# Live mac80211_hwsim interface role map for the virtual WPA lab.
AP_WPA2_IFACE=${AP_WPA2_IFACE}
AP_WPA3_IFACE=${AP_WPA3_IFACE}
AP_TRANSITION_IFACE=${AP_TRANSITION_IFACE}
CLIENT_IFACE=${CLIENT_IFACE}
MONITOR_IFACE=${MONITOR_IFACE}
LAB_CHANNEL=${LAB_CHANNEL}
EOF

printf '  %-22s %s\n' "LAB-WPA2-TEST"       "$AP_WPA2_IFACE"
printf '  %-22s %s\n' "LAB-WPA3-TEST"       "$AP_WPA3_IFACE"
printf '  %-22s %s\n' "LAB-TRANSITION-TEST" "$AP_TRANSITION_IFACE"
printf '  %-22s %s\n' "client/station"      "$CLIENT_IFACE"
printf '  %-22s %s\n' "monitor/capture"     "$MONITOR_IFACE"
pass "Role map written to ${ROLES_ENV}"

# -----------------------------------------------------------------------------
echo
echo "[4/4] Put the monitor interface into monitor mode on channel ${LAB_CHANNEL}"
# APs are left managed (hostapd switches them to AP). Client stays managed.
ip link set "$MONITOR_IFACE" down
if iw dev "$MONITOR_IFACE" set type monitor 2>/dev/null; then
  ip link set "$MONITOR_IFACE" up
  iw dev "$MONITOR_IFACE" set channel "$LAB_CHANNEL" 2>/dev/null \
    && pass "${MONITOR_IFACE} in monitor mode on channel ${LAB_CHANNEL}." \
    || info "${MONITOR_IFACE} in monitor mode (channel set deferred until an AP is up)."
else
  ip link set "$MONITOR_IFACE" up 2>/dev/null || true
  fail "Could not set ${MONITOR_IFACE} to monitor mode."
fi

echo
echo "============================================================"
echo " Virtual radios ready. Next:"
echo "   ./scripts/check-adapter.sh         # verify the sim interfaces"
echo "   sudo ./scripts/verify-injection.sh # injection self-test (monitor)"
echo "   sudo ./scripts/start-ap.sh all     # bring up all three APs"
echo "============================================================"
exit 0
