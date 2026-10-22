# Isolation Procedures

**Course:** CS4389 — Data & Applications Security
**Project:** Isolated WPA2/WPA3/Transition Wi-Fi Test Lab
**Owner:** Chris Abraham (Lab Lead / Network Setup)

This document describes how the air-gap is enforced and how to verify it before,
during, and after each session. The goal: traffic on the lab radio can never
reach campus, home/production, or the internet.

---

## 1. Design-level isolation (how it's enforced)

1. **No uplink on the AP host.** The AP host does not route between the lab radio
   and any other interface. We never enable `net.ipv4.ip_forward`, and we never
   add an `iptables`/`nftables` NAT (masquerade) rule for the lab interface.
2. **DHCP without gateway/DNS.** `configs/dnsmasq.conf` sets `port=0` (no DNS)
   and advertises an empty `option:router` and empty `option 6`, so clients get
   an address but **no route off the subnet** and no resolver.
3. **Dedicated subnet.** The lab lives on `192.168.50.0/24`, distinct from any
   home/campus range, so an accidental bridge is obvious.
4. **Radio released cleanly.** `start-ap.sh` pulls the interface out of
   NetworkManager and stops `wpa_supplicant` so the adapter serves only the lab.
5. **No bridging.** We do not create a `br0`/bridge between the Wi-Fi interface
   and any wired/virtual NIC. In a VM, the lab adapter is a passed-through USB
   device, not bridged to the host's networking.

## 2. Pre-session verification (before starting the AP)

Run these on the AP host:

```bash
# (a) IP forwarding MUST be 0
sysctl net.ipv4.ip_forward            # expect: net.ipv4.ip_forward = 0

# (b) No NAT/masquerade rules present
sudo iptables -t nat -S | grep -i masquerade   # expect: no output
sudo nft list ruleset 2>/dev/null | grep -i masquerade  # expect: no output

# (c) No bridge involving the Wi-Fi interface
bridge link 2>/dev/null                # expect: Wi-Fi iface NOT listed
```

If (a) is not `0`: `sudo sysctl -w net.ipv4.ip_forward=0`.
If (b) shows a masquerade rule: remove it before proceeding.

## 3. Post-start verification (AP + a joined client)

On the **AP host** after `start-ap.sh`:

```bash
ip addr show wlan0        # expect: inet 192.168.50.1/24
ip route                  # expect: ONLY a 192.168.50.0/24 route via wlan0,
                          #         and NO default route pointing out via wlan0
```

On a **connected test client**, run `scripts/client-check.sh`. It confirms:

- an association to a `LAB-*-TEST` SSID,
- a `192.168.50.x` DHCP lease,
- **no default gateway via the lab interface** (air-gap check), and
- the negotiated cipher / key-management.

Additional hard proof from a client (all should FAIL = good):

```bash
ip route get 8.8.8.8      # expect: no usable route / network unreachable
ping -c1 -W2 8.8.8.8      # expect: 100% packet loss / unreachable
```

## 4. During the session

- Keep the AP host's other networking (wired, built-in Wi-Fi) **off or
  unbridged** from the lab radio.
- Do not plug the AP host into campus Ethernet while the lab AP is running.
- Only team-owned clients join the lab SSIDs.

## 5. Teardown

Run `scripts/stop-ap.sh`. Then verify:

```bash
iw dev                    # lab interface back to managed / no AP
ip addr show wlan0        # 192.168.50.1 removed
pgrep -a hostapd; pgrep -a dnsmasq   # expect: nothing from this lab
```

## 6. Verification log

Record each session so the isolation posture is auditable.

| Date | Operator | Pre-check (fwd=0, no NAT) | Client air-gap check | Notes |
|------|----------|:------------------------:|:--------------------:|-------|
| __________ | __________ | ☐ | ☐ | ______________________ |
| __________ | __________ | ☐ | ☐ | ______________________ |
| __________ | __________ | ☐ | ☐ | ______________________ |
