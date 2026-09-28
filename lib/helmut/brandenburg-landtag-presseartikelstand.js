"use strict";

// Helmut — Quellen-Artikelstand-Vertrag fuer die amtliche Landtag-Brandenburg-Pressefamilie.
// =============================================================================================
// BELEGTER ANLASS (lokale Vorbereitung der Landesversorgung Brandenburg, 28.09.2026): Der
// bestehende Artikelleser (brandenburg-landtag-presseartikel.js, PR #693) belegt amtliche URL,
// exakten Titel, den reinen Kalendertag und den vollstaendigen Artikeltext. Der bestehende
// RSS-Fundstellenleser (brandenburg-landtag-presse-rss.js, PR #694) bindet GENAU EIN Feed-Item
// ueber Nummer am kanonischen Pfad, exakten Titel und den LOKALEN Publikationstag an diesen
// Artikel und macht ERST DANN den expliziten RFC-822-Zeitpunkt als UTC sichtbar.
//
// Dieses Modul fuehrt beides in EINEN geschlossenen Standvertrag zusammen und vergibt fuer genau
// diesen geprueften Artikel eine eigene, unveraenderliche Quellenkennung:
//   Standhash = sha256([NAMESPACE, URL, exakter Titel, Tag, UTC-Zeitpunkt, Absatzhash, Volltexthash])
//   Rohzeile  = rd-<Standhash>, content_hash = <Standhash>
//
// Der gepruefte ERSTE ganze Sachabsatz steht unveraendert und exakt hashgebunden als summary.
// Der vollstaendige Artikeltext verlaesst dieses Modul NIE: er ist nur ueber seinen Hash gebunden.
// Die geschlossenen Stand-Metadaten (neun Felder) enthalten weder Volltext noch Roh-HTML noch
// fremde Raw-Felder.
//
// DIE EXPLIZITE UTC-ZEIT DARF NUR AUS DEM BEREITS GEBUNDENEN RSS-ITEM ENTSTEHEN. Der Stand
// uebernimmt sie nicht blind: er baut die Bindung aus ihren eigenen Feldern neu auf und verlangt,
// dass bindeRssItemAnArtikel denselben UTC-Zeitpunkt reproduziert. Artikelidentitaet (Nummer am
// kanonischen Pfad), exakter Titel und LOKALER Tag werden dabei erneut geprueft. Weder der
// Artikelkopf ("/ NNN" ist die Mitteilungsnummer), ein Listenstand noch ein lastBuildDate
// liefern jemals eine Uhrzeit; ohne gueltigen Item-pubDate bricht die Bindung ab.
//
// published_at bleibt wie bei allen bestehenden Staenden LEER. Die gebundene Uhrzeit steht
// ausschliesslich in den geschlossenen Stand-Metadaten; der timestamptz-Pfad ist und bleibt
// tagesgenau. Ein spaeterer, eigener Uhrzeitpfad muss ausdruecklich freigegeben und an einer
// Stelle umgesetzt werden — dieses Modul lockert keine bestehende Zeitregel.
//
// Zyklen: dieses Modul laedt beim Import NICHTS aus dem Repository (dedup und die beiden Leser
// werden lazy geladen), damit kein Aufrufer in eine Import-Rekursion laeuft.
//
// KEIN Netzwerk, KEINE Datei-, DB-, Modell- oder Productionwirkung.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");

const VERSION = 1;
const HERKUNFT = "brandenburg-landtag-pressemitteilung";
const NAMESPACE = "helmut-brandenburg-landtag-presseartikelstand-v1";
const ROHFELD = "helmutBrandenburgLandtagPresseArtikelstand";
// PostgREST-Leseralias fuer die rein lesende Dispatcher-/Storage-/Lage-Verdrahtung.
// Der Stand bleibt tagesgenau sichtbar; daraus folgt weder ein Live-Import noch ein Live-Crawl.
const POSTGREST_ALIAS = "brandenburg_artikelstand";
const MAX_TITEL = 300;
// Grenze des gebundenen ersten Sachabsatzes. Sie liegt deutlich ueber dem belegten Original
// (497 Zeichen), damit ein vollstaendig gepruefter erster Sachabsatz niemals gekuerzt wird.
const MAX_ZEICHEN_ERSTER_SACHABSATZ = 1200;
const HASH_64 = /^[a-f0-9]{64}$/;
const TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
// Kanonische Form (ohne www, ohne Tracking, ohne Trailing-Slash). Nur diese Form ist die stabile
// Adresse des Standes; die www-Fassung wird ueber dedup.canonicalizeUrl auf dieselbe Normalform
// abgebildet. Der Slug behaelt bewusst seine belegte Zeichenfamilie (enthielt im Original ':').
const BRANDENBURG_PRESSE_URL = /^https:\/\/landtag\.brandenburg\.de\/de\/meldungen\/[A-Za-z0-9._:!$&'()*+,;=@~-]+\/\d{1,10}$/;
const STAND_FELDER = Object.freeze(["version", "herkunft", "url", "titel", "publikationstag",
  "publikationszeitpunktUtc", "absatzHash", "volltextHash", "standHash"]);

const hash = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
function fordere(ok, grund) { if (!ok) throw new Error("brandenburg-landtag-presseartikelstand-" + grund); }
const fehlerGrund = (error, praefix) => /^[a-z]+-[a-z0-9-]{1,100}$/.test(error?.message || "")
  && error.message.startsWith(praefix) ? error.message.slice(praefix.length) : null;

// ---------------------------------------------------------------------------------------------
// Datumsgenauigkeit, Adresse und UTC
// ---------------------------------------------------------------------------------------------
// Kalendertag: ausschliesslich YYYY-MM-DD, gueltiges Datum. Keine Uhrzeit, keine Rundung, keine
// Ableitung.
function tagDesWerts(value) {
  if (typeof value !== "string") return null;
  const m = TAG.exec(value);
  if (!m) return null;
  const jahr = Number(m[1]), monat = Number(m[2]), tagut = Number(m[3]);
  const schaltjahr = jahr % 4 === 0 && (jahr % 100 !== 0 || jahr % 400 === 0);
  const tage = [31, schaltjahr ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (monat < 1 || monat > 12 || tagut < 1 || tagut > tage[monat - 1]) return null;
  return value;
}

// Nur die exakte amtliche Landtag-Pfadfamilie zaehlt; die kanonische Form (ohne www) ist die
// stabile Adresse des Standes.
function kanonischeArtikelUrl(value) {
  if (typeof value !== "string" || !/^https:\/\/(?:www\.)?landtag\.brandenburg\.de\//.test(value)) return null;
  let url;
  try { url = require("./dedup").canonicalizeUrl(value); } catch { return null; }
  return typeof url === "string" && BRANDENBURG_PRESSE_URL.test(url) ? url : null;
}

// Strenger UTC-ISO-8601-Vertrag (Millisekunden, Z). Nur ein kanonischer Zeitstempel zaehlt; eine
// lokale Zeitangabe oder ein anderer Offset waere keine gebundene UTC-Angabe.
function istUtcIso(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function standHashFuer(teile = {}) {
  const url = kanonischeArtikelUrl(teile.url);
  fordere(url && url === teile.url, "url-ungueltig");
  fordere(typeof teile.titel === "string" && teile.titel.length > 0 && teile.titel.length <= MAX_TITEL
    && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(teile.titel), "titel-ungueltig");
  const tag = tagDesWerts(teile.publikationstag);
  fordere(tag, "tag-ungueltig");
  fordere(istUtcIso(teile.publikationszeitpunktUtc), "zeit-ungueltig");
  fordere(typeof teile.absatzHash === "string" && HASH_64.test(teile.absatzHash), "absatzhash-ungueltig");
  fordere(typeof teile.volltextHash === "string" && HASH_64.test(teile.volltextHash), "volltexthash-ungueltig");
  return hash(JSON.stringify([NAMESPACE, url, teile.titel, tag, teile.publikationszeitpunktUtc,
    teile.absatzHash, teile.volltextHash]));
}

// Eine nichtleere summary eines Standes ist der gepruefte erste ganze Sachabsatz selbst. Sie muss
// exakt an den Absatzhash gebunden sein: keine generische Snippetgrenze, kein Satzpraefix, keine
// Kuerzung. Fehlende oder leere summary bleibt erlaubt (legacy/minimierte Leser); es wird niemals
// ein Absatz erfunden.
function standZusammenfassung(value, stand) {
  if (value == null || value === "") return null;
  fordere(typeof value === "string", "summary-ungueltig");
  fordere(value.length <= MAX_ZEICHEN_ERSTER_SACHABSATZ, "summary-zu-lang");
  fordere(hash(value) === stand.absatzHash, "summary-abweichend");
  return value;
}

function kennungFuerStand(stand) {
  return "rd-" + pruefeArtikelstand(stand).standHash;
}

// Geschlossene Metadaten: genau die neun Felder, keine unbekannten Zusatzfelder (also kein
// Volltext, kein Roh-HTML, keine fremden Raw-Felder), keine widerspruechliche Repraesentation.
// Rueckgabe ist eine eingefrorene Normalform.
function pruefeArtikelstand(value) {
  fordere(value && typeof value === "object" && !Array.isArray(value), "metadaten-ungueltig");
  fordere(Object.keys(value).length === STAND_FELDER.length
    && STAND_FELDER.every(feld => Object.hasOwn(value, feld)), "metadaten-ungueltig");
  fordere(value.version === VERSION, "version-ungueltig");
  fordere(value.herkunft === HERKUNFT, "herkunft-ungueltig");
  const url = kanonischeArtikelUrl(value.url);
  fordere(url && url === value.url, "url-ungueltig");
  fordere(typeof value.titel === "string" && value.titel.length > 0 && value.titel.length <= MAX_TITEL
    && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value.titel), "titel-ungueltig");
  fordere(!!tagDesWerts(value.publikationstag), "tag-ungueltig");
  fordere(istUtcIso(value.publikationszeitpunktUtc), "zeit-ungueltig");
  fordere(typeof value.absatzHash === "string" && HASH_64.test(value.absatzHash), "absatzhash-ungueltig");
  fordere(typeof value.volltextHash === "string" && HASH_64.test(value.volltextHash), "volltexthash-ungueltig");
  fordere(typeof value.standHash === "string" && HASH_64.test(value.standHash), "standhash-ungueltig");
  fordere(value.standHash === standHashFuer({ url: value.url, titel: value.titel,
    publikationstag: value.publikationstag, publikationszeitpunktUtc: value.publikationszeitpunktUtc,
    absatzHash: value.absatzHash, volltextHash: value.volltextHash }), "standhash-abweichend");
  return Object.freeze({ version: VERSION, herkunft: value.herkunft, url: value.url, titel: value.titel,
    publikationstag: value.publikationstag, publikationszeitpunktUtc: value.publikationszeitpunktUtc,
    absatzHash: value.absatzHash, volltextHash: value.volltextHash, standHash: value.standHash });
}

// Kleine Leseprojektion fuer Rohzeilen und bereits minimierte Zeilen. Ohne Stand-Metadaten bleibt
// alles unveraendert (null). Mit Metadaten wird strikt geprueft: ungueltige oder widerspruechliche
// Stand-Angaben werden abgewiesen und fallen NIEMALS still auf die URL-Identitaet zurueck.
function leseArtikelstand(quelle) {
  if (!quelle || typeof quelle !== "object" || Array.isArray(quelle)) return null;
  const direkt = quelle[POSTGREST_ALIAS];
  const roh = quelle.raw && typeof quelle.raw === "object" && !Array.isArray(quelle.raw)
    ? quelle.raw[ROHFELD] : undefined;
  const werte = [direkt, roh].filter(value => value != null);
  if (!werte.length) return null;
  const stand = pruefeArtikelstand(werte[0]);
  if (werte.length === 2) fordere(isDeepStrictEqual(werte[0], werte[1]), "darstellung-widerspruechlich");
  fordere((quelle.id == null || quelle.id === `rd-${stand.standHash}`)
    && (quelle.content_hash == null || quelle.content_hash === stand.standHash), "kennung-abweichend");
  const urls = ["url", "canonical_url", "canonical_target_url"]
    .map(feld => quelle[feld]).filter(value => typeof value === "string" && value !== "");
  // Leser-Projektionen (z. B. das Bestandsfenster) tragen nicht zwingend eine Adresse mit.
  // Jede MITGELIEFERTE Adresse muss aber exakt zum Stand gehoeren.
  fordere(urls.every(value => kanonischeArtikelUrl(value) === stand.url), "url-abweichend");
  if (Object.hasOwn(quelle, "title")) fordere(quelle.title === stand.titel, "titel-abweichend");
  // published_at ist timestamptz: der Stand bleibt wie alle bestehenden Staende tagesgenau. Die
  // gebundene Uhrzeit liegt ausschliesslich in den geschlossenen Stand-Metadaten; ein gesetzter
  // Zeitwert waere eine zweite, ungepruefte Zeitrepraesentation und damit widerspruechlich.
  for (const feld of ["published_at", "publishedAt"]) {
    if (Object.hasOwn(quelle, feld) && quelle[feld] != null && String(quelle[feld]).trim() !== "") {
      fordere(false, "veroeffentlichtzeit-widerspricht-stand");
    }
  }
  standZusammenfassung(quelle.summary, stand);
  return stand;
}

// ---------------------------------------------------------------------------------------------
// Gebundener erster Sachabsatz
// ---------------------------------------------------------------------------------------------
// Nur die geschlossene Absatzstruktur des Lesers zaehlt: genau die Absaetze, die der Leser aus
// geschlossenen <p> gewonnen hat, durch "\n\n" getrennt und mit genau einem abschliessenden
// Zeilenumbruch. Ein Fremdtext, eine Kuerzung oder eine eingebettete Zeilenumbruch-Folge brechen ab.
function ersterSachabsatz(volltext) {
  fordere(typeof volltext === "string" && volltext.endsWith("\n") && !volltext.includes("\r"),
    "volltext-ungueltig");
  const rumpf = volltext.slice(0, -1);
  const teile = rumpf.split("\n\n");
  fordere(teile.length > 0 && teile.every(teil => teil.length > 0 && !teil.includes("\n")),
    "absatzstruktur-ungueltig");
  const erster = teile[0];
  fordere(erster.length <= MAX_ZEICHEN_ERSTER_SACHABSATZ, "erster-sachabsatz-zu-lang");
  fordere(erster === erster.trimEnd() && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(erster),
    "erster-sachabsatz-ungueltig");
  return { erster, zahl: teile.length };
}

// ---------------------------------------------------------------------------------------------
// Erstellung des geschlossenen Standes
// ---------------------------------------------------------------------------------------------
function artikelFelder() { return require("./brandenburg-landtag-presseartikel").AUSGANG_FELDER; }
function bindungFelder() { return require("./brandenburg-landtag-presse-rss").BINDUNG_FELDER; }

// Der Dokumenttag darf nur exakt der lokale Publikationstag oder exakt der gebundene UTC-Zeitpunkt
// sein. Jede andere Angabe (gerundete Uhrzeit, Vermischung) ist widerspruechlich. Ein fehlender
// Wert ist zulaessig: der Stand bringt den Tag selbst mit.
function pruefeDokumentZeit(doc, stand) {
  for (const feld of ["published_at", "publishedAt"]) {
    const wert = doc[feld];
    if (wert == null || String(wert).trim() === "") continue;
    const s = String(wert);
    fordere(s === stand.publikationstag || s === stand.publikationszeitpunktUtc,
      "dokumentzeit-widerspruch");
  }
}

// Minimierte Rohzeile: dieselbe Minimierung wie im Bestand (dedup.toRawDocumentRow), aber mit der
// EIGENEN Standkennung. Kein Volltext, kein Roh-HTML, keine fremden Raw-Felder; die gebundene
// Uhrzeit bleibt ausschliesslich in den geschlossenen Stand-Metadaten (published_at bleibt leer).
function minimiereRohzeile(doc, stand, erster) {
  const dedup = require("./dedup");
  const basis = dedup.toRawDocumentRow(doc);
  fordere(basis && typeof basis === "object", "rohzeile-ungueltig");
  return {
    ...basis,
    id: `rd-${stand.standHash}`,
    content_hash: stand.standHash,
    summary: erster,
    published_at: null,
    raw: { ...basis.raw, [ROHFELD]: { ...stand } }
  };
}

function pruefeRohzeile(row, stand, erster) {
  fordere(row && row.id === `rd-${stand.standHash}` && row.content_hash === stand.standHash,
    "rohzeile-kennung-abweichend");
  fordere(row.summary === erster && row.summary === standZusammenfassung(row.summary, stand),
    "rohzeile-summary-abweichend");
  fordere(row.published_at === null, "rohzeile-zeit-abweichend");
  fordere(kanonischeArtikelUrl(row.canonical_url || row.url) === stand.url, "rohzeile-url-abweichend");
  fordere(row.title === stand.titel, "rohzeile-titel-abweichend");
  const metadaten = row.raw && row.raw[ROHFELD];
  fordere(metadaten && Object.keys(metadaten).length === STAND_FELDER.length
    && STAND_FELDER.every(feld => Object.hasOwn(metadaten, feld)), "rohzeile-metadaten-abweichend");
  fordere(isDeepStrictEqual({ ...metadaten }, { ...stand }), "rohzeile-metadaten-abweichend");
  // Kein Volltext und kein Roh-HTML irgendwo in der Zeile.
  fordere(!Object.hasOwn(row, "volltext") && !Object.hasOwn(row, "content") && !Object.hasOwn(row, "html")
    && !Object.hasOwn(metadaten, "volltext") && !Object.hasOwn(metadaten, "html"), "rohtext-beigabe");
  return true;
}

// Erstellung: ausschliesslich aus dem eingefrorenen, geschlossenen Ergebnis des amtlichen
// Landtag-Artikellesers UND der eingefrorenen Bindung des amtlichen RSS-Items. Es wird KEIN Inhalt
// neu gebunden: der Artikelbeleg wird erneut gegen seine eigenen Hashes geprueft, die Bindung aus
// ihren eigenen Feldern reproduziert und erst danach die Identitaetsprojektion gebildet.
function erzeugeArtikelstand(doc, artikel, bindung) {
  try {
    fordere(doc && typeof doc === "object" && !Array.isArray(doc), "eingabe-ungueltig");
    fordere(artikel && typeof artikel === "object" && !Array.isArray(artikel), "eingabe-ungueltig");
    fordere(bindung && typeof bindung === "object" && !Array.isArray(bindung), "eingabe-ungueltig");
    fordere(Object.isFrozen(artikel), "artikel-nicht-geschlossen");
    fordere(Object.isFrozen(bindung), "bindung-nicht-geschlossen");

    // Geschlossene Feldsaetze: genau der Artikelleser-Ausgang bzw. der RSS-Bindungsausgang.
    const af = artikelFelder();
    fordere(Object.keys(artikel).length === af.length && af.every(feld => Object.hasOwn(artikel, feld)),
      "artikel-felder-ungueltig");
    const bf = bindungFelder();
    fordere(Object.keys(bindung).length === bf.length && bf.every(feld => Object.hasOwn(bindung, feld)),
      "bindung-felder-ungueltig");

    // Der Artikelbeleg wird erneut gegen seine eigenen Hashes geprueft.
    fordere(typeof artikel.volltext === "string" && artikel.volltext.endsWith("\n")
      && !artikel.volltext.includes("\r"), "volltext-ungueltig");
    fordere(typeof artikel.volltextHash === "string" && HASH_64.test(artikel.volltextHash)
      && hash(artikel.volltext) === artikel.volltextHash, "volltexthash-abweichend");
    fordere(typeof artikel.htmlHash === "string" && HASH_64.test(artikel.htmlHash), "htmlhash-ungueltig");

    // Nur die exakte amtliche Pfadfamilie; die kanonische Form ist die stabile Standadresse.
    const url = kanonischeArtikelUrl(artikel.url);
    fordere(url && kanonischeArtikelUrl(doc.url || doc.canonical_url) === url, "artikelziel-abweichend");

    // Die Bindung wird aus ihren EIGENEN Feldern neu aufgebaut. Erst dadurch ist belegt, dass der
    // UTC-Zeitpunkt aus dem Item-pubDate stammt: Nummer am kanonischen Pfad, exakter Titel, lokaler
    // Tag und RFC-Zeitpunkt werden vom bestehenden Leser erneut erzeugt; jede Abweichung sperrt.
    const R = require("./brandenburg-landtag-presse-rss");
    const neu = R.bindeRssItemAnArtikel({ nummer: bindung.nummer, titel: bindung.titel,
      link: bindung.link, guid: bindung.guid, author: bindung.author, pubDate: bindung.pubDate,
      publikationstag: bindung.publikationstag }, artikel);
    fordere(isDeepStrictEqual({ ...neu }, { ...bindung }), "rss-bindung-abweichend");

    const titel = artikel.titel;
    // Exakter Titel, nicht nur eine normalisierte Aehnlichkeit: sonst waere der Standhash nicht
    // mehr an genau die belegte Artikelidentitaet gebunden.
    fordere(typeof doc.title === "string" && doc.title.length > 0 && doc.title.length <= MAX_TITEL
      && doc.title === titel, "titel-abweichend");
    const tag = artikel.publikationstag;
    fordere(tagDesWerts(tag) === tag && neu.publikationstag === tag, "tag-ungueltig");
    const utc = neu.publikationszeitpunktUtc;
    fordere(istUtcIso(utc), "zeit-ungueltig");
    fordere(neu.publikationszeitpunktUtc === bindung.publikationszeitpunktUtc, "rss-zeit-abweichend");

    const { erster } = ersterSachabsatz(artikel.volltext);
    const absatzHash = hash(erster);
    const stand = Object.freeze({ version: VERSION, herkunft: HERKUNFT, url, titel,
      publikationstag: tag, publikationszeitpunktUtc: utc, absatzHash,
      volltextHash: artikel.volltextHash,
      standHash: standHashFuer({ url, titel, publikationstag: tag, publikationszeitpunktUtc: utc,
        absatzHash, volltextHash: artikel.volltextHash }) });
    const kennung = "rd-" + stand.standHash;
    fordere(kennung !== "rd-" + hash("url:" + url), "namespace-kollision");
    pruefeDokumentZeit(doc, stand);

    const row = minimiereRohzeile(doc, stand, erster);
    pruefeRohzeile(row, stand, erster);
    return { ok: true, stand, row, absatz: erster };
  } catch (error) {
    return { ok: false, reason: fehlerGrund(error, "brandenburg-landtag-presseartikelstand-")
      || fehlerGrund(error, "brandenburg-landtag-presse-rss-") || "eingabe-ungueltig" };
  }
}

// Bequemer, sanktionierter Weg "aus dem amtlichen RSS-Item": erst den amtlichen Originaltext
// vollstaendig pruefen, danach GENAU EIN Item binden, danach nur die Identitaetsprojektion bilden.
// HTML-Rohtext und Volltext verlassen diese Funktion nicht im Ergebnis.
function standAusRssItem(doc, item, artikelEingabe) {
  let artikel;
  try { artikel = require("./brandenburg-landtag-presseartikel").pruefePresseartikel(artikelEingabe); }
  catch (error) {
    return { ok: false, reason: fehlerGrund(error, "brandenburg-landtag-presseartikel-") || "quelle-ungueltig" };
  }
  let bindung;
  try { bindung = require("./brandenburg-landtag-presse-rss").bindeRssItemAnArtikel(item, artikel); }
  catch (error) {
    return { ok: false, reason: fehlerGrund(error, "brandenburg-landtag-presse-rss-") || "rss-bindung-ungueltig" };
  }
  return erzeugeArtikelstand(doc, artikel, bindung);
}

module.exports = { VERSION, HERKUNFT, NAMESPACE, ROHFELD, POSTGREST_ALIAS, MAX_TITEL,
  MAX_ZEICHEN_ERSTER_SACHABSATZ, BRANDENBURG_PRESSE_URL, STAND_FELDER, tagDesWerts,
  kanonischeArtikelUrl, istUtcIso, standHashFuer, standZusammenfassung, kennungFuerStand,
  pruefeArtikelstand, leseArtikelstand, ersterSachabsatz, erzeugeArtikelstand, standAusRssItem };
