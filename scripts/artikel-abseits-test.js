"use strict";

// Nur neue Artikelstatus-/Workergrenzen, synthetische Quellen und vorhandener
// Queue-Treiber. Keine Provider, DB, historischen Suiten oder bezahlten Wiederholungen.
const A = require("node:assert/strict"), P = require("../lib/helmut/scalable-pipeline"),
  Z = require("../lib/helmut/artikel-verarbeitungszustand"), B = require("../lib/helmut/artikelkontext-belegspeicher"),
  R = require("../lib/helmut/roh-quellenstaende"), D = require("../lib/helmut/dedup"),
  V = require("../lib/helmut/quellen-versorgungsstand"), { hash } = require("../lib/helmut/quellen-lektuerebeleg");
const { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
const args = process.argv.slice(2), nurOffene = args.length === 1 && args[0] === "--nur-offene";
if (args.length && !nurOffene) throw Error("Unbekannte Testauswahl");
const bestanden = new Set([
  "Zwei bestaetigte Artikeldefekte enden begrenzt und lassen brauchbaren Nachbarn durch",
  "Nativer Negativbeleg bindet Status an exakt einen Stand ohne Rohtext oder erfundene Fakten",
  "Anbieter Budget HTTP Store Lease und unbekannte Ausgaenge werden niemals Abseits"
]);
const verboten = [], fail = name => () => { verboten.push(name); throw Error(name + " verboten"); };
global.fetch = fail("Netz"); require("node:https").request = fail("HTTPS"); require("node:http").request = fail("HTTP");
const ENV = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_VERSTEHEN_CAS: "on", HELMUT_ARTIKELKONTEXT: "on",
  HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.bundestag.de,www.bundesregierung.de", HELMUT_SOURCE_MODE: "on" };
const tag = "2026-11-14T00Z", start = Date.parse("2026-11-14T14:00:00Z"), clone = v => structuredClone(v);
function dokument(n, { publisher = false, gut = false, layout = false } = {}) {
  return D.toRawDocumentRow({ title: "Synthetischer Ausschussbericht " + n,
    url: publisher ? null : layout ? "https://www.bundesregierung.de/breg-de/aktuelles/synthetischer-bericht-1234567"
      : "https://www.bundestag.de/presse/synthetischer-bericht-" + n,
    sourceName: "Synthetische amtliche Quelle", sourceId: "synthetische-quelle", sourceType: "official",
    linkType: publisher ? "publisher" : "direct", publishedAt: "2026-11-13T10:00:00Z",
    retrievedAt: new Date(start).toISOString(), summary: gut
      ? "Der Ausschuss hat den Vorschlag beraten und weitere Sachverstaendige zur praktischen Umsetzung der neuen gesetzlichen Regeln angehoert." : null });
}
function negativ(key, reason = "artikelbereich-mehrdeutig-oder-fehlend") {
  return { version: 1, schluessel: key, versuchId: "00000000-0000-4000-8000-000000000001",
    reserviertAm: "2026-11-14T03:00:00.000Z", zustand: "luecke", abgeschlossenAm: "2026-11-14T03:00:01.000Z", reason };
}
function welt(docs = [dokument(1, { publisher: true })]) {
  let zeit = start;
  const w = { docs: new Map(docs.map(d => [d.id, d])), cache: new Map(), reads: [], archivs: [], fach: [], writes: [], finishes: [] };
  w.now = () => zeit; w.advance = ms => { zeit += ms; };
  w.q = erzeugeSpeicherWarteschlange({ now: w.now });
  w.reason = new Map(docs.map(d => [d.id, d.link_type === "publisher" ? "artikelziel-nicht-bestaetigt" : "artikelbereich-mehrdeutig-oder-fehlend"]));
  w.payload = d => ({ dokumentIds: [d.id], quellenstaende: { [d.id]: R.standHash(d) } });
  w.speicher = { lesen: async key => { w.reads.push(key); if (w.readError) throw Error("Speicherausgang unklar"); return clone(w.cache.get(key) ?? null); } };
  w.deps = { env: ENV, now: w.now, handler: P.HANDLER,
    klassen: { belege: async () => ({ erlaubt: true, slot: "synthetische-lease" }), gebeFrei: async () => {} },
    ladeRohdokumente: fail("Ungebundene Rohlesung"), ladeRohdokumentStaende: async ids => {
      w.archivs.push(...ids); if (w.archiveError) throw Error("quellenstand-nicht-verfuegbar"); return ids.map(id => clone(w.docs.get(id))); },
    artikelBelegspeicher: w.speicher,
    listFullProfiles: async () => [{ id: "synthetisches-mandat", fullName: "Synthetisches Mandat", party: "SPD",
      parliamentType: "Bundestag", state: "Berlin", focusTopics: ["Arbeit"] }],
    vorbereiteGespeicherteInhalte: async ({ dokumente }) => ({ dokumente,
      befund: dokumente.map(d => ({ id: d.id, status: d.summary ? "vorhanden" : "luecke", reason: w.reason.get(d.id) })),
      artikelkontextVersorgung: async () => ({ angefordert: false }), fortsetzungOffen: false }),
    verstehenKonkurrenz: () => false, eagerUnderstanding: async ds => {
      w.fach.push(...ds.map(d => d.id));
      return { processed: ds.length, results: ds.map(d => ({ status: "saved", promptDokumentIds: [d.id] })) }; },
    extendLease: w.q.extendLease, zurueckstellen: w.q.zurueckstellen,
    finish: async o => { w.finishes.push(clone(o)); return w.finishError ? { verfuegbar: false } : w.q.finish(o); },
    fortschritt: async o => {
      w.writes.push(clone(o)); if (w.progressError) return { verfuegbar: false };
      const row = w.q.hole(o.id);
      if (!row || row.status !== "laeuft" || row.lease_owner !== o.owner || Date.parse(row.lease_expires_at) <= zeit
        || hash(row.payload) !== hash(o.vorher)) return { verfuegbar: true, uebernommen: false };
      row.payload = clone(o.payload); return { verfuegbar: true, uebernommen: true };
    } };
  w.enqueue = d => w.q.enqueue({ jobType: "document_understanding", idempotencyKey: "synthetisch|" + d.id + "|" + R.standHash(d),
    freshnessWindow: tag, tenantId: null, priority: 80, maxAttempts: 3, payload: w.payload(d) });
  w.run = async () => {
    const a = (await w.q.claim({ owner: "synthetisch", limit: 1, leaseMs: 120000, types: ["document_understanding"] })).auftraege[0];
    return a && P.fuehreAuftragAus({ auftrag: a, besitzer: "synthetisch", deps: w.deps });
  };
  w.pruefe = (d = docs[0], extra = {}) => Z.pruefe({ dokument: d, payload: w.payload(d),
    befund: [{ id: d.id, status: "luecke", reason: w.reason.get(d.id) }], deadlineMs: zeit + 120000, now: w.now, ...extra }, w.deps);
  w.negativ = (d = docs[0], reason = w.reason.get(d.id)) => {
    const v = B.bereiteArtikelkontextVor(d, { versuch: true, kontext: "einstieg" }); A.equal(v.ok, true);
    w.cache.set(v.key, negativ(v.key, reason)); return v;
  };
  return w;
}
let count = 0;
async function test(name, fn) { if (nurOffene && bestanden.has(name)) return; await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Zwei bestaetigte Artikeldefekte enden begrenzt und lassen brauchbaren Nachbarn durch", async () => {
    const schlecht = dokument(1, { publisher: true }), negativDoc = dokument(2), gut = dokument(3, { gut: true });
    const w = welt([schlecht, negativDoc, gut]); w.negativ(negativDoc);
    for (const d of [schlecht, negativDoc, gut]) await w.enqueue(d);
    for (let i = 0; i < 7; i++) A.ok(await w.run());
    A.equal(await w.run(), undefined); A.equal(w.q.nachStatus("fehlgeschlagen").length, 2);
    A.equal(w.q.nachStatus("erledigt").length, 1); A.deepEqual(w.fach, [gut.id]);
    for (const row of w.q.nachStatus("fehlgeschlagen")) {
      A.equal(row.attempts, 3); A.match(row.last_error, /^artikel-abseits: /);
      A.equal(row.payload.artikelVerarbeitungszustand.zustand, "abseits");
      A.equal(w.archivs.filter(id => id === row.payload.dokumentIds[0]).length, 1);
    }
    A.equal(w.writes.filter(x => x.payload.artikelVerarbeitungszustand).length, 2);
    A(w.finishes.filter(x => !x.ok).every(x => x.retryDelayMs === 0));
    const status = await V.lese({ mandat: "synthetisches-mandat", jetztMs: start,
      env: { ...ENV, HELMUT_QUELLEN_ARBEITSFENSTER: "on" }, deps: { planungsrest: { lesen: async () => ({ zustand: "fertig" }) },
        offeneVorbedingungen: w.q.offeneVorbedingungen } });
    A.equal(status.zustand, "offen");
  });
  await test("Nativer Negativbeleg bindet Status an exakt einen Stand ohne Rohtext oder erfundene Fakten", async () => {
    const d = dokument(4), w = welt([d]), v = w.negativ(), vor = clone([...w.cache]);
    const z = await w.pruefe(); A.equal(z.zustand, "abseits"); A.equal(z.artikelVersion, R.standHash(d));
    A.equal(z.beleg.schluessel, v.key); A.equal(z.beleg.negativHash, hash(w.cache.get(v.key)));
    A.deepEqual(Z.lese(JSON.parse(JSON.stringify(z)), w.payload(d)), z); A.deepEqual([...w.cache], vor);
    A.equal(JSON.stringify(z).includes(d.title), false); A.equal(JSON.stringify(z).includes(d.url), false);
  });
  await test("Anbieter Budget HTTP Store Lease und unbekannte Ausgaenge werden niemals Abseits", async () => {
    for (const reason of ["anbietergrenze", "original-tagesgrenze", "http-status", "abruf-fehlgeschlagen",
      "abruf-ausgang-offen", "abschluss-nicht-bestaetigt", "belegstand-ungueltig", "quellenbestand-nicht-pruefbar", "laufgrenze", "restzeit-vor-abruf"]) {
      const w = welt([dokument(5)]); w.reason.set(w.docs.keys().next().value, reason); w.negativ();
      A.equal(await w.pruefe(), null); A.deepEqual(w.reads, []);
    }
    for (const change of [w => w.cache.clear(), w => { w.readError = true; }, w => {
      const v = w.negativ(); w.cache.set(v.key, { ...w.cache.get(v.key), unerlaubt: true });
    }, w => { const v = w.negativ(); delete w.cache.get(v.key).abgeschlossenAm; }, w => {
      const v = B.bereiteArtikelkontextVor([...w.docs.values()][0], { versuch: true });
      w.cache.set(v.key, { version: 1, schluessel: v.key, versuchId: "00000000-0000-4000-8000-000000000001",
        reserviertAm: "2026-11-14T03:00:00.000Z", zustand: "reserviert" });
    }]) { const w = welt([dokument(6)]); w.negativ(); change(w); A.equal(await w.pruefe(), null); }
    for (const unknown of [false, true]) {
      const w = welt([dokument(60)]), d = [...w.docs.values()][0]; w.negativ();
      if (unknown) w.readError = true; else w.reason.set(d.id, "http-status");
      await w.enqueue(d); A.equal((await w.run()).ausgang, "zurueckgestellt");
      A.equal(w.q.alle()[0].status, "wartend"); A.equal(w.q.alle()[0].attempts, 0);
      A.equal(w.q.alle()[0].payload.artikelVerarbeitungszustand, undefined); A.deepEqual(w.fach, []);
    }
  });
  await test("Fehlende Zielmetadaten fremde Standhashes brauchbarer RSS und widerspruechliche Befunde bleiben ungefaehrdet", async () => {
    const d = dokument(7, { publisher: true }), w = welt([d]);
    for (const change of [x => { delete x.link_type; }, x => { delete x.url; }, x => { x.title = null; }]) {
      const x = clone(d); change(x); A.equal(await w.pruefe(x), null);
    }
    const anders = clone(d); anders.title += " neuer Stand"; A.equal(await w.pruefe(anders, { payload: w.payload(d) }), null);
    A.equal(await w.pruefe(d, { befund: [{ id: d.id, status: "luecke", reason: "artikelziel-nicht-bestaetigt" },
      { id: d.id, status: "vertagt", reason: "quellenbestand-nicht-pruefbar" }] }), null);
    const gut = dokument(8, { gut: true }); A.equal(await welt([gut]).pruefe(), null);
    A.deepEqual(w.reads, []);
    const ziel = dokument(70); ziel.link_type = "publisher";
    const text = "Der Ausschuss hat den Vorschlag beraten und weitere Sachverstaendige zur praktischen Umsetzung der neuen gesetzlichen Regeln angehoert.";
    const html = `<html><head><link rel="canonical" href="${ziel.url}"><meta property="og:title" content="${ziel.title}">`
      + `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: ziel.title,
        datePublished: ziel.published_at, articleBody: text, url: ziel.url })}</script></head><body>`
      + `<article><h1>${ziel.title}</h1><p>${text}</p></article></body></html>`;
    const positiv = require("../lib/helmut/artikelkontext-gewinnung").gewinneArtikelEinstieg(ziel,
      { finalUrl: ziel.url, body: html, gelesenAm: "2026-11-14T03:00:00.500Z" }); A.equal(positiv.ok, true);
    for (const opts of [{ versuch: true }, { versuch: true, kontext: "einstieg" }]) for (const zustand of ["belegt", "reserviert"]) {
      const mitZiel = welt([ziel]), v = B.bereiteArtikelkontextVor(ziel, opts); A.equal(v.ok, true);
      mitZiel.reason.set(ziel.id, "artikelziel-nicht-bestaetigt");
      const { reason, ...basis } = negativ(v.key);
      const stand = zustand === "belegt" ? { ...basis, zustand, beleg: positiv.beleg }
        : { version: 1, schluessel: v.key, versuchId: basis.versuchId, reserviertAm: basis.reserviertAm, zustand };
      mitZiel.cache.set(v.key, stand);
      if (zustand === "belegt") A.equal(B.pruefeBelegstand(ziel, v.key, stand).ok, true);
      A.equal(await mitZiel.pruefe(), null); A.deepEqual(mitZiel.reads, []); A.deepEqual(mitZiel.cache.get(v.key), stand);
    }
  });
  await test("Fortschritt-CAS und Abschlussverlust beenden nichts unbestaetigt und verlieren keinen gesicherten Status", async () => {
    const w = welt(), d = [...w.docs.values()][0]; await w.enqueue(d); w.progressError = true;
    A.equal((await w.run()).ausgang, "fortschritt-nicht-uebernommen"); A.deepEqual(w.finishes, []);
    A.equal(w.q.alle()[0].payload.artikelVerarbeitungszustand, undefined);
    w.advance(121000); w.progressError = false; w.finishError = true;
    A.equal((await w.run()).ausgang, "nicht-uebernommen");
    const z = clone(w.q.alle()[0].payload.artikelVerarbeitungszustand), loads = w.archivs.length;
    w.advance(121000); w.finishError = false; A.equal((await w.run()).ausgang, "endgueltig-fehlgeschlagen");
    A.deepEqual(w.q.alle()[0].payload.artikelVerarbeitungszustand, z); A.equal(w.archivs.length, loads); A.deepEqual(w.fach, []);
    const fremdeLease = welt(); await fremdeLease.enqueue([...fremdeLease.docs.values()][0]);
    fremdeLease.deps.fortschritt = async () => { fremdeLease.q.alle()[0].lease_owner = "fremd"; return { verfuegbar: true, uebernommen: false }; };
    A.equal((await fremdeLease.run()).ausgang, "fortschritt-nicht-uebernommen"); A.deepEqual(fremdeLease.finishes, []);
  });
  await test("Wiedervorlage und JSONBReihenfolge quittieren nur Status statt unbekannte bezahlte Altvertraege zu oeffnen", async () => {
    const w = welt(), d = [...w.docs.values()][0]; await w.enqueue(d);
    for (let i = 0; i < 3; i++) await w.run();
    const row = w.q.alle()[0], vorher = clone(row.payload.artikelVerarbeitungszustand), loads = w.archivs.length;
    row.payload.artikelVerarbeitungszustand = Object.fromEntries(Object.entries(vorher).reverse());
    row.status = "wartend"; row.attempts = 0; row.finished_at = null; row.wiedervorlagen = 1;
    w.deps.eagerUnderstanding = fail("UNKNOWN-Modellwiederholung"); w.deps.ladeRohdokumentStaende = fail("Erneute Artikelpruefung");
    for (let i = 0; i < 3; i++) await w.run();
    A.equal(row.status, "fehlgeschlagen"); A.equal(w.archivs.length, loads); A.deepEqual(row.payload.artikelVerarbeitungszustand, vorher);
    const corrupt = clone(row.payload); corrupt.artikelVerarbeitungszustand.grund = "http-status";
    A.equal((await P.HANDLER.document_understanding({ payload: corrupt }, w.deps)).grund, "artikelstatus-nicht-pruefbar");
    const fremd = clone(row.payload); fremd.quellenstaende[d.id] = "0".repeat(64);
    A.equal((await P.HANDLER.document_understanding({ payload: fremd }, w.deps)).artikelAbseits, undefined);
  });
  await test("Neue Layoutrevision braucht eigenen bestaetigten Negativbeleg und oeffnet keine alten UNKNOWN-Schluessel", async () => {
    const d = dokument(9, { layout: true }), w = welt([d]); w.reason.set(d.id, "strukturierter-artikel-mehrdeutig-oder-fehlend");
    const v = w.negativ(), opts = { versuch: true, kontext: "einstieg" }, f = B.bereiteQuellenlayoutFolge(v, w.cache.get(v.key), opts);
    A.ok(f); A.equal(await w.pruefe(), null);
    w.cache.set(f.key, { ...negativ(f.key), zustand: "reserviert" }); A.equal(await w.pruefe(), null);
    w.cache.set(f.key, negativ(f.key)); w.reason.set(d.id, "artikelbereich-mehrdeutig-oder-fehlend");
    const z = await w.pruefe(); A.equal(z.beleg.schluessel, f.key);
    w.cache.set(f.key, { zustand: "belegt" }); A.equal(await w.pruefe(), null);
    A.equal(await w.pruefe(d, { deadlineMs: w.now() + 1 }), null);
    A.equal(Z.lese(z, { ...w.payload(d), quellenstaende: { [d.id]: "f".repeat(64) } }), null);
    for (const now of [() => NaN, () => Infinity, () => { throw Error("Uhr unbekannt"); }]) {
      const zeit = welt([dokument(90)]); zeit.negativ(); A.equal(await zeit.pruefe(undefined, { now }), null); A.deepEqual(zeit.reads, []);
    }
    const langsam = welt([dokument(91)]); langsam.negativ(); const lesen = langsam.speicher.lesen;
    langsam.speicher.lesen = async key => { const stand = await lesen(key); if (stand) langsam.advance(120000); return stand; };
    A.equal(await langsam.pruefe(), null);
  });
  await test("Keine neue Aufnahmeentscheidung im Legacy- oder abgeschalteten CASpfad, vorhandener Marker bleibt sicher", async () => {
    const w = welt(), d = [...w.docs.values()][0], z = await w.pruefe();
    const payload = { ...w.payload(d), artikelVerarbeitungszustand: z };
    w.deps.ladeRohdokumentStaende = fail("Artikelneuaufnahme");
    w.deps.eagerUnderstanding = fail("Modellaufruf bei vorhandenem Marker");
    const legacy = await P.HANDLER.document_understanding({ payload }, { ...w.deps, env: { ...ENV, HELMUT_SCALABLE_PIPELINE: "off" } });
    A.deepEqual(legacy.artikelAbseits, z);
    const off = await P.HANDLER.document_understanding({ payload }, { ...w.deps, env: { ...ENV, HELMUT_VERSTEHEN_CAS: "off" } });
    A.equal(off.grund, "verstehen-cas-erforderlich"); A.deepEqual(w.reads, []);
    const ungueltig = { ...w.payload(d), dokumente: [d], artikelVerarbeitungszustand: z };
    await A.rejects(() => P.HANDLER.document_understanding({ payload: ungueltig }, w.deps), /artikelinhalt-statt-speicherbindung/);
  });
  A.equal(count, nurOffene ? 5 : 8); A.deepEqual(verboten, []);
  console.log(nurOffene ? "5/5 offene Artikel-Abseits-Gruppen bestanden; 3 Erstlauf-PASS wiederverwendet, damaliger Gesamtlauf bleibt FAIL."
    : "8/8 neue Artikel-Abseits-Gruppen bestanden; keine Produktion, Modelle oder Alttestwiederholung.");
})().catch(e => { console.error(e); process.exitCode = 1; });
