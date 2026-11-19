# CS4389 Progress Report — Individual Contribution

**Name:** Chris Abraham
**Role:** Lab Lead / Network Setup
**Component:** Isolated WPA2/WPA3/Transition-mode Wi-Fi test lab + authorization/isolation documentation

---

## (a) What I completed and how

I built the full configuration and tooling for our team's isolated wireless test
lab, which gives the rest of the team a controlled WPA2, WPA3, and transition-mode
access point to work against. The lab is **fully virtual**: it runs entirely inside
a single Linux VM using the `mac80211_hwsim` kernel module to create simulated
Wi-Fi radios, so there is **no physical adapter, no USB passthrough, and no RF
emission** — you boot the VM, run the scripts, and capture the output. Rather than
configuring things by hand each session, I wrote everything as reproducible config
files and scripts so the setup is consistent and documented.

For the access point I created three `hostapd` configurations: a WPA2-Personal AP
(`wpa=2`, `WPA-PSK`, CCMP), a WPA3-Personal AP using SAE with Protected Management
Frames required (`ieee80211w=2`), and a WPA2/WPA3 transition AP that advertises
both `WPA-PSK` and `SAE` with PMF optional so that both modern and legacy clients
can associate. Each runs on its own simulated interface and its own isolated `/24`
(`192.168.50/51/52.0/24`) so all three APs can run at once. DHCP is handled by
`dnsmasq`, which deliberately advertises no gateway and no DNS, and I configured no
NAT or IP forwarding anywhere, so the lab is air-gapped by design. All SSIDs are
clearly labeled as test networks and all passphrases are obvious placeholders with
instructions to change them.

I also wrote the bash tooling (all using `set -euo pipefail` with clear PASS/FAIL
output). `setup-virtual.sh` loads `mac80211_hwsim` with five radios, enumerates the
resulting interfaces, assigns them deterministically to roles (three APs, one
client, one monitor), and records the map in `/run/wpa-lab/interfaces.env` so the
other scripts never guess names; it is idempotent and tears down cleanly. A shared
`lib-roles.sh` holds that role/subnet map. `check-adapter.sh` verifies the module
is loaded, the simulated interfaces exist and are in the right mode, and that
`hostapd` supports SAE. `verify-injection.sh` confirms packet injection on the
simulated monitor interface (capturing beacons for RX and injecting frames for TX),
which `mac80211_hwsim` supports natively — no `airmon-ng` or real card involved.
`start-ap.sh` assigns the static AP IPs and launches one mode or all three;
`stop-ap.sh` tears everything down; and `client-check.sh` runs against the
simulated client radio to confirm association, the DHCP lease, and the negotiated
cipher/key-management so we can prove which mode is in effect.

On the documentation side I wrote a formal, submittable Authorization & Isolation
Note (team ownership, air-gap, test-only scope, with signature lines), a fillable
software inventory, a step-by-step isolation-procedures document with the exact
verification commands, and an auto-rendered Mermaid network-topology diagram
showing the `mac80211_hwsim` module, the three simulated AP interfaces/SSIDs, the
client and monitor radios, and the air-gap boundary separating them from the VM's
real NIC. A README ties it together with requirements, install commands, run order,
mode-switching, and a "reproduce from a clean VM" section.

## (b) Interim outcomes / results

The configuration and tooling are complete and committed. Every script passes a
`bash -n` syntax check, and the configs follow the current `hostapd` key-management
and PMF settings required for each mode. This met my expectations for the build
phase: the deliverable is reproducible and safe-by-default (isolated subnet,
placeholder credentials, no uplink), which is exactly what the team needs to work
without risk to any outside network.

What is still pending is an in-VM validation run, which only needs the Linux VM
(no hardware): running `setup-virtual.sh` + `check-adapter.sh`, confirming the
installed `hostapd` was built with SAE, bringing up each mode, and capturing
`client-check.sh` output as proof of WPA2 vs WPA3 vs transition. I expect these to
pass given `mac80211_hwsim` is a standard in-kernel module that supports AP,
monitor, and injection, and Kali/Ubuntu ship a SAE-enabled `hostapd`, but I am
treating that as unverified until I have run it end-to-end in the VM.

## (c) My next steps

1. Run `setup-virtual.sh` and `check-adapter.sh` in the VM and fill in the software
   inventory with the measured versions and PASS/FAIL results.
2. Confirm SAE support in the installed `hostapd`; reinstall if needed.
3. Replace the placeholder passphrases and bring up each of the three modes,
   capturing `client-check.sh` output and screenshots as evidence of the negotiated
   security for the report.
4. Render the topology diagram to PNG and attach it.
5. Hand the running virtual lab to teammates for their separate attack/analysis
   demos, and collect signatures on the authorization note.
