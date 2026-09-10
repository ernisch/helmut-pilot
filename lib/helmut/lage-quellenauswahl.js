"use strict";

// Kandidaten fuer die nachfolgende Quellenpruefung, keine Faktenabnahme und
// kein Mitgliedschafts-/Zustaendigkeitsbeleg. Ein ausdruecklicher Wortbezug
// darf nicht allein am Top-N-Cut eines komprimierten Hashvektors scheitern.
// Keine neuen Themenlabels, keine Embeddings, keine Daten- oder Modellaufrufe.
const { committeeMatchKey } = require("./matching");
const { istGenerisch } = require("./vorgang-identity");
const GENERISCH = new Set(["ausschuss", "ausschuesse", "angelegenheiten", "bundestag", "landtag", "politik", "gesetz"]);
function woerter(value) {
  return String(value || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe")
    .replace(/ü/g, "ue").replace(/ß/g, "ss").match(/[a-z]+/g) || [];
}
function stamm(w) {
  // Nur einfache Flexionsformen (digitales/digitale, Thueringen/Thueringer).
  // Keine freie Teilwortsuche: Recht und Menschenrechte bleiben verschieden.
  return w.length >= 7 ? w.replace(/(?:ern|em|er|en|es|e|s)$/, "") : w;
}
function signale(profile = {}) {
  const felder = [profile.committee, ...(profile.committees || []), ...(profile.ausschuesse || [])]
    .filter(Boolean).map(committeeMatchKey);
  felder.push(...(profile.focusTopics || []), ...(profile.reportingTopics || []), ...(profile.topics || []),
    ...(profile.fachpolitische_schwerpunkte || []), profile.state, profile.bundesland,
    profile.constituency, profile.wahlkreis, ...(profile.regionalInterests || []));
  return new Set(felder.flatMap(woerter).filter(w => w.length >= 5 && !GENERISCH.has(w) && !istGenerisch(w)).map(stamm));
}
function bevorzugeAusdruecklichenBezug(pool, bisher, profile, limit) {
  const begriffe = signale(profile);
  if (!begriffe.size) return bisher.slice(0, limit);
  const passend = ko => woerter([ko?.headline, ko?.was_ist_passiert, ko?.warum_wichtig].filter(Boolean).join(" "))
    .some(w => begriffe.has(stamm(w)));
  const gesehen = new Set(), out = [];
  // Vorhandene direkt passende Kandidaten behalten ihre Reihenfolge; weitere
  // kommen aus demselben begrenzten Lesefenster. Erst danach bisherige Treffer.
  for (const ko of [...bisher.filter(passend), ...pool.filter(passend), ...bisher]) {
    if (!ko?.id || gesehen.has(ko.id)) continue;
    gesehen.add(ko.id); out.push(ko);
    if (out.length >= limit) break;
  }
  return out;
}
module.exports = { bevorzugeAusdruecklichenBezug };
