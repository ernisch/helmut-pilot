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
  console.log(`${pass}/${pass} Quellenpruefgruppen bestanden`);
}
async function pruefeSuchwegAnschluss() {
const url='https://www.ndr.de/nachrichten/info/synthetischer-testartikel.html';
const title='Synthetischer Ausschuss beraet kommunale Angebote';
const description='Der synthetische Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.';
const doc=(id='new')=>({id,url,canonical_url:url,title,source_type:'ministry',link_type:'direct',findings:[{original_url:'https://news.google.com/rss/articles/synthetic'}]});
const body=`<link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">`;
let checks=0;

 const rows=[doc()], before=JSON.stringify(rows);let reads=0,fetches=0;
 const deps={env:{HELMUT_ARTIKELKONTEXT:'on'},suchwegDokumentIds:['new'],leseVorhandene:async ids=>{reads++;assert.deepEqual(ids,['new']);return[];},fetchUrl:async(u,depth,options)=>{fetches++;assert.equal(u,url);assert.equal(depth,0);assert.equal(options.artikelkontext,true);assert.equal(options.allowedHost,'ndr.de');return{finalUrl:u,body};}};
 let r=await E.ergaenzeNeueSuchwegAuszuege(rows,{...deps,env:{}});
 assert.equal(r.documents,rows);assert.equal(reads,0);assert.equal(fetches,0);assert.equal(r.metadatenAuszug.readRequests,0);checks++;
 r=await E.ergaenzeNeueSuchwegAuszuege(rows,deps);
 assert.equal(r.metadatenAuszug.prepared,1);assert.equal(r.metadatenAuszug.readRequests,1);assert.equal(r.documents[0].summary,description);assert.equal(JSON.stringify(rows),before);assert.equal(r.documents[0].source_type,'ministry');assert.equal(r.documents[0].url,url);assert.equal(fetches,1);assert.equal(r.documents[0].raw.helmutQuellenkontext.status,'ergaenzt');assert.equal(r.documents[0].raw.helmutQuellenkontext.auszugHash,require('node:crypto').createHash('sha256').update(description).digest('hex'));checks++;
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
const plan=G.planDedupWrites([raw],[]);assert.equal(plan.persists.length,1);assert.equal(plan.findings[0].original_url,url);assert.equal(plan.persists[0].source_type,'ministry');
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
 const rejected=await E.ergaenzeNeueSuchwegAuszuege(plan.persists,{env:{HELMUT_ARTIKELKONTEXT:'on'},suchwegDokumentIds:boundIds,leseVorhandene:ids=>reader(ids,{requireArray:true}),fetchUrl:async()=>{requests++;throw Error('must not fetch');}});
 assert.equal(rejected.metadatenAuszug.reason,'bestand-nicht-lesbar');assert.equal(rejected.metadatenAuszug.readRequests,1);assert.equal(requests,0);
 const description='Der synthetische Ausschuss hoert am Dienstag Fachleute zur Finanzierung der Beratungsstellen an. Die Beratung betrifft Angebote in den Gemeinden.';
 const completed=await E.ergaenzeNeueSuchwegAuszuege(plan.persists,{env:{HELMUT_ARTIKELKONTEXT:'on'},suchwegDokumentIds:boundIds,leseVorhandene:async()=>[],fetchUrl:async()=>({finalUrl:url,body:`<link rel="canonical" href="${url}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}">`})});
 assert.equal(completed.metadatenAuszug.prepared,1);assert.equal(completed.documents[0].summary,description);assert.equal(plan.persists[0].summary,undefined);
 console.log('PASS: echte Normalisierung -> echte Minimierung -> globale Dedup -> originale Google Eingabebindung -> validierter neuer Auszug.');
 console.log('PASS: echter Bestandsreader200NichtArray wird im OptIn als UNKNOWN abgelehnt;0Artikelrequests; Altvertrag unveraendert.');

}

main().catch(e => { console.error(e); process.exitCode = 1; });
