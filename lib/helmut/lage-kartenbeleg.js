"use strict";

// Ein Quellenlink allein traegt keine freie KO-Prosa. Ohne Artikelauszug
// bleiben nur Originaltitel und Quellenmetadaten sichtbar. Keine gespeicherten
// Daten aendern; vorhandener Auszug bedeutet noch keine positive Faktenpruefung.
const { artikelUrl } = require("./lage-quellenbeleg");
const { plain, institutionellerMetatext, stoertext } = require("./quellen-auszug");
const { titelRumpf } = require("./herausgeber");

// Belegte Fehlerklasse: freie Bedeutungseinordnung vergroessert die Tragweite
// um eine im Original nicht genannte Groessenordnung. Keine semantische
// Vollpruefung; andere Einordnungen und der gespeicherte Sachtext bleiben gleich.
function groessenordnungen(text) {
  return [...String(text || "").matchAll(/(?<!\p{L})(tausend(?:e[nrms]?)?|million(?:en)?|milliarde(?:n)?|billion(?:en)?)(?!\p{L})/giu)]
    .map(m => m[0].toLowerCase().replace(/^tausend.*$/, "tausend").replace(/en$/, "").replace(/milliard$/, "milliarde"));
}
function hatGroessenordnung(card) {
  return [card?.whyRelevant, card?.summary?.warumWichtig].some(t => groessenordnungen(t).length);
}
function begrenzeEinordnung(card, docs = []) {
  const belegt = new Set(docs.flatMap(d => groessenordnungen([d?.title, d?.summary].filter(Boolean).join(" "))));
  const gebunden = t => groessenordnungen(t).every(w => belegt.has(w));
  if (gebunden(card?.whyRelevant) && gebunden(card?.summary?.warumWichtig)) return card;
  return { ...card, whyRelevant: gebunden(card?.whyRelevant) ? card.whyRelevant : "",
    ...(card?.summary ? { summary: { ...card.summary,
      warumWichtig: gebunden(card.summary.warumWichtig) ? card.summary.warumWichtig : "" } } : {}) };
}

function begrenze(card, docs = []) {
  // Dieselbe URL wie in der ausgelieferten Karte, kein anderer Canonical-Fallback.
  const artikel = docs.filter(d => d && artikelUrl(d.url || d.canonical_url));
  if (artikel.some(d => {
    const auszug = typeof d.summary === "string" ? plain(d.summary) : "";
    // Ein ins Auszugsfeld kopierter Titel enthaelt keinen zusaetzlichen Kontext.
    return auszug && auszug !== plain(d.title) && auszug !== plain(titelRumpf(d))
      && !institutionellerMetatext(auszug) && !stoertext(auszug);
  })) return begrenzeEinordnung(card, artikel);
  const title = artikel.find(d => typeof d.title === "string" && d.title.trim())?.title || "";
  const hinweis = title ? "Artikelauszug fehlt; nur Quellentitel verfügbar."
    : "Keine nutzbaren Quellentexte für eine Zusammenfassung.";
  return {
    ...card,
    title: title || "Quellenhinweis", displayTitle: title || "Quellenhinweis",
    displaySummary: hinweis,
    summary: { wasIstPassiert: hinweis, warumWichtig: "", werIstBetroffen: "" },
    // Auch die Detailansicht und alte UI-Fallbacks duerfen keine unbelegte
    // Rolle, Rechtsfolge, Empfehlung oder persoenliche Bedeutung ergaenzen.
    policyField: "", displayCategory: "Quellenhinweis", status: "", standLabel: "", nextStep: "",
    empfehlung: "", recommendation: "", whyRelevant: "", relevanz: null,
    parteien: [], ausschuesse: [], ministerien: [], mentionedPeople: [],
    mentionedParties: [], mentionedCommittees: [], mentionedMinistries: []
  };
}

module.exports = { begrenze, hatGroessenordnung, begrenzeEinordnung };
