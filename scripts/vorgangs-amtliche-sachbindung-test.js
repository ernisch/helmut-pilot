"use strict";
// Regression for distinct legislative subjects sharing official boilerplate.
// Offline only: no database, network, model or private profile data.
const assert = require("node:assert/strict");
const V = require("../lib/helmut/vorgang-identity");
const { resolveVorgang } = require("../lib/helmut/understanding");
const DIP = require("../lib/helmut/dip");
const S = require("../lib/helmut/scheduler");
const doc = (id, title, day, summary = "") => ({ id, title, summary, published_at: `${day}T00:00:00Z` });
const haushalt = doc("haushalt", "Entwurf eines Gesetzes über die Feststellung des Bundeshaushaltsplans für das Haushaltsjahr 2027 (Haushaltsgesetz 2027 - HG 2027) Finanzplan des Bundes 2026 bis 2030", "2026-09-25");
const energie = doc("energie", "Entwurf eines Gesetzes zur Änderung des Energiewirtschaftsgesetzes zur Gewährung eines Zuschusses zu den Übertragungsnetzkosten für die Jahre 2027 bis 2029", "2026-10-02");
const energieWeiter = doc("energie-folge", "Übertragungsnetzkosten: Zuschuss im Energiewirtschaftsgesetz für 2027 bis 2029", "2026-10-05");
const ressort = "Urheber: Bundesregierung. Ressort: Bundesministerium für Wirtschaft und Energie.";
const verkehr = doc("verkehr", "Entwurf eines Gesetzes zur Modernisierung der Eisenbahninfrastruktur 2027", "2026-10-01", ressort);
const bildung = doc("bildung", "Entwurf eines Gesetzes zur Förderung der Erwachsenenbildung 2027", "2026-10-01", ressort);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
test("Bundeshaushalt und Energienetzgesetz bleiben in beiden Richtungen getrennt", () => {
  assert.equal(V.docsShareEvent(haushalt, energie).gleich, false);
  assert.equal(V.docsShareEvent(energie, haushalt).gleich, false);
});
test("Dokumentformel, Jahr und gleiches Ressort bilden keinen Sachbeleg", () => {
  assert.equal(V.docsShareEvent(verkehr, bildung).gleich, false);
  assert.equal(V.docsShareEvent(bildung, verkehr).gleich, false);
});
test("Ereignisformel und zwei gleiche Jahre ersetzen keinen Titelgegenstand", () => {
  const a = doc("jahre-verkehr", "Debatte zur Eisenbahninfrastruktur 2026 und 2027", "2026-10-01");
  const b = doc("jahre-bildung", "Debatte zur Erwachsenenbildung 2026 und 2027", "2026-10-01");
  assert.equal(V.docsShareEvent(a, b).gleich, false);
  assert.equal(V.docsShareEvent(b, a).gleich, false);
});
test("Validierte DIP-Ressortlabels sind Herkunft und kein gemeinsamer Sachbeleg", () => {
  const make = (id, title) => S.dipDocToRawItem(DIP.normalizeDrucksache({
    id, titel: title, datum: "2026-10-01", drucksachetyp: "Antwort",
    urheber: [{ titel: "Bundesregierung" }],
    ressort: [{ titel: "Bundesministerium für Wirtschaft und Energie", federfuehrend: true }]
  }), { primary: true });
  const a = make(990061, "Zuschuss zu Übertragungsnetzkosten"),
    b = make(990062, "Vertrauensschutz und wirtschaftliche Wirkungen der Gebäudeförderung");
  assert.ok(require("../lib/helmut/dip-quellfelder").lese(a));
  assert.equal(V.docsShareEvent(a, b).overlap.treffer.includes("wirtschaft"), false);
  assert.equal(V.docsShareEvent(a, b).gleich, false);
  assert.equal(V.docsShareEvent(b, a).gleich, false);
  assert.ok(V.docAnchors(a).includes("wirtschaft"));
  const news = { ...a, summary: "Wirtschaft und Energie sind der Gegenstand dieser Nachricht." };
  assert.ok(V.docsShareEvent(news, b).overlap.treffer.includes("wirtschaft"));
  const invalid = structuredClone(a); invalid.dipQuellfelder.hash = "invalid";
  assert.ok(V.docsShareEvent(invalid, b).overlap.treffer.includes("wirtschaft"));
  const followup = make(990063, "Förderung der Übertragungsnetzkosten" );
  assert.equal(V.docsShareEvent(a, followup).gleich, true);
});
test("Echte Folgemeldungen zum spezifischen Gesetz bleiben verbunden", () => {
  assert.equal(V.docsShareEvent(energie, energieWeiter).gleich, true);
  assert.equal(V.docsShareEvent(energieWeiter, energie).gleich, true);
});
test("Spezifische Gesetzesnamen und Genitiv werden weiterhin erkannt", () => {
  const a = doc("polizei-1", "Bundestag billigt Bundespolizeigesetz", "2026-09-25");
  const b = doc("polizei-2", "Bundesrat billigt Änderung des Bundespolizeigesetzes", "2026-09-25");
  assert.equal(V.docsShareEvent(a, b).gleich, true);
  assert.equal(V.docsShareEvent(b, a).gleich, true);
});
test("Originalanker und bestehende Suchwurzeln werden nicht umgeschrieben", () => {
  assert.ok(V.docAnchors(energie).includes("entwurf"));
  assert.ok(V.docAnchors(energie).includes("gesetzes"));
  assert.ok(V.topicRoots({ documents: [energie] }, 20).includes("entwurf"));
});
const permutations = xs => xs.length ? xs.flatMap((x,i) => permutations(xs.filter((_,j) => i !== j)).map(p => [x,...p])) : [[]];
test("Alle 24 Reihenfolgen erhalten drei Sachvorgänge ohne Dokumentverlust", () => {
  for (const rows of permutations([haushalt, energie, energieWeiter, bildung])) {
    const groups = V.clusterRawDocuments(rows).map(c => c.documents.map(d => d.id).sort()).sort((a,b) => a.join().localeCompare(b.join()));
    assert.deepEqual(groups, [["bildung"], ["energie", "energie-folge"], ["haushalt"]]);
  }
});
test("Bestandsvergleich hängt das Energiegesetz nicht an den Haushaltsvorgang", () => {
  assert.equal(V.sameVorgang({ documents: [energie] }, { vorgangId: "haushalt", documents: [haushalt] }).gleich, false);
});
async function main() {
  const existing = { id: "ko-haushalt", vorgang_id: "vg-haushalt", headline: haushalt.title, updated_at: "2026-10-01" };
  const resolution = await resolveVorgang({ documents: [energie] }, {
    findVorgangCandidates: async () => [existing], getExistingStreng: async () => null,
    listVorgangDocuments: async () => [haushalt]
  });
  assert.equal(resolution.resolution, "neu");
  assert.equal(resolution.spuren.length, 1);
  assert.equal(resolution.spuren[0].gleich, false);
  passed++; console.log("PASS Resolver dokumentiert die sachliche Ablehnung des Bestands");
  console.log(`${passed}/${passed} Gruppen erfolgreich; offline, keine Production-Aktion.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
