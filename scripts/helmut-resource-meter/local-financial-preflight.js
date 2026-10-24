'use strict';
// Read-only local financial preflight; never writes budget, book, auth or flag.
// Success is READ-ONLY_LOCAL_FINANCIAL_PROJECTION_VALID only, never GO or Production proof.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const K = require('../../lib/helmut/testkosten-budget.js');
const EU = require('../../lib/helmut/synthetik-500-eu-service-contract.js');
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^[a-f0-9]{64}$/;
const AUTH_SHA = HEX;
const STAGE = /^\/workspace\/helmut-parallel-20261015\/wave20-resource-integration\/attempt-[a-f0-9]{12}\/native-end-preparation\/prepare-current-local-runtime\.js$/;
const SAFE = /^[a-zA-Z0-9_-]{1,100}$/;
const MODAY = 86400000;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const canon = o => JSON.stringify(o);
const iso = d => typeof d === 'string' && DAY.test(d) && Number.isFinite(Date.parse(d))
  && new Date(d).toISOString().slice(0, 10) === d;
const safe = (v, f) => SAFE.test(String(v == null ? '' : v)) ? String(v) : f;
function result(o) {
  return { pass: o.pass === true,
    scope: o.pass === true ? 'READ-ONLY_LOCAL_FINANCIAL_PROJECTION_VALID' : null,
    code: o.pass === true ? null : safe(o.code, 'financial-preflight-rejected'),
    reason: o.pass === true ? null : safe(o.reason, 'financial-preflight-rejected'),
    targetDay: iso(o.targetDay) ? o.targetDay : null,
    sourceBookCount: Number.isSafeInteger(o.sourceBookCount) && o.sourceBookCount >= 0 ? o.sourceBookCount : null,
    missingDays: Array.isArray(o.missingDays) ? o.missingDays.filter(iso).slice(0, 31) : [],
    originalAuthUnchanged: o.originalAuthUnchanged === true };
}
function loadPinned(pin) {
  if (!pin || typeof pin !== 'object' || typeof pin.path !== 'string' || !HEX.test(String(pin.sha256 || ''))) return null;
  let real;
  try { real = fs.realpathSync(pin.path); } catch { return null; }
  if (!STAGE.test(real) || real !== pin.path || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1) return null;
  const bytes = fs.readFileSync(real);
  if (sha(bytes) !== pin.sha256) return null;
  if (pin.bytes !== undefined && pin.bytes !== bytes.length) return null;
  const mod = require(real);
  return typeof mod.financialProposal === 'function' ? mod.financialProposal : null;
}
function dayRange(order, day) {
  if (!order || typeof order.abTag !== 'string' || !iso(order.abTag)) return null;
  const span = (Date.parse(day) - Date.parse(order.abTag)) / MODAY;
  if (!Number.isInteger(span) || span < 0 || span > 30) return null;
  const days = [];
  for (let i = 0; i <= span; i += 1) days.push(new Date(Date.parse(order.abTag) + i * MODAY).toISOString().slice(0, 10));
  return days;
}
function bookDayValid(books, d) {
  const b = books ? books[d] : null;
  if (!b || typeof b !== 'object' || b.day !== d) return false;
  try { K.pruefeTag(b, d); return true; } catch { return false; }
}
function assess(snapshot, modulePin, day) {
  const base = { targetDay: day, originalAuthUnchanged: true };
  const bad = (code, reason, extra) => result({ ...base, code, reason, ...extra });
  if (!iso(day)) return bad('day-invalid', 'test-usd-tag-ungueltig');
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const authOk = Boolean(snap) && typeof snap.auth === 'object' && snap.auth !== null && !Array.isArray(snap.auth);
  if (!authOk) return bad('snapshot-unreadable', 'test-usd-buch-unlesbar');
  if (snap.counterReadOK !== true || !Number.isSafeInteger(snap.counter) || snap.counter < 0) return bad('counter-unreadable', 'test-usd-zaehler-unlesbar');
  if (!AUTH_SHA.test(String(snap.authSHA || ''))) return bad('snapshot-unreadable', 'test-usd-historie-unvollstaendig');
  try {
    if (typeof snap.nativeAuthText !== 'string' || sha(Buffer.from(snap.nativeAuthText,'utf8')) !== snap.authSHA
      || !isDeepStrictEqual(JSON.parse(snap.nativeAuthText),snap.auth)) return bad('snapshot-binding-invalid','financial-preflight-rejected');
  } catch { return bad('snapshot-binding-invalid','financial-preflight-rejected'); }
  const books = snap.auth[K.KEY];
  const count = books && typeof books === 'object' && !Array.isArray(books) ? Object.keys(books).length : null;
  const order = snap.auth[K.AUFTRAG_KEY];
  const range = K.euOrder(order) ? dayRange(order, day) : null;
  if (!range) return bad('order-unreadable', 'test-usd-auftrag-unlesbar', { sourceBookCount: count });
  const missingDays = range.filter(d => !bookDayValid(books, d));
  if (missingDays.some(d => d < day)) return bad('test-usd-buch-unlesbar', 'test-usd-buch-unlesbar', { sourceBookCount: count, missingDays });
  let proposal = null;
  try { proposal = loadPinned(typeof modulePin === 'string' ? JSON.parse(modulePin) : modulePin); } catch { proposal = null; }
  if (!proposal) return bad('runtime-pin-invalid', 'financial-preflight-rejected', { sourceBookCount: count });
  const before = sha(canon(snap.auth));
  let value;
  try { value = proposal(snap.auth, snap.counter, day + 'T00:00:00.000Z', K, EU); } catch (e) {
    return bad(safe(e && e.code, 'financial-preflight-rejected'), safe(e && e.reason, 'financial-preflight-rejected'),
      { sourceBookCount: count, originalAuthUnchanged: sha(canon(snap.auth)) === before });
  }
  if (sha(canon(snap.auth)) !== before) return bad('input-mutation-detected', 'financial-preflight-rejected', { sourceBookCount: count, originalAuthUnchanged: false });
  const ok = value && typeof value === 'object' && value.projection && value.projection.tag === day;
  if (!ok) return bad('projection-missing', 'financial-preflight-rejected', { sourceBookCount: count });
  return result({ pass: true, targetDay: day, sourceBookCount: count, originalAuthUnchanged: true });
}
if (require.main === module) {
  const [pinArg, day] = process.argv.slice(2);
  const chunks = [];
  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    let snap = null, pin = null, res;
    try { snap = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { snap = null; }
    try { pin = JSON.parse(pinArg); } catch { pin = null; }
    try { res = assess(snap, pin, day); } catch { res = result({ code: 'preflight-failed', reason: 'financial-preflight-rejected' }); }
    process.stdout.write(JSON.stringify(res) + '\n');
    process.exitCode = res.pass === true ? 0 : 1;
  });
}
module.exports = { assess };
