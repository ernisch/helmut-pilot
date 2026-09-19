"use strict";

// Keine neue Prosa aus einem abgeschnittenen Satz. Nur synthetische lokale
// Texte, echte Adapter und Quellenbindung; kein Modell, Netz oder Speicher.
const A = require("node:assert/strict");
const B = require("../lib/helmut/briefingContract");
const D = require("../lib/helmut/decisions");
const L = require("../lib/helmut/lage");
const R = require("../lib/helmut/radar");
const S = require("../lib/helmut/radarState");
const Q = require("../lib/helmut/lage-quellenbeleg");
const now = new Date("2026-09-19T12:00:00Z");
const kurz = "Eine Entscheidung ist noch offen.";
function lang(n = 9) {
  return "Die Vergabe ist beschlossen, "
    + "so lautet eine im Bericht wiedergegebene Behauptung ".repeat(n)
    + "die der Bericht jedoch ausdruecklich verneint.";
}
function ko(text = kurz) {
  return { id: "ko-lesegrenze", vorgang_id: "vg-lesegrenze", was_ist_passiert: text,
    understanding_status: "complete", status: "neu", risiken: [text], chancen: [text],
    best_source_url: "https://example.org/vergabestand", updated_at: now.toISOString() };
}
function doc(summary = kurz) {
  return { id: "rd-lesegrenze", title: "Bericht ueber eine Vergabe", summary,
    source_name: "Testquelle", url: "https://example.org/vergabestand",
    published_at: "2026-09-18T12:00:00Z" };
}
const input = docs => Q.baueEingabe([ko()], { "vg-lesegrenze": docs }, now);
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.error("FAIL " + name + ": " + e.message); }
}
test("Mandatsummary erfindet keinen behauptenden Praefix; kurzer ganzer Gegenfall bleibt", () => {
  A.equal(B.koSummary(ko(lang())), "");
  A.equal(B.koSummary(ko(kurz)), kurz);
  A.equal(B.koTitle(ko(lang())), lang());
});
test("Entscheidungsrisiko und Chance bleiben ganz oder fehlen; Bewertung bleibt erhalten", () => {
  const bad = D.buildDecision("mandat-neutral", ko(lang()));
  const good = D.buildDecision("mandat-neutral", ko(kurz));
  A.equal(bad.risk, null); A.equal(bad.chance, null);
  A.equal(good.risk, kurz); A.equal(good.chance, kurz);
  A.equal(bad.score, good.score); A.equal(bad.decision, good.decision);
  A.equal(bad.knowledge_object_id, good.knowledge_object_id);
});
test("Lageersatztitel traegt den ganzen vorhandenen Satz; Standlabel erzeugt kein Fragment", () => {
  const bad = L.koToVorgangCard(ko(lang()), [doc()], now);
  A.equal(bad.title, lang()); A.equal(bad.standLabel, "");
  A.equal(bad.summary.wasIstPassiert, lang()); A.equal(bad.sources.length, 1);
  const good = L.koToVorgangCard(ko(kurz), [doc()], now);
  A.equal(good.title, kurz); A.equal(good.standLabel, kurz);
});
test("Radar Signal kuerzt weder Inhalt noch Auszug zu einer anderen Aussage", () => {
  const bad = R.koToRadarSignal(ko(lang()), "person", "mention");
  for (const f of ["summary", "content", "excerpt"]) A.equal(bad[f], "", f);
  A.equal(bad.title, lang()); A.equal(bad.url, doc().url);
  const good = R.koToRadarSignal(ko(kurz), "person", "mention");
  for (const f of ["summary", "content", "excerpt"]) A.equal(good[f], kurz, f);
});
test("Radar Artikel behaelt Titel und Quelle bei ungueltiger Kurzfassung", () => {
  function artikel(text) {
    const k = ko(text), d = D.buildDecision("mandat-neutral", k);
    return S.buildArticles([d], { [k.id]: k }, { [k.vorgang_id]: [doc(text)] }, [],
      S.profileTerms({}), now)[0];
  }
  const bad = artikel(lang()); A(bad); A.equal(bad.title, lang());
  A.equal(bad.shortSummary, ""); A.equal(bad.sourceUrl, doc().url);
  A.equal(artikel(kurz).shortSummary, kurz);
});
test("Ueberlanger Quellenauszug wird nicht zu einer gekuerzten Beweisgrundlage", () => {
  const bad = { ...doc(lang(35)), url: "https://example.org/ungueltiger-auszug" };
  const r = input([bad, doc()]); A.equal(r.length, 1);
  A.equal(r[0].quellenbelege.length, 1);
  A.equal(r[0].quellenbelege[0].url, doc().url);
  A.equal(r[0].quellenbelege[0].auszug, kurz);
  A.deepEqual(input([bad]), []);
});
test("Titel und Herausgeber werden nicht in andere Bezeichnungen gekuerzt", () => {
  for (const [f, n] of [["title", 601], ["source_name", 161]]) {
    const bad = { ...doc(), [f]: "X".repeat(n), url: "https://example.org/ueberlang" };
    const r = input([bad, doc()]); A.equal(r[0].quellenbelege.length, 1, f);
    A.equal(r[0].quellenbelege[0].url, doc().url, f);
  }
});
test("Titelquellen ohne Auszug und ganze Quellen genau an den Grenzen bleiben", () => {
  const titleOnly = input([doc("")]); A.equal(titleOnly.length, 1);
  A.equal(titleOnly[0].quellenbelege[0].auszug, "");
  const d = { ...doc(), title: "T".repeat(600), summary: "S".repeat(1400), source_name: "Q".repeat(160) };
  const r = input([d])[0].quellenbelege[0];
  A.equal(r.titel, d.title); A.equal(r.auszug, d.summary); A.equal(r.quelle, d.source_name);
  A.equal(Q.hashEingabe(input([d])), Q.hashEingabe(input([structuredClone(d)])));
});
console.log(`${passed} PASS, ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
