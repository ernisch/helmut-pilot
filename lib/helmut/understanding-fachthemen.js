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
const plain = x => Boolean(x && typeof x === "object" && !Array.isArray(x));
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

const typ = x => x === null ? "null" : Array.isArray(x) ? "array" : typeof x;
const merkmal = (x, max) => ({ typ: typ(x), zeichen: typeof x === "string" ? x.length : null,
  hash: typeof x === "string" && x.length <= max ? hash(x) : null });
function einfrieren(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(einfrieren); Object.freeze(value);
  }
  return value;
}

function pruefe(antwort = {}, prompt, ko = {}) {
  const basis = { version: 2, vorgangId: ko.vorgang_id, koVersion: ko.ko_version };
  const tags = antwort?.tags, belege = antwort?.fachthemen_belege;
  const antwortStruktur = { tagsTyp: typ(tags), belegeTyp: typ(belege),
    tagsAnzahl: Array.isArray(tags) ? tags.length : null, belegeAnzahl: Array.isArray(belege) ? belege.length : null };
  const ergebnis = (akzeptiert, status, grund, nachweise = [], diagnosen = []) => {
    // Quellenbindung ist keine semantische Fachpruefung und insbesondere kein
    // negatives Relevanzurteil. Keine Rohzitate oder ungeprueften Labels ablegen.
    const nachweis = { ...basis, status, grund, semantischePruefung: "offen", antwortStruktur,
      belege: nachweise, diagnosen };
    nachweis.belegHash = hash([basis, akzeptiert, status, grund, "offen", antwortStruktur, nachweise, diagnosen]);
    return einfrieren({ tags: akzeptiert, nachweis });
  };
  if (tags === undefined && belege === undefined) return ergebnis([], "fehlt", "fachthemen-nicht-geliefert");
  // Globale Mengen-/Typgrenzen bleiben streng. Innerhalb dieses begrenzten
  // Umschlags werden Belege einzeln beurteilt, nicht gemeinsam verworfen.
  if (!Array.isArray(tags) || !Array.isArray(belege) || tags.length > MAX_TAGS || belege.length > MAX_TAGS)
    return ergebnis([], "unbelegt", "fachthemen-struktur-ungueltig");
  if (!tags.length && !belege.length) return ergebnis([], "leer", "keine-fachthemen-belegt");
  let quellen;
  try { quellen = promptQuellen(prompt); }
  catch { return ergebnis([], "unbelegt", "fachthemen-eingabe-unpruefbar"); }
  const nachweise = [], diagnosen = [];
  for (const [index, value] of belege.entries()) {
    const b = plain(value) ? value : {}, tag = b.tag;
    const tagIndex = tags.findIndex(t => t === tag);
    const tagOk = tagGueltig(tag), q = quellen.get(b.quelle_id);
    const feldOk = ["auszug", "artikelkontext"].includes(b.feld);
    const passageOk = typeof b.passage === "string" && b.passage.length >= 20 && b.passage.length <= MAX_PASSAGE;
    const text = feldOk && q ? b.feld === "auszug" ? q.auszug : q.artikelkontext?.text : null;
    const textOk = typeof text === "string";
    const p = { struktur: plain(value) && Object.keys(b).sort().join() === "feld,passage,quelle_id,tag",
      tagGueltig: tagOk, tagDeklariert: tagIndex >= 0,
      tagEindeutig: tagOk && tags.filter(t => tagGueltig(t) && normal(t) === normal(tag)).length === 1,
      belegEindeutig: tagOk && belege.filter(v => plain(v) && v.tag === tag).length === 1,
      quellenkennungGueltig: typeof b.quelle_id === "string" && b.quelle_id.length > 0 && b.quelle_id.length <= 200,
      quelleImPrompt: Boolean(q), feldGueltig: feldOk, passageGueltig: passageOk, feldTextVorhanden: textOk,
      institutionellerMetatext: textOk ? institutionellerMetatext(text) : null,
      stoertext: textOk ? stoertext(text) : null,
      passageWortgleich: textOk && passageOk ? text.includes(b.passage) : null,
      // Ausschliesslich Diagnose: normalisierte Naehe erteilt KEIN Schreibrecht.
      passageNormalisiert: textOk && passageOk ? normal(text).includes(normal(b.passage)) : null,
      ganzesTaglabel: tagOk && passageOk ? ganzesThema(tag, b.passage) : null };
    const grund = !p.struktur ? "fachthemen-belegstruktur-ungueltig"
      : !p.tagGueltig ? "fachthemen-tag-ungueltig"
      : !p.tagDeklariert ? "fachthemen-tag-nicht-deklariert"
      : !p.tagEindeutig ? "fachthemen-tag-mehrdeutig"
      : !p.belegEindeutig ? "fachthemen-beleg-mehrdeutig"
      : !p.quellenkennungGueltig ? "fachthemen-quellenkennung-ungueltig"
      : !p.quelleImPrompt ? "fachthemen-quelle-nicht-gelesen"
      : !p.feldGueltig ? "fachthemen-feld-ungueltig"
      : !p.passageGueltig ? "fachthemen-passage-ungueltig"
      : !p.feldTextVorhanden ? "fachthemen-feldtext-fehlt"
      : p.institutionellerMetatext ? "fachthemen-institutioneller-metatext"
      : p.stoertext ? "fachthemen-stoertext"
      : !p.passageWortgleich ? "fachthemen-passage-nicht-wortgleich"
      : !p.ganzesTaglabel ? "fachthemen-taglabel-fehlt" : null;
    const quelle = q ? quellenLektuereBeleg(q) : null;
    const bindung = quelle ? { dokumentId: q.quelle_id, quellenHash: quelle.quellenHash,
      textstandHash: quelle.textstandHash, ...(quelle.abschnitt ? { abschnitt: quelle.abschnitt } : {}) } : {};
    diagnosen.push({ belegIndex: index, tagIndex: tagIndex < 0 ? null : tagIndex,
      status: grund ? "verworfen" : "belegt", grund, pruefung: p, ...bindung,
      eingabe: { tag: merkmal(tag, MAX_TAG), quellenkennung: merkmal(b.quelle_id, 200),
        feld: feldOk ? b.feld : null, passage: merkmal(b.passage, MAX_PASSAGE) } });
    if (!grund) nachweise.push({ tag, ...bindung, feld: b.feld, passageHash: hash(b.passage) });
  }
  for (const [index, tag] of tags.entries()) {
    if (belege.some(b => plain(b) && b.tag === tag)) continue;
    diagnosen.push({ belegIndex: null, tagIndex: index, status: "verworfen",
      grund: tagGueltig(tag) ? "fachthemen-beleg-fehlt" : "fachthemen-tag-ungueltig", eingabe: { tag: merkmal(tag, MAX_TAG) } });
  }
  const akzeptiert = tags.filter(tag => nachweise.some(b => b.tag === tag));
  const vollstaendig = akzeptiert.length === tags.length && diagnosen.every(d => d.status === "belegt");
  return ergebnis(akzeptiert, vollstaendig ? "belegt" : akzeptiert.length ? "teilweise" : "unbelegt",
    vollstaendig ? null : akzeptiert.length ? "fachthemen-teilweise-belegt" : "fachthemen-belege-verworfen",
    tags.flatMap(tag => nachweise.filter(b => b.tag === tag)), diagnosen);
}
module.exports = { MAX_TAGS, MAX_TAG, MAX_PASSAGE, FELD, TAG_SCHEMA, BELEG_SCHEMA, PROMPT_REGELN, pruefe };
