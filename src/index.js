// ============================================================================
// PLACEHOLDER: (app wiring / front end).
// Minimal launcher so server.js can be run. It reads settings from env vars and starts it.
//
// TODO: import the real verifier and storage and pass them in, e.g.
//   createServer({ verifier: realVerifier, store: realStore, rpID, origin })
// Also serve the front-end files here if the team wants one server for everything.
// ============================================================================
import { createServer } from './server.js';

const server = createServer({
  rpID: process.env.RP_ID ?? 'localhost',
  origin: process.env.ORIGIN ?? `http://localhost:3000`,
  rpName: process.env.RP_NAME ?? 'WebAuthn Demo',
});
server.listen(3000, () => console.log(`Listening on :3000`));
