"use strict";

// Unabhaengige, konservative Offline-Gegenpruefung fuer Sachurteile.
//
// Sie ist KEIN zweiter freier Sprachgenerator: kein Modell, kein NLI, kein
// externer Dienst, keine Netz- oder Datenbankabhaengigkeit. Sie versteht
// freie politische Sprache nicht. Sie prueft deterministisch, ob ein
// positives oder negatives Sachurteil durch vorhandene strukturierte Angaben
// ueberhaupt zulaessig ist. Reicht die Struktur nicht, lautet das Ergebnis
// konservativ "offen" — niemals "tragfaehig" und niemals "widersprochen".
//
// Keine Fallkennung, kein Sollurteil und kein Beispielsatz ist hier
// hinterlegt. Die Regeln sind aus allgemeinen Eigenschaften der strukturierten
// Eingabe (Praemissen-/Faktenzeilen) ableitbar.

const ARTEN = ["sachangabe", "befugnis", "fachbezug", "moeglichkeit", "vorschlag"];
const BEFUNDE = ["getragen", "widersprochen", "offen", "keineTatsachenbehauptung"];
const URTEILE = ["tragfaehig", "widersprochen", "offen"];
const MODALITAETEN = ["geplant", "vorgeschlagen", "moeglich", "beschlossen", "umgesetzt"];
const ENTSCHEIDUNGSSTAENDE = ["offen", "beschlossen", "nichtBeschlossen"];

// Gleiche Satzzerlegung wie der bestehende Praemissenvertrag, damit die
// Gegenpruefung dieselben Einheiten sieht. Keine neue Interpretation.
function segmentiere(einordnung) {
  return [...new Intl.Segmenter("de", { granularity: "sentence" }).segment(einordnung)]
    .map((s, index) => ({ index, text: s.segment.trim() })).filter(s => s.text.length > 0);
}

function belegGebunden(b, refs) {
  return b && typeof b.referenz === "string" && typeof b.zitat === "string"
    && b.zitat.trim().length > 0 && refs.get(b.referenz)?.includes(b.zitat) === true;
}

// REGEL 2: Nur ein tatsaechlich vorhandener gegenteiliger Beleg erzeugt einen
// Widerspruch. Die Abwesenheit eines Belegs reicht nie.
function pruefeWiderspruch(f, refs) {
  const w = f.widerspruch;
  if (w == null) return null;
  if (w && typeof w.gegenReferenz === "string" && typeof w.gegenZitat === "string"
    && refs.get(w.gegenReferenz)?.includes(w.gegenZitat) === true)
    return { befund: "widersprochen", fehlend: [] };
  return { befund: "offen", fehlend: ["widerspruchsbeleg"] };
}

function pruefeFakt(f, refs) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return { befund: "offen", fehlend: ["faktenzeile"] };
  const widerspruch = pruefeWiderspruch(f, refs);
  if (widerspruch) return widerspruch;
  if (!ARTEN.includes(f.art)) return { befund: "offen", fehlend: ["art"] };

  // REGEL 5: Vorschlag/Moeglichkeit ist keine Tatsachenbehauptung. Jede darin
  // vorausgesetzte Tatsache oder Befugnis bleibt eine eigene, belegpflichtige
  // Voraussetzung.
  if (f.art === "moeglichkeit" || f.art === "vorschlag") {
    if (!Array.isArray(f.voraussetzungen) || f.voraussetzungen.length === 0)
      return { befund: "keineTatsachenbehauptung", fehlend: [] };
    let widersprochen = false, fehlend = [];
    for (const v of f.voraussetzungen) {
      const r = pruefeFakt(v, refs);
      if (r.befund === "widersprochen") widersprochen = true;
      else if (r.befund === "offen") for (const x of r.fehlend) fehlend.push("voraussetzung:" + x);
    }
    if (widersprochen) return { befund: "widersprochen", fehlend: [] };
    if (fehlend.length) return { befund: "offen", fehlend };
    return { befund: "keineTatsachenbehauptung", fehlend: [] };
  }

  const fehlend = [];

  // REGEL 8: Ein Zitat/Quellenhash bindet Text, beweist aber nicht, dass das
  // Zitat die behauptete Bedeutung traegt. Die Bedeutung muss unabhaengig
  // hergeleitet UND freigegeben sein.
  if (!Array.isArray(f.belege) || f.belege.length === 0 || !f.belege.every(b => belegGebunden(b, refs)))
    fehlend.push("belege");
  if (!(typeof f.interpretationHerkunft === "string" && f.interpretationHerkunft.trim().length > 0))
    fehlend.push("interpretationHerkunft");
  if (!(typeof f.freigabe === "string" && f.freigabe.trim().length > 0))
    fehlend.push("freigabe");

  // REGEL 6: Modalitaet (geplant/vorgeschlagen/moeglich/beschlossen/umgesetzt)
  // ist eine getrennte typisierte Angabe und darf nicht umgedeutet werden.
  if (!MODALITAETEN.includes(f.modalitaet)) fehlend.push("modalitaet");

  // REGEL 1: Nicht genannt oder nicht geliefert ist unbekannt (offen), kein
  // Widerspruch. Ein Entscheidungsstand muss typisiert vorliegen.
  if (!ENTSCHEIDUNGSSTAENDE.includes(f.entscheidungsstand)) fehlend.push("entscheidungsstand");

  // REGEL 7: Ein Umsetzungs-/Inkrafttretensdatum beweist keinen Beschlusstermin.
  if (f.modalitaet === "beschlossen") {
    if (f.entscheidungsstand !== "beschlossen") fehlend.push("entscheidungsstand");
    if (!(typeof f.beschlusstermin === "string" && f.beschlusstermin.trim().length > 0))
      fehlend.push("beschlusstermin");
  }

  // REGEL 3: Rollen und Befugnisse nur getragen, wenn eine gelieferte Quelle
  // oder Profilangabe sie konkret traegt. Keine allgemeine Parlamentsbefugnis.
  if (f.art === "befugnis" && !refs.has(f.befugnisGrundlage)) fehlend.push("befugnisGrundlage");

  // REGEL 4: Profilbezug muss konkret sein; ein vorhandener Ausschuss oder
  // Schwerpunkt reicht nicht automatisch als Fachbezug zum konkreten Vorgang.
  if (f.art === "fachbezug" && !(f.profilbezug && f.profilbezug.getragen === true))
    fehlend.push("profilbezug");

  if (fehlend.length) return { befund: "offen", fehlend };
  return { befund: "getragen", fehlend: [] };
}

function pruefeSatz(satzIndex, refs, fakten) {
  const treffer = fakten.filter(f => f && f.satz === satzIndex);
  if (treffer.length === 0) return { satz: satzIndex, befund: "offen", fehlend: ["faktenzeile"] };
  let widersprochen = false, offen = false, getragen = false, fehlend = [];
  for (const f of treffer) {
    const r = pruefeFakt(f, refs);
    if (r.befund === "widersprochen") widersprochen = true;
    else if (r.befund === "offen") { offen = true; for (const x of r.fehlend) fehlend.push(x); }
    else if (r.befund === "getragen") getragen = true;
  }
  if (widersprochen) return { satz: satzIndex, befund: "widersprochen", fehlend: [] };
  if (offen) return { satz: satzIndex, befund: "offen", fehlend: [...new Set(fehlend)] };
  return { satz: satzIndex, befund: getragen ? "getragen" : "keineTatsachenbehauptung", fehlend: [] };
}

// Konservative Ableitung des Sachurteils aus strukturierten Faktenzeilen.
// fall hat dieselbe Gestalt wie im Praemissenvertrag:
//   { id, quellen: [{id,text}], profil: [{id,text}], mandatsbezug, einordnung }
// fakten ist optional; ohne strukturierte Fakten ist jede Aussage offen.
function beurteile(fall, fakten = []) {
  const quellen = Array.isArray(fall?.quellen) ? fall.quellen : [];
  const profil = Array.isArray(fall?.profil) ? fall.profil : [];
  const einordnung = typeof fall?.einordnung === "string" ? fall.einordnung : "";
  const refs = new Map([...quellen, ...profil].filter(r => r && r.id).map(r => [r.id, r.text]));
  const saetze = segmentiere(einordnung);
  const satzBefunde = saetze.map(s => pruefeSatz(s.index, refs, fakten));
  const urteil = satzBefunde.every(s => s.befund === "getragen" || s.befund === "keineTatsachenbehauptung")
    ? "tragfaehig"
    : satzBefunde.some(s => s.befund === "widersprochen") ? "widersprochen" : "offen";
  const fehlendeFelder = [...new Set(satzBefunde.flatMap(s => s.fehlend))];
  return { urteil, saetze: satzBefunde, fehlendeFelder,
    gruende: satzBefunde.filter(s => s.befund !== "getragen" && s.befund !== "keineTatsachenbehauptung")
      .map(s => `satz${s.index}:${s.befund}${s.fehlend.length ? "[" + s.fehlend.join(",") + "]" : ""}`) };
}

module.exports = { ARTEN, BEFUNDE, URTEILE, MODALITAETEN, ENTSCHEIDUNGSSTAENDE,
  segmentiere, pruefeFakt, pruefeSatz, beurteile };
