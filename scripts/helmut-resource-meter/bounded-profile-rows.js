'use strict';
// Inert, local-only exact-value loader. No admission, execution or IO on import.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { TextDecoder, isDeepStrictEqual } = require('node:util');
const MODE = 'bounded-exact-profile-rows-v1';
const LIMITS = Object.freeze({ rows: 500, fileBytes: 128 * 1024 ** 2,
  rowBytes: 4 * 1024 ** 2, depth: 128, chunkBytes: 65536,
  internKeyBytes: 8 * 1024 ** 2, internEntries: 20000, minEntryBytes: 64,
  maxEntryBytes: 256 * 1024 });
function need(value, reason) { if (!value) throw Error('bounded-profile-rows-' + reason); }
const whitespace = b => b === 32 || b === 9 || b === 10 || b === 13;
function sameFile(a, b) {
  return b.isFile() && ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]);
}
function interner() {
  const values = new Map(); let keyBytes = 0;
  function reuse(value, text, kind) {
    const bytes = Buffer.byteLength(text);
    if (bytes < LIMITS.minEntryBytes || bytes > LIMITS.maxEntryBytes) return value;
    // Retain fixed-width index keys, never complete serialized unique parents.
    // The hash is an index ONLY: a collision must still pass exact equality.
    const key = kind + ':' + crypto.createHash('sha256').update(text).digest('hex');
    const previous = values.get(key);
    if (previous !== undefined) {
      if (kind === 's' ? previous.value === value
        : JSON.stringify(previous.value) === text && isDeepStrictEqual(previous.value, value)) return previous.value;
      return value;
    }
    const cost = Buffer.byteLength(key);
    if (values.size < LIMITS.internEntries && keyBytes + cost <= LIMITS.internKeyBytes) {
      values.set(key, { value }); keyBytes += cost;
    }
    return value;
  }
  function visit(value) {
    if (typeof value === 'string') return reuse(value, value, 's');
    if (value === null || typeof value !== 'object') return value;
    // All values originate in JSON.parse; only own data properties exist.
    // defineProperty also preserves an own '__proto__' as data.
    for (const key of Object.keys(value)) Object.defineProperty(value, key,
      { value: visit(value[key]), writable: true, enumerable: true, configurable: true });
    Object.freeze(value);
    return reuse(value, JSON.stringify(value), 'o');
  }
  return visit;
}
function readRows(pin) {
  need(pin !== null && typeof pin === 'object', 'pin');
  const descriptors = Object.getOwnPropertyDescriptors(pin);
  need(Object.keys(descriptors).sort().join('|') === 'bytes|path|sha256'
    && Object.values(descriptors).every(d => Object.hasOwn(d, 'value')), 'pin');
  const file = descriptors.path.value, bytes = descriptors.bytes.value, sha256 = descriptors.sha256.value;
  need(typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file
    && fs.realpathSync(file) === file && Number.isSafeInteger(bytes) && bytes > 0
    && bytes <= LIMITS.fileBytes && typeof sha256 === 'string' && /^[a-f0-9]{64}$/.test(sha256), 'pin');
  const before = fs.lstatSync(file, { bigint: true });
  need(before.isFile() && !before.isSymbolicLink() && before.size === BigInt(bytes), 'file');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    need(sameFile(before, fs.fstatSync(fd, { bigint: true })), 'open-drift');
    const rows = [], intern = interner(), decoder = new TextDecoder('utf-8', { fatal: true });
    const hash = crypto.createHash('sha256'), chunk = Buffer.allocUnsafe(LIMITS.chunkBytes);
    let total = 0, state = 'start', stack = [], quoted = false, escaped = false;
    let parts = [], rowBytes = 0;
    function append(buffer) {
      rowBytes += buffer.length; need(rowBytes <= LIMITS.rowBytes, 'row-size');
      parts.push(Buffer.from(buffer)); // The input chunk is reused after scanning.
    }
    function finishRow() {
      const row = JSON.parse(decoder.decode(Buffer.concat(parts, rowBytes)));
      need(row !== null && typeof row === 'object' && !Array.isArray(row), 'row-object');
      need(rows.length < LIMITS.rows, 'row-count');
      rows.push(intern(row)); parts = []; rowBytes = 0;
    }
    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (!n) break;
      total += n; need(total <= bytes, 'byte-count'); hash.update(chunk.subarray(0, n));
      let segment = state === 'row' ? 0 : -1;
      for (let i = 0; i < n; i++) {
        const b = chunk[i];
        if (state === 'row') {
          if (quoted) {
            if (escaped) escaped = false;
            else if (b === 92) escaped = true;
            else if (b === 34) quoted = false;
          } else if (b === 34) quoted = true;
          else if (b === 123 || b === 91) {
            stack.push(b); need(stack.length + 1 <= LIMITS.depth, 'depth');
          } else if (b === 125 || b === 93) {
            need(stack.pop() === (b === 125 ? 123 : 91), 'brackets');
            if (!stack.length) {
              append(chunk.subarray(segment, i + 1)); finishRow();
              state = 'separator'; segment = -1;
            }
          }
          continue;
        }
        if (whitespace(b)) continue;
        if (state === 'start') { need(b === 91, 'array'); state = 'first'; }
        else if (state === 'first' && b === 93) state = 'end';
        else if (state === 'first' || state === 'next') {
          need(b === 123, 'row-object'); state = 'row'; stack = [123];
          quoted = false; escaped = false; segment = i;
        } else if (state === 'separator') {
          need(b === 44 || b === 93, 'separator'); state = b === 44 ? 'next' : 'end';
        } else need(false, 'trailer');
      }
      if (state === 'row') append(chunk.subarray(segment, n));
    }
    need(total === bytes && state === 'end' && rows.length === LIMITS.rows, 'complete');
    need(hash.digest('hex') === sha256, 'sha256');
    need(fs.realpathSync(file) === file && sameFile(before, fs.fstatSync(fd, { bigint: true }))
      && sameFile(before, fs.lstatSync(file, { bigint: true })), 'final-drift');
    return Object.freeze(rows);
  } finally { fs.closeSync(fd); }
}
module.exports = Object.freeze({ MODE, LIMITS, readRows });
