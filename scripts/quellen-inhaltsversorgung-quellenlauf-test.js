"use strict";
// Echter aktuell genutzter runSourceCrawl -> Originalbeleg -> echter U-Aufrufer.
// Ausschliesslich vorhandene Originalfixtures und abgefangene I/O-Randmodule.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), Module = require("node:module");
const { welt, dgb, radio, profiles } = require("./quellen-inhaltsversorgung-anschluss-test");
const D = require("../lib/helmut/dedup"), U = require("../lib/helmut/understanding"), L = require("../lib/helmut/artikelkontext-lauf");
const I = require("../lib/helmut/quellen-inhaltsversorgung-anschluss");
const filename = require.resolve("../lib/helmut/scheduler"), lib = path.dirname(filename);
function quellenlauf(items = [dgb, radio]) {
  const w = welt(items), s = { tenant: "test-a", pending: [], selected: [], fullProfilesRead: 0, eagerDeadlines: [] };
  const realStorage = require("../lib/helmut/storage"), realCrawler = require("../lib/helmut/crawler");
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(lib);
  const original = m.require.bind(m);
  const sourceMode = require("../lib/helmut/quellenarchitektur/source-mode");
  const storage = { ...realStorage,
    getProfile: async id => structuredClone(profiles.find(p => p.id === id)), getSources: async () => w.deps.quellenFuerProfil(profiles.find(p => p.id === s.tenant)),
    listFullProfiles: async () => { s.fullProfilesRead++; throw Error("Kein globaler Profilscan im Mandatslauf"); },
    saveRawItems: async values => { w.logs.push("roh"); return values; },
    v3StoreEnabled: () => true, saveRawDocument: async () => { w.logs.push("persistenz"); return { saved: true }; },
    acquirePipelineLock: async name => { assert.equal(name, "crawl-" + s.tenant); return w.deps.acquireLock("crawl-globalphase"); },
    releasePipelineLock: async () => w.deps.releaseLock(), listCrawlRuns: async () => [],
    saveCrawlRun: async value => value, recordProcessRun: async () => ({ ok: true }), recordPipelineError: async () => {},
    savePendingKnowledgeObjectsBulk: async values => { s.pending.push(...values); return { vorgemerkt: values.length, bereitsVorhanden: 0, fehlgeschlagen: 0, anfragen: 1 }; }
  };
  m.require = name => {
    if (name === "./storage") return storage;
    if (name === "./crawler") return { ...realCrawler, crawlAllSources: async sources => {
      s.selected = sources.map(q => q.id);
      return { rawItems: items.filter(item => s.selected.includes(item.sourceId)),
        results: sources.map(q => ({ sourceId: q.id, ok: true })), checkedSources: sources.length,
        successfulSources: sources.length, failedSources: 0, newCandidateItems: items.length };
    } };
    if (name === "./quellenarchitektur/source-mode") return { ...sourceMode, sourceMode: () => "off" };
    if (name === "./dip") return { isDipEnabled: () => false };
    if (name === "./google-news-hardening") return { googleHardeningConfig: () => ({ enabled: false }) };
    if (name === "./betriebskosten-budget") return { aktiv: () => true, vertrag: () => ({ profileId: s.tenant }) };
    if (name === "./matching") return { runMatchingShadow: async () => ({}) };
    if (name === "./decisions") return { runDecisionShadow: async () => ({}) };
    if (name === "./source-telemetry") return { buildSourceTelemetryRows: () => [], persistSourceCrawlTelemetry: async () => ({}) };
    if (name === "./lazyUnderstanding") return { runLazyUnderstandingShadow: async value => { w.lazy.push(value); return {}; } };
    if (name === "./artikelkontext-lauf") return { runUnderstandingShadow: async (docs, overrides) => {
      s.eagerDeadlines.push(overrides.deadlineMs);
      return U.runUnderstandingShadow(docs, L.mitArtikelkontext({ ...w.modelDeps, ...overrides }, process.env));
    } };
    return original(name);
  };
  m._compile(fs.readFileSync(filename, "utf8"), filename);
  return { w, s, async run(tenant = "test-a", options = {}) {
    s.tenant = tenant;
    return m.exports.runSourceCrawl(tenant, { deadlineMs: Date.now() + 300000,
      inhaltsversorgungDeps: w.inhaltsversorgungDeps, ...options });
  } };
}
const tests = [], test = (name, fn) => tests.push([name, fn]);
test("Produktions-Einstieg braucht nur vorhandene Flags und umgeht den knappen Titelfilter erst nach Originalbindung", async () => {
  const c = quellenlauf();
  const id = D.toRawDocumentRow(dgb).id, native = c.w.canonical.get(id);
  native.title = "Dritte Tarifrunde im Gebäudereiniger-Handwerk endet ohne Ergebnis - DGB - Deutscher Gewerkschaftsbund";
  native.source_name = "DGB";
  const before = structuredClone(native), r = await c.run();
  assert.equal(r.inhaltsversorgung.belegt, 2); assert.equal(c.w.fetches.length, 2); assert.equal(c.w.prompts.length, 2);
  assert.equal(r.inhaltsversorgung.verstehen.gespeichert, 2);
  assert(c.w.prompts.some(p => p.includes("Die Friedenspflicht endet am 31. Dezember dieses Jahres.")));
  assert(c.w.prompts.some(p => p.includes("Ab 2027 könnten die Leistungen deutlich gekürzt werden.")));
  assert(c.w.prompts.some(p => p.includes(JSON.stringify(before.title))));
  assert.deepEqual(c.w.canonical.get(id), before); assert.equal(c.s.fullProfilesRead, 0);
  assert(c.w.logs.indexOf("original") < c.w.logs.indexOf("modell")); assert.equal(c.w.logs.at(-1), "freigabe");
});
test("Passende Mandate verwenden denselben kanonischen Originalbeleg, fremde Sichtbarkeit wird nicht erweitert", async () => {
  const c = quellenlauf(); await c.run(); const first = c.w.fetches.length;
  await c.run("test-b");
  assert.equal(c.w.fetches.length, first); assert.equal(c.w.prompts.length, 3);
  assert(c.w.prompts.at(-1).includes("Friedenspflicht")); assert(!c.w.prompts.at(-1).includes("bezahlbaren Wohnraum"));
  assert.equal(c.s.fullProfilesRead, 0);
});
test("Fehlendes Original bleibt Pending; kein Titel als Modelltext und kein automatischer Zweitabruf", async () => {
  const c = quellenlauf([dgb]); c.w.answers.set(dgb.url, new Error("nicht verfuegbar"));
  const r = await c.run(); assert.equal(c.w.fetches.length, 1); assert.equal(c.w.prompts.length, 0);
  assert.equal(r.inhaltsversorgung.zustaende.luecke, 1); assert.equal(c.s.pending.length, 1);
  assert.equal(c.s.pending[0].dokumente[0].id, D.toRawDocumentRow(dgb).id);
  await c.run(); assert.equal(c.w.fetches.length, 1); assert.equal(c.w.prompts.length, 0);
});
test("Ohne Hostfreigabe kein neuer Abruf; vorhandener Originalinhalt wird nicht zurueckgestuft", async () => {
  const value = process.env.HELMUT_SUCHWEGAUSZUEGE_HOSTS; delete process.env.HELMUT_SUCHWEGAUSZUEGE_HOSTS;
  try { const c = quellenlauf([dgb]), r = await c.run(); assert.equal(c.w.fetches.length, 0);
    assert.equal(c.w.prompts.length, 0); assert.equal(r.inhaltsversorgung.zustaende.luecke, 1); assert.equal(c.s.pending.length, 1);
  } finally { process.env.HELMUT_SUCHWEGAUSZUEGE_HOSTS = value; }
  const text = "Die Gewerkschaften fordern angesichts der gestiegenen Lebenshaltungskosten und der schwierigen Tarifverhandlungen in der Gebäudereinigung eine dauerhafte deutliche Erhöhung der gesetzlichen Lohnuntergrenze sowie wirksame Kontrollen gegen systematische Umgehungen und unbezahlte Arbeitszeit.";
  assert(text.length > 240); assert.equal(I.brauchtInhalt({ title: "Tarifrunde", summary: text }), false);
  assert.equal(I.brauchtInhalt({ title: "Tarifrunde", summary: "Tarifrunde." }), true);
});
test("Aufgebrauchtes Eagerbudget wird dauerhaft vertagt statt als budgetMs=0 unbegrenzt verarbeitet", async () => {
  const previous = process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS; process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS = "0";
  try { const c = quellenlauf([dgb]), r = await c.run(); assert.equal(c.w.fetches.length, 1); assert.equal(c.w.prompts.length, 0);
    assert(c.s.eagerDeadlines[0] <= Date.now()); assert.equal(c.s.pending.length, 1);
    assert.equal(r.inhaltsversorgung.verstehen.gespeichert, 0);
    const marker = c.s.pending[0], bestand = structuredClone([...c.w.rows]);
    const pending = await U.runPendingUnderstandingShadow([], L.mitArtikelkontext({ ...c.w.modelDeps,
      acquireLock: async () => { await c.w.deps.acquireLock("crawl-globalphase"); return { granted: true }; },
      releaseLock: async () => c.w.deps.releaseLock(),
      deadlineMs: Date.now() + 300000, budgetMs: 240000,
      listPending: async () => [{ id: "ko-quellenlauf-pending", vorgang_id: marker.vorgangId, status: "pending" }],
      listVorgangDocuments: async () => marker.dokumente
    }, process.env, c.w.beschaffung, { nurBestand: true }));
    assert.equal(pending.counts.saved, 1, JSON.stringify(pending)); assert.equal(c.w.prompts.length, 1);
    assert(c.w.prompts[0].includes("Die Friedenspflicht endet am 31. Dezember dieses Jahres."));
    assert.equal(c.w.fetches.length, 1); assert.deepEqual([...c.w.rows], bestand);
  } finally { if (previous === undefined) delete process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS; else process.env.HELMUT_CRAWL_UNDERSTAND_BUDGET_MS = previous; }
});
test("Publisheralias aendert weder Artikelidentitaet noch fachlichen Titelrumpf", async () => {
  const lang = D.toRawDocumentRow(dgb), kurz = { ...lang, source_name: "DGB",
    title: "Dritte Tarifrunde im Gebäudereiniger-Handwerk endet ohne Ergebnis - DGB - Deutscher Gewerkschaftsbund" };
  assert.equal(I.gleicherStand(lang, kurz), true); assert.equal(I.gleicherStand(kurz, lang), true);
  assert.equal(I.gleicherStand(lang, { ...kurz, published_at: "2026-11-06T10:26:29+01:00" }), true);
  for (const change of [
    (a, b) => { b.title = b.title.replace("Dritte", "Vierte"); },
    (a, b) => { b.title += " - Weitere Nachricht"; },
    (a, b) => { b.source_name = "ABC"; },
    (a, b) => { a.source_name += " | Zusatz"; },
    (a, b) => { b.title = " - DGB - Deutscher Gewerkschaftsbund"; a.title = " - Deutscher Gewerkschaftsbund | DGB"; },
    (a, b) => { b.title = b.title.replace("Deutscher Gewerkschaftsbund", "Anderer Gewerkschaftsbund"); },
    (a, b) => { b.canonical_url += "anderer/"; },
    (a, b) => { b.published_at = "2026-11-05T09:26:29Z"; },
    ...["presse.dgb.de", "dgb.fremd.de", "notdgb.de"].map(host => (a, b) => {
      a.url = b.url = a.canonical_url = b.canonical_url = "https://" + host + "/artikel";
    })
  ]) { const a = structuredClone(lang), b = structuredClone(kurz); change(a, b);
    assert.equal(I.gleicherStand(a, b), false, JSON.stringify([a, b])); assert.equal(I.gleicherStand(b, a), false);
  }
});
test("Fremde Kanoniktitel, Publikationsstand und unaufgeloeste Googleziele bleiben ohne Artikelabruf erkennbar", async () => {
  for (const change of [row => { row.title = "Anderer Tarifvorgang"; }, row => { row.published_at = "2026-11-05T09:26:29Z"; }]) {
    const c = quellenlauf([dgb]); change(c.w.canonical.get(D.toRawDocumentRow(dgb).id));
    const r = await c.run(); assert.equal(c.w.fetches.length, 0); assert.equal(c.w.prompts.length, 0);
    assert(r.inhaltsversorgung.befund.some(b => b.reason === "kanonischer-quellenstand-abweichend"));
  }
  const item = { ...dgb, url: "https://news.google.com/articles/unaufgeloest", linkType: "google_proxy" };
  const c = quellenlauf([item]), r = await c.run(); assert.equal(c.w.fetches.length, 0); assert.equal(c.w.prompts.length, 0);
  assert(r.inhaltsversorgung.befund.some(b => b.reason === "artikelziel-nicht-bestaetigt")); assert.equal(c.s.pending.length, 1);
});
(async () => {
  const keys = ["HELMUT_ARTIKELKONTEXT", "HELMUT_SUCHWEGAUSZUEGE_HOSTS", "HELMUT_ANBIETER_STEUERUNG"];
  const before = keys.map(k => process.env[k]);
  Object.assign(process.env, { HELMUT_ARTIKELKONTEXT: "on", HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.dgb.de,www.radio-hannover.de", HELMUT_ANBIETER_STEUERUNG: "on" });
  try { for (const [name, run] of tests) { await run(); console.log("PASS " + name); }
    console.log(`${tests.length}/${tests.length} Quellenlaufgruppen; 0 echte Original-/Modell-/Produktionsaufrufe.`);
  } finally { keys.forEach((k, i) => { if (before[i] === undefined) delete process.env[k]; else process.env[k] = before[i]; }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
