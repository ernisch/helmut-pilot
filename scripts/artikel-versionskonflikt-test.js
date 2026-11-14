"use strict";

// Neue Interaktionsgrenzen: nativer Archivleser mit lokalem Transport, echter
// Source-/Diagnosehandler und vorhandener kleiner Queue-Treiber. Kein Kopieren
// der Readerlogik, SQL-/Lastnachweis, Netz, Modell oder Wiederholen alter Gruppen.
const A = require("node:assert/strict"), S = require("../lib/helmut/storage"),
  P = require("../lib/helmut/scalable-pipeline"), D = require("../lib/helmut/dedup"),
  R = require("../lib/helmut/roh-quellenstaende"), V = require("../lib/helmut/quellen-versorgungsstand");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
const now = Date.parse("2026-11-14T05:00:00Z"), heute = "2026-11-14T00Z";
const env = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_QUELLEN_ARBEITSFENSTER: "on" };
const key = row => row.id + ":" + R.standHash(row);
const item = n => ({ title: `Synthetischer Ausschussbericht ${n}`,
  url: `https://example.invalid/bericht/${n}`, sourceName: "Synthetische amtliche Quelle", sourceType: "official",
  publishedAt: "2026-11-13T10:00:00Z", retrievedAt: new Date(now).toISOString(),
  content: "Der synthetische Ausschuss beriet einen Entwurf und hoerte mehrere sachkundige Fachleute zur Umsetzung der vorgeschlagenen Regeln an." });
function welt({ konflikte = 1, gute = 1 } = {}) {
  const w = { items: [], kanonisch: new Map(), archiv: new Map(), forbidden: [], calls: [] };
  const fail = name => () => { w.forbidden.push(name); throw Error("Verboten: " + name); };
  for (let i = 0; i < konflikte + gute; i++) {
    const input = item(i), row = D.toRawDocumentRow(input);
    const canonical = i < konflikte ? { ...row, title: "Aelterer synthetischer Bericht " + i,
      source_name: "Synthetische alte Quelle", published_at: "2026-09-12T10:00:00Z", summary: null } : row;
    w.items.push(input); w.kanonisch.set(row.id, structuredClone(canonical));
    w.archiv.set(key(canonical), structuredClone(canonical)); w.archiv.set(key(row), structuredClone(row));
  }
  w.q = erzeugeSpeicherWarteschlange({ now: () => now });
  w.readerDeps = { ladeAktuell: async ids => ids.map(id => w.kanonisch.get(id)).filter(Boolean).map(row => structuredClone(row)),
    request: async (endpoint, options) => {
      A.equal(options, undefined, "Nativer Archivleser darf nur lesen");
      const url = new URL(endpoint, "https://local.invalid");
      A.equal(url.pathname, "/rest/v1/helmut_store"); A.equal(url.searchParams.get("select"), "id,data");
      const id = url.searchParams.get("id").slice(3), match = /-rohstand-([a-f0-9]{64})-([a-f0-9]{64})$/.exec(id);
      A(match, "Nur exakte Artikelversionen lesen");
      const row = w.archiv.get("rd-" + match[1] + ":" + match[2]);
      return row ? [{ id, data: { version: 1, quellenHash: match[2], dokument: structuredClone(row) } }] : [];
    } };
  w.native = (ids, hashes) => S.ladeRohdokumentStaende(ids, hashes, w.readerDeps);
  w.source = { id: "synthetischer-quellenauftrag", freshnessWindow: heute,
    payload: { art: "geteilt", quelle: { id: "synthetische-quelle" } } };
  w.deps = { env, now: () => now, hardeningConfig: () => ({ enabled: false }),
    crawlAllSources: async () => ({ rawItems: structuredClone(w.items), results: [{ ok: true, items: structuredClone(w.items) }] }),
    persistRohdokumente: async inputs => {
      const rows = inputs.map(D.toRawDocumentRow), ids = [...new Set(rows.map(r => r.id))];
      // Bereits bestaetigter lokaler Speicherzustand. Die echte Readerpruefung
      // bekommt separat alte Canonical-Metadaten und exakte Archivversionen.
      for (const row of rows) w.archiv.set(key(row), structuredClone(row));
      const versionen = [...w.archiv.values()].filter(r => ids.includes(r.id)).map(r => ({ id: r.id, stand: R.standHash(r) }));
      return { ok: true, neuIds: [], bestaetigteIds: ids, quellenversionen: versionen,
        quellenstaende: Object.fromEntries(rows.map(r => [r.id, R.standHash(r)])), fundstellenBestaetigt: true };
    }, ladeRohdokumentStaende: w.native, ladeRohdokumente: fail("Korpus"),
    eagerUnderstanding: fail("Modell"), budget: { reserviere: fail("Modellreservierung") },
    klassen: { belege: async () => ({ erlaubt: true, slot: "synthetisch" }), gebeFrei: async () => {} },
    enqueue: async job => { w.calls.push(structuredClone(job)); return w.q.enqueue(job); } };
  w.run = () => P.HANDLER.source_fetch(w.source, w.deps, { auftragsDeadlineMs: now + 120000 });
  w.diagnosen = () => w.q.alle().filter(j => j.payload.artikelFehler === "quellenstand-versionskonflikt");
  return w;
}
async function abschliessen(w) {
  const raw = (await w.q.claim({ owner: "synthetisch", limit: 1, types: ["document_understanding"] })).auftraege[0];
  return P.fuehreAuftragAus({ auftrag: raw, besitzer: "synthetisch", deps: { ...w.deps, handler: P.HANDLER,
    ladeRohdokumentStaende: () => A.fail("Diagnose darf keine Artikelarbeit starten"), finish: w.q.finish, extendLease: w.q.extendLease } });
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Nativer Reader lehnt weiter ab und bindet nur echten vorhandenen Versionskonflikt privat", async () => {
    const w = welt({ gute: 0 }), row = D.toRawDocumentRow(w.items[0]);
    let error;
    try { await w.native([row.id], { [row.id]: R.standHash(row) }); } catch (e) { error = e; }
    A.equal(error?.message, "quellenstand-metadatenabweichung");
    const beleg = S.leseRohdokumentKonfliktBeleg(error);
    A.equal(beleg.id, row.id); A.equal(beleg.stand, R.standHash(row)); A.deepEqual(beleg.dokument, row);
    A.equal(Object.getOwnPropertyDescriptor(error, "quellenstandKonflikt").enumerable, false);
    A.equal(error.quellenstandKonflikt, true);
    A(!JSON.stringify(error).includes(row.summary)); A(!String(error.stack).includes(row.summary));
    const fake = Error(error.message);
    Object.defineProperty(fake, "quellenstandKonflikt", { value: error.quellenstandKonflikt, enumerable: false });
    A.equal(S.leseRohdokumentKonfliktBeleg(fake), null);
    A.equal(S.leseRohdokumentKonfliktBeleg(JSON.parse(JSON.stringify(error))), null);
    beleg.id = "Fremde Kennung"; beleg.stand = "0".repeat(64); beleg.dokument.summary = "Manipulierter Text";
    A.equal(S.leseRohdokumentKonfliktBeleg(error).id, row.id);
    A.equal(S.leseRohdokumentKonfliktBeleg(error).stand, R.standHash(row));
    A.deepEqual(S.leseRohdokumentKonfliktBeleg(error).dokument, row);
  });
  await test("Vier bestaetigte inkompatible Artikelversionen blockieren brauchbaren Nachbarn und Quellenabschluss nicht", async () => {
    const w = welt({ konflikte: 4 }), before = JSON.stringify([...w.kanonisch]), r = await w.run();
    A.equal(r.ok, true); A.equal(r.vollstaendig, false); A.equal(r.teilfehler, 4); A.equal(r.grund, "artikel-eingangsfehler");
    A.equal(w.diagnosen().length, 4); A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 1);
    A(w.diagnosen().every(j => j.max_attempts === 1 && j.tenant_id === null && j.freshness_window === heute));
    A(w.diagnosen().every(j => j.idempotency_key.endsWith("|eingangsfehler|versionskonflikt")));
    A(!JSON.stringify(w.diagnosen()).includes(w.items[0].content));
    A.equal(JSON.stringify([...w.kanonisch]), before); A.deepEqual(w.forbidden, []);
  });
  await test("Diagnose endet einmalig vor Modell und Rohlesung und bewahrt offenen Versorgungsstatus", async () => {
    const w = welt({ gute: 0 }); await w.run();
    A.equal((await abschliessen(w)).ausgang, "endgueltig-fehlgeschlagen");
    A.equal(w.diagnosen()[0].status, "fehlgeschlagen"); A.equal(w.diagnosen()[0].attempts, 1);
    A.match(w.diagnosen()[0].last_error, /artikel-eingangsfehler: quellenstand-versionskonflikt/);
    const stand = await V.lese({ mandat: "synthetisches-mandat", jetztMs: now, env,
      deps: { planungsrest: { lesen: async () => ({ zustand: "fertig" }) }, offeneVorbedingungen: w.q.offeneVorbedingungen } });
    A.deepEqual(stand, { version: 1, zustand: "offen" }); A.deepEqual(w.forbidden, []);
  });
  await test("Fehlende Canonical Lesung Archivbindung oder gefaelschter Konflikt bleiben UNKNOWN", async () => {
    for (const art of ["missing", "read", "archive", "hash", "duplicate", "columns", "title-null", "title-empty", "date", "fake", "text", "fake-persist"]) {
      const w = welt(), row = D.toRawDocumentRow(w.items[0]), native = w.native, lesen = w.readerDeps.ladeAktuell;
      if (art === "missing") w.kanonisch.delete(row.id);
      if (art === "read") w.readerDeps.ladeAktuell = ids => ids.includes(row.id) ? Promise.reject(Error("Unbekannte Lesung")) : lesen(ids);
      if (art === "archive" || art === "hash") {
        const request = w.readerDeps.request;
        w.readerDeps.request = async (...args) => {
          const rows = await request(...args);
          if (rows[0]?.data?.dokument?.id === row.id) {
            if (art === "archive") return [];
            rows[0].data.dokument.summary = "Anderer nicht bestaetigter Originaltext.";
          }
          return rows;
        };
      }
      if (art === "duplicate") w.readerDeps.ladeAktuell = async ids => {
        const rows = await lesen(ids); return ids.includes(row.id) ? [...rows, structuredClone(rows[0])] : rows;
      };
      if (art === "columns") delete w.kanonisch.get(row.id).title;
      if (art === "title-null") w.kanonisch.get(row.id).title = null;
      if (art === "title-empty") w.kanonisch.get(row.id).title = " ";
      if (art === "date") w.kanonisch.get(row.id).published_at = "kaputt";
      if (art === "fake") w.deps.ladeRohdokumentStaende = (ids, hashes) => {
        if (!ids.includes(row.id)) return native(ids, hashes);
        const error = Error("quellenstand-metadatenabweichung");
        Object.defineProperty(error, "quellenstandKonflikt", { value: { id: row.id, stand: R.standHash(row), dokument: row } });
        throw error;
      };
      if (art === "text") {
        const persist = w.deps.persistRohdokumente;
        w.deps.persistRohdokumente = async inputs => {
          const p = await persist(inputs), fremd = { ...row,
            summary: "Ein anderer vollstaendiger Originalbericht beschreibt eine abweichende Beratung und ganz andere vorgeschlagene Regeln fuer Einrichtungen." };
          const hash = R.standHash(fremd); w.archiv.set(key(fremd), fremd);
          p.quellenversionen = p.quellenversionen.map(v => v.id === row.id && v.stand === R.standHash(row) ? { id: row.id, stand: hash } : v);
          p.quellenstaende[row.id] = hash; return p;
        };
      }
      if (art === "fake-persist") {
        const persist = w.deps.persistRohdokumente;
        w.deps.persistRohdokumente = async inputs => {
          const p = await persist(inputs);
          p.bestaetigteIds = p.bestaetigteIds.filter(id => id !== row.id);
          p.quellenversionen = p.quellenversionen.filter(v => v.id !== row.id);
          delete p.quellenstaende[row.id];
          p.artikelFehler = [{ id: row.id, stand: R.standHash(row), grund: "quellenstand-versionskonflikt" }];
          return p;
        };
      }
      await A.rejects(w.run(), /verstehen-nicht-eingereiht/);
      A.equal(w.diagnosen().length, 0); A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 1);
      A.deepEqual(w.forbidden, []);
    }
  });
  await test("Bestaetigter Konflikt verdeckt keinen zusaetzlichen unbekannten Speicherzustand", async () => {
    const w = welt({ konflikte: 2 }), fehlend = D.toRawDocumentRow(w.items[1]); w.kanonisch.delete(fehlend.id);
    await A.rejects(w.run(), /verstehen-nicht-eingereiht/);
    A.equal(w.diagnosen().length, 1); A.notEqual(w.diagnosen()[0].payload.dokumentIds[0], fehlend.id);
    A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 1);
  });
  await test("Brauchbare Version derselben ID hat Vorrang vor bekannter inkompatibler Nebenvariante", async () => {
    const w = welt({ konflikte: 0, gute: 1 }), row = D.toRawDocumentRow(w.items[0]);
    w.items.push({ ...w.items[0], title: "Aeltere synthetische Nebenvariante", publishedAt: "2026-11-12T10:00:00Z" });
    const r = await w.run();
    A.equal(r.teilfehler, undefined); A.equal(w.diagnosen().length, 0); A.equal(w.q.groesse(), 1);
    A.equal(w.q.alle()[0].payload.quellenstaende[row.id], R.standHash(row));
  });
  await test("Unklarer Diagnose-ACK laesst Sourcefehler und bestaetigte gute Enqueues stehen", async () => {
    for (const antwort of [null, { verfuegbar: false }, { verfuegbar: true, id: "ungueltiger-ack" }, Error("Unbekannter Schreibausgang")]) {
      const w = welt(), enqueue = w.deps.enqueue;
      w.deps.enqueue = job => {
        if (!job.payload.artikelFehler) return enqueue(job);
        if (antwort instanceof Error) throw antwort; return antwort;
      };
      await A.rejects(w.run(), /verstehen-nicht-eingereiht/);
      A.equal(w.q.groesse(), 1); A.equal(w.q.alle()[0].payload.artikelFehler, undefined);
    }
  });
  await test("Mehrere Konfliktstaende bleiben getrennt idempotent und blockieren spaeter gesunde Einzelarbeit nicht", async () => {
    const w = welt({ gute: 0 }), frisch = w.items[0], row = D.toRawDocumentRow(frisch);
    w.items.push({ ...frisch, title: "Zweiter aktueller synthetischer Stand", publishedAt: "2026-11-12T10:00:00Z" });
    await w.run(); const keys = w.q.alle().map(j => j.idempotency_key).sort();
    A.equal(keys.length, 2); A.equal(new Set(w.diagnosen().map(j => j.payload.quellenstaende[row.id])).size, 2);
    await w.run(); A.deepEqual(w.q.alle().map(j => j.idempotency_key).sort(), keys);
    // Nur eine bereits auf anderem Weg bestaetigte lokale Speicherwirklichkeit
    // simulieren. Produktcode veraendert keinerlei Canonical-/Archivversion.
    w.kanonisch.set(row.id, structuredClone(row)); w.items = [frisch];
    await w.run(); A.equal(w.q.groesse(), 3); A.equal(w.diagnosen().length, 2);
    A.equal(w.q.alle().filter(j => !j.payload.artikelFehler).length, 1);
  });
  await test("Diagnose bindet originales Wiederbeobachtungsfenster und ungueltige Metadaten bleiben UNKNOWN", async () => {
    const w = welt({ gute: 0 }); w.source.freshnessWindow = "2026-11-12T00Z";
    const source = await w.q.enqueue({ jobType: "source_fetch", idempotencyKey: "synthetisch-source",
      freshnessWindow: w.source.freshnessWindow, payload: w.source.payload });
    const raw = (await w.q.claim({ owner: "synthetisch", limit: 1, types: ["source_fetch"] })).auftraege[0];
    raw.last_seen_window = heute;
    const result = await P.fuehreAuftragAus({ auftrag: raw, besitzer: "synthetisch", deps: { ...w.deps,
      handler: P.HANDLER, finish: w.q.finish, extendLease: w.q.extendLease } });
    A.equal(result.ausgang, "erledigt"); A.equal(w.q.hole(source.id).freshness_window, "2026-11-12T00Z");
    A.equal(w.diagnosen()[0].freshness_window, heute);
    for (const [window, basis] of [[null, null], ["", heute], ["ungueltig", heute], ["2026-02-30T00Z", heute], ["2026-11-14T24Z", heute]]) {
      const bad = welt({ gute: 0 }); bad.source.freshnessWindow = basis; bad.source.lastSeenWindow = window;
      await A.rejects(bad.run(), /verstehen-nicht-eingereiht/); A.equal(bad.q.groesse(), 0);
    }
  });
  A.equal(count, 9);
  console.log(`${count}/${count} neue Artikel-Versionskonfliktgruppen bestanden; keine Modelle Datenbank oder alten Tests.`);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
