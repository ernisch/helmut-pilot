"use strict";
// Offline regressions for typed official procedure references; no network/model.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const DIP = require("../lib/helmut/dip");
const Q = require("../lib/helmut/dip-quellfelder");
const S = require("../lib/helmut/scheduler");
const D = require("../lib/helmut/dedup");
const R = require("../lib/helmut/dip-vorgangsbezug");
const V = require("../lib/helmut/vorgang-identity");
const ref = id => ({ id, titel: "Gesetz zur Fachaufgabe " + id, vorgangstyp: "Gesetzgebung" });
const original = (id, refs) => ({ id, titel: "Entwurf eines Gesetzes zur Modernisierung und Digitalisierung", datum: "2026-10-01",
  drucksachetyp: "Gesetzentwurf", dokumentart: "Drucksache", urheber: [{ titel: "Bundesregierung" }],
  ...(refs === undefined ? {} : { vorgangsbezug: refs }) });
const make = (id, refs) => S.dipDocToRawItem(DIP.normalizeDrucksache(original(id, refs)), { primary: true });
const rehash = q => { const data = { ...q }; delete data.hash; q.hash = crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex"); };
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS " + name); }
test("Version1 ohne Bezug bleibt unveraendert samt Hash und Quellenangaben", () => {
  const d = make(990101), q = Q.lese(d);
  assert.equal(q.version, 1); assert.ok(!Object.hasOwn(q, "vorgangsbezug"));
  // Baseline of this fixture before MetadataV2, pinned to the old reader.
  assert.equal(q.hash, "c7c189f4d2cfc7587cfab58432fa8a78f5055e79c4382c5b928adb2546c8abea");
  const data = { ...q }; delete data.hash;
  assert.equal(q.hash, crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex"));
  assert.ok(!Object.hasOwn(Q.quellenangaben(d), "vorgangsbezuegeLautDIP"));
  assert.equal(Q.lese(make(990101, null)).version, 1);
});
test("Version2 bindet alle Referenzen und bleibt ueber die Rohprojektion lesbar", () => {
  const d = make(990102, [{ ...ref(770001), ungenutzterKontext: "nur Originalfeld" }, ref("770002")]);
  const q = Q.lese(d); assert.equal(q.version, 2); assert.deepEqual(q.vorgangsbezug.map(r => r.id), ["770001", "770002"]);
  assert.deepEqual(Object.keys(q.vorgangsbezug[0]), ["id", "titel", "vorgangstyp"]);
  assert.deepEqual(Q.quellenangaben(d).vorgangsbezuegeLautDIP, q.vorgangsbezug);
  assert.deepEqual(Q.lese(D.toRawDocumentRow(d)), q);
});
test("Disjunkte amtliche Vorgaenge trennen auch identische Gesetzestitel", () => {
  const a = make(990103, [ref("770003")]), b = make(990104, [ref("770004")]);
  for (const [x,y] of [[a,b],[b,a]]) {
    assert.deepEqual(R.konflikt(x,y), { gleich: false, grund: "dip-vorgangsbezug-konflikt" });
    assert.equal(V.docsShareEvent(x,y).grund, "dip-vorgangsbezug-konflikt");
    assert.equal(V.docsShareEvent(x,y).gleich, false);
  }
  assert.equal(V.clusterRawDocuments([a,b]).length, 2);
  assert.equal(V.sameVorgang({ documents: [a] }, { vorgangId: "bestand", documents: [b] }).gleich, false);
});
test("Gemeinsame Referenz ist kein positiver Identitaetskurzschluss", () => {
  const a = make(990105, [ref("770005")]), b = make(990106, [ref("770005")]);
  assert.equal(R.konflikt(a,b), null);
  const raw = original(990107, [ref("770005")]); raw.titel = "Foerderung der Erwachsenenbildung";
  const other = S.dipDocToRawItem(DIP.normalizeDrucksache(raw), { primary: true });
  assert.equal(R.konflikt(a,other), null);
  assert.equal(V.docsShareEvent(a,other).gleich, false);
});
test("Amtlich gleicher Bezug erhaelt echte Folgemeldungen und Mehrfachbezug", () => {
  const folge = (id, refs) => {
    const o=original(id,refs);
    o.titel="Entwurf eines Gesetzes zur Änderung des Energiewirtschaftsgesetzes zur Gewährung eines Zuschusses zu den Übertragungsnetzkosten für die Jahre 2027 bis 2029";
    return S.dipDocToRawItem(DIP.normalizeDrucksache(o),{primary:true});
  };
  const a = folge(990119, [ref("770016"),ref("770017")]), b = folge(990120, [ref("770017")]);
  for (const [x,y] of [[a,b],[b,a]]) {
    assert.equal(R.konflikt(x,y),null);
    assert.equal(V.docsShareEvent(x,y).gleich,true);
    assert.equal(V.sameVorgang({documents:[x]},{vorgangId:"bestand",documents:[y]}).gleich,true);
  }
  const clusters=V.clusterRawDocuments([a,b]);assert.equal(clusters.length,1);
  assert.equal(clusters[0].documents.length,2);
});
test("Mehrfachreferenzen: Ueberlappung bleibt offen, disjunkte Mengen trennen", () => {
  const a = make(990108, [ref("770006"),ref("770007")]), b = make(990109, [ref("770007"),ref("770008")]);
  assert.equal(R.konflikt(a,b), null);
  assert.ok(R.konflikt(a,make(990110, [ref("770009")])));
});
test("Gleiche Dokumentkennung, Version1 und leere Referenzliste erzwingen keinen Konflikt", () => {
  assert.equal(R.konflikt(make(990111,[ref("770010")]),make(990111,[ref("770011")])),null);
  assert.equal(Q.lese(make(990112,[])).version,2);
  assert.equal(R.konflikt(make(990112,[]),make(990113,[ref("770010")])),null);
  assert.equal(R.konflikt(make(990114),make(990113,[ref("770010")])),null);
});
test("Unvollstaendige, doppelte, ungueltige und uebergrosse Referenzmengen werden verworfen", () => {
  for (const refs of [[ref("0")], [ref("770012"),ref("770012")], [{id:"770012",titel:"Titel"}],
    [{...ref("770012"),titel:"x".repeat(601)}], Array.from({length:21},(_,i)=>ref(String(770100+i)))]) {
    const o = original(990115,refs), normalized = DIP.normalizeDrucksache(o);
    assert.equal(Q.neu(o,normalized),null);
  }
});
test("Manipulierte Hashes und widerspruechliche Aliaswerte erhalten keinen Amtsbeleg", () => {
  const good = make(990116,[ref("770013")]);
  const bad = structuredClone(good); bad.dipQuellfelder.vorgangsbezug[0].id="770014";
  assert.equal(Q.lese(bad),null); assert.equal(R.konflikt(bad,make(990117,[ref("770015")])),null);
  const alias = structuredClone(good); alias.dip_quellfelder=structuredClone(alias.dipQuellfelder); alias.dip_quellfelder.hash="bad";
  assert.equal(Q.lese(alias),null);
});
test("Ein eigener Hash ersetzt weder geschlossenes Schema noch Identitaetsbindung", () => {
  for (const change of [q=>{q.vorgangsbezug[0].extra="fremd";},q=>{q.vorgangsbezug[0].id=770013;},
    q=>{q.version=3;},q=>{q.bindung.url="https://example.org/fremd";}]) {
    const d=make(990118,[ref("770013")]);change(d.dipQuellfelder);rehash(d.dipQuellfelder);assert.equal(Q.lese(d),null);
  }
});
console.log(`${n}/${n} Gruppen erfolgreich; kein Netz, keine Datenbank, kein Modell.`);
