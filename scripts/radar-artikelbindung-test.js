"use strict";
const A = require("node:assert/strict");
const R = require("../lib/helmut/radarState");
const now = new Date("2026-09-25T10:00:00Z");
const profile = { id: "test-artikelbindung", fullName: "Alex Beispiel" };
const ko = { id: "ko-1", vorgang_id: "vg-1", status: "neu", understanding_status: "complete",
  mentioned_people: [profile.fullName], display_title: "Zusammengefasster Vorgang mit anderem Titel",
  was_ist_passiert: "Eine parlamentarische Debatte findet statt.", confidence_score: 90,
  best_source_url: "https://example.org/ohne-artikelbeleg" };
const doc = (id, title, extra = {}) => ({ id, title, summary: "Bericht über die parlamentarische Debatte.",
  url: `https://example.org/artikel/${id}`, source_name: "Beispielmedium", source_type: "media",
  published_at: "2026-09-25T08:00:00Z", ...extra });
function anzeige(docs, change = {}) {
  return R.buildCurrentRadarState({ profile, knowledgeObjects: [{ ...ko, ...change }],
    kosById: { "ko-1": { ...ko, ...change } }, decisions: [], sourcesByVorgang: { "vg-1": docs }, now }).anzeige;
}
let n = 0;
function test(name, fn) { fn(); n++; console.log("PASS " + name); }
test("Neuester Artikel ohne Nennung verdrängt den tatsächlichen Personenbeleg nicht", () => {
  const actual = doc("nennung", "Alex Beispiel spricht im Ausschuss", { published_at: "2026-09-24T08:00:00Z" });
  const other = doc("anderer", "Ausschuss berät den Haushalt", { link_type: "direct" });
  for (const ds of [[actual, other], [other, actual]]) {
    const m = anzeige(ds).mentions[0]; A.equal(m.documentId, actual.id); A.equal(m.sourceUrl, actual.url);
    A.equal(m.title, actual.title); A.equal(m.sourceName, actual.source_name); A.equal(m.publishedAt, actual.published_at);
  }
});
test("KO-Metadaten, KO-Titel und bloße Profilrelevanz reichen ohne Artikelbeleg nicht", () => {
  A.equal(anzeige([doc("ohne", "Ausschuss berät den Haushalt")], {
    display_title: "Alex Beispiel berät den Haushalt", why_relevant: "Alex Beispiel ist zuständig." }).mentions.length, 0);
  A.equal(anzeige([]).mentions.length, 0);
});
test("Name im Originalauszug reicht, die verlinkte Artikelüberschrift bleibt erhalten", () => {
  const d = doc("auszug", "Beratung im Ausschuss", { summary: "Alex Beispiel erläutert den Antrag im Ausschuss." });
  const m = anzeige([d]).mentions[0]; A.equal(m.title, d.title); A.equal(m.documentId, d.id);
});
test("Teilnamen, Feldübergänge und bestätigter Herausgebersuffix zählen nicht", () => {
  for (const d of [doc("teil", "Beispiel spricht im Ausschuss"),
    doc("felder", "Eine Frage an Alex", { summary: "Beispiel für eine Debatte." }),
    doc("herausgeber", "Beratung im Ausschuss - Alex Beispiel", { source_name: "Alex Beispiel" })]) {
    A.equal(anzeige([d]).mentions.length, 0, d.id);
  }
});
test("Frischer Fremdartikel verjüngt eine alte Nennung nicht", () => {
  const old = doc("alt", "Alex Beispiel spricht", { published_at: "2026-08-01T08:00:00Z" });
  A.equal(anzeige([old, doc("frisch", "Ausschuss berät erneut")]).mentions.length, 0);
});
test("Ohne Datum, mit Zukunft oder ohne Artikeladresse keine sichtbare Nennung", () => {
  for (const extra of [{ published_at: null }, { published_at: "2026-10-01T08:00:00Z" }, { url: "https://example.org/" }])
    A.equal(anzeige([doc("ungültig", "Alex Beispiel spricht", extra)]).mentions.length, 0);
});
test("Artikelvariante mit widersprüchlichem Datum sperrt den Zeitbeleg", () => {
  const d = doc("eins", "Alex Beispiel spricht");
  A.equal(anzeige([d, { ...d, id: "alias", url: d.url + "?utm_source=zweiter", published_at: "2026-09-24T08:00:00Z" }]).mentions.length, 0);
});
test("Quell- und Profilobjekte bleiben unverändert", () => {
  const ds = [doc("unveraendert", "Alex Beispiel spricht")], before = JSON.stringify(ds);
  A.equal(anzeige(ds).mentions.length, 1); A.equal(JSON.stringify(ds), before);
  A.equal(profile.fullName, "Alex Beispiel");
});
test("Unbelegte Kandidaten verbrauchen keine Anzeigeplätze vor der Artikelprüfung", () => {
  const kos = Array.from({ length: 20 }, (_, i) => ({ ...ko, id: `ko-${i}`, vorgang_id: `vg-${i}` }));
  const sources = Object.fromEntries(kos.map((k, i) => [k.vorgang_id,
    [doc(`d-${i}`, i === 19 ? "Alex Beispiel spricht im Ausschuss" : "Allgemeine Debatte im Ausschuss")]]));
  const r = R.buildCurrentRadarState({ profile, knowledgeObjects: kos,
    kosById: Object.fromEntries(kos.map(k => [k.id, k])), decisions: [], sourcesByVorgang: sources, now });
  A.equal(r.anzeige.mentions.length, 1); A.equal(r.anzeige.mentions[0].documentId, "d-19");
});
test("Zwei Vorgänge mit demselben echten Personenartikel zeigen ihn nur einmal", () => {
  const other = { ...ko, id: "ko-2", vorgang_id: "vg-2" };
  const d = doc("gemeinsam", "Alex Beispiel spricht im Ausschuss");
  const r = R.buildCurrentRadarState({ profile, knowledgeObjects: [ko, other],
    kosById: { "ko-1": ko, "ko-2": other }, decisions: [], now,
    sourcesByVorgang: { "vg-1": [d, doc("neu1", "Anderer Bericht")], "vg-2": [d, doc("neu2", "Weitere Debatte")] } });
  A.equal(r.anzeige.mentions.length, 1); A.equal(r.anzeige.mentions[0].documentId, d.id);
});
console.log(`${n}/${n} Fallgruppen bestanden; keine Modellaufrufe oder Writes.`);
