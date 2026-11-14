"use strict";

// Ausschliesslich die Auswahl neuer Tagesarbeit. Ein Abrufdatum macht einen
// Archivartikel nicht aktuell; Originale und ihre Verarbeitungsurteile bleiben.
const F = require("./briefing-frische"), Z = require("./quellen-zeitvertrag");
function pruefe(doc, { jetztMs = Date.now(), env = process.env } = {}) {
  const tage = F.relevanzTage(env), von = jetztMs - tage * 86400000;
  if (!Number.isFinite(jetztMs) || !Number.isFinite(von) || !Number.isFinite(tage) || tage <= 0)
    throw Error("artikel-tagesrelevanz-zeitfenster-ungueltig");
  const result = (geeignet, grund) => ({ geeignet, grund });
  let treffer;
  try { treffer = require("./artikelstand").leseStand(doc); }
  catch { return result(false, "artikelstand-nicht-bestaetigt"); }
  if (treffer) {
    // Derselbe ganze Berliner Publikationstag wie im bestehenden Lagevertrag.
    // Keine kuenstliche Mitternacht und kein Rueckfall auf andere Metadaten.
    return result(F.berlinTagVollImFenster(treffer.stand.publikationstag, von, jetztMs), "artikelstand-tagesfenster");
  }
  const werte = [doc?.publishedAt, doc?.published_at].filter(v => v !== undefined && v !== null);
  const daten = werte.map(Z.publikationsdatum);
  if (!daten.length || daten.some(d => !d) || new Set(daten.map(d => d.iso)).size !== 1)
    return result(false, "publikationsdatum-nicht-bestaetigt");
  if (werte.some(v => /^\d{4}-\d{2}-\d{2}$/.test(v))) {
    return result(F.berlinTagVollImFenster(daten[0].original.slice(0, 10), von, jetztMs), "publikationstag-fenster");
  }
  const ms = Date.parse(daten[0].iso);
  return result(ms >= von && ms <= jetztMs, "publikationszeit-fenster");
}
function versionPasst({ item, row }, gespeichert, args) {
  if (!pruefe(gespeichert, args).geeignet || !require("./quellenstand-bindung").gleicherStand(row, gespeichert)) return false;
  const Q = require("./quellen-auszug");
  // Die vorhandene Persistenz erhaelt langen gelieferten RSS-Text sowie bereits
  // bestaetigten Originalinhalt bei einer erneuten reinen Titelbeobachtung.
  // Weder andere Metadaten noch ein anderer gelieferter Originaltext heilen ihn.
  return !Q.hatOriginalinhalt(row) || [row.summary, item.summary, item.content, item.excerpt]
    .some(text => Q.plain(text) && Q.plain(text) === Q.plain(gespeichert.summary));
}
module.exports = { pruefe, versionPasst };
