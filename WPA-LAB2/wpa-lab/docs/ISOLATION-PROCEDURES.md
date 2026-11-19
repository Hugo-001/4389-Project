# Isolation Procedures

**Course:** CS4389 — Data & Applications Security
**Project:** Isolated WPA2/WPA3/Transition Wi-Fi Test Lab
**Owner:** Chris Abraham (Lab Lead / Network Setup)

This document describes how the air-gap is enforced and how to verify it before,
during, and after each session. The lab is **fully virtual** (`mac80211_hwsim`),
so there is no RF emission at all; the goal here is that traffic on the simulated
lab radios can never reach the VM's real NIC, the host, campus/home/production, or
the internet.

---

## 1. Design-level isolation (how it's enforced)

1. **No uplink / no routing.** The VM does not route between the simulated lab
   interfaces and its real NIC. We never enable `net.ipv4.ip_forward`, and we
   never add an `iptables`/`nftables` NAT (masquerade) rule for a lab interface.
2. **DHCP without gateway/DNS.** `configs/dnsmasq.conf` sets `port=0` (no DNS)
   and advertises an empty `option:router` and empty `option 6`, so clients get
   an address but **no route off the subnet** and no resolver.
3. **Dedicated subnets.** The lab lives on `192.168.50.0/24` (WPA2),
   `192.168.51.0/24` (WPA3), and `192.168.52.0/24` (transition) — distinct from
   any home/campus range, so an accidental bridge is obvious.
4. **Separate virtual radios.** The simulated AP/client/monitor interfaces are
   created by `setup-virtual.sh` and are never the VM's management interface, so
   the lab cannot borrow the host's connectivity.
5. **No bridging.** We do not create a `br0`/bridge between any simulated
   interface and the VM's real (NAT/bridged) NIC. The `mac80211_hwsim` medium is
   self-contained inside the guest kernel.

## 2. Pre-session verification (before starting the AP)

Run these on the AP host:

```bash
# (a) IP forwarding MUST be 0
sysctl net.ipv4.ip_forward            # expect: net.ipv4.ip_forward = 0

# (b) No NAT/masquerade rules present
sudo iptables -t nat -S | grep -i masquerade   # expect: no output
sudo nft list ruleset 2>/dev/null | grep -i masquerade  # expect: no output

# (c) No bridge involving a simulated lab interface
bridge link 2>/dev/null                # expect: no wlanX lab iface listed

# (d) mac80211_hwsim is the only wireless provider (no real radio snuck in)
lsmod | grep mac80211_hwsim            # expect: present
```

If (a) is not `0`: `sudo sysctl -w net.ipv4.ip_forward=0`.
If (b) shows a masquerade rule: remove it before proceeding.

## 3. Post-start verification (AP + a joined client)

On the **lab host** after `start-ap.sh all` (AP interfaces wlan0/1/2):

```bash
ip addr | grep 192.168.5  # expect: 192.168.50.1, .51.1, .52.1 on wlan0/1/2
ip route                  # expect: ONLY 192.168.50/51/52.0/24 routes via wlanX,
                          #         and NO default route pointing out via a wlanX
```

On the **connected test client** (the `wlan3` radio), run
`scripts/client-check.sh`. It confirms:

- an association to a `LAB-*-TEST` SSID,
- a `192.168.50-52.x` DHCP lease,
- **no default gateway via the lab interface** (air-gap check), and
- the negotiated cipher / key-management.

Additional hard proof from a client (all should FAIL = good):

```bash
ip route get 8.8.8.8      # expect: no usable route / network unreachable
ping -c1 -W2 8.8.8.8      # expect: 100% packet loss / unreachable
```

## 4. During the session

- Keep the VM's real NIC **unbridged** from the simulated lab interfaces (never
  add a bridge or NAT rule tying a wlanX lab iface to the management NIC).
- Only the lab's own `wlan3` client radio joins the lab SSIDs.

## 5. Teardown

Run `scripts/stop-ap.sh` (then optionally `setup-virtual.sh --down`). Verify:

```bash
iw dev                    # lab AP interfaces back to managed / no AP
ip addr | grep -c 192.168.5          # expect: 0
pgrep -a hostapd; pgrep -a dnsmasq   # expect: nothing from this lab
lsmod | grep mac80211_hwsim          # gone after 'setup-virtual.sh --down'
```

## 6. Verification log

Record each session so the isolation posture is auditable.

| Date | Operator | Pre-check (fwd=0, no NAT) | Client air-gap check | Notes |
|------|----------|:------------------------:|:--------------------:|-------|
| __________ | __________ | ☐ | ☐ | ______________________ |
| __________ | __________ | ☐ | ☐ | ______________________ |
| __________ | __________ | ☐ | ☐ | ______________________ |
