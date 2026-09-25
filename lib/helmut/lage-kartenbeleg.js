"use strict";

// Ein Quellenlink allein traegt keine freie KO-Prosa. Ohne Artikelauszug
// bleiben nur Originaltitel und Quellenmetadaten sichtbar. Keine gespeicherten
// Daten aendern; vorhandener Auszug bedeutet noch keine positive Faktenpruefung.
const { artikelUrl } = require("./lage-quellenbeleg");
const { plain, institutionellerMetatext, stoertext } = require("./quellen-auszug");
const { titelRumpf } = require("./herausgeber");

function begrenze(card, docs = []) {
  // Dieselbe URL wie in der ausgelieferten Karte, kein anderer Canonical-Fallback.
  const artikel = docs.filter(d => d && artikelUrl(d.url || d.canonical_url));
  if (artikel.some(d => {
    const auszug = typeof d.summary === "string" ? plain(d.summary) : "";
    // Ein ins Auszugsfeld kopierter Titel enthaelt keinen zusaetzlichen Kontext.
    return auszug && auszug !== plain(d.title) && auszug !== plain(titelRumpf(d))
      && !institutionellerMetatext(auszug) && !stoertext(auszug);
  })) return card;
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

module.exports = { begrenze };
