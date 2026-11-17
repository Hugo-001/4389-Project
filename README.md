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

Foreign keys link credentials and sessions to registered users.

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
| `/signed-in.html` | View the authenticated account |
| `/passkeys.html` | Manage registered passkeys |

## Account and Credential Management

Authenticated users can:

- View their registered passkeys.
- Rename passkeys for easier identification.
- Remove a registered passkey when more than one exists.
- Sign out of their current session.

Removing a passkey deletes its server-side credential record, preventing that credential from being used for future authentication. It does not delete the passkey stored on the user's physical device.

Currently, removing the only registered passkey is blocked to prevent account lockout. Registering additional passkeys to an existing account is a future enhancement.

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

### Credential Management

The backend also provides authenticated credential-listing, renaming, and removal operations used by `/passkeys.html`.

## Testing

Run the database test:

```bash
node --test test/database.test.js
```

The tests exercise database storage and credential operations without requiring a physical authenticator.

For manual testing, register an account, sign in, open the passkey management page, and verify that credential records remain available after restarting the server.
