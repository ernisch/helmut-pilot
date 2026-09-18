"use strict";

// Prueft nur den Nennungsbeleg, nicht Beteiligung, Zuständigkeit oder Wahrheit.
// Ausschliesslich der tatsaechlich abgesendete Prompt ist die Eingabegrundlage.
// Keine Aliase, Ressortableitung, Metadaten oder nachtraeglich geladenen Texte.
const FELDER = ["ministerien", "mentioned_ministries", "parteien", "mentioned_parties",
  "mentioned_people", "mentioned_mps", "ausschuesse", "mentioned_committees"];
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

function pruefeAkteurslistenQuellenbindung(antwort, prompt) {
  const texte = quellentexte(prompt);
  const errors = [];
  for (const feld of FELDER) {
    const liste = antwort?.[feld];
    if (liste == null) continue; // optionale Erwaehnungen bleiben kompatibel
    if (!Array.isArray(liste)) { errors.push(`quellenbeleg-${feld}`); continue; }
    const unbelegt = liste.some(wert => {
      if (typeof wert !== "string") return true;
      const name = normalisiere(wert);
      if (!name) return false; // wie die bestehende Sanitisierung
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Keine Teilworttreffer (z.B. BMG in BMGruppen). Felder nie verbinden.
      const muster = new RegExp(`(?:^|[^\\p{L}\\p{N}\\p{M}_])${escaped}(?=$|[^\\p{L}\\p{N}\\p{M}_])`, "u");
      return !texte.some(text => muster.test(text));
    });
    if (unbelegt) errors.push(`quellenbeleg-${feld}`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { PROMPT_REGELN, pruefeAkteurslistenQuellenbindung };
