'use strict';
// Fake OpenPGP/DOM only: no keys, browser network, storage or real crypto proof.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto, createHash } = require('node:crypto');
const source = fs.readFileSync(__dirname + '/receiver-browser.js', 'utf8');
const recipient = '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC';
const dcfFingerprint = 'DCFD605ED28EEACA9B826105E769DE07A68BA8E4';
const pass = 'fictional-original-backup-passphrase-long-enough';
const phrase = 'fictional-receiver-passphrase';
const hash = value => createHash('sha256').update(value).digest('hex');

async function scenario(options = {}) {
  const dcfCipher = new Uint8Array(569).fill(1), wrapperCipher = new Uint8Array(3298).fill(2);
  const plainDcf = new Uint8Array(20).fill(42);
  const rawReceiver = options.armored ? Buffer.from('-----BEGIN PGP PRIVATE KEY BLOCK-----\nfictional-only\n-----END PGP PRIVATE KEY BLOCK-----') : new Uint8Array([43, 44, 45]);
  const encoded = Buffer.from(rawReceiver).toString('base64');
  const wrapper = { schema: 'helmut-w15-receiver-key-recovery/1', protectedSecretKeyBase64: encoded,
    secretKeyPassphraseBase64: Buffer.from(options.badPhrase ? 'bad\n' : phrase).toString('base64') };
  if (options.badSchema) wrapper.schema = 'wrong';
  const plainWrapper = new TextEncoder().encode(JSON.stringify(wrapper));
  const elements = {}, urls = new Map(), revoked = [], cleared = [], calls = [];
  for (const id of ['passphrase', 'check', 'status', 'key-download', 'phrase-download', 'report-download']) {
    elements[id] = { disabled: true, hidden: true, value: '', textContent: '',
      addEventListener(name, callback) { this[name] = callback; }, removeAttribute(name) { delete this[name]; } };
  }
  const key = (name, fingerprint, decrypted) => ({ subkeys: [], getFingerprint: () => fingerprint,
    isDecrypted: () => decrypted, toPublic: () => ({ public: true }),
    keyPacket: { clearPrivateParams: () => cleared.push(name) } });
  const dcf = key('dcf', dcfFingerprint, true), protectedKey = key('protected', options.wrongFingerprint ? 'A'.repeat(40) : recipient, false);
  const unlocked = key('unlocked', recipient, true);
  const library = {
    async readMessage({ binaryMessage, config }) {
      assert.equal(config.allowUnauthenticatedMessages, false); assert.equal(config.allowUnauthenticatedStream, false);
      return binaryMessage;
    },
    async decrypt({ message, passwords, decryptionKeys }) {
      if (message.length === 569) { calls.push('dcf'); assert.equal(passwords, pass); if (options.badBackup) throw Error('PRIVATE-MUST-NOT-LEAK'); return { data: plainDcf }; }
      if (message.length === 3298) { calls.push('wrapper'); assert.equal(decryptionKeys, dcf); return { data: plainWrapper }; }
      calls.push('public-control'); assert.equal(decryptionKeys, unlocked);
      return { data: options.badControl ? new Uint8Array([0]) : new TextEncoder().encode('HELMUT W15 existing 7E recipient control only 20261029\n') };
    },
    async readPrivateKey(args) {
      if (args.binaryKey?.[0] === 42) return dcf;
      if (options.armored) assert.ok(args.armoredKey.startsWith('-----BEGIN PGP PRIVATE KEY BLOCK-----'));
      else assert.equal(args.binaryKey[0], 43);
      calls.push('receiver-read'); return protectedKey;
    },
    async decryptKey({ privateKey, passphrase }) { assert.equal(privateKey, protectedKey); assert.equal(passphrase, phrase); return unlocked; },
    async createMessage({ binary }) { return binary; },
    async encrypt() { return new Uint8Array([9, 8, 7]); }
  };
  let pagehide;
  const context = vm.createContext({ document: { getElementById: id => elements[id] },
    location: { protocol: options.protocol || 'file:' }, crypto: webcrypto, openpgp: library,
    TextEncoder, TextDecoder, Uint8Array, atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    Blob: class { constructor(parts) { this.content = parts.join(''); } },
    URL: { createObjectURL(blob) { const id = 'blob:' + urls.size + '-' + revoked.length; urls.set(id, blob.content); return id; },
      revokeObjectURL(id) { revoked.push(id); urls.delete(id); } },
    addEventListener(name, callback) { assert.equal(name, 'pagehide'); pagehide = callback; },
    fetch() { throw Error('network forbidden'); }, localStorage: new Proxy({}, { get() { throw Error('storage forbidden'); } }) });
  vm.runInContext(source, context);
  const settings = { dcfCipherBase64: Buffer.from(dcfCipher).toString('base64'), dcfCipherSHA256: hash(dcfCipher),
    dcfExportSHA256: hash(plainDcf), dcfFingerprint, wrapperBase64: Buffer.from(wrapperCipher).toString('base64'), wrapperSHA256: hash(wrapperCipher) };
  context.startReceiverBrowser(settings);
  if (options.protocol) { assert.equal(elements.check.disabled, true); return; }
  elements.passphrase.value = pass;
  await elements.check.click();
  const success = !(options.badBackup || options.badSchema || options.badPhrase || options.wrongFingerprint || options.badControl);
  assert.equal(elements['key-download'].hidden, !success);
  assert.equal(elements['phrase-download'].hidden, !success);
  for (const secret of [pass, phrase, encoded, 'PRIVATE-MUST-NOT-LEAK']) assert.ok(!elements.status.textContent.includes(secret));
  assert.equal(elements.passphrase.value, '');
  if (!options.badBackup) { assert.ok(plainDcf.every(value => value === 0)); assert.ok(cleared.includes('dcf')); }
  if (success) {
    assert.equal(urls.get(elements['key-download'].href), encoded);
    assert.equal(urls.get(elements['phrase-download'].href), phrase);
    const report = JSON.parse(urls.get(elements['report-download'].href));
    assert.equal(report.recipientFingerprint, recipient); assert.equal(report.executionAuthority, false);
    assert.ok(!JSON.stringify(report).includes(phrase)); assert.equal(calls.filter(item => item === 'public-control').length, 1);
    assert.ok(cleared.includes('protected') && cleared.includes('unlocked'));
    // A new failure must revoke every previous private URL and expose no files.
    elements.passphrase.value = 'bad'; await elements.check.click();
    assert.equal(urls.size, 0); assert.equal(revoked.length, 3);
    assert.equal(elements['key-download'].hidden, true);
    pagehide();
  } else assert.equal(urls.size, 0);
}

(async () => {
  for (const options of [{}, { armored: true }, { badBackup: true }, { badSchema: true }, { badPhrase: true },
    { wrongFingerprint: true }, { badControl: true }, { protocol: 'https:' }]) await scenario(options);
  assert.ok(!/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|WebSocket)\b/.test(source));
  assert.ok(!/generateKey|challenge_base64|exportSecret/.test(source));
  process.stdout.write('PASS 8 fake browser receiver scenarios\n');
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
