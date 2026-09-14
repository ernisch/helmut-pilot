"use strict";
// Ausschließlich lokale Aufnahmeprüfung. Kein Transport, keine Zugangsdaten,
// kein Import von storage/server, keine Production oder fachliche Freigabe.
const fs = require('node:fs');
const crypto = require('node:crypto');
const vm = require('node:vm');
const COMMIT = 'e7501a4b7cc010d2661cb0d7f34a6b259d07bb75';
const STORAGE_SHA = 'd34f24f396c7939443b023e1ca9098d86bdd6111ecef675e54daab37de9be888';
const READER_SHA = 'f704a88e87bad8129bbd2c53ca41357992461cde0e49a8d50a6d4573b896374b';
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const check = (value, reason) => { if (!value) throw new Error(reason); };
const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
function stamp(s) {
  check(typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s)
    && Number.isFinite(Date.parse(s)), 'zeitbeleg-fehlt');
  return Date.parse(s);
}
function runtime(r) {
  check(obj(r) && r.commit === COMMIT && r.ok === true && r.reinLesend === true
    && r.httpStatus === 200 && r.grund === 'production-laufzeit-gelesen'
    && r.profileRelational === true && r.profileExclusive === true && r.v3Bereit === true
    && r.kommunikationGesperrt === true && r.kohortenQuellenGesperrt === true
    && r.scharferPfadFreigegeben === false, 'laufzeitbeleg-abweichend');
  const q = r.quellenkontext;
  check(obj(q) && q.version === 1 && ['off','on','shadow'].includes(q.scoring)
    && typeof q.relevanzordnung === 'boolean' && Number.isInteger(q.koScan) && q.koScan > 0
    && Number.isInteger(q.lageMax) && q.lageMax > 0 && Number.isFinite(q.relevanzTage) && q.relevanzTage > 0
    && typeof q.sourceSafetyStandard === 'boolean' && typeof q.atomicLock === 'boolean', 'quellenkontext-fehlt');
  // Für diesen vorbereiteten Snapshotweg ausschließlich der bestätigte Standard.
  check(q.scoring === 'off' && q.relevanzordnung === false && q.koScan === 500
    && q.lageMax === 12 && q.relevanzTage === 14 && q.sourceSafetyStandard && q.atomicLock,
    'neuer-aufnahmeplan-erforderlich');
  return JSON.stringify(q);
}
async function pruefe(packet, storageText) {
  check(obj(packet) && packet.version === 1 && packet.mandat === 'test-kohorte-b-055'
    && packet.commit === COMMIT, 'aufnahme-kontext-abweichend');
  check(typeof storageText === 'string' && hash(storageText) === STORAGE_SHA, 'verbrauchercode-abweichend');
  const start = storageText.indexOf('async function getSourcesForVorgang(');
  const end = storageText.indexOf('// Nur die bereits ausgewaehlten Lagebelege.', start);
  const source = storageText.slice(start,end).trim();
  check(start >= 0 && end > start && hash(source) === READER_SHA, 'verbrauchercode-abweichend');
  const before = packet.runtimeBefore, after = packet.runtimeAfter;
  check(obj(before) && obj(after), 'laufzeitbeleg-fehlt');
  const from = stamp(before.receivedAt), to = stamp(after.receivedAt);
  check(from <= to && runtime(before.report) === runtime(after.report), 'laufzeitwechsel');
  for (const b of [before,after]) check(typeof b.evidenceRef === 'string' && b.evidenceRef.trim(), 'laufzeitreferenz-fehlt');
  const ids = packet.requestedVorgangIds;
  check(Array.isArray(ids) && ids.length > 0 && ids.length <= 500
    && ids.every(id => typeof id === 'string' && /^vg-[\p{L}\p{N}-]+$/u.test(id))
    && new Set(ids).size === ids.length, 'quellenbedarf-ungueltig');
  check(obj(packet.inputEvidence) && ['profileSha256','kosSha256','quellenbedarfSha256'].every(k => /^[a-f0-9]{64}$/.test(packet.inputEvidence[k] || ''))
    && packet.inputEvidence.quellenbedarfSha256 === hash(JSON.stringify(ids)), 'eingabebindung-fehlt');
  check(Array.isArray(packet.responses) && packet.responses.length === ids.length, 'quellenantwort-fehlt');
  const seen = new Set(), records = [];
  for (const r of packet.responses) {
    check(obj(r) && ids.includes(r.vorgangId) && !seen.has(r.vorgangId), 'fremde-oder-doppelte-antwort');
    seen.add(r.vorgangId);
    const begin = stamp(r.requestedAt), finish = stamp(r.receivedAt);
    check(from <= begin && begin <= finish && finish <= to, 'zeitbeleg-ausserhalb-aufnahme');
    check(r.method === 'GET' && r.httpStatus === 200 && typeof r.contentType === 'string' && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(r.contentType), 'transport-nicht-lesend-oder-fehler');
    check(typeof r.rawBody === 'string' && Buffer.byteLength(r.rawBody) <= 2000000
      && r.rawBodySha256 === hash(r.rawBody), 'antwortbytes-abweichend');
    let rows;
    try { rows = JSON.parse(r.rawBody); } catch { throw new Error('antwort-json-ungueltig'); }
    check(Array.isArray(rows) && rows.length <= 40, 'antwortumfang-abweichend');
    const docIds = [];
    for (const row of rows) {
      check(row === null || obj(row), 'antwortstruktur-abweichend');
      const d = row?.raw_documents;
      check(d === null || (obj(d) && typeof d.id === 'string' && d.id.length > 0), 'antwortstruktur-abweichend');
      if (d) docIds.push(d.id);
    }
    check(new Set(docIds).size === docIds.length, 'doppelte-dokumentkennung');
    let calls = 0, caught = false;
    const reader = vm.runInNewContext(source + '\ngetSourcesForVorgang', {
      v3StoreReady: () => true,
      supabaseRequest: async endpoint => {
        calls++;
        check(endpoint === r.endpoint, 'endpoint-abweichend');
        return JSON.parse(r.rawBody);
      },
      console: { error: () => { caught = true; } }, encodeURIComponent
    }, {timeout:1000});
    const consumed = await reader(r.vorgangId);
    check(calls === 1 && !caught, 'verbraucher-lesefehler');
    check(consumed.length === docIds.length, 'verbraucherumfang-abweichend');
    records.push({ ...r, responseRowIds: rows.map(row => row?.raw_documents?.id || null),
      consumedIds: Array.from(consumed, d => d.id), consumedDocs: JSON.parse(JSON.stringify(consumed)) });
  }
  return { version:1, art:'lokal-gepruefter-aufnahmebeleg', mandat:packet.mandat, commit:COMMIT,
    storageSha256:STORAGE_SHA, readerSha256:READER_SHA, inputEvidence:packet.inputEvidence,
    requestedVorgangIds:ids, runtimeBefore:before, runtimeAfter:after, responses:records,
    transaktionalerSnapshot:false, authentizitaetExternZuPruefen:true,
    productionMitschnittBestaetigt:false, fachlicheFreigabe:false, aufnahmeHash:hash(JSON.stringify(packet)) };
}
if (require.main === module) {
  const [packetPath,storagePath] = process.argv.slice(2);
  if (!packetPath || !storagePath) { console.error('Lokale Paketdatei und storage.js erforderlich. Kein Netzmodus vorhanden.'); process.exitCode=2; }
  else Promise.resolve().then(() => pruefe(JSON.parse(fs.readFileSync(packetPath,'utf8')),fs.readFileSync(storagePath,'utf8')))
    .then(result => process.stdout.write(JSON.stringify(result,null,2)+'\n'))
    .catch(() => { console.error('Aufnahme nicht bestätigt; keine private Fehlerausgabe.'); process.exitCode=1; });
}
module.exports = { pruefe, hash, COMMIT };
