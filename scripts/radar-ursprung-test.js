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

// --- Segmentbezogener Ursprung fuer Wahlkreis und Ausschuss -------------------
// Derselbe Grundsatz wie fuer Partei/Fraktion: der sichtbare Link/die sichtbare Quelle
// eines Umfeld-Segments muss ein Dokument sein, das den Bezug SELBST stuetzt — kein
// neuerer, relationsfremder Artikel desselben Vorgangs. Fehlt ein passender Dokumentbeleg,
// faellt das Segment IMMER fail-closed weg — auch bei leerer Dokumentliste (kein KO-Fallback).
function build(profile, ko, features, docs) {
  return R.buildCurrentRadarState({ profile, now, knowledgeObjects: [ko], kosById: { [ko.id]: ko },
    decisions: [{ knowledge_object_id: ko.id, matched_features: features }],
    sourcesByVorgang: docs && docs.length ? { [ko.vorgang_id]: docs } : {} });
}
const fremd = source("example.org", { id: "d-fremd", title: "Ein Antrag wird beraten",
  published_at: "2026-09-25T08:00:00Z" }); // neuerer, relationsfremder Bericht desselben KO

// Wahlkreis: konkretes Ort im KO + Dokument, das den Ort selbst nennt.
const wkProfile = { id: "p-wk", fullName: "Alex Beispiel", party: "SPD", constituency: "Salzgitter-Wolfenbüttel" };
const wkKo = { id: "wk", vorgang_id: "vw", status: "neu", understanding_status: "complete",
  display_title: "Investitionen im Wahlkreis", mentioned_locations: ["Salzgitter-Wolfenbüttel"],
  best_source_url: "https://example.org/ko-wahlkreis" };
const wkFeature = [{ type: "wahlkreis", value: "Salzgitter-Wolfenbüttel" }];
const ortDoc = source("sz-online.de", { id: "d-ort", title: "Investitionen in Salzgitter-Wolfenbüttel",
  published_at: "2026-09-24T08:00:00Z" });
test("Wahlkreis-Ursprung bleibt trotz neuerem Fremdbericht am konkreten Ort", () => {
  for (const docs of [[ortDoc, fremd], [fremd, ortDoc]]) {
    const s = build(wkProfile, wkKo, wkFeature, docs);
    const item = s.environment.constituency[0];
    A.equal(item.sourceUrl, ortDoc.url); A.equal(item.documentId, "d-ort");
    A.equal(item.ursprungsBeleg.documentId, "d-ort"); A.equal(item.ursprungsBeleg.url, ortDoc.url);
    A.equal(item.relationType, "constituency"); A.equal(item.relevanceEvidence, "Salzgitter-Wolfenbüttel");
    A.equal(s.anzeige.environment.constituency[0].sourceUrl, ortDoc.url);
  }
});
test("Ohne passenden Wahlkreis-Beleg im Dokument faellt das Segment fail-closed weg", () => {
  A.equal(build(wkProfile, wkKo, wkFeature, [fremd]).environment.constituency.length, 0);
});
test("Auch bei leerer Dokumentliste faellt der Wahlkreis fail-closed weg", () => {
  const s = build(wkProfile, wkKo, wkFeature, []);
  A.equal(s.environment.constituency.length, 0);
});

// Ausschuss (Bund): voller Ausschussname im KO-Inhalt + Dokument, das ihn selbst nennt.
const ckProfile = { id: "p-ck", fullName: "Alex Beispiel", party: "SPD", committee: "Arbeit und Soziales", politicalLevel: "Bund" };
const ckKo = { id: "ck", vorgang_id: "vc", status: "neu", understanding_status: "complete",
  display_title: "Anhörung im Ausschuss für Arbeit und Soziales",
  ausschuesse: ["Ausschuss für Arbeit und Soziales"], best_source_url: "https://example.org/ko-ausschuss" };
const ckFeature = [{ type: "ausschuss", value: "Ausschuss für Arbeit und Soziales" }];
const ausschussDoc = source("dip.bundestag.de", { id: "d-ausschuss",
  title: "Ausschuss für Arbeit und Soziales: Anhörung zum Bürgergeld", published_at: "2026-09-24T08:00:00Z" });
test("Ausschuss-Ursprung bleibt am Ausschussdokument, nicht am neueren Fremdbericht", () => {
  for (const docs of [[ausschussDoc, fremd], [fremd, ausschussDoc]]) {
    const s = build(ckProfile, ckKo, ckFeature, docs);
    const item = s.environment.committees[0];
    A.equal(item.sourceUrl, ausschussDoc.url); A.equal(item.documentId, "d-ausschuss");
    A.equal(item.ursprungsBeleg.documentId, "d-ausschuss"); A.equal(item.ursprungsBeleg.url, ausschussDoc.url);
    A.equal(item.relationType, "committee");
    A.equal(s.anzeige.environment.committees[0].sourceUrl, ausschussDoc.url);
  }
});
test("Ohne passenden Ausschuss-Beleg im Dokument faellt das Segment fail-closed weg", () => {
  A.equal(build(ckProfile, ckKo, ckFeature, [fremd]).environment.committees.length, 0);
});
test("Auch bei leerer Dokumentliste faellt der Ausschuss fail-closed weg", () => {
  const s = build(ckProfile, ckKo, ckFeature, []);
  A.equal(s.environment.committees.length, 0);
});

// Landtag (Berlin/Brandenburg): Landtags-Marker + Fachbezug im KO UND im Dokument.
const landProfile = { id: "p-land", fullName: "Alex Beispiel", party: "SPD",
  committee: "Arbeit und Soziales", politische_ebene: "landtag", bundesland: "Brandenburg" };
const landKo = { id: "lk", vorgang_id: "vl", status: "neu", understanding_status: "complete",
  display_title: "Ausschuss für Arbeit und Soziales des Landtags berät Antrag",
  ausschuesse: ["Ausschuss für Arbeit und Soziales"], best_source_url: "https://example.org/ko-land" };
const landDoc = source("landtag.brandenburg.de", { id: "d-land",
  title: "Ausschuss für Arbeit und Soziales des Landtags: Sitzung", published_at: "2026-09-24T08:00:00Z" });
test("Landtagsprofil (Brandenburg) bindet den Ausschuss an das Landtagsdokument", () => {
  const s = build(landProfile, landKo, ckFeature, [landDoc, fremd]);
  A.equal(s.environment.committees.length, 1);
  A.equal(s.environment.committees[0].sourceUrl, landDoc.url);
  A.equal(s.environment.committees[0].documentId, "d-land");
  A.equal(s.environment.committees[0].ursprungsBeleg.documentId, "d-land");
});
const berlinKo = { ...landKo, id: "bk", vorgang_id: "vb",
  display_title: "Ausschuss für Arbeit und Soziales des Abgeordnetenhauses berät Antrag" };
const berlinDoc = source("abgeordnetenhaus.berlin.de", { id: "d-berlin",
  title: "Ausschuss für Arbeit und Soziales des Abgeordnetenhauses: Sitzung", published_at: "2026-09-24T08:00:00Z" });
test("Berliner Landtagsprofil (Abgeordnetenhaus) bindet den Ausschuss ebenfalls", () => {
  const s = build({ ...landProfile, id: "p-berlin", bundesland: "Berlin" }, berlinKo, ckFeature, [berlinDoc, fremd]);
  A.equal(s.environment.committees.length, 1);
  A.equal(s.environment.committees[0].sourceUrl, berlinDoc.url);
  A.equal(s.environment.committees[0].documentId, "d-berlin");
});
console.log(`${n}/${n} Fallgruppen bestanden; offline, keine Profil- oder Datenwrites.`);
