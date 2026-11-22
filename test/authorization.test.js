import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { openDatabase } from '../src/database.js';

// Authorization evidence: a signed-in user can only rename or remove their OWN passkeys.
// renameCredential/removeCredential are always called with session.userId (src/server.js),
// so this checks that the WHERE user_id = ? AND id = ? scoping in src/store.js holds.
test('authorization: one user cannot rename or remove another user\'s passkey', () => {
  const store = new Store(openDatabase(':memory:'));
  try {
    const alice = store.createUser({ username: 'alice' });
    const bob = store.createUser({ username: 'bob' });
    store.createCredential({ id: 'alice-key', userId: alice.id, publicKey: new Uint8Array([1]) });
    store.createCredential({ id: 'bob-key', userId: bob.id, publicKey: new Uint8Array([2]) });

    // Bob tries to rename Alice's passkey -> no row changed (server returns 404)
    assert.equal(store.renameCredential(bob.id, 'alice-key', 'pwned'), false);
    assert.equal(store.getCredential('alice-key').nickname, 'Passkey');

    // Bob tries to remove Alice's passkey -> 'missing' (server returns 404)
    assert.equal(store.removeCredential(bob.id, 'alice-key'), 'missing');
    assert.ok(store.getCredential('alice-key'), "Alice's passkey still exists");
    assert.ok(store.getUser('alice'), "Alice's account still exists");

    // Control: Alice can rename her own passkey
    assert.equal(store.renameCredential(alice.id, 'alice-key', 'Laptop'), true);
    assert.equal(store.getCredential('alice-key').nickname, 'Laptop');

    // Bob's list never includes Alice's passkey
    assert.deepEqual(store.listCredentials(bob.id).map(c => c.id), ['bob-key']);
  } finally { store.close(); }
});