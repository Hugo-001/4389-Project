import { randomBytes } from 'node:crypto';

// Temporary in-memory store. All records disappear when the process restarts.
// Matches the interface used by the team's existing server.js.
export class Store {
  constructor() {
    this.usersByName = new Map();
    this.usersById = new Map();
    this.credentials = new Map();
    this.challenges = new Map();
    this.sessions = new Map();
  }

  hasUser(username) { return this.usersByName.has(username); }
  getUser(username) { return this.usersByName.get(username); }
  getUserById(id) { return this.usersById.get(id); }

  createUser({ username, credentialId }) {
    if (this.hasUser(username)) throw new Error('Username already exists');
    const user = {
      id: randomBytes(16).toString('base64url'),
      username,
      displayName: username,
      credentialIds: credentialId ? [credentialId] : [],
    };
    this.usersByName.set(username, user);
    this.usersById.set(user.id, user);
    return user;
  }

  hasCredential(id) { return this.credentials.has(id); }
  getCredential(id) { return this.credentials.get(id); }

  createCredential({ id, userId, publicKey, counter, transports }) {
    if (this.hasCredential(id)) throw new Error('Credential already exists');
    const user = this.getUserById(userId);
    if (!user) throw new Error('Unknown user');
    const credential = { id, userId, publicKey, counter: counter ?? 0, transports: transports ?? [] };
    this.credentials.set(id, credential);
    if (!user.credentialIds.includes(id)) user.credentialIds.push(id);
    return credential;
  }

  updateCredentialCounter(id, counter) {
    const credential = this.getCredential(id);
    if (!credential) throw new Error('Unknown credential');
    if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid counter');
    credential.counter = counter;
  }

  createChallenge({ type, username, expiresAt }) {
    const challenge = randomBytes(32).toString('base64url');
    this.challenges.set(challenge, { type, username, expiresAt });
    return challenge;
  }

  // Atomic lookup and removal in this single-process in-memory implementation.
  takeChallenge(challenge) {
    const entry = this.challenges.get(challenge);
    this.challenges.delete(challenge);
    return entry;
  }

  createSession({ userId, username, expiresAt }) {
    const sid = randomBytes(32).toString('base64url');
    this.sessions.set(sid, { userId, username, expiresAt });
    return sid;
  }
  getSession(sid) { return this.sessions.get(sid); }
  deleteSession(sid) { this.sessions.delete(sid); }
}
