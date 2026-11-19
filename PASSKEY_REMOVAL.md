# Removing passkeys

Sign in, open `/passkeys.html`, and click **Remove** next to a credential. Confirm the warning. The credential is deleted from the SQLite `credentials` table.

If it was the **last** passkey, the user account is also deleted, its sessions are invalidated, and the browser is redirected to registration. This prevents an account from remaining permanently inaccessible and allows re-registration with the same username. This action cannot be undone.

Deleting a credential server-side does **not** delete the passkey from the device or passkey manager.

Run tests: `node --test test/database.test.js`.

Security note: This demo uses an existing login session to authorize deletion. For production, require recent passkey reauthentication before sensitive account or credential deletion, and add CSRF protections.
