import { randomBytes, createHash } from 'node:crypto';
import { openDatabase } from './database.js';
const token = (n = 32) => randomBytes(n).toString('base64url');
const hash = sid => createHash('sha256').update(sid).digest('hex');
const userRow = row => row && ({ id: row.id, username: row.username, displayName: row.display_name,
  credentialIds: [], createdAt: row.created_at });
export class Store {
  constructor(db = openDatabase()) { this.db = db; }
  hasUser(username) { return !!this.db.prepare('SELECT 1 FROM users WHERE username=?').get(username); }
  getUser(username) { return this._user(this.db.prepare('SELECT * FROM users WHERE username=?').get(username)); }
  getUserById(id) { return this._user(this.db.prepare('SELECT * FROM users WHERE id=?').get(id)); }
  _user(row) { const u = userRow(row); if (u) u.credentialIds = this.db.prepare('SELECT id FROM credentials WHERE user_id=?').all(u.id).map(r=>r.id); return u; }
  createUser({username, displayName, credentialId}) {
    const id = token(16), now = Date.now();
    this.db.prepare('INSERT INTO users(id,username,display_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,username,displayName || username,now,now);
    return this.getUserById(id);
  }
  hasCredential(id) { return !!this.db.prepare('SELECT 1 FROM credentials WHERE id=?').get(id); }
  getCredential(id) {
    const r = this.db.prepare('SELECT * FROM credentials WHERE id=?').get(id);
    return r && { id:r.id, userId:r.user_id, publicKey:new Uint8Array(r.public_key), counter:r.counter,
      transports:JSON.parse(r.transports), deviceType:r.device_type, backedUp:r.backed_up===null?null:!!r.backed_up,
      nickname:r.nickname, createdAt:r.created_at, lastUsedAt:r.last_used_at };
  }
  createCredential({id,userId,publicKey,counter=0,transports=[],deviceType=null,backedUp=null,nickname='Passkey'}) {
    if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid counter');
    this.db.prepare(`INSERT INTO credentials(id,user_id,public_key,counter,transports,device_type,backed_up,nickname,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(id,userId,Buffer.from(publicKey),counter,JSON.stringify(transports || []),deviceType,
      backedUp === null ? null : Number(backedUp),nickname,Date.now());
    return this.getCredential(id);
  }
  updateCredentialCounter(id,counter) {
    if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid counter');
    const result=this.db.prepare('UPDATE credentials SET counter=?,last_used_at=? WHERE id=? AND (counter=0 AND ?=0 OR counter<?)').run(counter,Date.now(),id,counter,counter);
    if (!result.changes) throw new Error('Unknown credential or counter rollback');
  }
  listCredentials(userId) { return this.db.prepare(`SELECT id,nickname,transports,device_type,backed_up,created_at,last_used_at
    FROM credentials WHERE user_id=? ORDER BY created_at`).all(userId).map(r=>({id:r.id,nickname:r.nickname,
    transports:JSON.parse(r.transports),deviceType:r.device_type,backedUp:r.backed_up===null?null:!!r.backed_up,
    createdAt:r.created_at,lastUsedAt:r.last_used_at})); }
  renameCredential(userId,id,nickname) { return !!this.db.prepare('UPDATE credentials SET nickname=? WHERE user_id=? AND id=?').run(nickname,userId,id).changes; }
  removeCredential(userId,id) {
    // Removing the final credential also removes the account and its sessions.
    // Otherwise the username would remain reserved with no way to sign in.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare('SELECT 1 FROM credentials WHERE id=? AND user_id=?').get(id,userId);
      if (!existing) { this.db.exec('ROLLBACK'); return 'missing'; }
      const count = this.db.prepare('SELECT COUNT(*) AS n FROM credentials WHERE user_id=?').get(userId).n;
      if (count === 1) {
        const user = this.db.prepare('SELECT username FROM users WHERE id=?').get(userId);
        this.db.prepare('DELETE FROM credentials WHERE id=? AND user_id=?').run(id,userId);
        this.db.prepare('DELETE FROM challenges WHERE username=?').run(user.username);
        this.db.prepare('DELETE FROM users WHERE id=?').run(userId);
        this.db.exec('COMMIT');
        return 'account-deleted';
      }
      this.db.prepare('DELETE FROM credentials WHERE id=? AND user_id=?').run(id,userId);
      this.db.exec('COMMIT');
      return 'removed';
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  createChallenge({type,username,expiresAt}) {
    const challenge=token(); this.db.prepare('INSERT INTO challenges VALUES(?,?,?,?)').run(challenge,type,username ?? null,expiresAt); return challenge;
  }
  takeChallenge(challenge) {
    if (typeof challenge !== 'string') return undefined;
    const row=this.db.prepare('DELETE FROM challenges WHERE challenge=? RETURNING type,username,expires_at').get(challenge);
    return row && {type:row.type,username:row.username,expiresAt:row.expires_at};
  }
  createSession({userId,expiresAt}) { const sid=token(); this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(sid),userId,expiresAt); return sid; }
  getSession(sid) {
    if (typeof sid !== 'string') return undefined;
    const r=this.db.prepare(`SELECT s.user_id,s.expires_at,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.sid_hash=?`).get(hash(sid));
    return r && {userId:r.user_id,username:r.username,expiresAt:r.expires_at};
  }
  deleteSession(sid) { this.db.prepare('DELETE FROM sessions WHERE sid_hash=?').run(hash(sid)); }
  cleanup() { const now=Date.now(); this.db.prepare('DELETE FROM challenges WHERE expires_at<?').run(now); this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now); }
  close() { this.db.close(); }
}
