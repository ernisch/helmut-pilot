"use strict";

// Prueft nur den Nennungsbeleg, nicht Beteiligung, Zuständigkeit oder Wahrheit.
// Ausschliesslich der tatsaechlich abgesendete Prompt ist die Eingabegrundlage.
// Keine Aliase, Ressortableitung, Metadaten oder nachtraeglich geladenen Texte.
const FELDER = ["ministerien", "mentioned_ministries", "parteien", "mentioned_parties",
  "mentioned_people", "mentioned_mps", "ausschuesse", "mentioned_committees"];
// Die beiden OPTIONALEN Ministeriumslisten sind der EINZIGE Akteursbeleg, der unbelegte Werte
// nicht die gesamte Antwort sperren laesst, sondern deterministisch auf den belegten Teil
// reduziert wird (siehe `ohneUnbelegteMinisterien`). Alle anderen Akteurslisten bleiben
// unveraendert streng: ein unbelegter Wert sperrt die Antwort weiterhin vollstaendig.
const MINISTERIUMSFELDER = ["ministerien", "mentioned_ministries"];
const PROMPT_REGELN = [
  "AUSSCHUSSBELEG: ausschuesse und mentioned_committees duerfen nur Bezeichnungen enthalten, die woertlich in einem gelieferten Titel, Auszug oder expliziten Artikelkontext vorkommen.",
  "Gelieferte Ausschussbezeichnung erhalten; keine Zustaendigkeit aus Sachgebiet, Person, Partei oder Vorwissen ableiten. Keine Kurzform oder ausgeschriebene Bezeichnung ergaenzen. Ohne Nennung beide Ausschusslisten leer lassen.",
  "Die Nennung allein belegt keine Beteiligung: ausschuesse nur bei belegter eigener Rolle; sonst ausschliesslich mentioned_committees. Keine empfohlenen Ansprechpartner als beteiligte oder erwaehnte Ausschuesse ausgeben.",
  "PERSONENBELEG: mentioned_people und mentioned_mps duerfen nur Namensbezeichnungen enthalten, die woertlich in einem gelieferten Titel, Auszug oder expliziten Artikelkontext vorkommen.",
  "Gelieferte Namensform erhalten: fehlende Vornamen, ausgeschriebene Initialen, Namenskorrekturen und Rollen oder Parteizusaetze nicht aus Vorwissen ergaenzen. Keine Namen aus getrennten Textstellen zusammensetzen. Ohne Nennung beide Personenlisten leer lassen.",
  "Die Namensnennung allein belegt weder eine amtliche Rolle noch ein Mandat oder eine Parteizugehoerigkeit. mentioned_mps nur bei belegtem Parlamentsmandat; die Regeln fuer oeffentlich handelnde politische Akteure bleiben verbindlich.",
  "PARTEIENBELEG: parteien und mentioned_parties duerfen nur Bezeichnungen enthalten, die woertlich in einem gelieferten Titel, Auszug oder expliziten Artikelkontext vorkommen.",
  "Parteinamen aus dem Quellentext uebernehmen; keine Partei aus Thema, Ort, Person, Amt oder Vorwissen ableiten. Keine Kurzform oder ausgeschriebene Bezeichnung hinzuerfinden. Ohne Nennung beide Parteienlisten leer lassen.",
  "Eine Nennung belegt keine Beteiligung: parteien nur bei belegter eigener Rolle; sonst ausschliesslich mentioned_parties.",
  "MINISTERIENBELEG: ministerien und mentioned_ministries duerfen nur Bezeichnungen enthalten, die woertlich in einem gelieferten Titel, Auszug oder expliziten Artikelkontext vorkommen.",
  "Bezeichnung aus dem Quellentext uebernehmen; keine Abkuerzung ausschreiben, keinen Alias erfinden und kein Ressort aus dem Thema oder Vorwissen ableiten. Ohne Nennung beide Listen leer lassen.",
  "Auch eine blosse Nennung belegt noch keine Beteiligung: ministerien nur bei belegter eigener Rolle; sonst ausschliesslich mentioned_ministries. Diese Listen sind keine Empfehlung moeglicherweise zustaendiger Ansprechpartner."
];

function normalisiere(text) {
  return text.normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

// ── SICHERE PARTEIENAeQUIVALENZ FUER DEN QUELLENBELEG ────────────────────────────────────
// NUR die eine sichere Regel: der fuehrende BESTIMMTE ARTIKEL einer belegten offiziellen
// Parteibezeichnung ist kein eigener Beleg („Die Linke“ ~ „Linke“). Belegt durch die
// bestehende Parteiennormalisierung (lib/helmut/matching.js: `normalizeParty` entfernt das
// fuehrende „die“). Die Liste ist bewusst klein und ausdruecklich: der Artikel darf
// ausschliesslich fuer diese belegten Bezeichnungen entfallen.
//
// Bewusst NUR der Production-belegte Fall „Die Linke“/„Linke“ (169er-Einzelversuch
// vg-abschaffung-20260911-7420f6). KEINE weitere Partei ist in diesem Vertrag abgedeckt:
// „Die Gruenen“ etwa waere „gruenen“ (ASCII) — `normalisiere()` faltet KEINE Umlaute, die
// echte Form ist „grünen“ und traefe einen ASCII-Eintrag ohnehin nicht; eine Aufnahme waere
// unbelegt und ist bewusst unterlassen.
//
// BEWUSST NICHT ENTHALTEN (sachliche Aufweichung ohne Beleg):
//   * Fraktionsnamen („Linksfraktion“) — politisch verwandt, keine woertliche Parteibezeichnung
//   * Umschreibungen/Synonyme („Sozialdemokraten“, „Union“, „Buendnis 90“) aus PARTY_SYNONYMS
//   * Flexionsvarianten („Linken“) — die Wortgrenzen bleiben exakt
// Auch mit dieser Liste muss die (artikellose) Parteibezeichnung WOERTLICH im gelieferten
// Quellentext vorkommen; es entsteht keine Partei aus Person, Amt, Thema, Ort oder Vorwissen.
const PARTEI_ARTIKELVARIANTEN = Object.freeze(["linke"]);

function parteiBelegformen(name) {
  const basis = name.startsWith("die ") ? name.slice(4) : name;
  return PARTEI_ARTIKELVARIANTEN.includes(basis) ? [basis, `die ${basis}`] : [name];
}

function quellentexte(prompt) {
  if (typeof prompt !== "string") return [];
  const texte = [];
  // buildUnderstandingPrompt serialisiert jede Quelle auf genau einer Zeile.
  // Eingebettete Zeilenumbrueche in Quelltext bleiben JSON escaped.
  for (const zeile of prompt.split("\n")) {
    if (!zeile.startsWith('{"quelle_id":')) continue;
    let quelle;
    try { quelle = JSON.parse(zeile); } catch { return []; }
    for (const text of [quelle.titel, quelle.auszug, quelle.artikelkontext?.text]) {
      if (typeof text === "string" && text.trim()) texte.push(normalisiere(text));
    }
  }
  return texte;
}

function belegMuster(form) {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Keine Teilworttreffer (z.B. BMG in BMGruppen). Felder nie verbinden.
  return new RegExp(`(?:^|[^\\p{L}\\p{N}\\p{M}_])${escaped}(?=$|[^\\p{L}\\p{N}\\p{M}_])`, "u");
}

// IST EIN WERT DURCH DEN GELIEFERTEN QUELLENTEXT BELEGT? Genau die eine bestehende strenge
// Regel: woertlicher Wortlaut aus Titel, Auszug oder explizitem Artikelkontext,
// NFC/klein/Whitespace-normalisiert und mit Wortgrenzen; fuer Parteien zusaetzlich die oben
// dokumentierte, eng begrenzte Artikelvariante. Keine Aliase, keine Kuerzel, keine
// Ressortableitung, keine Metadaten, kein Fuzzy, kein Vorwissen.
function istWertBelegt(wert, texte, istParteifeld) {
  if (typeof wert !== "string") return false;
  const name = normalisiere(wert);
  if (!name) return true; // wie die bestehende Sanitisierung: leere Werte belegen nichts
  const formen = istParteifeld ? parteiBelegformen(name) : [name];
  return formen.some((form) => texte.some((text) => belegMuster(form).test(text)));
}

function pruefeAkteurslistenQuellenbindung(antwort, prompt) {
  const texte = quellentexte(prompt);
  const errors = [];
  for (const feld of FELDER) {
    const liste = antwort?.[feld];
    if (liste == null) continue; // optionale Erwaehnungen bleiben kompatibel
    if (!Array.isArray(liste)) { errors.push(`quellenbeleg-${feld}`); continue; }
    const istParteifeld = feld === "parteien" || feld === "mentioned_parties";
    if (!liste.every((wert) => istWertBelegt(wert, texte, istParteifeld))) {
      errors.push(`quellenbeleg-${feld}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── DIE EINE DETERMINISTISCHE REDUKTION DER OPTIONALEN MINISTERIUMSLISTEN ────────────────
// Anlass (Production-Befund 2026-09-23, BAföG-Vorgang vg-reform-20260429-1065a7): ein fachlich
// ansonsten brauchbares Understanding wurde VOLLSTAENDIG als `skipped-invalid` verworfen, weil
// das Modell in `ministerien`/`mentioned_ministries` unbelegte Ressortbezeichnungen lieferte
// (`quellenbeleg-ministerien`, `quellenbeleg-mentioned_ministries`). Beide Listen sind reine
// ERWAEHNUNGEN und keine Pflichtaussage. Sie werden deshalb — VOR dem Speichern —
// deterministisch auf die woertlich belegten Werte reduziert: unbelegte Werte entfallen, ohne
// Beleg bleibt die Liste leer.
//
// DIE QUELLENBINDUNG WIRD NICHT AUFGEWEICHT: es gilt exakt derselbe Beleg wie in
// `pruefeAkteurslistenQuellenbindung` (dieselben Quellen, dieselben Wortgrenzen, dieselbe
// Normalisierung). KEINE Alias-, Kuerzel-, Ressort- oder Fuzzy-Erweiterung, keine Metadaten,
// keine Ableitung aus anderen Antwortfeldern. Belegte Bezeichnungen bleiben unveraendert
// erhalten; unbelegte Angaben werden NIE gespeichert.
//
// ALLES ANDERE BLEIBT STRENG: Parteien, Personen, Ausschuesse, das Schema und der
// decision_level-Konflikt laufen unveraendert fail closed. Ein Feldwert, der kein Array ist,
// bleibt UNANGETASTET — der strenge Validator meldet ihn dann unveraendert als Fehler.
function ohneUnbelegteMinisterien(antwort, prompt) {
  if (!antwort || typeof antwort !== "object" || Array.isArray(antwort)) return antwort;
  const texte = quellentexte(prompt);
  const out = { ...antwort };
  for (const feld of MINISTERIUMSFELDER) {
    if (!Array.isArray(antwort[feld])) continue;
    // Nur unbelegte STRINGS entfallen; Nicht-Strings bleiben erhalten und sperren weiterhin.
    out[feld] = antwort[feld].filter((wert) =>
      typeof wert !== "string" || istWertBelegt(wert, texte, false));
  }
  return out;
}

module.exports = { PROMPT_REGELN, pruefeAkteurslistenQuellenbindung, ohneUnbelegteMinisterien };
