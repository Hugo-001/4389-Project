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
