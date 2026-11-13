"use strict";

// Neue enge DIP-Isolationsfaelle mit der vorhandenen synthetischen DIP-Drucksache
// und dem bestehenden Speichertreiber. Keine Adapterfehlerursache behauptet;
// kein HTTP, echter Speicher, Modell oder historischer Mengenlauf.
const A = require("node:assert/strict");
const P = require("../lib/helmut/scalable-pipeline");
const DIP = require("../lib/helmut/dip");
const S = require("../lib/helmut/scheduler");
const Q = require("../lib/helmut/dip-quellfelder");
const D = require("../lib/helmut/dedup");
const R = require("../lib/helmut/roh-quellenstaende");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
const now = Date.parse("2026-11-13T04:00:00Z");
const profile = { id: "queue-offline", name: "Synthetischer Queue Test", party: "SPD", parliament: "Bundestag",
  state: "Niedersachsen", focusTopics: ["Arbeit", "Soziales"], profileActive: true };
const env = { HELMUT_SCALABLE_PIPELINE: "on", DIP_API_KEY: "declared-offline-only" };
const source = { id: "synthetische-dip-quelle", tenantId: profile.id, freshnessWindow: "2026-11-13T00Z",
  payload: { mandatsId: profile.id, quelle: { id: "dip", retrievalPathId: "rp-dip",
    url: "https://search.dip.bundestag.de/api/v1", crawlMethod: "dip" } } };
const katalog = { retrievalPaths: [{ id: "rp-dip", legacy_source_id: "dip", publisher_id: "publisher-dip.bundestag.de",
  method: "api", parser: "dip-json", url: "https://search.dip.bundestag.de/api/v1", status: "healthy", activation_mode: "always_on" }] };
// Dieselbe fiktive Ausgangsdrucksache wie quellen-inhaltsversorgung-queue-test.js.
function dokument(id = 990010, kaputt = false) {
  const doc = DIP.normalizeDrucksache({ id, titel: "Pruefung des Mindestlohns und der sozialen Beratung",
    datum: "2026-11-08", drucksachetyp: "Antwort", dokumentart: "Drucksache",
    urheber: [{ titel: "Bundesregierung" }], ressort: [{ titel: "Bundesministerium fuer Arbeit" }],
    fundstelle: { pdf_url: `https://dserver.bundestag.de/btd/21/099/21${id}.pdf` } });
  if (kaputt) doc.dipQuellfelder.hash = "0".repeat(64);
  return doc;
}
function welt(docs = [dokument(990010, true), dokument(990011), dokument(990012)]) {
  const q = erzeugeSpeicherWarteschlange({ now: () => now });
  const w = { q, docs, persisted: new Map(), persistCalls: 0, freed: 0, forbidden: [] };
  const fail = name => () => { w.forbidden.push(name); throw Error("Verbotener Zugriff: " + name); };
  w.deps = { env, now: () => now,
    klassen: { belege: async () => ({ erlaubt: true, slot: "synthetischer-slot" }), gebeFrei: async () => { w.freed++; } },
    listFullProfiles: async () => [profile], leseDipKatalog: async () => katalog,
    dipQueueDocuments: async () => w.docs, dipDocToRawItem: doc => S.dipDocToRawItem(doc, { primary: true }),
    persistRohdokumente: async items => {
      w.persistCalls++; const neuIds = [], rows = items.map(item => {
        A(Q.lese(item), "Nur unveraendert bestaetigte DIP-Dokumente duerfen persistiert werden");
        const row = D.toRawDocumentRow(item);
        if (!w.persisted.has(row.id)) { w.persisted.set(row.id, row); neuIds.push(row.id); }
        return row;
      });
      return { ok: true, neuIds, bestaetigteIds: rows.map(r => r.id),
        quellenstaende: Object.fromEntries(rows.map(r => [r.id, R.standHash(r)])), fundstellenBestaetigt: true };
    },
    enqueue: q.enqueue, ladeRohdokumente: fail("Rohdaten"), ladeRohdokumentStaende: fail("Quellenstand"),
    eagerUnderstanding: fail("Modell"), budget: { reserviere: fail("Reservierung") }
  };
  w.run = () => P.HANDLER.source_fetch(source, w.deps, { auftragsDeadlineMs: now + 120000 });
  return w;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Defektes erstes DIP-Dokument blockiert zwei bestaetigte Nachbarn nicht", async () => {
    const w = welt(), r = await w.run(), jobs = w.q.alle();
    A.equal(w.persisted.size, 2); A.equal(r.gespeichert, 2); A.equal(r.teilfehler, 1);
    A.equal(r.vollstaendig, false); A.equal(r.grund, "artikel-eingangsfehler");
    A.equal(r.abgewieseneDipArtikel[0].dipDokumentId, "990010");
    A.equal(r.abgewieseneDipArtikel[0].status, "abgewiesen");
    A.equal(jobs.filter(j => !j.payload.artikelFehler).length, 2);
    const bad = jobs.find(j => j.payload.artikelFehler);
    A.equal(bad.payload.artikelFehler, "dip-quellfelder-nicht-bestaetigt");
    A.equal(bad.payload.dipDokumentId, "990010"); A.equal(bad.max_attempts, 1);
    A(jobs.every(j => j.tenant_id === null));
    A(!JSON.stringify(bad.payload).includes("Bundesregierung"));
    A(!JSON.stringify(bad.payload).includes("declared-offline-only"));
    A(JSON.stringify(bad.payload).length < 500); A.equal(w.freed, 1); A.deepEqual(w.forbidden, []);
  });
  await test("DIP-Eingangsfehler endet nach einem Versuch sichtbar ohne Rohdaten oder Modell", async () => {
    const w = welt([dokument(990010, true)]), r = await w.run();
    A.equal(r.vollstaendig, false); A.equal(w.persistCalls, 0);
    const claimed = await w.q.claim({ owner: "synthetisch", limit: 1, types: ["document_understanding"] });
    const job = claimed.auftraege[0];
    const result = await P.fuehreAuftragAus({ auftrag: job, besitzer: "synthetisch", deps: {
      ...w.deps, handler: P.HANDLER, finish: w.q.finish, extendLease: w.q.extendLease
    } });
    A.equal(result.ausgang, "endgueltig-fehlgeschlagen");
    A.equal(w.q.hole(job.id).status, "fehlgeschlagen");
    A.match(w.q.hole(job.id).last_error, /artikel-eingangsfehler: dip-quellfelder-nicht-bestaetigt/);
    A.deepEqual(w.forbidden, []);
  });
  await test("Wiederholung und spaeter bestaetigte DIP-Version bleiben getrennt idempotent", async () => {
    const w = welt(); await w.run(); const before = w.q.alle().map(j => j.idempotency_key).sort();
    const again = await w.run(); A.equal(again.gespeichert, 0);
    A.deepEqual(w.q.alle().map(j => j.idempotency_key).sort(), before);
    w.docs[0] = dokument(990010); const recovered = await w.run();
    A.equal(recovered.teilfehler, undefined); A.equal(w.persisted.size, 3); A.equal(w.q.groesse(), 4);
    const bad = w.q.alle().find(j => j.payload.artikelFehler);
    A(w.q.alle().some(j => !j.payload.artikelFehler && j.payload.dokumentIds[0] === bad.payload.dokumentIds[0]));
    A.deepEqual(w.forbidden, []);
  });
  await test("Einzelner DIP-Abbildungsfehler behaelt brauchbare Nachbarn und Fehlerkennung", async () => {
    const w = welt([dokument(990010), dokument(990011)]), convert = w.deps.dipDocToRawItem;
    w.deps.dipDocToRawItem = doc => { if (doc.id === "990010") throw Error("synthetischer Abbildungsfehler"); return convert(doc); };
    const r = await w.run(); A.equal(w.persisted.size, 1); A.equal(r.teilfehler, 1);
    A.equal(r.abgewieseneDipArtikel[0].dipDokumentId, "990010"); A.equal(w.q.groesse(), 2);
  });
  await test("Zwoelf abgewiesene DIP-Dokumente ergeben zwoelf begrenzte Fehlerstatus ohne Persistenz", async () => {
    const w = welt(Array.from({ length: 12 }, (_, i) => dokument(990010 + i, true))), r = await w.run();
    A.equal(r.teilfehler, 12); A.equal(r.vollstaendig, false); A.equal(w.persistCalls, 0);
    A.equal(w.q.groesse(), 12); A(w.q.alle().every(j => j.payload.artikelFehler && j.max_attempts === 1));
    A.equal(new Set(w.q.alle().map(j => j.idempotency_key)).size, 12); A.deepEqual(w.forbidden, []);
  });
  await test("Ungeklaerter DIP-Fehlerstatusabschluss meldet keinen vollstaendigen Quellenerfolg", async () => {
    const w = welt(), enqueue = w.deps.enqueue;
    w.deps.enqueue = j => j.payload.artikelFehler ? Promise.reject(Error("unbekannter Schreibausgang")) : enqueue(j);
    await A.rejects(w.run(), /verstehen-nicht-eingereiht: 1/);
    A.equal(w.persisted.size, 2); A.equal(w.q.groesse(), 2); A.equal(w.freed, 1);
  });
  await test("DIP-Metadatenfehler verdeckt keinen unbekannten Persistenzausgang brauchbarer Nachbarn", async () => {
    const w = welt(); w.deps.persistRohdokumente = async () => ({ ok: false, bestaetigteIds: [], grund: "synthetischer Timeout" });
    await A.rejects(w.run(), /persistenz-fehlgeschlagen-oder-unbekannt/);
    A.equal(w.q.groesse(), 0); A.equal(w.freed, 1);
  });
  await test("Ohne modernen Kern bleibt die vorhandene strenge DIP-Stapelgrenze bestehen", async () => {
    const w = welt(); w.deps.env = { ...env, HELMUT_SCALABLE_PIPELINE: "off" };
    await A.rejects(w.run(), /dip-quellfelder-nicht-bestaetigt/);
    A.equal(w.persistCalls, 0); A.equal(w.q.groesse(), 0); A.equal(w.freed, 1);
  });
  console.log(`${count}/${count} neue DIP-Einzelartikel-Isolationsfaelle bestanden; keine externen Aufrufe.`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
