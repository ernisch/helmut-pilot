"use strict";
const A = require("node:assert/strict");
const R = require("../lib/helmut/radarState");
const render = require("./lib/briefing-ansichten");
const profile = { id: "test-ursprung", fullName: "Alex Beispiel", party: "SPD", faction: "SPD-Bundestagsfraktion" };
const now = new Date("2026-09-25T10:00:00Z");
const ko = { id: "k", vorgang_id: "v", status: "neu", understanding_status: "complete",
  display_title: "Ein Antrag wird beraten", parteien: ["SPD"] };
const terms = R.radarProfileTerms(profile);
const source = (host, extra = {}) => ({ id: "d-" + host, url: `https://${host}/presse/ein-antrag`,
  title: "Ein Antrag wird beraten", source_name: "Unzuverlaessige Metadaten", source_type: "media",
  published_at: "2026-09-24T08:00:00Z", ...extra });
function state(docs) {
  return R.buildCurrentRadarState({ profile, now, knowledgeObjects: [ko], kosById: { k: ko },
    decisions: [{ knowledge_object_id: "k", matched_features: [{ type: "partei", value: "SPD" }] }],
    sourcesByVorgang: { v: docs } });
}
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS " + name); }
test("Fremde Parteiquelle belegt keinen eigenen Parteiakteur", () => {
  A.equal(R.radarRelationBeleg("party", "SPD", ko, terms, [source("cdu.de", { source_type: "party" })]), false);
  A.equal(state([source("cdu.de", { source_type: "party" })]).environment.party.length, 0);
});
test("Falsche Quellentypen und -namen ersetzen keine Herausgeberidentitaet", () => {
  for (const host of ["example.org", "spiegel.de", "spd.de.example.org"])
    A.equal(R.radarParteiQuellenursprung(source(host, { source_name: "SPD", source_type: "party" }), terms.parties), null);
  A.equal(R.radarParteiQuellenursprung({ ...source("spd.de"), url: "https://spd.de/" }, terms.parties), null);
});
test("Registrierte Partei und Fraktion haben getrennte Belegtypen", () => {
  A.equal(R.radarParteiQuellenursprung(source("spd.de"), terms.parties).relationType, "party");
  A.equal(R.radarParteiQuellenursprung(source("spdfraktion.de"), terms.parties).relationType, "faction");
});
test("Der verlinkte Ursprung bleibt trotz neuerem Fremdbericht erhalten", () => {
  for (const [host, type, label] of [["spd.de", "party", "Partei: SPD"],
    ["spdfraktion.de", "faction", "Fraktion: SPD-Bundestagsfraktion"]]) {
    const d = source(host), newer = source("example.org", { published_at: "2026-09-25T08:00:00Z" });
    for (const docs of [[d, newer], [newer, d]]) {
      const item = state(docs).anzeige.environment.party[0];
      A.equal(item.sourceUrl, d.url); A.equal(item.relationType, type); A.equal(item.relationLabel, label);
      A.equal(item.ursprungsBeleg.documentId, d.id); A.equal(item.ursprungsBeleg.url, d.url);
      A.equal(item.sourceCategoryType, type);
    }
  }
});
test("Fraktionssignal wird durch Artikelentdopplung nicht zur Partei umetikettiert", () => {
  const d = source("spdfraktion.de"), old = source("example.org", { published_at: "2026-09-23T08:00:00Z" });
  const item = state([d, old]).anzeige.environment.party[0];
  A.ok(item.relationTypes.includes("faction")); A.ok(!item.relationTypes.includes("party"));
});
test("Die wirkliche Anzeige nennt den Fraktionsursprung im gemeinsamen Umfeldreiter", () => {
  const s = state([source("spdfraktion.de"), source("example.org", { published_at: "2026-09-25T08:00:00Z" })]);
  const html = render({ currentHelmutState: { status: "empty" }, currentRadarState: s }, now.toISOString()).html.radar;
  A.ok(html.includes("Partei / Fraktion")); A.ok(html.includes("Fraktion: SPD-Bundestagsfraktion"));
  A.ok(!html.includes("Betrifft deine Partei"));
});
test("Originalquellen bleiben unveraendert", () => {
  const docs = [source("spdfraktion.de")], before = JSON.stringify(docs);
  state(docs); A.equal(JSON.stringify(docs), before);
});
console.log(`${n}/${n} Fallgruppen bestanden; offline, keine Profil- oder Datenwrites.`);
