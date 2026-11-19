#!/usr/bin/env bash
# =============================================================================
# lib-roles.sh  —  Shared interface-role map for the VIRTUAL WPA lab.
# CS4389 isolated Wi-Fi test lab (fully virtual, mac80211_hwsim).
#
# This file is SOURCED by the other scripts; it is not meant to be executed.
# It defines the canonical mapping of simulated wlanX interfaces to lab roles
# and a few helpers so no script has to guess interface names.
#
# setup-virtual.sh writes the live map to $ROLES_ENV after creating the radios.
# If that file exists we use it; otherwise we fall back to the conventional
# names below (wlan0..wlan4), which is what a clean `modprobe mac80211_hwsim
# radios=5` produces in a VM with no other Wi-Fi.
# =============================================================================

ROLES_ENV="${ROLES_ENV:-/run/wpa-lab/interfaces.env}"

# --- Canonical role map (defaults) -------------------------------------------
AP_WPA2_IFACE_DEFAULT=wlan0          # LAB-WPA2-TEST
AP_WPA3_IFACE_DEFAULT=wlan1          # LAB-WPA3-TEST
AP_TRANSITION_IFACE_DEFAULT=wlan2    # LAB-TRANSITION-TEST
CLIENT_IFACE_DEFAULT=wlan3           # test station for client-check.sh
MONITOR_IFACE_DEFAULT=wlan4          # monitor/capture + injection self-test

# Shared common channel for every simulated radio (2.4 GHz). All APs and the
# monitor sit on one channel so the monitor hears every BSS on the sim medium.
LAB_CHANNEL="${LAB_CHANNEL:-6}"

# Per-mode isolated /24 so the three APs can run simultaneously without IP
# collisions. Still air-gapped: no gateway/DNS/NAT on any of them.
#   wpa2       -> 192.168.50.1/24
#   wpa3       -> 192.168.51.1/24
#   transition -> 192.168.52.1/24
subnet_octet_for_mode() {
  case "$1" in
    wpa2)       echo 50 ;;
    wpa3)       echo 51 ;;
    transition) echo 52 ;;
    *) return 1 ;;
  esac
}

# Load the live role map (if present) and fill in any gaps with the defaults.
load_roles() {
  if [ -f "$ROLES_ENV" ]; then
    # shellcheck disable=SC1090
    . "$ROLES_ENV"
  fi
  AP_WPA2_IFACE="${AP_WPA2_IFACE:-$AP_WPA2_IFACE_DEFAULT}"
  AP_WPA3_IFACE="${AP_WPA3_IFACE:-$AP_WPA3_IFACE_DEFAULT}"
  AP_TRANSITION_IFACE="${AP_TRANSITION_IFACE:-$AP_TRANSITION_IFACE_DEFAULT}"
  CLIENT_IFACE="${CLIENT_IFACE:-$CLIENT_IFACE_DEFAULT}"
  MONITOR_IFACE="${MONITOR_IFACE:-$MONITOR_IFACE_DEFAULT}"
}

# Map a mode name to its assigned AP interface (uses the loaded role map).
iface_for_mode() {
  case "$1" in
    wpa2)       echo "$AP_WPA2_IFACE" ;;
    wpa3)       echo "$AP_WPA3_IFACE" ;;
    transition) echo "$AP_TRANSITION_IFACE" ;;
    *) return 1 ;;
  esac
}
