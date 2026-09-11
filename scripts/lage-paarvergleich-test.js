"use strict";

// Echter Fehlbeleg, keine Modellaufrufe. Diese Tests pruefen den Vertrag fuer
// den gesonderten Absatzvergleich; sie beweisen keine semantische Modellguete.
const assert = require("node:assert/strict");
const Q = require("../lib/helmut/lage-textqualitaet");
const f = require("./fixtures/lage-wiederholung-beleg.json");
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.log("FAIL " + name + ": " + e.message); } }
const pair = (a, b, neu = true) => ({ erster_absatz: a, zweiter_absatz: b,
  eigenstaendige_sachverhalte: neu, pruefbegruendung: neu
    ? "Der zweite Absatz enthaelt eine andere belegte Entscheidung."
    : "Beide Absaetze wiederholen dieselbe skeptische Position trotz unterschiedlicher Herausgeber." });

test("Echter Altbeleg ohne Absatzvergleich ist keine neue vollstaendige Pruefung", () => {
  const out = Q.pruefe(f.paragraphs, f.quellen, f.review);
  assert.equal(out.ok, false); assert.equal(out.grund, "ai-text-quality-incomplete");
});
test("Negative Paarpruefung ueberstimmt zwei positive Einzelpruefungen", () => {
  const out = Q.pruefe(f.paragraphs, f.quellen, { ...f.review, vergleiche: [pair(0, 1, false)] });
  assert.equal(out.ok, false); assert.equal(out.grund, "ai-text-repetition");
  assert.deepEqual(out.diagnose, { absatz: 1, fehler: ["text-wiederholt"] });
  assert(!JSON.stringify(out).includes("Herausgeber"), "Keine private Modellbegruendung im Ergebnis");
});
test("Fehlende, doppelte, fremde und vertauschte Paare bleiben unvollstaendig", () => {
  for (const vergleiche of [undefined, [], [pair(0, 1), pair(0, 1)], [pair(0, 2)], [pair(1, 0)], [pair(0, 0)]]) {
    const out = Q.pruefe(f.paragraphs, f.quellen, { ...f.review, vergleiche });
    assert.equal(out.ok, false); assert.equal(out.grund, "ai-text-quality-incomplete");
  }
});
test("Unbegruendete oder nicht boolesche Paarurteile werden nicht akzeptiert", () => {
  for (const change of [{ pruefbegruendung: "" }, { pruefbegruendung: "x".repeat(801) },
    { eigenstaendige_sachverhalte: "true" }, { eigenstaendige_sachverhalte: null }]) {
    const out = Q.pruefe(f.paragraphs, f.quellen, { ...f.review, vergleiche: [{ ...pair(0, 1), ...change }] });
    assert.equal(out.ok, false); assert.equal(out.grund, "ai-text-quality-incomplete");
  }
});
test("Neue belegte Entscheidungen und Zahlen bleiben mit vollstaendiger Paarpruefung zulaessig", () => {
  const paragraphs = [
    { text: "Das Kabinett legt einen Entwurf fuer 20 neue Plaetze vor.", vorgang_ids: ["vg-test"] },
    { text: "Das Parlament lehnt den Entwurf ab und fordert 40 Plaetze.", vorgang_ids: ["vg-test"] },
    { text: "Die Kommune eroeffnet am 12. September eine Beratungsstelle.", vorgang_ids: ["vg-test"] }
  ];
  const quellen = [{ vorgang_id: "vg-test", quellenbelege: paragraphs.map((p, i) => ({ quelle_id: "q-" + i, url: "https://example.org/beleg-" + i, titel: p.text })) }];
  const review = { pruefungen: paragraphs.map((p, i) => ({ ...f.review.pruefungen[0], absatz: i, quelle_id: "q-" + i, belegfeld: "titel" })),
    vergleiche: [pair(0, 1), pair(0, 2), pair(1, 2)] };
  const out = Q.pruefe(paragraphs, quellen, review);
  assert.equal(out.ok, true); assert.equal(out.paragraphs.length, 3);
  assert.equal(out.qualitaet.paarvergleichVersion, 1); assert.equal(out.qualitaet.geprueftePaare, 3);
  assert.equal(out.qualitaet.vollstaendigeFaktenpruefung, false);
  review.vergleiche.pop(); assert.equal(Q.pruefe(paragraphs, quellen, review).ok, false);
});
test("Paarvergleich ersetzt Quellen- und Profilpruefung nicht", () => {
  for (const key of ["vollstaendig_belegt", "themenrein", "profilbezug"]) {
    const review = structuredClone(f.review); review.vergleiche = [pair(0, 1)]; review.pruefungen[1][key] = false;
    assert.equal(Q.pruefe(f.paragraphs, f.quellen, review).grund, "ai-text-source-support");
  }
});
console.log(`${passed}/${passed + failed} Testgruppen bestanden.`);
if (failed) process.exitCode = 1;
