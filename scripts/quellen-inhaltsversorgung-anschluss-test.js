"use strict";
// ECHTER globaler Controller -> kanonischer Leser/Fundstellen -> bestehender
// CAS-Belegspeicher -> echter Understanding-Aufrufer. REST/Original/Modell sind
// ausschliesslich Attrappen; die zwei HTML-Proben stammen aus dem vorigen Auftrag.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const S = require("../lib/helmut/scheduler"), D = require("../lib/helmut/dedup"), C = require("../lib/helmut/crawler");
const U = require("../lib/helmut/understanding"), L = require("../lib/helmut/artikelkontext-lauf");
const B = require("../lib/helmut/artikelkontext-beschaffung");
const Anschluss = require("../lib/helmut/quellen-inhaltsversorgung-anschluss");
const Store = require("../lib/helmut/artikelkontext-belegspeicher");
const fixture = file => fs.readFileSync(path.join(__dirname, "fixtures/inhaltsversorgung-20261108", file), "utf8");
const dgbUrl = "https://www.dgb.de/service/weiterer-service/tarifmeldungen/tarifmeldung/dritte-tarifrunde-im-gebaeudereiniger-handwerk-endet-ohne-ergebnis/";
const radioUrl = "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen";
const feed = C.parseRssItems(fs.readFileSync(path.join(__dirname, "fixtures/quelleninhalt-20261107/dgb-google.xml"), "utf8"))[0];
const dgb = C.normalizeRawItem({ ...feed, url: dgbUrl, originalUrl: feed.url },
  { id: "dgb", name: "DGB", type: "association", url: "https://news.google.com/rss/search?q=site:dgb.de" });
const radio = { title: "Sozialverband warnt vor Altersarmut in Niedersachsen - Radio Hannover", sourceName: "Radio Hannover",
  url: radioUrl, publishedAt: "2026-11-06T11:11:24Z", retrievedAt: "2026-11-08T08:00:00Z", sourceId: "radio", sourceType: "media", linkType: "direct" };
const p = id => ({ id, fullName: "Deklarierte Synthetik " + id, party: "Fraktionslos", parliamentType: "Bundestag",
  profileActive: true, state: "Niedersachsen", committees: ["Arbeit und Soziales"], focusTopics: ["Mindestlohn"] });
const profiles = [p("test-a"), p("test-b"), { ...p("test-c"), committees: ["Finanzen"], focusTopics: ["Steuerrecht"], state: "Berlin" }];
const sourceIds = { "test-a": ["dgb", "radio", "probe"], "test-b": ["dgb", "probe"], "test-c": ["finance"] };
const raw = (name, title = "Mindestlohn: Stand der Verhandlungen") => ({ title, sourceId: "probe", sourceName: "Testquelle",
  url: "https://www.dgb.de/" + name, linkType: "direct", publishedAt: "2026-11-06T09:26:29Z", retrievedAt: "2026-11-08T08:00:00Z" });
const body = "Die Gewerkschaft verlangt einen höheren Mindestlohn für alle Beschäftigten in der Branche.";
function html(item, text = body) {
  const d = D.toRawDocumentRow(item), ld = { '@type': 'NewsArticle', headline: d.title, url: d.url, datePublished: d.published_at, articleBody: text };
  return `<head><link rel="canonical" href="${d.url}"><meta property="og:title" content="${d.title}"><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><article><p>${text}</p></article></body>`;
}
const analyse = { headline: "Deklarierte Modellattrappe", was_ist_passiert: "Isolierter Test", warum_wichtig: "Isolierter Test",
  wer_ist_betroffen: "Isolierter Test", parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel",
  handlungsempfehlung: "Isolierter Test", confidence_score: 70, display_title: "Isolierter Test", display_summary: "Isolierter Test" };
function welt(items = [dgb, radio]) {
  const logs = [], fetches = [], prompts = [], lazy = [], canonical = new Map(), rows = new Map(), telemetry = [];
  let clock = Date.now(), locked = false;
  for (const item of items) {
    const row = D.toRawDocumentRow(item);
    canonical.set(row.id, { ...row, retrieved_at: "2026-11-07T09:00:00+00:00" });
  }
  const answers = new Map(items.map(it => [it.url, it.url === dgbUrl ? fixture("dgb-artikel.html")
    : it.url === radioUrl ? fixture("radio-hannover.html") : html(it)]));
  const speicher = Store.erzeugeBelegspeicher({ storeId: "isoliert", request: async (endpoint, options = {}) => {
    const query = new URL(endpoint, "https://local.invalid").searchParams, id = query.get("id")?.slice(3);
    if (!options.method) return rows.has(id) ? [{ id, data: structuredClone(rows.get(id)) }] : [];
    const data = JSON.parse(options.body);
    if (options.method === "POST") { assert(!rows.has(data.id)); rows.set(data.id, structuredClone(data.data)); return [{ id: data.id }]; }
    assert.equal(options.method, "PATCH"); assert.equal(rows.get(id).zustand, "reserviert");
    assert.equal(query.get("data->>versuchId"), "eq." + rows.get(id).versuchId);
    rows.set(id, structuredClone(data.data)); return [{ id }];
  } });
  const beschaffung = { speicher, env: { HELMUT_ANBIETER_STEUERUNG: "on" }, now: () => new Date(clock), fetchUrl: async url => {
    assert(locked); logs.push("original"); fetches.push(url);
    const answer = answers.get(url); if (answer instanceof Error) throw answer;
    return { body: answer, finalUrl: url };
  } };
  const inhaltsversorgungDeps = { beschaffung,
    leseDokumente: async ids => { assert(locked); assert(logs.includes("persistenz")); logs.push("kanonisch"); return ids.flatMap(id => canonical.has(id) ? [structuredClone(canonical.get(id))] : []); },
    leseKatalog: async () => ({ packages: [{ id: "pkg", key: "arbeit-und-soziales", status: "active" }],
      packagePaths: [{ package_id: "pkg", retrieval_path_id: "rp-probe" }], retrievalPaths: [{ id: "rp-probe", legacy_source_id: "probe" }] }),
    request: async endpoint => {
      assert(locked); logs.push("fundstellen"); const q = new URL(endpoint, "https://local.invalid").searchParams;
      assert.equal(q.get("limit"), "1000"); assert(q.get("select").includes("retrieval_path_id"));
      const ids = q.get("raw_document_id").slice(4, -1).split(",");
      return ids.map(id => ({ raw_document_id: id, source_id: canonical.get(id).source_id, retrieval_path_id: "rp-probe",
        original_url: "https://news.google.com/probe", link_type: "direct", found_at: "2026-11-07T09:00:00Z" }));
    } };
  const vertrag = { reserviere: async () => ({ erlaubt: true, fencing: 1 }), modellstart: async () => ({ erlaubt: true }),
    schreibrecht: async () => ({ erlaubt: true }), speichere: async () => ({ gespeichert: true, pruefbar: true }),
    freigabe: async () => {}, freigabeOhneAufruf: async () => {}, ausgangUnbekannt: async () => {},
    vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }), vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {} };
  const modelDeps = { enabled: () => true, aiEnabled: () => true, acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
    getExisting: async () => null, findVorgangCandidates: async () => [], listWiederaufnahmen: async () => ({ verfuegbar: true, vorgaenge: [] }),
    verstehenVertrag: () => vertrag, gateMode: () => "off", priorityEnabled: () => false, verstehenParallelitaet: 1,
    canSpend: async () => ({ allowed: true }), modelName: () => "isolierte-attrappe", logSkip: () => {},
    requestUnderstanding: async prompt => { assert(locked); logs.push("modell"); prompts.push(prompt); return { ...analyse }; },
    save: async () => { throw Error("Unbedingtes Schreiben verboten"); }, saveSources: async () => {}, markFailed: async () => {},
    savePending: async () => ({ saved: true }) };
  const deps = { now: () => clock, listFullProfiles: async () => profiles,
    quellenFuerProfil: async profile => (sourceIds[profile.id] || []).map(id => ({ id, name: id, type: "media", active: true, url: "https://feeds.invalid/" + id })),
    acquireLock: async name => { assert.equal(name, S.GLOBALPHASE_LOCK); locked = true; logs.push("sperre"); return true; },
    releaseLock: async () => { locked = false; logs.push("freigabe"); }, hardeningConfig: () => ({ enabled: false }), dipAktiv: () => false,
    crawlAllSources: async sources => ({ rawItems: items, results: sources.map(s => ({ sourceId: s.id, ok: true, itemCount: 1 })), checkedSources: sources.length,
      successfulSources: sources.length, failedSources: 0, newCandidateItems: items.length }),
    saveRawItems: async value => { logs.push("roh"); return value; }, persistRawDocuments: async value => { logs.push("persistenz"); return { persisted: value.length }; },
    lazyUnderstanding: async input => { assert(locked); logs.push("lazy"); lazy.push(input); return {}; },
    eagerUnderstanding: async (docs, overrides) => {
      // Auch bei bisherigem Flag ON darf kein neuer Abruf je Stapel entstehen.
      const prepared = L.mitArtikelkontext({ ...modelDeps, ...overrides }, { HELMUT_ARTIKELKONTEXT: "on" },
        { fetchUrl: () => { throw Error("Abruf je Cluster verboten"); } });
      return U.runUnderstandingShadow(docs, prepared);
    },
    savePendingBulk: async list => ({ vorgemerkt: list.length, bereitsVorhanden: 0, fehlgeschlagen: 0, anfragen: 1 }),
    saveCrawlRun: async data => { telemetry.push(data); return data; }, recordProcessRun: async data => { telemetry.push(data); return { ok: true }; },
    recordPipelineError: async () => {}, persistSourceCrawlTelemetry: async () => {} };
  const run = options => S.runGlobaleErfassung({ tenantIds: profiles.map(p => p.id), runId: "isolierter-globaler-lauf", budgetMs: 300000,
    startedMs: clock, buendelung: "kontext", inhaltsversorgung: { vorbereitet: true, hosts: ["www.dgb.de", "www.radio-hannover.de"] },
    inhaltsversorgungDeps, deps, ...options });
  return { logs, fetches, prompts, lazy, rows, answers, canonical, beschaffung, inhaltsversorgungDeps, deps, modelDeps, run,
    now: () => clock, advance: n => { clock += n; } };
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  await test("Ohne ausdrücklichen Auftrag: keine neuen Leser/Beschaffer und unveränderter Rückgabevertrag", async () => {
    const w = welt(); const r = await w.run({ inhaltsversorgung: undefined, noPaidModel: true });
    assert(!Object.hasOwn(r, "inhaltsversorgung")); assert.equal(w.fetches.length, 0);
    assert(!w.logs.includes("kanonisch") && !w.logs.includes("fundstellen")); assert.equal(w.prompts.length, 0);
  });
  await test("Echter globaler Ablauf: kanonisch rücklesen, einmal beschaffen, Original bis zum Modell", async () => {
    const w = welt(), quellen = w.deps.quellenFuerProfil;
    // Beide hier geteilten Quellen bilden EINEN echten Sichtbarkeitskontext.
    // Zwei 45s-Teilscheiben reichen nicht fuer die bestehende 55s-Modellreserve.
    w.deps.quellenFuerProfil = async p => [...await quellen(p), ...(p.id === 'test-b'
      ? [{ id: 'radio', name: 'radio', type: 'media', active: true, url: 'https://feeds.invalid/radio' }] : [])];
    const r = await w.run();
    assert.equal(r.inhaltsversorgung.belegt, 2, JSON.stringify(r.inhaltsversorgung)); assert.equal(w.fetches.length, 2); assert.equal(w.prompts.length, 2);
    assert(w.logs.indexOf("sperre") < w.logs.indexOf("persistenz")); assert(w.logs.indexOf("persistenz") < w.logs.indexOf("kanonisch"));
    assert(w.logs.indexOf("original") < w.logs.indexOf("lazy")); assert.equal(w.logs.at(-1), "freigabe");
    const sources = w.prompts.flatMap(prompt => prompt.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(JSON.parse));
    const d = sources.find(s => s.url === dgbUrl), radioSource = sources.find(s => s.url === radioUrl);
    assert(d.artikelkontext.text.includes("von 15 auf 15,30 Euro")); assert(d.artikelkontext.text.includes("von derzeit 15 auf 17 Euro"));
    assert(d.artikelkontext.text.endsWith("Die Friedenspflicht endet am 31. Dezember dieses Jahres."));
    assert(radioSource.artikelkontext.text.includes("Ab 2027 könnten die Leistungen deutlich gekürzt werden."));
    for (const source of sources) assert.equal(source.abgerufenAm, "2026-11-07T09:00:00+00:00");
    assert.deepEqual(w.lazy.find(x => x.cluster.documents.some(d => d.url === radioUrl)).profiles.map(p => p.id), ['test-a','test-b']);
    assert.deepEqual(w.lazy.find(x => x.cluster.documents.some(d => d.url === dgbUrl)).profiles.map(p => p.id), ['test-a','test-b']);
    assert(w.lazy.every(x => x.cluster.summary.length > 600));
    assert(!JSON.stringify([...w.rows.values()]).includes('test-a'));
    assert([...w.canonical.values()].every(d => d.summary === null));
    const again = await w.run({ noPaidModel: true }); assert.equal(again.inhaltsversorgung.belegt, 2); assert.equal(w.fetches.length, 2);
  });
  await test("Mandatseigener Radio-Weg erweitert seine Sichtbarkeit nicht durch geteilte Fachthemen", async () => {
    const w = welt([radio]), r = await w.run(); assert.equal(r.inhaltsversorgung.belegt, 1);
    assert.equal(w.prompts.length, 1); assert.deepEqual(w.lazy[0].profiles.map(p => p.id), ['test-a']);
    assert(w.prompts[0].includes('Ab 2027 könnten die Leistungen deutlich gekürzt werden.'));
  });
  await test("Gespeicherter Originaltext wird ohne Artikelabruf tatsächlich verarbeitet", async () => {
    const item = raw("gespeichert"), w = welt([item]); const row = [...w.canonical.values()][0]; row.summary = body;
    const r = await w.run(); assert.equal(r.inhaltsversorgung.zustaende.vorhanden, 1); assert.equal(w.fetches.length, 0);
    assert.equal(w.prompts.length, 1); assert(w.prompts[0].includes(JSON.stringify(body))); assert(!w.logs.includes("fundstellen"));
  });
  await test("Bereits beobachteter Rohspiegel-Treffer bleibt ergänzbar, obwohl saveRawItems nichts Neues liefert", async () => {
    const w = welt([dgb]); w.deps.saveRawItems = async () => { w.logs.push('roh'); return []; };
    w.deps.persistRawDocuments = async () => { w.logs.push('persistenz'); return { skipped: true, persisted: 0 }; };
    const r = await w.run(); assert.equal(r.savedItems, 0); assert.equal(r.inhaltsversorgung.belegt, 1); assert.equal(w.prompts.length, 1);
  });
  await test("Knapper Titel erreicht über echte Fundstellen-/Paketbindung die Originalprüfung", async () => {
    const w = welt([raw('knapp', 'Mitteilung')]); const r = await w.run();
    assert.equal(r.inhaltsversorgung.grenzen.unklare, 1); assert.equal(w.prompts.length, 1); assert(w.prompts[0].includes(body));
  });
  await test("Aktives Gate beurteilt gebundenen Originaltext vor Parkung eines knappen Titels", async () => {
    const w = welt([raw('gate-knapp', 'Mitteilung')]); let parkungen = 0;
    Object.assign(w.modelDeps, { gateMode: () => 'on', recordGateShadow: () => {}, recordGateShadowRows: async () => {},
      recordGateParkung: async () => ({ ok: true }), markGateGeparkt: async () => { parkungen++; return { ok: true }; },
      saveSources: async (_id, docs) => ({ saved: docs.length }) });
    const r = await w.run(); assert.equal(r.inhaltsversorgung.belegt, 1); assert.equal(parkungen, 0);
    assert.equal(w.prompts.length, 1); assert(w.prompts[0].includes(body));
    assert([...w.canonical.values()].every(d => d.summary === null));
  });
  await test("Vorzeitige Belegprüfung bleibt auf reine Bestandsleser begrenzt und prüft Quellenbindung", async () => {
    const w = welt([raw('gate-legacy', 'Mitteilung')]); await w.deps.acquireLock(S.GLOBALPHASE_LOCK);
    const doc = [...w.canonical.values()][0]; let callback = 0;
    const deps = { ...w.modelDeps, gateMode: () => 'on', recordGateParkung: async () => ({ ok: true }),
      markGateGeparkt: async () => ({ ok: true }), saveSources: async (_id, docs) => ({ saved: docs.length }),
      artikelkontextVersorgung: async () => { callback++; throw Error('Netzbeschaffer darf vor Gate nicht laufen'); } };
    const r = await U.understandOneCluster({ documents: [doc] }, deps,
      { vorgangId: 'vg-gate-legacy', existing: null, deadlineMs: w.now() + 300000 });
    assert.equal(r.status, 'skipped-gate-geparkt'); assert.equal(callback, 0); assert.equal(w.prompts.length, 0);
    deps.artikelkontextVersorgung.nurBestand = true;
    const falsch = await U.understandOneCluster({ documents: [doc] }, deps,
      { vorgangId: 'vg-gate-ungueltig', existing: null, deadlineMs: w.now() + 300000,
        artikelkontextVersuch: { dokumentId: 'fremd', text: body } });
    assert.equal(falsch.status, 'skipped-artikelkontext'); assert.equal(w.prompts.length, 0);
    await w.deps.releaseLock();
  });
  await test("Globale Bestandsversorgung wahrt engere Teilfrist auch ohne altes Artikelkontextflag", async () => {
    const callback = async () => ({ angefordert: false });
    for (const flag of ['on', 'off']) {
      const start = Date.now(), r = L.mitArtikelkontext({ artikelkontextVersorgung: callback,
        budgetMs: 1000, deadlineMs: start + 300000 }, { HELMUT_ARTIKELKONTEXT: flag });
      assert.equal(r.artikelkontextVersorgung, callback);
      assert(r.deadlineMs >= start + 1000 && r.deadlineMs <= Date.now() + 1000);
    }
    const w = welt([dgb]), eager = w.deps.eagerUnderstanding;
    w.deps.eagerUnderstanding = (docs, overrides) => eager(docs, { ...overrides, budgetMs: 1000 });
    const r = await w.run(); assert.equal(r.inhaltsversorgung.belegt, 1); assert.equal(w.prompts.length, 0);
    assert.equal(r.datenstand.verstanden, 0); assert.notEqual(r.datenstand.status, 'abgeschlossen');
    // Keine Budgeterhoehung fuer den Positivnachweis: bei ZWEI Kontexten wird
    // die erste zu enge Scheibe ehrlich vertagt, obwohl ihr Beleg vorhanden ist.
    const eng = welt(), teil = await eng.run(); assert.equal(eng.prompts.length, 1);
    assert.equal(teil.inhaltsversorgung.belegt, 2); assert.equal(teil.datenstand.verstanden, 1);
    assert.notEqual(teil.datenstand.status, 'abgeschlossen');
  });
  await test("Unpassender Originaltext erreicht keinen Modellaufruf", async () => {
    const item = raw('unpassend'), w = welt([item]); w.answers.set(item.url, html(item, 'Die Vogelbeobachtung im Nationalpark beginnt mit einer Ausstellung im kommenden Frühjahr.'));
    const r = await w.run(); assert.equal(r.inhaltsversorgung.zustaende.unpassend, 1); assert.equal(w.prompts.length, 0);
  });
  await test("403 und Metadaten-HTML bleiben Lücken; erneuter Lauf wiederholt den Originalabruf nicht", async () => {
    for (const unavailable of [Object.assign(new Error('HTTP403'), { statusCode: 403 }), fs.readFileSync(path.join(__dirname,'fixtures/quelleninhalt-20261107/dgb-metadaten.html'),'utf8')]) {
      const w = welt([dgb]); w.answers.set(dgbUrl, unavailable);
      for (let n=0;n<2;n++) { const r = await w.run(); assert.equal(r.inhaltsversorgung.zustaende.luecke, 1); }
      assert.equal(w.fetches.length, 1); assert.equal(w.prompts.length, 0);
    }
  });
  await test("Abweichender kanonischer Stand, fehlende Zeile und Lesefehler erlauben keinen Ersatztext", async () => {
    for (const mode of ['datum','fehlt','lesen']) {
      const w = welt([dgb]);
      if (mode==='datum') [...w.canonical.values()][0].published_at='2026-11-07T09:26:29Z';
      if (mode==='fehlt') w.canonical.clear();
      if (mode==='lesen') w.inhaltsversorgungDeps.leseDokumente=async()=>{throw Error('deklarierter Lesefehler');};
      const r=await w.run(); assert.equal(r.inhaltsversorgung.zustaende.luecke,1); assert.equal(w.fetches.length,0); assert.equal(w.prompts.length,0);
    }
  });
  await test("Verweigerte globale Sperre und verbrauchte Frist verhindern neue Beschaffung", async () => {
    const locked=welt([dgb]); locked.deps.acquireLock=async()=>false;
    assert.equal((await locked.run()).uebersprungen,true); assert.equal(locked.fetches.length,0); assert(!locked.logs.includes('kanonisch'));
    const late=welt([dgb]); late.deps.persistRawDocuments=async()=>{late.logs.push('persistenz');late.advance(300000);return {persisted:1};};
    const r=await late.run(); assert.equal(late.fetches.length,0); assert.equal(late.prompts.length,0); assert.equal(r.inhaltsversorgung.zustaende.luecke,1);
  });
  await test("Kontingent einmal global über mehrere Sichtbarkeitsstapel", async () => {
    const items=Array.from({length:6},(_,i)=>({...raw('limit-'+i),sourceId:i%2?'radio':'probe'})),w=welt(items);
    const r=await w.run({noPaidModel:true}); assert.equal(w.fetches.length,2); assert.equal(r.inhaltsversorgung.grenzen.neueAbrufe,2);
    assert(r.inhaltsversorgung.befund.some(b=>b.reason==='laufgrenze')); assert.equal(w.prompts.length,0);
  });
  await test("Mehrere Belege in einem Cluster werden vor dem Modell ehrlich zurückgestellt", async () => {
    const w=welt([raw('mehrere-a'),raw('mehrere-b')]); const r=await w.run();
    assert.equal(r.inhaltsversorgung.belegt,2); assert.equal(w.prompts.length,0); assert.equal(r.inhaltsversorgung.artikelkontextZurueckgestellt,1);
    assert(r.datenstand.fehler.some(f=>f.schritt==='quelleninhalt'));
  });
  await test("Bestehender spezialisierter/generischer Beleg wird ohne weiteren Originalabruf benutzt", async () => {
    const item=raw('bestand','Mindestlohn Verhandlungen für Beschäftigte'),w=welt([item]);
    w.answers.set(item.url,html(item,'Bei den Mindestlohn Verhandlungen verlangen Beschäftigte eine höhere Bezahlung in der gesamten Branche.')
      .replace('"@type":"NewsArticle"','"@type":"NewsArticle","mainEntityOfPage":'+JSON.stringify(item.url)));
    const row=[...w.canonical.values()][0];
    // Nur Attrappen: den bisherigen Beleg vor dem globalen Lauf anlegen.
    const old=await B.beschaffeArtikelkontext(row,{versuch:true},{...w.beschaffung,fetchUrl:async url=>({body:w.answers.get(url),finalUrl:url})});
    assert.equal(old.ok,true,old.reason); const r=await w.run();
    assert.equal(r.inhaltsversorgung.belegt,1); assert.equal(w.fetches.length,0); assert.equal(w.prompts.length,1);
    assert(w.prompts[0].includes('artikel-absatz-titel-v1'));
  });
  await test("Neue Quellenlesung ist explizit begrenzt und verwirft unvollständige/fremde Fundstellen", async () => {
    const id=D.toRawDocumentRow(raw('leser')).id;
    assert.deepEqual(await Anschluss.leseFundstellen([id],async()=>[]),[]);
    await assert.rejects(()=>Anschluss.leseFundstellen(['fremd'],async()=>[]));
    await assert.rejects(()=>Anschluss.leseFundstellen([id],async()=>Array.from({length:1000},()=>({raw_document_id:id}))));
    await assert.rejects(()=>Anschluss.leseFundstellen([id],async()=>[{raw_document_id:'fremd'}]));
    assert.equal(await Anschluss.vorbereiteGlobaleInhalte({auftrag:{}},{request:()=>{throw Error('IO verboten');}}),null);
  });
  await test("Auch der kanonische Lesepool ist begrenzt; übrige Kandidaten bleiben sichtbar vertagt", async () => {
    const w=welt(Array.from({length:201},(_,i)=>raw('pool-'+i)));
    const original=w.inhaltsversorgungDeps.leseDokumente;
    w.inhaltsversorgungDeps.leseDokumente=async ids=>{assert.equal(ids.length,200);return original(ids);};
    const r=await w.run({noPaidModel:true}); assert.equal(r.inhaltsversorgung.pool,200);
    assert.equal(r.inhaltsversorgung.zustaende.vertagt,181); assert.equal(w.fetches.length,2);
    assert(r.inhaltsversorgung.befund.some(b=>b.reason==='lesepoolgrenze'));
  });
  await test("Deaktivierte und ausgeschlossene Profile erweitern die Quellensichtbarkeit nicht", async () => {
    const w=welt([raw('gesperrte-mandate')]);
    w.deps.listFullProfiles=async()=>[{...profiles[0],profileActive:false},{...profiles[1],party:'AfD'},profiles[2]];
    const r=await w.run(); assert.equal(w.fetches.length,0); assert.equal(w.prompts.length,0);
    assert(r.inhaltsversorgung.befund.some(b=>b.reason==='quellensichtbarkeit-fehlt'));
  });
  await test("Bestehende CAS- und Budgetwachen bleiben vor dem Modell wirksam", async () => {
    for (const guard of ['cas','budget']) {
      const w=welt([dgb]);
      if(guard==='cas')w.modelDeps.verstehenVertrag=()=>null;
      else w.modelDeps.canSpend=async()=>({allowed:false});
      const r=await w.run(); assert.equal(r.inhaltsversorgung.belegt,1); assert.equal(w.prompts.length,0);
      assert.equal(r.datenstand.verstanden,0); assert.notEqual(r.datenstand.status,'abgeschlossen');
      if(guard==='cas')assert.equal(r.inhaltsversorgung.artikelkontextZurueckgestellt,1);
    }
  });
  await test("Beleg außerhalb der Zwölfer-Promptauswahl wird vor dem Modell ehrlich erkannt", async () => {
    const w=welt([dgb]); await w.deps.acquireLock(S.GLOBALPHASE_LOCK); await w.deps.persistRawDocuments([dgb]);
    const vorbereitet=await Anschluss.vorbereiteGlobaleInhalte({auftrag:{vorbereitet:true,hosts:['www.dgb.de']},
      beobachtet:[dgb],neu:[dgb],profile:profiles,herkuenfte:{herkunftJeQuelle:{dgb:['test-a','test-b']}},
      laufId:'promptgrenze',deadlineMs:w.now()+300000,persistenzOk:true,now:w.now},w.inhaltsversorgungDeps);
    const actual=vorbereitet.dokumente[0];
    const others=Array.from({length:12},(_,i)=>({...actual,id:'rd-'+require('crypto').createHash('sha256').update('rank-'+i).digest('hex'),
      url:'https://www.dgb.de/rank-'+i,canonical_url:'https://dgb.de/rank-'+i,
      published_at:i===0?'2026-11-05T09:00:00Z':'2026-11-07T09:'+String(i).padStart(2,'0')+':00Z'}));
    const docs=[actual,...others];
    assert(!U.buildUnderstandingPrompt({documents:docs}).includes(actual.id));
    const r=await U.understandOneCluster({documents:docs},{...w.modelDeps,artikelkontextVersorgung:vorbereitet.artikelkontextVersorgung},
      {vorgangId:'vg-promptgrenze',existing:null,vertrag:w.modelDeps.verstehenVertrag(),deadlineMs:w.now()+300000});
    assert.equal(r.status,'skipped-artikelkontext'); assert.equal(r.reason,'artikelquelle-nicht-im-prompt'); assert.equal(w.prompts.length,0);
    await w.deps.releaseLock();
  });
  console.log(`${passed}/21 Anschlussgruppen bestanden; 0 echte Original-, Datenbank- oder Modellaufrufe.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
