"use strict";

// Eine Sammelkarte darf den Artikel einer spezifischeren Karte nicht erneut
// erzaehlen. Nur echte Teilmengen von Artikelidentitaeten aufteilen; gemeinsame
// Oberthemen oder eine einzelne gemeinsam zitierte Quelle sind keine Ereignisgleichheit.
const { createHash } = require("node:crypto");
const { briefingArticleIdentity, canonicalizeUrl } = require("./dedup");
const { artikelUrl } = require("./lage-quellenbeleg");
const { plain, institutionellerMetatext, stoertext } = require("./quellen-auszug");
const key = url => artikelUrl(url) ? (briefingArticleIdentity(url) || canonicalizeUrl(url)) : null;

function teile(cards = [], sources = {}) {
  const keys = cards.map(c => new Set((c.sources || []).map(s => key(s.url)).filter(Boolean)));
  return cards.flatMap((card, index) => {
    // Explizite redaktionelle Ereignisrollen behalten ihre eigene Bindung.
    if (card.ereignisTeilmitgliedId || card.ereignisTeilrollen || card.quellenhinweis) return [card];
    const covered = new Set();
    keys.forEach((other, n) => {
      if (cards[n].ereignisTeilmitgliedId || cards[n].ereignisTeilrollen || cards[n].quellenhinweis) return;
      if (n !== index && other.size && other.size < keys[index].size
        && [...other].every(k => keys[index].has(k))) other.forEach(k => covered.add(k));
    });
    if (!covered.size) return [card];
    const remaining = new Map((card.sources || []).filter(s => key(s.url) && !covered.has(key(s.url)))
      .map(s => [key(s.url), s]));
    // Die restlichen Meldungen bleiben einzeln mit Originaltitel/-auszug erhalten.
    // Keine KO-weite Einordnung, Frist, Empfehlung oder Relevanz uebertragen.
    return [...remaining].map(([identity, source]) => {
      const docs = (sources[card.vorgangId] || []).filter(d => key(d.url || d.canonical_url) === identity);
      const excerpts = [...new Set(docs.map(d => plain(d.summary || "")).filter(s => s
        && !institutionellerMetatext(s) && !stoertext(s) && s !== plain(source.title || "")))];
      const text = excerpts.length === 1 ? excerpts[0] : "Artikelauszug fehlt; nur Quellentitel verfügbar.";
      return {
        id: card.id, vorgangId: card.vorgangId,
        // Anzeigeadresse, keine neue Vorgangs-/Datenbankidentitaet.
        anzeigeId: `${card.vorgangId}:quelle:${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`,
        quellenhinweis: true,
        title: source.title || "Quellenhinweis", displayTitle: source.title || "Quellenhinweis",
        displayCategory: source.name || "Quelle", displaySummary: text,
        summary: { wasIstPassiert: text, warumWichtig: "", werIstBetroffen: "" },
        sources: [source], sourceCount: 1, chronologie: [], documents: []
      };
    });
  });
}

module.exports = { teile };
