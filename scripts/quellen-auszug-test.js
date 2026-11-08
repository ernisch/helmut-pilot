"use strict";
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const E = require("../lib/helmut/quellen-auszug");
const D = require("../lib/helmut/dedup");
const G = require("./github-quellenkontext-500");
const title = "Parlament beraet kommunale Pflegeangebote";
const summary = "Der Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.";
const raw = { title, url: "https://example.org/politik/pflege", publishedAt: "2026-09-10T21:00:00Z", content: summary };
const document = { ...D.toRawDocumentRow(raw), summary: null };
const html = (desc = summary) => `<link rel="canonical" href="${raw.url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}">`;
let pass = 0;
async function test(name, fn) { await fn(); pass++; console.log("PASS " + name); }
async function main() {
  await test("Originalmetadaten bleiben wortgetreu und an Artikel gebunden", () => {
    const r = E.fromHtml(document, { body: html(), finalUrl: raw.url });
    assert.equal(r.ok, true); assert.equal(r.summary, summary);
    assert.equal(E.fromHtml(document, { body: html(), finalUrl: raw.url + "/fremd" }).ok, false);
    assert.equal(E.fromHtml(document, { body: html().replace(raw.url, "https://example.org/anderes"), finalUrl: raw.url }).ok, false);
    assert.equal(E.fromHtml(document, { body: html().replace(title, "Neuigkeiten auf unserem Nachrichtenportal"), finalUrl: raw.url }).ok, false);
  });
  await test("Kein Volltextfallback, Titelduplikat, Logintext oder abgeschnittener Satz", () => {
    assert.equal(E.fromHtml(document, { body: `<title>${title}</title><main>${summary}</main>`, finalUrl: raw.url }).ok, false);
    assert.equal(E.excerpt(title, title), null);
    assert.equal(E.excerpt("Das Bundesministerium für wirtschaftliche Zusammenarbeit und Entwicklung ist zuständig für die deutsche Entwicklungspolitik.", title), null);
    assert.equal(E.excerpt("Bitte aktivieren Sie JavaScript und akzeptieren Sie unsere Cookies fuer die Anzeige der vollstaendigen Inhalte.", title), null);
    assert.equal(E.excerpt("Wort ".repeat(80), title), null);
    assert.equal(E.excerpt(summary + " Ein langer Folgesatz " + "wiederholt ".repeat(50), title), summary);
    assert.equal(E.plain("Fachleute &amp; Kommunen &#x2013; &#252;ber &quot;Pflege&quot;"), 'Fachleute & Kommunen – über "Pflege"');
  });
  await test("Rohspiegel nur mit identischer Kennung, Titel und Publikationszeit", () => {
    assert.equal(E.fromMirror(document, [raw]).summary, summary);
    for (const patch of [{ url: raw.url + "/anderes" }, { publishedAt: "2026-09-09T21:00:00Z" }, { title: "Anderes Thema mit fremden Aussagen" }])
      assert.equal(E.fromMirror(document, [{ ...raw, ...patch }]).ok, false);
  });
  await test("Kurze Wortabbrueche und Ellipsen liefern keinen vermeintlichen ganzen Satz", () => {
    const fragment = "Die regionale Kommission untersucht gemeinsam mit den Kommunen die Finanzier";
    for (const value of [fragment, fragment + "...", fragment + "…", fragment + ","]) {
      assert(value.length < E.MAX);
      assert.equal(E.excerpt(value, title), null);
      assert.equal(E.fromHtml(document, { body: html(value), finalUrl: raw.url }).ok, false);
      assert.equal(E.fromMirror(document, [{ ...raw, content: value }]).ok, false);
    }
  });
  await test("Ganze Originalsaetze bleiben vor kurzem Folgeabbruch erhalten", () => {
    for (const tail of [" Anschliessend soll", " Ein Gespraech", " Mit Prof. Dr.", " Weitere Details folg..."]) {
      assert((summary + tail).length < E.MAX);
      assert.equal(E.excerpt(summary + tail, title), summary);
    }
    const value = "Dr. Beispiel erlaeutert der Kommission am 12. September die Finanzierung der kommunalen Beratungsangebote.";
    assert.equal(E.excerpt(value, title), value);
    assert.equal(E.excerpt(value + " Die Expertin Prof. Dr.", title), value);
    const zitat = 'Der Ausschuss fragt: „Welche Mittel benoetigen die kommunalen Beratungsstellen?“';
    assert.equal(E.excerpt(zitat, title), zitat);
  });
  await test("RSS Speichergrenze erzeugt keinen neuen Satz oder Wortabbruch", () => {
    const lang = summary + " Die nachfolgende Beratung untersucht " + "weitere Einzelheiten ".repeat(20);
    assert.equal(D.sourceExcerpt({ title, content: lang }), summary);
    assert.equal(D.sourceExcerpt({ title, content: "Ein offener langer Satz " + "weitere Einzelheiten ".repeat(30) }), null);
    const kurz = "Kommunale Beratungsangebote im Ueberblick";
    assert.equal(D.sourceExcerpt({ title, content: kurz }), kurz);
    assert.equal(D.toRawDocumentRow({ ...raw, content: lang }).summary, summary);
  });
  await test("Bedingtes Schreiben erhaelt Altmetadaten und bindet Identitaet", () => {
    const before = { ...document, raw: { erhalten: { wert: 7 } }, content_hash: "hash", canonical_url: raw.url };
    const after = G.plannedAfter(before, { ok: true, summary, origin: "artikel-metadaten" }, { tag: "2026-09-10" });
    assert.deepEqual(after.raw.erhalten, before.raw.erhalten);
    assert.equal(before.summary, null); assert.equal(after.summary, summary);
    for (const k of Object.keys(before).filter(k => !["raw", "summary"].includes(k))) assert.deepEqual(after[k], before[k]);
    const q = new URLSearchParams(G.casQuery(before));
    assert.equal(q.get("raw"), 'eq.{"erhalten":{"wert":7}}');
    assert.equal(q.get("summary"), "is.null"); assert.equal(q.get("url"), "eq." + raw.url);
    assert.equal(q.get("title"), "eq." + title); assert.equal(q.get("content_hash"), "eq.hash");
    assert.throws(() => G.plannedAfter({ ...before, summary: "bestehend" }, { ok: true, summary }, {}));
    assert.throws(() => G.casQuery({ ...before, raw: undefined }));
    assert.throws(() => G.plannedAfter({ ...before, raw: ["Altwert"] }, { ok: true, summary }, {}));
    const previous = { tag: "2026-09-09", status: "artikelabruf-nicht-bestaetigt" };
    const retry = G.plannedAfter({ ...before, raw: { ...before.raw, helmutQuellenkontext: previous } },
      { ok: true, summary }, { tag: "2026-09-10" });
    assert.deepEqual(retry.raw.helmutQuellenkontext.vorherigerVersuch, previous);
  });
  await test("Artikelziel sperrt lokale Adressen und Zugangsparameter", () => {
    for (const url of ["http://example.org/a", "https://127.0.0.1/a", "https://[::1]/a", "https://metadata.internal/a", "https://name:pass@example.org/a", "https://example.org:444/a"])
      assert.equal(G.publisherHost(url), null);
    assert.equal(G.publisherHost("https://www.example.org/a"), "example.org");
  });
  await test("Echter Crawler verweigert fremden Redirect vor zweiter Netzstelle", async () => {
    // Reiner Transportstub. Keine Verbindung, keine Erlaubnis des lokalen Guards.
    const https = require("node:https"), original = https.get;
    let calls = 0;
    https.get = (url, opts, callback) => {
      calls++;
      const req = new EventEmitter(); req.destroy = error => req.emit("error", error);
      queueMicrotask(() => callback({ statusCode: 302, headers: { location: "https://anderes.example.org/a" }, resume() {} }));
      return req;
    };
    try {
      await assert.rejects(require("../lib/helmut/crawler").fetchUrl(raw.url, 0, { allowedHost: "example.org", env: {} }), /quellenkontext-hostwechsel/);
      assert.equal(calls, 1);
    } finally { https.get = original; }
  });
  await test("Gesamtabbruch bleibt trotz Anbieterumschliessung wirksam", async () => {
    const https = require("node:https"), original = https.get;
    const provider = require("../lib/helmut/anbieter-steuerung");
    const reserve = provider.reserviere, melde = provider.melde;
    let destroyed = 0;
    https.get = () => {
      const req = new EventEmitter();
      req.destroy = error => { destroyed++; req.emit("error", error); req.emit("close"); };
      return req;
    };
    provider.reserviere = async () => ({ erlaubt: true }); provider.melde = async () => ({});
    try {
      const stop = new AbortController();
      const pending = require("../lib/helmut/crawler").fetchUrl(raw.url, 0,
        { allowedHost: "example.org", env: { HELMUT_ANBIETER_STEUERUNG: "on" }, abbruchSignal: stop.signal });
      setImmediate(() => stop.abort());
      await assert.rejects(pending, /Abgebrochen/); assert.equal(destroyed, 1);
    } finally { https.get = original; provider.reserviere = reserve; provider.melde = melde; }
  });
  await test("Neue Suchwegauszuege behalten Grenzen und alten Quellenstand", pruefeSuchwegAnschluss);
  await test("Echter Suchweg und exakter Bestandsreader bleiben quellengebunden", pruefeSuchwegPipeline);
  await test("Schreibender Scheduler liefert den Abruf ohne Storage Ingestion Import", pruefeSuchwegVerdrahtung);
  await test("Neue Auszuege durch echten Storage und Quellenprojektion bis zur gerenderten Lagekarte", pruefeSuchwegKarte);
  console.log(`${pass}/${pass} Quellenpruefgruppen bestanden`);
}
async function pruefeSuchwegAnschluss() {
const url='https://www.ndr.de/nachrichten/info/synthetischer-testartikel.html';
const title='Synthetischer Ausschuss beraet kommunale Angebote';
const description='Der synthetische Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.';
const doc=(id='new')=>({id,url,canonical_url:url,title,source_type:'ministry',link_type:'direct',raw:{erhalten:{wert:7}},findings:[{original_url:'https://news.google.com/rss/articles/synthetic'}]});
const body=`<link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">`;
let checks=0;

 const rows=[doc()], before=JSON.stringify(rows);let reads=0,fetches=0;
 const deps={env:{HELMUT_SUCHWEGAUSZUEGE:'on',HELMUT_SUCHWEGAUSZUEGE_HOSTS:'www.ndr.de'},suchwegDokumentIds:['new'],leseVorhandene:async ids=>{reads++;assert.deepEqual(ids,['new']);return[];},fetchUrl:async(u,depth,options)=>{fetches++;assert.equal(u,url);assert.equal(depth,0);assert.equal(options.artikelkontext,true);assert.equal(options.allowedHost,'ndr.de');return{finalUrl:u,body};}};
 let r;
 for(const hosts of [undefined,'','*.ndr.de','www.ndr.de,127.0.0.1','https://www.ndr.de','www.ndr.de/fremd','name:pass@www.ndr.de']) {
  r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,env:{HELMUT_SUCHWEGAUSZUEGE:'on',HELMUT_SUCHWEGAUSZUEGE_HOSTS:hosts}});
  assert.equal(r.metadatenAuszug.reason,'herausgeber-nicht-freigegeben');
 }
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,env:{...deps.env,HELMUT_SUCHWEGAUSZUEGE_HOSTS:'www.rnd.de'}});
 assert.equal(r.metadatenAuszug.attempted,0);assert.equal(reads,0);assert.equal(fetches,0);
 for (const value of [undefined, 'off', 'true', 'ON']) {
  r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,env:{HELMUT_SUCHWEGAUSZUEGE:value,HELMUT_ARTIKELKONTEXT:'on'}});
  assert.equal(r.metadatenAuszug.reason,'ausgeschaltet');
 }
 // Der neue Speicherschalter schaltet keine Beschaffung im Understanding ein.
 const options={budgetMs:30000};
 assert.equal(require('../lib/helmut/artikelkontext-lauf').mitArtikelkontext(options,deps.env),options);
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,env:{}});
 assert.equal(r.documents,rows);assert.equal(reads,0);assert.equal(fetches,0);assert.equal(r.metadatenAuszug.readRequests,0);checks++;
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,deps);
 assert.equal(r.metadatenAuszug.prepared,1);assert.equal(r.metadatenAuszug.readRequests,1);assert.equal(r.documents[0].summary,description);assert.equal(JSON.stringify(rows),before);assert.equal(r.documents[0].source_type,'ministry');assert.equal(r.documents[0].url,url);assert.equal(fetches,1);assert.equal(r.documents[0].raw.helmutQuellenkontext.status,'ergaenzt');assert.equal(r.documents[0].raw.helmutQuellenkontext.auszugHash,require('node:crypto').createHash('sha256').update(description).digest('hex'));checks++;
 assert.deepEqual(r.documents[0].raw.erhalten,rows[0].raw.erhalten);
 for(const published_at of [null,'2026-11-05T12:00:00Z']) {
  const dated={...doc(),published_at};
  const result=await E.ergaenzeNeueSuchwegAuszuege([dated],{...deps,fetchUrl:async()=>({finalUrl:url,body:body+'<meta property="article:published_time" content="2029-01-01T00:00:00Z">'})});
  assert.equal(result.documents[0].published_at,published_at);
 }
 for(const change of [{summary:'Vorhandener Auszug.'},{link_type:'google_proxy'},{canonical_url:'https://www.ndr.de/fremder-artikel'},{url:'https://unbekannt.example/article',canonical_url:'https://unbekannt.example/article'}]){
  const prior=fetches;r=await E.ergaenzeNeueSuchwegAuszuege([{...doc(),...change}],deps);assert.equal(fetches,prior);assert.equal(r.metadatenAuszug.prepared,0);checks++;
 }
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,leseVorhandene:async()=>[{id:'new',summary:'Altbestand'}]});assert.equal(r.metadatenAuszug.reason,'nur-bestandsdokumente');assert.equal(fetches,1);checks++;
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,leseVorhandene:async()=>{throw Error('read unknown');}});assert.equal(r.metadatenAuszug.reason,'bestand-nicht-lesbar');assert.equal(fetches,1);checks++;
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,leseVorhandene:async()=>[{id:'foreign'}]});assert.equal(r.metadatenAuszug.reason,'bestand-nicht-bestaetigt');assert.equal(fetches,1);checks++;
 const stopped=new AbortController();stopped.abort();const beforeReads=reads;r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,abbruchSignal:stopped.signal});assert.equal(reads,beforeReads);assert.equal(r.metadatenAuszug.readRequests,0);checks++;
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,suchwegDokumentIds:[]});assert.equal(r.metadatenAuszug.attempted,0);checks++;
 let limited=0;r=await E.ergaenzeNeueSuchwegAuszuege([doc('one'),doc('two')],{...deps,suchwegDokumentIds:['one','two'],leseVorhandene:async()=>[],fetchUrl:async()=>{limited++;throw Error('fetch unknown');}});assert.equal(limited,1);assert.equal(r.metadatenAuszug.attempted,1);assert.equal(r.metadatenAuszug.prepared,0);checks++;
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,fetchUrl:async()=>({finalUrl:url,body:body+'<meta name="robots" content="nosnippet">'})});assert.equal(r.metadatenAuszug.reason,'original-metadaten-gesperrt');checks++;
 console.log('PASS '+checks+' Anschlusspruefungen: Default aus, Metadaten vor Neuanlage, Suchkanaltyp, unveraenderte Eingabe, bestehende Auszuege, Proxy, fremde Ziele, unbekannter Herausgeber, Bestandsfehler,1Abruf,Robotsmetadaten.');

}

async function pruefeSuchwegPipeline() {
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const crawler={exports:require('../lib/helmut/crawler')};
const D=require('../lib/helmut/dedup'),G=require('../lib/helmut/quellenarchitektur/dedup-global'),E=require('../lib/helmut/quellen-auszug');
const title='Synthetischer Ausschuss beraet kommunale Angebote';
const url='https://www.ndr.de/nachrichten/info/synthetischer-testartikel.html';
const google='https://news.google.com/rss/articles/synthetic';
const item=crawler.exports.normalizeRawItem({title,url,originalUrl:google,content:title,publisherName:'NDR',publisherUrl:'https://www.ndr.de',publishedAt:'2026-11-05T12:00:00Z'},
 {id:'synthetischer-suchweg',name:'Thematische Suche',type:'ministry',url:'https://news.google.com/rss/search?q=synthetic'});
const raw=D.toRawDocumentRow(item);assert.equal(raw.summary,null);assert.equal(raw.raw.originalUrl,google);assert.equal(raw.source_type,'ministry');
const plan=G.planDedupWrites([raw],[]);assert.equal(plan.persists.length,1);assert.equal(plan.findings[0].original_url,google);assert.equal(plan.persists[0].canonical_url,D.canonicalizeUrl(url));assert.equal(plan.persists[0].source_type,'ministry');
const storage=fs.readFileSync(path.join(root,'lib/helmut/storage.js'),'utf8');
const binding=/suchwegDokumentIds: (items\.filter\(item => \{[\s\S]*?\}\)\.map\(item => item\.id\))/.exec(storage)?.[1];assert(binding);
const boundIds=new Function('items','return '+binding)([raw]);assert.deepEqual(boundIds,[plan.persists[0].id]);
const source=storage.slice(storage.indexOf('async function getRawDocumentsByIds('),storage.indexOf('// Offene Vorbedingungen zaehlen:'));
class StorageReadError extends Error {constructor(table,error){super(table+': '+error.message);}}
const reader=new Function('supabaseRequest','v3StoreReady','RAW_DOC_ID_CHUNK','inFilterWert','StorageReadError','require',source+';return getRawDocumentsByIds;')(
 async()=>({unexpected:'200-not-array'}),()=>true,100,x=>x,StorageReadError,n=>{assert.equal(n,'./quellen-auszug');return E;});

 assert.deepEqual(await reader(boundIds),[]); // Altvertrag unveraendert.
 await assert.rejects(()=>reader(boundIds,{requireArray:true}),/leseantwort-ungueltig/);
 let requests=0;
 const rejected=await E.ergaenzeNeueSuchwegAuszuege(plan.persists,{env:{HELMUT_SUCHWEGAUSZUEGE:'on',HELMUT_SUCHWEGAUSZUEGE_HOSTS:'www.ndr.de'},suchwegDokumentIds:boundIds,leseVorhandene:ids=>reader(ids,{requireArray:true}),fetchUrl:async()=>{requests++;throw Error('must not fetch');}});
 assert.equal(rejected.metadatenAuszug.reason,'bestand-nicht-lesbar');assert.equal(rejected.metadatenAuszug.readRequests,1);assert.equal(requests,0);
 const description='Der synthetische Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.';
 const completed=await E.ergaenzeNeueSuchwegAuszuege(plan.persists,{env:{HELMUT_SUCHWEGAUSZUEGE:'on',HELMUT_SUCHWEGAUSZUEGE_HOSTS:'www.ndr.de'},suchwegDokumentIds:boundIds,leseVorhandene:async()=>[],fetchUrl:async()=>({finalUrl:url,body:`<link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">`})});
 assert.equal(completed.metadatenAuszug.prepared,1);assert.equal(completed.documents[0].summary,description);assert.equal(plan.persists[0].summary,undefined);
 console.log('PASS: echte Normalisierung -> echte Minimierung -> globale Dedup -> originale Google Eingabebindung -> validierter neuer Auszug.');
 console.log('PASS: echter Bestandsreader200NichtArray wird im OptIn als UNKNOWN abgelehnt;0Artikelrequests; Altvertrag unveraendert.');

}

async function pruefeSuchwegVerdrahtung() {
  const fs = require("node:fs"), path = require("node:path");
  const root = path.resolve(__dirname, "..");
  const storage = fs.readFileSync(path.join(root, "lib/helmut/storage.js"), "utf8");
  const scheduler = fs.readFileSync(path.join(root, "lib/helmut/scheduler.js"), "utf8");
  assert.match(scheduler.split("\n")[0], /\bfetchUrl\b.*require\("\.\/crawler"\)/);
  const storageFn = storage.slice(storage.indexOf("async function persistRawDocumentsDeduped("),
    storage.indexOf("// Groesse eines Bulk-Blocks."));
  const schedulerFn = scheduler.slice(scheduler.indexOf("async function persistRawDocumentsShadow("),
    scheduler.indexOf("function betriebsClusterMitText("));
  let inserted = [], reads = 0, fetches = 0;
  const stop = new AbortController();
  const url = "https://www.ndr.de/nachrichten/info/synthetischer-testartikel.html";
  const title = "Synthetischer Ausschuss beraet kommunale Angebote";
  const description = "Der synthetische Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.";
  const item = require("../lib/helmut/crawler").normalizeRawItem({ title, url,
    originalUrl: "https://news.google.com/rss/articles/synthetic", content: title,
    publisherName: "NDR", publisherUrl: "https://www.ndr.de", publishedAt: "2026-11-05T12:00:00Z" },
  { id: "synthetischer-suchweg", name: "Thematische Suche", type: "ministry", url: "https://news.google.com/rss/search?q=synthetic" });
  const localRequire = require("node:module").createRequire(path.join(root, "lib/helmut/storage.js"));
  const persist = new Function("require", "v3StoreReady", "v3SkipReason", "ladeDedupBestandsfenster",
    "getRawDocumentsByIds", "saveRawDocumentsGebuendelt", "supabaseRequest", "erhoeheFindingCounts",
    storageFn + "; return persistRawDocumentsDeduped;")(
    name => { assert.notEqual(name, "./crawler"); return localRequire(name); }, () => true, () => "unbenutzt",
    async () => ({ bestand: [], seiten: 1, gedeckelt: false }),
    async (ids, opts) => { reads++; assert.equal(opts.requireArray, true); return []; },
    async rows => { inserted = rows; return { persisted: rows.length, anfragen: 1, einzeln: 0 }; },
    async () => [], async () => ({ anfragen: 0, aktualisiert: 0, verfehlt: [] }));
  const fetchUrl = async (target, depth, opts) => {
    fetches++; assert.equal(target, url); assert.equal(depth, 0);
    assert.equal(opts.abbruchSignal, stop.signal); assert.equal(opts.artikelkontext, true);
    return { finalUrl: target, body: `<link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">` };
  };
  const shadow = new Function("v3StoreEnabled", "dedupeRawDocuments", "toRawDocumentRow", "sourceMode",
    "persistRawDocumentsDeduped", "saveRawDocument", "recordPipelineError", "fetchUrl",
    schedulerFn + "; return persistRawDocumentsShadow;")(
    () => true, D.dedupeRawDocuments, D.toRawDocumentRow, () => "on", persist,
    async () => { throw Error("unerwarteter Einzelrueckfall"); }, async () => {}, fetchUrl);
  const beforeFlag = process.env.HELMUT_SUCHWEGAUSZUEGE;
  const beforeHosts = process.env.HELMUT_SUCHWEGAUSZUEGE_HOSTS;
  try {
    process.env.HELMUT_SUCHWEGAUSZUEGE = "on";
    process.env.HELMUT_SUCHWEGAUSZUEGE_HOSTS = "www.ndr.de";
    const result = await shadow([item], { abbruchSignal: stop.signal });
    assert.equal(result.persisted, 1); assert.equal(result.metadatenAuszug.prepared, 1);
    assert.equal(result.schreibAnfragen, 4); assert.equal(reads, 1); assert.equal(fetches, 1);
    assert.equal(inserted[0].summary, description); assert.equal(inserted[0].source_type, "ministry");
    // Andere direkte Storage Aufrufer behalten den bisherigen Schreibvertrag.
    // Ohne expliziten Abruf gibt es weder Netz noch Zusatzlesung.
    const plainResult = await persist([D.toRawDocumentRow(item)]);
    assert.equal(plainResult.persisted, 1); assert.equal(plainResult.metadatenAuszug.prepared, 0);
    assert.equal(plainResult.metadatenAuszug.reason, "anschluss-unvollstaendig");
    assert.equal(reads, 1); assert.equal(fetches, 1); assert.equal(inserted[0].summary, undefined);
  } finally {
    if (beforeFlag === undefined) delete process.env.HELMUT_SUCHWEGAUSZUEGE;
    else process.env.HELMUT_SUCHWEGAUSZUEGE = beforeFlag;
    if (beforeHosts === undefined) delete process.env.HELMUT_SUCHWEGAUSZUEGE_HOSTS;
    else process.env.HELMUT_SUCHWEGAUSZUEGE_HOSTS = beforeHosts;
  }
}

async function pruefeSuchwegKarte() {
  const http = require("node:http"), { once } = require("node:events");
  const storage = require("../lib/helmut/storage");
  const lage = require("../lib/helmut/lage");
  const render = require("./lib/briefing-ansichten");
  const now = new Date("2026-11-07T12:00:00Z");
  const title = "Synthetischer Ausschuss beraet kommunale Angebote";
  const url = "https://www.ndr.de/nachrichten/info/synthetischer-testartikel.html";
  const description = "Der synthetische Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.";
  const item = require("../lib/helmut/crawler").normalizeRawItem({ title, url, content: title,
    originalUrl: "https://news.google.com/rss/articles/synthetic", publisherName: "NDR",
    publisherUrl: "https://www.ndr.de", publishedAt: "2026-11-05T12:00:00Z" },
  { id: "synthetischer-suchweg", name: "Thematische Suche", type: "ministry", url: "https://news.google.com/rss/search?q=synthetic" });
  const input = D.toRawDocumentRow(item), before = JSON.stringify(input);
  const rows = new Map();
  let fetches = 0, writes = 0, readPatch = null, readFailure = false;
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, "http://127.0.0.1");
      let result = [];
      if (req.method === "POST") {
        assert(["/rest/v1/raw_documents", "/rest/v1/document_findings"].includes(u.pathname));
        assert.match(req.headers.prefer, /resolution=ignore-duplicates/);
        let body = ""; for await (const chunk of req) body += chunk;
        if (u.pathname.endsWith("/raw_documents")) {
          for (const row of JSON.parse(body)) {
            if (rows.has(row.id)) continue;
            rows.set(row.id, structuredClone(row)); result.push({ id: row.id }); writes++;
          }
        }
      } else {
        assert.equal(req.method, "GET");
        if (readFailure && u.searchParams.has("id")) throw Error("isolierter Lesefehler");
        // Simuliert einen Bestand ausserhalb des 14-Tage-Fensters. Nur der
        // echte exakte Reader kann die Wiederholung vor einem Abruf erkennen.
        if (!u.searchParams.has("created_at")) {
          const select = u.searchParams.get("select") || "";
          result = [...rows.values()].filter(d => !u.searchParams.has("id") || u.searchParams.get("id").includes(d.id))
            .map(({ raw, ...d }) => ({ ...d,
              ...readPatch, ...(select.includes("quellenauszug_beleg:raw->helmutQuellenkontext")
                ? { quellenauszug_beleg: raw.helmutQuellenkontext || null } : {}) }));
          if (u.pathname.endsWith("/ko_document_links")) result = result.map(d => ({ raw_document_id: d.id, raw_documents: d }));
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(result));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: error.message }));
    }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const env = { SUPABASE_URL: "http://127.0.0.1:" + server.address().port,
    SUPABASE_SERVICE_ROLE_KEY: "rein-lokaler-testwert", HELMUT_V3_STORE: "1",
    HELMUT_SUCHWEGAUSZUEGE: "on", HELMUT_SUCHWEGAUSZUEGE_HOSTS: "www.ndr.de", HELMUT_ARTIKELKONTEXT: "off" };
  const prior = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  try {
    const fetchUrl = async target => {
      fetches++; return { finalUrl: target, body: `<link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">` };
    };
    const saved = await storage.persistRawDocumentsDeduped([input], { fetchUrl });
    assert.equal(saved.persisted, 1); assert.equal(saved.metadatenAuszug.prepared, 1);
    const native = structuredClone(rows.get(input.id));
    assert.equal(native.summary, description);
    assert.equal(native.raw.helmutQuellenkontext.auszugHash, require("node:crypto").createHash("sha256").update(description).digest("hex"));
    for (const key of ["id", "url", "canonical_url", "source_name", "source_type", "published_at"])
      assert.equal(native[key], input[key], key);
    const repeated = await storage.persistRawDocumentsDeduped([input], { fetchUrl });
    assert.equal(repeated.persisted, 0); assert.equal(repeated.metadatenAuszug.reason, "nur-bestandsdokumente");
    assert.equal(fetches, 1); assert.equal(writes, 1); assert.deepEqual(rows.get(input.id), native);
    assert.equal(JSON.stringify(input), before);
    const docs = await storage.listKoDocuments("ko-synthetisch");
    assert.equal(docs[0].summary, description); assert(!Object.hasOwn(docs[0], "raw"));
    const prompt = require("../lib/helmut/understanding").buildUnderstandingPrompt({ documents: docs });
    assert(prompt.includes(description)); assert(prompt.includes(input.id));
    // Echter Eagerlauf mit ORIGINAL-Crawlitem (noch ohne Auszug). Ausschliesslich
    // Modell, KO-Ablage, Budget und Locks sind lokale Attrappen.
    const kos = []; let prompts = 0, expectExcerpt = false, mixed = false;
    const overrides = { enabled: () => true, aiEnabled: () => true,
      acquireLock: async () => ({ granted: true }), releaseLock: async () => {},
      getExisting: async () => null, findVorgangCandidates: async () => [],
      verstehenVertrag: () => null, clusterWache: null, gateMode: () => "off", priorityEnabled: () => false,
      canSpend: async () => ({ allowed: true }), modelName: () => "lokale-attrappe", logSkip: () => {},
      requestUnderstanding: async prompt => {
        prompts++; assert(!prompt.includes("FREMDER ALTABSATZ"));
        assert.equal(prompt.includes(description), mixed ? prompt.includes(input.id) : expectExcerpt);
        if (!mixed) assert(prompt.includes(input.id));
        return { headline: title, was_ist_passiert: expectExcerpt ? description : "Synthetischer Titelhinweis.", warum_wichtig: "Synthetischer Test", wer_ist_betroffen: "Synthetischer Test",
          parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [], zeitdruck: "mittel",
          handlungsempfehlung: "Synthetischer Test", confidence_score: 70, display_title: title, display_summary: expectExcerpt ? description : "Synthetischer Titelhinweis.",
          why_relevant: "", recommendation: "", display_category: "" };
      },
      save: async ko => { kos.push(ko); return { saved: true }; }, saveSources: async () => {},
      savePending: async () => { throw Error("unerwartete Vormerkung"); },
      markFailed: async () => { throw Error("unerwartete Fehlermarkierung"); } };
    const lauf = require("../lib/helmut/artikelkontext-lauf").runUnderstandingShadow;
    process.env.HELMUT_SUCHWEGAUSZUEGE = "off";
    await lauf([item], overrides); // Bisheriger Pfad analysiert nur den Titel.
    process.env.HELMUT_SUCHWEGAUSZUEGE = "on"; expectExcerpt = true;
    // PostgREST gibt denselben Zeitpunkt mit anderem Offsetformat zurueck.
    readPatch = { published_at: "2026-11-05T12:00:00+00:00" };
    const result = await lauf([item], overrides);
    assert.equal(result.counts.saved, 1, JSON.stringify(result)); assert.equal(prompts, 2);
    assert.equal(kos.length, 2); const ko = kos[1];
    readPatch = { id: "fremde-kennung" };
    await assert.rejects(() => lauf([item], overrides), /suchwegauszug-quellbindung-abweichend/);
    expectExcerpt = false;
    for (const patch of [{ title: "Fremder Artikel" },
      { url: url + "-fremd" }, { canonical_url: url + "-fremd" },
      { published_at: "2026-11-06T12:00:00Z" }, { published_at: null }]) {
      readPatch = patch;
      await lauf([item], overrides);
    }
    readPatch = null; readFailure = true;
    await assert.rejects(() => lauf([item], overrides), /isolierter Lesefehler/);
    readFailure = false; assert.equal(prompts, 7); assert.equal(fetches, 1); assert.equal(writes, 1);
    assert.deepEqual(rows.get(input.id), native); assert.equal(JSON.stringify(input), before);
    // Gleiche URL/ID mit spaeter geaendertem Feedtitel ist ein legitimer
    // Bestandskonflikt. Er darf den neuen unabhaengigen Artikel nicht stoppen.
    const oldItem = { ...item, title: "Landtag diskutiert Naturschutzgebiete und seltene Tierarten",
      url: url + "-naturschutz", originalUrl: "https://news.google.com/rss/articles/old-synthetic" };
    const oldRow = D.toRawDocumentRow(oldItem);
    rows.set(oldRow.id, { ...oldRow, title: "Historischer Titel zu Naturschutzgebieten",
      summary: "FREMDER ALTABSATZ darf nicht im aktuellen Prompt erscheinen.", raw: { erhalten: 7 } });
    const oldBefore = structuredClone(rows.get(oldRow.id));
    mixed = true; expectExcerpt = true;
    const mixedResult = await lauf([item, oldItem], overrides);
    assert.equal(mixedResult.counts.saved, 2, JSON.stringify(mixedResult));
    assert.deepEqual(rows.get(oldRow.id), oldBefore);
    // Ein direkter Nicht-Suchweg wird auch mit leerem Auszug nicht nachgelesen.
    readFailure = true;
    await lauf([{ ...oldItem, originalUrl: oldItem.url }], overrides);
    readFailure = false;
    const card = lage.koToVorgangCard(ko, docs, now);
    assert.equal(card.displaySummary, description);
    assert.equal(card.sources[0].url, url); assert.equal(card.sources[0].name, input.source_name);
    assert.equal(card.sources[0].publishedAt, input.published_at);
    const out = render({ currentHelmutState: { status: "empty" }, currentRadarState: {},
      lageBriefing: { available: true, vorgaenge: [card] } }, now.toISOString()).html.lage;
    assert(out.includes(description)); assert(out.includes(url)); assert(out.includes(card.sources[0].dateLabel));
    const missing = lage.koToVorgangCard(ko, docs.map(d => ({ ...d, summary: null })), now);
    assert.equal(missing.displaySummary, "Artikelauszug fehlt; nur Quellentitel verfügbar.");
    assert(!missing.displaySummary.includes(description));
  } finally {
    for (const [k, value] of Object.entries(prior)) { if (value === undefined) delete process.env[k]; else process.env[k] = value; }
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
