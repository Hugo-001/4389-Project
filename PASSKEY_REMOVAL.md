# Removing passkeys

The website no longer has a passkey management page. A signed-in user can still remove a passkey through the API: `POST /api/credentials/remove` with JSON `{ "id": "credential-id" }`. The credential is deleted from the SQLite `credentials` table.

If it was the **last** passkey, the user account is also deleted (along with its comments), its sessions are invalidated, and the response clears the session cookie and returns `accountDeleted: true`. This prevents an account from remaining permanently inaccessible and allows re-registration with the same username. This action cannot be undone.

Deleting a credential server-side does **not** delete the passkey from the device or passkey manager.

Run tests: `node --test test/database.test.js`.

Security note: This demo uses an existing login session to authorize deletion. For production, require recent passkey reauthentication before sensitive account or credential deletion, and add CSRF protections.
