"use strict";

// Helmut — kleinster, streng geschlossener, rein lokaler Entdecker fuer den amtlichen
// Senatsblock des Berliner Presseportals.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Berlin, Roadmap-Schritt vor dem
// 500er Starttor): Der strenge Artikel-Leser (lib/helmut/berlin-presseartikel.js) und der
// Einzelabruf (lib/helmut/berlin-presseartikel-abruf.js) sind fertig. Offen war bisher der
// eng begrenzte Fundweg: Welche AKTUELLEN amtlichen Senatsmeldungen verlinkt die Portalseite
// https://www.berlin.de/presse/ gerade? Das amtliche Original (28.09.2026, HTTP 200, sha256
// 1cb44dda…fac8) traegt genau EINEN relevanten Block: den sichtbaren H2
// "Aktuelle Mitteilungen des Presse- und Informationsamts und der Senatsverwaltungen" mit
// genau einer geschlossenen UL und sechs geschlossenen LI. Die nachfolgenden Bezirksaemter-
// und sonstigen Meldungen gehoeren NICHT dazu.
//
// Vertrag (pruefeSenatsblock):
//   Eingang: { url, finalUrl, http, html } — genau diese vier Felder, keine anderen.
//   Ausgang: { quelle, fundstellen } (eingefroren). Jede Fundstelle ist
//            { url, titel, publikationstag, weiterreichbar, grund }:
//            - url ist der absolut aufgeloeste amtliche https-Link auf berlin.de,
//              gebildet aus dem beobachteten relativen Link der LI.
//            - publikationstag ist der REINE Kalendertag (YYYY-MM-DD) aus der Listenspalte.
//              Die Listenuhrzeit ("13:05 Uhr") ist KEINE belegte UTC-Publikationszeit und
//              erscheint NIRGENDS im Ergebnis.
//            - weiterreichbar ist true NUR, wenn der bestehende Pressearchiv-Einzelabruf
//              (lib/helmut/berlin-presseartikel-abruf.js) ODER der Sondervorlagen-Einzelabruf
//              (lib/helmut/berlin-presse-sondervorlagen-abruf.js) diese Adresse VORAB
//              akzeptiert. `abrufzielFuer(url)` nennt pro Treffer genau das passende sichere
//              Abrufziel. Nicht unterstuetzte Berliner Artikelpfade bleiben als klar markierte,
//              NICHT abrufbare Treffer mit grund erhalten — niemals als erfolgreiche Versorgung.
//
// Fail closed: fehlende, doppelte oder unterschiedliche Eingabefelder, fremde Quelle/Port/
// Tracking/Redirect, verborgene/ausbrechende/injizierte Inhalte, mehrdeutige oder nicht
// geschlossene Strukturen sowie Duplikate brechen ab. Skripte, Kommentare und versteckte
// Doppelungen duerfen keine Fundstelle beisteuern.
//
// KEIN Netzwerk, KEINE Datei-, DB-, Modell- oder Productionwirkung. Keine politische
// Kundenfilterung, keine Profile.

const { pruefeAbrufziel } = require("./berlin-presseartikel-abruf");
const { pruefeAbrufziel: pruefeSondervorlagenAbrufziel } = require("./berlin-presse-sondervorlagen-abruf");

const VERSION = "berlin-senat-entdeckung-v1";
const KANONISCHE_QUELLE = "https://www.berlin.de/presse/";
const QUELLEN = new Set([KANONISCHE_QUELLE, "https://berlin.de/presse/"]);
const H2_TEXT = "Aktuelle Mitteilungen des Presse- und Informationsamts und der Senatsverwaltungen";
const BERLIN_ORIGIN = "https://www.berlin.de";
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_FUNDSTELLEN = 50;
const MAX_TITEL = 300;
const GRUND_PRESSEARCHIV = "pressearchiv-adresse-fehlt";
const EINGANG_FELDER = ["finalUrl", "html", "http", "url"];
const AUSGANG_FELDER = Object.freeze(["quelle", "fundstellen"]);
const FUNDSTELLE_FELDER = Object.freeze(["url", "titel", "publikationstag", "weiterreichbar", "grund"]);
const TAG_TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
function fordere(ok, grund) { if (!ok) throw new Error("berlin-senat-entdeckung-" + grund); }

// ---------------------------------------------------------------------------------------------
// Text, Entitaeten und Tokenleser (kommentar-/attributbewusst, kein DOM-Paket).
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

const TAG = /<\/?[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
function textVon(html) {
  return dekodiere(String(html == null ? "" : html).replace(TAG, "")).replace(/\s+/gu, " ").trim();
}

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

const hatKlasse = (attrs, wert) => (attrs.class || "").split(/\s+/).includes(wert);

function istVersteckt(attrs) {
  if (Object.hasOwn(attrs, "hidden")) return true;
  if ((attrs["aria-hidden"] || "").trim().toLowerCase() === "true") return true;
  const stil = (attrs.style || "").replace(/\s+/g, "").toLowerCase();
  return stil.includes("display:none") || stil.includes("visibility:hidden");
}

// ---------------------------------------------------------------------------------------------
// Kalendertag (rein) — keine Uhrzeit, keine Rundung, keine Ableitung.
// ---------------------------------------------------------------------------------------------
function tagAusDatum(value) {
  if (typeof value !== "string") return null;
  const m = TAG_TAG.exec(value);
  if (!m) return null;
  const jahr = Number(m[1]), monat = Number(m[2]), tag = Number(m[3]);
  const schaltjahr = jahr % 4 === 0 && (jahr % 100 !== 0 || jahr % 400 === 0);
  const tage = [31, schaltjahr ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (monat < 1 || monat > 12 || tag < 1 || tag > tage[monat - 1]) return null;
  return value;
}

// Listenspalte "TT.MM.JJJJ[ HH:MM Uhr]". Ausgegeben wird AUSSCHLIESSLICH der Kalendertag.
const LISTEN_DATUM = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2}) Uhr)?$/;
function tagAusListenspalte(text) {
  const m = LISTEN_DATUM.exec(text);
  if (!m) return null;
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59)) return null;
  return tagAusDatum(`${m[3]}-${m[2]}-${m[1]}`);
}

// ---------------------------------------------------------------------------------------------
// Versteckte Doppelungen und verborgene Inhalte.
// ---------------------------------------------------------------------------------------------
function sichtbareFassung(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, " ");
}

const STRUKTUR_MARKER = Object.freeze([
  /<h2\b/gi,
  /<ul\b/gi,
  /<li\b/gi,
  /<a\b/gi,
  /class\s*=\s*["'][^"']*\bmodul-rss_list\b/gi,
  /class\s*=\s*["'][^"']*\bcell\b/gi
]);
const zaehle = (html, re) => (html.match(new RegExp(re.source, re.flags)) || []).length;
function fordereKeineVersteckten(html, sichtbar) {
  for (const marker of STRUKTUR_MARKER) {
    fordere(zaehle(sichtbar, marker) === zaehle(html, marker), "versteckter-doppler");
  }
}

// ---------------------------------------------------------------------------------------------
// Amtliche Adressbindung.
// ---------------------------------------------------------------------------------------------
function pruefeQuelle(value) {
  if (typeof value !== "string" || value !== value.trim() || !QUELLEN.has(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (!/^(?:www\.)?berlin\.de$/.test(url.hostname.toLowerCase())) return null;
  if (url.pathname !== "/presse/") return null;
  return url;
}

// Streng geschlossener relativer Link: genau EIN fuehrender Slash, Pfad auf berlin.de, keine
// zweite Autoritaet, kein Schema, keine Query, kein Fragment, kein Traversal, keine Codierung.
const RELATIVER_PFAD = /^\/[a-z0-9][a-z0-9._~/-]*$/i;
function pruefeRelativenPfad(value) {
  if (typeof value !== "string" || value !== value.trim()) return null;
  if (value.startsWith("//") || value.includes("\\") || value.includes("..")) return null;
  // Keine Codierung: die belegte amtliche Form ist ein reiner ASCII-Pfad ohne Prozent-Escapes
  // (auch keine verschleierte Traversal wie %2e%2e).
  if (value.includes("%")) return null;
  if (!RELATIVER_PFAD.test(value)) return null;
  if (value.includes("?") || value.includes("#")) return null;
  return value;
}

// Amtliche Autoritaet ohne www: zwei beobachtete Fassungen desselben Portals sind passend,
// fremde Hosts/Pfade bleiben ausgeschlossen (ueber pruefeQuelle bzw. den Vergleich).
const kanonischeQuelle = url => url.hostname.toLowerCase().replace(/^www\./, "") + url.pathname;

// Das passende sichere Abrufziel EINER Fundstelle, strikt vorab und ohne Netz: entweder der
// bestehende Pressearchiv-Einzelabruf oder der Sondervorlagen-Einzelabruf. Die beiden
// Adressfamilien ueberschneiden sich nicht; passt keine, bleibt das Ergebnis null und der
// Treffer damit fail closed nicht weiterreichbar.
function abrufzielFuer(url) {
  const pressearchiv = pruefeAbrufziel(url);
  if (pressearchiv) return Object.freeze({ art: "pressearchiv", ziel: pressearchiv });
  const sondervorlage = pruefeSondervorlagenAbrufziel(url);
  if (sondervorlage) return Object.freeze({ art: "sondervorlage", ziel: sondervorlage });
  return null;
}

function freieFundstelle(pfad, titel, publikationstag) {
  const url = BERLIN_ORIGIN + pfad;
  const abrufziel = abrufzielFuer(url);
  const fundstelle = { url, titel, publikationstag,
    weiterreichbar: abrufziel !== null, grund: abrufziel ? null : GRUND_PRESSEARCHIV };
  fordere(Object.keys(fundstelle).length === FUNDSTELLE_FELDER.length, "fundstelle-ungueltig");
  return Object.freeze(fundstelle);
}

// ---------------------------------------------------------------------------------------------
// Hauptpruefung: genau ein sichtbarer H2-Block, genau eine geschlossene UL darin,
// genau deren geschlossene LI.
// ---------------------------------------------------------------------------------------------
function pruefeSenatsblock(eingabe) {
  fordere(eingabe && typeof eingabe === "object" && !Array.isArray(eingabe), "eingabe-ungueltig");
  const feldnamen = Object.keys(eingabe).sort();
  fordere(feldnamen.length === EINGANG_FELDER.length && feldnamen.join(",") === EINGANG_FELDER.join(","),
    "eingabefelder-ungueltig");

  const { url, finalUrl, http, html } = eingabe;
  fordere(Number.isInteger(http) && http === 200, "http-nicht-ok");
  fordere(typeof html === "string" && html.length > 0, "html-fehlt");
  fordere(Buffer.byteLength(html, "utf8") <= MAX_HTML_BYTES, "html-zu-gross");

  const quelleUrl = pruefeQuelle(url);
  const finalUrlGeprueft = pruefeQuelle(finalUrl);
  fordere(quelleUrl && finalUrlGeprueft, "quelle-ungueltig");
  fordere(kanonischeQuelle(quelleUrl) === kanonischeQuelle(finalUrlGeprueft), "quelle-finalurl-abweichend");

  const sichtbar = sichtbareFassung(html);
  fordereKeineVersteckten(html, sichtbar);
  const tags = tokenisiere(sichtbar);

  // Genau EIN sichtbarer H2 mit dem exakten amtlichen Text; geschlossen.
  const h2Alle = elemente(tags, "h2");
  const h2Treffer = h2Alle.map(tag => ({ tag, span: spanVon(tags, sichtbar, tag.index, "h2") }))
    .filter(eintrag => eintrag.span && textVon(eintrag.span.inner) === H2_TEXT);
  fordere(h2Treffer.length === 1, "senats-h2-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(h2Treffer[0].tag.attrs), "senats-h2-versteckt");
  const h2Span = h2Treffer[0].span;

  // Genau EIN geschlossener modul-rss_list-Block, der den H2 enthaelt.
  const bloecke = elemente(tags, "div", attrs => hatKlasse(attrs, "modul-rss_list"))
    .map(tag => ({ tag, span: spanVon(tags, sichtbar, tag.index, "div") }))
    .filter(eintrag => eintrag.span);
  const umgebende = bloecke.filter(eintrag => eintrag.span.start < h2Span.start && eintrag.span.end >= h2Span.end);
  fordere(bloecke.length === 1 && umgebende.length === 1, "senats-block-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(umgebende[0].tag.attrs), "senats-block-versteckt");
  const blockSpan = umgebende[0].span;
  // Auch ein sichtbares H2/UL/LI kann in einem versteckten Elternknoten liegen. Im
  // gesamten relevanten Block sowie in seinen Vorfahren darf deshalb kein hidden,
  // aria-hidden oder display:none stehen. Das erfasst auch verborgene Titelfragmente.
  const versteckte = elemente(tags, null, attrs => istVersteckt(attrs));
  fordere(!versteckte.some(tag => {
    const span = spanVon(tags, sichtbar, tag.index, tag.name);
    return span ? span.start < blockSpan.end && span.end > blockSpan.start
      : tag.index < blockSpan.end;
  }), "senats-block-versteckter-inhalt");

  // Genau EINE geschlossene UL im Block, NACH dem H2, ohne verschachtelte UL/LI.
  const blockTags = tags.filter(tag => tag.index >= blockSpan.start && tag.index < blockSpan.end);
  const ulAlle = elemente(blockTags, "ul").map(tag => ({ tag, span: spanVon(tags, sichtbar, tag.index, "ul") }))
    .filter(eintrag => eintrag.span);
  fordere(ulAlle.length === 1, "senats-ul-mehrdeutig-oder-fehlend");
  const ul = ulAlle[0];
  fordere(!istVersteckt(ul.tag.attrs) && ul.span.start >= h2Span.end, "senats-ul-versteckt-oder-vor-h2");
  fordere(ul.span.end <= blockSpan.end, "senats-ul-ausserhalb-block");
  // Roh-Gegenprobe auf der UNgekuerzten Quelle: Kommentare, Skripte und Vorlagen duerfen die
  // Fundstellen nicht verstecken. Gesucht wird die UL der sichtbaren Fassung ueber ihre eigene
  // class im RAW-Dokument (Indizes der sichtbaren Fassung verschieben sich).
  const rohTags = tokenisiere(html);
  const rohUl = elemente(rohTags, "ul", attrs => (attrs.class || "") === (ul.tag.attrs.class || ""))
    .map(tag => spanVon(rohTags, html, tag.index, "ul")).filter(Boolean);
  fordere(rohUl.length === 1, "senats-roh-ul-mehrdeutig-oder-fehlend");
  fordere(!/<(?:script|style|template|noscript)\b|<!--/i.test(rohUl[0].inner),
    "senats-ul-skript-oder-kommentar");

  // Genau die geschlossenen LI der UL. Keine zweite UL und kein verschachteltes LI darin.
  const ulTags = tags.filter(tag => tag.index >= ul.span.start && tag.index < ul.span.end);
  fordere(elemente(ulTags, "ul").length === 1, "senats-verschachtelte-ul");
  const liTags = elemente(ulTags, "li");
  fordere(liTags.length > 0 && liTags.length <= MAX_FUNDSTELLEN, "senats-li-anzahl-ungueltig");
  const liSpans = liTags.map(tag => spanVon(tags, sichtbar, tag.index, "li"));
  liSpans.forEach((span, i) => {
    fordere(span && span.end <= ul.span.end, "senats-li-nicht-geschlossen");
    fordere(!istVersteckt(liTags[i].attrs), "senats-li-versteckt");
  });
  liSpans.forEach((span, i) => liSpans.forEach((anderer, j) => {
    if (i !== j) fordere(span.start >= anderer.end || span.end <= anderer.start, "senats-li-verschachtelt");
  }));

  const fundstellen = liSpans.map(liSpan => {
    const liTagsI = tags.filter(tag => tag.index >= liSpan.start && tag.index < liSpan.end);
    // Genau EINE geschlossene, sichtbare Datumsspalte.
    const daten = elemente(liTagsI, "div", attrs => hatKlasse(attrs, "date"))
      .map(tag => ({ tag, span: spanVon(tags, sichtbar, tag.index, "div") }))
      .filter(eintrag => eintrag.span);
    fordere(daten.length === 1 && !istVersteckt(daten[0].tag.attrs) && daten[0].span.end <= liSpan.end,
      "senats-datum-mehrdeutig-oder-fehlend");
    const publikationstag = tagAusListenspalte(textVon(daten[0].span.inner));
    fordere(publikationstag, "senats-datum-ungueltig");

    // Genau EINE geschlossene, sichtbare Textspalte mit genau EINEM geschlossenen Link.
    const texte = elemente(liTagsI, "div", attrs => hatKlasse(attrs, "text"))
      .map(tag => ({ tag, span: spanVon(tags, sichtbar, tag.index, "div") }))
      .filter(eintrag => eintrag.span);
    fordere(texte.length === 1 && !istVersteckt(texte[0].tag.attrs) && texte[0].span.end <= liSpan.end,
      "senats-textzelle-mehrdeutig-oder-fehlend");
    const textTags = tags.filter(tag => tag.index >= texte[0].span.start && tag.index < texte[0].span.end);
    const kategorien = elemente(textTags, "div", attrs => hatKlasse(attrs, "category"))
      .map(tag => ({ tag, span: spanVon(tags, sichtbar, tag.index, "div") }))
      .filter(eintrag => eintrag.span && eintrag.span.end <= texte[0].span.end);
    fordere(kategorien.length === 1 && !istVersteckt(kategorien[0].tag.attrs),
      "senats-behoerde-mehrdeutig-oder-fehlend");
    const behoerde = textVon(kategorien[0].span.inner);
    fordere(/^Behörde: (?:Presse- und Informationsamt des Landes Berlin|Senatsverwaltung für .+)$/u.test(behoerde),
      "senats-behoerde-ungueltig");
    const anker = elemente(textTags, "a").map(tag => ({ tag, span: spanVon(tags, sichtbar, tag.index, "a") }))
      .filter(eintrag => eintrag.span && eintrag.span.end <= texte[0].span.end);
    fordere(anker.length === 1, "senats-link-mehrdeutig-oder-fehlend");
    fordere(!istVersteckt(anker[0].tag.attrs), "senats-link-versteckt");
    const pfad = pruefeRelativenPfad(anker[0].tag.attrs.href);
    fordere(pfad, "senats-link-ungueltig");
    const titel = textVon(anker[0].span.inner);
    fordere(titel.length > 0 && titel.length <= MAX_TITEL && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(titel),
      "senats-titel-ungueltig");
    return freieFundstelle(pfad, titel, publikationstag);
  });

  // Duplikate und (theoretisch) inhaltsleere Ausgabe sind Drift.
  const urls = new Set(fundstellen.map(eintrag => eintrag.url));
  const titel = new Set(fundstellen.map(eintrag => eintrag.titel));
  fordere(urls.size === fundstellen.length && titel.size === fundstellen.length, "senats-doppelte-fundstelle");

  const ergebnis = { quelle: KANONISCHE_QUELLE, fundstellen: Object.freeze(fundstellen) };
  fordere(Object.keys(ergebnis).length === AUSGANG_FELDER.length, "ergebnis-ungueltig");
  return Object.freeze(ergebnis);
}

module.exports = { VERSION, KANONISCHE_QUELLE, H2_TEXT, MAX_HTML_BYTES, MAX_FUNDSTELLEN, MAX_TITEL,
  GRUND_PRESSEARCHIV, AUSGANG_FELDER, FUNDSTELLE_FELDER, tagAusListenspalte, pruefeRelativenPfad,
  abrufzielFuer, pruefeSenatsblock };
