// WebAuthn security tests (Section 4.7) for the 4389-Project server.
//
//   node run-tests.mjs REPO out.json N
//   REPO = path to the repo folder, out.json = where the result goes, N = test 1-11
//
// Starts its own server on http://localhost:3000, so don't run npm start
// at the same time. Uses the real verifier and a fresh store each run, and
// builds real WebAuthn responses in code, so no authenticator is needed.
// Tests 5 and 7 use the server's injectable clock and store.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [repoDir, outFile, testArg] = process.argv.slice(2);
const TEST_NUM = Number(testArg);
if (!repoDir || !outFile || !Number.isInteger(TEST_NUM) || TEST_NUM < 1 || TEST_NUM > 11) {
  process.stderr.write('Usage: node run-tests.mjs REPO out.json N   (N = 1..11)\n');
  process.exit(2);
}

const ORIGIN = 'http://localhost:3000';
const RP_ID = 'localhost';
const PORT = 3000;

const lines = [];
function out(s = '') { lines.push(s); process.stdout.write(s + '\n'); }
const short = (s, n = 28) => (typeof s === 'string' && s.length > n ? s.slice(0, 12) + '…' + s.slice(-8) : s);
const trunc = (s, n = 220) => (s.length > n ? s.slice(0, n) + ' …' : s);

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const unb64url = (s) => Buffer.from(s, 'base64url');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest();

// tiny CBOR encoder, just enough for attestation objects and COSE keys
function cborUint(major, n) {
  const mt = major << 5;
  if (n < 24) return Buffer.from([mt | n]);
  if (n < 256) return Buffer.from([mt | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = mt | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = mt | 26; b.writeUInt32BE(n, 1); return b;
}
function cborEncode(v) {
  if (typeof v === 'number') {
    if (!Number.isInteger(v)) throw new Error('CBOR: floats not supported');
    return v >= 0 ? cborUint(0, v) : cborUint(1, -1 - v);
  }
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([cborUint(3, b.length), b]); }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) { const b = Buffer.from(v); return Buffer.concat([cborUint(2, b.length), b]); }
  if (Array.isArray(v)) return Buffer.concat([cborUint(4, v.length), ...v.map(cborEncode)]);
  if (v instanceof Map) {
    const parts = [cborUint(5, v.size)];
    for (const [k, val] of v) parts.push(cborEncode(k), cborEncode(val));
    return Buffer.concat(parts);
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    const parts = [cborUint(5, entries.length)];
    for (const [k, val] of entries) parts.push(cborEncode(k), cborEncode(val));
    return Buffer.concat(parts);
  }
  throw new Error('CBOR: unsupported value ' + typeof v);
}

// fake authenticator: one P-256 keypair + its COSE public key
function makeCredential() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = unb64url(jwk.x); const y = unb64url(jwk.y);
  // COSE key for ES256: { 1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y }
  const coseKey = cborEncode(new Map([[1, 2], [3, -7], [-1, 1], [-2, x], [-3, y]]));
  return { credId: crypto.randomBytes(16), privateKey, coseKey };
}

function clientDataJSON(type, challenge, origin) {
  return b64url(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}

function buildRegistration({ username, challenge, origin, rpId, cred }) {
  const cdj = clientDataJSON('webauthn.create', challenge, origin);
  const authData = Buffer.concat([
    sha256(rpId), Buffer.from([0x45]), Buffer.alloc(4), // 0x45 = UP | UV | AT
    Buffer.alloc(16), // aaguid, zeros
    Buffer.alloc(2), // credId length, filled in below
  ]);
  const lenBuf = Buffer.alloc(2); lenBuf.writeUInt16BE(cred.credId.length, 0);
  authData.set(lenBuf, 32 + 1 + 4 + 16);
  const fullAuthData = Buffer.concat([authData, cred.credId, cred.coseKey]);
  const attestationObject = b64url(cborEncode({ fmt: 'none', attStmt: {}, authData: fullAuthData }));
  return {
    id: b64url(cred.credId), rawId: b64url(cred.credId), type: 'public-key',
    response: { clientDataJSON: cdj, attestationObject, transports: ['internal'] },
  };
}

function buildAssertion({ challenge, origin, rpId, cred, userHandle, counter = 1, tamper = null }) {
  let cdj = clientDataJSON('webauthn.get', challenge, origin);
  let authData = Buffer.concat([sha256(rpId), Buffer.from([0x05]), Buffer.alloc(4)]);
  authData.writeUInt32BE(counter, 33);
  // sign authData || sha256(clientDataJSON). crypto.sign gives DER, which is
  // what WebAuthn carries — the server unwraps it, so don't convert to raw.
  const sigInput = Buffer.concat([authData, sha256(unb64url(cdj))]);
  let signature = crypto.sign('sha256', sigInput, cred.privateKey);
  // edits go in after signing, like editing a captured request
  if (tamper === 'signature') { signature = Buffer.from(signature); signature[signature.length - 1] ^= 0x01; }
  if (tamper === 'clientData-origin') {
    const obj = JSON.parse(unb64url(cdj).toString());
    obj.origin = 'https://evil.example';
    cdj = b64url(JSON.stringify(obj));
  }
  if (tamper === 'clientData-challenge') {
    const obj = JSON.parse(unb64url(cdj).toString());
    obj.challenge = b64url(crypto.randomBytes(32));
    cdj = b64url(JSON.stringify(obj));
  }
  if (tamper === 'authData') { authData = Buffer.from(authData); authData[0] ^= 0x01; }
  return {
    id: b64url(cred.credId), rawId: b64url(cred.credId), type: 'public-key',
    response: {
      clientDataJSON: cdj,
      authenticatorData: b64url(authData),
      signature: b64url(signature),
      userHandle: b64url(userHandle),
    },
  };
}

// server setup: real verifier, fresh store, clock we can move. server console
// output is grabbed into serverLog — that's the evidence for the report.
const serverLog = [];
const origError = console.error;
const origLog = console.log;
// node prints warnings for stuff the library uses; not server evidence, skip them
const isNoise = (s) => /^\(node:\d+\) /.test(s) || s.startsWith('(Use `node --trace-warnings');
console.error = (...a) => { const s = a.map(String).join(' '); if (!isNoise(s)) serverLog.push(s); };
console.log = (...a) => { const s = a.map(String).join(' '); if (!isNoise(s)) serverLog.push(s); };

const { createServer } = await import(pathToFileURL(path.join(repoDir, 'src', 'server.js')).href);
const { Store } = await import(pathToFileURL(path.join(repoDir, 'src', 'store.js')).href);
const { verifier } = await import(pathToFileURL(path.join(repoDir, 'src', 'verifier.js')).href);

const store = new Store();
let nowMs = Date.now();
const server = createServer({ verifier, store, rpID: RP_ID, origin: ORIGIN, now: () => nowMs });
await new Promise((resolve) => server.listen(PORT, resolve));

// small cookie jar + request helper. prints each request and response.
const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
function storeCookies(setCookie) {
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of list) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    if (!v || /Max-Age=0/.test(c)) jar.delete(k.trim());
    else jar.set(k.trim(), v);
  }
}
function describeBody(body) {
  if (body === undefined) return '';
  if (typeof body === 'string') return ' ' + trunc(body);
  const s = JSON.stringify(body);
  const squashed = s.replace(/"([A-Za-z0-9_-]{40,})"/g, (_, v) => `"${short(v)}"`); // shorten long base64
  return ' ' + trunc(squashed);
}
async function http(method, p, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  let raw;
  if (body !== undefined) {
    if (typeof body === 'string') { raw = body; headers['Content-Type'] = 'application/json'; }
    else { raw = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  }
  const ck = cookieHeader();
  if (ck) headers.Cookie = ck;
  headers.Connection = 'close'; // no keep-alive — leftover sockets crash node on windows at exit
  const res = await fetch(`${ORIGIN}${p}`, { method, headers, body: raw });
  storeCookies(res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie'));
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  out(`> ${method} ${p}${describeBody(body)}`);
  out(`< ${res.status} ${trunc(text)}`);
  return { status: res.status, text, json };
}

const checks = [];
function check(label, expected, actual) {
  const pass = expected === actual;
  checks.push({ label, expected: String(expected), actual: String(actual), pass });
  out(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${expected}, got ${actual}`);
  return pass;
}
const userHandleFor = (username) => sha256(username);

async function registerUser(username) {
  const opt = await http('POST', '/api/register/options', { username });
  if (opt.status !== 200) throw new Error(`register options failed for ${username}: ${opt.status} ${opt.text}`);
  const cred = makeCredential();
  const reg = buildRegistration({ username, challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID, cred });
  const ver = await http('POST', '/api/register/verify', reg);
  if (ver.status !== 200) throw new Error(`register verify failed for ${username}: ${ver.status} ${ver.text}`);
  return cred;
}

async function loginUser(username, cred, counter = 1, tamper = null) {
  const opt = await http('POST', '/api/login/options', { username });
  if (opt.status !== 200) throw new Error(`login options failed for ${username}: ${opt.status} ${opt.text}`);
  const assertion = buildAssertion({
    challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID,
    cred, userHandle: userHandleFor(username), counter, tamper,
  });
  return http('POST', '/api/login/verify', assertion);
}

async function sessionStatus() {
  const r = await http('GET', '/api/session');
  return r.status;
}

// the 11 tests (Section 4.7). each one prints its requests, the status
// codes, and (at the end) the server log, then records pass/fail per check.
const TESTS = {
  1: {
    name: 'Wrong challenge',
    expected: 'Rejected (400 if the challenge was never issued, 401 if the signature does not match); no session',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      // (a) response signed over a challenge the server never issued
      const opt = await http('POST', '/api/login/options', { username: 'alice' });
      const wrong = buildAssertion({
        challenge: b64url(crypto.randomBytes(32)), origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 1,
      });
      const r1 = await http('POST', '/api/login/verify', wrong);
      check('never-issued challenge rejected', 400, r1.status);
      check('no session after (a)', 401, await sessionStatus());
      // (b) right challenge, wrong key
      const other = makeCredential();
      const badSig = buildAssertion({
        challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: other, userHandle: userHandleFor('alice'), counter: 1,
      });
      // id has to be alice's, otherwise the server rejects it as unknown (test 3)
      badSig.id = b64url(alice.credId); badSig.rawId = b64url(alice.credId);
      const r2 = await http('POST', '/api/login/verify', badSig);
      check('signature over issued challenge with wrong key rejected', 401, r2.status);
      check('no session after (b)', 401, await sessionStatus());
    },
  },
  2: {
    name: 'Replay',
    expected: 'Rejected with 400 because the challenge was already consumed',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      const opt = await http('POST', '/api/login/options', { username: 'alice' });
      const assertion = buildAssertion({
        challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 1,
      });
      const body = JSON.stringify(assertion);
      const ok = await http('POST', '/api/login/verify', JSON.parse(body));
      check('first login succeeds', 200, ok.status);
      check('session exists after login', 200, await sessionStatus());
      await http('POST', '/api/logout');
      check('session gone after logout', 401, await sessionStatus());
      const replay = await http('POST', '/api/login/verify', JSON.parse(body)); // same captured request again
      check('replayed login rejected', 400, replay.status);
      check('no session after replay', 401, await sessionStatus());
    },
  },
  3: {
    name: 'Wrong credential',
    expected: 'Both rejected with 401',
    async run() {
      const alice = await registerUser('alice');
      const bob = await registerUser('bob');
      jar.clear();
      // (a) credential id that was never registered
      const optA = await http('POST', '/api/login/options', { username: 'alice' });
      const stranger = makeCredential();
      const a = buildAssertion({
        challenge: optA.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: stranger, userHandle: userHandleFor('alice'), counter: 1,
      });
      const r1 = await http('POST', '/api/login/verify', a);
      check('unregistered credential rejected', 401, r1.status);
      check('no session after (a)', 401, await sessionStatus());
      // (b) alice's credential for a challenge issued to bob
      const optB = await http('POST', '/api/login/options', { username: 'bob' });
      const b = buildAssertion({
        challenge: optB.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 2,
      });
      const r2 = await http('POST', '/api/login/verify', b);
      check("another user's credential rejected", 401, r2.status);
      check('no session after (b)', 401, await sessionStatus());
    },
  },
  4: {
    name: 'Edited response',
    expected: 'Rejected each time (400 or 401); signature check fails',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      // fresh challenge per edit, so the edit is the only thing that changes
      for (const tamper of ['signature', 'clientData-origin', 'clientData-challenge', 'authData']) {
        const opt = await http('POST', '/api/login/options', { username: 'alice' });
        const edited = buildAssertion({
          challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID,
          cred: alice, userHandle: userHandleFor('alice'), counter: 1, tamper,
        });
        const r = await http('POST', '/api/login/verify', edited);
        const expect = tamper === 'clientData-challenge' ? 400 : 401;
        check(`edited ${tamper} rejected`, expect, r.status);
        check(`no session after editing ${tamper}`, 401, await sessionStatus());
      }
    },
  },
  5: {
    name: 'Expired challenge',
    expected: 'Rejected with 400 as expired',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      const opt = await http('POST', '/api/login/options', { username: 'alice' });
      // jump the clock 6 min instead of waiting — past the 5 min TTL
      nowMs += 6 * 60 * 1000;
      out('  (clock advanced +6 min, past the 5-minute challenge TTL)');
      const late = buildAssertion({
        challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 1,
      });
      const r = await http('POST', '/api/login/verify', late);
      check('expired challenge rejected', 400, r.status);
      check('no session after expired challenge', 401, await sessionStatus());
    },
  },
  6: {
    name: 'Wrong origin',
    expected: '(a) 401 from the verifier. (b) 403 Bad origin',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      // (a) response from a foreign origin
      const opt = await http('POST', '/api/login/options', { username: 'alice' });
      const foreign = buildAssertion({
        challenge: opt.json.challenge, origin: 'https://evil.example', rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 1,
      });
      const r1 = await http('POST', '/api/login/verify', foreign);
      check('response from foreign origin rejected', 401, r1.status);
      check('no session after (a)', 401, await sessionStatus());
      // (b) POST with a foreign Origin header
      const r2 = await http('POST', '/api/register/options', { username: 'mallory' }, { Origin: 'https://evil.example' });
      check('POST with foreign Origin header rejected', 403, r2.status);
    },
  },
  7: {
    name: 'Counter rollback',
    expected: 'Rejected with 401 as a possible cloned key',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      // pretend this key has already been used 100 times
      store.updateCredentialCounter(b64url(alice.credId), 100);
      out('  (stored counter set to 100)');
      const opt = await http('POST', '/api/login/options', { username: 'alice' });
      const rolledBack = buildAssertion({
        challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 5,
      });
      const r1 = await http('POST', '/api/login/verify', rolledBack);
      check('login with lower counter rejected', 401, r1.status);
      check('no session after rollback attempt', 401, await sessionStatus());
      // control: a counter that really went up is fine
      const opt2 = await http('POST', '/api/login/options', { username: 'alice' });
      const advanced = buildAssertion({
        challenge: opt2.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 101,
      });
      const r2 = await http('POST', '/api/login/verify', advanced);
      check('login with higher counter accepted (control)', 200, r2.status);
    },
  },
  8: {
    name: 'Session handling',
    expected: 'GET /api/session returns 401, then 200, then 401 again',
    async run() {
      check('no session before login', 401, await sessionStatus());
      const alice = await registerUser('alice');
      jar.clear();
      // failed login must not leave a session behind
      const opt = await http('POST', '/api/login/options', { username: 'alice' });
      const bad = buildAssertion({
        challenge: b64url(crypto.randomBytes(32)), origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 1,
      });
      const r1 = await http('POST', '/api/login/verify', bad);
      check('failed login rejected', 400, r1.status);
      check('still no session after failed login', 401, await sessionStatus());
      // good login does
      const ok = await loginUser('alice', alice, 1);
      check('good login succeeds', 200, ok.status);
      check('session works after good login', 200, await sessionStatus());
      // old cookie has to stop working after logout
      const oldCookie = jar.get('sid');
      await http('POST', '/api/logout');
      const stale = await fetch(`${ORIGIN}/api/session`, { headers: { Cookie: `sid=${oldCookie}`, Connection: 'close' } });
      out(`> GET /api/session (old cookie after logout)`);
      out(`< ${stale.status} ${trunc(await stale.text())}`);
      check('old cookie fails after logout', 401, stale.status);
    },
  },
  9: {
    name: 'Challenge type mix-up',
    expected: 'Both rejected with 400',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      // (a) registration challenge used at the login endpoint
      const regOpt = await http('POST', '/api/register/options', { username: 'carol' });
      const loginWithRegChallenge = buildAssertion({
        challenge: regOpt.json.challenge, origin: ORIGIN, rpId: RP_ID,
        cred: alice, userHandle: userHandleFor('alice'), counter: 1,
      });
      const r1 = await http('POST', '/api/login/verify', loginWithRegChallenge);
      check('registration challenge at login rejected', 400, r1.status);
      // (b) login challenge used at the registration endpoint
      const loginOpt = await http('POST', '/api/login/options', { username: 'alice' });
      const carolCred = makeCredential();
      const regWithLoginChallenge = buildRegistration({
        username: 'carol', challenge: loginOpt.json.challenge, origin: ORIGIN, rpId: RP_ID, cred: carolCred,
      });
      const r2 = await http('POST', '/api/register/verify', regWithLoginChallenge);
      check('login challenge at registration rejected', 400, r2.status);
      check('no session after mix-up', 401, await sessionStatus());
    },
  },
  10: {
    name: 'Duplicate registration',
    expected: 'Second attempt refused with 409',
    async run() {
      const alice = await registerUser('alice');
      jar.clear();
      const again = await http('POST', '/api/register/options', { username: 'alice' });
      check('second registration of same username refused', 409, again.status);
      // replaying a registration response fails too (challenge already used)
      const opt = await http('POST', '/api/register/options', { username: 'dave' });
      const daveCred = makeCredential();
      const reg = buildRegistration({
        username: 'dave', challenge: opt.json.challenge, origin: ORIGIN, rpId: RP_ID, cred: daveCred,
      });
      const first = await http('POST', '/api/register/verify', reg);
      check('first registration of dave succeeds', 200, first.status);
      jar.clear();
      const replay = await http('POST', '/api/register/verify', reg);
      check('replayed registration rejected', 400, replay.status);
    },
  },
  11: {
    name: 'Bad or missing fields',
    expected: 'A clear 4xx error, no crash, no session',
    async run() {
      const cases = [
        ['empty object to register/options', 'POST', '/api/register/options', {}],
        ['missing username to register/options', 'POST', '/api/register/options', { displayName: 'No Name' }],
        ['empty username', 'POST', '/api/register/options', { username: '' }],
        ['username with spaces/symbols', 'POST', '/api/register/options', { username: 'bad name!' }],
        ['username over 64 chars', 'POST', '/api/register/options', { username: 'a'.repeat(65) }],
        ['invalid JSON body', 'POST', '/api/login/options', '{bad json'],
        ['JSON number body', 'POST', '/api/login/options', '123'],
        ['JSON string body', 'POST', '/api/login/options', '"hello"'],
        ['JSON array body', 'POST', '/api/login/options', '[]'],
        ['oversized body (>64 KB)', 'POST', '/api/register/options', JSON.stringify({ username: 'x'.repeat(70 * 1024) })],
        ['empty object to login/verify', 'POST', '/api/login/verify', {}],
        ['missing fields to register/verify', 'POST', '/api/register/verify', { id: 'abc' }],
      ];
      for (const [label, method, p, body] of cases) {
        const r = await http(method, p, body);
        const is4xx = r.status >= 400 && r.status < 500;
        checks.push({ label, expected: '4xx', actual: String(r.status), pass: is4xx });
        out(`  [${is4xx ? 'PASS' : 'FAIL'}] ${label}: expected 4xx, got ${r.status}`);
      }
      // server has to still be up after all that
      check('server still responds after bad input', 401, await sessionStatus());
      check('no session created by bad input', 401, await sessionStatus());
    },
  },
};

const test = TESTS[TEST_NUM];
out(`WebAuthn security tests — Test ${TEST_NUM}: ${test.name}`);
out(`Repo: ${repoDir}`);
out(`Server: ${ORIGIN} (started by this script; real verifier, fresh store)`);
out(`Expected: ${test.expected}`);
out('');

let passed = false;
try {
  await test.run();
  passed = checks.every((c) => c.pass);
} catch (err) {
  out(`ERROR: ${err.message}`);
  checks.push({ label: 'test completed without error', expected: 'no error', actual: err.message, pass: false });
}

console.error = origError;
console.log = origLog;

out('');
out('Server log:');
if (serverLog.length === 0) out('  (no server log lines — this rejection never reaches a logging path)');
else for (const line of serverLog) out('  ' + line);

const nPass = checks.filter((c) => c.pass).length;
out('');
out(`RESULT: ${passed ? 'PASS' : 'FAIL'} — Test ${TEST_NUM} ${test.name} (${nPass}/${checks.length} checks)`);
out(`Expected: ${test.expected}`);

const result = {
  test: TEST_NUM,
  name: test.name,
  expected: test.expected,
  pass: passed,
  checks,
  serverLog,
};
fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
out(`Wrote ${outFile}`);

// don't call process.exit() — on windows it crashes node with a libuv
// assertion while fetch is still cleaning up. set the exit code and let
// node shut down on its own; the timer is just a fallback if something
// keeps the loop alive.
if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
process.exitCode = passed ? 0 : 1;
const fallback = setTimeout(() => process.exit(process.exitCode), 1000);
fallback.unref();
