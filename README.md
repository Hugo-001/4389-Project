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
```

Data is kept in memory, so all users and sessions are lost when the server restarts.
