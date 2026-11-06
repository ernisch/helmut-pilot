"use strict";

// Geschlossene Herkunftsmetadaten für die zwei erlaubten Titel-/Linkfeeds.
// Keine unkontrollierten Raw-Felder, redaktionellen Texte oder fremden Links.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { PARLAMENTSDATEN_QUELLEN, BUNDESPULS_SOURCE_ID, parlamentsdatenFeed } = require("./quellenarchitektur/seeds/parlamentsdaten-quellen");
const hash = title => crypto.createHash("sha256").update(title).digest("hex");
const BOT_USER_AGENT = "HelmutBot/1.0 (+https://helmut-pilot.vercel.app/impressum)";
const BEWERTUNGSZAHL = Symbol("parlamentsdaten-unabhaengige-belege");

function artikelKennung(sourceId, url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return null;
    if (sourceId === BUNDESPULS_SOURCE_ID) {
      const m = /^\/vorgang\/([1-9][0-9]{0,11})$/.exec(u.pathname);
      return u.hostname === "bundespuls.de" && !u.search && m ? { kind: "DIP-Vorgang", value: m[1] } : null;
    }
    const celex = u.searchParams.get("uri");
    return sourceId === "eurlex-amtsblatt-l-rss" && u.hostname === "eur-lex.europa.eu"
      && /^\/legal-content\/(?:AUTO|[A-Z]{2,3})\/(?:TXT\/)?$/.test(u.pathname)
      && /^CELEX:[A-Z0-9():.\/-]{1,80}$/.test(celex || "")
      ? { kind: "CELEX", value: celex.slice(6) } : null;
  } catch { return null; }
}

function baueParlamentsdatenHerkunft(source, articleUrl, title, titleTruncated = false) {
  const feed = parlamentsdatenFeed(source);
  const identifier = feed && artikelKennung(feed.id, articleUrl);
  if (!feed || !identifier || typeof title !== "string" || !title || title.length > 300) return null;
  const documentNumber = /\b(?:Drucksache|Drs\.)\s+(\d{1,3}\/\d{1,7})\b/i.exec(title)?.[1];
  return {
    version: 1, sourceId: feed.id, feedUrl: feed.url, articleUrl,
    titleHash: hash(title), titleTruncated: titleTruncated === true,
    scope: "title_link_metadata", evidenceRole: feed.evidenceRole, identifier,
    ...(documentNumber ? { documentReference: { kind: "Drucksache", number: documentNumber } } : {})
  };
}

function leseParlamentsdatenHerkunft(value = {}) {
  const metadata = value.parlamentsdatenHerkunft || value.raw?.parlamentsdatenHerkunft;
  if (!metadata || typeof metadata !== "object") return null;
  const ids = [value.sourceId, value.source_id, value.primary_source_id].filter(Boolean);
  const urls = [value.url, value.canonical_url].filter(Boolean);
  const canonical = require("./dedup").canonicalizeUrl;
  if (!ids.length || ids.some(id => id !== metadata.sourceId)
    || !urls.length || urls.some(url => canonical(url) !== canonical(metadata.articleUrl))) return null;
  const expected = baueParlamentsdatenHerkunft({ id: metadata.sourceId, url: metadata.feedUrl },
    metadata.articleUrl, value.title, metadata.titleTruncated);
  return expected && isDeepStrictEqual(metadata, expected) ? expected : null;
}

function istParlamentsdatenDokument(value = {}) {
  // Auch ein beschädigter/fehlender Herkunftsbeleg erweitert den erlaubten Umfang
  // einer bekannten Quelle nicht auf Artikelvolltext.
  return [value.sourceId, value.source_id, value.primary_source_id,
    value.parlamentsdatenHerkunft?.sourceId, value.raw?.parlamentsdatenHerkunft?.sourceId]
    .some(id => PARLAMENTSDATEN_QUELLEN.some(source => source.id === id));
}

function istBundespulsBeleg(value = {}) {
  const ids = [value.sourceId, value.source_id, value.primary_source_id].filter(Boolean);
  const urls = [value.url, value.canonical_url].filter(Boolean);
  return ids.length > 0 && ids.every(id => id === BUNDESPULS_SOURCE_ID)
    && urls.length > 0 && urls.every(url => artikelKennung(BUNDESPULS_SOURCE_ID, url));
}

// Nur eine lesende Bewertungsprojektion. source_document_count bleibt die echte
// Dokumentzahl; der Symbolwert kann weder in JSON noch in eine DB-Zeile gelangen.
function bewertungsprojektion(ko, documents = []) {
  const docs = Array.isArray(documents) ? documents : [];
  const count = new Set(docs.filter(istBundespulsBeleg).map(doc => doc.id || doc.url || doc.canonical_url)).size;
  if (!count) return ko;
  return { ...ko, [BEWERTUNGSZAHL]: Math.max(0, Math.max(Number(ko.source_document_count) || 0, docs.length) - count) };
}
function unabhaengigeBelegzahl(ko, fallback) {
  return ko && Object.hasOwn(ko, BEWERTUNGSZAHL) ? ko[BEWERTUNGSZAHL] : fallback;
}

function parlamentsdatenQuellenhinweis(value) {
  const metadata = leseParlamentsdatenHerkunft(value);
  if (!metadata) return null;
  const bundespuls = metadata.sourceId === BUNDESPULS_SOURCE_ID;
  const feed = PARLAMENTSDATEN_QUELLEN.find(source => source.id === metadata.sourceId);
  return {
    sourceId: metadata.sourceId, articleUrl: metadata.articleUrl,
    text: bundespuls
      ? `Quelle: Deutscher Bundestag/Bundesrat – DIP. Aufbereitung: Bundespuls. DIP-Vorgang ${metadata.identifier.value}.${metadata.documentReference ? ` Titel nennt Drucksache ${metadata.documentReference.number}.` : ""}`
      : `EUR-Lex — Amt für Veröffentlichungen der Europäischen Union. CELEX ${metadata.identifier.value}.`,
    originalUrl: bundespuls ? "https://dip.bundestag.de" : metadata.articleUrl,
    originalLabel: bundespuls ? "Originaldaten kostenlos bei DIP" : "Original kostenlos bei EUR-Lex",
    licenseUrl: feed.usagePolicy.evidenceUrls[bundespuls ? 3 : 0],
    changes: `Nur Titelmetadaten übernommen${metadata.titleTruncated ? "; Titel gekürzt" : ""}.`
  };
}

function quellenhinweisFelder(value, displayedUrl) {
  const sourceNotice = parlamentsdatenQuellenhinweis(value);
  if (sourceNotice && displayedUrl) {
    const canonical = require("./dedup").canonicalizeUrl;
    if (canonical(displayedUrl) !== canonical(sourceNotice.articleUrl)) return {};
    sourceNotice.articleUrl = displayedUrl;
  }
  return sourceNotice ? { sourceNotice } : {};
}

module.exports = { BOT_USER_AGENT, artikelKennung, baueParlamentsdatenHerkunft,
  leseParlamentsdatenHerkunft, istParlamentsdatenDokument, parlamentsdatenQuellenhinweis, quellenhinweisFelder,
  istBundespulsBeleg, bewertungsprojektion, unabhaengigeBelegzahl };
