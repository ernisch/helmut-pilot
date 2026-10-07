"use strict";
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const V = require("../lib/helmut/vorgang-identity"), B = require("../lib/helmut/berlin-artikelstand");
const { resolveVorgang } = require("../lib/helmut/understanding");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
function make(number, title, summary) {
  const url = `https://berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.${number}.php`;
  const stand = { version: 1, herkunft: B.HERKUNFT, url, titel: title, publikationstag: "2026-10-06",
    absatzHash: hash(summary), volltextHash: hash(summary + "\n") };
  stand.standHash = B.standHashFuer(stand);
  return { id: "rd-" + stand.standHash, content_hash: stand.standHash, title, summary,
    url, canonical_url: url, published_at: null, berlin_artikelstand: stand };
}
const paper = make(1999901, "Auszeichnung: Berlin ist eine der recyclingpapierfreundlichsten Städte Deutschlands",
  "Berlin wurde 2026 fuer die Beschaffung von Recyclingpapier ausgezeichnet.");
const nobel = make(1999902, "Nobelpreis für Berliner Spitzenforscher – Erfolg für Berlin",
  "Berlin wurde 2026 fuer seine Forschung mit dem Nobelpreis ausgezeichnet.");
const followup = make(1999903, "Berlin gratuliert Spitzenforscher zum Nobelpreis",
  "Der Spitzenforscher wurde mit dem Nobelpreis ausgezeichnet. Berlin gratuliert 2026.");
async function main() {
  const before = JSON.stringify([paper, nobel, followup]);
  for (const [a,b] of [[paper,nobel],[nobel,paper]]) {
    assert.equal(V.docsShareEvent(a,b).gleich, false);
    assert.equal(V.docsShareEvent(a,b).grund, "kein-gemeinsamer-titelbeleg");
    assert.ok(V.docsShareEvent(a,b).overlap.treffer.includes("berlin"));
  }
  assert.equal(V.docsShareEvent(nobel,followup).gleich, true);
  assert.equal(V.docsShareEvent(followup,nobel).gleich, true);
  assert.ok(V.docAnchors(paper).includes("berlin"));
  assert.ok(V.topicRoots({ documents:[paper] },20).includes("berlin"));
  const permutations = [[paper,nobel,followup],[paper,followup,nobel],[nobel,paper,followup],
    [nobel,followup,paper],[followup,paper,nobel],[followup,nobel,paper]];
  for (const docs of permutations) {
    const cs = V.clusterRawDocuments(docs);
    assert.equal(cs.length,2); assert.equal(cs.find(c=>c.documents.some(d=>d.id===paper.id)).documents.length,1);
    assert.equal(cs.flatMap(c=>c.documents).length,3);
  }
  assert.equal(JSON.stringify([paper,nobel,followup]),before);
  console.log("PASS bound city/year/award context does not join unrelated subjects; followups and all source values preserved");
  const legacy = d => { const x=structuredClone(d);delete x.berlin_artikelstand;return x; };
  assert.equal(V.docsShareEvent(legacy(paper),legacy(nobel)).gleich,true);
  const invalid = structuredClone(paper);invalid.berlin_artikelstand.standHash="0".repeat(64);
  assert.throws(()=>V.docsShareEvent(invalid,nobel),/berlin-artikelstand/);
  console.log("PASS rule needs both canonical Berlin stands; legacy behavior retained and invalid binding fails closed");
  const existing={id:"synthetic-ko-nobel",vorgang_id:"vg-synthetic-nobel",headline:nobel.title,updated_at:"2026-10-06"};
  const resolution=await resolveVorgang({documents:[paper]}, {findVorgangCandidates:()=>[existing],
    getExistingStreng:()=>null,listVorgangDocuments:()=>[nobel]});
  assert.equal(resolution.resolution,"neu");assert.equal(resolution.spuren.length,1);
  assert.equal(resolution.spuren[0].gleich,false);
  console.log("PASS actual resolver records unrelated Berlin candidate rejection without a model or write");
  console.log("3/3 groups passed; offline.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
