"use strict";

// Helmut — strenger, rein lokaler Parser fuer amtliche Berlin.de-Presseartikel.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Berlin): Berlin.de liefert
// Presseartikel ueber das Pressearchiv. Ein amtlicher Hauptartikel nennt seinen
// Publikationstag als dcterms.date (reiner Kalendertag YYYY-MM-DD), seine eigene, stabile
// Adresse als rel=canonical und traegt seinen Volltext in genau einer geschlossenen
// section.modul-text_bild VOR dem Randbereich (marginal). Der Randbereich enthaelt den
// Kontaktblock und gehoert NICHT zum Artikeltext. Eine belastbare Uhrzeit liefert die
// Quelle fuer den Volltext nicht; dieses Modul fuehrt deshalb bewusst kein published_at
// und erfindet keine Uhrzeit.
//
// Vertrag (pruefePresseartikel):
//   Eingang: { url, finalUrl, http, html } — genau diese vier Felder, keine anderen.
//   Ausgang: { url, titel, publikationstag, volltext, volltextHash, htmlHash } (eingefroren).
//
// Fail closed: fehlende, doppelte oder unterschiedliche Felder brechen ab. Skripte,
// Kommentare und versteckte Doppelungen duerfen keine Artikelstruktur beisteuern.
//
// Keine neue Abhaengigkeit, kein DOM-Paket: HTML wird mit einem eigenen, kommentar- und
// skriptbewussten Tokenleser ausgewertet. Die Grenze des Hauptartikels wird ueber die
// zugehoerige schliessende Auszeichnung bestimmt (nicht ueber eine offene Regex) und
// damit belegbar abgegrenzt.
//
// KEIN Netzwerk, KEINE Datei-, DB-, Modell- oder Productionwirkung.

const crypto = require("node:crypto");

const VERSION = "berlin-presseartikel-v1";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const HASH_64 = /^[a-f0-9]{64}$/;
const TAG_TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const BERLIN_HOSTS = new Set(["berlin.de", "www.berlin.de"]);
const PRESSEARCHIV_JAHR = /(?:^|\/)pressearchiv-(\d{4})(?:\/|$)/;
const PRESSE_DATEINAME = /\/pressemitteilung\.[0-9]+\.php$/;
const EINGANG_FELDER = ["finalUrl", "html", "http", "url"];
const AUSGANG_FELDER = Object.freeze(["url", "titel", "publikationstag", "volltext", "volltextHash", "htmlHash"]);

const hash = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
function fordere(ok, grund) { if (!ok) throw new Error("berlin-presseartikel-" + grund); }

// ---------------------------------------------------------------------------------------------
// Text und Entitaeten
// ---------------------------------------------------------------------------------------------
const ENTITAETEN = Object.freeze({ amp: "&", quot: "\"", apos: "'", nbsp: "\u00a0", lt: "<", gt: ">",
  auml: "\u00e4", ouml: "\u00f6", uuml: "\u00fc", Auml: "\u00c4", Ouml: "\u00d6", Uuml: "\u00dc",
  szlig: "\u00df", ndash: "\u2013", mdash: "\u2014", bdquo: "\u201e", ldquo: "\u201c", rdquo: "\u201d" });

function dekodiere(value) {
  return String(value == null ? "" : value).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, key) => {
    if (!key.startsWith("#")) return Object.hasOwn(ENTITAETEN, key) ? ENTITAETEN[key] : whole;
    const n = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}

// Oeffnende und schliessende Auszeichnungen; Attributwerte respektieren Anfuehrungszeichen.
const TAG = /<\/?[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
function textVon(html) {
  return dekodiere(String(html == null ? "" : html).replace(TAG, "")).replace(/\s+/gu, " ").trim();
}

// ---------------------------------------------------------------------------------------------
// Adressbindung
// ---------------------------------------------------------------------------------------------
// Nur HTTPS auf berlin.de, ohne Benutzerinfo, ohne Portangabe. Rueckgabe: geparste URL oder null.
function pruefeAmtlicheUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1];
  if (!authority || authority.includes(":")) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.port !== "") return null;
  if (!BERLIN_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url;
}

function pressearchivJahr(url) {
  const treffer = PRESSEARCHIV_JAHR.exec(url.pathname);
  if (!treffer) return null;
  if (!PRESSE_DATEINAME.test(url.pathname)) return null;
  return treffer[1];
}

// Kalendertag: genau YYYY-MM-DD, gueltiges Datum. Keine Uhrzeit, keine Rundung, keine Ableitung.
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

// ---------------------------------------------------------------------------------------------
// Kommentar-, Skript- und versteckte Doppelungen
// ---------------------------------------------------------------------------------------------
// Unbedingt unsichtbare Bloecke (Kommentar, Skript, Stil, noscript, template) werden entfernt.
// Jede Artikelstruktur, die NUR dort existiert, laesst die Markerzaehlung der sichtbaren
// Fassung von der Rohfassung abweichen und bricht fail closed ab.
function sichtbareFassung(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, " ");
}

const STRUKTUR_MARKER = Object.freeze([
  /<h1\b/gi,
  /<section\b/gi,
  /class\s*=\s*["'][^"']*\bmodul-text_bild\b/gi,
  /class\s*=\s*["'][^"']*\btextile\b/gi,
  /<meta\b[^>]*\bname\s*=\s*["']?dcterms\.date\b/gi,
  /<meta\b[^>]*\bname\s*=\s*["']?dcterms\.title\b/gi,
  /<link\b[^>]*\brel\s*=\s*["']?canonical\b/gi,
  /Pressemitteilung vom\s+\d{2}\.\d{2}\.\d{4}/gi,
  /\bid\s*=\s*["']?layout-grid__area--herounit\b/gi,
  /\bid\s*=\s*["']?layout-grid__area--maincontent\b/gi,
  /\bid\s*=\s*["']?layout-grid__area--marginal\b/gi
]);
const zaehle = (html, re) => (html.match(new RegExp(re.source, re.flags)) || []).length;
function fordereKeineVersteckten(html, sichtbar) {
  for (const marker of STRUKTUR_MARKER) {
    fordere(zaehle(sichtbar, marker) === zaehle(html, marker), "versteckter-doppler");
  }
}

function istVersteckt(attrs) {
  if (Object.hasOwn(attrs, "hidden")) return true;
  if ((attrs["aria-hidden"] || "").trim().toLowerCase() === "true") return true;
  const stil = (attrs.style || "").replace(/\s+/g, "").toLowerCase();
  return stil.includes("display:none") || stil.includes("visibility:hidden");
}

// ---------------------------------------------------------------------------------------------
// Tokenleser
// ---------------------------------------------------------------------------------------------
function leseAttribute(tagText) {
  const attrs = {};
  const kern = tagText.replace(/^<\s*\/?\s*[a-z][\w:-]*/i, "").replace(/\/?\s*>$/, "");
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

function tokenisiere(html) {
  const tags = [];
  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  for (const m of html.matchAll(re)) {
    if (m[0].startsWith("<!--")) continue;
    tags.push({ index: m.index, ende: m.index + m[0].length, schliessend: m[1] === "/",
      name: m[2].toLowerCase(), text: m[0], attrs: leseAttribute(m[0]) });
  }
  return tags;
}

function elemente(tags, name, filter) {
  const out = [];
  for (const tag of tags) {
    if (tag.schliessend || (name && tag.name !== name)) continue;
    if (filter && !filter(tag.attrs, tag)) continue;
    out.push(tag);
  }
  return out;
}

// Belegte Grenze: zum oeffnenden Tag die zugehoerige schliessende Auszeichnung derselben
// Verschachtelungstiefe. Fehlt sie, ist die Grenze nicht belegbar => null (fail closed).
function spanVon(tags, html, start, name) {
  let tiefe = 0, gefunden = false, ende = -1;
  for (const tag of tags) {
    if (tag.index < start || tag.name !== name) continue;
    if (tag.schliessend) {
      tiefe--;
      if (tiefe < 0) return null;
      if (gefunden && tiefe === 0) { ende = tag.ende; break; }
    } else {
      tiefe++;
      gefunden = true;
    }
  }
  if (ende < 0) return null;
  return { start, end: ende, inner: html.slice(start, ende) };
}

const hatRel = (attrs, wert) => (attrs.rel || "").toLowerCase().split(/\s+/).includes(wert);
const hatKlasse = (attrs, wert) => (attrs.class || "").split(/\s+/).includes(wert);

function metaWerte(tags, name) {
  const werte = [];
  for (const tag of elemente(tags, "meta")) {
    const schluessel = [tag.attrs.name, tag.attrs.property].map(v => (v || "").toLowerCase());
    if (!schluessel.includes(name)) continue;
    werte.push((tag.attrs.content || "").trim());
  }
  return werte;
}

function bereich(tags, html, id) {
  const treffer = elemente(tags, null, attrs => attrs.id === id);
  fordere(treffer.length === 1, "bereich-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(treffer[0].attrs), "bereich-versteckt");
  const span = spanVon(tags, html, treffer[0].index, treffer[0].name);
  fordere(span, "bereich-nicht-geschlossen");
  return span;
}

function tagsImBereich(tags, span) {
  return tags.filter(tag => tag.index >= span.start && tag.index < span.end);
}

// ---------------------------------------------------------------------------------------------
// Hauptpruefung
// ---------------------------------------------------------------------------------------------
function pruefePresseartikel(eingabe) {
  fordere(eingabe && typeof eingabe === "object" && !Array.isArray(eingabe), "eingabe-ungueltig");
  const feldnamen = Object.keys(eingabe).sort();
  fordere(feldnamen.length === EINGANG_FELDER.length && feldnamen.join(",") === EINGANG_FELDER.join(","),
    "eingabefelder-ungueltig");

  const { url, finalUrl, http, html } = eingabe;
  fordere(Number.isInteger(http) && http === 200, "http-nicht-ok");
  fordere(typeof html === "string" && html.length > 0, "html-fehlt");
  fordere(Buffer.byteLength(html, "utf8") <= MAX_HTML_BYTES, "html-zu-gross");

  // Adresse: HTTPS berlin.de ohne Benutzerinfo/Port. Kanonische Adresse == finale Adresse.
  const urlTeile = pruefeAmtlicheUrl(url);
  fordere(urlTeile, "url-ungueltig");
  const finalUrlTeile = pruefeAmtlicheUrl(finalUrl);
  fordere(finalUrlTeile, "finalurl-ungueltig");
  fordere(url === finalUrl, "url-nicht-finalurl");

  const sichtbar = sichtbareFassung(html);
  fordereKeineVersteckten(html, sichtbar);
  const tags = tokenisiere(sichtbar);
  const heads = elemente(tags, "head");
  fordere(heads.length === 1, "head-mehrdeutig-oder-fehlend");
  const head = spanVon(tags, sichtbar, heads[0].index, "head");
  fordere(head, "head-nicht-geschlossen");
  const headTags = tagsImBereich(tags, head);

  const canonical = elemente(tags, "link", attrs => hatRel(attrs, "canonical"));
  fordere(canonical.length === 1, "canonical-mehrdeutig-oder-fehlend");
  fordere(headTags.includes(canonical[0]), "canonical-nicht-im-head");
  fordere(!istVersteckt(canonical[0].attrs), "canonical-versteckt");
  const canonicalHref = (canonical[0].attrs.href || "").trim();
  fordere(pruefeAmtlicheUrl(canonicalHref), "canonical-ungueltig");
  fordere(canonicalHref === finalUrl, "finalurl-nicht-canonical");

  // Jahr des pressearchiv-Pfads.
  const presseJahr = pressearchivJahr(finalUrlTeile);
  fordere(presseJahr, "pressearchiv-pfad-ungueltig");

  // Eindeutiges dcterms.date (Kalendertag), Jahr an den Archivpfad gebunden.
  const datumsWerte = metaWerte(tags, "dcterms.date");
  fordere(datumsWerte.length === 1, "dcterms.date-mehrdeutig-oder-fehlend");
  fordere(metaWerte(headTags, "dcterms.date").length === 1, "dcterms.date-nicht-im-head");
  const publikationstag = tagDesWerts(datumsWerte[0]);
  fordere(publikationstag, "dcterms.date-ungueltig");
  fordere(publikationstag.slice(0, 4) === presseJahr, "pressearchiv-jahr-abweichend");

  // Eindeutiger Titel; der sichtbare eigene H1 im Herounit muss ihn tragen.
  const titelWerte = metaWerte(tags, "dcterms.title");
  fordere(titelWerte.length === 1, "dcterms.title-mehrdeutig-oder-fehlend");
  fordere(metaWerte(headTags, "dcterms.title").length === 1, "dcterms.title-nicht-im-head");
  const titel = textVon(titelWerte[0]);
  fordere(titel.length > 0, "titel-leer");

  const h1Alle = elemente(tags, "h1");
  fordere(h1Alle.length === 1, "h1-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(h1Alle[0].attrs), "h1-versteckt");
  const herounit = bereich(tags, sichtbar, "layout-grid__area--herounit");
  fordere(h1Alle[0].index > herounit.start && h1Alle[0].index < herounit.end, "h1-nicht-im-herounit");
  const h1Span = spanVon(tags, sichtbar, h1Alle[0].index, "h1");
  fordere(h1Span, "h1-nicht-geschlossen");
  fordere(textVon(h1Span.inner) === titel, "h1-titel-abweichend");

  // Randbereich (Kontaktblock) existiert und ist vom Artikel getrennt.
  const marginal = bereich(tags, sichtbar, "layout-grid__area--marginal");
  const maincontent = bereich(tags, sichtbar, "layout-grid__area--maincontent");

  // Der Datumssatz muss in genau einem eigenen pressnumber-Absatz stehen.
  const pressnumber = elemente(tagsImBereich(tags, maincontent), "p",
    attrs => hatKlasse(attrs, "pressnumber"));
  fordere(pressnumber.length === 1, "pressemitteilung-datum-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(pressnumber[0].attrs), "pressemitteilung-datum-versteckt");
  const pressSpan = spanVon(tags, sichtbar, pressnumber[0].index, "p");
  fordere(pressSpan && pressSpan.end <= maincontent.end, "pressemitteilung-datum-nicht-geschlossen");
  const pressemitteilungen = /^Pressemitteilung vom (\d{2})\.(\d{2})\.(\d{4})$/.exec(textVon(pressSpan.inner));
  fordere(pressemitteilungen, "pressemitteilung-datum-ungueltig");
  const [, pmTag, pmMonat, pmJahr] = pressemitteilungen;
  const pmDatum = tagDesWerts(`${pmJahr}-${pmMonat}-${pmTag}`);
  fordere(pmDatum, "pressemitteilung-datum-ungueltig");
  fordere(pmDatum === publikationstag, "pressemitteilung-datum-abweichend");

  // Genau eine geschlossene section.modul-text_bild VOR marginal.
  const sections = elemente(tags, "section", attrs => hatKlasse(attrs, "modul-text_bild"));
  fordere(sections.length === 1, "modul-text_bild-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(sections[0].attrs), "modul-text_bild-versteckt");
  const section = spanVon(tags, sichtbar, sections[0].index, "section");
  fordere(section, "modul-text_bild-nicht-geschlossen");
  fordere(section.start >= maincontent.start && section.end <= maincontent.end,
    "modul-text_bild-nicht-im-maincontent");
  fordere(section.end <= marginal.start, "modul-text_bild-nicht-vor-marginal");

  // Kontaktblock gehoert nicht in den Artikel.
  const kontaktImArtikel = elemente(tagsImBereich(tags, section), "div",
    attrs => hatKlasse(attrs, "modul-contact") || attrs.id === "kontakt");
  fordere(kontaktImArtikel.length === 0, "kontaktblock-im-artikel");
  fordere(!/<\s*address\b/i.test(section.inner) && !/mailto:/i.test(section.inner), "kontaktblock-im-artikel");

  // Genau ein geschlossenes div.textile im Artikel, ohne versteckte Inhalte.
  const sectionTags = tagsImBereich(tags, section);
  const textile = elemente(sectionTags, "div", attrs => hatKlasse(attrs, "textile"));
  fordere(textile.length === 1, "textile-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(textile[0].attrs), "textile-versteckt");
  const textileSpan = spanVon(tags, sichtbar, textile[0].index, "div");
  fordere(textileSpan, "textile-nicht-geschlossen");
  fordere(textileSpan.end <= section.end, "textile-ausserhalb-artikel");
  const textileTags = tagsImBereich(tags, textileSpan);
  fordere(!/<(?:script|style|template|noscript)\b|<!--/i.test(textileSpan.inner), "skript-oder-kommentar-im-textile");
  fordere(textileTags.every(tag => !istVersteckt(tag.attrs)), "versteckter-inhalt-im-textile");

  // Roh-Gegenprobe auf der UNgekuerzten Quelle: Skripte, Stile, Vorlagen und Kommentare
  // duerfen den Artikeltext nicht verstecken. Die sichtbare Fassung entfernt solche Bloecke,
  // deshalb wird die Artikelgrenze zusaetzlich am Roh-HTML belegt.
  const rohTags = tokenisiere(html);
  const rohSections = elemente(rohTags, "section", attrs => hatKlasse(attrs, "modul-text_bild"));
  fordere(rohSections.length === 1, "roh-section-mehrdeutig-oder-fehlend");
  const rohSection = spanVon(rohTags, html, rohSections[0].index, "section");
  fordere(rohSection, "roh-section-nicht-geschlossen");
  fordere(!/<(?:script|style|template|noscript)\b|<!--/i.test(rohSection.inner), "skript-oder-kommentar-im-artikel");
  const rohTextilien = elemente(tagsImBereich(rohTags, rohSection), "div", attrs => hatKlasse(attrs, "textile"));
  fordere(rohTextilien.length === 1, "roh-textile-mehrdeutig-oder-fehlend");
  const rohTextile = spanVon(rohTags, html, rohTextilien[0].index, "div");
  fordere(rohTextile, "roh-textile-nicht-geschlossen");
  fordere(!/<(?:script|style|template|noscript)\b|<!--/i.test(rohTextile.inner), "skript-oder-kommentar-im-textile");

  // Nur Absaetze des Textile. Jeder Absatz geschlossen und sichtbar; kein Fremdinhalt.
  const absatzTags = elemente(textileTags, "p");
  fordere(absatzTags.length > 0, "absaetze-fehlend");
  const absaetze = [];
  const benutzt = [];
  for (const tag of absatzTags) {
    const span = spanVon(tags, sichtbar, tag.index, "p");
    fordere(span && span.end <= textileSpan.end, "absatz-nicht-geschlossen");
    fordere(!istVersteckt(tag.attrs), "absatz-versteckt");
    const text = textVon(span.inner);
    fordere(text.length > 0, "absatz-leer");
    absaetze.push(text);
    benutzt.push(span);
  }
  // Alles ausserhalb der Absaetze im Textile muss reine Formatierung sein. Die eigenen
  // oeffnenden und schliessenden Auszeichnungen des Textile zaehlen nicht als Fremdinhalt.
  const erstesTag = /^<[^>]*>/.exec(textileSpan.inner);
  const letztesTag = /<\/[^>]*>\s*$/.exec(textileSpan.inner);
  const inhaltStart = textileSpan.start + (erstesTag ? erstesTag[0].length : 0);
  const inhaltEnde = textileSpan.end - (letztesTag ? letztesTag[0].length : 0);
  let rest = "";
  for (let pos = inhaltStart; pos < inhaltEnde;) {
    const naechster = benutzt.find(span => span.start >= pos);
    const bis = naechster ? naechster.start : inhaltEnde;
    rest += sichtbar.slice(pos, bis);
    pos = naechster ? naechster.end : inhaltEnde;
  }
  fordere(!/<\/?[a-z]/i.test(rest), "textile-fremdinhalt");
  fordere(new Set(absaetze).size === absaetze.length, "absatz-doppler");

  const volltext = absaetze.join("\n\n") + "\n";
  const ergebnis = { url: finalUrl, titel, publikationstag, volltext,
    volltextHash: hash(volltext), htmlHash: hash(html) };
  fordere(Object.keys(ergebnis).length === AUSGANG_FELDER.length
    && HASH_64.test(ergebnis.volltextHash) && HASH_64.test(ergebnis.htmlHash), "ergebnis-ungueltig");
  return Object.freeze(ergebnis);
}

module.exports = { VERSION, AUSGANG_FELDER, pruefePresseartikel };
