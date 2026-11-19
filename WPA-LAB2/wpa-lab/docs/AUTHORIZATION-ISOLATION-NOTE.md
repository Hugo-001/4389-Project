# Authorization & Isolation Note

**Course:** CS4389 — Data & Applications Security
**Project:** Isolated WPA2 / WPA3 / Transition-Mode Wi-Fi Test Lab
**Prepared by:** Chris Abraham — Lab Lead / Network Setup
**Date:** _____________________

---

## 1. Purpose

This note formally documents that the wireless test lab described in this
repository is a self-contained, **fully virtual**, air-gapped environment built
solely for coursework in CS4389. The entire radio layer is simulated with the
`mac80211_hwsim` kernel module inside a single team-owned Linux VM — **no
physical Wi-Fi hardware is used and no radio-frequency energy is emitted.** Its
purpose is to let our team study and demonstrate the configuration and security
properties of WPA2-Personal, WPA3-Personal (SAE), and WPA2/WPA3 transition mode
under controlled conditions.

## 2. Ownership

The lab runs entirely on a single computer owned by, or personally provided by, a
member of our project team: one Linux VM (or bare-metal Linux box). The access
point, the test client, and the monitor interface are all **simulated radios**
created in software by `mac80211_hwsim` — there is no USB adapter and no external
wireless device. No university-managed, employer-managed, or third-party
equipment is used.

## 3. Isolation & Air-Gap

The lab is **logically isolated** from all other networks, and because the radios
are virtual it emits **no wireless signal** that could reach any real device:

- Each simulated AP advertises only a lab SSID on its own isolated subnet
  (`192.168.50.0/24`, `192.168.51.0/24`, `192.168.52.0/24`).
- **No internet uplink and no NAT/IP forwarding** are configured. DHCP (dnsmasq)
  hands out addresses but advertises **no gateway and no DNS**.
- There is **no bridge, route, or shared interface** between the simulated radios
  and the VM's real NIC, the host, any campus/home/production network, or the
  internet.
- All traffic stays on the virtual `mac80211_hwsim` medium inside the VM; it
  never leaves the host over any physical interface.

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
network or device we do not own. Because the lab is fully virtual, every frame
exists only on the simulated `mac80211_hwsim` medium inside our own VM. The
injection check in this repository (`verify-injection.sh`) is a capability
self-test run on our own simulated monitor interface only. This lab exists for
education and is operated in good faith under the academic-integrity and
acceptable-use policies applicable to CS4389.

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
