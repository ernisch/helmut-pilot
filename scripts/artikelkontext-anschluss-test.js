"use strict";

// Echte Ausfuehrung, Beschaffung, Auswahl und Fachpfade; isolierter Speicher/Transport/LLM.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const U = require("../lib/helmut/understanding");
const L = require("../lib/helmut/artikelkontext-lauf");
const V = require("../lib/helmut/verstehen-vertrag");
const { laufBilanz } = require("../lib/helmut/lauf-bilanz");
const env = { HELMUT_ARTIKELKONTEXT: "on", HELMUT_ANBIETER_STEUERUNG: "on" };
const doc = { id: "rd-synthetisch", title: "Bahnkonferenz: Neue Strecken nach Neustadt",
  summary: "Die Bahnkonferenz sollte neue Verbindungen ermoeglichen.",
  url: "https://example.org/politik/bahnkonferenz", canonical_url: "https://example.org/politik/bahnkonferenz",
  published_at: "2026-09-14T12:00:00Z", source_name: "Beispielmedium", source_type: "media", link_type: "direct" };
const text = "Die Bahnkonferenz endete mit einer Erklaerung. Neue Strecken nach Neustadt sollen gemeinsam geplant werden.";
const analyse = { headline: doc.title, was_ist_passiert: "Synthetischer Testinhalt", warum_wichtig: "Test", wer_ist_betroffen: "Test",
  parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel", handlungsempfehlung: "Test",
  confidence_score: 70, display_title: doc.title, display_summary: "Synthetischer Testinhalt",
  why_relevant: "Test", recommendation: "Test", display_category: "Verkehr" };
function antwort(d) {
  const data = { "@type": "NewsArticle", headline: d.title, mainEntityOfPage: d.url, articleBody: d.summary + " " + text };
  return { finalUrl: d.url, body: `<html><head><link rel="canonical" href="${d.url}"><meta property="og:title" content="${d.title}">`
    + `<script type="application/ld+json">${JSON.stringify(data)}</script></head><body><article><p>${d.summary}</p><p>${text}</p></article></body></html>` };
}
function stand(dokumente = [doc]) {
  const p = { rows: new Map(), abrufe: [], reads: 0, writes: 0, prompts: [], hashes: [], budget: 0, marker: [], pending: [], links: [], kos: [] };
  const beschaffung = { now: () => new Date("2026-09-17T20:00:00.000Z"),
    fetchUrl: async url => { p.abrufe.push(url); return antwort(dokumente.find(d => d.url === url)); },
    speicher: {
      lesen: async key => { p.reads++; return structuredClone(p.rows.get(key) ?? null); },
      reservieren: async (key, data) => { p.writes++; if (p.rows.has(key)) throw Error("duplicate"); p.rows.set(key, structuredClone(data)); },
      abschliessen: async (key, versuch, data) => {
        p.writes++;
        if (p.rows.get(key)?.zustand === "reserviert" && p.rows.get(key)?.versuchId === versuch) p.rows.set(key, structuredClone(data));
      }
    } };
  const vertrag = {
    reserviere: async args => { p.hashes.push(args.eingabeHash); return { erlaubt: true, fencing: 1 }; },
    modellstart: async () => ({ erlaubt: true }), schreibrecht: async () => ({ erlaubt: true }),
    speichere: async ({ ko }) => { p.kos.push(ko); return { gespeichert: true, pruefbar: true }; },
    freigabe: async () => {}, freigabeOhneAufruf: async () => {},
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
    vormerkungErhoehe: async args => { p.marker.push(args); }, vormerkungLoese: async () => {}
  };
  const deps = { enabled: () => true, aiEnabled: () => true, acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
    getExisting: async () => null, findVorgangCandidates: async () => [], listVorgangDocuments: async () => dokumente,
    listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [] }),
    listPending: async () => [{ id: "ko-vg-test", vorgang_id: "vg-test", status: "pending" }],
    verstehenVertrag: () => vertrag, gateMode: () => "off", priorityEnabled: () => false, verstehenParallelitaet: 1,
    canSpend: async () => { p.budget++; return { allowed: true }; },
    requestUnderstanding: async prompt => { p.prompts.push(prompt); return { ...analyse }; },
    save: async () => { throw Error("Unbedingtes Schreiben verboten"); },
    saveSources: async (id, docs) => { p.links.push({ id, docs }); },
    savePending: async id => { p.pending.push(id); return { saved: true, id: "ko-" + id }; },
    markFailed: async () => {}, modelName: () => "isolierte-attrappe", logSkip: () => {},
    deadlineMs: Date.now() + 300000, budgetMs: 240000 };
  const lauf = (changes = {}, flags = env) => L.mitArtikelkontext({ ...deps, ...changes }, flags, beschaffung);
  return { p, beschaffung, vertrag, deps, lauf };
}
const rows = prompt => prompt.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(JSON.parse);
const run = (s, documents = [doc], options = {}) => U.understandOneCluster({ documents }, s.lauf(),
  { vorgangId: "vg-test", existing: null, ...options });
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("Default AUS und unbekannter Schalter reichen exakt die bisherigen Optionen weiter", async () => {
  const s = stand();
  for (const value of [undefined, "off", "true", "ON"]) assert.equal(L.mitArtikelkontext(s.deps, { HELMUT_ARTIKELKONTEXT: value }, s.beschaffung), s.deps);
  await U.understandOneCluster({ documents: [doc] }, s.lauf({}, {}), { vorgangId: "vg-test", existing: null });
  assert.equal(s.p.reads, 0); assert.equal(s.p.abrufe.length, 0);
  assert.equal(s.p.prompts[0], U.buildUnderstandingPrompt({ documents: [doc] }));
  assert.equal(s.p.hashes[0], V.eingabeHash({ vorgangId: "vg-test", dokumente: [doc], modus: "erst" }));
});
test("Beide regulaeren Einstiege reichen den begrenzten Anschluss weiter", async () => {
  const old = process.env.HELMUT_ARTIKELKONTEXT;
  process.env.HELMUT_ARTIKELKONTEXT = "on"; // ausschliesslich isolierter Testkindprozess
  try {
    for (const name of ["runUnderstandingShadow", "runPendingUnderstandingShadow"]) {
      const original = U[name];
      try {
        U[name] = async (docs, opts) => { assert.equal(docs[0], doc); assert.equal(typeof opts.artikelkontextVersorgung, "function"); return "weitergereicht"; };
        assert.equal(await L[name]([doc], {}), "weitergereicht");
      } finally { U[name] = original; }
    }
  } finally { if (old === undefined) delete process.env.HELMUT_ARTIKELKONTEXT; else process.env.HELMUT_ARTIKELKONTEXT = old; }
});
test("Regulaerer Pendinglauf liefert bestaetigten Absatz ohne manuelle Belegoption an den echten Fachpfad", async () => {
  const s = stand(), before = structuredClone(doc);
  const result = await U.runPendingUnderstandingShadow([], s.lauf());
  assert.equal(result.counts.saved, 1, JSON.stringify(result)); assert.equal(s.p.abrufe.length, 1); assert.equal(s.p.writes, 2);
  assert.equal(rows(s.p.prompts[0])[0].artikelkontext.text, text);
  assert.equal(rows(s.p.prompts[0]).length, 1); assert.equal(rows(s.p.prompts[0])[0].auszug, doc.summary);
  const basis = V.eingabeHash({ vorgangId: "vg-test", dokumente: [doc], modus: "erst" });
  const hash = crypto.createHash("sha256").update(JSON.stringify(["artikelkontext-v1", basis, s.p.prompts[0]])).digest("hex").slice(0, 40);
  assert.equal(s.p.hashes[0], hash); assert.deepEqual(doc, before);
});
test("Wiederaufnahme liest denselben Beleg; Uhrwechsel erzeugt weder neuen Abruf noch neue Eingabe", async () => {
  const s = stand(); await run(s);
  s.beschaffung.now = () => new Date("2027-01-01T00:00:00.000Z");
  await run(s);
  assert.equal(s.p.abrufe.length, 1); assert.equal(s.p.writes, 2); assert.equal(s.p.reads, 4);
  assert.equal(s.p.prompts[0], s.p.prompts[1]); assert.equal(s.p.hashes[0], s.p.hashes[1]);
});
test("Ein neuer Abruf je Lauf auch parallel; bestaetigter Bestand verbraucht keinen Platz", async () => {
  const other = { ...doc, id: "rd-zweit", url: doc.url + "-zwei", canonical_url: doc.url + "-zwei" };
  const s = stand([doc, other]), provider = s.lauf().artikelkontextVersorgung;
  const both = await Promise.all([doc, other].map(d => provider([d], { cas: true })));
  assert.equal(s.p.abrufe.length, 1); assert(both.some(r => r.reason === "laufgrenze"));
  assert.equal(s.p.rows.size, 1, "Vertagung reserviert keinen zweiten Dokumentstand");
  const next = s.lauf().artikelkontextVersorgung;
  assert.equal((await next([doc], { cas: true })).ok, true);
  assert.equal((await next([other], { cas: true })).ok, true);
  assert.equal(s.p.abrufe.length, 2);
});
test("Fehlende Belegbestaetigung stoppt vor CAS und Modell; kein anderer Artikel als Ersatz", async () => {
  const s = stand(); s.beschaffung.speicher.abschliessen = async () => {};
  const result = await run(s);
  assert.equal(result.status, "skipped-artikelkontext"); assert.equal(result.reason, "abschluss-nicht-bestaetigt");
  assert.equal(s.p.budget, 0); assert.equal(s.p.hashes.length, 0); assert.equal(s.p.prompts.length, 0);
  assert.equal((await run(s)).reason, "abruf-ausgang-offen"); assert.equal(s.p.abrufe.length, 1);
});
test("Eagerlauf merkt Kontextluecke vor und bilanziert sie als offen ohne Endzustand", async () => {
  const s = stand(); s.beschaffung.fetchUrl = async () => { s.p.abrufe.push(doc.url); throw Error("isolierter Fehler"); };
  const result = await U.runUnderstandingShadow([doc], s.lauf());
  assert.equal(result.counts["skipped-artikelkontext"], 1); assert.equal(result.vorgemerkt, 1);
  assert.equal(s.p.pending.length, 1); assert.equal(s.p.links.length, 1);
  assert.equal(result.telemetrie.dokumenteMitEndzustand, 0);
  assert.equal(result.telemetrie.gruppen.erneut, 1);
  assert.equal(laufBilanz(result).status, "blocked"); assert.equal(laufBilanz(result).stimmig, true);
  await U.runUnderstandingShadow([doc], s.lauf()); assert.equal(s.p.abrufe.length, 1);
});
test("Aktualisierung versorgt die gesamte bestehende Auswahl und wahrt die Versionsbindung", async () => {
  const s = stand();
  const result = await U.understandUpdate({ documents: [], anchors: [] }, s.lauf(), {
    vorgangId: "vg-test", existing: { id: "ko-vg-test", ko_version: 4 }, neueDocs: [], alleDocs: [doc], neueAnker: [], spur: {} });
  assert.equal(result.status, "updated"); assert.equal(result.koVersion, 5);
  assert.equal(rows(s.p.prompts[0])[0].artikelkontext.text, text);
  const basis = V.eingabeHash({ vorgangId: "vg-test", dokumente: [doc], modus: "update", koVersion: 5 });
  assert.equal(s.p.hashes[0], crypto.createHash("sha256").update(JSON.stringify(["artikelkontext-v1", basis, s.p.prompts[0]])).digest("hex").slice(0, 40));
});
test("Offene Aktualisierung bleibt ohne Fehlversuch vorgemerkt; alle drei Weiterleitungen sind angeschlossen", async () => {
  for (const mode of ["neu", "vorgemerkt", "freigegeben"]) {
    const s = stand();
    if (mode === "neu") s.deps.listVorgangDocuments = async () => [{ ...doc, id: "rd-alt", title: "Konferenz beginnt", summary: "Teilnehmende treffen ein." }];
    if (mode === "vorgemerkt") s.vertrag.vormerkungLese = async () => ({ verfuegbar: true, vorhanden: true, fehlversuche: 0 });
    s.beschaffung.speicher.lesen = async () => { s.p.reads++; throw Error("Leseausfall"); };
    const result = await run(s, [doc], { existing: { id: "ko-vg-test", status: "active", ko_version: 1 }, wiederaufnahmeFreigabe: mode === "freigegeben" });
    assert.equal(result.status, "skipped-artikelkontext", mode); assert.equal(result.modus, "update");
    assert.equal(s.p.marker.length, 1); assert.equal(s.p.marker[0].delta, 0); assert.equal(s.p.prompts.length, 0);
  }
});
test("Terminale, fehlgeschlagene und echte Duplikate loesen keine Kontextbeschaffung aus", async () => {
  for (const existing of [{ id: "ko-vg-test", status: "active" },
    { id: "ko-vg-test", status: "pending", understanding_status: "failed-final" },
    { id: "ko-vg-test", status: "pending", understanding_status: "failed" }]) {
    const s = stand(); await run(s, [doc], { existing }); assert.equal(s.p.reads, 0); assert.equal(s.p.abrufe.length, 0);
  }
});
test("CAS, Anbietersteuerung und absolute Restzeit sperren vor neuen Nebenwirkungen", async () => {
  const s = stand();
  assert.equal((await run(s, [doc], { vertrag: null })).reason, "cas-erforderlich"); assert.equal(s.p.reads, 0);
  const provider = s.lauf({ deadlineMs: 0, budgetMs: 0 }).artikelkontextVersorgung;
  assert.equal((await provider([doc], { cas: true })).reason, "deadline-erforderlich"); assert.equal(s.p.reads, 0);
  const short = s.lauf({ deadlineMs: Date.now() + 80000 }).artikelkontextVersorgung;
  assert.equal((await short([doc], { cas: true })).reason, "restzeit-vor-abruf"); assert.equal(s.p.writes, 0);
  const noProvider = s.lauf({}, { HELMUT_ARTIKELKONTEXT: "on" }).artikelkontextVersorgung;
  assert.equal((await noProvider([doc], { cas: true })).reason, "anbietersteuerung-nicht-aktiv"); assert.equal(s.p.writes, 0);
  assert.equal((await run(s, [doc], { deadlineMs: Date.now() - 1 })).status, "skipped-zeitbudget");
  assert.equal(s.p.prompts.length, 0);
});
test("Nach langsamer Beschaffung kein Modellstart, bestaetigter Beleg bleibt fuer spaeter erhalten", async () => {
  const s = stand(), originalNow = Date.now, start = originalNow(); let now = start;
  Date.now = () => now;
  try {
    s.beschaffung.fetchUrl = async () => { now = start + 230000; return antwort(doc); };
    const result = await run(s);
    assert.equal(result.reason, "restzeit-nach-beschaffung"); assert.equal(s.p.prompts.length, 0);
    assert.equal([...s.p.rows.values()][0].zustand, "belegt");
  } finally { Date.now = originalNow; }
});
test("Die engere Kontextfrist gilt nach Beleglesung auch vor dem Modellstart beider Fachpfade", async () => {
  const originalNow = Date.now, start = originalNow(); let now = start;
  Date.now = () => now;
  try {
    for (const mode of ["erst", "update"]) {
      now = start;
      const s = stand();
      assert.equal((await s.lauf().artikelkontextVersorgung([doc], { cas: true })).ok, true);
      const lesen = s.beschaffung.speicher.lesen, reserviere = s.vertrag.reserviere;
      s.beschaffung.speicher.lesen = async key => { now += 8000; return lesen(key); };
      s.vertrag.reserviere = async args => { now += 8000; return reserviere(args); };
      let modellstarts = 0, freigaben = 0;
      s.vertrag.modellstart = async () => { modellstarts++; return { erlaubt: true }; };
      s.vertrag.freigabe = async () => { freigaben++; };
      const deps = s.lauf({ budgetMs: 70000, deadlineMs: start + 300000 });
      const result = mode === "erst"
        ? await U.understandOneCluster({ documents: [doc] }, deps, { vorgangId: "vg-test", existing: null })
        : await U.understandUpdate({ documents: [], anchors: [] }, deps, {
          vorgangId: "vg-test", existing: { id: "ko-vg-test", ko_version: 4 }, neueDocs: [], alleDocs: [doc], neueAnker: [], spur: {} });
      assert.equal(result.status, "skipped-zeitbudget", mode);
      assert.equal(result.restMs, 54000); assert.equal(result.reserveMs, 55000);
      assert.equal(modellstarts, 0); assert.equal(s.p.prompts.length, 0);
      assert.equal(freigaben, 1, "Reservierung bleibt sicher wiederholbar");
      assert.equal(s.p.abrufe.length, 1, "Bestaetigter Beleg wird wiederverwendet");
      if (mode === "update") assert.equal(s.p.marker[0].delta, 0);
    }
  } finally { Date.now = originalNow; }
});
test("Friststart vor dem Vorlauf und kleinere absolute Frist bleiben fuer beide Schleifen verbindlich", async () => {
  const originalNow = Date.now, start = originalNow(); let now = start;
  Date.now = () => now;
  try {
    for (const name of ["runUnderstandingShadow", "runPendingUnderstandingShadow"]) {
      for (const absolute of [50000, 300000]) {
        now = start;
        const s = stand();
        s.deps.acquireLock = async () => { now += 16000; return { granted: true }; };
        const result = await U[name]([doc], s.lauf({ budgetMs: 70000, deadlineMs: start + absolute }));
        assert.equal(result.artikelkontextZeitVertagt, 1, name + absolute);
        assert.equal(result.deferred, 1); assert.equal(s.p.prompts.length, 0);
        assert.equal(s.p.reads, 0); assert.equal(s.p.hashes.length, 0);
        if (name === "runUnderstandingShadow") assert.equal(result.vorgemerkt, 1);
      }
    }
  } finally { Date.now = originalNow; }
});
test("Zeitvertagter Auftrag bleibt vorgemerkt, gibt nur frisches Budget frei und setzt spaeter fort", async () => {
  const SP = require("../lib/helmut/scalable-pipeline"), originalNow = Date.now, start = originalNow(); let now = start;
  const rawDoc = require("../lib/helmut/dedup").toRawDocumentRow(doc);
  Date.now = () => now;
  try {
    for (const wiederverwendet of [false, true]) {
      now = start;
      const s = stand([rawDoc]);
      assert.equal((await s.lauf().artikelkontextVersorgung([rawDoc], { cas: true })).ok, true);
      const lesen = s.beschaffung.speicher.lesen, reserviere = s.vertrag.reserviere;
      s.beschaffung.speicher.lesen = async key => { now += 8000; return lesen(key); };
      s.vertrag.reserviere = async args => { now += 8000; return reserviere(args); };
      const meldungen = [];
      let laufErgebnis;
      const deps = { verstehenKonkurrenz: () => false,
        budget: { reserviere: async () => ({ erlaubt: true, wiederverwendet }), melde: async m => { meldungen.push(m); } },
        eagerUnderstanding: async (docs, options) => (laufErgebnis = await U.runUnderstandingShadow(docs, s.lauf(options))) };
      const job = { id: "isoliert", payload: { dokumente: [rawDoc], budgetMs: 70000 }, createdAt: new Date(start).toISOString() };
      const result = await SP.HANDLER.document_understanding(job, deps, { auftragsDeadlineMs: start + 300000 });
      assert.equal(result.ok, false); assert.equal(result.zurueckgestellt, true);
      assert.equal(result.grund, "verstehen-uebersprungen: artikelkontext-zeitbudget");
      assert.equal(laufErgebnis.counts["skipped-zeitbudget"], 1); assert.equal(laufErgebnis.artikelkontextZeitVertagt, 1);
      assert.equal(laufErgebnis.vorgemerkt, 1); assert.equal(s.p.pending.length, 1);
      assert.equal(laufBilanz(laufErgebnis).status, "blocked");
      assert.equal(laufBilanz(laufErgebnis).fehlerklasse, "artikelkontext-zeitbudget");
      assert.equal(s.p.prompts.length, 0); assert.equal(meldungen[0].ungenutzt, !wiederverwendet);
      s.beschaffung.speicher.lesen = lesen; s.vertrag.reserviere = reserviere;
      s.deps.listPending = async () => s.p.pending.map(vorgang_id => ({ id: "ko-" + vorgang_id, vorgang_id, status: "pending" }));
      const later = await U.runPendingUnderstandingShadow([], s.lauf({ budgetMs: 240000, deadlineMs: now + 280000 }));
      assert.equal(later.counts.saved, 1); assert.equal(later.artikelkontextZeitVertagt, 0);
      assert.equal(s.p.hashes[1], s.p.hashes[0], "Fortsetzung derselben vorgemerkten Eingabe");
      assert.equal(s.p.prompts.length, 1); assert.equal(s.p.abrufe.length, 1);
      assert.equal(rows(s.p.prompts[0])[0].artikelkontext.text, text);
    }
  } finally { Date.now = originalNow; }
});
test("60 Sekunden erweitern sich nicht; Teilerfolg und noch nicht besuchte Cluster bleiben offen", async () => {
  const SP = require("../lib/helmut/scalable-pipeline");
  const s = stand();
  assert.equal((await s.lauf().artikelkontextVersorgung([doc], { cas: true })).ok, true);
  const short = await U.runUnderstandingShadow([doc], s.lauf({ budgetMs: 60000 }));
  assert.equal(short.counts["skipped-artikelkontext"], 1); assert.equal(s.p.prompts.length, 0);
  assert.equal(s.p.reads, 3, "Kurzer Lauf beginnt keine zusaetzliche Beleglesung");
  const job = { id: "isoliert", payload: { dokumente: [doc] }, createdAt: new Date().toISOString() };
  for (const result of [
    { processed: 2, counts: { saved: 1, "skipped-zeitbudget": 1 }, artikelkontextZeitVertagt: 1 },
    { processed: 1, deferred: 1, counts: { saved: 1 }, artikelkontextZeitVertagt: 1 },
    { processed: 0, deferred: 1, counts: {}, artikelkontextZeitVertagt: 1 }
  ]) {
    result.telemetrie = U.buildOutcomeTelemetry({ clusterCount: result.processed + (result.deferred || 0),
      results: Object.entries(result.counts).flatMap(([status, n]) => Array.from({ length: n }, () => ({ status }))),
      deferred: result.deferred || 0 });
    assert.equal(laufBilanz(result).status, result.counts.saved ? "partial" : "blocked");
    assert.equal(laufBilanz(result).stimmig, true);
    const meldungen = [];
    const deps = { verstehenKonkurrenz: () => false, eagerUnderstanding: async () => result,
      budget: { reserviere: async () => ({ erlaubt: true }), melde: async m => { meldungen.push(m); } } };
    const r = await SP.HANDLER.document_understanding(job, deps);
    assert.equal(r.ok, false); assert.equal(r.zurueckgestellt, true);
    assert.equal(meldungen[0].ungenutzt, result.processed === 0, "Kein pauschales Erstatten bei Teilwirkung");
    await assert.rejects(SP.HANDLER.document_understanding({ ...job, createdAt: "2020-01-01T00:00:00Z" }, deps), /verstehen-uebersprungen-dauerhaft/);
  }
});
test("Nur bestehende Promptauswahl, kein amtlicher oder umgeleiteter Artikel und keine Eingabemutation", async () => {
  const s = stand();
  for (const other of [{ ...doc, source_type: "official" }, { ...doc, link_type: "redirect" }]) {
    await run(s, [other]); assert.equal(s.p.reads, 0);
  }
  const before = structuredClone(doc), local = structuredClone(doc);
  s.deps.findVorgangCandidates = async () => { local.title = "Fremdtitel"; return []; };
  await U.understandOneCluster({ documents: [local] }, s.lauf(), {});
  assert.equal(rows(s.p.prompts.at(-1))[0].titel, before.title);
  assert.equal(rows(s.p.prompts.at(-1))[0].artikelkontext.text, text);
});
test("Unbekannter Modellausgang und Budgetabsage bleiben trotz fertigem Beleg gesperrt", async () => {
  for (const mode of ["unbekannt", "budget"]) {
    const s = stand();
    if (mode === "unbekannt") s.vertrag.reserviere = async () => ({ erlaubt: false, grund: "ausgang-unbekannt" });
    else s.deps.canSpend = async () => ({ allowed: false });
    const result = await run(s);
    assert.equal(result.status, mode === "unbekannt" ? "skipped-ausgang-unbekannt" : "skipped-budget");
    assert.equal(s.p.prompts.length, 0);
  }
});
test("Die bestehende Auswahl bleibt auf zwoelf begrenzt, erster Medienartikel ohne Ersatzwahl", async () => {
  const docs = Array.from({ length: 13 }, (_, i) => ({ ...doc, id: `rd-${i}`, url: doc.url + i, canonical_url: doc.url + i }));
  const s = stand(docs); let selected;
  const deps = { ...s.deps, artikelkontextVersorgung: async ds => { selected = ds; return { angefordert: true, ok: false, reason: "isolierte-luecke" }; } };
  await U.understandOneCluster({ documents: docs }, deps, { vorgangId: "vg-test", existing: null });
  assert.equal(selected.length, 12);
  assert.deepEqual(selected.map(d => d.id), rows(U.buildUnderstandingPrompt({ documents: docs })).map(q => q.quelle_id));
  s.beschaffung.fetchUrl = async url => { s.p.abrufe.push(url); throw Error("isoliert"); };
  await run(s, [docs[0], docs[1]]);
  assert.deepEqual(s.p.abrufe, [docs[0].url]); assert.equal(s.p.prompts.length, 0);
});
test("Gemischte Bilanz bleibt partial; Warteschlange wartet begrenzt statt Erfolg zu melden", async () => {
  const result = { processed: 2, counts: { saved: 1, "skipped-artikelkontext": 1 },
    telemetrie: U.buildOutcomeTelemetry({ clusterCount: 2, results: [{ status: "saved" }, { status: "skipped-artikelkontext" }] }) };
  const bilanz = laufBilanz(result);
  assert.equal(bilanz.status, "partial"); assert.equal(bilanz.vertagt, 1); assert.equal(bilanz.gespeichert, 1); assert.equal(bilanz.stimmig, true);
  const SP = require("../lib/helmut/scalable-pipeline");
  const job = { id: "isoliert", payload: { dokumente: [doc] }, createdAt: new Date().toISOString() };
  const deps = { eagerUnderstanding: async () => result, verstehenKonkurrenz: () => false };
  const r = await SP.HANDLER.document_understanding(job, deps);
  assert.equal(r.ok, false); assert.equal(r.zurueckgestellt, true); assert(r.grund.includes("artikelkontext-offen"));
  await assert.rejects(SP.HANDLER.document_understanding({ ...job, createdAt: "2020-01-01T00:00:00Z" }, deps), /verstehen-uebersprungen-dauerhaft/);
  for (const wiederverwendet of [false, true]) {
    const meldungen = [];
    const budget = { reserviere: async () => ({ erlaubt: true, wiederverwendet }), melde: async m => { meldungen.push(m); } };
    await SP.HANDLER.document_understanding(job, { ...deps, budget,
      eagerUnderstanding: async () => ({ processed: 1, counts: { "skipped-artikelkontext": 1 } }) });
    assert.equal(meldungen[0].ungenutzt, !wiederverwendet, "Unbekannt verbrauchtes Budget nie zurueckgeben");
    await SP.HANDLER.document_understanding(job, { ...deps, budget });
    assert.equal(meldungen[1].ungenutzt, false, "Teilweise verarbeitete Arbeit nicht erstatten");
  }
});

(async () => {
  let pass = 0;
  for (const [name, fn] of tests) { await fn(); pass++; console.log("PASS " + name); }
  console.log(`${pass}/${tests.length} Pruefgruppen erfolgreich; ausschliesslich isolierte Attrappen.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
