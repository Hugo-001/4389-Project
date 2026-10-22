/*
 * HOW THIS WORKS (WebAuthn / passkeys in one page)
 *
 * WebAuthn replaces passwords with a public/private key pair. The private key
 * never leaves the user's authenticator (phone, laptop, security key); the
 * server only ever stores the PUBLIC key. Proving identity = signing a random
 * value the server picked. So there are two ceremonies, each in two steps:
 *
 *   REGISTRATION                              LOGIN
 *   1. POST /register/options                 1. POST /login/options
 *      server makes a random CHALLENGE,          server makes a random CHALLENGE and
 *      remembers it, returns it + RP info        lists the user's known credential ids
 *   2. Browser calls                          2. Browser calls
 *      navigator.credentials.create()            navigator.credentials.get()
 *      -> authenticator makes a new key pair     -> authenticator SIGNS the challenge
 *   3. POST /register/verify                  3. POST /login/verify
 *      server checks the challenge is ours,      server checks the challenge is ours,
 *      asks the FIDO2 verifier to validate       asks the FIDO2 verifier to check the
 *      the attestation, stores the PUBLIC key    signature against the stored public key
 *   4. server starts a session (cookie)       4. server starts a session (cookie)
 *
 * Why the challenge matters: it is random, single-use and short-lived, so a
 * captured response can't be replayed later. The signed data also includes the
 * origin and RP ID, so a look-alike phishing site can't harvest a usable login.
 *
 * Division of labour: THIS file handles HTTP, challenges, storage and sessions.
 * The cryptographic checks (parsing authenticator data, verifying signatures,
 * origin/RP ID hash) live behind the `verifier` interface (src/verifier.js).
 */
// ---- IMPORTS: what each one is and where it's used --------------------------------------
// No third-party packages: everything below ships with Node itself (the `node:` prefix).
//
// node:http   Node's built-in web server. Used once, at the bottom of createServer():
//             http.createServer(handler) returns the server that src/index.js starts with
//             .listen(port) and that the tests start on a random port.
// node:crypto Hashing. Used once: createHash('sha256') -> the WebAuthn "user handle" derived
//             from the username. (Random challenges, session ids and user ids are now created
//             inside src/store.js, with crypto.randomBytes, never Math.random.)
// ./store.js  The Store class (the in-memory "database"). It owns the record shapes; this file
//             only calls its methods (createUser, getSession, ...). createServer() creates one by
//             default; tests/other code can pass their own.
// ./verifier.js  unimplementedVerifier, the default placeholder that refuses everything until
//             the real FIDO2 verification module is passed in. Fails closed = safe.
//
// Also used but not imported (built into Node globally): Buffer (base64url <-> bytes,
// reading clientDataJSON), URL (parsing the request path), JSON, Map, console.
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { Store } from './store.js';
import { unimplementedVerifier } from './verifier.js';

// WebAuthn sends binary data (challenges, ids, keys) as base64url strings in JSON.
const b64url = (buf) => Buffer.from(buf).toString('base64url');
// A challenge must be used within 5 minutes; a session lasts 1 hour.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 60 * 60 * 1000;
const COOKIE = 'sid';
// Front-end files are served from public/ so the page and the API share one origin
// (required by the Origin check, the verifier and the SameSite=Strict cookie).
const PUBLIC_DIR = resolve(import.meta.dirname, '../public');
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// Thrown by handlers; the request wrapper at the bottom turns it into a JSON error response.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Everything is injectable (verifier, store, clock) so tests can run without real authenticators.
// rpID = the domain credentials are bound to; origin = the exact URL the browser page is served from.
export function createServer({
  verifier = unimplementedVerifier,
  store = new Store(),
  rpName = 'WebAuthn Demo',
  rpID = 'localhost',
  origin = 'http://localhost:3000',
  secureCookies = origin.startsWith('https:'),
  now = () => Date.now(),
} = {}) {
  // Create a random 32-byte challenge and remember what it was issued for.
  // `type` stops a registration challenge being used to log in (and vice versa).
  const issueChallenge = (type, username) =>
    store.createChallenge({ type, username, expiresAt: now() + CHALLENGE_TTL_MS });

  // The browser echoes our challenge back inside clientDataJSON (a base64url JSON blob).
  // We read it out, look it up, and DELETE it immediately so it can never be reused,
  // even if verification later fails. Unknown/expired/wrong-type -> reject.
  // (The verifier separately checks the signature really covers this challenge.)
  const consumeChallenge = async (response, type) => {
    let challenge;
    try {
      const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString());
      challenge = clientData.challenge;
    } catch {
      throw new HttpError(400, 'Malformed clientDataJSON');
    }
    const entry = await store.takeChallenge(challenge);
    if (!entry || entry.type !== type || entry.expiresAt < now()) {
      throw new HttpError(400, 'Unknown or expired challenge');
    }
    return { challenge, ...entry };
  };

  // After a successful ceremony: create a random session id, store it server-side,
  // and hand it to the browser as an HttpOnly cookie (JS can't read it; SameSite=Strict
  // stops cross-site requests carrying it).
  const startSession = async (res, user) => {
    const sid = await store.createSession({
      userId: user.id,
      username: user.username,
      expiresAt: now() + SESSION_TTL_MS,
    });
    res.setHeader('Set-Cookie', cookie(sid, SESSION_TTL_MS / 1000));
  };
  const cookie = (value, maxAge) =>
    `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  // Look up the session for a request's cookie, dropping it if expired.
  const getSession = async (req) => {
    const m = /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '');
    const s = m && (await store.getSession(m[1]));
    if (!s) return null;
    if (s.expiresAt < now()) {
      await store.deleteSession(m[1]);
      return null;
    }
    return { sid: m[1], ...s };
  };

  // Route table keyed by "METHOD /path". Each handler returns the JSON body or throws HttpError.
  const routes = {
    'POST /api/register/options': async (req) => {
      // STEP 1 of registration: validate the name and build the options object that the
      // browser passes straight to navigator.credentials.create().
      const { username, displayName } = req.body;
      if (typeof username !== 'string' || !/^[\w.@-]{1,64}$/.test(username)) {
        throw new HttpError(400, 'Invalid username');
      }
      if (await store.hasUser(username)) throw new HttpError(409, 'Username already registered');
      return {
        challenge: await issueChallenge('registration', username),
        rp: { name: rpName, id: rpID },
        user: {
          id: b64url(crypto.createHash('sha256').update(username).digest()),
          name: username,
          displayName: typeof displayName === 'string' && displayName ? displayName : username,
        },
        // Accepted algorithms: -7 = ES256 (ECDSA P-256), -257 = RS256 (RSA). Most authenticators use ES256.
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: 60000,
        // 'none' = we don't need proof of the authenticator's make/model; simpler and more private.
        attestation: 'none',
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      };
    },

    'POST /api/register/verify': async (req, res) => {
      // STEP 3 of registration: the browser returns the new credential. The challenge ties
      // this response to the username we issued it for.
      const response = req.body;
      const { challenge, username } = await consumeChallenge(response, 'registration');
      if (await store.hasUser(username)) throw new HttpError(409, 'Username already registered');
      // Hand off to the FIDO2 logic. It must validate the attestation, origin and RP ID,
      // and return the credential's id + public key for us to store.
      const result = await verifier.verifyRegistration({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
      if (!result?.verified || !result.credential) throw new HttpError(400, 'Registration verification failed');
      const { credential } = result;
      if (await store.hasCredential(credential.id)) throw new HttpError(409, 'Credential already registered');
      // Only now (after verification passed) is the user created, so failed attempts leave nothing behind.
      // Note we store the PUBLIC key and a signature counter, never any secret.
      const user = await store.createUser({ username, credentialId: credential.id });
      await store.createCredential({
        id: credential.id,
        userId: user.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports,
      });
      await startSession(res, user);
      return { verified: true, user: { username } };
    },

    'POST /api/login/options': async (req) => {
      // STEP 1 of login: issue a challenge for the authenticator to sign.
      const { username } = req.body;
      const options = {
        challenge: await issueChallenge('authentication', username ?? null),
        rpId: rpID,
        timeout: 60000,
        userVerification: 'preferred',
        allowCredentials: [],
      };
      // Unknown usernames get an empty list rather than an error (no user enumeration);
      // omitting username entirely means a discoverable-credential flow.
      const user = typeof username === 'string' && (await store.getUser(username));
      if (user) {
        options.allowCredentials = await Promise.all(
          user.credentialIds.map(async (id) => ({
            type: 'public-key',
            id,
            transports: (await store.getCredential(id))?.transports,
          })),
        );
      }
      return options;
    },

    'POST /api/login/verify': async (req, res) => {
      // STEP 3 of login: the browser returns a signed assertion. response.id says which
      // credential signed it, so we can fetch the matching stored public key.
      const response = req.body;
      const { challenge } = await consumeChallenge(response, 'authentication');
      const credential = await store.getCredential(response.id);
      if (!credential) throw new HttpError(401, 'Authentication failed');
      const result = await verifier.verifyAuthentication({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { ...credential },
      });
      if (!result?.verified) throw new HttpError(401, 'Authentication failed');
      // The authenticator increments a counter on every use. If it ever fails to go up,
      // the credential may have been cloned, so we refuse the login.
      // Reject counter rollback (cloned authenticator); 0/0 means the authenticator has no counter.
      const newCounter = result.newCounter ?? credential.counter;
      if ((newCounter > 0 || credential.counter > 0) && newCounter <= credential.counter) {
        throw new HttpError(401, 'Authentication failed');
      }
      await store.updateCredentialCounter(credential.id, newCounter);
      const user = await store.getUserById(credential.userId);
      await startSession(res, user);
      return { verified: true, user: { username: user.username } };
    },

    // Lets the front end ask "am I logged in?" using the session cookie.
    'GET /api/session': async (req) => {
      const s = await getSession(req);
      if (!s) throw new HttpError(401, 'Not authenticated');
      return { user: { username: s.username } };
    },

    'POST /api/logout': async (req, res) => {
      const s = await getSession(req);
      if (s) await store.deleteSession(s.sid);
      res.setHeader('Set-Cookie', cookie('', 0));
      return { ok: true };
    },
  };

  // Read and parse the request body, with a 64 KB cap so nobody can exhaust memory.
  const readJson = async (req) => {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 64 * 1024) throw new HttpError(413, 'Body too large');
      chunks.push(c);
    }
    if (!chunks.length) return {};
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body === null || typeof body !== 'object') throw 0;
      return body;
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
  };

  // Serve a file from public/ ("/" -> index.html). resolve() + the prefix check stop
  // "../" paths from reaching files outside public/.
  const serveStatic = async (res, urlPath) => {
    const file = resolve(PUBLIC_DIR, '.' + (urlPath === '/' ? '/index.html' : urlPath));
    if (!file.startsWith(PUBLIC_DIR + sep)) throw new HttpError(404, 'Not found');
    let data;
    try {
      data = await readFile(file);
    } catch {
      throw new HttpError(404, 'Not found');
    }
    res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
    res.end(data);
  };

  const send = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };

  // Entry point for every request: route lookup -> origin check -> parse body -> run handler.
  // Errors with a status are shown to the client; anything unexpected becomes a generic 500
  // (details are logged server-side only, never leaked).
  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://x').pathname;
      const handler = routes[`${req.method} ${path}`];
      if (!handler && req.method === 'GET' && !path.startsWith('/api/')) return await serveStatic(res, path);
      if (!handler) throw new HttpError(404, 'Not found');
      if (req.method === 'POST') {
        // CSRF guard: browsers always send Origin on cross-origin POSTs.
        if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'Bad origin');
        req.body = await readJson(req);
      }
      send(res, 200, await handler(req, res));
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      send(res, err.status ?? 500, { error: err.status ? err.message : 'Internal error' });
    }
  });
}
