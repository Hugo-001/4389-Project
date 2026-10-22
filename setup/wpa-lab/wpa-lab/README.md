# wpa-lab — Isolated WPA2 / WPA3 / Transition Wi-Fi Test Lab

CS4389 Data & Applications Security course project. A self-contained, **air-gapped**
access point you can bring up in WPA2-Personal, WPA3-Personal (SAE), or
WPA2/WPA3 transition mode, plus the scripts and documentation to prove the mode
and the isolation. Team-owned hardware only.

> **Scope:** This repo builds and documents the *lab*. Attack/analysis demos are
> done separately by teammates, and only ever against our own lab. See
> [`docs/AUTHORIZATION-ISOLATION-NOTE.md`](docs/AUTHORIZATION-ISOLATION-NOTE.md).

---

## OS requirements

- **Linux** (Kali or Ubuntu). Everything here is Linux-only — `hostapd`, `iw`,
  `nl80211`, and the aircrack-ng tools do not run on macOS.
- A Wi-Fi adapter that supports **AP mode** and **monitor mode**. Reference
  hardware: **Alfa AWUS036NHA (Atheros AR9271, `ath9k_htc`)** — 2.4 GHz only.

### macOS host setup (running the lab in a Linux VM)

This project is developed on a Mac, but the lab itself runs inside Linux. macOS
cannot run `hostapd`, and **the Mac's internal Wi-Fi card cannot be used** for
AP/monitor mode here — you must use the USB adapter passed into a Linux guest.

1. **Install a hypervisor:** [UTM](https://mac.getutm.app/) (free, native on
   Apple Silicon), **VMware Fusion**, or **Parallels**.
2. **Create a Kali or Ubuntu VM.** On Apple Silicon, use an arm64 image.
3. **Pass the USB adapter through to the VM:**
   - **UTM:** VM Settings → USB, or the USB icon while running → select the
     *AWUS036NHA / AR9271*.
   - **VMware Fusion:** menu bar → *Virtual Machine → USB & Bluetooth → Connect
     Alfa AR9271*.
   - **Parallels:** *Devices → USB & Bluetooth → AR9271*.
4. **Confirm passthrough inside the VM** before anything else:
   ```bash
   lsusb | grep -i 0cf3:9271     # Atheros AR9271 should appear
   ```
   If it doesn't show, passthrough isn't active — fix that before debugging
   drivers. `scripts/check-adapter.sh` checks this for you (step 2).

> On a **Raspberry Pi**, skip the VM: run Kali/Ubuntu on the Pi and just plug the
> adapter in. `check-adapter.sh` works the same way.

---

## Dependencies & install

```bash
sudo apt update
sudo apt install -y hostapd dnsmasq iw iproute2 aircrack-ng usbutils \
                    wpasupplicant firmware-atheros
```

- **hostapd** must be built with **SAE** for WPA3/transition. The Kali/Ubuntu
  package includes it. Verify: `hostapd -v` (or run `check-adapter.sh`, step 6).
- If `hostapd` is masked by systemd on first install:
  `sudo systemctl unmask hostapd` (we run it manually, not as a service).

---

## Order to run the scripts

All scripts are in `scripts/` and are Linux bash. Run them from inside the VM /
on the Pi.

1. **Check the adapter** (read-only; safe):
   ```bash
   ./scripts/check-adapter.sh
   ```
   Resolve any `[FAIL]` before continuing. Note the interface name it reports
   (e.g. `wlan0`); if yours differs, prefix the AP scripts with `IFACE=...`.

2. **(Optional) Verify injection capability** — hardware self-test against our
   own AP, restores managed mode afterward:
   ```bash
   sudo ./scripts/verify-injection.sh wlan0 [our_ap_bssid]
   ```

3. **Start an AP** in the mode you want:
   ```bash
   sudo ./scripts/start-ap.sh wpa2          # or: wpa3 | transition
   # IFACE=wlan1 sudo ./scripts/start-ap.sh wpa3   # if interface isn't wlan0
   ```
   hostapd runs in the foreground and prints the SSID to join. Leave it running.

4. **From a test client**, join the printed SSID, then prove it:
   ```bash
   ./scripts/client-check.sh wlan0
   ```

5. **Tear down** (in another terminal, or after Ctrl-C on hostapd):
   ```bash
   sudo ./scripts/stop-ap.sh
   ```

## Switching AP modes

Stop the current AP (`stop-ap.sh`), then start the mode you want:

| Mode | Command | SSID | Security |
|------|---------|------|----------|
| WPA2 | `sudo ./scripts/start-ap.sh wpa2` | `LAB-WPA2-TEST` | WPA2-PSK / CCMP |
| WPA3 | `sudo ./scripts/start-ap.sh wpa3` | `LAB-WPA3-TEST` | SAE / PMF required |
| Transition | `sudo ./scripts/start-ap.sh transition` | `LAB-TRANSITION-TEST` | WPA-PSK+SAE / PMF optional |

**Band:** 2.4 GHz by default (the AR9271 is 2.4 GHz only). To use 5 GHz with a
dual-band adapter, edit the `hw_mode`/`channel`/`country_code` block near the top
of each `configs/hostapd-*.conf` (commented instructions are inline).

## Test credentials

The configs ship with **placeholder passphrases you must change** before use:

| Config | Variable | Placeholder |
|--------|----------|-------------|
| `hostapd-wpa2.conf` | `wpa_passphrase` | `ChangeMe-WPA2-Lab!` |
| `hostapd-wpa3.conf` | `sae_password` | `ChangeMe-WPA3-Lab!` |
| `hostapd-transition.conf` | `wpa_passphrase` + `sae_password` (identical) | `ChangeMe-Transition-Lab!` |

Record whatever you set them to in your own notes — not in this repo.

## Isolation / air-gap

DHCP serves `192.168.50.0/24` with **no gateway, no DNS, no NAT, no uplink**. See
[`docs/ISOLATION-PROCEDURES.md`](docs/ISOLATION-PROCEDURES.md) for the enforce /
verify steps, and run the air-gap checks in `client-check.sh`.

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
├── scripts/     check-adapter, verify-injection, start-ap, stop-ap, client-check
├── docs/        authorization note, inventory, isolation procedures, topology
└── report/      chris-contribution.md
```

## What works / what's left

**Works (built & syntax-verified):**
- Three hostapd configs (WPA2 / WPA3-SAE / transition) + air-gapped dnsmasq DHCP.
- Five bash scripts (`set -euo pipefail`, PASS/FAIL output), all `bash -n` clean.
- Full docs set: authorization note, inventory, isolation procedures, topology.

**Left (requires physical hardware / a Linux host — see checklist):**
- Run `check-adapter.sh` on the real adapter and record results in the inventory.
- Change the placeholder passphrases.
- Bring up each mode and capture `client-check.sh` output as proof.
- Render `network-topology.mmd` to PNG and attach screenshots to the report.
- Confirm the installed `hostapd` reports SAE on the actual lab box.
