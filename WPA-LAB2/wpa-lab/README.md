# wpa-lab — Isolated WPA2 / WPA3 / Transition Wi-Fi Test Lab (fully virtual)

CS4389 Data & Applications Security course project. A self-contained,
**air-gapped** access-point environment you can bring up in WPA2-Personal,
WPA3-Personal (SAE), or WPA2/WPA3 transition mode, plus the scripts and
documentation to prove the mode and the isolation.

> **100% virtual — no physical hardware.** The lab runs entirely inside a
> single Linux VM using the **`mac80211_hwsim`** kernel module to create
> simulated Wi-Fi radios. **No USB adapter, no monitor-mode-capable NIC, nothing
> plugged in.** Boot the VM, run the scripts, capture the output.

> **Scope:** This repo builds and documents the *lab*. Attack/analysis demos are
> done separately by teammates, and only ever against our own lab. See
> [`docs/AUTHORIZATION-ISOLATION-NOTE.md`](docs/AUTHORIZATION-ISOLATION-NOTE.md).

---

## What you need

- **One Linux VM** (Kali or Ubuntu), or a bare-metal Linux box. Everything here
  is Linux-only — `hostapd`, `iw`, `nl80211`, and `mac80211_hwsim` do not exist
  on macOS.
- The **`mac80211_hwsim`** kernel module (ships with the standard Linux kernel
  on Kali/Ubuntu — no install needed).
- **No wireless hardware at all.** The simulated radios are created in software.

> Developing on a Mac? Run any Linux VM (UTM/VMware/Parallels/QEMU). You do
> **not** pass through a USB adapter and the Mac's Wi-Fi card is never used —
> the whole radio layer is virtual inside the guest.

---

## Dependencies & install

```bash
sudo apt update
sudo apt install -y hostapd dnsmasq iw iproute2 wpasupplicant \
                    tcpdump aircrack-ng
```

- **hostapd** must be built with **SAE** for WPA3/transition. The Kali/Ubuntu
  package includes it. Verify: `hostapd -v` (or run `check-adapter.sh`, step 6).
- `tcpdump` / `aircrack-ng` are used by `verify-injection.sh` (both optional —
  it has a built-in raw-socket fallback).
- If `hostapd` is masked by systemd on first install:
  `sudo systemctl unmask hostapd` (we run it manually, not as a service).

---

## Order to run the scripts

All scripts are in `scripts/` and are Linux bash. Run them from inside the VM.

1. **Create the virtual radios** (loads `mac80211_hwsim`, assigns roles):
   ```bash
   sudo ./scripts/setup-virtual.sh
   ```
   This creates five simulated interfaces and records the role map in
   `/run/wpa-lab/interfaces.env`:

   | Interface | Role |
   |-----------|------|
   | `wlan0` | AP — `LAB-WPA2-TEST` |
   | `wlan1` | AP — `LAB-WPA3-TEST` |
   | `wlan2` | AP — `LAB-TRANSITION-TEST` |
   | `wlan3` | test client / station |
   | `wlan4` | monitor / capture + injection self-test |

2. **Check the virtual radios** (read-only; safe):
   ```bash
   ./scripts/check-adapter.sh
   ```
   Resolve any `[FAIL]` before continuing (usually: re-run `setup-virtual.sh`).

3. **(Optional) Verify injection** on the simulated monitor interface:
   ```bash
   sudo ./scripts/verify-injection.sh            # uses the monitor role iface
   ```

4. **Start the AP(s)** — all three at once (each on its own interface + subnet):
   ```bash
   sudo ./scripts/start-ap.sh all
   # or a single mode in the foreground (nice for screenshots):
   sudo ./scripts/start-ap.sh wpa2        # or: wpa3 | transition
   ```

5. **From the client radio**, join a lab SSID, then prove it:
   ```bash
   # example (WPA2):
   sudo wpa_passphrase LAB-WPA2-TEST '<your-psk>' > /tmp/c.conf
   sudo wpa_supplicant -B -i wlan3 -c /tmp/c.conf
   sudo dhclient wlan3
   ./scripts/client-check.sh                      # defaults to the client iface
   ```

6. **Tear down**:
   ```bash
   sudo ./scripts/stop-ap.sh                       # stop APs, keep radios
   sudo ./scripts/setup-virtual.sh --down          # unload mac80211_hwsim
   ```

## Modes & SSIDs

| Mode | SSID | Interface | Subnet | Security |
|------|------|-----------|--------|----------|
| WPA2 | `LAB-WPA2-TEST` | `wlan0` | `192.168.50.0/24` | WPA2-PSK / CCMP |
| WPA3 | `LAB-WPA3-TEST` | `wlan1` | `192.168.51.0/24` | SAE / PMF required (`ieee80211w=2`) |
| Transition | `LAB-TRANSITION-TEST` | `wlan2` | `192.168.52.0/24` | WPA-PSK+SAE / PMF optional |

All three sit on **channel 6** so the monitor radio hears every BSS on the
shared simulated medium. 2.4 GHz by default; hwsim also supports 5 GHz (see the
commented block in each `configs/hostapd-*.conf`).

## Test credentials

The configs ship with **placeholder passphrases you must change** before use:

| Config | Variable | Placeholder |
|--------|----------|-------------|
| `hostapd-wpa2.conf` | `wpa_passphrase` | `ChangeMe-WPA2-Lab!` |
| `hostapd-wpa3.conf` | `sae_password` | `ChangeMe-WPA3-Lab!` |
| `hostapd-transition.conf` | `wpa_passphrase` + `sae_password` (identical) | `ChangeMe-Transition-Lab!` |

Record whatever you set them to in your own notes — not in this repo.

## Isolation / air-gap

Each AP's dnsmasq serves its `/24` with **no gateway, no DNS, no NAT, no
uplink**. Nothing bridges the simulated radios to the VM's NAT/host network. See
[`docs/ISOLATION-PROCEDURES.md`](docs/ISOLATION-PROCEDURES.md) for the enforce /
verify steps, and run the air-gap checks in `client-check.sh`.

## How to reproduce from a clean VM

```bash
# 1. Fresh Kali/Ubuntu VM (no Wi-Fi hardware needed). Clone this repo, then:
sudo apt update && sudo apt install -y hostapd dnsmasq iw iproute2 \
     wpasupplicant tcpdump aircrack-ng
sudo systemctl unmask hostapd 2>/dev/null || true

# 2. Create the virtual radios and verify them.
sudo ./scripts/setup-virtual.sh
./scripts/check-adapter.sh

# 3. (optional) Prove injection on the monitor radio.
sudo ./scripts/verify-injection.sh

# 4. Edit the placeholder passphrases in configs/hostapd-*.conf, then start APs.
sudo ./scripts/start-ap.sh all

# 5. Join from the client radio and capture proof.
sudo wpa_passphrase LAB-WPA2-TEST '<psk>' > /tmp/c.conf
sudo wpa_supplicant -B -i wlan3 -c /tmp/c.conf && sudo dhclient wlan3
./scripts/client-check.sh

# 6. Tear down.
sudo ./scripts/stop-ap.sh
sudo ./scripts/setup-virtual.sh --down
```

## Network topology

```bash
# Render the diagram (install once: npm install -g @mermaid-js/mermaid-cli)
mmdc -i docs/network-topology.mmd -o docs/network-topology.png
```

## Repository layout

```
wpa-lab/
├── README.md
├── configs/     hostapd-wpa2/wpa3/transition.conf, dnsmasq.conf
├── scripts/     setup-virtual, lib-roles, check-adapter, verify-injection,
│                start-ap, stop-ap, client-check
├── docs/        authorization note, inventory, isolation procedures, topology
└── report/      chris-contribution.md
```

## What works / what's left

**Works (built & syntax-verified):**
- `setup-virtual.sh` creates simulated radios via `mac80211_hwsim` and assigns
  deterministic roles — no physical hardware anywhere.
- Three hostapd configs (WPA2 / WPA3-SAE / transition) + air-gapped dnsmasq DHCP.
- Seven bash scripts (`set -euo pipefail`, PASS/FAIL output), all `bash -n` clean.
- Full docs set: authorization note, inventory, isolation procedures, topology.

**Left (run inside the Linux VM — see checklist):**
- Run `setup-virtual.sh` + `check-adapter.sh` and record results in the inventory.
- Change the placeholder passphrases.
- Bring up each mode and capture `client-check.sh` output as proof.
- Render `network-topology.mmd` to PNG and attach screenshots to the report.
- Confirm the installed `hostapd` reports SAE on the VM.
