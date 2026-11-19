# FIDO2 Passwordless Authentication — Database & Account Management

Passwordless login server using WebAuthn / FIDO2 passkeys. Users register and sign in using an authenticator, such as Windows Hello, a phone, or a security key, instead of a password.

The application uses **SQLite** to store user accounts, public keys, credential IDs, authentication counters, and session information persistently.

## Requirements

| Tool | Version | Check with |
|---|---|---|
| Node.js | 22 or newer | `node -v` |
| npm | Included with Node.js | `npm -v` |
| Git | Latest compatible version | `git --version` |

SQLite is included through Node.js's built-in `node:sqlite` module. No separate database server is required.

## Dependencies

| Package / Module | Purpose |
|---|---|
| `@simplewebauthn/server` (`^14.0.3`) | WebAuthn registration and authentication verification |
| `node:sqlite` | Persistent SQL database |
| `node:http` | HTTP server and API |
| `node:crypto` | Cryptographic hashing and random values |
| `node:fs` | File and directory operations |
| `node:path` | Filesystem path handling |

Install npm dependencies with:

```bash
npm install
```

## Database

**Database system:** SQLite  
**Database file:** `data/webauthn.sqlite`  
**Database implementation:** `src/database.js`  
**Database operations:** `src/store.js`

The database is automatically initialized when the application starts.

### Database tables

| Table | Description |
|---|---|
| `users` | User IDs, usernames, display names, creation and update timestamps |
| `credentials` | Credential IDs, public keys, signature counters, transports, device information, nicknames, and timestamps |
| `challenges` | Temporary WebAuthn challenges and expiration times |
| `sessions` | Authentication session identifiers and expiration times |
| `comments` | Comment text, author (user ID), and creation time |

Foreign keys link credentials, sessions, and comments to registered users.

Private authentication keys remain on the user's authenticator and are never stored by the server.

## Setup

Clone the project:

```bash
git clone https://github.com/Hugo-001/4389-Project.git
cd 4389-Project
npm install
```

On Windows PowerShell, if npm scripts are blocked, use:

```powershell
npm.cmd install
npm.cmd start
```

## Running the Application

```bash
npm start
```

Open:

http://localhost:3000

### Application pages

| Page | Purpose |
|---|---|
| `/login.html` | Authenticate with a registered passkey |
| `/register.html` | Register a new user and passkey |
| `/signed-in.html` | View the signed-in account, sign out, and read or write comments |

## Comments

Signed-in users can write comments on `/signed-in.html`. Each comment is saved in the `comments` table with its author and time, and every signed-in user sees the 50 most recent, newest first.

- Comments are plain text, 1–500 characters. The page inserts them with `textContent`, so HTML or script in a comment is displayed as text, never run.
- Reading and posting both require a signed-in session. Posting is also covered by the server's Origin check and the `SameSite=Strict` session cookie.
- A user's comments are deleted along with their account.

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/register/options` | Generate registration options |
| POST | `/api/register/verify` | Verify and store a new credential |
| POST | `/api/login/options` | Generate authentication options |
| POST | `/api/login/verify` | Verify authentication and start a session |
| GET | `/api/session` | Retrieve current session |
| POST | `/api/logout` | End current session |

### Comments

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/comments` | List the 50 most recent comments (signed-in users only) |
| POST | `/api/comments` | Post a comment: `{ "text": "..." }`, 1–500 characters |

### Credential Management

The backend still provides authenticated credential-listing, renaming, and removal endpoints (`GET /api/credentials`, `POST /api/credentials/rename`, `POST /api/credentials/remove`). The website has no page for them.

## Testing
## Security tests 

`run-tests.mjs` runs 11 security tests against the real server — no physical authenticator needed. It starts its own server on http://localhost:3000 with the real verifier and a fresh store, builds WebAuthn registration/assertion responses in code (ES256 keypair, hand-built CBOR attestation, DER signatures), and checks each attack end to end.

Run one test at a time:

    node run-tests.mjs <repo-path> outN.json N  # N = 1..11

Don't run `npm start` at the same time: the harness starts its own server on port 3000.

The 11 tests: 1 wrong challenge, 2 replay, 3 wrong credential, 4 edited response, 5 expired challenge, 6 wrong origin, 7 counter rollback, 8 session handling, 9 challenge type mix-up, 10 duplicate registration, 11 bad/missing fields.

Each run prints the requests, responses, and server log lines, and writes `outN.json` — the machine-readable receipt (pass/fail per check, expected vs actual, server log lines). All 11 tests pass (55 checks) on main.


## Project structure

Run the database test:

```bash
node --test test/database.test.js
```
package.json      Project info and dependencies
run-tests.mjs     Script to test the Test Cases
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

The tests exercise database storage and credential operations without requiring a physical authenticator.

For manual testing, register an account, sign in, open the passkey management page, and verify that credential records remain available after restarting the server.
