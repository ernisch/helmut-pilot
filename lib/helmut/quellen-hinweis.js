"use strict";

// Zwei vorhandene, geschlossene Belegtypen im bestehenden Speicher-/DTO-Kanal.
// Keine allgemeine Lizenzfreigabe und keine Aenderung der Parlamentsregeln.
const P = require("./parlamentsdaten-herkunft");
const I = require("./quellen-irights-text-herkunft");
const R = require("./quellen-destatis-rss-stand");
function leseHerkunft(value) {
  if (R.claimed(value)) return R.read(value);
  return I.istIrights(value) ? I.lese(value) : P.leseParlamentsdatenHerkunft(value);
}
function istNurFeedDokument(value) {
  return R.claimed(value) || I.istIrights(value) || P.istParlamentsdatenDokument(value);
}
function quellenhinweis(value) {
  if (R.claimed(value)) return R.notice(value);
  return I.istIrights(value) ? I.hinweis(value) : P.parlamentsdatenQuellenhinweis(value);
}
function quellenhinweisFelder(value, displayedUrl) {
  if (R.claimed(value)) {
    const sourceNotice = R.notice(value);
    const canonical = require("./dedup").canonicalizeUrl;
    if (!sourceNotice || displayedUrl && displayedUrl !== sourceNotice.articleUrl
      && displayedUrl !== canonical(sourceNotice.articleUrl)) return {};
    return { sourceNotice: { ...sourceNotice, articleUrl: displayedUrl || sourceNotice.articleUrl } };
  }
  if (!I.istIrights(value)) return P.quellenhinweisFelder(value, displayedUrl);
  const sourceNotice = I.hinweis(value);
  return sourceNotice && (!displayedUrl || displayedUrl === sourceNotice.articleUrl) ? { sourceNotice } : {};
}
module.exports = { leseHerkunft, istNurFeedDokument, quellenhinweis, quellenhinweisFelder };
