# Hardware & Software Inventory

**Course:** CS4389 — Data & Applications Security
**Project:** Isolated WPA2/WPA3/Transition Wi-Fi Test Lab
**Maintained by:** Chris Abraham (Lab Lead / Network Setup)
**Last updated:** _____________________

> Fill in every field. Capture versions with the commands noted in each section
> so the lab is reproducible.

---

## 1. Access Point Host

| Field | Value | How to obtain |
|-------|-------|---------------|
| Machine (make/model) | ____________________ | physical label |
| Role | Access Point host | — |
| Host type | ☐ Bare-metal  ☐ VM on macOS  ☐ Raspberry Pi | — |
| If VM: hypervisor + version | ____________________ | UTM / VMware Fusion / Parallels |
| Macbook host model (if VM) | ____________________ | Apple menu → About This Mac |
| OS distribution | ____________________ | `lsb_release -a` |
| Kernel version | ____________________ | `uname -r` |
| CPU / arch | ____________________ | `uname -m` |
| RAM | ____________________ | `free -h` |

## 2. Wi-Fi Adapter (AP / monitor)

| Field | Value | How to obtain |
|-------|-------|---------------|
| Model | Alfa AWUS036NHA | physical label |
| Chipset | Atheros AR9271 | `lsusb` (ID `0cf3:9271`) |
| USB ID | 0cf3:9271 | `lsusb` |
| Driver | ath9k_htc | `check-adapter.sh` step 4 |
| Firmware pkg | firmware-atheros | `dpkg -l firmware-atheros` |
| Interface name | ____________________ | `iw dev` |
| AP mode supported | ☐ Yes ☐ No | `check-adapter.sh` step 5 |
| Monitor mode supported | ☐ Yes ☐ No | `check-adapter.sh` step 5 |
| USB passthrough confirmed (VM) | ☐ Yes ☐ N/A | `lsusb` shows `0cf3:9271` |

## 3. AP Software

| Component | Version | SAE support | How to obtain |
|-----------|---------|-------------|---------------|
| hostapd | ____________________ | ☐ Yes ☐ No | `hostapd -v` |
| dnsmasq | ____________________ | — | `dnsmasq --version` |
| iw | ____________________ | — | `iw --version` |
| aircrack-ng (airmon/aireplay) | ____________________ | — | `aircrack-ng --help \| head -1` |
| wpa_supplicant (for client-check) | ____________________ | — | `wpa_supplicant -v` |

## 4. Test Clients

| # | Device (make/model) | OS + version | Wi-Fi: WPA2 | WPA3/SAE | Notes |
|---|---------------------|--------------|:-----------:|:--------:|-------|
| 1 | ____________________ | ____________________ | ☐ | ☐ | ____________________ |
| 2 | ____________________ | ____________________ | ☐ | ☐ | ____________________ |
| 3 | ____________________ | ____________________ | ☐ | ☐ | ____________________ |
| 4 | ____________________ | ____________________ | ☐ | ☐ | ____________________ |

> Include at least one WPA3/SAE-capable client and one WPA2-only (or
> SAE-disabled) client so transition mode can be shown to serve both.
