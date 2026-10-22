# WebAuthn Backend

Passwordless login server using WebAuthn / FIDO2 passkeys. Users register and sign in with an authenticator (phone, laptop, security key) instead of a password; the server stores only public keys.

## Requirements

| Tool | Version | Check with |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22 or newer | `node -v` |
| npm | comes with Node.js | `npm -v` |

## Dependencies

### npm packages

| Package | Version | Used in | Purpose |
|---|---|---|---|
| [`@simplewebauthn/server`](https://simplewebauthn.dev/docs/packages/server) | `^14.0.3` | `src/verifier.js` | Verifies WebAuthn registration and authentication responses (challenge, origin, RP ID, signature, counter) |

`npm install` also installs the packages `@simplewebauthn/server` depends on. The exact versions of everything installed are recorded in `package-lock.json`.

### Built-in Node.js modules (no install needed)

| Module | Used in | Purpose |
|---|---|---|
| `node:http` | `src/server.js` | HTTP server |
| `node:crypto` | `src/server.js`, `src/store.js` | SHA-256 hashing and secure random challenges, session IDs and user IDs |

## Setup

```bash
git clone https://github.com/Hugo-001/4389-Project.git
cd 4389-Project
npm install
```

`npm install` reads `package.json`, downloads the dependencies into `node_modules/`, and creates or updates `package-lock.json`.

### Windows: "running scripts is disabled on this system"

In PowerShell (including the VS Code terminal on Windows), `npm install` may fail with:

```
npm : File C:\Program Files\nodejs\npm.ps1 cannot be loaded because running scripts is disabled on this system.
```

PowerShell's default execution policy blocks the `npm.ps1` script. Fix it in either of these ways:

- Allow local scripts for your Windows account (one-time; answer `Y` if asked):

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

- Or leave the policy alone and run `npm.cmd` instead of `npm` (for example `npm.cmd install`, `npm.cmd start`), or switch the terminal to Command Prompt or Git Bash.

## Running

```bash
npm start
```

The server listens on http://localhost:3000. Open that address in a browser to use the login page. The page must be opened through the server (not as a `file://`), because WebAuthn and the server's origin checks require the page and the API to share the same origin.

Optional environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `RP_ID` | `localhost` | Domain the passkeys are bound to |
| `ORIGIN` | `http://localhost:3000` | Exact URL the front end is served from |
| `RP_NAME` | `WebAuthn Demo` | Name shown by the authenticator |

Example: `RP_ID=example.com ORIGIN=https://example.com npm start`

## API endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/register/options` | Start registration: returns a challenge and options for `navigator.credentials.create()` |
| POST | `/api/register/verify` | Finish registration: verifies the new credential and stores its public key |
| POST | `/api/login/options` | Start login: returns a challenge and options for `navigator.credentials.get()` |
| POST | `/api/login/verify` | Finish login: verifies the signature and starts a session |
| GET | `/api/session` | Returns the logged-in user, or 401 |
| POST | `/api/logout` | Ends the session |

## Wi-Fi test lab (`setup/wpa-lab`)

The `setup/wpa-lab/wpa-lab/` folder holds a separate part of the project: an isolated, air-gapped Wi-Fi access point that can run in WPA2-Personal, WPA3-Personal (SAE), or WPA2/WPA3 transition mode, with scripts and docs to prove which mode is active and that the lab is isolated. It does not depend on the Node.js server above. Full instructions are in [`setup/wpa-lab/wpa-lab/README.md`](setup/wpa-lab/wpa-lab/README.md).

> **Scope:** team-owned hardware only, on an isolated subnet with no internet uplink. Read [`docs/AUTHORIZATION-ISOLATION-NOTE.md`](setup/wpa-lab/wpa-lab/docs/AUTHORIZATION-ISOLATION-NOTE.md) before using the lab.

### Requirements

| Item | Details |
|---|---|
| OS | Linux (Kali or Ubuntu). Does not run on Windows or macOS; use a Linux VM with USB passthrough, or a Raspberry Pi |
| Wi-Fi adapter | Must support AP mode and monitor mode. Reference: Alfa AWUS036NHA (Atheros AR9271, `ath9k_htc`), 2.4 GHz only |
| Packages | `hostapd` (built with SAE), `dnsmasq`, `iw`, `iproute2`, `aircrack-ng`, `usbutils`, `wpasupplicant`, `firmware-atheros` |

```bash
sudo apt update
sudo apt install -y hostapd dnsmasq iw iproute2 aircrack-ng usbutils \
                    wpasupplicant firmware-atheros
```

### Before first use

Replace the placeholder passphrases in the configs (`ChangeMe-...-Lab!`), and keep the real values out of the repository:

| Config | Setting |
|---|---|
| `configs/hostapd-wpa2.conf` | `wpa_passphrase` |
| `configs/hostapd-wpa3.conf` | `sae_password` |
| `configs/hostapd-transition.conf` | `wpa_passphrase` and `sae_password` (same value) |

### Running the lab

Run from `setup/wpa-lab/wpa-lab/` on the Linux machine:

```bash
./scripts/check-adapter.sh                       # 1. check the adapter (read-only); fix any [FAIL]
sudo ./scripts/verify-injection.sh wlan0         # 2. optional hardware self-test against our own AP
sudo ./scripts/start-ap.sh wpa2                  # 3. start the AP: wpa2 | wpa3 | transition
./scripts/client-check.sh wlan0                  # 4. on a joined test client: prove mode + isolation
sudo ./scripts/stop-ap.sh                        # 5. tear down
```

If the adapter isn't `wlan0`, prefix the AP scripts with `IFACE=<name>`.

| Mode | SSID | Security |
|---|---|---|
| `wpa2` | `LAB-WPA2-TEST` | WPA2-PSK / CCMP |
| `wpa3` | `LAB-WPA3-TEST` | SAE, PMF required |
| `transition` | `LAB-TRANSITION-TEST` | WPA-PSK + SAE, PMF optional |

### Isolation

Clients get addresses on `192.168.50.0/24` with no gateway, no DNS, and no NAT, so nothing on the lab network can reach other networks. The checks to run before, during and after each session are in [`docs/ISOLATION-PROCEDURES.md`](setup/wpa-lab/wpa-lab/docs/ISOLATION-PROCEDURES.md).

## Project structure

```
package.json      Project info and dependencies
public/
  index.html      Redirects to login.html
  login.html      Sign-in page (UI only, not yet connected to the API)
  register.html   Registration page (UI only, not yet connected to the API)
  signed-in.html  Signed-in page (UI only, not yet connected to the API)
  css/styles.css  Shared styles
  js/ui.js        Shared UI helpers; backend hooks are marked TODO(backend)
src/
  index.js        Starts the server
  server.js       API endpoints, challenges, sessions
  verifier.js     FIDO2 verification (uses @simplewebauthn/server)
  store.js        In-memory storage for users, credentials, challenges, sessions
setup/wpa-lab/wpa-lab/
  README.md       Full Wi-Fi lab instructions
  configs/        hostapd (WPA2 / WPA3 / transition) and dnsmasq configs
  scripts/        check-adapter, verify-injection, start-ap, stop-ap, client-check
  docs/           Authorization note, hardware inventory, isolation procedures, topology
  report/         Team member contribution notes
```

Data is kept in memory, so all users and sessions are lost when the server restarts.
