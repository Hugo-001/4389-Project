# Authorization & Isolation Note

**Course:** CS4389 — Data & Applications Security
**Project:** Isolated WPA2 / WPA3 / Transition-Mode Wi-Fi Test Lab
**Prepared by:** Chris Abraham — Lab Lead / Network Setup
**Date:** _____________________

---

## 1. Purpose

This note formally documents that the wireless test lab described in this
repository is a self-contained, team-owned, air-gapped environment built solely
for coursework in CS4389. Its purpose is to let our team study and demonstrate
the configuration and security properties of WPA2-Personal, WPA3-Personal (SAE),
and WPA2/WPA3 transition mode under controlled conditions.

## 2. Ownership

All equipment used in this lab — the access-point host machine, the USB Wi-Fi
adapter (Alfa AWUS036NHA / Atheros AR9271), and every test client — is owned by,
or personally provided by, members of our project team. No university-managed,
employer-managed, or third-party equipment is used.

## 3. Isolation & Air-Gap

The lab is **physically and logically isolated** from all other networks:

- The access point advertises only the lab SSIDs on an isolated subnet
  (`192.168.50.0/24`).
- **No internet uplink and no NAT/IP forwarding** are configured on the AP host.
  DHCP (dnsmasq) hands out addresses but advertises **no gateway and no DNS**.
- There is **no bridge, route, or shared interface** to any campus network, any
  production or home network, or the internet.
- The AP host's other interfaces (wired/Wi-Fi) are not bridged to the lab radio.
- All wireless activity is confined to team-owned devices within radio range in
  our designated work area.

Isolation is enforced and verified using the steps in
[`ISOLATION-PROCEDURES.md`](./ISOLATION-PROCEDURES.md).

## 4. Scope of Activity

- All SSIDs are clearly labeled as test networks (`LAB-WPA2-TEST`,
  `LAB-WPA3-TEST`, `LAB-TRANSITION-TEST`).
- Activity is limited to standing up the access point, associating our own test
  clients, and confirming the negotiated security mode.
- Any attack/analysis demonstrations are performed **separately by other
  teammates** and only ever target our own lab APs and our own clients within
  this isolated environment.
- No third-party networks, devices, or users are interacted with in any way.

## 5. Responsible-Use Statement

We will not direct any wireless transmission, probe, injection, or capture at any
network or device we do not own. The injection check in this repository
(`verify-injection.sh`) is a hardware-capability self-test run against our own AP
only. This lab exists for education and is operated in good faith under the
academic-integrity and acceptable-use policies applicable to CS4389.

## 6. Authorization & Signatures

By signing below, each team member affirms that the statements above are accurate
and that they will operate the lab within this scope.

| Name | Role | Signature | Date |
|------|------|-----------|------|
| Chris Abraham | Lab Lead / Network Setup | ______________________ | __________ |
| ____________________ | ____________________ | ______________________ | __________ |
| ____________________ | ____________________ | ______________________ | __________ |
| ____________________ | ____________________ | ______________________ | __________ |

**Instructor / TA acknowledgment (if required):**

| Name | Signature | Date |
|------|-----------|------|
| ____________________ | ______________________ | __________ |
