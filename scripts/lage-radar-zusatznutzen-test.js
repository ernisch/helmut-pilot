"use strict";
const A = require("node:assert/strict");
const { teile } = require("../lib/helmut/lage-quellenteilung");
const R = require("../lib/helmut/radarState");
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS " + name); }
const s = (id, extra = {}) => ({ name: "Testquelle", title: `Original ${id}`, url: `https://example.org/artikel/${id}`, ...extra });
const card = (id, sources) => ({ id, vorgangId: id, displayTitle: `Vorgang ${id}`, displaySummary: `Sachstand ${id}`,
  whyRelevant: "Nur fuer den urspruenglichen Vorgang", relevanz: { satz: "Alte Zuordnung" }, sources });
test("Sammelkarte verliert doppelte Prosa, andere Originalmeldungen bleiben erhalten", () => {
  const broad = card("sammel", [s("a"),s("b"),s("c")]), focused = card("einzel", [s("a")]);
  const input = [broad,focused], before = JSON.stringify(input);
  const out = teile(input, { sammel: [{ url: s("b").url, summary: "Ein eigener belegter Originalauszug." }] });
  A.equal(out.length,3); A.equal(out[2],focused); A.equal(out[0].displayTitle,"Original b");
  A.equal(out[0].displaySummary,"Ein eigener belegter Originalauszug.");
  A.equal(out[1].displaySummary,"Artikelauszug fehlt; nur Quellentitel verfügbar.");
  A.equal(out[0].relevanz,undefined); A.equal(out[0].whyRelevant,undefined);
  A.equal(out.filter(c => c.sources.some(q => q.url===s("a").url)).length,1);
  A.equal(new Set(out.map(c => c.anzeigeId || c.vorgangId)).size,3);
  A.equal(out[0].vorgangId,"sammel"); A.equal(JSON.stringify(input),before);
  A.deepEqual(teile(out),out,"Anzeigeprojektion ist idempotent");
});
test("Gleiches Thema und einzelne gemeinsame Reportquelle verschmelzen keine Ereignisse", () => {
  const a=card("a",[s("report"),s("a")]),b=card("b",[s("report"),s("b")]);
  A.deepEqual(teile([a,b]),[a,b]);
  const single=card("teil1",[s("report")]),single2=card("teil2",[s("report")]);
  A.deepEqual(teile([single,single2]),[single,single2]);
});
test("Kanonische Artikeladresse erkennt www, Tracking und Fragment", () => {
  const out=teile([card("a",[s("a",{url:s("a").url+"?utm_source=x#absatz"}),s("b")]),
    card("b",[s("a",{url:s("a").url.replace("example.org","www.example.org")})])]);
  A.equal(out.length,2); A.equal(out[0].displayTitle,"Original b");
});
test("Inhaltliche URL Parameter und explizite Ereignisrollen bleiben getrennt", () => {
  const a=card("a",[s("a",{url:"https://example.org/artikel?id=1"}),s("b")]);
  const b=card("b",[s("a",{url:"https://example.org/artikel?id=2"})]); A.deepEqual(teile([a,b]),[a,b]);
  a.ereignisTeilmitgliedId="gebunden"; A.deepEqual(teile([a,card("x",[s("b")])])[0],a);
  const large=card("breit",[s("b"),s("c")]),bound={...card("rolle",[s("b")]),ereignisTeilmitgliedId:"gebunden"};
  A.deepEqual(teile([large,bound]),[large,bound],"Gebundene Teilrollen decken nicht automatisch eine ganze Quelle ab");
});
test("Vollstaendig abgedeckte Sammelkarte entfernt keine Originalquelle", () => {
  const out=teile([card("a",[s("a"),s("b")]),card("b",[s("a")]),card("c",[s("b")])]);
  A.deepEqual(out.map(c=>c.vorgangId),["b","c"]);
});
const now=new Date("2026-11-13T10:00:00Z");
const ko={id:"ko-test",vorgang_id:"vg-test",status:"neu",understanding_status:"complete",headline:"Neue Regelungen zur Pflegeversorgung",
  was_ist_passiert:"Eine neue Pflegereform betrifft die Pflegeversicherung.",created_at:now.toISOString(),updated_at:now.toISOString(),confidence_score:90};
const docs=[0,1,2].map((i)=>({id:`d-${i}`,url:s(String(i)).url,title:"Debatte ueber die Pflegereform",
  summary:"Die Pflegeversicherung wird reformiert.",source_type:"media",source_name:"Testquelle",published_at:`2026-11-${11+i}T08:00:00Z`}));
function radar(profile, sources=docs, change={}) {
  const k={...ko,...change};
  return R.buildCurrentRadarState({profile:{id:"synthetisch",fullName:"Alex Beispiel",...profile},knowledgeObjects:[k],kosById:{[k.id]:k},
    decisions:[{knowledge_object_id:k.id,score:70,matched_features:[]}],sourcesByVorgang:{[k.vorgang_id]:sources},now}).anzeige;
}
for (const parliamentType of ["Bundestag","Landtag"]) test(`${parliamentType}: belegtes Fachthema mit echter Entwicklung passiert ohne Parteinennung`,()=>{
  const r=radar({parliamentType,reportingTopics:["Pflege"]});
  A.equal(r.dynamics.length,1); A.match(r.dynamics[0].evidence,/weitere Artikel/);
  A.equal(r.dynamics[0].summary,""); A.equal(r.articles.length,0);
  A.ok(r.dynamics[0].relationTypes.includes("subject"));
});
test("Nur Thema ohne zeitliche Veraenderung erzeugt kein Radar",()=>{
  A.equal(radar({focusTopics:["Pflege"]},docs.map(d=>({...d,published_at:docs[2].published_at}))).dynamics.length,0);
});
test("KO-Behauptung ohne passenden Quellenbeleg und fremde Fachthemen bleiben draussen",()=>{
  A.equal(radar({focusTopics:["Pflege"]},docs.map(d=>({...d,title:"Neue Software",summary:"Softwarepflege und Datenpflege."}))).dynamics.length,0);
  A.equal(radar({focusTopics:["Mietrecht"]}).dynamics.length,0);
});
test("Alte, undatierte oder zukuenftige Quellen werden nicht durch Verarbeitung verjuengt",()=>{
  for (const published_at of ["2026-09-01T08:00:00Z",null,"2027-01-01T08:00:00Z"])
    A.equal(radar({focusTopics:["Pflege"]},docs.map(d=>({...d,published_at}))).dynamics.length,0);
});
console.log(`${n}/${n} Lage-/Radar-Fallgruppen bestanden; rein lokal.`);
