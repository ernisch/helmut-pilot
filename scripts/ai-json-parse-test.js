"use strict";

// Offline-Tests fuer die LLM-Antwort-Robustheit von parseJsonText (lib/helmut/ai.js).
// Hintergrund: real in Production beobachteter Fehler "Bad control character in string
// literal in JSON at position 681" (generateCommunicationDraft) — das Modell lieferte
// ein ROHES Steuerzeichen (z. B. echten Zeilenumbruch) mitten in einem JSON-Stringwert.
// JSON verbietet unescaped U+0000-U+001F in String-Literalen. Der Fix escaped Steuer-
// zeichen als LETZTE Rettung NUR innerhalb von String-Literalen (Zustandsscanner);
// gueltiges JSON und Struktur-Whitespace bleiben unveraendert. KEIN Netz, KEINE KI.

const ai = require("../lib/helmut/ai");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- 1) Normalfaelle bleiben unveraendert -------------------------------------------
check("1 gueltiges JSON wird normal geparst",
  ai.parseJsonText('{"a": 1, "b": "text"}').a === 1);
check("1b Markdown-Zaun ```json wird weiterhin entfernt",
  ai.parseJsonText('```json\n{"a": 2}\n```').a === 2);
check("1c fuehrender Prosa-Text vor { wird weiterhin abgeschnitten",
  ai.parseJsonText('Hier ist das Ergebnis: {"a": 3}').a === 3);
check("1d Struktur-Whitespace (Zeilenumbrueche ZWISCHEN Tokens) bleibt gueltig",
  ai.parseJsonText('{\n  "a": 4,\n  "b": [1, 2]\n}').b.length === 2);

// --- 2) Der reale Production-Fehler: rohes Steuerzeichen IM Stringwert ---------------
// echter Zeilenumbruch mitten im Wert -> vorher SyntaxError, jetzt korrekt escaped.
const rawNewline = '{"draft": "Zeile eins\nZeile zwei", "channel": "presse"}';
check("2 rohes \\n im Stringwert wird gerettet (der Production-Fall)",
  ai.parseJsonText(rawNewline).draft === "Zeile eins\nZeile zwei");
const rawTabCr = '{"text": "mit\tTab und\rCR"}';
check("2b rohes \\t und \\r im Stringwert werden gerettet",
  ai.parseJsonText(rawTabCr).text === "mit\tTab und\rCR");
const rawCtrl = '{"x": "steuerzeichen"}';
check("2c sonstiges Steuerzeichen (U+0001) wird als \\uXXXX gerettet",
  ai.parseJsonText(rawCtrl).x === "steuerzeichen");
// Kombination: Prosa + Zaun + rohes Steuerzeichen (wie echte Modellantworten aussehen).
const combined = 'Gerne, hier der Entwurf:\n```json\n{"draft": "Absatz eins\n\nAbsatz zwei"}\n```';
check("2d Prosa + Markdown-Zaun + rohe Zeilenumbrueche zusammen -> geparst",
  ai.parseJsonText(combined).draft.includes("Absatz zwei"));

// --- 3) Der Scanner veraendert NUR String-Inhalte, nie Struktur ----------------------
check("3 escapeControlCharsInJsonStrings ist No-op fuer gueltiges JSON",
  ai.escapeControlCharsInJsonStrings('{\n  "a": "b"\n}') === '{\n  "a": "b"\n}');
check("3b bereits escapte Sequenzen (\\\\n, \\\\\") bleiben unveraendert",
  ai.escapeControlCharsInJsonStrings('{"a": "x\\ny \\"q\\""}') === '{"a": "x\\ny \\"q\\""}');
check("3c escapter Backslash am Stringende verwirrt den Scanner nicht",
  JSON.parse(ai.escapeControlCharsInJsonStrings('{"p": "C:\\\\pfad\n"}')).p === "C:\\pfad\n");

// --- 4) Anbieter-Umschlag: Fehler kann VOR dem Modelltext-Parser entstehen -----------
const validEnvelope = '{"output":[{"content":[{"type":"output_text","text":"ok"}]}],"usage":{"input_tokens":1}}';
check("4 gueltiger Anbieter-Umschlag wird normal geparst",
  ai.parseProviderResponseJson(validEnvelope).output[0].content[0].text === "ok");
const rawEnvelopeNewline = '{"output":[{"content":[{"type":"output_text","text":"Zeile eins\nZeile zwei"}]}]}';
check("4b rohes Steuerzeichen im output_text wird vor der Extraktion gerettet",
  ai.parseProviderResponseJson(rawEnvelopeNewline).output[0].content[0].text === "Zeile eins\nZeile zwei");
let envelopeThrew = false;
try { ai.parseProviderResponseJson('Vorspann {"output":[]}'); } catch { envelopeThrew = true; }
check("4c Anbieter-Umschlag akzeptiert keine fuehrende Prosa", envelopeThrew);
envelopeThrew = false;
try { ai.parseProviderResponseJson('{"output": [}'); } catch { envelopeThrew = true; }
check("4d strukturell kaputter Anbieter-Umschlag bleibt ein Fehler", envelopeThrew);

// --- 5) Ehrliches Scheitern: echter Muell wirft weiterhin ---------------------------
let threw = false;
try { ai.parseJsonText("kein json weit und breit"); } catch { threw = true; }
check("5 komplett ungueltiger Text wirft weiterhin (kein stilles Erfinden)", threw);
threw = false;
try { ai.parseJsonText('{"unvollstaendig": '); } catch { threw = true; }
check("5b strukturell kaputtes JSON wirft weiterhin", threw);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} AI-JSON-Parse-Assertions`);
process.exit(failed > 0 ? 1 : 0);
