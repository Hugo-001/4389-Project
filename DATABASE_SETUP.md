# Persistent FIDO2 database — Person 4

This implementation uses Node.js 22+ built-in `node:sqlite` (no database server or extra SQLite npm dependency). Existing `@simplewebauthn/server` dependency is still required.

## Windows PowerShell

```powershell
node --version
npm install
npm start
```

Open `http://localhost:3000`. Database is created automatically at `data/webauthn.sqlite` on first run. To use another file, set `$env:DB_PATH="C:\path\to\webauthn.sqlite"` before `npm start`.

## Schema

- `users`: random user ID, unique username, display name, created/updated timestamps.
- `credentials`: globally unique credential ID, owning user, COSE public-key bytes, signature counter, transports, device type, backup state, nickname, timestamps. Foreign key cascades on user deletion.
- `challenges`: one-time challenge, ceremony type, username and expiry.
- `sessions`: SHA-256 hash of opaque session token, user reference and expiry. Raw tokens are only sent in HttpOnly cookies.

All timestamp fields are milliseconds since Unix epoch. Never store passkey private keys.

## API (requires logged-in session cookie)

- `GET /api/credentials` returns `{credentials:[...]}` with safe metadata, no public keys.
- `POST /api/credentials/rename` JSON `{ "id": "credential-id", "nickname": "Laptop" }`.
- `POST /api/credentials/remove` JSON `{ "id": "credential-id" }`.

Removal rejects deletion of the final passkey to avoid locking users out. Existing registration creates a first passkey; **adding a second passkey to an existing account is not yet implemented**. To exercise removal, create a second credential via the Store API in a local test or add an authenticated passkey-enrollment flow with fresh user verification before production use.

## Testing

```powershell
node --test test/database.test.js
```

## Important limitations

This is a persistent local/demo database, not a production deployment. For production, add authenticated passkey enrollment, fresh reauthentication before destructive changes, CSRF tokens or strict origin enforcement for all state-changing requests, per-account rate limits, robust concurrent-transaction handling, backups, migration tooling, HTTPS and secure cookies. A passkey removed from this database may remain on the user's device, but it can no longer authenticate to this server.

Node's `node:sqlite` is experimental in Node 22 and may emit an experimental warning. Run with a current supported Node release.
