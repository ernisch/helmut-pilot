"use strict";

// Neue Interaktionsgrenzen: echter CAS-Speicheradapter und reine Extraktion,
// synthetische Originale. Kein Original-GET, Provider, DB oder Alttestlauf.
const A = require("node:assert/strict"), crypto = require("node:crypto"), zlib = require("node:zlib"),
  W = require("../lib/helmut/artikelkontext-wiedergewinnung"), S = require("../lib/helmut/artikelkontext-belegspeicher"),
  B = require("../lib/helmut/artikelkontext-beschaffung"), G = require("../lib/helmut/artikelkontext-gewinnung"),
  Z = require("../lib/helmut/artikel-verarbeitungszustand"), P = require("../lib/helmut/scalable-pipeline"),
  D = require("../lib/helmut/dedup"), R = require("../lib/helmut/roh-quellenstaende"),
  V = require("../lib/helmut/verstehen-vertrag"), { hash } = require("../lib/helmut/quellen-lektuerebeleg"),
  { erzeugeSpeicherWarteschlange } = require("./fixtures/jobqueue-speicher-treiber");
if (process.argv.length !== 2) throw Error("Unbekannte Testauswahl");
const verboten = [], fail = name => () => { verboten.push(name); throw Error(name + " verboten"); };
global.fetch = fail("Netz"); require("node:https").request = fail("HTTPS"); require("node:http").request = fail("HTTP");
const ENV = { HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_SCALABLE_PIPELINE: "on", HELMUT_VERSTEHEN_CAS: "on",
  HELMUT_ARTIKELKONTEXT: "on", HELMUT_SOURCE_MODE: "on" }, START = Date.parse("2026-11-14T14:00:00.000Z"),
  OPTS = { versuch: true, kontext: "einstieg" }, REASON = "artikelbereich-mehrdeutig-oder-fehlend",
  clone = v => structuredClone(v), byteHash = v => crypto.createHash("sha256").update(v).digest("hex");
function dokument(n = 1) {
  return D.toRawDocumentRow({ title: "Synthetischer Ausschussbericht " + n,
    url: "https://www.bundestag.de/presse/synthetischer-bericht-" + n,
    sourceName: "Synthetische amtliche Quelle", sourceId: "synthetisch", sourceType: "official", linkType: "direct",
    publishedAt: "2026-11-13T10:00:00Z", retrievedAt: new Date(START).toISOString(), summary: null });
}
function html(d) {
  const text = `Der ${d.title} dokumentiert die Beratung des Ausschusses und die Anhoerung weiterer Sachverstaendiger zur praktischen Umsetzung der gesetzlichen Regeln.`;
  return `<html><head><link rel="canonical" href="${d.url}"><meta property="og:title" content="${d.title}">`
    + `<script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: d.title,
      datePublished: d.published_at, articleBody: text, url: d.url, mainEntityOfPage: d.url })}</script></head><body>`
    + `<article><h1>${d.title}</h1><p>${text}</p></article></body></html>`;
}
function negativ(key, reason = REASON) {
  return { version: 1, schluessel: key, versuchId: "00000000-0000-4000-8000-000000000001",
    reserviertAm: "2026-11-14T03:00:00.000Z", zustand: "luecke", abgeschlossenAm: "2026-11-14T03:00:01.000Z", reason };
}
function welt(n, original = {}) {
  const w = { doc: original.document || dokument(n), rows: new Map(), calls: [], fetches: 0, extraktionen: 0, zeit: START };
  w.now = () => new Date(w.zeit); w.advance = ms => { w.zeit += ms; };
  w.id = key => "synthetisch-artikelkontext-" + key;
  w.request = async (path, opts = {}) => {
    const u = new URL(path, "https://synthetischer-speicher.invalid"), method = opts.method || "GET",
      body = opts.body ? JSON.parse(opts.body) : null,
      id = method === "POST" ? body.id : (u.searchParams.get("id") || "").slice(3);
    w.calls.push({ method, id });
    if (w.onRequest) await w.onRequest({ method, id, body });
    const row = w.rows.get(id);
    if (method === "GET") return row ? [clone(row)] : [];
    if (method === "POST") {
      if (row) throw Error("duplicate"); w.rows.set(id, clone(body));
    } else if (method === "PATCH") {
      A.equal(u.searchParams.get("data->>zustand"), "eq.reserviert");
      if (row?.data?.zustand !== "reserviert" || "eq." + row.data.versuchId !== u.searchParams.get("data->>versuchId")) return [];
      row.data = clone(body.data);
    } else throw Error("Unerlaubte Testmutation " + method);
    if (w.afterWrite) await w.afterWrite({ method, id, body });
    return [{ id }];
  };
  w.speicher = S.erzeugeBelegspeicher({ request: w.request, storeId: "synthetisch" });
  w.key = S.bereiteArtikelkontextVor(w.doc, OPTS).key;
  w.alteRevision = W.erzeuge({ extraktorRevision: 1, extrahiere: () => ({ ok: false, reason: REASON }) });
  w.neueRevision = W.erzeuge({ extraktorRevision: 2, extrahiere: (...args) => {
    w.extraktionen++; return G.gewinneArtikeltext(...args);
  } });
  w.deps = (revision = w.alteRevision, extra = {}) => ({ env: ENV, speicher: w.speicher, wiedergewinnung: revision,
    now: w.now, deadlineMs: w.zeit + 180000, fetchUrl: async (url, retry, opts) => {
      w.fetches++; A.equal(url, w.doc.url); A.equal(retry, 0); A.equal(opts.artikelkontext, true); A.equal(opts.meldeStatus, true);
      return { status: 200, finalUrl: url, body: original.body || html(w.doc) };
    }, ...extra });
  w.capture = extra => B.beschaffeArtikelkontext(w.doc, OPTS, w.deps(w.alteRevision, extra));
  w.repair = extra => B.beschaffeArtikelkontext(w.doc, OPTS, w.deps(w.neueRevision,
    { fetchUrl: fail("Originalabruf bei Wiedergewinnung"), ...extra }));
  w.main = () => w.rows.get(w.id(w.key))?.data;
  w.writeCalls = () => w.calls.filter(c => c.method !== "GET");
  w.repariere = (revision = w.neueRevision) => revision.repariere({ doc: w.doc, key: w.key, stand: clone(w.main()),
    speicher: w.speicher, now: w.now, deadlineMs: w.zeit + 180000, pruefe: S.pruefeBelegstand });
  return w;
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log("PASS " + name); }
(async () => {
  await test("Kuenftiger vollstaendiger Negativabschluss sichert begrenztes Original kalt und gebunden", async () => {
    const w = welt(1); A.equal((await w.capture()).reason, REASON); A.equal(w.fetches, 1);
    const stand = w.main(), p = stand.originalAntwort; A.equal(stand.version, 2);
    A.equal(S.pruefeBelegstand(w.doc, w.key, stand, "einstieg").reason, REASON);
    A.equal(W.pointerGueltig(w.doc, w.key, p), true); A.equal(p.antwortHash, byteHash(html(w.doc)));
    A.equal(p.bytes, Buffer.byteLength(html(w.doc))); A.equal(p.gelesenAm, new Date(START).toISOString());
    A.equal(p.extraktorRevision, 1); A.equal(JSON.stringify(stand).includes("<html>"), false);
    const cold = w.rows.get(w.id(p.originalKey)).data;
    A.equal(cold.zustand, "belegt"); A.equal(cold.original.gzipBytes <= W.MAX_GZIP, true);
    A.equal(zlib.gunzipSync(Buffer.from(cold.original.gzip, "base64")).toString(), html(w.doc));
    A.equal(JSON.stringify(cold).includes("<html>"), false); A.equal(JSON.stringify(cold).includes("headers"), false);
    A.equal(w.rows.size, 2);
  });
  await test("Reine Leser und cacheOnly pruefen nur Pointer und Reparaturmetadaten ohne Body oder Schreibrecht", async () => {
    const w = welt(2); await w.capture(); const coldId = w.id(w.main().originalAntwort.originalKey), before = clone([...w.rows]); w.calls = [];
    w.onRequest = ({ id, method }) => { A.notEqual(id, coldId); A.equal(method, "GET"); };
    const opts = { ...OPTS, nurBestand: true }, deps = w.deps(w.neueRevision, { fetchUrl: fail("Readonly-Abruf") });
    A.equal((await B.beschaffeArtikelkontext(w.doc, opts, deps)).reason, "wiedergewinnung-fehlt");
    A.equal((await S.leseArtikelkontext(w.doc, deps)).reason, "wiedergewinnung-fehlt");
    A.deepEqual([...w.rows], before); A.equal(w.writeCalls().length, 0); A.equal(w.fetches, 1); A.equal(w.extraktionen, 0);
  });
  await test("Neue Parserrevision extrahiert dasselbe Original einmal rein und erhaelt Originalzeit und Altbelege", async () => {
    const w = welt(3); await w.capture(); const vor = clone([...w.rows]), gelesenAm = w.main().originalAntwort.gelesenAm;
    w.advance(3600000); const result = await w.repair(); A.equal(result.ok, true); A.equal(w.extraktionen, 1);
    A.equal(result.beleg.gelesenAm, gelesenAm); A.equal(result.beleg.gewinnung.antwortHash, w.main().originalAntwort.antwortHash);
    A.equal(result.beleg.gewinnung.verfahren, "artikeltext-v3"); A.equal(w.fetches, 1);
    for (const [id, row] of vor) A.deepEqual(w.rows.get(id), row);
    const repair = w.rows.get(w.id(W.repairKey(w.doc, 2))).data;
    A.equal(S.pruefeBelegstand(w.doc, W.repairKey(w.doc, 2), repair, "einstieg").ok, true);
    A.deepEqual(await w.repair(), result); A.deepEqual(await S.leseArtikelkontextStand(w.doc, OPTS,
      w.deps(w.neueRevision)), result); A.equal(w.extraktionen, 1); A.equal(w.rows.size, 3);
  });
  await test("Alte positive UNKNOWN kaputte und bodylose Staende erlauben weder neuen Abruf noch Reparaturkey", async () => {
    for (const change of [w => { w.rows.set(w.id(w.key), { id: w.id(w.key), data: negativ(w.key) }); },
      w => { const s = negativ(w.key); delete s.reason; s.zustand = "reserviert"; delete s.abgeschlossenAm;
        w.rows.set(w.id(w.key), { id: w.id(w.key), data: s }); },
      w => { w.main().unerlaubt = true; }]) {
      const w = welt(4); await w.capture(); change(w); const vor = clone([...w.rows]); w.calls = [];
      A.equal((await w.repair()).ok, false); A.equal(w.extraktionen, 0); A.equal(w.fetches, 1);
      A.equal(w.writeCalls().length, 0); A.deepEqual([...w.rows], vor);
    }
    for (const zustand of ["belegt", "reserviert"]) {
      const w = welt(40); await w.capture(); const alt = S.bereiteArtikelkontextVor(w.doc, {}), s = negativ(alt.key);
      delete s.reason; s.zustand = zustand;
      if (zustand === "belegt") { const r = G.gewinneArtikelkontext(w.doc,
        { body: html(w.doc), finalUrl: w.doc.url, gelesenAm: s.abgeschlossenAm }); A.equal(r.ok, true); s.beleg = r.beleg; }
      else delete s.abgeschlossenAm;
      w.rows.set(w.id(alt.key), { id: w.id(alt.key), data: s }); const vor = clone([...w.rows]); w.calls = [];
      const r = await w.repair(); A.equal(r.ok, false);
      A.equal(r.reason, zustand === "belegt" ? "gewinnungsverfahren-abweichend" : "abruf-ausgang-offen");
      A.deepEqual([...w.rows], vor); A.equal(w.writeCalls().length, 0); A.equal(w.extraktionen, 0);
    }
    const fehlend = welt(41); await fehlend.capture(); fehlend.rows.delete(fehlend.id(fehlend.main().originalAntwort.originalKey));
    const vor = clone([...fehlend.rows]); A.equal((await fehlend.repair()).reason, "originalantwort-nicht-pruefbar");
    A.deepEqual([...fehlend.rows], vor); A.equal(fehlend.extraktionen, 0);
  });
  await test("UTF8 Kompressions und Dekompressionsgrenzen sowie Bytehashes sperren manipulierte Originale", async () => {
    for (const body of ["x".repeat(W.MAX_BYTES + 1), crypto.randomBytes(320000).toString("base64"), "\ud800"]) {
      const w = welt(5), p = await w.alteRevision.sichere({ doc: w.doc, key: w.key, antwort: { status: 200, body, finalUrl: w.doc.url },
        gelesenAm: w.now().toISOString(), speicher: w.speicher, now: w.now });
      A.equal(p, null); A.equal(w.rows.size, 0);
    }
    for (const change of [w => { w.rows.get(w.id(w.main().originalAntwort.originalKey)).data.original.gzip += "!"; },
      w => { w.rows.get(w.id(w.main().originalAntwort.originalKey)).data.original.antwortHash = "0".repeat(64); },
      w => {
        const p = w.main().originalAntwort, gzip = zlib.gzipSync(Buffer.alloc(W.MAX_BYTES + 1, 97));
        p.bytes = W.MAX_BYTES; p.gzipBytes = gzip.length; p.gzipHash = byteHash(gzip);
        const { hash: _, ...basis } = p; p.hash = hash(basis);
        w.rows.get(w.id(p.originalKey)).data.original = { ...clone(p), gzip: gzip.toString("base64") };
      }]) {
      const w = welt(50); await w.capture(); change(w); w.calls = [];
      A.equal((await w.repair()).ok, false); A.equal(w.extraktionen, 0); A.equal(w.writeCalls().length, 0);
    }
  });
  await test("CAS Antwortverlust und negative Reparaturen bleiben einmalig UNKNOWN blockiert weitere Revisionen", async () => {
    const w = welt(6); await w.capture(); const repairId = w.id(W.repairKey(w.doc, 2));
    w.afterWrite = ({ id }) => { if (id === repairId) throw Error("Schreibantwort verloren"); };
    A.equal((await w.repair()).ok, true); A.equal(w.extraktionen, 1); A.equal((await w.repair()).ok, true); A.equal(w.extraktionen, 1);
    const unknown = welt(60); await unknown.capture(); const id = unknown.id(W.repairKey(unknown.doc, 2));
    unknown.onRequest = ({ id: key, method }) => { if (key === id && method === "PATCH") throw Error("Abschluss unbekannt"); };
    A.equal((await unknown.repair()).ok, false); A.equal(unknown.extraktionen, 1);
    A.equal((await unknown.repair()).ok, false); A.equal(unknown.extraktionen, 1);
    const drei = W.erzeuge({ extraktorRevision: 3, extrahiere: fail("Revisionescape") });
    A.equal((await unknown.repariere(drei)).ergebnis.ok, false); A.equal(unknown.rows.has(unknown.id(W.repairKey(unknown.doc, 3))), false);
    const neg = welt(61); await neg.capture(); let anzahl = 0;
    const rev = W.erzeuge({ extraktorRevision: 2, extrahiere: () => { anzahl++; return { ok: false, reason: REASON }; } });
    A.equal((await neg.repariere(rev)).ergebnis.reason, REASON); A.equal((await neg.repariere(rev)).ergebnis.reason, REASON); A.equal(anzahl, 1);
  });
  await test("Falsche Quell oder Zeitbindung erzeugt keinen positiven Reparaturbeleg und niemals neue Frische", async () => {
    const w = welt(7); await w.capture(); const original = clone(w.main()), fremd = dokument(71);
    A.equal(await w.neueRevision.repariere({ doc: fremd, key: w.key, stand: original, speicher: w.speicher,
      now: w.now, pruefe: S.pruefeBelegstand }), null); A.equal(w.extraktionen, 0);
    const rev = W.erzeuge({ extraktorRevision: 2, extrahiere: (d, r, opts) => {
      const x = G.gewinneArtikeltext(d, r, opts); A.equal(x.ok, true); x.beleg.gelesenAm = new Date(START + 1000).toISOString(); return x;
    } });
    w.advance(2000); A.equal((await w.repariere(rev)).ergebnis.ok, false);
    A.equal(w.rows.get(w.id(W.repairKey(w.doc, 2))).data.zustand, "reserviert"); A.deepEqual(w.main(), original);
    A.equal(w.main().originalAntwort.gelesenAm, new Date(START).toISOString());
    for (const value of [undefined, "kaputt", "2026-11-15T00:00:00.000Z"]) {
      const p = clone(original.originalAntwort); p.gelesenAm = value; A.equal(W.pointerGueltig(w.doc, w.key, p), false);
    }
  });
  await test("Originaljob entfernt Abseits nur nach FortschrittCAS und laesst bezahltes UNKNOWN unangetastet", async () => {
    const w = welt(8); await w.capture(); const payload = { dokumentIds: [w.doc.id], quellenstaende: { [w.doc.id]: R.standHash(w.doc) } };
    const marker = await Z.pruefe({ dokument: w.doc, payload, befund: [{ id: w.doc.id, status: "luecke", reason: REASON }],
      now: () => w.zeit, deadlineMs: w.zeit + 120000 }, { env: ENV, artikelBelegspeicher: w.speicher, wiedergewinnung: w.alteRevision });
    A.equal(marker.beleg.gepruefteRevision, 1); payload.artikelVerarbeitungszustand = marker;
    const q = erzeugeSpeicherWarteschlange({ now: () => w.zeit }); await q.enqueue({ jobType: "document_understanding",
      idempotencyKey: "artikel-original-" + w.doc.id, freshnessWindow: "2026-11-14T00Z", tenantId: null,
      priority: 80, maxAttempts: 3, payload: clone(payload) });
    let fehler = true, modelle = 0, vertragsproben = 0;
    const koId = "synthetischer-originalvorgang", input = V.eingabeHash({ vorgangId: koId, dokumente: [w.doc] }),
      vertrag = V.baueVertrag({ env: ENV, besitzer: "synthetischer-besitzer", deps: { speicher: {
        verstehenReserviere: async args => { vertragsproben++; A.equal(args.vorgangId, koId); A.equal(args.eingabeHash, input);
          return { verfuegbar: true, erlaubt: false, grund: "ausgang-unbekannt", zustand: "ausgang-unbekannt" }; },
        verstehenModellstart: fail("UNKNOWN-Modellstart"), verstehenSpeichere: fail("UNKNOWN-KOwrite") } } });
    const deps = { env: ENV, now: () => w.zeit, handler: P.HANDLER, artikelBelegspeicher: w.speicher, wiedergewinnung: w.neueRevision,
      klassen: { belege: async () => ({ erlaubt: true, slot: "synthetisch" }), gebeFrei: async () => {} },
      ladeRohdokumente: fail("Ungebundene Artikellesung"), ladeRohdokumentStaende: async () => [clone(w.doc)],
      listFullProfiles: async () => [{ id: "synthetisches-mandat", fullName: "Synthetisches Mandat", party: "SPD",
        parliamentType: "Bundestag", state: "Berlin", focusTopics: ["Arbeit"] }],
      vorbereiteGespeicherteInhalte: async ({ dokumente }) => {
        const r = await S.leseArtikelkontextStand(w.doc, OPTS, { speicher: w.speicher, wiedergewinnung: w.neueRevision });
        A.equal(r.ok, true);
        const projektion = dokumente.map(d => ({ ...d, summary: r.beleg.text,
          artikelkontext: { beleg: r.beleg, auszugVorher: d.summary ?? null } }));
        A.equal(require("../lib/helmut/quellen-auszug").artikelkontextHerkunft(projektion[0]).verfahren, "artikeltext-v3");
        return { dokumente: projektion, befund: [{ id: w.doc.id, status: "belegt" }],
          artikelkontextVersorgung: async () => ({ angefordert: false }), fortsetzungOffen: false };
      },
      verstehenKonkurrenz: () => false, eagerUnderstanding: async () => {
        const r = await vertrag.reserviere({ vorgangId: koId, eingabeHash: input }); A.equal(r.erlaubt, false);
        if (r.erlaubt) modelle++; return { processed: 0, results: [{ status: "deferred", reason: r.grund }] };
      }, extendLease: q.extendLease, zurueckstellen: q.zurueckstellen, finish: q.finish,
      fortschritt: async o => { if (fehler) return { verfuegbar: false }; const row = q.hole(o.id);
        if (row.status !== "laeuft" || row.lease_owner !== o.owner || hash(row.payload) !== hash(o.vorher)) return { verfuegbar: true, uebernommen: false };
        row.payload = clone(o.payload); return { verfuegbar: true, uebernommen: true }; } };
    const run = async () => { const a = (await q.claim({ owner: "synthetisch", limit: 1, leaseMs: 120000 })).auftraege[0];
      A.ok(a); return P.fuehreAuftragAus({ auftrag: a, besitzer: "synthetisch", deps }); };
    A.equal((await run()).ausgang, "fortschritt-nicht-uebernommen"); A.equal(w.extraktionen, 1);
    A.deepEqual(q.alle()[0].payload, payload); A.equal(vertragsproben, 0);
    w.advance(121000); fehler = false; A.equal((await run()).ausgang, "zurueckgestellt");
    const weiter = q.alle()[0].payload; A.equal(weiter.artikelVerarbeitungszustand, undefined);
    A.equal(weiter.artikelWiedergewinnung.reparaturHash, hash(w.rows.get(w.id(W.repairKey(w.doc, 2))).data));
    A.deepEqual(weiter.quellenstaende, payload.quellenstaende); A.equal(vertragsproben, 0); A.equal(w.extraktionen, 1);
    w.advance(300000); await run(); A.equal(vertragsproben, 1); A.equal(modelle, 0); A.equal(w.fetches, 1);
  });
  await test("Optionale Kaltablage respektiert absolute Frist und laesst Hauptnegativabschluss seine Reserve", async () => {
    for (const rest of [undefined, 10000, NaN]) {
      const w = welt(9); A.equal((await w.capture({ deadlineMs: rest === undefined ? undefined : w.zeit + rest })).reason, REASON);
      A.equal(w.main().version, 1); A.equal(w.main().zustand, "luecke"); A.equal(w.rows.size, 1);
    }
    const langsam = welt(90), deadlineMs = langsam.zeit + 60000;
    langsam.onRequest = ({ id }) => { if (id !== langsam.id(langsam.key)) langsam.advance(6000); };
    A.equal((await langsam.capture({ deadlineMs })).reason, REASON);
    A.equal(langsam.main().zustand, "luecke"); A.equal(deadlineMs - langsam.zeit >= 21000, true);
    const offen = welt(91), frist = offen.zeit + 60000;
    offen.onRequest = ({ id }) => { if (id !== offen.id(offen.key)) offen.advance(50000); };
    A.equal((await offen.capture({ deadlineMs: frist })).reason, "abschluss-restzeit-nicht-bestaetigt");
    A.equal(offen.main().zustand, "reserviert"); const requests = offen.fetches;
    A.equal((await offen.repair()).ok, false); A.equal(offen.fetches, requests);
    const ohneBody = welt(92); await ohneBody.capture({ deadlineMs: undefined }); const vorher = clone([...ohneBody.rows]);
    A.equal((await ohneBody.repair()).reason, REASON); A.deepEqual([...ohneBody.rows], vorher); A.equal(ohneBody.extraktionen, 0);
  });
  await test("Aktuelle BMG-Revision gewinnt den gespeicherten Redeneinstieg einmal ohne Originalabruf zurueck", async () => {
    A.equal(W.REVISION, 2); A.equal(W.standard.revision, 2);
    const d = D.toRawDocumentRow({ title: "Synthetische Beratung - Bundesministerium für Gesundheit (BMG)",
      url: "https://www.bundesgesundheitsministerium.de/presse/reden/synthetische-beratung",
      sourceName: "Bundesministerium für Gesundheit (BMG)", sourceId: "synthetisch-bmg", sourceType: "official",
      linkType: "direct", publishedAt: "2026-11-13T10:00:00Z", retrievedAt: new Date(START).toISOString(), summary: null });
    const intro = "Der Bundestag hat die Reform der Pflegeversicherung in erster Lesung beraten. Der folgende Originalabsatz beschreibt die Beratung ohne ihren Abschluss zu behaupten.";
    const body = `<html><head><link rel="canonical" href="${d.url}"><meta property="og:type" content="article">`
      + `<meta property="og:title" content="Synthetische Beratung"><meta property="og:url" content="${d.url}"></head>`
      + `<body><main class="c-main" id="main"><article class="c-article" id="article">`
      + `<div class="article" itemscope="itemscope" itemtype="http://schema.org/Article">`
      + `<div class="c-page-title"><h1>Synthetische Beratung</h1><p>${intro}</p></div>`
      + `<div class="c-component c-component--page-date"><span>13. November 2026</span></div>`
      + `</div></article></main></body></html>`;
    const w = welt(10, { document: d, body }); await w.capture(); const before = clone([...w.rows]);
    const run = () => B.beschaffeArtikelkontext(w.doc, OPTS, w.deps(W.standard, { fetchUrl: fail("BMG Original erneut") }));
    const result = await run(); A.equal(result.ok, true, result.reason); A.equal(result.beleg.text, intro);
    A.equal(result.beleg.gewinnung.verfahren, "artikel-einstieg-v2"); A.equal(result.beleg.gelesenAm, new Date(START).toISOString());
    A.equal(w.fetches, 1); for (const [id, row] of before) A.deepEqual(w.rows.get(id), row);
    const saved = clone([...w.rows]); A.deepEqual(await run(), result); A.deepEqual([...w.rows], saved); A.equal(w.fetches, 1);
  });
  A.equal(count, 10); A.deepEqual(verboten, []);
  console.log("10/10 Wiedergewinnungsgruppen bestanden; keine Produktion, Originalabrufe oder Modelle.");
})().catch(e => { console.error(e); process.exitCode = 1; });
