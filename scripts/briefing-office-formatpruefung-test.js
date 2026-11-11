"use strict";
const assert = require("node:assert/strict");
const { check, RULES, xUnits } = require("../lib/helmut/office-formatpruefung");
const { communicationChannels } = require("../lib/helmut/ai");
const { texts } = require("./fixtures/office-format-beispiele");
let passed = 0;
function test(name, body) { body(); passed++; console.log("PASS", name); }
for (const channel of Object.keys(communicationChannels)) {
  test(channel + ": eigenes Positivbeispiel erfüllt Struktur", () => assert.equal(check(texts[channel], channel).valid, true, JSON.stringify(check(texts[channel], channel))));
  test(channel + ": leere Antwort wird abgewiesen", () => assert.equal(check("", channel).valid, false));
  test(channel + ": Begrenzungen entsprechen dem Prompt", () => {
    const rule = RULES[channel], spec = communicationChannels[channel];
    for (const n of [rule.minWords, rule.maxWords, rule.minChars, rule.maxChars, rule.maxXUnits, rule.maxItemWords].filter(Boolean)) assert(spec.length.includes(String(n)));
  });
}
test("X: 240/241 einfache Zeichen", () => { assert(check("a".repeat(240), "x").valid); assert(!check("a".repeat(241), "x").valid); });
test("X: breite Zeichen und Emoji werden konservativ gewichtet", () => { assert.equal(xUnits("ü"), 1); assert.equal(xUnits("界"), 2); assert.equal(xUnits("🙂"), 2); assert(!check("界".repeat(121), "x").valid); });
test("X: kurze URLs kosten mindestens 23 Einheiten", () => assert.equal(xUnits("https://a.co"), 23));
test("X: URL-Großschreibung und folgende Satzzeichen bleiben berücksichtigt", () => assert.equal(xUnits("HTTPS://A.CO."), 24));
test("X: ein Bruch in einem Satz ist keine Thread-Markierung", () => assert(check("Es betrifft 2/3 der genannten Fälle.", "x").valid));
test("X: keine Threads oder mehreren Absätze", () => { assert(!check("1/2 Text", "x").valid); assert(!check("Text\n\nWeiter", "x").valid); });
test("Presse: zu kurz, zu lang und Hashtags abweisen", () => { for (const text of ["kurz", texts.press.repeat(3), texts.press + " #Pflege"]) assert(!check(text, "press").valid); });
test("Presse: URL-Fragment ist kein Hashtag", () => assert(check(texts.press + " https://example.test/artikel#abschnitt", "press").valid));
test("LinkedIn: zwei Absätze erforderlich", () => assert(!check(texts.linkedin.replace("\n\n", " "), "linkedin").valid));
test("Instagram: höchstens drei Hashtags", () => assert(!check(texts.instagram + " #eins #zwei #drei", "instagram").valid));
test("Ausschuss: nur 2–3 einzelne, kurze, nummerierte Fragen", () => {
  for (const text of ["Einleitung\n" + texts.committee_question, "1. Ein Satz.\n2. Eine Frage?", texts.committee_question + "\n3. Dritte Frage?\n4. Vierte Frage?", "1. " + "Wort ".repeat(36) + "?\n2. Kurze Frage?"]) assert(!check(text, "committee_question").valid);
});
test("Ausschuss: Screenshot-Voraussetzung ohne Beleg abweisen", () => {
  const text = "1. Was sieht die Ausschussgeschäftsordnung derzeit vor?\n2. Welche Informationen fehlen?";
  assert(check(text, "committee_question").issues.includes("unbelegter-verfahrensbezug"));
  assert(check(text, "committee_question", [{excerpt:"Synthetischer Beleg nennt die Ausschussgeschäftsordnung."}]).valid);
});
test("Büro: genau fünf kurze Stichpunkte", () => { assert(!check(texts.internal_line + "\n- Sechster Punkt.", "internal_line").valid); assert(!check(texts.internal_line.replace(/^- /m, ""), "internal_line").valid); });
test("Format unbekannt wird nicht still zu Presse", () => assert(!check(texts.press, "unknown").valid));
console.log(`${passed}/${passed} Formatgruppen bestanden. Keine KI-Aufrufe.`);
