"use strict";

// Reine Funktionsgegenproben: vorhandene Originalfixtures und ausdrueckliche
// Synthetik. Kein Fetch, Speicheradapter, Modell oder Verarbeitungslauf.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const S = require("../lib/helmut/artikel-abschnitte");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
let passed = 0;
function test(name, run) { run(); passed++; console.log("PASS " + name); }
function vollstaendig(original, bundle) {
  assert.equal(bundle.originalHash, hash(original));
  assert.equal(bundle.abschnitte.map(p => p.text).join(""), original);
  assert.equal(bundle.abschnitte[0].start, 0);
  assert.equal(bundle.abschnitte.at(-1).end, original.length);
  for (let i = 0; i < bundle.count; i++) {
    const p = bundle.abschnitte[i];
    assert.equal(p.start, i ? bundle.abschnitte[i - 1].end : 0);
    assert.equal(p.text, original.slice(p.start, p.end));
    assert.equal(p.textHash, hash(p.text));
    assert(p.text.length <= bundle.maxZeichen);
    assert(Buffer.byteLength(p.text, "utf8") <= bundle.maxBytes);
    assert.deepEqual(S.pruefe(S.waehle(bundle, i)), S.waehle(bundle, i));
  }
}
const read = name => fs.readFileSync(path.join(__dirname, "fixtures/inhaltsversorgung-20261108", name), "utf8");
const dgbHtml = read("dgb-artikel.html");
const dgbJson = [...dgbHtml.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(m => JSON.parse(m[1]));
const dgb = dgbJson.flatMap(x => x["@graph"] || [x]).find(x => x["@type"] === "NewsArticle").articleBody;
const radioRaw = /<div\b[^>]*itemprop="articleBody"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i.exec(read("radio-hannover.html"))[1];
const entities = { auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", amp: "&" };
const radio = radioRaw.replace(/&([A-Za-z]+);/g, (m, k) => { assert(k in entities); return entities[k]; });

test("Vorhandener DGB-Originaltext bleibt einschliesslich Branchenabsatz bytegleich", () => {
  assert(dgb.includes("700.000 Menschen")); assert(dgb.includes("500.000 von ihnen"));
  const b = S.segmentiere(dgb); assert.equal(b.count, 1); vollstaendig(dgb, b);
});
test("Vorhandener Radio-Originalabsatz bleibt unverkuerzt", () => {
  assert.equal(radio.length, 727); assert(radio.includes("Ab 2027 könnten"));
  vollstaendig(radio, S.segmentiere(radio));
});
const absaetze = Array.from({ length: 6 }, (_, i) => `Synthetischer Absatz ${i + 1}. ` + "Zusammenhaengender Sachkontext. ".repeat(100));
const lang = absaetze.join("\n\n");
test("Mehr als8kZeichen werden lueckenlos in ganze Absaetze aufgeteilt", () => {
  const b = S.segmentiere(lang); assert(b.count > 1); vollstaendig(lang, b);
  for (const p of b.abschnitte.slice(0, -1)) assert(p.text.endsWith("\n\n"));
});
test("SinglelineOriginal wird ohne erfundene Absaetze an Satzgrenzen geteilt", () => {
  const text = "Dieser synthetische Satz hat einen vollstaendigen Aussagekern. ".repeat(220);
  const b = S.segmentiere(text); assert(b.count > 1); vollstaendig(text, b);
  assert(b.abschnitte.every(p => !p.text.includes("\n")));
});
test("Auswahlpiece enthaelt keine anderen Abschnittstexte", () => {
  const b = S.segmentiere(lang), p = S.waehle(b, 0);
  assert(!Object.hasOwn(p, "abschnitte")); assert(!JSON.stringify(p).includes("Synthetischer Absatz 6."));
  assert.equal(p.abschnittHashes.length, b.count); assert.equal(p.count, b.count);
});
test("Membership bindet Text Reihenfolge Ranges Hashes und Gesamtstand", () => {
  const p = S.waehle(S.segmentiere(lang), 0);
  const mutations = [x => { x.text = x.text.replace("Absatz", "Bericht"); }, x => { x.index++; },
    x => { x.end--; }, x => { x.originalHash = "a".repeat(64); }, x => { x.bundleHash = "b".repeat(64); },
    x => { x.abschnittHashes.reverse(); }, x => { x.gesamtZeichen++; }, x => { x.maxBytes--; },
    x => { x.abschnittHashes.push("c".repeat(64)); }, x => { x.abschnitte = []; }];
  for (const mutate of mutations) { const copy = structuredClone(p); mutate(copy); assert.throws(() => S.pruefe(copy), /artikel-abschnitte-/); }
});
test("Vollbundle mit ausgelassenem wiederholtem oder verschobenem Teil bleibt gesperrt", () => {
  const b = S.segmentiere(lang);
  for (const mutate of [x => x.abschnitte.splice(1, 1), x => x.abschnitte.reverse(),
    x => { x.abschnitte[1] = x.abschnitte[0]; }, x => { x.abschnitte[0].text += "Fremdtext"; }]) {
    const copy = structuredClone(b); mutate(copy); assert.throws(() => S.waehle(copy, 0), /artikel-abschnitte-/);
  }
});
test("Artikelveraenderung fuehrt zu anderem Original und Bundlehash", () => {
  const a = S.segmentiere(lang), b = S.segmentiere(lang + " Neue belegte Entwicklung.");
  assert.notEqual(a.originalHash, b.originalHash); assert.notEqual(a.bundleHash, b.bundleHash);
});
test("UTF8Bytegrenze wirkt neben Zeichengrenze ohne Surrogatbruch", () => {
  const text = "Ältere Beschäftigte erhalten Unterstützung 😀. ".repeat(20);
  const b = S.segmentiere(text, { maxZeichen: 180, maxBytes: 190 });
  assert(b.count > 1); vollstaendig(text, b);
});
test("CRLF und Zwischenraum bleiben exakt Teil des Originalstands", () => {
  const text = "Erster Absatz bleibt erhalten.\r\n\r\nZweiter Absatz bleibt erhalten.\r\n\r\n";
  vollstaendig(text, S.segmentiere(text, { maxZeichen: 40, maxBytes: 40 }));
});
test("Abkuerzungen und Dezimalzahlen werden nicht kuenstlich zu Saetzen", () => {
  const text = "Dr. Beispiel nennt 2,5 Mio. Euro im Abs. 3 des Vertrags. Danach folgt eine weitere Aussage.";
  const b = S.segmentiere(text, { maxZeichen: 65, maxBytes: 65 });
  assert.equal(b.count, 2); assert(b.abschnitte[0].text.endsWith("Vertrags. ")); vollstaendig(text, b);
});
test("Ein ueberlanger unteilbarer Satz bleibt sichtbar blockiert", () => {
  assert.throws(() => S.segmentiere("x".repeat(8001)), /artikel-abschnitte-satz-zu-lang/);
  assert.throws(() => S.segmentiere("Zunächst ein kurzer Satz. " + "x".repeat(8001)), /artikel-abschnitte-satz-zu-lang/);
});
test("Original und Abschnittsgrenzen lassen sich nicht unbegrenzt erhoehen", () => {
  assert.throws(() => S.segmentiere("x".repeat(1024 * 1024 + 1)), /original-ungueltig/);
  for (const g of [{ maxZeichen: 8001 }, { maxBytes: 12001 }, { maxBytes: 0 }, { maxZeichen: NaN }, { unbekannt: 1 }])
    assert.throws(() => S.segmentiere("Belegter Text.", g), /grenzen-ungueltig/);
  const cap = S.segmentiere("Aussage. ".repeat(256), { maxZeichen: 9, maxBytes: 9 });
  assert.equal(cap.count, 256); S.pruefe(S.waehle(cap, 255));
  assert.throws(() => S.segmentiere("Aussage. ".repeat(257), { maxZeichen: 9, maxBytes: 9 }), /anzahl-ueberschritten/);
});
test("Leere kaputte und unzulaessige Eingaben sind kein Original", () => {
  for (const text of ["", "  ", null, 17, "Defekt\ud800", "\udc00Defekt"])
    assert.throws(() => S.segmentiere(text), /original-ungueltig/);
  const b = S.segmentiere("Ein vollständiger Satz.");
  for (const index of [-1, 1, 0.5, "0"]) assert.throws(() => S.waehle(b, index), /index-ungueltig/);
  assert.throws(() => S.segmentiere("Text.", null), /grenzen-ungueltig/);
  assert.throws(() => S.segmentiere("\n\nBelegter Satz.", { maxZeichen: 15, maxBytes: 15 }), /abschnitt-ohne-text/);
});
test("Wiederholte Auswahl ist deterministisch und aendert keinen Vollstand", () => {
  const b = S.segmentiere(lang), before = structuredClone(b);
  const p = S.waehle(b, 0); p.abschnittHashes[0] = "f".repeat(64);
  assert.deepEqual(b, before); assert.deepEqual(S.segmentiere(lang), before);
  assert.deepEqual(S.pruefeBundle(b), before);
});
console.log(`${passed}/${passed} Artikelabschnittsgruppen bestanden`);
