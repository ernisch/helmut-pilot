"use strict";

// Prueft den Promptvertrag und den Erhalt fester quellentreuer Antworten.
// Keine echte Modellbefolgung, keine semantische Antwortsperre, kein Netz.
const assert = require("node:assert/strict");
const U = require("../lib/helmut/understanding");
const AI = require("../lib/helmut/ai");
const L = require("../lib/helmut/lage-quellenbeleg");
const R = require("../lib/helmut/lage-textqualitaet");
const A = require("../lib/helmut/artikelkontext");
const S = require("../lib/helmut/understanding-schema");
const cases = [
  { name: "ausgangslage", title: "Kommunalwahl: Die Ausgangslage", source: "",
    text: "Der Bericht beschreibt die Ausgangslage zur Kommunalwahl. Ein Wahlergebnis geht aus der gelieferten Ueberschrift nicht hervor." },
  { name: "wahltermin", title: "Vorbericht zur Kommunalwahl",
    source: "Die Kommunalwahl findet am 7. April 2030 statt. Der Bericht beschreibt die Ausgangslage vor der Abstimmung.",
    text: "Die Kommunalwahl findet laut Vorbericht am 7. April 2030 statt. Der Bericht beschreibt die Ausgangslage vor der Abstimmung." },
  { name: "umfrage", title: "Umfrage zur Kommunalwahl",
    source: "Eine Umfrage vor der Kommunalwahl sieht eine Liste bei 28 Prozent. Die Abstimmung steht noch bevor.",
    text: "Eine Umfrage vor der Kommunalwahl sieht eine Liste bei 28 Prozent. Die Abstimmung steht noch bevor." },
  { name: "prognose", title: "Prognose zum Wahlausgang",
    source: "Eine Prognose zur Kommunalwahl erwartet einen knappen Ausgang. Eine Auszaehlung liegt noch nicht vor.",
    text: "Eine Prognose zur Kommunalwahl erwartet einen knappen Ausgang. Eine Auszaehlung liegt noch nicht vor." },
  { name: "hochrechnung", title: "Hochrechnung bei laufender Auszaehlung",
    source: "Die Hochrechnung zur Kommunalwahl sieht eine Liste bei 30 Prozent. Die Auszaehlung laeuft weiter.",
    text: "Die Hochrechnung zur Kommunalwahl sieht eine Liste bei 30 Prozent. Die Auszaehlung laeuft weiter." },
  { name: "vorlaeufig", title: "Wahlleitung meldet vorlaeufiges Ergebnis",
    source: "Die Wahlleitung meldet fuer die Kommunalwahl vorlaeufig 18 Sitze fuer eine Liste. Das endgueltige Ergebnis steht aus.",
    text: "Die Wahlleitung meldet fuer eine Liste vorlaeufig 18 Sitze. Das endgueltige Ergebnis der Kommunalwahl steht aus." },
  { name: "endgueltig", title: "Amtliches Endergebnis der Kommunalwahl",
    source: "Die Wahlleitung hat das amtliche Endergebnis der Kommunalwahl festgestellt: Eine Liste erhaelt 18 von 40 Sitzen.",
    text: "Die Wahlleitung hat das amtliche Endergebnis der Kommunalwahl festgestellt. Eine Liste erhaelt 18 von 40 Sitzen." },
  { name: "rueckblick", title: "Wahlvorbericht mit Rueckblick",
    source: "Die Kommunalwahl 2030 steht bevor. Zum Vergleich: Bei der Wahl 2026 erhielt eine Liste 18 Sitze.",
    text: "Die Kommunalwahl 2030 steht bevor. Der Bericht nennt zum Vergleich 18 Sitze einer Liste bei der Wahl 2026." },
  { name: "ergebnis-nur-titel", title: "Wahlleitung bestaetigt Endergebnis: Liste erhaelt 18 Sitze", source: "",
    text: "Laut Ueberschrift bestaetigt die Wahlleitung das Endergebnis mit 18 Sitzen fuer eine Liste." }
];
function doc(c) {
  return { id: "rd-" + c.name, title: c.title, summary: c.source, source_name: "Testmedium",
    url: "https://example.org/wahl/" + c.name, published_at: "2030-04-01T08:00:00Z" };
}
function answer(c) {
  return { headline: c.title, display_title: "Kommunalwahl im Bericht", display_summary: c.text,
    was_ist_passiert: c.text, warum_wichtig: "Der Bericht betrifft die Kommunalwahl.",
    wer_ist_betroffen: "Weitere Betroffene sind aus der Quelle nicht ableitbar.",
    handlungsempfehlung: "Keine Handlung aus den gelieferten Quellen ableitbar.",
    zeitdruck: "keiner", parteien: [], ministerien: [], ausschuesse: [], risiken: [], chancen: [],
    confidence_score: 60, decision_level: "kommune" };
}
function contract(prompt) {
  assert.match(prompt, /ERGEBNISSTAND fuer alle Aussagen/);
  assert.match(prompt, /Vorbericht, Umfrage, Prognose, Hochrechnung, vorlaeufiges und endgueltiges Ergebnis/);
  assert.match(prompt, /Ausgangslage.*belegt fuer sich weder.*Wahlergebnisse/);
  assert.match(prompt, /verstrichener.*Termin.*belegt.*keinen Vollzug/);
  assert.match(prompt, /Unsicherheit auch in Folgen, Risiken, Chancen und Empfehlungen erhalten/);
  assert.match(prompt, /tatsaechlich belegte Ergebnisse konkret erhalten/i);
  assert.match(prompt, /Rueckblicke.*Vergleiche.*nicht auf.*andere Wahl/);
}
const rows = prompt => prompt.split("\n").filter(l => l.startsWith('{"quelle_id":')).map(l => JSON.parse(l));
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function main() {
  await test("Ergebnisstand erreicht Understanding, Lage und bestehenden Quellenreview", () => {
    for (const c of cases) {
      const d = doc(c), input = { documents: [d] }, before = structuredClone(input);
      const p = U.buildUnderstandingPrompt(input); contract(p);
      assert.equal(rows(p)[0].titel, d.title); assert.equal(rows(p)[0].auszug, d.summary);
      const lage = L.baueEingabe([{ vorgang_id: "vg-wahl" }], { "vg-wahl": [d] }, new Date("2030-04-01T09:00:00Z"));
      assert.equal(lage.length, 1);
      const lp = AI.buildLageBriefingPrompt(lage, {}, { briefingDatum: "2030-04-01" });
      const rp = R.prompt([], lage, {}); contract(lp); contract(rp);
      assert.deepEqual(JSON.parse(rp.split("\n").find(l => l.startsWith("QUELLEN: ")).slice(9)), lage);
      const gebunden = JSON.parse(lp.split("\n").find(l => l.startsWith("[vg-wahl] ")).slice(10));
      assert.deepEqual(gebunden.quellenbelege, lage[0].quellenbelege);
      assert.deepEqual(input, before);
    }
  });
  await test("Feldauftrag erzwingt keine bereits eingetretene Entwicklung", () => {
    const p = U.buildUnderstandingPrompt({ documents: [doc(cases[0])] });
    assert.doesNotMatch(p, /WELCHER politische Vorgang ist hier passiert/);
    assert.doesNotMatch(p, /politische Entwicklung eingetreten ist/);
    assert.doesNotMatch(p, /display_summary:.*AUSSCHLIESSLICH was passiert ist/);
    assert.match(p, /WELCHER politische Sachstand ist hier belegt/);
    assert.match(p, /Keine Veraenderung voraussetzen/);
  });
  await test("Fehlender Auszug erhaelt weder Ergebnis noch Termin aus Metadaten", () => {
    const d = { ...doc(cases[0]), url: "https://example.org/ergebnis/20-sitze/2030-04-05",
      source_name: "Amtliches Wahlergebnis", full_text: "Die Liste gewinnt 20 Sitze." };
    const p = U.buildUnderstandingPrompt({ documents: [d] }), q = rows(p)[0]; contract(p);
    assert.equal(q.titel, d.title); assert.equal(q.auszug, ""); assert.equal(q.artikelkontext, undefined);
    assert.equal(q.zeitbezug.ereignisdatum, null); assert(!p.includes(d.full_text));
  });
  await test("Expliziter Artikelkontext bleibt gebunden und traegt denselben Ergebnisvertrag", () => {
    const d = doc(cases[0]), text = cases.find(c => c.name === "vorlaeufig").source;
    const beleg = { version: 1, dokumentId: d.id, quellenHash: A.quellenstandHash(d), artikelUrl: d.url,
      artikelTitel: d.title, herkunft: "manueller-originalvergleich", gelesenAm: "2030-04-01T09:00:00Z",
      absatzPosition: 1, text };
    const p = U.buildUnderstandingPrompt({ documents: [d] }, { artikelkontextVersuch: beleg }); contract(p);
    assert.equal(rows(p)[0].auszug, ""); assert.equal(rows(p)[0].artikelkontext.text, text);
    assert.match(p, /Nur durch Titel, Auszug und den expliziten Artikelkontext gedeckte Aussagen/);
  });
  for (const update of [false, true]) await test((update ? "Update" : "Erstverstehen") +
    " erhaelt neun neutrale feste Antworten einschliesslich echter Ergebnisse", async () => {
    for (const c of cases) {
      const d = doc(c), cluster = { documents: [d] }, a = answer(c), before = structuredClone(a);
      const existing = { id: "ko-vg-wahl", ko_version: 2, decision_level: "kommune",
        classification_confidence: { level_quelle: "ki" }, headline: "Erhaltener Inhalt" };
      const original = structuredClone(existing), writes = []; let calls = 0;
      const deps = { canSpend: async () => ({ allowed: true }),
        requestUnderstanding: async prompt => { calls++; contract(prompt); return a; },
        save: async ko => { writes.push(ko); return { saved: true }; }, saveSources: async () => {},
        markFailed: async () => { throw Error("Unerwartete Fehlerablage"); }, logSkip: () => {},
        findVorgangCandidates: async () => [], listVorgangDocuments: async () => [] };
      const r = update ? await U.understandUpdate(cluster, deps, { vorgangId: "vg-wahl", existing,
        neueDocs: [d], alleDocs: [d], neueAnker: [], spur: {}, vertrag: null })
        : await U.understandOneCluster(cluster, deps, { vorgangId: "vg-wahl", existing: null, vertrag: null });
      assert.equal(r.status, update ? "updated" : "saved"); assert.equal(calls, 1); assert.equal(writes.length, 1);
      assert.equal(writes[0].display_summary, c.text); assert.equal(writes[0].was_ist_passiert, c.text);
      assert.equal(writes[0].decision_level, "kommune"); assert.equal(S.validateKnowledgeObject(writes[0]).valid, true);
      assert.deepEqual(existing, original); assert.deepEqual(a, before);
    }
  });
  await test("Auswerter erhaelt denselben Auftrag und neutrale positive Antworten", async () => {
    for (const c of cases) {
      let calls = 0;
      const r = await U.evaluateUnderstandingCase({ name: c.name, raw_documents: [doc(c)] }, async p => {
        calls++; contract(p); return answer(c);
      });
      assert.equal(calls, 1); assert.equal(r.valid, true); assert.equal(r.ko.display_summary, c.text);
    }
  });
  console.log(`${passed}/${passed} Gruppen erfolgreich`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
