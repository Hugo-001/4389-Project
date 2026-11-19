# Integration notes — FIDO2 + Frontend UI + Persistent SQLite

## Sources inspected
- `4389-Project-fido2.zip`: `src/server.js`, `src/index.js`, `src/store.js`, `src/verifier.js`, `package.json`.
- `4389-Project-frontend-ui-pages.zip`: HTML, CSS, JavaScript, backend scaffolding.
- `FIDO2_Full_Database_Project.zip`: working integration baseline.

## Conflict resolution
The newer-uploaded FIDO2 archive includes a working verifier but its `src/store.js` is an **unimplemented interface** (methods return `0`), its launcher has an undefined `port` and lacks injected store/verifier, and its server imports `../store.js` and `../verifier.js` even though those files are in `src/`. Copying these files verbatim would break the application. The baseline already contains the same verifier logic and includes the working database implementation, so that version is retained.

The frontend archive includes mock register/login flows (with `pause()` and placeholder outcomes), a hardcoded signed-in username, and an inactive sign-out link. The integrated baseline already replaces these with real WebAuthn API calls, a session lookup, and logout. Those functioning versions are retained; the frontend archive's matching stylesheet and landing page are carried forward.

## Database and backend
SQLite via built-in `node:sqlite`; database path `data/webauthn.sqlite` (override with `DB_PATH`). Tables: users, credentials, challenges, sessions, comments. Credentials store public keys, credential IDs, counters, transports, and metadata. Signed-in users can read and post comments on `/signed-in.html`. The passkey list/rename/remove endpoints remain in the API, but the website has no page for them.

## Run on Windows (PowerShell)
1. Install Node.js 22+ and open PowerShell in this directory.
2. Run `npm.cmd install`.
3. Run `npm.cmd start`.
4. Visit `http://localhost:3000`, register, sign in, and post a comment on the signed-in page.
5. Run `node --test test/database.test.js` for the storage unit test.

## Limitations
The unit test validates storage, not a complete real-authenticator browser ceremony. Test registration and authentication with a supported browser on `localhost` before demo. The UI cannot yet add a second passkey to an existing account, so removal is unavailable for a single-passkey account. Account management requires an active session but not a fresh passkey confirmation. Add step-up authentication and further production hardening before any real deployment.
