"use strict";

// Optionaler Fachvertrag im selben Understanding-Aufruf. Keine Titelheuristik,
// Profilbewertung, neuen Modelle oder Speicherzugriffe. Massgeblich sind nur die
// tatsaechlich gesendeten Quellenzeilen, nie weitere Texte des Rohclusters.
const { hash, quellenLektuereBeleg } = require("./quellen-lektuerebeleg");
const { institutionellerMetatext, stoertext } = require("./quellen-auszug");
const MAX_TAGS = 6, MAX_TAG = 64, MAX_PASSAGE = 480;
const FELD = "helmut_fachthemen";
const PROMPT_REGELN = [
  "FACHTHEMEN (gleicher Aufruf, mandatsneutral): tags enthaelt hoechstens sechs kurze deutsche Sachthemen des HAUPTVORGANGS, keine Akteure, Ressortzustaendigkeiten, Dringlichkeit oder persoenliche Prioritaet.",
  "Nur im gelesenen Originalauszug oder Artikelkontext woertlich belegte Themen verwenden. Keine Themen aus URL, Herausgeber, Titel allein, Vorwissen, KO-Prosa oder ungelesenen Artikelteilen ableiten. Hintergrundnennung, Vergleich oder ausdruecklich ausgeschlossenes Thema sind kein Sachthema des Hauptvorgangs.",
  "Zu JEDEM tag genau einen fachthemen_belege-Eintrag {tag, quelle_id, feld, passage} ausgeben. feld ist auszug oder artikelkontext; passage ist eine zusammenhaengende wortgleiche Quellpassage (20 bis 480 Zeichen) aus genau diesem Feld genau dieser quelle_id. Die gesamte Tagbezeichnung muss als Wort oder Wortgruppe in dieser Passage stehen; keine Wortteile, Ellipsen oder zusammengesetzten Zitate.",
  "Belege nur aus den hier gesendeten Textteilen nutzen. Ein Quellenabschnitt belegt keine anderen Abschnitte. Wenn kein solcher Fachbeleg vorliegt, tags und fachthemen_belege als [] ausgeben; die sonstige Analyse unveraendert quellentreu erstellen. Keine Ausschussbeteiligung aus einem Thema erfinden."
];
const BELEG_SCHEMA = { type: "array", maxItems: MAX_TAGS, items: {
  type: "object", additionalProperties: false, required: ["tag", "quelle_id", "feld", "passage"],
  properties: { tag: { type: "string", minLength: 2, maxLength: MAX_TAG },
    quelle_id: { type: "string", minLength: 1, maxLength: 200 },
    feld: { type: "string", enum: ["auszug", "artikelkontext"] },
    passage: { type: "string", minLength: 20, maxLength: MAX_PASSAGE } }
} };
const TAG_SCHEMA = { type: "array", maxItems: MAX_TAGS,
  items: { type: "string", minLength: 2, maxLength: MAX_TAG } };
const plain = x => x && typeof x === "object" && !Array.isArray(x);
const normal = s => s.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
function tagGueltig(tag) {
  return typeof tag === "string" && tag.length >= 2 && tag.length <= MAX_TAG
    && tag === tag.trim() && /^[\p{L}\p{M}][\p{L}\p{M}\p{N} -]+$/u.test(tag);
}
function ganzesThema(tag, passage) {
  const escaped = normal(tag).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{M}\\p{N}_])`, "u").test(normal(passage));
}
function promptQuellen(prompt) {
  if (typeof prompt !== "string" || !prompt) throw Error("eingabe-fehlt");
  const quellen = new Map();
  for (const line of prompt.split("\n")) {
    if (!line.startsWith('{"quelle_id":')) continue;
    const q = JSON.parse(line);
    if (!plain(q) || typeof q.quelle_id !== "string" || !q.quelle_id || quellen.has(q.quelle_id))
      throw Error("eingabe-ungueltig");
    quellen.set(q.quelle_id, q);
  }
  if (!quellen.size || quellen.size > 12) throw Error("eingabe-ungueltig");
  return quellen;
}

function pruefe(antwort = {}, prompt, ko = {}) {
  const basis = { version: 1, vorgangId: ko.vorgang_id, koVersion: ko.ko_version };
  const ergebnis = (tags, status, grund, belege = []) => {
    const nachweis = { ...basis, status, grund, belege };
    nachweis.belegHash = hash([basis, tags, status, grund, belege]);
    return { tags, nachweis };
  };
  if (antwort.tags === undefined && antwort.fachthemen_belege === undefined)
    return ergebnis([], "fehlt", "fachthemen-nicht-geliefert");
  const tags = antwort.tags, belege = antwort.fachthemen_belege;
  if (!Array.isArray(tags) || !Array.isArray(belege) || tags.length > MAX_TAGS
    || tags.length !== belege.length || tags.some(t => !tagGueltig(t))
    || new Set(tags.map(normal)).size !== tags.length)
    return ergebnis([], "unbelegt", "fachthemen-struktur-ungueltig");
  if (!tags.length) return ergebnis([], "leer", "keine-fachthemen-belegt");
  let quellen;
  try { quellen = promptQuellen(prompt); }
  catch { return ergebnis([], "unbelegt", "fachthemen-eingabe-unpruefbar"); }
  const nachweise = [];
  for (const tag of tags) {
    const treffer = belege.filter(b => plain(b) && b.tag === tag);
    if (treffer.length !== 1) return ergebnis([], "unbelegt", "fachthemen-beleg-ungueltig");
    const b = treffer[0], q = quellen.get(b.quelle_id);
    if (Object.keys(b).sort().join() !== "feld,passage,quelle_id,tag"
      || typeof b.quelle_id !== "string" || !b.quelle_id || b.quelle_id.length > 200
      || !q || !["auszug", "artikelkontext"].includes(b.feld)
      || typeof b.passage !== "string" || b.passage.length < 20 || b.passage.length > MAX_PASSAGE)
      return ergebnis([], "unbelegt", "fachthemen-beleg-ungueltig");
    const text = b.feld === "auszug" ? q.auszug : q.artikelkontext?.text;
    if (typeof text !== "string" || institutionellerMetatext(text) || stoertext(text)
      || !text.includes(b.passage) || !ganzesThema(tag, b.passage))
      return ergebnis([], "unbelegt", "fachthemen-originalpassage-fehlt");
    const quelle = quellenLektuereBeleg(q);
    nachweise.push({ tag, dokumentId: q.quelle_id, quellenHash: quelle.quellenHash,
      textstandHash: quelle.textstandHash, ...(quelle.abschnitt ? { abschnitt: quelle.abschnitt } : {}),
      feld: b.feld, passageHash: hash(b.passage) });
  }
  return ergebnis(tags.slice(), "belegt", null, nachweise);
}
module.exports = { MAX_TAGS, MAX_TAG, MAX_PASSAGE, FELD, TAG_SCHEMA, BELEG_SCHEMA, PROMPT_REGELN, pruefe };
