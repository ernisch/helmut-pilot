"use strict";

// Kurzer Originalkontext fuer bereits gespeicherte, eindeutig gebundene Artikel.
// Kein Modell, kein Volltextspeicher und keine Ersatzquelle aus einer KO-Analyse.
const D = require("./dedup");
const MAX = 240;
function plain(value) {
  const entities = { amp: "&", quot: '"', apos: "'", nbsp: " ", auml: "ä", ouml: "ö", uuml: "ü",
    Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", ndash: "–", mdash: "—", bdquo: "„", ldquo: "“", rdquo: "”" };
  return String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, key) => {
      if (!key.startsWith("#")) return entities[key] ?? whole;
      const n = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }).replace(/\s+/g, " ").trim();
}
function words(value) { return plain(value).toLocaleLowerCase("de").match(/[\p{L}\p{N}]{3,}/gu) || []; }
function institutionellerMetatext(value) {
  const s = plain(value).toLocaleLowerCase("de");
  if (!s) return false;
  return /\b(?:willkommen auf|auf dieser seite finden sie|hier finden sie informationen|wir informieren (?:sie )?über)\b/u.test(s)
    || /\b(?:das|die) (?:bundesministerium|ministerium|behörde|verwaltung|bundesamt)\b.{0,100}\b(?:ist zuständig|informiert über seine aufgaben|stellt sich vor|arbeitet für|engagiert sich für)\b/u.test(s);
}
// Cookie-/JavaScript-/Zugriffs-/Login-Hinweise sind Bedienmetatext, kein
// Artikelauszug. Derselbe Praedikat-Helfer gilt im excerpt() UND im
// Lage-Kartenpfad, damit solche Störtexte keine freie KO-Prosa freischalten.
function stoertext(value) {
  // Beide Aufrufer liefern bereits normalisierten Text. Nicht erneut HTML
  // dekodieren: excerpt() behaelt damit exakt seinen bisherigen Vertrag.
  return /cookie|javascript|zugriff verweigert|access denied|enable cookies|abonnieren sie|jetzt anmelden|datenschutzeinstellungen/iu.test(String(value || ""));
}
function titleMatches(actual, expected) {
  const a = new Set(words(actual)), e = new Set(words(expected));
  if (a.size < 3 || e.size < 3) return false;
  const same = [...a].filter(w => e.has(w)).length;
  return same >= 3 && same / Math.min(a.size, e.size) >= 0.75;
}
function satzpraefix(text, max = MAX) {
  // Auch kurze Publisher Metadaten koennen mitten im Wort enden. Eine
  // vorhandene Ellipse oder ein Titel wie Dr. ist keine Satzgrenze.
  let ende = 0;
  for (const m of text.matchAll(/[.!?][”"“'’»)]*(?=\s|$)/gu)) {
    const bis = m.index + m[0].length;
    if (bis > max) break;
    if (m[0][0] === ".") {
      if (text[m.index - 1] === ".") continue;
      const wort = /([\p{L}\p{N}]+)\.$/u.exec(text.slice(0, m.index + 1))?.[1] || "";
      if (/^(?:\p{L}|\d+|Dr|Prof|Dipl|Ing|bzw|ca|Nr|Abs|Art|Mio|Mrd|Str|usw|etc)$/iu.test(wort)) continue;
      if (/^[\p{Ll}]/u.test(text.slice(bis).trimStart())) continue;
    }
    ende = bis;
  }
  return text.slice(0, ende);
}
function excerpt(value, title) {
  let text = plain(value);
  if (institutionellerMetatext(text)) return null;
  text = satzpraefix(text);
  if (text.length < 60 || text.length > MAX) return null;
  const extra = words(text).filter(w => !new Set(words(title)).has(w));
  if (new Set(extra).size < 5) return null;
  if (stoertext(text)) return null;
  return text;
}
function geleseneQuelle(document) {
  if (!document || !Object.hasOwn(document, "quellenauszug_beleg")) return document;
  // Nur der kleine Herkunftsbeleg wird projiziert, keine fremden Rohmetadaten.
  // Gespeicherte Originale bleiben unveraendert. Fuer alle Verbraucher gilt
  // derselbe Vertrag wie bei einer neuen Uebernahme aus diesem Quellenpfad.
  const { quellenauszug_beleg: beleg, ...quelle } = document;
  if (beleg?.status === "ergaenzt") quelle.summary = excerpt(quelle.summary, quelle.title);
  // An der bekannten alten Speichergrenze koennen auch RSS Auszuege vom
  // Motor abgeschnitten worden sein. Kurze freie RSS Kontexte sind kein
  // Beweis eines Abbruchs und werden nicht pauschal verworfen.
  else if (typeof quelle.summary === "string" && quelle.summary.length === MAX)
    quelle.summary = satzpraefix(quelle.summary) || null;
  return quelle;
}
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)]
    .map(m => [m[1].toLowerCase(), plain(m[2] ?? m[3] ?? m[4])]));
}
function fromHtml(document, response) {
  const expected = new Set([document.canonical_url, document.url].filter(Boolean).map(D.canonicalizeUrl));
  const final = D.canonicalizeUrl(response?.finalUrl);
  if (!final || !expected.has(final)) return { ok: false, reason: "artikelziel-abweichend" };
  const html = String(response.body || "");
  if (!html || html.length > 10 * 1024 * 1024) return { ok: false, reason: "artikelantwort-ungueltig" };
  const metas = [...html.matchAll(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(m => attrs(m[0]));
  const links = [...html.matchAll(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)].map(m => attrs(m[0]));
  const canonical = links.find(l => l.rel?.toLowerCase() === "canonical")?.href;
  if (canonical) {
    let resolved;
    try { resolved = D.canonicalizeUrl(new URL(canonical, response.finalUrl).href); } catch { return { ok: false, reason: "artikelziel-abweichend" }; }
    if (!expected.has(resolved)) return { ok: false, reason: "artikelziel-abweichend" };
  }
  const meta = key => metas.find(m => (m.property || m.name || "").toLowerCase() === key)?.content;
  const title = meta("og:title") || plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);
  if (!titleMatches(title, document.title)) return { ok: false, reason: "artikeltitel-abweichend" };
  for (const key of ["og:description", "description", "twitter:description"]) {
    const summary = excerpt(meta(key), document.title);
    if (summary) return { ok: true, summary, origin: "artikel-metadaten", method: key, finalUrl: response.finalUrl };
  }
  return { ok: false, reason: "kein-belastbarer-artikelauszug" };
}
function fromMirror(document, items) {
  for (const item of items || []) {
    const row = D.toRawDocumentRow(item);
    if (!row || row.id !== document.id || !titleMatches(row.title, document.title)
      || Date.parse(row.published_at) !== Date.parse(document.published_at)) continue;
    for (const value of [item.summary, item.content, item.excerpt]) {
      const summary = excerpt(value, document.title);
      if (summary) return { ok: true, summary, origin: "gespeicherter-rohspiegel", method: "identische-quellkennung", finalUrl: row.canonical_url };
    }
  }
  return { ok: false, reason: "kein-belastbarer-rohauszug" };
}
module.exports = { MAX, plain, excerpt, satzpraefix, geleseneQuelle, institutionellerMetatext, stoertext, titleMatches, fromHtml, fromMirror };
