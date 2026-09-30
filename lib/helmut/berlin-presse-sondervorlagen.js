"use strict";

// Helmut — strenger, rein lokaler Parser fuer die beiden amtlichen Berliner
// Senats-Pressemitteilungs-Pfadfamilien AUSSERHALB des Pressearchivs.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Berlin, 28.09.2026): Die amtliche
// Presseuebersicht verlinkt sechs Senatsmeldungen. Drei davon liegen im Pressearchiv
// (eigener Vertrag in berlin-presseartikel.js). Zwei weitere Pfadfamilien wurden einmalig
// mit HTTP 200 rein lesend gesichert und haben eine ANDERE, eigene Vorlage:
//
//   * Senatskanzlei/Presseamt: /rbmskzl/aktuelles/pressemitteilungen/<jahr>/pressemitteilung.<nr>.php
//   * Senatsverwaltung (hier Wirtschaft): /sen/web/presse/pressemitteilungen/<jahr>/pressemitteilung.<nr>.php
//
// Beide Vorlagen tragen einen eigenen H1 in der herounit, ein dcterms.date als reinen
// Kalendertag, ein dcterms.title und einen Datumssatz in p.pressnumber. Der Artikeltext liegt in
// genau einer geschlossenen div.textile NACH dem Pressnumber und VOR dem Randbereich
// (layout-grid__area--marginal, Kontaktblock). Die SenWEB-Familie hat zwischen Artikeltext und
// Randbereich noch ein PDF-Downloadmodul; es gehoert NICHT zum Artikeltext. Eine belastbare
// Uhrzeit liefert keine der beiden Vorlagen; dieses Modul fuehrt deshalb bewusst kein
// published_at und erfindet keine Uhrzeit.
//
// Vertrag (pruefeSondervorlage):
//   Eingang: { url, finalUrl, http, html } — genau diese vier Felder, keine anderen.
//   Ausgang: { url, pfadfamilie, titel, publikationstag, volltext, volltextHash, htmlHash,
//             auszug, auszugHash } (eingefroren).
//
// Die Auszugsregel ist NICHT generisch umschaltbar, sondern an die belegte Familie gebunden:
//   * rbmskzl: der erste Absatz ist exakt die Absenderformel
//     "Das Presse- und Informationsamt des Landes Berlin teilt mit:", der Auszug ist der
//     zweite Absatz.
//   * senweb: der erste Absatz ist bereits der fachliche Sachabsatz, der Auszug ist der
//     erste Absatz.
// Fehlt die belegte Form, bricht das Modul ab (fail closed) — es gibt keinen Ersatzabsatz,
// keine Kuerzung und keine Umschaltung.
//
// Fail closed: fehlende, doppelte oder unterschiedliche Eingabefelder, fremde Hosts/Pfade,
// Query/Tracking, Canonical-/Titel-/Tagesdrift, versteckte oder kommentierte Doppelungen,
// ausbrechende Absatzgrenzen, Fremdinhalt im Textile sowie PDF-/Kontaktinhalte brechen ab.
//
// Keine neue Abhaengigkeit, kein DOM-Paket: HTML wird mit einem eigenen, kommentar- und
// skriptbewussten Tokenleser ausgewertet. Die Grenze des Artikels wird ueber die zugehoerige
// schliessende Auszeichnung bestimmt (nicht ueber eine offene Regex) und damit belegbar
// abgegrenzt. Der bestehende Pressearchiv-Vertrag (berlin-presseartikel.js) bleibt unberuehrt.
//
// KEIN Netzwerk, KEINE Datei-, DB-, Modell- oder Productionwirkung.

const crypto = require("node:crypto");

const VERSION = "berlin-presse-sondervorlagen-v1";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const HASH_64 = /^[a-f0-9]{64}$/;
const TAG_TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const BERLIN_HOSTS = new Set(["berlin.de", "www.berlin.de"]);
const EINGANG_FELDER = ["finalUrl", "html", "http", "url"];
const AUSGANG_FELDER = Object.freeze(["url", "pfadfamilie", "titel", "publikationstag",
  "volltext", "volltextHash", "htmlHash", "auszug", "auszugHash"]);

// Die exakt belegte Absenderformel der RBMSKZL-Familie.
const ABSENDER_RB = "Das Presse- und Informationsamt des Landes Berlin teilt mit:";
// Gebundene Grenze des Auszugs: substantiv, ein ganzer Absatz, keine Kuerzung.
const MIN_AUSZUG_ZEICHEN = 120;
const MAX_AUSZUG_ZEICHEN = 1200;

// Genau die zwei belegten Pfadfamilien. `absenderformel: true` bindet die RBMSKZL-Auszugsform
// (Formel zuerst, Auszug = zweiter Absatz); `false` bindet die SenWEB-Form (Auszug = erster
// Sachabsatz). Keine weitere Senats- oder Pressearchiv-Familie ist zugelassen.
const FAMILIEN = Object.freeze([
  Object.freeze({ name: "rbmskzl", basis: "rbmskzl/aktuelles/pressemitteilungen", absenderformel: true }),
  Object.freeze({ name: "senweb", basis: "sen/web/presse/pressemitteilungen", absenderformel: false }),
  Object.freeze({ name: "justv", basis: "sen/justv/presse/pressemitteilungen", absenderformel: false }),
  Object.freeze({ name: "kultgz", basis: "sen/kultgz/aktuelles/pressemitteilungen", absenderformel: false })
]);
const FAMILIEN_NAMEN = Object.freeze(FAMILIEN.map(familie => familie.name));
const PFAD = /^\/(rbmskzl\/aktuelles\/pressemitteilungen|sen\/web\/presse\/pressemitteilungen|sen\/justv\/presse\/pressemitteilungen|sen\/kultgz\/aktuelles\/pressemitteilungen)\/(\d{4})\/pressemitteilung\.(\d+)\.php$/;

const hash = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
function fordere(ok, grund) { if (!ok) throw new Error("berlin-presse-sondervorlagen-" + grund); }

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
// Nur HTTPS auf berlin.de/www.berlin.de, ohne Benutzerinfo, ohne Portangabe, ohne Query/Tracking
// und ohne Fragment. Rueckgabe: geparste URL oder null.
function pruefeAmtlicheUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) return null;
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1];
  if (!authority || authority.includes(":")) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.port !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (!BERLIN_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url;
}

// Genau die zwei belegten Pfadfamilien; Jahr als eigener Pfadabschnitt, Datei pressemitteilung.<nr>.php.
function familieDesPfads(url) {
  const treffer = PFAD.exec(url.pathname);
  if (!treffer) return null;
  const familie = FAMILIEN.find(kandidat => kandidat.basis === treffer[1]);
  if (!familie) return null;
  return { familie, jahr: treffer[2], nummer: treffer[3] };
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
// Jede Artikelstruktur, die NUR dort existiert, laesst die Markerzaehlung der sichtbaren Fassung
// von der Rohfassung abweichen und bricht fail closed ab.
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
  /class\s*=\s*["'][^"']*\bpressnumber\b/gi,
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

// Leere (void) Elemente werden nicht als offene Huelle gefuehrt.
const LEERE_ELEMENTE = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"]);

// Offene Huellen an einer Position. Damit werden versteckte Elternelemente und die Zugehoerigkeit
// eines Absatzes zu einem Modul belegbar, ohne eine Baumstruktur zu behaupten.
function ahnenStapel(tags, index) {
  const stapel = [];
  for (const tag of tags) {
    if (tag.index >= index) break;
    if (LEERE_ELEMENTE.has(tag.name)) continue;
    if (tag.schliessend) {
      for (let i = stapel.length - 1; i >= 0; i--) {
        if (stapel[i].name === tag.name) { stapel.length = i; break; }
      }
      continue;
    }
    if (/\/\s*>$/.test(tag.text)) continue;
    stapel.push(tag);
  }
  return stapel;
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
const kennungEnthaelt = (attrs, teil) => [attrs.class, attrs.id]
  .some(wert => (wert || "").toLowerCase().includes(teil));

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

function bereich(tags, html, id, rohHtml) {
  const treffer = elemente(tags, null, attrs => attrs.id === id);
  fordere(treffer.length === 1, "bereich-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(treffer[0].attrs), "bereich-versteckt");
  fordere(ahnenStapel(tags, treffer[0].index).every(huelle => !istVersteckt(huelle.attrs)),
    "bereich-in-versteckter-huelle");
  const span = spanVon(tags, html, treffer[0].index, treffer[0].name);
  fordere(span, "bereich-nicht-geschlossen");
  if (rohHtml) {
    const rohTreffer = elemente(tokenisiere(rohHtml), null, attrs => attrs.id === id);
    fordere(rohTreffer.length === 1, "bereich-mehrdeutig-oder-fehlend");
  }
  return span;
}

// ---------------------------------------------------------------------------------------------
// Artikeltext: genau eine geschlossene div.textile nach Pressnumber und vor dem Randbereich
// ---------------------------------------------------------------------------------------------
function artikelTextile(tags, html, { maincontent, marginal, pressnumberEnde }) {
  const kandidaten = elemente(tagsImBereich(tags, maincontent), "div", attrs => hatKlasse(attrs, "textile"))
    .filter(tag => tag.index >= pressnumberEnde && tag.index < marginal.start);
  fordere(kandidaten.length === 1, "textile-mehrdeutig-oder-fehlend");
  const textilTag = kandidaten[0];
  fordere(!istVersteckt(textilTag.attrs), "textile-versteckt");
  fordere(ahnenStapel(tags, textilTag.index).every(huelle => !istVersteckt(huelle.attrs)),
    "textile-in-versteckter-huelle");
  const textile = spanVon(tags, html, textilTag.index, "div");
  fordere(textile && textile.start >= maincontent.start && textile.end <= maincontent.end,
    "textile-ausserhalb-maincontent");
  fordere(textile.end <= marginal.start, "textile-nicht-vor-marginal");
  return textile;
}

function pruefeKeinFremdmodul(textile, tags, familie) {
  const textileTags = tagsImBereich(tags, textile);
  // PDF-Download-, Kontakt- und sonstige Module gehoeren nie zum Artikeltext.
  fordere(textileTags.every(tag => !kennungEnthaelt(tag.attrs, "download")), "downloadmodul-im-artikel");
  fordere(textileTags.every(tag => !kennungEnthaelt(tag.attrs, "contact")), "kontaktblock-im-artikel");
  fordere(textileTags.every(tag => tag.name !== "address"), "kontaktblock-im-artikel");
  const mailtoLinks = elemente(textileTags, "a", attrs => /^mailto:/i.test(attrs.href || ""));
  const mailtoNennungen = textile.inner.match(/mailto:/gi) || [];
  fordere(!/tel:/i.test(textile.inner), "kontaktblock-im-artikel");
  if (familie.name === "kultgz") {
    const href = mailtoLinks[0] && mailtoLinks[0].attrs.href;
    fordere(mailtoLinks.length === 1 && mailtoNennungen.length === 1
      && /^mailto:[^?#\s]+@[^?#\s]+$/i.test(href || ""), "kontaktblock-im-artikel");
  } else {
    fordere(mailtoLinks.length === 0 && mailtoNennungen.length === 0, "kontaktblock-im-artikel");
  }
  fordere(!/<(?:script|style|template|noscript)\b|<!--/i.test(textile.inner), "skript-oder-kommentar-im-textile");
  fordere(textileTags.every(tag => !istVersteckt(tag.attrs)), "versteckter-inhalt-im-textile");
}

// Ausserhalb des Artikels darf im Bereich zwischen Pressnumber und Randbereich kein loser
// Absatz stehen. Zulaessig sind nur Absaetze innerhalb von Modulen (z. B. dem PDF-Downloadmodul
// der SenWEB-Familie), die nicht zum Artikeltext gehoeren.
function fordereNurArtikelabsaetze(tags, { pressnumberEnde, marginal, textile }) {
  const fenster = tags.filter(tag => tag.index >= pressnumberEnde && tag.index < marginal.start);
  for (const tag of elemente(fenster, "p")) {
    if (tag.index >= textile.start && tag.index < textile.end) continue;
    fordere(ahnenStapel(tags, tag.index).some(huelle => kennungEnthaelt(huelle.attrs, "modul-")),
      "absatz-ausserhalb-artikel");
  }
}

function absaetzeImTextile(tags, html, textile) {
  const textileTags = tagsImBereich(tags, textile);
  const absatzTags = elemente(textileTags, "p");
  fordere(absatzTags.length > 0, "absaetze-fehlend");
  const absaetze = [];
  const benutzt = [];
  for (const tag of absatzTags) {
    const span = spanVon(tags, html, tag.index, "p");
    fordere(span && span.end <= textile.end, "absatz-nicht-geschlossen");
    fordere(!istVersteckt(tag.attrs), "absatz-versteckt");
    const text = textVon(span.inner);
    fordere(text.length > 0, "absatz-leer");
    absaetze.push(text);
    benutzt.push(span);
  }
  // Alles ausserhalb der Absaetze im Textile muss reine Formatierung sein. Die eigenen
  // oeffnenden und schliessenden Auszeichnungen des Textile zaehlen nicht als Fremdinhalt.
  const erstesTag = /^<[^>]*>/.exec(textile.inner);
  const letztesTag = /<\/[^>]*>\s*$/.exec(textile.inner);
  const inhaltStart = textile.start + (erstesTag ? erstesTag[0].length : 0);
  const inhaltEnde = textile.end - (letztesTag ? letztesTag[0].length : 0);
  let rest = "";
  for (let pos = inhaltStart; pos < inhaltEnde;) {
    const naechster = benutzt.find(span => span.start >= pos);
    const bis = naechster ? naechster.start : inhaltEnde;
    rest += html.slice(pos, bis);
    pos = naechster ? naechster.end : inhaltEnde;
  }
  fordere(!/<\/?[a-z]/i.test(rest), "textile-fremdinhalt");
  fordere(new Set(absaetze).size === absaetze.length, "absatz-doppler");
  return absaetze;
}

// ---------------------------------------------------------------------------------------------
// Hauptpruefung
// ---------------------------------------------------------------------------------------------
function pruefeSondervorlage(eingabe) {
  fordere(eingabe && typeof eingabe === "object" && !Array.isArray(eingabe), "eingabe-ungueltig");
  const feldnamen = Object.keys(eingabe).sort();
  fordere(feldnamen.length === EINGANG_FELDER.length && feldnamen.join(",") === EINGANG_FELDER.join(","),
    "eingabefelder-ungueltig");

  const { url, finalUrl, http, html } = eingabe;
  fordere(Number.isInteger(http) && http === 200, "http-nicht-ok");
  fordere(typeof html === "string" && html.length > 0, "html-fehlt");
  fordere(Buffer.byteLength(html, "utf8") <= MAX_HTML_BYTES, "html-zu-gross");

  // Adresse: HTTPS berlin.de ohne Benutzerinfo/Port/Tracking. Kanonisch == final == Eingabe.
  const urlTeile = pruefeAmtlicheUrl(url);
  fordere(urlTeile, "url-ungueltig");
  const finalUrlTeile = pruefeAmtlicheUrl(finalUrl);
  fordere(finalUrlTeile, "finalurl-ungueltig");
  fordere(url === finalUrl, "url-nicht-finalurl");

  // Genau eine der vier belegten Pfadfamilien; jede andere Senats-/Pressearchivadresse bricht ab.
  const pfad = familieDesPfads(finalUrlTeile);
  fordere(pfad, "pfadfamilie-ungueltig");
  const { familie, jahr: pfadJahr } = pfad;

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

  // Eindeutiges dcterms.date (Kalendertag); Pfadjahr und Datumsjahr muessen uebereinstimmen.
  const datumsWerte = metaWerte(tags, "dcterms.date");
  fordere(datumsWerte.length === 1, "dcterms.date-mehrdeutig-oder-fehlend");
  fordere(metaWerte(headTags, "dcterms.date").length === 1, "dcterms.date-nicht-im-head");
  const publikationstag = tagDesWerts(datumsWerte[0]);
  fordere(publikationstag, "dcterms.date-ungueltig");
  fordere(publikationstag.slice(0, 4) === pfadJahr, "pfadjahr-abweichend");

  // Eindeutiger Titel; der sichtbare eigene H1 in der herounit muss ihn tragen.
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

  // Sichtbare Hauptbereichsgrenzen: Artikelbereich und getrennter Randbereich (Kontaktblock).
  const maincontent = bereich(tags, sichtbar, "layout-grid__area--maincontent", html);
  const marginal = bereich(tags, sichtbar, "layout-grid__area--marginal", html);
  // Der Artikelbereich beginnt vor dem getrennten Randbereich; der Artikeltext wird zusaetzlich
  // hart auf den Bereich zwischen Pressnumber und Randbereich begrenzt (artikelTextile).
  fordere(maincontent.start < marginal.start, "marginal-vor-maincontent");

  // Der Datumssatz steht in genau einem eigenen geschlossenen pressnumber-Absatz.
  const pressnumber = elemente(tagsImBereich(tags, maincontent), "p",
    attrs => hatKlasse(attrs, "pressnumber"));
  fordere(pressnumber.length === 1, "pressemitteilung-datum-mehrdeutig-oder-fehlend");
  fordere(!istVersteckt(pressnumber[0].attrs), "pressemitteilung-datum-versteckt");
  fordere(ahnenStapel(tags, pressnumber[0].index).every(huelle => !istVersteckt(huelle.attrs)),
    "pressemitteilung-datum-in-versteckter-huelle");
  const pressSpan = spanVon(tags, sichtbar, pressnumber[0].index, "p");
  fordere(pressSpan && pressSpan.end <= maincontent.end, "pressemitteilung-datum-nicht-geschlossen");
  const pressemitteilung = /^Pressemitteilung vom (\d{2})\.(\d{2})\.(\d{4})$/.exec(textVon(pressSpan.inner));
  fordere(pressemitteilung, "pressemitteilung-datum-ungueltig");
  const [, pmTag, pmMonat, pmJahr] = pressemitteilung;
  const pmDatum = tagDesWerts(`${pmJahr}-${pmMonat}-${pmTag}`);
  fordere(pmDatum && pmDatum === publikationstag, "pressemitteilung-datum-abweichend");

  // Genau eine geschlossene relevante div.textile nach dem Pressnumber und vor marginal.
  const textile = artikelTextile(tags, sichtbar, { maincontent, marginal, pressnumberEnde: pressSpan.end });
  pruefeKeinFremdmodul(textile, tags, familie);
  fordereNurArtikelabsaetze(tags, { pressnumberEnde: pressSpan.end, marginal, textile });

  // Roh-Gegenprobe auf der UNgekuerzten Quelle: Skripte, Stile, Vorlagen und Kommentare duerfen
  // den Artikeltext nicht verstecken; die Artikelgrenze wird zusaetzlich am Roh-HTML belegt.
  const rohTags = tokenisiere(html);
  const rohMain = bereich(rohTags, html, "layout-grid__area--maincontent");
  const rohMarginal = bereich(rohTags, html, "layout-grid__area--marginal");
  const rohPress = elemente(tagsImBereich(rohTags, rohMain), "p", attrs => hatKlasse(attrs, "pressnumber"));
  fordere(rohPress.length === 1, "pressemitteilung-datum-mehrdeutig-oder-fehlend");
  const rohPressSpan = spanVon(rohTags, html, rohPress[0].index, "p");
  fordere(rohPressSpan, "pressemitteilung-datum-nicht-geschlossen");
  const rohTextilien = elemente(tagsImBereich(rohTags, rohMain), "div", attrs => hatKlasse(attrs, "textile"))
    .filter(tag => tag.index >= rohPressSpan.end && tag.index < rohMarginal.start);
  fordere(rohTextilien.length === 1, "roh-textile-mehrdeutig-oder-fehlend");
  const rohTextile = spanVon(rohTags, html, rohTextilien[0].index, "div");
  fordere(rohTextile && rohTextile.end <= rohMarginal.start, "roh-textile-nicht-vor-marginal");
  fordere(!/<(?:script|style|template|noscript)\b|<!--/i.test(rohTextile.inner), "skript-oder-kommentar-im-artikel");

  // Nur volle geschlossene Absaetze des Textile sind Artikeltext.
  const absaetze = absaetzeImTextile(tags, sichtbar, textile);
  const volltext = absaetze.join("\n\n") + "\n";

  // Belegter Auszugsabsatz, gebunden an die Pfadfamilie — kein generisches Umschalten.
  let auszug;
  if (familie.absenderformel) {
    fordere(absaetze.length >= 2, "absenderformel-oder-sachabsatz-fehlend");
    fordere(absaetze[0] === ABSENDER_RB, "absenderformel-abweichend");
    auszug = absaetze[1];
  } else {
    auszug = absaetze[0];
  }
  fordere(auszug !== ABSENDER_RB, "sachabsatz-fehlend");
  fordere(auszug.length >= MIN_AUSZUG_ZEICHEN, "auszug-zu-kurz");
  fordere(auszug.length <= MAX_AUSZUG_ZEICHEN, "auszug-zu-lang");

  const ergebnis = { url: finalUrl, pfadfamilie: familie.name, titel, publikationstag, volltext,
    volltextHash: hash(volltext), htmlHash: hash(html), auszug, auszugHash: hash(auszug) };
  fordere(Object.keys(ergebnis).length === AUSGANG_FELDER.length && HASH_64.test(ergebnis.volltextHash)
    && HASH_64.test(ergebnis.htmlHash) && HASH_64.test(ergebnis.auszugHash), "ergebnis-ungueltig");
  return Object.freeze(ergebnis);
}

module.exports = { VERSION, AUSGANG_FELDER, FAMILIEN, FAMILIEN_NAMEN, ABSENDER_RB,
  MIN_AUSZUG_ZEICHEN, MAX_AUSZUG_ZEICHEN, pruefeSondervorlage };
