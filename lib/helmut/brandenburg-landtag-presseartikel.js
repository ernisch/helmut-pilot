"use strict";

// Helmut — strenger, rein lokaler Parser fuer amtliche Pressemitteilungen des
// Landtages Brandenburg.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Brandenburg): Der Landtag
// Brandenburg veroeffentlicht seine aktuellen Pressemitteilungen unter
// https://www.landtag.brandenburg.de/de/meldungen/<slug>/<nr>. Eine amtliche Meldung
// traegt GENAU EIN sichtbares main.col-lg, in ihm GENAU EINE sichtbare H1 (den Titel),
// unmittelbar danach den eigenen Kopfabsatz <p><em>Ort, TT. Monat JJJJ / NNN</em></p> und
// anschliessend die Sachabsaetze. Nur die normale Meldung 49674 darf stattdessen
// den separat ID-gebundenen Programm-Kopf mit 14-Zeilen-Tabelle verwenden. Meldungen unter
// /de/aktuelles/neuigkeiten/aktuelle_meldungen/<nr> duerfen ausschliesslich den
// separat streng gebundenen Sonderpfad aus kombinierter Kopfzeile und genau einer
// Termintabelle verwenden. Den Abschluss des Hauptbereichs bildet die
// PDF-Downloadliste (<p><ul class="list-links">…</ul></p>); Kontakt-/Sidebarblock und
// Fussbereich liegen AUSSERHALB von main und gehoeren NICHT zum Artikel.
//
// Eine belastbare Uhrzeit liefert die Quelle nicht; der Publikationstag ist ein reiner
// Kalendertag. Dieses Modul fuehrt deshalb bewusst kein published_at und erfindet keine
// Uhrzeit — auch nicht aus der Kopfzeile („/ 134“ ist die Mitteilungsnummer, keine Zeit).
//
// Zwei getrennt benutzbare Ebenen:
//   1. pruefePresseartikel(eingabe) — der REINE Artikelleser. Eingang sind genau die vier
//      beobachteten Felder { url, finalUrl, http, html }; er braucht KEINE Liste.
//   2. pruefeFundstelleGegenListe(artikel, liste) — die OPTIONALE, eng begrenzte
//      Fundstellen-Gegenpruefung gegen die amtliche Uebersichtsliste
//      .../de/aktuelles/presse/aktuelle_pressemitteilungen/25216. Sie bindet den
//      Listeneintrag ueber denselben Pfad an den bereits gelesenen Artikel und bricht bei
//      Titel- oder Tageswiderspruch ab. Ohne diese zweite Ebene bleibt die Quellenbindung
//      genau das, was sie ist: der aus der Artikelseite selbst gelesene Beleg.
//
// Fail closed: fehlende, doppelte oder unterschiedliche Felder, fremde/normalisierte
// Adressen, Host-/HTTP-/finalUrl-Drift, falsche oder doppelte H1, versteckte oder inerte
// Scheinbelege (Kommentar/Skript/hidden/aria-hidden/display:none), Ausbruch aus main und
// angehaengte Kontakt-, Sidebar- oder PDF-Link-Reste brechen ab.
//
// Keine neue Abhaengigkeit, kein DOM-Paket: HTML wird mit einem eigenen, kommentar- und
// skriptbewussten Tokenleser ausgewertet. Grenzen werden ueber die zugehoerigen schliessenden
// Auszeichnungen derselben Verschachtelungstiefe bestimmt (nicht ueber offene Regexe).
//
// KEIN Netzwerk, KEINE Datei-, DB-, Modell- oder Productionwirkung.

const crypto = require("node:crypto");

const VERSION = "brandenburg-landtag-presseartikel-v1";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const HASH_64 = /^[a-f0-9]{64}$/;
const TAG_TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const TAG_DM = /^(\d{2})\.(\d{2})\.(\d{4})$/;

const HOSTS = new Set(["landtag.brandenburg.de", "www.landtag.brandenburg.de"]);

// Belegte Artikeladressen: /de/meldungen/<slug>/<nr> sowie der separate aktuelle
// numerische Pfad. Der Slug wird bewusst NICHT prozent- oder pfadnormalisiert; nur
// die belegte Zeichenfamilie ist zugelassen (enthielt im Original den Doppelpunkt),
// damit "..", "%2F" oder ein Trailing-Drift gar nicht erst passen.
const ARTIKEL_PFAD = /^(?:\/de\/meldungen\/[A-Za-z0-9._:!$&'()*+,;=@~-]+\/[0-9]{1,10}|\/de\/aktuelles\/neuigkeiten\/aktuelle_meldungen\/[0-9]{1,10})$/;
const AKTUELLE_ARTIKEL_PFAD = /^\/de\/aktuelles\/neuigkeiten\/aktuelle_meldungen\/[0-9]{1,10}$/;
// Einzige belegte kombinierte Programm-Meldung auf dem normalen Meldungspfad.
const PROGRAMM_ARTIKEL_PFAD = /^\/de\/meldungen\/[A-Za-z0-9._:!$&'()*+,;=@~-]+\/49674$/;
// Die einzige belegte Terminmeldung mit zwei abweichenden Zwischenblockformen.
const TERMIN_BLOCK_ARTIKEL_PFAD = /^\/de\/meldungen\/[A-Za-z0-9._:!$&'()*+,;=@~-]+\/49670$/;
// Uebersichtsliste der aktuellen Pressemitteilungen.
const LISTE_PFAD = /^\/de\/aktuelles\/presse\/aktuelle_pressemitteilungen\/[0-9]{1,10}$/;
// Relativer Fundstellenlink eines Listeneintrags.
const FUNDSTELLE_PFAD = /^\/de\/meldungen\/[A-Za-z0-9._:!$&'()*+,;=@~-]+\/[0-9]{1,10}$/;

const EINGANG_FELDER = ["finalUrl", "html", "http", "url"];
const AUSGANG_FELDER = Object.freeze(["url", "titel", "publikationstag", "kopfzeile",
  "volltext", "volltextHash", "htmlHash"]);
const LISTEN_FELDER = Object.freeze(["url", "titel", "publikationstag", "eintragsId"]);

const MONATE = Object.freeze({
  januar: 1, februar: 2, "märz": 3, maerz: 3, maer: 3, april: 4, mai: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10,
  nov: 11, dez: 12
});
const WOCHENTAGE = "Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag";

const hash = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
function fordere(ok, grund) { if (!ok) throw new Error("brandenburg-landtag-presseartikel-" + grund); }

// ---------------------------------------------------------------------------------------------
// Text und Entitaeten
// ---------------------------------------------------------------------------------------------
const ENTITAETEN = Object.freeze({ amp: "&", quot: "\"", apos: "'", nbsp: "\u00a0", lt: "<", gt: ">",
  auml: "\u00e4", ouml: "\u00f6", uuml: "\u00fc", Auml: "\u00c4", Ouml: "\u00d6", Uuml: "\u00dc",
  szlig: "\u00df", ndash: "\u2013", mdash: "\u2014", bdquo: "\u201e", ldquo: "\u201c",
  rdquo: "\u201d", sbquo: "\u201a", lsquo: "\u2018", copy: "\u00a9" });

function dekodiere(value) {
  return String(value == null ? "" : value).replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (whole, key) => {
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
// Nur HTTPS auf landtag.brandenburg.de, ohne Benutzerinfo, ohne Port, ohne Query/Fragment.
// Rueckgabe: geparste URL oder null.
function pruefeAmtlicheUrl(value, pfadMuster) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1];
  if (!authority || authority.includes(":")) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.port !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  if (!pfadMuster.test(url.pathname)) return null;
  if (url.pathname.includes("..") || url.pathname.includes("%") || url.pathname.includes("\\")) return null;
  // Keine Normalisierung: der Eingabestring muss die geparste Adresse byteweise sein.
  if (url.href !== value) return null;
  return url;
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

// Terminankündigungen des Landtags setzen zwischen zwei Absatzblöcke eine sichtbare,
// aber nicht ausgezeichnete Tagesüberschrift. Sie ist nur in genau dieser nachgewiesenen
// Form vor einem gebundenen Folgeabsatz zulässig und wird als Quelleninhalt mit übernommen.
// Die belegte Zwei-Tage-Form hat entweder "bis" oder ", und" zwischen zwei Tagesdaten.
function istTerminTagesueberschrift(value) {
  const text = String(value == null ? "" : value).trim();
  const einzel = new RegExp(`^(?:${WOCHENTAGE}), (\\d{1,2})\\. ([A-Za-zäöüÄÖÜ]+) (\\d{4})$`).exec(text);
  const bereich = new RegExp(`^(?:${WOCHENTAGE}), (\\d{1,2})\\. ([A-Za-zäöüÄÖÜ]+)(?: bis |, und )(?:${WOCHENTAGE}), (\\d{1,2})\\. ([A-Za-zäöüÄÖÜ]+) (\\d{4})$`).exec(text);
  if (einzel) {
    const monat = MONATE[einzel[2].toLowerCase()];
    return Boolean(monat && tagDesWerts(`${einzel[3]}-${String(monat).padStart(2, "0")}-${einzel[1].padStart(2, "0")}`));
  }
  if (bereich) {
    const monatVon = MONATE[bereich[2].toLowerCase()];
    const monatBis = MONATE[bereich[4].toLowerCase()];
    return Boolean(monatVon && monatBis
      && tagDesWerts(`${bereich[5]}-${String(monatVon).padStart(2, "0")}-${bereich[1].padStart(2, "0")}`)
      && tagDesWerts(`${bereich[5]}-${String(monatBis).padStart(2, "0")}-${bereich[3].padStart(2, "0")}`));
  }
  return false;
}

// Nur Artikel 49670 enthält diese beiden sichtbar belegten h6-Zwischenblöcke:
// einmal ohne Wochentag und einmal mit dem Jahr auf beiden Bereichsseiten.
// Keine andere Meldung darf damit die allgemeine Termin-Grammatik verlassen.
function istTerminBlock49670(value) {
  return new Set([
    "29. August 2026",
    "Mittwoch, 2. September 2026 bis Freitag, 4. September 2026"
  ]).has(String(value == null ? "" : value).trim());
}

// ---------------------------------------------------------------------------------------------
// Kommentar-, Skript- und versteckte Doppelungen
// ---------------------------------------------------------------------------------------------
// Unbedingt unsichtbare Bloecke (Kommentar, Skript, Stil, noscript, template) werden entfernt.
// Jede Artikelstruktur, die NUR dort existiert, laesst die Markerzaehlung der sichtbaren
// Fassung von der Rohfassung abweichen und bricht fail closed ab.
function sichtbareFassung(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, wert => " ".repeat(wert.length))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, wert => " ".repeat(wert.length))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, wert => " ".repeat(wert.length))
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, wert => " ".repeat(wert.length))
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, wert => " ".repeat(wert.length));
}

const STRUKTUR_MARKER = Object.freeze([
  /<h1\b/gi,
  /<main\b/gi,
  /<ul\b/gi,
  /<em\b/gi,
  /class\s*=\s*["'][^"']*\bcol-lg\b/gi,
  /class\s*=\s*["'][^"']*\blist-entries\b/gi,
  /class\s*=\s*["'][^"']*\blist-entry\b/gi,
  /class\s*=\s*["'][^"']*list-entry-date/gi,
  /class\s*=\s*["'][^"']*list-entry-title/gi,
  /class\s*=\s*["'][^"']*\blist-links\b/gi,
  /class\s*=\s*["'][^"']*\bdownload\b/gi,
  /<link\b[^>]*\brel\s*=\s*["']?canonical\b/gi,
  /property\s*=\s*["']?og:title\b/gi
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
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr"]);
// Erlaubte reine Formatierung innerhalb eines Sachabsatzes. Alles andere ist Fremdinhalt.
const INLINE_ERLAUBT = new Set(["strong", "b", "em", "i", "u", "span", "small", "sub", "sup",
  "abbr", "code", "br", "a"]);
const AMTLICHE_MAILTO = /^mailto:[a-z0-9.!#$%&'*+/=?^_{|}~-]+@(?:www\.)?landtag\.brandenburg\.de$/i;

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
    const name = m[2].toLowerCase();
    tags.push({ index: m.index, ende: m.index + m[0].length, schliessend: m[1] === "/",
      name, selbstschliessend: VOID.has(name) || /\/\s*>$/.test(m[0]), text: m[0],
      attrs: leseAttribute(m[0]) });
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
      if (tag.selbstschliessend) { if (!gefunden) return null; continue; }
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

function tagsImBereich(tags, span) {
  return tags.filter(tag => tag.index >= span.start && tag.index < span.end);
}

// Direkte Kindelemente eines geschlossenen Bereichs ueber die Verschachtelungstiefe.
function direkteKinder(tags, span) {
  const out = [];
  let tiefe = 0;
  for (const tag of tagsImBereich(tags, span)) {
    if (tag.schliessend) { tiefe--; continue; }
    if (tiefe === 1) out.push(tag);
    if (!tag.selbstschliessend) tiefe++;
  }
  return out;
}

// Zwischen zwei belegten Grenzen darf nur Leerraum stehen. Das bindet die Reihenfolge und
// verhindert, dass stiller Fremdinhalt zwischen die belegten Bloecke geschoben wird.
function nurLeerraum(html, von, bis) {
  return von <= bis && /^\s*$/.test(html.slice(von, bis));
}

// ---------------------------------------------------------------------------------------------
// Kopfzeile "Ort, TT. Monat JJJJ / NNN"
// ---------------------------------------------------------------------------------------------
function parseKopfzeile(text) {
  const m = /^([^,<]+),\s*(\d{1,2})\.\s+([A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]+)\.?\s+(\d{4})\s*\/\s*(\d{1,6})$/.exec(text);
  if (!m) return null;
  const ort = m[1].trim();
  const monat = MONATE[m[3].toLowerCase()];
  if (!ort || !monat) return null;
  const tag = tagDesWerts(`${m[4]}-${String(monat).padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  if (!tag) return null;
  return { publikationstag: tag };
}

// Enger Sonderpfad fuer die aktuelle Meldungsform: Der Kopfabsatz enthaelt nach
// genau zwei br innerhalb des em bereits den ersten Sachtext. Andere Mischformen
// bleiben unzulaessig. Die Laengen-erhaltende sichtbare Fassung erlaubt hier den
// bytegleichen Rueckgriff auf das Roh-HTML, um Kommentare und inerte Bloecke in
// der anschliessenden Termintabelle ausdruecklich abzulehnen.
function leseKombiniertenKopf(tags, sichtbar, kopfAbsatz, kopfSpan, kopfEm, kopfEmSpan) {
  fordere(Object.keys(kopfAbsatz.attrs).length === 0 && Object.keys(kopfEm.attrs).length === 0,
    "kombinierte-kopfzeile-attribute");
  const direkte = direkteKinder(tags, kopfSpan);
  fordere(direkte.length === 1 && direkte[0] === kopfEm, "kombinierte-kopfzeile-struktur");
  const emKinder = direkteKinder(tags, kopfEmSpan);
  fordere(emKinder.length === 2 && emKinder.every(tag => tag.name === "br"
    && Object.keys(tag.attrs).length === 0), "kombinierte-kopfzeile-umbrueche");
  const emInhalt = kopfEmSpan.inner.replace(/^<em\b[^>]*>/i, "").replace(/<\/em\s*>\s*$/i, "");
  fordere(/^([\s\S]*?)<br\s*\/?>\s*<br\s*\/?>\s*$/i.test(emInhalt),
    "kombinierte-kopfzeile-umbrueche");
  const schliessendesP = tagsImBereich(tags, kopfSpan)
    .filter(tag => tag.name === "p" && tag.schliessend).at(-1);
  fordere(schliessendesP && kopfEmSpan.end <= schliessendesP.index,
    "kombinierte-kopfzeile-nicht-geschlossen");
  const nachlauf = sichtbar.slice(kopfEmSpan.end, schliessendesP.index);
  fordere(!/[<>]/.test(nachlauf), "kombinierte-kopfzeile-fremdinhalt");
  const sachtext = textVon(nachlauf);
  fordere(sachtext.length > 0, "kombinierte-kopfzeile-sachtext-fehlt");
  return sachtext;
}

// Enger, ID-gebundener Sonderkopf der Meldung 49674. Anders als der allgemeine
// kombinierte Kopf enthaelt er nach dem em genau zwei strong, zwei br und den
// abschliessenden Programmhinweis. Die belegte Word-Style-Angabe ist Teil der
// Grammatik; schon eine weitere oder abweichende Eigenschaft bricht ab.
function leseProgrammKopf(tags, sichtbar, rohHtml, kopfAbsatz, kopfSpan, kopfEm, kopfEmSpan) {
  fordere(kopfAbsatz.text === '<p style="margin-bottom: 36.0pt;">'
    && Object.keys(kopfAbsatz.attrs).length === 1
    && kopfAbsatz.attrs.style === "margin-bottom: 36.0pt;"
    && Object.keys(kopfEm.attrs).length === 0, "programm-kopf-attribute");
  const kopfRoh = rohHtml.slice(kopfSpan.start, kopfSpan.end);
  fordere(!/<!--|<\/?(?:script|style|noscript|template)\b/i.test(kopfRoh),
    "programm-kopf-verborgener-inhalt");

  const direkte = direkteKinder(tags, kopfSpan);
  fordere(direkte.length === 5 && direkte[0] === kopfEm
    && direkte.slice(1).map(tag => tag.name).join(",") === "strong,strong,br,br",
  "programm-kopf-struktur");

  const emKinder = direkteKinder(tags, kopfEmSpan);
  fordere(emKinder.length === 2 && emKinder.every(tag => tag.name === "br"
    && Object.keys(tag.attrs).length === 0), "programm-kopf-umbrueche");
  fordere(textVon(kopfEmSpan.inner) === "Potsdam, 28. August 2026 / 122",
    "programm-kopfzeile-ungueltig");
  const emInhalt = kopfEmSpan.inner.replace(/^<em\b[^>]*>/i, "").replace(/<\/em\s*>\s*$/i, "");
  fordere(/^([\s\S]*?)<br\s*\/?>\s*<br\s*\/?>\s*$/i.test(emInhalt),
    "programm-kopf-umbrueche");

  const [erstesStrong, zweitesStrong, ersterBr, zweiterBr] = direkte.slice(1);
  for (const strong of [erstesStrong, zweitesStrong]) {
    fordere(Object.keys(strong.attrs).length === 0, "programm-kopf-strong-attribute");
    const strongSpan = spanVon(tags, sichtbar, strong.index, "strong");
    fordere(strongSpan && strongSpan.end <= kopfSpan.end
      && direkteKinder(tags, strongSpan).length === 0, "programm-kopf-strong-ungueltig");
    const strongSchluss = tagsImBereich(tags, strongSpan)
      .filter(tag => tag.name === "strong" && tag.schliessend).at(-1);
    const strongRoh = strongSchluss ? sichtbar.slice(strong.ende, strongSchluss.index) : "";
    fordere(!/[<>]/.test(strongRoh) && textVon(strongRoh).length > 0,
      "programm-kopf-strong-ungueltig");
  }
  fordere([ersterBr, zweiterBr].every(tag => Object.keys(tag.attrs).length === 0),
    "programm-kopf-umbrueche");

  const erstesStrongSpan = spanVon(tags, sichtbar, erstesStrong.index, "strong");
  const zweitesStrongSpan = spanVon(tags, sichtbar, zweitesStrong.index, "strong");
  const pSchluss = tagsImBereich(tags, kopfSpan)
    .filter(tag => tag.name === "p" && tag.schliessend).at(-1);
  fordere(pSchluss && erstesStrongSpan && zweitesStrongSpan, "programm-kopf-nicht-geschlossen");
  const vorStrong = sichtbar.slice(kopfEmSpan.end, erstesStrong.index);
  const zwischenStrong = sichtbar.slice(erstesStrongSpan.end, zweitesStrong.index);
  const vorUmbruch = sichtbar.slice(zweitesStrongSpan.end, ersterBr.index);
  const zwischenUmbruechen = sichtbar.slice(ersterBr.ende, zweiterBr.index);
  const schlussText = sichtbar.slice(zweiterBr.ende, pSchluss.index);
  fordere(!/[<>]/.test(vorStrong + zwischenStrong + vorUmbruch + zwischenUmbruechen + schlussText),
    "programm-kopf-fremdinhalt");
  fordere(textVon(vorStrong).length > 0 && /^\s*$/.test(zwischenUmbruechen)
    && textVon(schlussText) === "Das Veranstaltungsprogramm:", "programm-kopf-text-ungueltig");

  const sachtext = textVon(sichtbar.slice(kopfEmSpan.end, pSchluss.index));
  fordere(sachtext.length > 0, "programm-kopf-sachtext-fehlt");
  return sachtext;
}

function fordereWohlgeformteTerminTabelle(tableTags) {
  const stapel = [];
  for (const tag of tableTags) {
    if (tag.schliessend) {
      fordere(stapel.length > 0 && stapel.at(-1) === tag.name, "termin-tabelle-nicht-geschlossen");
      stapel.pop();
      continue;
    }
    fordere(!tag.selbstschliessend, "termin-tabelle-selbstschliessend");
    stapel.push(tag.name);
  }
  fordere(stapel.length === 0, "termin-tabelle-nicht-geschlossen");
}

function fordereNurLeerraumZwischenKindern(tags, html, span, kinder) {
  const startTag = tags.find(tag => tag.index === span.start && !tag.schliessend);
  fordere(startTag, "termin-tabelle-struktur");
  let ende = startTag.ende;
  for (const kind of kinder) {
    fordere(nurLeerraum(html, ende, kind.index), "termin-tabelle-fremdinhalt");
    const kindSpan = spanVon(tags, html, kind.index, kind.name);
    fordere(kindSpan, "termin-tabelle-nicht-geschlossen");
    ende = kindSpan.end;
  }
  const schluss = tags.filter(tag => tag.name === startTag.name && tag.schliessend
    && tag.index >= span.start && tag.index < span.end).at(-1);
  fordere(schluss && nurLeerraum(html, ende, schluss.index), "termin-tabelle-fremdinhalt");
}

function leseTerminTabelle(tags, sichtbar, rohHtml, main, kopfSpan) {
  const tabellen = elemente(tagsImBereich(tags, main), "table");
  fordere(tabellen.length === 1, "termin-tabelle-mehrdeutig-oder-fehlend");
  const table = tabellen[0];
  fordere(!istVersteckt(table.attrs), "termin-tabelle-versteckt");
  const tableSpan = spanVon(tags, sichtbar, table.index, "table");
  fordere(tableSpan && tableSpan.end <= main.end, "termin-tabelle-nicht-geschlossen");
  fordere(nurLeerraum(sichtbar, kopfSpan.end, tableSpan.start), "termin-tabelle-nicht-nach-kopfzeile");

  const tableRoh = rohHtml.slice(tableSpan.start, tableSpan.end);
  fordere(!/<!--|<\/?(?:script|style)\b|\bpdf\b/i.test(tableRoh),
    "termin-tabelle-verborgener-oder-pdf-inhalt");
  const tableTags = tagsImBereich(tags, tableSpan);
  fordere(tableTags.every(tag => ["table", "tbody", "tr", "td", "strong"].includes(tag.name)),
    "termin-tabelle-tag-ungueltig");
  fordereWohlgeformteTerminTabelle(tableTags);
  fordere(!tableTags.some(tag => !tag.schliessend && istVersteckt(tag.attrs)),
    "termin-tabelle-versteckt");

  const tableKinder = direkteKinder(tags, tableSpan);
  fordere(tableKinder.length === 1 && tableKinder[0].name === "tbody", "termin-tabelle-tbody-ungueltig");
  fordereNurLeerraumZwischenKindern(tags, sichtbar, tableSpan, tableKinder);
  const tbody = tableKinder[0];
  const tbodySpan = spanVon(tags, sichtbar, tbody.index, "tbody");
  fordere(tbodySpan && tbodySpan.end <= tableSpan.end, "termin-tabelle-tbody-nicht-geschlossen");
  const zeilen = direkteKinder(tags, tbodySpan);
  fordere(zeilen.length > 0 && zeilen.every(tag => tag.name === "tr"), "termin-tabelle-zeilen-ungueltig");
  fordereNurLeerraumZwischenKindern(tags, sichtbar, tbodySpan, zeilen);

  const texte = [];
  for (const zeile of zeilen) {
    const zeilenSpan = spanVon(tags, sichtbar, zeile.index, "tr");
    fordere(zeilenSpan && zeilenSpan.end <= tbodySpan.end, "termin-tabelle-zeile-nicht-geschlossen");
    const zellen = direkteKinder(tags, zeilenSpan);
    fordere(zellen.length === 2 && zellen.every(tag => tag.name === "td"),
      "termin-tabelle-zellen-ungueltig");
    fordereNurLeerraumZwischenKindern(tags, sichtbar, zeilenSpan, zellen);

    const ersteSpan = spanVon(tags, sichtbar, zellen[0].index, "td");
    const zweiteSpan = spanVon(tags, sichtbar, zellen[1].index, "td");
    fordere(ersteSpan && zweiteSpan && zweiteSpan.end <= zeilenSpan.end,
      "termin-tabelle-zelle-nicht-geschlossen");
    const ersteKinder = direkteKinder(tags, ersteSpan);
    fordere(ersteKinder.length === 1 && ersteKinder[0].name === "strong",
      "termin-tabelle-zeit-mehrdeutig-oder-fehlend");
    const strong = ersteKinder[0];
    fordere(Object.keys(strong.attrs).length === 0, "termin-tabelle-zeit-attribute");
    const strongSpan = spanVon(tags, sichtbar, strong.index, "strong");
    fordere(strongSpan && strongSpan.end <= ersteSpan.end
      && direkteKinder(tags, strongSpan).length === 0, "termin-tabelle-zeit-ungueltig");
    const zeit = textVon(strongSpan.inner);
    fordere(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(zeit), "termin-tabelle-zeit-ungueltig");
    const ersteSchluss = tagsImBereich(tags, ersteSpan)
      .filter(tag => tag.name === "td" && tag.schliessend).at(-1);
    const vorZeit = sichtbar.slice(zellen[0].ende, strong.index);
    const nachZeit = sichtbar.slice(strongSpan.end, ersteSchluss.index);
    fordere(/^\s*$/.test(vorZeit) && !/[<>]/.test(nachZeit), "termin-tabelle-erste-zelle-ungueltig");
    const beschreibung = textVon(nachZeit);
    fordere(beschreibung.length > 0, "termin-tabelle-erste-zelle-text-fehlt");

    fordere(direkteKinder(tags, zweiteSpan).length === 0, "termin-tabelle-zweite-zelle-ungueltig");
    const zweiteSchluss = tagsImBereich(tags, zweiteSpan)
      .filter(tag => tag.name === "td" && tag.schliessend).at(-1);
    const zweiteRoh = sichtbar.slice(zellen[1].ende, zweiteSchluss.index);
    fordere(!/[<>]/.test(zweiteRoh), "termin-tabelle-zweite-zelle-ungueltig");
    const zusatz = textVon(zweiteRoh);
    const zeilenZeiten = `${textVon(ersteSpan.inner)} ${textVon(zweiteSpan.inner)}`
      .match(/\b\d{2}:\d{2}\b/g) || [];
    fordere(zeilenZeiten.length === 1 && zeilenZeiten[0] === zeit,
      "termin-tabelle-zeit-mehrdeutig-oder-fehlend");
    texte.push(`${zeit} ${beschreibung}${zusatz ? ` ${zusatz}` : ""}`);
  }
  return { span: tableSpan, texte };
}

// Die reale Programm-Meldung 49674 hat genau 14 Zeilen. Ihre Uhrzeit traegt
// bereits das Wort "Uhr"; jede weitere Zeitangabe in derselben Zeile waere
// mehrdeutig und wird abgelehnt.
function leseProgrammTabelle(tags, sichtbar, rohHtml, main, kopfSpan) {
  const tabellen = elemente(tagsImBereich(tags, main), "table");
  fordere(tabellen.length === 1, "programm-tabelle-mehrdeutig-oder-fehlend");
  const table = tabellen[0];
  fordere(!istVersteckt(table.attrs), "programm-tabelle-versteckt");
  const tableSpan = spanVon(tags, sichtbar, table.index, "table");
  fordere(tableSpan && tableSpan.end <= main.end, "programm-tabelle-nicht-geschlossen");
  fordere(nurLeerraum(sichtbar, kopfSpan.end, tableSpan.start),
    "programm-tabelle-nicht-nach-kopfzeile");

  const tableRoh = rohHtml.slice(tableSpan.start, tableSpan.end);
  fordere(!/<!--|<\/?(?:script|style|noscript|template)\b/i.test(tableRoh),
    "programm-tabelle-verborgener-inhalt");
  const tableTags = tagsImBereich(tags, tableSpan);
  fordere(tableTags.every(tag => ["table", "tbody", "tr", "td", "strong"].includes(tag.name)),
    "programm-tabelle-tag-ungueltig");
  fordereWohlgeformteTerminTabelle(tableTags);
  fordere(!tableTags.some(tag => !tag.schliessend && istVersteckt(tag.attrs)),
    "programm-tabelle-versteckt");

  const tableKinder = direkteKinder(tags, tableSpan);
  fordere(tableKinder.length === 1 && tableKinder[0].name === "tbody",
    "programm-tabelle-tbody-ungueltig");
  fordereNurLeerraumZwischenKindern(tags, sichtbar, tableSpan, tableKinder);
  const tbodySpan = spanVon(tags, sichtbar, tableKinder[0].index, "tbody");
  fordere(tbodySpan && tbodySpan.end <= tableSpan.end, "programm-tabelle-tbody-nicht-geschlossen");
  const zeilen = direkteKinder(tags, tbodySpan);
  fordere(zeilen.length === 14 && zeilen.every(tag => tag.name === "tr"),
    "programm-tabelle-zeilen-ungueltig");
  fordereNurLeerraumZwischenKindern(tags, sichtbar, tbodySpan, zeilen);

  const texte = [];
  for (const zeile of zeilen) {
    const zeilenSpan = spanVon(tags, sichtbar, zeile.index, "tr");
    fordere(zeilenSpan && zeilenSpan.end <= tbodySpan.end,
      "programm-tabelle-zeile-nicht-geschlossen");
    const zellen = direkteKinder(tags, zeilenSpan);
    fordere(zellen.length === 2 && zellen.every(tag => tag.name === "td"),
      "programm-tabelle-zellen-ungueltig");
    fordereNurLeerraumZwischenKindern(tags, sichtbar, zeilenSpan, zellen);

    const ersteSpan = spanVon(tags, sichtbar, zellen[0].index, "td");
    const zweiteSpan = spanVon(tags, sichtbar, zellen[1].index, "td");
    fordere(ersteSpan && zweiteSpan && zweiteSpan.end <= zeilenSpan.end,
      "programm-tabelle-zelle-nicht-geschlossen");
    const ersteKinder = direkteKinder(tags, ersteSpan);
    fordere(ersteKinder.length === 1 && ersteKinder[0].name === "strong",
      "programm-tabelle-zeit-mehrdeutig-oder-fehlend");
    const strong = ersteKinder[0];
    fordere(Object.keys(strong.attrs).length === 0, "programm-tabelle-zeit-attribute");
    const strongSpan = spanVon(tags, sichtbar, strong.index, "strong");
    fordere(strongSpan && strongSpan.end <= ersteSpan.end
      && direkteKinder(tags, strongSpan).length === 0, "programm-tabelle-zeit-ungueltig");
    const strongSchluss = tagsImBereich(tags, strongSpan)
      .filter(tag => tag.name === "strong" && tag.schliessend).at(-1);
    const zeitRoh = strongSchluss ? sichtbar.slice(strong.ende, strongSchluss.index) : "";
    const zeit = textVon(zeitRoh);
    fordere(!/[<>]/.test(zeitRoh) && /^(?:[01]\d|2[0-3]):[0-5]\d Uhr$/.test(zeit),
      "programm-tabelle-zeit-ungueltig");

    const ersteSchluss = tagsImBereich(tags, ersteSpan)
      .filter(tag => tag.name === "td" && tag.schliessend).at(-1);
    const vorZeit = sichtbar.slice(zellen[0].ende, strong.index);
    const nachZeit = sichtbar.slice(strongSpan.end, ersteSchluss.index);
    fordere(/^\s*$/.test(vorZeit) && !/[<>]/.test(nachZeit),
      "programm-tabelle-erste-zelle-ungueltig");
    const beschreibung = textVon(nachZeit);
    fordere(beschreibung.length > 0, "programm-tabelle-erste-zelle-text-fehlt");

    fordere(direkteKinder(tags, zweiteSpan).length === 0,
      "programm-tabelle-zweite-zelle-ungueltig");
    const zweiteSchluss = tagsImBereich(tags, zweiteSpan)
      .filter(tag => tag.name === "td" && tag.schliessend).at(-1);
    const zweiteRoh = sichtbar.slice(zellen[1].ende, zweiteSchluss.index);
    fordere(!/[<>]/.test(zweiteRoh), "programm-tabelle-zweite-zelle-ungueltig");
    const zusatz = textVon(zweiteRoh);
    const zeilenZeiten = `${textVon(ersteSpan.inner)} ${textVon(zweiteSpan.inner)}`
      .match(/\b\d{1,2}[:.]\d{2}(?:\s*Uhr)?\b/g) || [];
    fordere(zeilenZeiten.length === 1 && zeilenZeiten[0] === zeit,
      "programm-tabelle-zeit-mehrdeutig-oder-fehlend");
    texte.push(`${zeit} ${beschreibung}${zusatz ? ` ${zusatz}` : ""}`);
  }
  return { span: tableSpan, texte };
}

// ---------------------------------------------------------------------------------------------
// Hauptpruefung — reiner Artikelleser
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

  // Adresse: HTTPS landtag.brandenburg.de ohne Benutzerinfo/Port/Query. Kanonisch == final.
  const urlTeile = pruefeAmtlicheUrl(url, ARTIKEL_PFAD);
  fordere(urlTeile, "url-ungueltig");
  const finalUrlTeile = pruefeAmtlicheUrl(finalUrl, ARTIKEL_PFAD);
  fordere(finalUrlTeile, "finalurl-ungueltig");
  fordere(url === finalUrl, "url-nicht-finalurl");

  const sichtbar = sichtbareFassung(html);
  fordereKeineVersteckten(html, sichtbar);
  const tags = tokenisiere(sichtbar);

  // Eindeutiger head mit genau einer kanonischen Adresse, die der finalen Adresse gleicht.
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
  fordere(pruefeAmtlicheUrl(canonicalHref, ARTIKEL_PFAD), "canonical-ungueltig");
  fordere(canonicalHref === finalUrl, "finalurl-nicht-canonical");

  // Genau ein main.col-lg, sichtbar, geschlossen. Kein zweites main im Dokument.
  const mains = elemente(tags, "main");
  fordere(mains.length === 1, "main-mehrdeutig-oder-fehlend");
  fordere(hatKlasse(mains[0].attrs, "col-lg"), "main-ohne-col-lg");
  fordere(!istVersteckt(mains[0].attrs), "main-versteckt");
  const main = spanVon(tags, sichtbar, mains[0].index, "main");
  fordere(main, "main-nicht-geschlossen");

  // Alle mustergeprueften Belege muessen INNERHALB von main liegen (kein Ausbruch).
  const kinder = direkteKinder(tags, main);
  const koepfe = kinder.filter(tag => tag.name === "h1");
  fordere(koepfe.length === 1, "h1-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(koepfe[0].attrs), "h1-versteckt");
  const h1Span = spanVon(tags, sichtbar, koepfe[0].index, "h1");
  fordere(h1Span && h1Span.end <= main.end, "h1-ausserhalb-main");
  const titel = textVon(h1Span.inner);
  fordere(titel.length > 0, "titel-leer");
  // Der eigene H1 ist das erste Element nach dem Kopfbereich; vor ihm darf kein p stehen.
  fordere(kinder.filter(tag => tag.name === "p" && tag.index < koepfe[0].index).length === 0,
    "absatz-vor-h1");

  // Seitentitel und og:title binden den H1 an eine zweite, unabhaengige Angabe derselben Seite.
  const titelTags = elemente(headTags, "title");
  fordere(titelTags.length === 1, "seitentitel-mehrdeutig-oder-fehlend");
  const seitenTitelSpan = spanVon(tags, sichtbar, titelTags[0].index, "title");
  fordere(seitenTitelSpan, "seitentitel-nicht-geschlossen");
  const seitenTitel = textVon(seitenTitelSpan.inner);
  const ogTitel = metaWerte(tags, "og:title");
  fordere(ogTitel.length === 1, "og-titel-mehrdeutig-oder-fehlend");
  fordere(metaWerte(headTags, "og:title").length === 1, "og-titel-nicht-im-head");
  fordere(textVon(ogTitel[0]) === seitenTitel, "og-titel-abweichend");
  // Nur der vollstaendige H1 plus der belegte Seitenzusatz zaehlt. Ein gekuerzter
  // H1 duerfte sonst als blosses Praefix desselben Seitentitels durchgehen.
  fordere(seitenTitel === `${titel} - Landtag Brandenburg`, "h1-nicht-im-seitentitel");

  // Kopfzeile: GENAU der erste Absatz nach dem H1, ausschliesslich ein sichtbares em.
  const absaetze = kinder.filter(tag => tag.name === "p");
  fordere(absaetze.length >= 2, "absaetze-fehlend");
  const kopfAbsatz = absaetze[0];
  fordere(nurLeerraum(sichtbar, h1Span.end, kopfAbsatz.index), "fremdinhalt-nach-h1");
  fordere(!istVersteckt(kopfAbsatz.attrs), "kopfzeile-versteckt");
  const kopfSpan = spanVon(tags, sichtbar, kopfAbsatz.index, "p");
  fordere(kopfSpan && kopfSpan.end <= main.end, "kopfzeile-ausserhalb-main");
  const kopfEm = elemente(tagsImBereich(tags, kopfSpan), "em");
  fordere(kopfEm.length === 1, "kopfzeile-em-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(kopfEm[0].attrs), "kopfzeile-em-versteckt");
  const kopfEmSpan = spanVon(tags, sichtbar, kopfEm[0].index, "em");
  fordere(kopfEmSpan && kopfEmSpan.end <= kopfSpan.end, "kopfzeile-em-nicht-geschlossen");
  // Standardpfad: Der Absatz enthaelt ausschliesslich das em. Enger Sonderpfad:
  // Das em endet mit genau zwei br und danach folgt bereits der erste Sachtext.
  const kopfInnen = kopfSpan.inner.replace(/^<p\b[^>]*>/i, "").replace(/<\/p\s*>\s*$/i, "");
  const kopfzeile = textVon(kopfEmSpan.inner);
  const kopf = parseKopfzeile(kopfzeile);
  fordere(kopf, "kopfzeile-ungueltig");
  const istStandardKopf = textVon(kopfInnen) === kopfzeile;
  const istAktuellerSonderpfad = AKTUELLE_ARTIKEL_PFAD.test(urlTeile.pathname);
  const istProgrammSonderpfad = PROGRAMM_ARTIKEL_PFAD.test(urlTeile.pathname);
  const istArtikel49670 = TERMIN_BLOCK_ARTIKEL_PFAD.test(urlTeile.pathname);
  fordere((istAktuellerSonderpfad || istProgrammSonderpfad) ? !istStandardKopf : istStandardKopf,
    istAktuellerSonderpfad ? "aktuelle-struktur-fehlt"
      : istProgrammSonderpfad ? "programm-struktur-fehlt" : "kopfzeile-fremdinhalt");
  const kombinierteUmbrueche = direkteKinder(tags, kopfEmSpan);
  fordere(istStandardKopf || (kombinierteUmbrueche.length === 2
    && kombinierteUmbrueche.every(tag => tag.name === "br")), "kopfzeile-fremdinhalt");
  const kombinierterSachtext = istStandardKopf ? null : istProgrammSonderpfad
    ? leseProgrammKopf(tags, sichtbar, html, kopfAbsatz, kopfSpan, kopfEm[0], kopfEmSpan)
    : leseKombiniertenKopf(tags, sichtbar, kopfAbsatz, kopfSpan, kopfEm[0], kopfEmSpan);
  const terminTabelle = istStandardKopf ? null : istProgrammSonderpfad
    ? leseProgrammTabelle(tags, sichtbar, html, main, kopfSpan)
    : leseTerminTabelle(tags, sichtbar, html, main, kopfSpan);

  // PDF-Downloadliste (falls vorhanden) ist GENAU der letzte Absatz von main und wird NIE
  // Artikeltext. Sie darf hoechstens einmal vorkommen und muss den Hauptbereich abschliessen.
  const pdfAbsaetze = absaetze.filter(tag => {
    const span = spanVon(tags, sichtbar, tag.index, "p");
    return span && elemente(tagsImBereich(tags, span), "ul", attrs => hatKlasse(attrs, "list-links")).length > 0;
  });
  fordere(pdfAbsaetze.length <= 1, "pdf-liste-mehrdeutig");
  const pdfAbsatz = pdfAbsaetze[0] || null;
  let pdfNachlauf = null;
  if (pdfAbsatz) {
    const pdfSpan = spanVon(tags, sichtbar, pdfAbsatz.index, "p");
    fordere(pdfSpan && pdfSpan.end <= main.end, "pdf-liste-ausserhalb-main");
    const pdfIndex = absaetze.indexOf(pdfAbsatz);
    const nachfolgendeAbsaetze = absaetze.slice(pdfIndex + 1);
    if (nachfolgendeAbsaetze.length === 1) {
      const kandidat = nachfolgendeAbsaetze[0];
      const kandidatSpan = spanVon(tags, sichtbar, kandidat.index, "p");
      const kandidatTags = kandidatSpan ? tagsImBereich(tags, kandidatSpan) : [];
      if (kandidatSpan && textVon(kandidatSpan.inner) === ""
        && kandidatTags.every(tag => tag.schliessend || tag === kandidat)) {
        pdfNachlauf = kandidat;
      }
    }
    const abschlussAbsatz = pdfNachlauf || pdfAbsatz;
    fordere(absaetze[absaetze.length - 1] === abschlussAbsatz, "pdf-liste-nicht-letzter-absatz");
    fordere(kinder[kinder.length - 1] === abschlussAbsatz, "pdf-liste-nicht-abschluss-von-main");
    const listen = elemente(tagsImBereich(tags, pdfSpan), "ul", attrs => hatKlasse(attrs, "list-links"));
    fordere(listen.length === 1, "pdf-liste-ungueltig");
    const listenSpan = spanVon(tags, sichtbar, listen[0].index, "ul");
    fordere(listenSpan && listenSpan.end <= pdfSpan.end, "pdf-liste-nicht-geschlossen");
    const downloads = elemente(tagsImBereich(tags, listenSpan), "a", attrs => hatKlasse(attrs, "download"));
    fordere(downloads.length >= 1, "pdf-liste-ohne-download");
  }

  // Sachabsaetze: alles zwischen Kopfzeile und PDF-Liste. Vollstaendig, geschlossen,
  // sichtbar, nur Formatierung, keine Fremd- oder PDF-/Kontaktinhalte. Die einzige
  // Ausnahme zwischen Absätzen sind nachgewiesene Termin-Tagesüberschriften unmittelbar
  // vor einer strikten Uhrzeitzeile oder einem unformatierten Terminabsatz; auch sie werden
  // vollständig in den Volltext übernommen.
  const sachAbsaetze = absaetze.filter(tag => tag !== kopfAbsatz && tag !== pdfAbsatz && tag !== pdfNachlauf);
  if (istProgrammSonderpfad) {
    fordere(pdfAbsatz, "programm-pdf-liste-fehlt");
    fordere(sachAbsaetze.length === 1
      && sachAbsaetze[0].text === '<p style="margin-bottom: 36.0pt;">'
      && Object.keys(sachAbsaetze[0].attrs).length === 1
      && sachAbsaetze[0].attrs.style === "margin-bottom: 36.0pt;",
      "programm-nachabsatz-ungueltig");
  }
  fordere(sachAbsaetze.length > 0, "sachabsaetze-fehlend");
  const sachTexte = kombinierterSachtext
    ? [kombinierterSachtext, ...terminTabelle.texte] : [];
  const pruefbareSachTexte = [];
  if (kombinierterSachtext) pruefbareSachTexte.push(kombinierterSachtext, ...terminTabelle.texte);
  let vorherigesEnde = terminTabelle ? terminTabelle.span.end : kopfSpan.end;
  for (let index = 0; index < sachAbsaetze.length; index++) {
    const tag = sachAbsaetze[index];
    const span = spanVon(tags, sichtbar, tag.index, "p");
    fordere(span && span.end <= main.end, "sachabsatz-ausserhalb-main");
    const zwischenraum = textVon(sichtbar.slice(vorherigesEnde, span.start));
    if (zwischenraum) {
      // Die neue ", und"-Vorlage ist am wirklichen sichtbaren h6 gebunden. Reiner
      // Textvergleich wuerde auch <h6 hidden> oder umhuellenden Fremdinhalt zulassen.
      // Alte Einzel-/bis-/49670-Formen behalten unveraendert ihre bisherige Grammatik.
      if (zwischenraum.includes(", und ")) {
        const zwischenTags = tags.filter(t => t.index >= vorherigesEnde && t.index < span.start);
        const koepfe = elemente(zwischenTags, "h6");
        const kopf = koepfe.length === 1 && spanVon(tags, sichtbar, koepfe[0].index, "h6");
        fordere(kopf && kopf.end <= span.start && Object.keys(koepfe[0].attrs).length === 0
          && koepfe[0].text === "<h6>" && html.slice(kopf.start, kopf.end) === kopf.inner
          && html.slice(vorherigesEnde, span.start) === sichtbar.slice(vorherigesEnde, span.start)
          && !istVersteckt(koepfe[0].attrs) && textVon(kopf.inner) === zwischenraum
          && nurLeerraum(sichtbar, vorherigesEnde, kopf.start)
          && nurLeerraum(sichtbar, kopf.end, span.start)
          && tagsImBereich(tags, kopf).every(t => t === koepfe[0]
            || (t.schliessend && t.name === "h6")), "termin-tagesueberschrift-markup-ungueltig");
      }
      const istZeitzeile = hatKlasse(tag.attrs, "time-line")
        && /^\d{1,2}[:.]\d{2} Uhr$/.test(textVon(span.inner));
      const istUnformatierterTerminabsatz = Object.keys(tag.attrs).length === 0;
      fordere((istTerminTagesueberschrift(zwischenraum)
        || (istArtikel49670 && istTerminBlock49670(zwischenraum)))
        && (istZeitzeile || istUnformatierterTerminabsatz), "fremdinhalt-zwischen-absaetzen");
      sachTexte.push(zwischenraum);
    }
    vorherigesEnde = span.end;
    fordere(!istVersteckt(tag.attrs), "sachabsatz-versteckt");
    const innen = tagsImBereich(tags, span);
    for (const t of innen) {
      if (t.schliessend || t === tag) continue;
      if (!INLINE_ERLAUBT.has(t.name)) fordere(false, "fremdinhalt-im-sachabsatz");
      fordere(!istVersteckt(t.attrs), "versteckter-inhalt-im-sachabsatz");
      if (t.name === "a") {
        const href = t.attrs.href || "";
        fordere(!href.toLowerCase().includes(".pdf") && !hatKlasse(t.attrs, "download"),
          "pdf-link-im-sachabsatz");
        if (/^mailto:/i.test(href)) fordere(AMTLICHE_MAILTO.test(href), "kontakt-im-artikel");
      }
    }
    // Kein ul/list-links/download irgendwo innerhalb eines Sachabsatzes.
    fordere(!/<(?:ul|ol|li|table|div|section|aside|address|figure|img|iframe)\b/i.test(span.inner),
      "blockelement-im-sachabsatz");
    const text = textVon(span.inner);
    // Der einzige belegte Leerabsatz steht unmittelbar vor dem unveraenderten
    // Schlussvorbehalt der Terminmeldung 49670. Jeder andere Leerabsatz bleibt
    // unzulaessig; der Leerabsatz liefert selbst keinen Volltext.
    if (text === "") {
      const nachfolger = sachAbsaetze[index + 1];
      const nachfolgerSpan = nachfolger && spanVon(tags, sichtbar, nachfolger.index, "p");
      const nurEigeneTags = tagsImBereich(tags, span)
        .every(t => t.schliessend || t === tag);
      fordere(istArtikel49670 && Object.keys(tag.attrs).length === 0 && nurEigeneTags
        && index === sachAbsaetze.length - 2 && nachfolgerSpan
        && textVon(nachfolgerSpan.inner) === "Veränderungen und Ergänzungen vorbehalten!",
      "sachabsatz-leer");
      continue;
    }
    fordere(text.length > 0, "sachabsatz-leer");
    sachTexte.push(text);
    // Gleiche Uhrzeiten an verschiedenen, jeweils mit amtlichem Datum gebundenen
    // Terminen sind legitim. Die Doppelprüfung bleibt für die eigentlichen
    // unformatierten Sachabsätze unverändert bestehen.
    if (!hatKlasse(tag.attrs, "time-line")) pruefbareSachTexte.push(text);
  }
  fordere(new Set(pruefbareSachTexte).size === pruefbareSachTexte.length, "sachabsatz-doppler");
  if (pdfAbsatz) {
    const pdfSpan = spanVon(tags, sichtbar, pdfAbsatz.index, "p");
    fordere(nurLeerraum(sichtbar, vorherigesEnde, pdfSpan.start), "fremdinhalt-vor-pdf-liste");
  }
  const mainSchluss = /<\/main\s*>$/i.exec(main.inner);
  fordere(mainSchluss, "main-nicht-geschlossen");
  const letztesEnde = pdfAbsatz
    ? spanVon(tags, sichtbar, (pdfNachlauf || pdfAbsatz).index, "p").end : vorherigesEnde;
  fordere(nurLeerraum(sichtbar, letztesEnde, main.start + mainSchluss.index),
    "fremdinhalt-nach-artikel");

  // Kontakt-/Sidebar-Reste duerfen niemals innerhalb von main stehen.
  const mainInner = main.inner;
  fordere(!/<aside\b|<address\b|<footer\b|<form\b/i.test(mainInner), "kontakt-im-artikel");
  const kontaktUeberschriften = elemente(tagsImBereich(tags, main), null,
    attrs => hatKlasse(attrs, "box") || attrs.id === "kontakt");
  fordere(kontaktUeberschriften.length === 0, "kontakt-im-artikel");
  // Nicht-formatierender Inhalt mit Download-/PDF-Bezug ausserhalb der PDF-Liste ist verboten.
  const ausserhalbPdf = pdfAbsatz
    ? tagsImBereich(tags, main).filter(tag => {
      const pdfSpan = spanVon(tags, sichtbar, pdfAbsatz.index, "p");
      return !(tag.index >= pdfSpan.start && tag.index < pdfSpan.end);
    })
    : tagsImBereich(tags, main);
  for (const tag of ausserhalbPdf) {
    if (hatKlasse(tag.attrs, "list-links") || hatKlasse(tag.attrs, "download")) {
      fordere(false, "pdf-link-ausserhalb-pdf-liste");
    }
    if (tag.name === "a" && /\.pdf(?:[?#]|$)/i.test(tag.attrs.href || "")) {
      fordere(false, "pdf-link-ausserhalb-pdf-liste");
    }
  }

  const volltext = sachTexte.join("\n\n") + "\n";
  const ergebnis = { url: finalUrl, titel, publikationstag: kopf.publikationstag,
    kopfzeile, volltext, volltextHash: hash(volltext), htmlHash: hash(html) };
  fordere(Object.keys(ergebnis).length === AUSGANG_FELDER.length
    && HASH_64.test(ergebnis.volltextHash) && HASH_64.test(ergebnis.htmlHash), "ergebnis-ungueltig");
  return Object.freeze(ergebnis);
}

// ---------------------------------------------------------------------------------------------
// Optionale Fundstellen-Gegenpruefung gegen die amtliche Uebersichtsliste
// ---------------------------------------------------------------------------------------------
function pruefeFundstelleGegenListe(artikel, liste) {
  fordere(artikel && typeof artikel === "object" && !Array.isArray(artikel), "artikel-ungueltig");
  fordere(typeof artikel.url === "string" && typeof artikel.titel === "string"
    && typeof artikel.publikationstag === "string", "artikel-ungueltig");
  const artikelUrl = pruefeAmtlicheUrl(artikel.url, ARTIKEL_PFAD);
  fordere(artikelUrl, "artikel-url-ungueltig");
  fordere(tagDesWerts(artikel.publikationstag) === artikel.publikationstag, "artikel-tag-ungueltig");
  fordere(liste && typeof liste === "object" && !Array.isArray(liste), "liste-ungueltig");
  const feldnamen = Object.keys(liste).sort();
  fordere(feldnamen.length === EINGANG_FELDER.length && feldnamen.join(",") === EINGANG_FELDER.join(","),
    "liste-eingabefelder-ungueltig");

  const { url, finalUrl, http, html } = liste;
  fordere(Number.isInteger(http) && http === 200, "liste-http-nicht-ok");
  fordere(typeof html === "string" && html.length > 0, "liste-html-fehlt");
  fordere(Buffer.byteLength(html, "utf8") <= MAX_HTML_BYTES, "liste-html-zu-gross");
  const listenUrl = pruefeAmtlicheUrl(url, LISTE_PFAD);
  fordere(listenUrl, "liste-url-ungueltig");
  const listenFinal = pruefeAmtlicheUrl(finalUrl, LISTE_PFAD);
  fordere(listenFinal, "liste-finalurl-ungueltig");
  fordere(url === finalUrl, "liste-url-nicht-finalurl");

  const sichtbar = sichtbareFassung(html);
  fordereKeineVersteckten(html, sichtbar);
  const tags = tokenisiere(sichtbar);

  const heads = elemente(tags, "head");
  fordere(heads.length === 1, "liste-head-mehrdeutig-oder-fehlend");
  const head = spanVon(tags, sichtbar, heads[0].index, "head");
  fordere(head, "liste-head-nicht-geschlossen");
  const canonical = elemente(tags, "link", attrs => hatRel(attrs, "canonical"));
  fordere(canonical.length === 1, "liste-canonical-mehrdeutig-oder-fehlend");
  fordere(tagsImBereich(tags, head).includes(canonical[0]), "liste-canonical-nicht-im-head");
  fordere(!istVersteckt(canonical[0].attrs), "liste-canonical-versteckt");
  const canonicalHref = (canonical[0].attrs.href || "").trim();
  fordere(pruefeAmtlicheUrl(canonicalHref, LISTE_PFAD), "liste-canonical-ungueltig");
  fordere(canonicalHref === finalUrl, "liste-finalurl-nicht-canonical");

  const mains = elemente(tags, "main");
  fordere(mains.length === 1, "liste-main-mehrdeutig-oder-fehlend");
  fordere(hatKlasse(mains[0].attrs, "col-lg"), "liste-main-ohne-col-lg");
  fordere(!istVersteckt(mains[0].attrs), "liste-main-versteckt");
  const main = spanVon(tags, sichtbar, mains[0].index, "main");
  fordere(main, "liste-main-nicht-geschlossen");
  const listen = elemente(tagsImBereich(tags, main), "ul", attrs => hatKlasse(attrs, "list-entries"));
  fordere(listen.length === 1, "liste-entries-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(listen[0].attrs), "liste-entries-versteckt");
  const listenSpan = spanVon(tags, sichtbar, listen[0].index, "ul");
  fordere(listenSpan && listenSpan.end <= main.end, "liste-entries-nicht-geschlossen");

  const eintraege = direkteKinder(tags, listenSpan).filter(tag => tag.name === "li");
  fordere(eintraege.length > 0, "liste-ohne-eintraege");
  const zielPfad = artikelUrl.pathname;
  const treffer = [];
  const gesehen = new Set();
  for (const li of eintraege) {
    fordere(!istVersteckt(li.attrs), "liste-eintrag-versteckt");
    const liSpan = spanVon(tags, sichtbar, li.index, "li");
    fordere(liSpan && liSpan.end <= listenSpan.end, "liste-eintrag-nicht-geschlossen");
    const liTags = tagsImBereich(tags, liSpan);
    fordere(!liTags.some(tag => !tag.schliessend && istVersteckt(tag.attrs)),
      "liste-eintrag-versteckt");
    const links = elemente(liTags, "a", attrs => hatKlasse(attrs, "list-entry"));
    fordere(links.length === 1, "liste-eintrag-link-mehrdeutig-oder-fehlend");
    const link = links[0];
    fordere(!istVersteckt(link.attrs), "liste-eintrag-link-versteckt");
    const href = (link.attrs.href || "").trim();
    fordere(FUNDSTELLE_PFAD.test(href) && !href.includes("..") && !href.includes("%")
      && !href.includes("\\"), "liste-eintrag-link-ungueltig");
    const linkSpan = spanVon(tags, sichtbar, link.index, "a");
    fordere(linkSpan && linkSpan.end <= liSpan.end, "liste-eintrag-link-nicht-geschlossen");
    const daten = elemente(tagsImBereich(tags, linkSpan), "div", attrs => hatKlasse(attrs, "list-entry-date"));
    const titelDivs = elemente(tagsImBereich(tags, linkSpan), "div", attrs => hatKlasse(attrs, "list-entry-title"));
    fordere(daten.length === 1, "liste-eintrag-datum-mehrdeutig-oder-fehlend");
    fordere(titelDivs.length === 1, "liste-eintrag-titel-mehrdeutig-oder-fehlend");
    fordere(!istVersteckt(daten[0].attrs) && !istVersteckt(titelDivs[0].attrs),
      "liste-eintrag-versteckt");
    const datenSpan = spanVon(tags, sichtbar, daten[0].index, "div");
    const titelSpan = spanVon(tags, sichtbar, titelDivs[0].index, "div");
    fordere(datenSpan && datenSpan.end <= linkSpan.end && titelSpan && titelSpan.end <= linkSpan.end,
      "liste-eintrag-block-nicht-geschlossen");
    const datumText = textVon(datenSpan.inner);
    const m = TAG_DM.exec(datumText);
    fordere(m, "liste-eintrag-datum-ungueltig");
    const tag = tagDesWerts(`${m[3]}-${m[2]}-${m[1]}`);
    fordere(tag, "liste-eintrag-datum-ungueltig");
    fordere(!gesehen.has(href), "liste-eintrag-doppelt");
    gesehen.add(href);
    if (href === zielPfad) treffer.push({ href, tag, titel: textVon(titelSpan.inner), li });
  }
  fordere(treffer.length === 1, "liste-fundstelle-mehrdeutig-oder-fehlend");
  const fundstelle = treffer[0];
  fordere(fundstelle.tag === artikel.publikationstag, "liste-tag-widerspruch");
  fordere(fundstelle.titel === artikel.titel, "liste-titel-widerspruch");
  const eintragsId = /([0-9]+)$/.exec(fundstelle.href)[1];
  const ergebnis = { url: artikel.url, titel: fundstelle.titel,
    publikationstag: fundstelle.tag, eintragsId };
  fordere(Object.keys(ergebnis).length === LISTEN_FELDER.length, "liste-ergebnis-ungueltig");
  return Object.freeze(ergebnis);
}

module.exports = { VERSION, AUSGANG_FELDER, LISTEN_FELDER, pruefePresseartikel,
  pruefeFundstelleGegenListe };
