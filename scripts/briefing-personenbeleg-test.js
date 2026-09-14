"use strict";
const A = require("node:assert/strict");
const { toBriefingContractV3 } = require("../lib/helmut/briefingContract");
const now = new Date("2026-09-14T07:00:00Z");
const ko = (id, names, extra = {}) => ({ id, vorgang_id: `vg-${id}`,
  status: "ready", understanding_status: "complete", display_title: "Ausschuss beraet Bericht",
  was_ist_passiert: "Der Bericht wird beraten.", updated_at: now.toISOString(),
  mentioned_people: names, ...extra });
const doc = (title, summary = "", url = "https://www.bundestag.de/dokumente/bericht-123456") =>
  ({ title, summary, url, published_at: now.toISOString() });
function build(kos, sourcesByVorgang = {}) {
  return toBriefingContractV3({ profile: { id: "personen-test", fullName: "Testperson" }, now,
    decisions: kos.map(k => ({ knowledge_object_id: k.id, vorgang_id: k.vorgang_id,
      score: 40, decision: "Beobachten", matched_features: [] })),
    kosById: Object.fromEntries(kos.map(k => [k.id, k])), sourcesByVorgang });
}
let n = 0;
function test(name, fn) { fn(); console.log("PASS " + name); n++; }
test("Erfundener Vorname und Personen ohne Quellentext werden nicht ausgegeben", () => {
  const b = build([ko("a", ["Falscher Beispiel", "Unbelegte Person"])],
    { "vg-a": [doc("Beispiel kritisiert Reform", "Richtiger Beispiel fordert eine Pruefung.")] });
  A.deepEqual(b.personMentions, []); A.equal(b.items.length, 1);
});
test("Belegte Namen bleiben ohne vererbte Rollen erhalten", () => {
  const b = build([ko("a", ["Alex Beispiel (Fraktionsvorsitz)", "Beispiel (MdB)"])],
    { "vg-a": [doc("Alex Beispiel stellt Fragen")] });
  A.deepEqual(b.personMentions.map(x => x.name), ["Alex Beispiel", "Beispiel"]);
});
test("Name muss im zugeordneten Dokument mit Artikeladresse stehen", () => {
  for (const sources of [{}, { "vg-b": [doc("Alex Beispiel spricht")] },
    { "vg-a": [doc("Alex Beispiel spricht", "", "https://www.bundestag.de")] },
    { "vg-a": [doc("Bericht", "", "javascript:alert(1)"), { source_name: "Alex Beispiel" }] }])
    A.deepEqual(build([ko("a", ["Alex Beispiel"], { display_summary: "Alex Beispiel", best_source_url: "https://www.bundestag.de/dokumente/bericht-123456" })], sources).personMentions, []);
});
test("Getrennte Felder und Dokumente erzeugen keinen gemeinsamen Namen", () => {
  for (const docs of [[doc("Alex", "Beispiel")], [doc("Alex"), doc("Beispiel")]])
    A.deepEqual(build([ko("a", ["Alex Beispiel"])], { "vg-a": docs }).personMentions, []);
});
test("Unicode und Wortgrenzen verhindern Teiltreffer", () => {
  const b = build([ko("a", ["Ann", "Alex Müller", "Özlem Beispiel"])],
    { "vg-a": [doc("Joann spricht. ALEX MU\u0308LLER antwortet.", "Özlem\nBeispiel fragt nach.")] });
  A.deepEqual(b.personMentions.map(x => x.name), ["Alex Müller", "Özlem Beispiel"]);
});
test("Zaehlung erfolgt einmal je Vorgang statt je Analysefeld", () => {
  const a = ko("a", ["Alex Beispiel", "Alex Beispiel (MdB)"], { mentioned_mps: ["Alex Beispiel"] });
  const b = ko("b", ["Alex Beispiel"]);
  A.deepEqual(build([a, b], { "vg-a": [doc("Alex Beispiel spricht")], "vg-b": [doc("Alex Beispiel antwortet")] }).personMentions,
    [{ name: "Alex Beispiel", mentions: 2 }]);
  A.deepEqual(build([a, { ...a, id: "zweite-analyse" }], { "vg-a": [doc("Alex Beispiel spricht")] }).personMentions,
    [{ name: "Alex Beispiel", mentions: 1 }]);
});
test("Keine Mutation und keine Umdeutung fehlender oder nichttextlicher Namen", () => {
  const kos = [ko("a", [null, 42, {}, "", "Alex Beispiel (MdB)"])];
  const sources = { "vg-a": [doc("Alex Beispiel spricht")] };
  const before = structuredClone({ kos, sources });
  A.deepEqual(build(kos, sources).personMentions, [{ name: "Alex Beispiel", mentions: 1 }]);
  A.deepEqual({ kos, sources }, before);
});
console.log(`${n}/${n} Gruppen erfolgreich`);
