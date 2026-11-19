import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { openDatabase } from '../src/database.js';
test('users, credentials, counters, removal, challenges and sessions', () => {
  const store = new Store(openDatabase(':memory:'));
  try {
    const user = store.createUser({username:'alice'});
    assert.equal(store.getUser('alice').id,user.id);
    store.createCredential({id:'first',userId:user.id,publicKey:new Uint8Array([1,2,3]),counter:0});
    store.createCredential({id:'second',userId:user.id,publicKey:new Uint8Array([4,5]),counter:1});
    assert.deepEqual([...store.getCredential('first').publicKey],[1,2,3]);
    assert.equal(store.getUser('alice').credentialIds.length,2);
    store.updateCredentialCounter('second',2);
    assert.throws(()=>store.updateCredentialCounter('second',1));
    assert.equal(store.renameCredential(user.id,'first','Laptop'),true);
    assert.equal(store.listCredentials(user.id)[0].nickname,'Laptop');
    assert.equal(store.removeCredential(user.id,'first'),'removed');
    assert.equal(store.removeCredential(user.id,'second'),'account-deleted');
    assert.equal(store.getCredential('second'),undefined);
    assert.equal(store.getUser('alice'),undefined);
    const userAgain = store.createUser({username:'alice'});
    assert.ok(userAgain.id);
    const c=store.createChallenge({type:'authentication',username:'alice',expiresAt:Date.now()+10000});
    assert.equal(store.takeChallenge(c).username,'alice');
    assert.equal(store.takeChallenge(c),undefined);
    const sid=store.createSession({userId:userAgain.id,expiresAt:Date.now()+10000});
    assert.equal(store.getSession(sid).username,'alice');
    store.createCredential({id:'new-key',userId:userAgain.id,publicKey:new Uint8Array([9])});
    assert.equal(store.removeCredential(userAgain.id,'unknown'),'missing');
    assert.equal(store.getCredential('new-key').id,'new-key');
    store.deleteSession(sid);
    assert.equal(store.getSession(sid),undefined);
  } finally { store.close(); }
});

test('comments: saved with author, newest first, stored verbatim, deleted with the account', () => {
  const store = new Store(openDatabase(':memory:'));
  try {
    const alice = store.createUser({username:'alice'});
    const bob = store.createUser({username:'bob'});
    const first = store.addComment({userId:alice.id,text:'Hello'});
    assert.equal(first.text,'Hello');
    assert.ok(first.createdAt > 0);
    store.addComment({userId:bob.id,text:'<img src=x onerror=alert(1)>'});
    assert.deepEqual(store.listComments().map(c=>[c.username,c.text]),
      [['bob','<img src=x onerror=alert(1)>'],['alice','Hello']]);
    assert.equal(store.listComments(1).length,1);
    store.createCredential({id:'bob-key',userId:bob.id,publicKey:new Uint8Array([1])});
    assert.equal(store.removeCredential(bob.id,'bob-key'),'account-deleted');
    assert.deepEqual(store.listComments().map(c=>c.username),['alice']);
  } finally { store.close(); }
});
