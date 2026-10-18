// ============================================================================
// PLACEHOLDER:(database/storage).
// This file is only the CONTRACT. Every method below is empty. server.js talks to storage exclusively through
// these methods, so keep the names, arguments and return values the same.
// Every method may return a value or a Promise: server.js `await`s all of them.
//
// Record shapes:
//   user:       { id, username, displayName, credentialIds: [] }
//   credential: { id, userId, publicKey, counter, transports }
//   challenge:  { type, username, expiresAt }   (looked up by the challenge string)
//   session:    { userId, username, expiresAt } (looked up by the session id)
//
// Random values (challenge, session id, user id) must come from a secure source such as
// crypto.randomBytes(n).toString('base64url'): 32 bytes for challenges and session ids,
// 16 bytes for user ids. Never Math.random.
// ============================================================================

export class Store {
  // ---- users ----
  // -> boolean: is this username already registered?
  hasUser(username) {
    return 0;
  }

  // -> user | undefined, looked up by username
  getUser(username) {
    return 0;
  }

  // -> user | undefined, looked up by user.id
  getUserById(id) {
    return 0;
  }

  // Create and save a user with a new random id, displayName = username,
  // credentialIds = [credentialId]. -> the new user
  createUser({ username, credentialId }) {
    return 0;
  }

  // ---- credentials ----
  // -> boolean: is this credential id already stored?
  hasCredential(id) {
    return 0;
  }

  // -> credential | undefined
  getCredential(id) {
    return 0;
  }

  // Save a credential (counter defaults to 0 when missing). -> the saved credential
  createCredential({ id, userId, publicKey, counter, transports }) {
    return 0;
  }

  // Store the credential's new signature counter. -> nothing
  updateCredentialCounter(id, counter) {
    return 0;
  }

  // ---- challenges ----
  // Save a challenge record under a NEW random challenge string. -> that string
  createChallenge({ type, username, expiresAt }) {
    return 0;
  }

  // Look up AND delete in one step so a challenge can never be used twice.
  // -> { type, username, expiresAt } | undefined
  takeChallenge(challenge) {
    return 0;
  }

  // ---- sessions ----
  // Save a session under a NEW random session id. -> that id
  createSession({ userId, username, expiresAt }) {
    return 0;
  }

  // -> { userId, username, expiresAt } | undefined
  getSession(sid) {
    return 0;
  }

  // Remove the session. -> nothing
  deleteSession(sid) {
    return 0;
  }
}
