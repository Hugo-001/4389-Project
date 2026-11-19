# Software Inventory (fully virtual lab)

**Course:** CS4389 — Data & Applications Security
**Project:** Isolated WPA2/WPA3/Transition Wi-Fi Test Lab
**Maintained by:** Chris Abraham (Lab Lead / Network Setup)
**Last updated:** _____________________

> This lab uses **no physical Wi-Fi hardware**. All radios are simulated with the
> `mac80211_hwsim` kernel module inside one Linux VM. Fill in every field below;
> capture versions with the commands noted so the lab is reproducible.

---

## 1. Lab Host (the single VM)

| Field | Value | How to obtain |
|-------|-------|---------------|
| Host type | ☐ VM  ☐ Bare-metal Linux | — |
| If VM: hypervisor + version | ____________________ | UTM / VMware / Parallels / QEMU |
| OS distribution | ____________________ | `lsb_release -a` |
| Kernel version | ____________________ | `uname -r` |
| CPU / arch | ____________________ | `uname -m` |
| RAM | ____________________ | `free -h` |
| Physical Wi-Fi adapter used? | **No — none** | by design (virtual lab) |

## 2. Virtual Radios (mac80211_hwsim)

| Field | Value | How to obtain |
|-------|-------|---------------|
| Module | mac80211_hwsim | `lsmod \| grep mac80211_hwsim` |
| Radios created | 5 | `setup-virtual.sh` (`RADIOS=5`) |
| AP interface — WPA2 | ____________________ | `setup-virtual.sh --status` |
| AP interface — WPA3 | ____________________ | `setup-virtual.sh --status` |
| AP interface — transition | ____________________ | `setup-virtual.sh --status` |
| Client/station interface | ____________________ | `setup-virtual.sh --status` |
| Monitor/capture interface | ____________________ | `setup-virtual.sh --status` |
| AP mode supported | ☐ Yes ☐ No | `check-adapter.sh` step 4 |
| Monitor mode supported | ☐ Yes ☐ No | `check-adapter.sh` step 4 |
| Injection confirmed | ☐ Yes ☐ No | `verify-injection.sh` |

## 3. AP Software

| Component | Version | SAE support | How to obtain |
|-----------|---------|-------------|---------------|
| hostapd | ____________________ | ☐ Yes ☐ No | `hostapd -v` |
| dnsmasq | ____________________ | — | `dnsmasq --version` |
| iw | ____________________ | — | `iw --version` |
| tcpdump (verify-injection) | ____________________ | — | `tcpdump --version \| head -1` |
| aircrack-ng (optional, inject) | ____________________ | — | `aircrack-ng --help \| head -1` |
| wpa_supplicant (for client-check) | ____________________ | — | `wpa_supplicant -v` |

## 4. Test Clients (virtual)

The client is the simulated `wlan3` radio driven by `wpa_supplicant`. Because
every `mac80211_hwsim` radio supports SAE, you demonstrate WPA2 vs WPA3 by how
the supplicant is configured, not by hardware capability:

| Client profile | `wpa_supplicant` `key_mgmt` | Proves |
|----------------|-----------------------------|--------|
| WPA2-PSK client | `WPA-PSK` (+ `ieee80211w=0`) | legacy association on WPA2 / transition |
| WPA3-SAE client | `SAE` (+ `ieee80211w=2`) | SAE + PMF on WPA3 / transition |

| # | Profile | `key_mgmt` / pmf | Captured by `client-check.sh`? | Notes |
|---|---------|------------------|:------------------------------:|-------|
| 1 | WPA2-PSK | `WPA-PSK` / off | ☐ | ____________________ |
| 2 | WPA3-SAE | `SAE` / required | ☐ | ____________________ |

> Run profile 1 against `LAB-TRANSITION-TEST` and profile 2 against both
> `LAB-WPA3-TEST` and `LAB-TRANSITION-TEST` to show transition serves both.
