# CS4389 Progress Report — Individual Contribution

**Name:** Chris Abraham
**Role:** Lab Lead / Network Setup
**Component:** Isolated WPA2/WPA3/Transition-mode Wi-Fi test lab + authorization/isolation documentation

---

## (a) What I completed and how

I built the full configuration and tooling for our team's isolated wireless test
lab, which gives the rest of the team a controlled WPA2, WPA3, and transition-mode
access point to work against. Rather than configuring things by hand each session,
I wrote everything as reproducible config files and scripts so the setup is
consistent and documented.

For the access point I created three `hostapd` configurations: a WPA2-Personal AP
(`wpa=2`, `WPA-PSK`, CCMP), a WPA3-Personal AP using SAE with Protected Management
Frames required (`ieee80211w=2`), and a WPA2/WPA3 transition AP that advertises
both `WPA-PSK` and `SAE` with PMF optional so that both modern and legacy clients
can associate. DHCP for the lab is handled by a `dnsmasq` config scoped to an
isolated `192.168.50.0/24` subnet that deliberately advertises no gateway and no
DNS, and I configured no NAT or IP forwarding anywhere, so the lab is air-gapped
by design. All SSIDs are clearly labeled as test networks and all passphrases are
obvious placeholders with instructions to change them.

I also wrote five bash scripts (all using `set -euo pipefail` with clear PASS/FAIL
output): `check-adapter.sh` detects the wireless interface, driver, and chipset and
confirms AP and monitor-mode support with `iw` and `airmon-ng`; `verify-injection.sh`
runs a single `aireplay-ng --test` hardware-capability check against our own AP and
then restores managed mode; `start-ap.sh` assigns the static AP IP and launches the
chosen mode; `stop-ap.sh` tears everything down cleanly; and `client-check.sh` is
run from a joined client to confirm association, the DHCP lease, and the negotiated
cipher/key-management so we can actually prove which mode is in effect. Because our
AP host is a Linux VM on a Mac with the Alfa AWUS036NHA (AR9271) adapter passed
through over USB, `check-adapter.sh` also verifies the adapter is visible on the USB
bus (`lsusb`) and flags when VM passthrough isn't active before anyone wastes time
on driver issues.

On the documentation side I wrote a formal, submittable Authorization & Isolation
Note (team ownership, air-gap, test-only scope, with signature lines), a fillable
hardware/software inventory, a step-by-step isolation-procedures document with the
exact verification commands, and an auto-rendered Mermaid network-topology diagram
showing the AP host, the three SSIDs, the test clients, the monitor adapter, and the
air-gap boundary. A README ties it together with OS requirements, install commands,
run order, mode-switching, and a macOS-host VM setup section.

## (b) Interim outcomes / results

The configuration and tooling are complete and committed. Every script passes a
`bash -n` syntax check, and the configs follow the current `hostapd` key-management
and PMF settings required for each mode. This met my expectations for the build
phase: the deliverable is reproducible and safe-by-default (isolated subnet,
placeholder credentials, no uplink), which is exactly what the team needs to work
without risk to any outside network.

What is still pending is hardware-in-the-loop validation, which can only be done on
the physical Linux box with the adapter attached: running `check-adapter.sh` against
the real AR9271, confirming the installed `hostapd` was built with SAE, bringing up
each mode, and capturing `client-check.sh` output as proof of WPA2 vs WPA3 vs
transition. I expect these to pass given the AR9271/`ath9k_htc` adapter is a known
AP/monitor-capable chipset and Kali/Ubuntu ship a SAE-enabled `hostapd`, but I am
treating that as unverified until I have run it on the hardware.

## (c) My next steps

1. Run `check-adapter.sh` on the lab machine and fill in the hardware/software
   inventory with the measured versions and PASS/FAIL results.
2. Confirm SAE support in the installed `hostapd`; rebuild/reinstall if needed.
3. Replace the placeholder passphrases and bring up each of the three modes,
   capturing `client-check.sh` output and screenshots as evidence of the negotiated
   security for the report.
4. Render the topology diagram to PNG and attach it.
5. Hand the validated, running lab to teammates for their separate attack/analysis
   demos, and collect signatures on the authorization note.
