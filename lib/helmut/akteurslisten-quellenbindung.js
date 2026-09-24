"use strict";

// Prueft nur den Nennungsbeleg, nicht Beteiligung, Zuständigkeit oder Wahrheit.
// Ausschliesslich der tatsaechlich abgesendete Prompt ist die Eingabegrundlage.
// Keine Aliase, Ressortableitung, Metadaten oder nachtraeglich geladenen Texte.
const FELDER = ["ministerien", "mentioned_ministries", "parteien", "mentioned_parties",
  "mentioned_people", "mentioned_mps", "ausschuesse", "mentioned_committees"];
// MINISTERIUMSLISTEN: der ERSTE belegte Fall (BAfoeG-Einzelversuch, Production 2026-09-23) —
// `ministerien`/`mentioned_ministries` gelten als reine NENNUNGEN und keine Pflichtaussage.
const MINISTERIUMSFELDER = ["ministerien", "mentioned_ministries"];
// ERWAEHNUNGSLISTEN (`mentioned_*`): der Prompt trennt ausdruecklich "strukturell beteiligt"
// (`parteien`/`ausschuesse`/`ministerien`) von "nur erwaehnt". Eine blosse Nennung ist keine
// Beteiligungsaussage und traegt keine eigene Rolle — sie darf eine ansonsten brauchbare
// Antwort nicht sperren. Abgeleitet aus der EINEN kanonischen Feldliste, keine zweite Liste.
const ERWAEHNUNGSFELDER = FELDER.filter((feld) => feld.startsWith("mentioned_"));
// REDUZIERBARE Listen: ein UNBELEGTER Wert sperrt die Antwort hier NICHT mehr vollstaendig,
// sondern wird vor dem Speichern deterministisch auf den woertlich belegten Teil reduziert
// (siehe `ohneUnbelegteAkteurswerte`). Belegte Werte bleiben unveraendert; unbelegte werden
// NIE gespeichert; danach gilt die strenge Pruefung unveraendert.
//
// BETEILIGUNGSLISTEN: `parteien` und `ausschuesse`. Ein Wert hier behauptet eine EIGENE ROLLE im
// Vorgang, nicht nur eine Nennung. Fuer BEIDE gilt unveraendert STRENG: ein unbelegter Wert
// sperrt die gesamte Antwort (`skipped-invalid`, nichts wird gespeichert).
//
// ANLASS/WIEDER-VERWORFEN (2026-09-24, Versuch einer `parteien`-Reduktion): DREI lokale
// `quellenbeleg-parteien`-Fehler des 169er Runs 35987448290 sperrten die gesamte Antwort. Eine
// Reduktion nur des LISTENWERTS wurde geprueft und wieder verworfen, weil sie einen NEUEN
// Durchlasspfad erzeugt haette: eine umschreibende Prosa kann semantisch von genau der entfernten
// unbelegten Parteibeteiligung abhaengen, OHNE den Parteinamen zu enthalten
// (Beispiel: `parteien=["Fantasiepartei"]` + `warum_wichtig="Die Regierungspartei blockiert das
// Vorhaben."`). Ein blosser Namensvergleich belegt KEINE semantische Unabhaengigkeit; eine
// Wortlisten-Heuristik ("Regierungspartei", "Opposition", "Koalition", "Fraktion", "politische
// Kraft") waere kein Beweis. Eine belastbare, quellengebundene Belegstruktur je Aussage gibt es
// fuer diese Prosa-Felder NICHT (dokumentiert: docs/START_HERE.md §5 und
// docs/quellenpflicht-nachweis-2026-08-22.md §2 — eine Beleg-Bindung je Aussage ist ausdruecklich
// "noch nicht garantiert"; Per-Absatz-Belege existieren nur im Lage-Pfad). Deshalb bleibt es bei
// dem historischen Vertrag „keine stille Listenbereinigung bei gleichzeitig erhaltener abhaengiger
// Empfehlung": ein unbelegter struktureller `parteien`-Wert => gesamte Antwort fail closed.
// Lieber drei Vorgaenge spaeter kontrolliert erneut ausfuehren als unbelegte politische Prosa speichern.
// Zusaetzlich entfernt `ohneFalschTypisierteAkteure` in ALLEN Listen woertlich BELEGTE, aber
// eindeutig FALSCH TYPISIERTE Werte (zentrale Entitaetsschicht, Befund 2026-09-23).
const REDUZIERBARE_FELDER = [...new Set([...MINISTERIUMSFELDER, ...ERWAEHNUNGSFELDER])];
// Typvertrag je Akteursfeld (zentrale Entitaetsschicht ist die einzige Wahrheit).
const FELD_TYPEN = Object.freeze({
  ministerien: { erlaubt: ["ministry"], hint: "ministry" },
  mentioned_ministries: { erlaubt: ["ministry"], hint: "ministry" },
  parteien: { erlaubt: ["party", "parliamentary_group"], hint: "party" },
  mentioned_parties: { erlaubt: ["party", "parliamentary_group"], hint: "party" },
  ausschuesse: { erlaubt: ["committee"], hint: "committee" },
  mentioned_committees: { erlaubt: ["committee"], hint: "committee" },
  mentioned_people: { erlaubt: ["person"], hint: "person" },
  mentioned_mps: { erlaubt: ["person"], hint: "person" }
});
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

// Das Partei-Sonderfeld traegt genau eine zusaetzliche, eng begrenzte Belegform (bestimmter
// Artikel). Nur `parteien`/`mentioned_parties` nutzen sie; alle anderen Felder bleiben exakt.
function istParteifeld(feld) { return feld === "parteien" || feld === "mentioned_parties"; }

function pruefeAkteurslistenQuellenbindung(antwort, prompt) {
  const texte = quellentexte(prompt);
  const errors = [];
  for (const feld of FELDER) {
    const liste = antwort?.[feld];
    if (liste == null) continue; // optionale Erwaehnungen bleiben kompatibel
    if (!Array.isArray(liste)) { errors.push(`quellenbeleg-${feld}`); continue; }
    if (!liste.every((wert) => istWertBelegt(wert, texte, istParteifeld(feld)))) {
      errors.push(`quellenbeleg-${feld}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ── DIE EINE DETERMINISTISCHE REDUKTION DER REDUZIERBAREN LISTEN ─────────────────────────
// Anlass 1 (Production-Befund 2026-09-23, BAföG-Vorgang vg-reform-20260429-1065a7): ein
// fachlich ansonsten brauchbares Understanding wurde VOLLSTAENDIG als `skipped-invalid`
// verworfen, weil das Modell in `ministerien`/`mentioned_ministries` unbelegte
// Ressortbezeichnungen lieferte (`quellenbeleg-ministerien`, `quellenbeleg-mentioned_ministries`).
// Anlass 2 (Production-Befund 2026-09-24, Run 35934515630, Vorgang vg-reformen-20260908-c646df):
// derselbe Fehlermechanismus traf eine ERWAEHNUNGSLISTE — `quellenbeleg-mentioned_people`
// beendete den gesamten 169er Lauf nach 10 von 122 Clustern (ausgang `unbekannt`).
//
// DESHALB: die REDUZIERBAREN_FELDER (die Erwaeehnungslisten `mentioned_*` und die beiden
// belegten Ministeriumslisten) werden VOR dem Speichern deterministisch auf den woertlich
// belegten Teil reduziert: unbelegte STRINGS entfallen, ohne Beleg bleibt die Liste leer.
//
// ANLASS 3 / BETEILIGUNGSLISTE `parteien` — GEPRUEFT UND VERWORFEN (2026-09-24): DREI lokale
// `quellenbeleg-parteien`-Fehler des 169er Runs 35987448290 sperrten die gesamte Antwort. Eine
// Reduktion nur des Listeneintrags wurde untersucht und bewusst NICHT umgesetzt: sie erzeugte einen
// neuen Durchlasspfad, weil eine umschreibende Prosa semantisch von genau der entfernten
// unbelegten Parteibeteiligung abhaengen kann, OHNE den Parteinamen zu enthalten (Beispiel:
// `parteien=["Fantasiepartei"]` + `warum_wichtig="Die Regierungspartei blockiert das Vorhaben."`).
// Ein Namensvergleich belegt KEINE semantische Unabhaengigkeit, und eine belastbare
// quellengebundene Belegstruktur je Aussage gibt es fuer diese Prosa-Felder nicht (docs/START_HERE.md
// §5, docs/quellenpflicht-nachweis-2026-08-22.md §2: eine Beleg-Bindung je Aussage ist ausdruecklich
// "noch nicht garantiert"). Deshalb gilt unveraendert der historische Vertrag „keine stille
// Listenbereinigung bei gleichzeitig erhaltener abhaengiger Empfehlung": ein unbelegter
// struktureller `parteien`-Wert => gesamte Antwort fail closed. Lieber drei Vorgaenge spaeter
// kontrolliert erneut ausfuehren als potenziell unbelegte politische Prosa speichern.
//
// DIE QUELLENBINDUNG WIRD NICHT AUFGEWEICHT: es gilt exakt derselbe Beleg wie in
// `pruefeAkteurslistenQuellenbindung`. KEINE Alias-, Kuerzel-, Ressort- oder Fuzzy-Erweiterung,
// keine Metadaten, keine Ableitung aus anderen Antwortfeldern. Belegte Bezeichnungen bleiben
// unveraendert erhalten; unbelegte Angaben werden NIE gespeichert.
//
// ALLES ANDERE BLEIBT STRENG: die Beteiligungslisten `parteien`/`ausschuesse`, alle uebrigen
// Antwortfelder, das Schema und der `decision_level-Konflikt` laufen unveraendert fail closed. Der
// GOLDSET-Auswerter und der strenge Validator `pruefeAkteurslistenQuellenbindung` pruefen weiter
// jeden Rohwert. Ein Feldwert, der kein Array ist, bleibt UNANGETASTET — der strenge Validator
// meldet ihn unveraendert als Fehler.
function ohneUnbelegteAkteurswerte(antwort, prompt) {
  if (!antwort || typeof antwort !== "object" || Array.isArray(antwort)) return antwort;
  const texte = quellentexte(prompt);
  const out = { ...antwort };
  for (const feld of REDUZIERBARE_FELDER) {
    if (!Array.isArray(antwort[feld])) continue;
    // Nur unbelegte STRINGS entfallen; Nicht-Strings bleiben erhalten und sperren weiterhin.
    out[feld] = antwort[feld].filter((wert) =>
      typeof wert !== "string" || istWertBelegt(wert, texte, istParteifeld(feld)));
  }
  return out;
}

// ── DIE EINE DETERMINISTISCHE TYPBEREINIGUNG DER QUELLENGEBUNDENEN AKTEURSLISTEN ──────────
// Anlass (Production-Befund 2026-09-23, BAföG-Vorgang vg-reform-20260429-1065a7): das Modell
// lieferte `mentioned_ministries = ["Bundesregierung"]`, obwohl die zentrale Entitaetsschicht
// `Bundesregierung` als `government` kennt — ein woertlich belegter, aber eindeutig FALSCH
// TYPISIERTER Akteurswert. Ein solcher Wert wird deterministisch entfernt, fuer ALLE acht
// quellengebundenen Akteurslisten (Ministerien, Parteien, Ausschuesse, Personen).
//
// WARUM DAS KEINE AUFWEICHUNG IST: entfernt werden NUR Strings, die WOERTLICH belegt sind UND
// deren BEKANNTER entity_type nicht zum Zielfeld passt (Beispiele: government in einem
// Ministeriumsfeld, parliament in einem Ausschussfeld, union in einem Parteifeld). Ein
// UNBEKANNTER, woertlich belegter Wert (entity_id = null) bleibt unveraendert erhalten — eine
// unvollstaendige Entitaetstabelle darf keinen erfundenen Negativtreffer erzeugen. UNBELEGTE
// Werte werden hier NICHT entfernt; sie laufen unveraendert durch den strengen Validator (in den
// REDUZIERBAREN_FELDER reduziert zusaetzlich `ohneUnbelegteAkteurswerte`).
// NICHT-Arrays und Nicht-Strings bleiben unangetastet — der strenge Validator meldet sie weiter.
// KEINE Alias-, Kuerzel-, Ressort- oder Fuzzy-Erweiterung; keine Metadaten als Beleg.
function typVertraeglich(wert, regel) {
  const { resolveEntity } = require("./quellenarchitektur/classification");
  const treffer = resolveEntity(wert, regel.hint);
  if (!treffer || treffer.entity_id == null) return true; // unbekannt -> nicht verwerfen
  return regel.erlaubt.includes(treffer.type);
}

function ohneFalschTypisierteAkteure(antwort, prompt) {
  if (!antwort || typeof antwort !== "object" || Array.isArray(antwort)) return antwort;
  const texte = quellentexte(prompt);
  const out = { ...antwort };
  for (const feld of FELDER) {
    if (!Array.isArray(antwort[feld])) continue;
    const regel = FELD_TYPEN[feld];
    out[feld] = antwort[feld].filter((wert) =>
      typeof wert !== "string"
      || !istWertBelegt(wert, texte, istParteifeld(feld))
      || typVertraeglich(wert, regel));
  }
  return out;
}

module.exports = { PROMPT_REGELN, pruefeAkteurslistenQuellenbindung, ohneUnbelegteAkteurswerte,
  ohneFalschTypisierteAkteure, FELD_TYPEN };
