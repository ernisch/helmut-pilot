'use strict';
// Eigener Aufnahmekontext: keine erfundene Position in einer 500er Auswahl.
const C = require('node:crypto'), Z = require('node:zlib'), A = require('node:assert/strict');
const { publicKey } = require('../privater-nachweis-transport');
const MAX = 32 * 1024 * 1024;
function context(c) {
  A(['b055-eingabeaufnahme-v1', 'b055-einzelabschluss-v1'].includes(c?.purpose));
  A.match(c.runId, /^\d{5,20}$/);
  A.match(c.workflowCommit, /^[a-f0-9]{40}$/);
  A.match(c.productionCommit, /^[a-f0-9]{40}$/);
  return { purpose:c.purpose, runId:c.runId, workflowCommit:c.workflowCommit, productionCommit:c.productionCommit };
}
function encrypt(payload, recipient, ctx) {
  const p = publicKey(recipient), raw = Buffer.from(JSON.stringify(payload));
  A(raw.length <= MAX);
  const meta = { version:1, recipient:p.fingerprint, ...context(ctx) };
  const key = C.randomBytes(32), nonce = C.randomBytes(12);
  try {
    const cipher = C.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(JSON.stringify(meta)));
    const data = Buffer.concat([cipher.update(Z.gzipSync(raw)), cipher.final()]);
    return { meta, key:C.publicEncrypt({key:p.key,oaepHash:'sha256'},key).toString('base64'),
      nonce:nonce.toString('base64'), tag:cipher.getAuthTag().toString('base64'),
      data:data.toString('base64').match(/.{1,4096}/g) };
  } finally { key.fill(0); }
}
function decrypt(e, pem, ctx) {
  const privateKey = C.createPrivateKey(pem);
  const recipient = C.createPublicKey(privateKey).export({format:'der',type:'spki'}).toString('base64');
  const meta = { version:1, recipient:publicKey(recipient).fingerprint, ...context(ctx) };
  A.deepEqual(e?.meta,meta);
  const bytes = (s, n) => {
    A(typeof s === 'string' && s.length <= MAX * 2 && /^[A-Za-z0-9+/]+={0,2}$/.test(s));
    const b = Buffer.from(s,'base64'); A.equal(b.toString('base64'),s); if(n) A.equal(b.length,n); return b;
  };
  A(Array.isArray(e.data) && e.data.length > 0 && e.data.length <= 12000);
  A(e.data.every(s => typeof s === 'string' && s.length > 0 && s.length <= 4096));
  const key = C.privateDecrypt({key:privateKey,oaepHash:'sha256'},bytes(e.key,384)); A.equal(key.length,32);
  try {
    const cipher = C.createDecipheriv('aes-256-gcm',key,bytes(e.nonce,12));
    cipher.setAAD(Buffer.from(JSON.stringify(meta))); cipher.setAuthTag(bytes(e.tag,16));
    const packed = Buffer.concat([cipher.update(bytes(e.data.join(''))),cipher.final()]);
    return JSON.parse(Z.gunzipSync(packed,{maxOutputLength:MAX}).toString('utf8'));
  } finally { key.fill(0); }
}
module.exports = { encrypt, decrypt, context };
