"use strict";

// Helmut — strenger, rein lokaler Fundstellenleser fuer den amtlichen RSS-Feed der
// Pressemitteilungen des Landtages Brandenburg.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Brandenburg): Der Landtag
// Brandenburg veroeffentlicht seine aktuellen Pressemitteilungen auch als RSS 2.0 unter
//   Anfrage-URL https://www.landtag.brandenburg.de/cms/detail.php?template=lt_rss_presse_d
//   final nach Redirect https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_d
// Beobachtet am 28.09.2026: HTTP200, ein Kanal "Landtag Brandenburg - Pressemitteilungen",
// 15 Items. Jedes Item traegt genau Titel (CDATA), link, guid (= link), author
// ("brandenburg_01.c.<nr>.de (<nr>)") und einen RFC-822-pubDate mit explizitem Offset
// (z.B. "Wed, 23 Sep 2026 12:42:00 +0200"). Die Item-Adresse ist eine sixcms-Weiche
// ".../sixcms/detail.php?id=brandenburg_01.c.<nr>.de"; der amtliche Artikel selbst liegt
// unter dem kanonischen Pfad /de/meldungen/<slug>/<nr> (siehe brandenburg-landtag-presseartikel.js).
//
// ZWEI GETRENNTE EBENEN:
//   1. pruefePresseRss(eingabe) — liest NUR den uebergebenen String samt HTTP-Status und
//      Anfrage-/finaler Adresse. Liefert Kanal und Items. Der UTC-Zeitpunkt erscheint hier
//      NICHT.
//   2. bindeRssItemAnArtikel(item, artikel) — bindet GENAU EIN Item an die Ausgabe von
//      pruefePresseartikel(...) des bestehenden Artikellesers: Nummer am kanonischen Pfad,
//      exakt gleicher Titel und gleicher LOKALER Publikationstag. ERST dann erscheint der
//      explizite RSS-Zeitpunkt als UTC ISO 8601.
//
// Fail closed: falscher/doppelter/versteckter/fremder Inhalt bricht ab. Ein
// <lastBuildDate> ist KEINE Artikelpublikation und wird nie als solche gelesen. Der
// lokale Tag des pubDate (Offset +0200) und der UTC-Kalendertag koennen auseinanderfallen;
// verglichen wird ausschliesslich der lokale Tag, die UTC-Angabe entsteht erst nach der
// Artikelbindung.
//
// Keine neue Abhaengigkeit, kein DOM-/XML-Paket: eigener kommentar-, CDATA- und
// Pi-bewusster Tokenleser. Elementgrenzen werden ueber die zugehoerigen schliessenden
// Auszeichnungen derselben Verschachtelungstiefe bestimmt, nicht ueber offene Regexe.
//
// KEIN Netzwerk, KEINE Datei-, DB-, Modell- oder Productionwirkung.

const { AUSGANG_FELDER: ARTIKEL_FELDER } = require("./brandenburg-landtag-presseartikel");

const VERSION = "brandenburg-landtag-presse-rss-v1";
const MAX_RSS_BYTES = 1024 * 1024;

const ANFRAGE_URL = "https://www.landtag.brandenburg.de/cms/detail.php?template=lt_rss_presse_d";
const FINALE_URL = "https://www.landtag.brandenburg.de/cms/detail.php?template=ltbrb_rss_d";
const KANAL_TITEL = "Landtag Brandenburg - Pressemitteilungen";

const HOSTS = new Set(["landtag.brandenburg.de", "www.landtag.brandenburg.de"]);

// Item-Adresse (Weiche): genau "brandenburg_01.c.<nr>.de" auf dem amtlichen Host.
const LINK_RE = /^https:\/\/www\.landtag\.brandenburg\.de\/sixcms\/detail\.php\?id=brandenburg_01\.c\.(\d{1,10})\.de$/;
// Autor: "brandenburg_01.c.<nr>.de (<nr>)".
const AUTHOR_RE = /^brandenburg_01\.c\.(\d{1,10})\.de \((\d{1,10})\)$/;
// Kanonischer Artikelpfad des bestehenden Artikellesers.
const ARTIKEL_PFAD_RE = /^\/de\/meldungen\/[A-Za-z0-9._:!$&'()*+,;=@~-]+\/(\d{1,10})$/;
// RFC 822 pubDate mit EXPLIZITEM numerischem Offset; benannte Zonen (GMT/UT/Z) sind verboten.
const RFC_PUBDATE = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2}):?(\d{2})$/;
const TAG_TAG = /^(\d{4})-(\d{2})-(\d{2})$/;

const WOCHENTAGE = Object.freeze(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const MONATE_EN = Object.freeze({ Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 });

const EINGANG_FELDER = Object.freeze(["finalUrl", "http", "rss", "url"]);
const KANAL_FELDER = Object.freeze(["link", "titel"]);
const ITEM_FELDER = Object.freeze(["author", "guid", "link", "nummer", "pubDate",
  "publikationstag", "titel"]);
const AUSGANG_FELDER = Object.freeze(["items", "kanal", "version"]);
const BINDUNG_FELDER = Object.freeze(["author", "guid", "link", "nummer", "pubDate",
  "publikationstag", "publikationszeitpunktUtc", "titel", "url"]);
const ARTIKEL_FELDER_SORTIERT = Object.freeze([...ARTIKEL_FELDER].sort());
const KANAL_KINDER = new Set(["title", "link", "description", "lastBuildDate", "item"]);
const ITEM_KINDER = new Set(["title", "link", "guid", "pubDate", "author", "description"]);

function fordere(ok, grund) { if (!ok) throw new Error("brandenburg-landtag-presse-rss-" + grund); }
const alsFeldliste = felder => Object.keys(felder).sort().join(",");

// ---------------------------------------------------------------------------------------------
// Text und Entitaeten
// ---------------------------------------------------------------------------------------------
const ENTITAETEN = Object.freeze({ amp: "&", quot: "\"", apos: "'", nbsp: "\u00a0", lt: "<",
  gt: ">", auml: "\u00e4", ouml: "\u00f6", uuml: "\u00fc", Auml: "\u00c4", Ouml: "\u00d6",
  Uuml: "\u00dc", szlig: "\u00df", ndash: "\u2013", mdash: "\u2014", bdquo: "\u201e",
  ldquo: "\u201c", rdquo: "\u201d", sbquo: "\u201a", lsquo: "\u2018", copy: "\u00a9" });

function dekodiere(value) {
  return String(value == null ? "" : value).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, key) => {
      if (!key.startsWith("#")) return Object.hasOwn(ENTITAETEN, key) ? ENTITAETEN[key] : whole;
      const n = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
    });
}

// ---------------------------------------------------------------------------------------------
// Kalendertag und RFC-PubDate
// ---------------------------------------------------------------------------------------------
function tagDesWerts(value) {
  if (typeof value !== "string") return null;
  const m = TAG_TAG.exec(value);
  if (!m) return null;
  const jahr = Number(m[1]), monat = Number(m[2]), tag = Number(m[3]);
  const schaltjahr = jahr % 4 === 0 && (jahr % 100 !== 0 || jahr % 400 === 0);
  const tage = [31, schaltjahr ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (monat < 1 || monat > 12 || tag < 1 || tag > tage[monat - 1]) return null;
  return value;
}

// Liefert { pubDate, publikationstag, offsetMinuten, epoch } oder null. Der lokale Tag ist
// die geschriebene Kalenderangabe im angegebenen Offset; UTC entsteht erst aus dem Offset.
function parseRfcPubDate(wert) {
  const m = RFC_PUBDATE.exec(wert == null ? "" : String(wert));
  if (!m) return null;
  const [, wochentag, tag, monName, jahr, std, minute, sekunde, vorzeichen, offStd, offMin] = m;
  if (!Object.hasOwn(MONATE_EN, monName)) return null;
  const monat = MONATE_EN[monName];
  const tagStr = `${jahr}-${String(monat + 1).padStart(2, "0")}-${String(Number(tag)).padStart(2, "0")}`;
  if (!tagDesWerts(tagStr)) return null;
  const h = Number(std), mi = Number(minute), s = Number(sekunde);
  if (h > 23 || mi > 59 || s > 59) return null;
  const oStd = Number(offStd), oMin = Number(offMin);
  if (oStd > 14 || oMin > 59 || (oStd === 14 && oMin !== 0)) return null;
  const offsetMinuten = (vorzeichen === "-" ? -1 : 1) * (oStd * 60 + oMin);
  const berechnet = WOCHENTAGE[new Date(Date.UTC(Number(jahr), monat, Number(tag))).getUTCDay()];
  if (berechnet !== wochentag) return null;
  const epoch = Date.UTC(Number(jahr), monat, Number(tag), h, mi, s) - offsetMinuten * 60000;
  return { pubDate: wert, publikationstag: tagStr, offsetMinuten, epoch };
}

// ---------------------------------------------------------------------------------------------
// Kommentar-, CDATA- und Pi-bewusster Tokenleser
// ---------------------------------------------------------------------------------------------
// Sichtbare Fassung: Kommentare und CDATA-Rumpf entfernt. Jede Struktur, die NUR dort
// existiert, laesst die Markerzaehlung von der Rohfassung abweichen und bricht ab.
function sichtbareFassung(rss) {
  return rss.replace(/<!--[\s\S]*?-->/g, " ").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ");
}

const STRUKTUR_MARKER = Object.freeze([
  /<rss\b/gi,
  /<\/rss\s*>/gi,
  /<channel\b/gi,
  /<\/channel\s*>/gi,
  /<item\b/gi,
  /<\/item\s*>/gi,
  /<title\b/gi,
  /<link\b/gi,
  /<guid\b/gi,
  /<pubDate\b/gi,
  /<author\b/gi
]);
const zaehle = (text, re) => (text.match(new RegExp(re.source, re.flags)) || []).length;
function fordereKeineVersteckten(rss, sichtbar) {
  for (const marker of STRUKTUR_MARKER) {
    fordere(zaehle(sichtbar, marker) === zaehle(rss, marker), "versteckter-doppler");
  }
}

function leseAttribute(tagText) {
  const attrs = {};
  const kern = tagText.replace(/^<\s*\/?\s*[a-zA-Z_][\w:.-]*/i, "").replace(/\/?\s*>$/, "");
  let i = 0;
  while (i < kern.length) {
    while (i < kern.length && /\s/.test(kern[i])) i++;
    if (i >= kern.length) break;
    let start = i;
    while (i < kern.length && !/[\s=]/.test(kern[i])) i++;
    const name = kern.slice(start, i).toLowerCase();
    if (!name) { i++; continue; }
    while (i < kern.length && /\s/.test(kern[i])) i++;
    let wert = "";
    if (kern[i] === "=") {
      i++;
      while (i < kern.length && /\s/.test(kern[i])) i++;
      const anfuehrung = kern[i];
      if (anfuehrung === "\"" || anfuehrung === "'") {
        i++;
        start = i;
        while (i < kern.length && kern[i] !== anfuehrung) i++;
        wert = kern.slice(start, i);
        i++;
      } else {
        start = i;
        while (i < kern.length && !/\s/.test(kern[i])) i++;
        wert = kern.slice(start, i);
      }
    }
    if (!Object.hasOwn(attrs, name)) attrs[name] = dekodiere(wert);
  }
  return attrs;
}

function tokenisiere(rss) {
  const tags = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\s*(\/?)\s*([a-zA-Z_][\w:.-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (const m of rss.matchAll(re)) {
    const text = m[0];
    if (text.startsWith("<!--")) { tags.push({ art: "kommentar", index: m.index, ende: m.index + text.length, text }); continue; }
    if (text.startsWith("<![CDATA[")) { tags.push({ art: "cdata", index: m.index, ende: m.index + text.length, text }); continue; }
    if (text.startsWith("<?")) { tags.push({ art: "pi", index: m.index, ende: m.index + text.length, text }); continue; }
    // Elementnamen bleiben in ihrer exakten Schreibweise: XML ist case-sensitiv, ein
    // abweichend geschriebenes Element passt zu keinem Muster und bricht ab.
    tags.push({ art: m[1] === "/" ? "ende" : "start", name: m[2], index: m.index,
      ende: m.index + text.length, selbstschliessend: /\/\s*>$/.test(text), text,
      attrs: leseAttribute(text) });
  }
  return tags;
}

const istStruktur = tag => tag.art === "start" || tag.art === "ende";
const tagsImBereich = (tags, von, bis) => tags.filter(tag => tag.index >= von && tag.index < bis);

function elemente(tags, name, filter) {
  const out = [];
  for (const tag of tags) {
    if (tag.art !== "start" || (name && tag.name !== name)) continue;
    if (filter && !filter(tag.attrs, tag)) continue;
    out.push(tag);
  }
  return out;
}

// Belegte Grenze: zum oeffnenden Tag die zugehoerige schliessende Auszeichnung derselben
// Verschachtelungstiefe. Fehlt sie, ist die Grenze nicht belegbar => null (fail closed).
function spanVon(tags, rss, start, name) {
  let tiefe = 0, startTag = null, endeTag = null;
  for (const tag of tags) {
    if (tag.index < start || !istStruktur(tag) || tag.name !== name) continue;
    if (tag.art === "ende") {
      if (!startTag || tiefe <= 0) return null;
      tiefe--;
      if (tiefe === 0) { endeTag = tag; break; }
    } else {
      if (tag.selbstschliessend) return null;
      if (!startTag) startTag = tag;
      tiefe++;
    }
  }
  if (!startTag || !endeTag) return null;
  return { start: startTag.index, end: endeTag.ende, inhaltStart: startTag.ende,
    inhaltEnde: endeTag.index, inner: rss.slice(startTag.index, endeTag.ende),
    inhalt: rss.slice(startTag.ende, endeTag.index) };
}

// Direkte Kindelemente eines geschlossenen Bereichs; Kommentare/CDATA/Pi zaehlen nicht.
function direkteKinder(tags, span) {
  const out = [];
  let tiefe = 0;
  for (const tag of tagsImBereich(tags, span.start, span.end)) {
    if (!istStruktur(tag)) continue;
    if (tag.art === "ende") { tiefe--; continue; }
    if (tiefe === 1) out.push(tag);
    if (!tag.selbstschliessend) tiefe++;
  }
  return out;
}

// Textinhalt eines einfachen Kindelements. Genau ein Text/CDATA-Block, kein verschachteltes
// Element, keine Kommentar-Doppelung, kein Markup. Whitespace wird zusammengezogen und
// aussen getrimmt (identisch zur Textnormalisierung des Artikellesers).
function textInhalt(tags, rss, tag, name) {
  const span = spanVon(tags, rss, tag.index, tag.name);
  fordere(span, name + "-nicht-geschlossen");
  for (const t of tagsImBereich(tags, span.inhaltStart, span.inhaltEnde)) {
    if (t.art === "kommentar") fordere(false, name + "-versteckt");
    if (istStruktur(t)) fordere(false, name + "-verschachtelt");
  }
  const cdata = [...span.inhalt.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)];
  fordere(cdata.length <= 1, name + "-mehrdeutig");
  let roh = span.inhalt;
  if (cdata.length === 1) {
    fordere(/^\s*$/.test(span.inhalt.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, " ")), name + "-fremdinhalt");
    roh = cdata[0][1];
  }
  const text = dekodiere(roh);
  fordere(!text.includes("<") && !text.includes(">"), name + "-markup");
  return text.replace(/\s+/gu, " ").trim();
}

function nurPiUndLeerraum(text) {
  return /^\s*$/.test(text.replace(/<\?[\s\S]*?\?>/g, " ").replace(/<!--[\s\S]*?-->/g, " "));
}

// ---------------------------------------------------------------------------------------------
// Ebene 1 — reiner RSS-Leser
// ---------------------------------------------------------------------------------------------
function pruefePresseRss(eingabe) {
  fordere(eingabe && typeof eingabe === "object" && !Array.isArray(eingabe), "eingabe-ungueltig");
  fordere(alsFeldliste(eingabe) === EINGANG_FELDER.join(","), "eingabefelder-ungueltig");

  const { url, finalUrl, http, rss } = eingabe;
  fordere(Number.isInteger(http) && http === 200, "http-nicht-ok");
  fordere(typeof rss === "string" && rss.length > 0, "rss-fehlt");
  fordere(Buffer.byteLength(rss, "utf8") <= MAX_RSS_BYTES, "rss-zu-gross");

  // Anfrage- und finale Adresse exakt: belegter Redirect bzw. direkter Abruf der finalen
  // Feed-Adresse. Jede andere Adresse bricht ab.
  fordere(url === ANFRAGE_URL || url === FINALE_URL, "url-ungueltig");
  fordere(finalUrl === FINALE_URL, "finalurl-ungueltig");

  const sichtbar = sichtbareFassung(rss);
  fordereKeineVersteckten(rss, sichtbar);
  const tags = tokenisiere(rss);

  // Genau ein Wurzelelement <rss version="2.0">; ausserhalb nur Pi/Kommentar/Leerraum.
  const rssTags = elemente(tags, "rss");
  fordere(rssTags.length === 1, "rss-mehrdeutig-oder-fehlend");
  fordere(rssTags[0].attrs.version === "2.0", "rss-version-ungueltig");
  const rssSpan = spanVon(tags, rss, rssTags[0].index, "rss");
  fordere(rssSpan, "rss-nicht-geschlossen");
  fordere(nurPiUndLeerraum(rss.slice(0, rssSpan.start)), "fremdinhalt-ausserhalb-rss");
  fordere(nurPiUndLeerraum(rss.slice(rssSpan.end)), "fremdinhalt-ausserhalb-rss");

  // Genau ein Kanal als einziges Kind des Wurzelelements.
  const rssKinder = direkteKinder(tags, rssSpan);
  fordere(rssKinder.length === 1 && rssKinder[0].name === "channel", "fremdinhalt-in-rss");
  const kanalSpan = spanVon(tags, rss, rssKinder[0].index, "channel");
  fordere(kanalSpan && kanalSpan.end <= rssSpan.end, "kanal-nicht-geschlossen");

  const kanalKinder = direkteKinder(tags, kanalSpan);
  for (const kind of kanalKinder) fordere(KANAL_KINDER.has(kind.name), "kanal-fremdfeld");
  const kanalTitelTags = kanalKinder.filter(tag => tag.name === "title");
  const kanalLinkTags = kanalKinder.filter(tag => tag.name === "link");
  fordere(kanalTitelTags.length === 1, "kanal-titel-mehrdeutig-oder-fehlend");
  fordere(kanalLinkTags.length === 1, "kanal-link-mehrdeutig-oder-fehlend");
  const kanalTitel = textInhalt(tags, rss, kanalTitelTags[0], "kanal-titel");
  fordere(kanalTitel === KANAL_TITEL, "kanal-titel-abweichend");
  const kanalLink = textInhalt(tags, rss, kanalLinkTags[0], "kanal-link");
  fordere(kanalLink === finalUrl, "kanal-link-abweichend");

  // Items: genau die direkten <item>-Kinder des Kanals, saubere Grenzen, eindeutige IDs.
  const itemTags = kanalKinder.filter(tag => tag.name === "item");
  fordere(itemTags.length >= 1, "item-fehlend");
  const items = [];
  const gesehenGuid = new Set();
  const gesehenNummer = new Set();
  for (const itemTag of itemTags) {
    const itemSpan = spanVon(tags, rss, itemTag.index, "item");
    fordere(itemSpan && itemSpan.end <= kanalSpan.end, "item-nicht-geschlossen");
    const kinder = direkteKinder(tags, itemSpan);
    for (const kind of kinder) fordere(ITEM_KINDER.has(kind.name), "item-fremdfeld");
    const je = name => kinder.filter(tag => tag.name === name);
    const titelTags = je("title"), linkTags = je("link"), guidTags = je("guid");
    const pubTags = je("pubDate"), authorTags = je("author");
    fordere(titelTags.length === 1, "item-titel-mehrdeutig-oder-fehlend");
    fordere(linkTags.length === 1, "item-link-mehrdeutig-oder-fehlend");
    fordere(guidTags.length === 1, "item-guid-mehrdeutig-oder-fehlend");
    fordere(pubTags.length === 1, "item-pubdate-mehrdeutig-oder-fehlend");
    fordere(authorTags.length === 1, "item-author-mehrdeutig-oder-fehlend");
    fordere(je("description").length <= 1, "item-description-mehrdeutig");

    const titel = textInhalt(tags, rss, titelTags[0], "item-titel");
    fordere(titel.length > 0, "item-titel-leer");
    const link = textInhalt(tags, rss, linkTags[0], "item-link");
    const linkTreffer = LINK_RE.exec(link);
    fordere(linkTreffer, "item-link-ungueltig");
    const guid = textInhalt(tags, rss, guidTags[0], "item-guid");
    fordere(guid === link, "item-guid-abweichend");
    const author = textInhalt(tags, rss, authorTags[0], "item-author");
    const authorTreffer = AUTHOR_RE.exec(author);
    fordere(authorTreffer, "item-author-ungueltig");
    const nummer = linkTreffer[1];
    fordere(authorTreffer[1] === nummer && authorTreffer[2] === nummer, "item-author-abweichend");

    const pubDate = textInhalt(tags, rss, pubTags[0], "item-pubdate");
    const pub = parseRfcPubDate(pubDate);
    fordere(pub, "item-pubdate-ungueltig");

    fordere(!gesehenGuid.has(guid), "item-guid-doppelt");
    fordere(!gesehenNummer.has(nummer), "item-nummer-doppelt");
    gesehenGuid.add(guid);
    gesehenNummer.add(nummer);
    items.push(Object.freeze({ nummer, titel, link, guid, author, pubDate: pub.pubDate,
      publikationstag: pub.publikationstag }));
  }

  const ergebnis = { version: VERSION, kanal: Object.freeze({ titel: kanalTitel, link: kanalLink }),
    items: Object.freeze(items) };
  fordere(alsFeldliste(ergebnis) === AUSGANG_FELDER.join(",")
    && alsFeldliste(ergebnis.kanal) === KANAL_FELDER.join(","), "ergebnis-ungueltig");
  return Object.freeze(ergebnis);
}

// ---------------------------------------------------------------------------------------------
// Ebene 2 — Bindung EINES Items an die Ausgabe des bestehenden Artikellesers
// ---------------------------------------------------------------------------------------------
function pruefeArtikelUrl(value, nummer) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1];
  if (!authority || authority.includes(":")) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const treffer = ARTIKEL_PFAD_RE.exec(url.pathname);
  if (!treffer || treffer[1] !== nummer) return null;
  if (url.pathname.includes("..") || url.pathname.includes("%") || url.pathname.includes("\\")) return null;
  if (url.href !== value) return null;
  return url;
}

// Erst wenn Nummer am kanonischen Pfad, Titel UND lokaler Publikationstag exakt stimmen,
// darf der explizite RSS-Zeitpunkt als UTC ISO 8601 erscheinen.
function bindeRssItemAnArtikel(item, artikel) {
  fordere(item && typeof item === "object" && !Array.isArray(item), "item-ungueltig");
  fordere(alsFeldliste(item) === ITEM_FELDER.join(","), "item-ungueltig");
  fordere(artikel && typeof artikel === "object" && !Array.isArray(artikel), "artikel-ungueltig");
  fordere(alsFeldliste(artikel) === ARTIKEL_FELDER_SORTIERT.join(","), "artikel-ungueltig");

  fordere(typeof item.nummer === "string" && /^\d{1,10}$/.test(item.nummer), "nummer-ungueltig");
  const linkTreffer = LINK_RE.exec(item.link);
  const authorTreffer = AUTHOR_RE.exec(item.author);
  fordere(linkTreffer && linkTreffer[1] === item.nummer && item.guid === item.link
    && authorTreffer && authorTreffer[1] === item.nummer && authorTreffer[2] === item.nummer,
  "item-identitaet-widerspruch");
  fordere(pruefeArtikelUrl(artikel.url, item.nummer), "pfad-widerspruch");
  fordere(typeof artikel.titel === "string" && artikel.titel === item.titel, "titel-widerspruch");
  fordere(tagDesWerts(artikel.publikationstag) === artikel.publikationstag, "tag-ungueltig");
  fordere(item.publikationstag === artikel.publikationstag, "tag-widerspruch");

  const pub = parseRfcPubDate(item.pubDate);
  fordere(pub, "pubdate-ungueltig");
  fordere(pub.publikationstag === item.publikationstag, "pubdate-tag-widerspruch");

  const ergebnis = { url: artikel.url, nummer: item.nummer, titel: artikel.titel,
    publikationstag: artikel.publikationstag,
    publikationszeitpunktUtc: new Date(pub.epoch).toISOString(), guid: item.guid,
    link: item.link, author: item.author, pubDate: item.pubDate };
  fordere(alsFeldliste(ergebnis) === BINDUNG_FELDER.join(","), "bindung-ungueltig");
  return Object.freeze(ergebnis);
}

module.exports = { VERSION, ANFRAGE_URL, FINALE_URL, KANAL_TITEL, EINGANG_FELDER,
  AUSGANG_FELDER, KANAL_FELDER, ITEM_FELDER, BINDUNG_FELDER, pruefePresseRss,
  bindeRssItemAnArtikel };
