'use strict';
// Private synthetic parser fixtures only; no DB, provider or workflow.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { readRows, LIMITS } = require('./bounded-profile-rows');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'helmut-bounded-rows-'));
fs.chmodSync(tmp, 0o700); let cases = 0, serial = 0;
const fixture = bytes => {
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), p = path.join(tmp, 'input-' + serial++);
  fs.writeFileSync(p, b, { mode: 0o600, flag: 'wx' });
  return { path: p, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') };
};
const rows = Array.from({ length: 500 }, (_, i) => ({ profile: { id: 'synthetic-' + i },
  sources: { documents: [{ text: 'Gemeinsame unveränderte Fakten. '.repeat(5) }], knowledgeObjects: [] },
  briefingEingabe: { version: 1, index: i, nested: [{ quoted: 'ä😀\\"[]{}\\\\\n', value: i }] } }));
function test(name, fn) { fn(); cases++; console.log('PASS ' + name); }
function rejects(text, pattern) { assert.throws(() => readRows(fixture(text)), pattern); }
try {
  test('all500 values/order/Unicode/escapes equal original JSON.parse; shared values immutable', () => {
    const text = ' \r\n' + JSON.stringify(rows) + '\t ', decoded = readRows(fixture(text));
    assert.deepStrictEqual(decoded, JSON.parse(text)); assert.equal(JSON.stringify(decoded), JSON.stringify(rows));
    assert.strictEqual(decoded[0].sources, decoded[499].sources);
    assert.notStrictEqual(decoded[0].profile, decoded[1].profile);
    assert(Object.isFrozen(decoded) && Object.isFrozen(decoded[0]) && Object.isFrozen(decoded[0].sources.documents[0]));
    assert.throws(() => { decoded[0].sources.documents[0].text = 'mutation'; }, TypeError);
    assert.throws(() => decoded.push({}), TypeError); assert.equal(decoded[499].profile.id, 'synthetic-499');
  });
  test('UTF8 and escaped framing survive chunk boundaries', () => {
    const copy = structuredClone(rows); copy[0].padding = 'ä😀{}[]\\"'.repeat(12000);
    const text = JSON.stringify(copy); assert(Buffer.byteLength(text) > LIMITS.chunkBytes);
    assert.deepStrictEqual(readRows(fixture(text)), copy);
  });
  test('exact own __proto__ key is data and never pollutes prototypes', () => {
    const text = JSON.stringify(rows).replace('"profile":', '"__proto__":{"polluted":"fixture-only"},"profile":');
    const d = readRows(fixture(text)); assert(Object.hasOwn(d[0], '__proto__'));
    assert.strictEqual(Object.getPrototypeOf(d[0]), Object.prototype);
    assert.equal({}.polluted, undefined); assert.deepStrictEqual(d, JSON.parse(text));
  });
  test('wrong SHA and byte count rejected before return', () => {
    const p = fixture(JSON.stringify(rows)); assert.throws(() => readRows({ ...p, sha256: '0'.repeat(64) }), /sha256/);
    assert.throws(() => readRows({ ...p, bytes: p.bytes + 1 }), /file/);
  });
  test('499/501/nonobject/nonarray rows refused', () => {
    for (const value of [rows.slice(0, 499), [...rows, {}], { rows }, [...rows.slice(0, 499), []], []])
      rejects(JSON.stringify(value), /bounded-profile-rows/);
  });
  test('trailing comma, trailer, truncation and malformed object rejected', () => {
    const text = JSON.stringify(rows);
    for (const bad of [text.slice(0, -1) + ',]', text + 'x', text.slice(0, -2), text.replace('"profile":', '"profile"=')])
      rejects(bad);
  });
  test('invalid UTF8 and BOM rejected', () => {
    const good = Buffer.from(JSON.stringify(rows)), i = good.indexOf(Buffer.from('synthetic-0'));
    const bad = Buffer.from(good); bad[i] = 0xff; rejects(bad);
    rejects(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), good]));
  });
  test('nesting and single-row byte bounds remain mandatory', () => {
    const copy = structuredClone(rows); let nested = {};
    for (let i = 0; i < LIMITS.depth + 1; i++) nested = { nested };
    copy[0].nested = nested; rejects(JSON.stringify(copy), /depth/);
    copy[0] = { padding: 'x'.repeat(LIMITS.rowBytes) }; rejects(JSON.stringify(copy), /row-size/);
  });
  test('canonical regular file only; symlink and unsafe pin rejected', () => {
    const p = fixture(JSON.stringify(rows)), link = path.join(tmp, 'link'); fs.symlinkSync(p.path, link);
    assert.throws(() => readRows({ ...p, path: link }));
    for (const bad of [{ ...p, extra: true }, { ...p, path: './relative' }, { ...p, bytes: LIMITS.fileBytes + 1 }])
      assert.throws(() => readRows(bad));
    let getter = false; const bad = { bytes: p.bytes, sha256: p.sha256 };
    Object.defineProperty(bad, 'path', { enumerable: true, get() { getter = true; return p.path; } });
    assert.throws(() => readRows(bad), /pin/); assert.equal(getter, false);
  });
  test('same FD timestamp drift detected despite unchanged bytes and valid SHA', () => {
    const p = fixture(JSON.stringify(rows)), native = fs.readSync; let changed = false;
    fs.readSync = function (...args) {
      const n = native.apply(this, args);
      if (!changed && n) { changed = true; fs.utimesSync(p.path, new Date(0), new Date(0)); }
      return n;
    };
    try { assert.throws(() => readRows(p), /final-drift/); } finally { fs.readSync = native; }
    assert(changed);
  });
  test('owned file descriptor closes on parser rejection', () => {
    const p = fixture(JSON.stringify(rows.slice(0, 499))), native = fs.closeSync; let closed = 0;
    fs.closeSync = function (...args) { closed++; return native.apply(this, args); };
    try { assert.throws(() => readRows(p), /complete/); } finally { fs.closeSync = native; }
    assert.equal(closed, 1);
  });
  test('forced index collisions still require exact values and preserve all500 rows', () => {
    const p = fixture(JSON.stringify(rows)), native = crypto.createHash;
    crypto.createHash = function (...args) {
      const hash = native.apply(this, args); let onlyStrings = true;
      return { update(value, ...rest) { if (typeof value !== 'string') onlyStrings = false;
        hash.update(value, ...rest); return this; },
      digest(format) { const actual = hash.digest(format); return onlyStrings ? '0'.repeat(64) : actual; } };
    };
    try { assert.deepStrictEqual(readRows(p), rows); } finally { crypto.createHash = native; }
  });
  console.log(JSON.stringify({ scope: 'BOUNDED_EXACT_ROWS_PARSER_ONLY', cases, pass: true,
    sourceWrites: 0, databaseCalls: 0, profileActivations: 0, full500Runs: 0, providerCalls: 0 }));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
