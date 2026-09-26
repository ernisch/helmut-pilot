"use strict";

// Helmut — Quellen-Artikelstand-Vertrag fuer den belegten Bundestags-Textarchiv-Fall.
// =============================================================================================
// BELEGTER ANLASS (docs/betrieb/bundestag-leitabsatz-20260926.md): Ein amtlicher Artikel
// desselben Textarchiv-Pfads kann unter derselben URL einen NEUEN Titel und Tag tragen.
// Der regulaere content_hash kennt nur die URL und kollidiert deshalb mit der bereits
// gespeicherten historischen Fassung derselben Adresse.
//
// Dieser Vertrag vergibt deshalb NUR fuer den automatisch gewonnenen, vollstaendig gepruefte
// v2-Bundestags-Leitabsatz eine eigene, unveraenderliche Quellenkennung:
//   Standhash = sha256(["helmut-bundestag-artikelstand-v1", URL, exakter Titel, Tag, Absatzhash])
//   Rohzeile  = rd-<Standhash>, content_hash = <Standhash>, published_at = null
//
// Eigener Namespace: die Kennung ist niemals die alte URL-Kennung. Kein beliebiger item.id
// dient als Identitaetsbeweis, kein Crawl/Import wird hier aktiviert, keine Uhrzeit erfunden.
// Die vollstaendige geschlossene Stand-Metadaten liegt danach in raw.helmutBundestagArtikelstand
// (Version, Herkunft, URL, Titel, Publikationstag, Absatzhash, Standhash) — ohne Absatztext,
// ohne Roh-HTML und ohne fremde Raw-Felder. Der vollstaendige Artikelbeleg bleibt separat im
// bestehenden artikelkontext-Vertrag.
//
// Der validierte Leitabsatz selbst steht zusaetzlich unveraendert als summary der Rohzeile
// (bis zur bereits erlaubten 1200-Zeichen-Grenze, niemals gekuerzt oder praefixiert). Eine
// nichtleere summary eines Standes MUSS exakt an den Absatzhash gebunden sein; fehlende oder
// leere summary (minimierte Leser, bestehende legacy-Zeilen) bleibt lesbar, ohne einen
// Absatz zu erfinden.
//
// Zyklen: dieses Modul laedt beim Import NICHTS aus dem Repository. artikelkontext.js (A) und
// quellen-zeitvertrag.js (Q) koennen es deshalb lazy laden, dedup.js ebenso — keine Rekursion.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");

const VERSION = 1;
const HERKUNFT = "bundestag-textarchiv-leitabsatz";
const NAMESPACE = "helmut-bundestag-artikelstand-v1";
const MAX_TITEL = 300;
const HASH_64 = /^[a-f0-9]{64}$/;
const TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
const BUNDESTAG_ARTIKEL_URL = /^https:\/\/(?:www\.)?bundestag\.de\/dokumente\/textarchiv\/\d{4}\/[a-z0-9-]+-\d+$/;
const STAND_FELDER = Object.freeze(["version", "herkunft", "url", "titel", "publikationstag", "absatzHash", "standHash"]);
const BELEG_FELDER = new Set(["version", "dokumentId", "quellenHash", "artikelUrl", "artikelTitel",
  "herkunft", "gelesenAm", "absatzPosition", "text", "textHash", "gewinnung"]);
const GEWINNUNG_FELDER = new Set(["verfahren", "positionsbasis", "antwortHash", "artikelTextHash",
  "artikelTextPosition", "titelTreffer", "kandidatZahl", "artikelAbsatzZahl"]);

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
function fordere(ok, grund) { if (!ok) throw new Error("bundestag-artikelstand-" + grund); }
const fehlerGrund = (error, praefix) => /^[a-z]+-[a-z0-9-]{1,100}$/.test(error?.message || "")
  && error.message.startsWith(praefix) ? error.message.slice(praefix.length) : null;

// Datumsgenauigkeit: hier ausschliesslich der Kalendertag YYYY-MM-DD. Eine Uhrzeit oder ein
// Zeitstempel wird nicht gerundet, nicht abgeschnitten und nicht erfunden.
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

// Nur die exakte amtliche Textarchiv-Form zaehlt; die kanonische Form (ohne www, ohne
// Tracking, ohne Trailing-Slash) ist die stabile Adresse des Standes.
function kanonischeArtikelUrl(value) {
  if (typeof value !== "string" || !BUNDESTAG_ARTIKEL_URL.test(value)) return null;
  let url;
  try { url = require("./dedup").canonicalizeUrl(value); } catch { return null; }
  return typeof url === "string" && url ? url : null;
}

function standHashFuer(teile = {}) {
  const url = kanonischeArtikelUrl(teile.url);
  fordere(url && url === teile.url, "url-ungueltig");
  fordere(typeof teile.titel === "string" && teile.titel.length > 0 && teile.titel.length <= MAX_TITEL
    && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(teile.titel), "titel-ungueltig");
  const tag = tagDesWerts(teile.publikationstag);
  fordere(tag, "tag-ungueltig");
  fordere(typeof teile.absatzHash === "string" && HASH_64.test(teile.absatzHash), "absatzhash-ungueltig");
  return hash(JSON.stringify([NAMESPACE, url, teile.titel, tag, teile.absatzHash]));
}

// Eine nichtleere summary eines Standes ist der validierte Leitabsatz selbst. Sie muss
// exakt an den Absatzhash gebunden sein: keine generische Snippetgrenze, kein Satzpraefix,
// keine Kuerzung. Fehlende oder leere summary bleibt erlaubt (legacy/minimierte Leser);
// es wird niemals ein Absatz erfunden.
function standZusammenfassung(value, stand) {
  if (value == null || value === "") return null;
  fordere(typeof value === "string", "summary-ungueltig");
  fordere(value.length <= require("./artikelkontext").MAX_ZEICHEN_BUNDESTAG_LEITABSATZ, "summary-zu-lang");
  fordere(hash(value) === stand.absatzHash, "summary-abweichend");
  return value;
}

function kennungFuerStand(stand) {
  return "rd-" + pruefeArtikelstand(stand).standHash;
}

// Geschlossene Metadaten: genau die sieben Felder, keine unbekannten Zusatzfelder, keine
// widerspruechliche Repraesentation. Rueckgabe ist eine eingefrorene Normalform.
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
  fordere(typeof value.absatzHash === "string" && HASH_64.test(value.absatzHash), "absatzhash-ungueltig");
  fordere(typeof value.standHash === "string" && HASH_64.test(value.standHash), "standhash-ungueltig");
  fordere(value.standHash === standHashFuer({ url: value.url, titel: value.titel,
    publikationstag: value.publikationstag, absatzHash: value.absatzHash }), "standhash-abweichend");
  return Object.freeze({ version: VERSION, herkunft: HERKUNFT, url: value.url, titel: value.titel,
    publikationstag: value.publikationstag, absatzHash: value.absatzHash, standHash: value.standHash });
}

// Kleine Leseprojektion fuer Rohzeilen, Leser-Aliase (raw->helmutBundestagArtikelstand) und
// bereits minimierte Zeilen. Ohne Stand-Metadaten bleibt alles unveraendert (null). Mit
// Metadaten wird strikt geprueft: ungueltige oder widerspruechliche Stand-Angaben werden
// abgewiesen und fallen NIEMALS still auf die alte URL-Identitaet zurueck.
function leseArtikelstand(quelle) {
  if (!quelle || typeof quelle !== "object" || Array.isArray(quelle)) return null;
  const direkt = quelle.bundestag_artikelstand;
  const roh = quelle.raw && typeof quelle.raw === "object" && !Array.isArray(quelle.raw)
    ? quelle.raw.helmutBundestagArtikelstand : undefined;
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
  // published_at ist timestamptz: bei ausschliesslich bekanntem Tag bleibt die Spalte leer.
  // Ein gesetzter Zeitwert waere eine erfundene Uhrzeit und damit widerspruechlich.
  for (const feld of ["published_at", "publishedAt"]) {
    if (Object.hasOwn(quelle, feld) && quelle[feld] != null && String(quelle[feld]).trim() !== "") {
      fordere(false, "veroeffentlichtzeit-widerspricht-tag");
    }
  }
  // Eine nichtleere summary muss der validierte Leitabsatz sein. Fehlende oder leere
  // summary bleibt lesbar (legacy/minimierte Leser), ohne einen Absatz zu erfinden.
  standZusammenfassung(quelle.summary, stand);
  return stand;
}

// Erstellung: ausschliesslich aus einem vorhandenen, automatisch validierten v2-Bundestags-
// Leitabsatz. Erst wird der urspruengliche Beleg vollstaendig gegen das urspruengliche
// Dokument geprueft, danach nur die Identitaetsprojektion neu gebunden — kein neuer Inhalt.
function erzeugeArtikelstand(doc, beleg) {
  try {
    fordere(doc && typeof doc === "object" && !Array.isArray(doc), "eingabe-ungueltig");
    fordere(beleg && typeof beleg === "object" && !Array.isArray(beleg), "eingabe-ungueltig");
    for (const feld of Object.keys(beleg)) fordere(BELEG_FELDER.has(feld), "beleg-feld-unbekannt");
    const gewinnung = beleg.gewinnung;
    if (gewinnung !== undefined) {
      fordere(gewinnung && typeof gewinnung === "object" && !Array.isArray(gewinnung), "beleg-ungueltig");
      for (const feld of Object.keys(gewinnung)) fordere(GEWINNUNG_FELDER.has(feld), "gewinnung-feld-unbekannt");
    }
    fordere(beleg.version === 2 && beleg.herkunft === "strukturierter-originalartikel"
      && gewinnung?.verfahren === "bundestag-artikel-leitabsatz-v1"
      && gewinnung?.positionsbasis === "html-article-p", "beleg-nicht-bundestag");
    let geprueft;
    try { geprueft = require("./artikelkontext").pruefeArtikelkontext([doc], beleg); }
    catch (error) { return { ok: false, reason: fehlerGrund(error, "artikelkontext-") || "beleg-ungueltig" }; }
    fordere(typeof doc.title === "string" && doc.title.length > 0 && doc.title.length <= MAX_TITEL, "titel-ungueltig");
    // Exakter Titel, nicht nur eine normalisierte Aehnlichkeit: sonst waere der Standhash
    // nicht mehr an genau die belegte Artikelidentitaet gebunden.
    fordere(geprueft.artikelTitel === doc.title, "titel-abweichend");
    // Der amtliche Leitabsatz ist eine Meldung, keine Korrekturzeile (wie in der Gewinnung).
    fordere(geprueft.text.length >= 60, "absatz-ungueltig");
    const tag = tagDesWerts(doc.published_at);
    fordere(tag, "datum-nicht-tagesgenau");
    fordere(typeof beleg.textHash === "string" && beleg.textHash === hash(geprueft.text), "text-hash-abweichend");
    const url = kanonischeArtikelUrl(geprueft.artikelUrl);
    fordere(url && BUNDESTAG_ARTIKEL_URL.test(geprueft.artikelUrl), "artikelziel-abweichend");
    const absatzHash = hash(geprueft.text);
    const standHash = standHashFuer({ url, titel: doc.title, publikationstag: tag, absatzHash });
    const stand = Object.freeze({ version: VERSION, herkunft: HERKUNFT, url, titel: doc.title,
      publikationstag: tag, absatzHash, standHash });
    const kennung = "rd-" + standHash;
    fordere(kennung !== "rd-" + hash("url:" + url), "namespace-kollision");
    // Neue minimierte Rohzeile: gleiche Minimierung wie im Bestand, aber ohne Uhrzeit
    // (published_at bleibt null), mit ausschliesslich den geschlossenen Stand-Metadaten
    // und dem validierten Leitabsatz selbst als summary (niemals gekuerzt).
    const quelle = { ...doc, id: kennung, content_hash: standHash, published_at: null, publishedAt: null,
      summary: geprueft.text,
      raw: { ...(doc.raw && typeof doc.raw === "object" && !Array.isArray(doc.raw) ? doc.raw : {}),
        helmutBundestagArtikelstand: stand } };
    const dedup = require("./dedup");
    const row = dedup.toRawDocumentRow(quelle);
    fordere(row && row.id === kennung && row.content_hash === standHash && row.published_at === null,
      "rohzeile-abweichend");
    fordere(row.summary === geprueft.text
      && row.summary === standZusammenfassung(row.summary, stand), "rohzeile-summary-abweichend");
    fordere(isDeepStrictEqual(row.raw?.helmutBundestagArtikelstand, { ...stand }), "rohzeile-metadaten-abweichend");
    // Nur die Identitaetsprojektion neu binden; der Beleginhalt selbst bleibt unveraendert.
    const A = require("./artikelkontext");
    const neu = { ...geprueft, dokumentId: row.id, quellenHash: A.quellenstandHash(row) };
    const rebound = A.pruefeArtikelkontext([row], neu);
    fordere(rebound.text === geprueft.text && rebound.artikelUrl === geprueft.artikelUrl
      && rebound.artikelTitel === geprueft.artikelTitel && rebound.absatzPosition === geprueft.absatzPosition
      && isDeepStrictEqual(rebound.gewinnung, geprueft.gewinnung), "beleg-inhalt-geaendert");
    return { ok: true, stand: { ...stand }, row, beleg: rebound };
  } catch (error) {
    return { ok: false, reason: fehlerGrund(error, "bundestag-artikelstand-")
      || fehlerGrund(error, "artikelkontext-") || "eingabe-ungueltig" };
  }
}

module.exports = { VERSION, HERKUNFT, NAMESPACE, MAX_TITEL, BUNDESTAG_ARTIKEL_URL,
  tagDesWerts, standHashFuer, standZusammenfassung, kennungFuerStand, pruefeArtikelstand,
  leseArtikelstand, erzeugeArtikelstand };
