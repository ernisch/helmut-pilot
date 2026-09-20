"use strict";
// Synthetische DIP Antworten mit amtlich aussehenden Testadressen. Keine
// Behauptung, dass diese Drucksachen existieren; kein Netz und kein Modell.
const A = require("node:assert/strict");
const DIP = require("../lib/helmut/dip");
const S = require("../lib/helmut/scheduler");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const dokument = (id, typ = "Antrag", extra = {}) => S.dipDocToRawItem(DIP.normalizeDrucksache({ id,
  titel:"Finanzierung kommunaler Beratungsangebote", datum:"2026-09-19", drucksachetyp:typ,
  urheber:[{ titel:"Bundesregierung" }], ...extra }), { primary:true });
const a = dokument(990031), b = dokument(990032,"Bericht");
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS " + name); }
test("Verschiedene Drucksachen mit gleichem Titel und Urheber bleiben zwei Dokumente", () => {
  for (const docs of [[a,b],[b,a],[D.toRawDocumentRow(a),D.toRawDocumentRow(b)]]) {
    const plan = G.planDedupWrites(docs);
    A.equal(plan.persists.length,2); A.equal(plan.findings.length,2);
    A.equal(new Set(plan.findings.map(f=>f.raw_document_id)).size,2);
    A.equal(new Set(plan.persists.map(d=>d.content_fingerprint)).size,2);
    A.deepEqual(plan.persists.map(d=>d.document_type).sort(),["Antrag","Bericht"]);
  }
});
test("Auch gleicher Dokumenttyp ist kein Grund, unterschiedliche amtliche Kennungen zusammenzulegen", () => {
  A.equal(G.planDedupWrites([a,dokument(990033)]).persists.length,2);
});
test("Ein fremder alter Textfingerabdruck darf die neue Drucksache nicht verschlucken", () => {
  const legacy = { ...a }; delete legacy.dipQuellfelder;
  const alt = G.planDedupWrites([legacy]).persists[0];
  const plan = G.planDedupWrites([b],[{ id:alt.id, content_fingerprint:alt.content_fingerprint, canonical_target_url:alt.canonical_url }]);
  A.equal(plan.persists.length,1); A.equal(plan.persists[0].id,b.id);
  A.deepEqual(plan.countIncrements,{});
});
test("Dasselbe Dokument findet den alten Bestand weiterhin ueber seine kanonische Adresse", () => {
  const legacy = { ...a }; delete legacy.dipQuellfelder;
  const alt = G.planDedupWrites([legacy]).persists[0];
  const plan = G.planDedupWrites([a],[{ id:"alter-bestand",content_fingerprint:alt.content_fingerprint,canonical_target_url:alt.canonical_url }]);
  A.deepEqual(plan.persists,[]); A.equal(plan.findings[0].raw_document_id,"alter-bestand");
  A.deepEqual(plan.countIncrements,{ "alter-bestand":1 });
});
test("Eine unveraenderte API Kennung bleibt auch bei einer anderen amtlichen Adresse dieselbe Drucksache", () => {
  const other = dokument(990031,"Antrag",{ fundstelle:{pdf_url:"https://dserver.bundestag.de/btd/21/099/2109931.pdf"} });
  const plan = G.planDedupWrites([a,other]);
  A.equal(plan.persists.length,1); A.equal(plan.findings.length,2);
  const alt = plan.persists[0];
  A.equal(G.planDedupWrites([other],[{id:"vorhanden",content_fingerprint:alt.content_fingerprint,canonical_target_url:alt.canonical_url}]).findings[0].raw_document_id,"vorhanden");
});
test("Ein zweiter Suchweg zur selben Adresse bleibt eine Fundstelle desselben Dokuments", () => {
  const rss = { ...a,sourceId:"rss",dipQuellfelder:undefined };
  for (const docs of [[a,rss],[rss,a]]) {
    const plan = G.planDedupWrites(docs);
    A.equal(plan.persists.length,1); A.equal(plan.findings.length,2);
    A.equal(new Set(plan.findings.map(f=>f.raw_document_id)).size,1);
  }
});
test("Eine fruehere RSS Fundstelle umgeht den spaeteren amtlichen Kennungsschutz nicht", () => {
  const rss = { ...a,sourceId:"rss",dipQuellfelder:undefined };
  A.equal(G.planDedupWrites([rss,a,b]).persists.length,2);
});
test("Ungebundene oder manipulierte Metadaten erhalten keine amtliche Sonderidentitaet", () => {
  const wrong = structuredClone(a); wrong.dipQuellfelder.dokumentId = "990099";
  const plain = { ...a }; delete plain.dipQuellfelder;
  A.equal(G.mergeIntoDocuments([wrong])[0].content_fingerprint,G.mergeIntoDocuments([plain])[0].content_fingerprint);
});
console.log(`${n}/${n} Gruppen erfolgreich; keine Productiondaten geaendert.`);
