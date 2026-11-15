"use strict";

// Zwei vorhandene, geschlossene Belegtypen im bestehenden Speicher-/DTO-Kanal.
// Keine allgemeine Lizenzfreigabe und keine Aenderung der Parlamentsregeln.
const P = require("./parlamentsdaten-herkunft");
const I = require("./quellen-irights-text-herkunft");
function leseHerkunft(value) {
  return I.istIrights(value) ? I.lese(value) : P.leseParlamentsdatenHerkunft(value);
}
function istNurFeedDokument(value) {
  return I.istIrights(value) || P.istParlamentsdatenDokument(value);
}
function quellenhinweis(value) {
  return I.istIrights(value) ? I.hinweis(value) : P.parlamentsdatenQuellenhinweis(value);
}
function quellenhinweisFelder(value, displayedUrl) {
  if (!I.istIrights(value)) return P.quellenhinweisFelder(value, displayedUrl);
  const sourceNotice = I.hinweis(value);
  return sourceNotice && (!displayedUrl || displayedUrl === sourceNotice.articleUrl) ? { sourceNotice } : {};
}
module.exports = { leseHerkunft, istNurFeedDokument, quellenhinweis, quellenhinweisFelder };
