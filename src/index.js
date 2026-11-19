import { createServer } from './server.js';
import { verifier } from './verifier.js';
import { Store } from './store.js';
const store = new Store();
store.cleanup();
const port = Number(process.env.PORT ?? 3000);
const server = createServer({ verifier, store,
  rpID: process.env.RP_ID ?? 'localhost',
  origin: process.env.ORIGIN ?? `http://localhost:${port}`,
  rpName: process.env.RP_NAME ?? 'WebAuthn Demo' });
server.listen(port, () => console.log(`Listening on http://localhost:${port}`));

// On Ctrl+C / kill, close the database cleanly so SQLite merges the -wal file
// back into webauthn.sqlite (otherwise that only happens on the next start).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    store.close();
    console.log('Database closed. Server stopped.');
    process.exit(0);
  });
}
