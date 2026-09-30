"use strict";

// Helmut — Quellen-Artikelstand-Vertrag fuer den belegten Berliner Presseartikel.
// =============================================================================================
// BELEGTER ANLASS (docs/betrieb/landesversorgung-berlin-20260928.md): Der Berliner
// Originalseiten-Leser (lib/helmut/berlin-presseartikel.js) belegt amtliche URL, exakten
// Titel, Publikationstag (reiner Kalendertag) und den vollstaendigen Artikeltext. Der
// regulaere content_hash kennt jedoch nur die URL: eine neue Fassung DERSELBEN Adresse
// wuerde mit der bereits gespeicherten kollidieren und sie still ueberschreiben.
//
// Dieser Vertrag vergibt deshalb NUR fuer den automatisch gewonnenen, vollstaendig geprueften
// Berlin.de-Presseartikel eine eigene, unveraenderliche Quellenkennung:
//   Standhash = sha256([NAMESPACE, URL, exakter Titel, Tag, Absatzhash, Volltexthash])
//   Rohzeile  = rd-<Standhash>, content_hash = <Standhash>, published_at = null
//
// Eigener Namespace: die Kennung ist niemals die alte URL-Kennung. Kein beliebiger item.id
// dient als Identitaetsbeweis, kein Crawl/Import wird hier aktiviert, keine Uhrzeit erfunden.
// Die vollstaendige geschlossene Stand-Metadaten liegt danach in raw.helmutBerlinArtikelstand
// (Version, Herkunft, URL, Titel, Publikationstag, Absatzhash, Volltexthash, Standhash) —
// OHNE Volltext, OHNE Roh-HTML und OHNE fremde Raw-Felder. Der vollstaendige Artikeltext
// bleibt ausserhalb des Speichers (nur sein Hash ist gespeichert).
//
// Der gepruefte ERSTE ganze Absatz steht zusaetzlich unveraendert als summary der Rohzeile
// (hashgebunden an den Absatzhash, niemals gekuerzt oder praefixiert). Eine nichtleere
// summary eines Standes MUSS exakt an den Absatzhash gebunden sein; fehlende oder leere
// summary (minimierte Leser, bestehende legacy-Zeilen) bleibt lesbar, ohne einen Absatz zu
// erfinden.
//
// ZWEITER, STRENG GETRENNTER VERTRAG (derselbe Modul, dieselbe Rohzeilen-/Aliasform): die
// beiden belegten Berliner Senatspfadfamilien ausserhalb des Pressearchivs (eigener Leser
// lib/helmut/berlin-presse-sondervorlagen.js). Sie tragen eine EIGENE Herkunft und einen
// EIGENEN Hash-Namespace; ihr gebundener Absatz ist der vollstaendige SACHABSATZ (auszug),
// niemals der RBMSKZL-Absenderabsatz und niemals gekuerzt. Der alte Pressearchiv-Zweig, seine
// acht Standfelder, der raw.helmutBerlinArtikelstand-Alias und alle bestehenden Staende
// bleiben unveraendert kompatibel. Alte standHashFuer-Aufrufe OHNE Herkunft behalten exakt
// denselben Hash.
//
// Zyklen: dieses Modul laedt beim Import NICHTS aus dem Repository. dedup.js, quellen-auszug.js,
// quellen-zeitvertrag.js, lage-quellenbeleg.js und storage.js koennen es deshalb lazy laden —
// keine Rekursion.
const crypto = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");

const VERSION = 1;
const HERKUNFT = "berlin-de-pressearchiv-artikel";
const NAMESPACE = "helmut-berlin-artikelstand-v1";
// Eigene Herkunft/Namespace fuer die beiden Senatspfadfamilien ausserhalb des Pressearchivs.
const HERKUNFT_SONDER = "berlin-de-senatsvorlage";
const NAMESPACE_SONDER = "helmut-berlin-sondervorlagenstand-v1";
const MAX_TITEL = 300;
// Grenze des gebundenen ersten Absatzes. Sie liegt deutlich ueber dem belegten Original
// (619 Zeichen), damit ein vollstaendig gepruefter erster Absatz niemals gekuerzt wird.
const MAX_ZEICHEN_ERSTER_ABSATZ = 1200;
const HASH_64 = /^[a-f0-9]{64}$/;
const TAG = /^(\d{4})-(\d{2})-(\d{2})$/;
// Kanonische amtliche Form (ohne www, ohne Tracking, ohne Trailing-Slash). Nur diese
// Form ist die stabile Adresse des Standes; die www-Fassung wird ueber dedup.canonicalizeUrl
// auf dieselbe Normalform abgebildet.
const BERLIN_PRESSE_URL = /^https:\/\/berlin\.de\/(?:[a-z0-9-]+\/)*pressearchiv-(\d{4})\/pressemitteilung\.\d+\.php$/;
// Zweite, ebenso exakte amtliche Form: genau die vier belegten Senatspfadfamilien.
const BERLIN_SONDERVORLAGEN_URL = /^https:\/\/berlin\.de\/(rbmskzl\/aktuelles\/pressemitteilungen|sen\/web\/presse\/pressemitteilungen|sen\/justv\/presse\/pressemitteilungen|sen\/kultgz\/aktuelles\/pressemitteilungen)\/(\d{4})\/pressemitteilung\.\d+\.php$/;
const BELEG_FELDER = Object.freeze(["url", "titel", "publikationstag", "volltext", "volltextHash", "htmlHash"]);
const STAND_FELDER = Object.freeze(["version", "herkunft", "url", "titel", "publikationstag",
  "absatzHash", "volltextHash", "standHash"]);

const hash = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
function fordere(ok, grund) { if (!ok) throw new Error("berlin-artikelstand-" + grund); }
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

// Nur die exakte amtliche Berlin.de-Pressearchiv-Form zaehlt; die kanonische Form (ohne www,
// ohne Tracking, ohne Trailing-Slash) ist die stabile Adresse des Standes.
function kanonischeArtikelUrl(value) {
  if (typeof value !== "string" || !/^https:\/\/(?:www\.)?berlin\.de\//.test(value)) return null;
  let url;
  try { url = require("./dedup").canonicalizeUrl(value); } catch { return null; }
  return typeof url === "string" && BERLIN_PRESSE_URL.test(url) ? url : null;
}

function kanonischeSondervorlagenUrl(value) {
  if (typeof value !== "string" || !/^https:\/\/(?:www\.)?berlin\.de\//.test(value)) return null;
  let url;
  try { url = require("./dedup").canonicalizeUrl(value); } catch { return null; }
  return typeof url === "string" && BERLIN_SONDERVORLAGEN_URL.test(url) ? url : null;
}

// Herkunft entscheidet ueber Namespace und Adressform. Keine stille Umschaltung: eine
// unbekannte Herkunft ist ein lauter Fehler.
function kanonischeUrlFuer(herkunft, value) {
  if (herkunft === HERKUNFT_SONDER) return kanonischeSondervorlagenUrl(value);
  return kanonischeArtikelUrl(value);
}

function standHashFuer(teile = {}) {
  // Ohne Herkunft gilt unveraendert der alte Pressearchiv-Vertrag (gleicher Hash wie bisher).
  const herkunft = teile.herkunft == null ? HERKUNFT : teile.herkunft;
  fordere(herkunft === HERKUNFT || herkunft === HERKUNFT_SONDER, "herkunft-ungueltig");
  const url = kanonischeUrlFuer(herkunft, teile.url);
  fordere(url && url === teile.url, "url-ungueltig");
  fordere(typeof teile.titel === "string" && teile.titel.length > 0 && teile.titel.length <= MAX_TITEL
    && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(teile.titel), "titel-ungueltig");
  const tag = tagDesWerts(teile.publikationstag);
  fordere(tag, "tag-ungueltig");
  fordere(typeof teile.absatzHash === "string" && HASH_64.test(teile.absatzHash), "absatzhash-ungueltig");
  fordere(typeof teile.volltextHash === "string" && HASH_64.test(teile.volltextHash), "volltexthash-ungueltig");
  const namespace = herkunft === HERKUNFT_SONDER ? NAMESPACE_SONDER : NAMESPACE;
  return hash(JSON.stringify([namespace, url, teile.titel, tag, teile.absatzHash, teile.volltextHash]));
}

// Eine nichtleere summary eines Standes ist der gepruefte erste ganze Absatz selbst. Sie muss
// exakt an den Absatzhash gebunden sein: keine generische Snippetgrenze, kein Satzpraefix,
// keine Kuerzung. Fehlende oder leere summary bleibt erlaubt (legacy/minimierte Leser);
// es wird niemals ein Absatz erfunden.
function standZusammenfassung(value, stand) {
  if (value == null || value === "") return null;
  fordere(typeof value === "string", "summary-ungueltig");
  fordere(value.length <= MAX_ZEICHEN_ERSTER_ABSATZ, "summary-zu-lang");
  fordere(hash(value) === stand.absatzHash, "summary-abweichend");
  return value;
}

function kennungFuerStand(stand) {
  return "rd-" + pruefeArtikelstand(stand).standHash;
}

// Geschlossene Metadaten: genau die acht Felder, keine unbekannten Zusatzfelder, keine
// widerspruechliche Repraesentation. Rueckgabe ist eine eingefrorene Normalform.
function pruefeArtikelstand(value) {
  fordere(value && typeof value === "object" && !Array.isArray(value), "metadaten-ungueltig");
  fordere(Object.keys(value).length === STAND_FELDER.length
    && STAND_FELDER.every(feld => Object.hasOwn(value, feld)), "metadaten-ungueltig");
  fordere(value.version === VERSION, "version-ungueltig");
  fordere(value.herkunft === HERKUNFT || value.herkunft === HERKUNFT_SONDER, "herkunft-ungueltig");
  const url = kanonischeUrlFuer(value.herkunft, value.url);
  fordere(url && url === value.url, "url-ungueltig");
  fordere(typeof value.titel === "string" && value.titel.length > 0 && value.titel.length <= MAX_TITEL
    && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value.titel), "titel-ungueltig");
  fordere(!!tagDesWerts(value.publikationstag), "tag-ungueltig");
  fordere(typeof value.absatzHash === "string" && HASH_64.test(value.absatzHash), "absatzhash-ungueltig");
  fordere(typeof value.volltextHash === "string" && HASH_64.test(value.volltextHash), "volltexthash-ungueltig");
  fordere(typeof value.standHash === "string" && HASH_64.test(value.standHash), "standhash-ungueltig");
  fordere(value.standHash === standHashFuer({ herkunft: value.herkunft, url: value.url, titel: value.titel,
    publikationstag: value.publikationstag, absatzHash: value.absatzHash, volltextHash: value.volltextHash }),
  "standhash-abweichend");
  return Object.freeze({ version: VERSION, herkunft: value.herkunft, url: value.url, titel: value.titel,
    publikationstag: value.publikationstag, absatzHash: value.absatzHash,
    volltextHash: value.volltextHash, standHash: value.standHash });
}

// Kleine Leseprojektion fuer Rohzeilen, Leser-Aliase (raw->helmutBerlinArtikelstand) und
// bereits minimierte Zeilen. Ohne Stand-Metadaten bleibt alles unveraendert (null). Mit
// Metadaten wird strikt geprueft: ungueltige oder widerspruechliche Stand-Angaben werden
// abgewiesen und fallen NIEMALS still auf die alte URL-Identitaet zurueck.
function leseArtikelstand(quelle) {
  if (!quelle || typeof quelle !== "object" || Array.isArray(quelle)) return null;
  const direkt = quelle.berlin_artikelstand;
  const roh = quelle.raw && typeof quelle.raw === "object" && !Array.isArray(quelle.raw)
    ? quelle.raw.helmutBerlinArtikelstand : undefined;
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
  fordere(urls.every(value => kanonischeUrlFuer(stand.herkunft, value) === stand.url), "url-abweichend");
  if (Object.hasOwn(quelle, "title")) fordere(quelle.title === stand.titel, "titel-abweichend");
  // published_at ist timestamptz: bei ausschliesslich bekanntem Tag bleibt die Spalte leer.
  // Ein gesetzter Zeitwert waere eine erfundene Uhrzeit und damit widerspruechlich.
  for (const feld of ["published_at", "publishedAt"]) {
    if (Object.hasOwn(quelle, feld) && quelle[feld] != null && String(quelle[feld]).trim() !== "") {
      fordere(false, "veroeffentlichtzeit-widerspricht-tag");
    }
  }
  standZusammenfassung(quelle.summary, stand);
  return stand;
}

// Der gepruefte erste ganze Absatz. Nur die geschlossene Absatzstruktur des Lesers zaehlt:
// genau die Absaetze, die der Leser aus geschlossenen <p> gewonnen hat, durch "\n\n" getrennt
// und mit genau einem abschliessenden Zeilenumbruch. Ein Fremdtext, eine Kuerzung oder eine
// eingebettete Zeilenumbruch-Folge brechen ab.
function ersterAbsatz(volltext) {
  fordere(typeof volltext === "string" && volltext.endsWith("\n") && !volltext.includes("\r"), "volltext-ungueltig");
  const rumpf = volltext.slice(0, -1);
  const teile = rumpf.split("\n\n");
  fordere(teile.length > 0 && teile.every(teil => teil.length > 0 && !teil.includes("\n")), "absatzstruktur-ungueltig");
  const erster = teile[0];
  fordere(erster.length <= MAX_ZEICHEN_ERSTER_ABSATZ, "erster-absatz-zu-lang");
  fordere(erster === erster.trimEnd() && !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(erster), "erster-absatz-ungueltig");
  return { erster, zahl: teile.length };
}

// Erstellung: ausschliesslich aus dem eingefrorenen, geschlossenen Ergebnis des amtlichen
// Berliner Originalseiten-Lesers (lib/helmut/berlin-presseartikel.js). Es wird KEIN Inhalt
// neu gebunden: der Leserbeleg selbst wird erneut gegen seine eigenen Hashes geprueft und
// nur die Identitaetsprojektion dazugelegt.
function erzeugeArtikelstand(doc, beleg) {
  try {
    fordere(doc && typeof doc === "object" && !Array.isArray(doc), "eingabe-ungueltig");
    fordere(beleg && typeof beleg === "object" && !Array.isArray(beleg), "eingabe-ungueltig");
    fordere(Object.isFrozen(beleg), "beleg-nicht-geschlossen");
    fordere(Object.keys(beleg).length === BELEG_FELDER.length
      && Object.keys(beleg).every(feld => BELEG_FELDER.includes(feld)), "beleg-felder-ungueltig");
    fordere(typeof beleg.volltext === "string" && hash(beleg.volltext) === beleg.volltextHash, "volltexthash-abweichend");
    fordere(typeof beleg.htmlHash === "string" && HASH_64.test(beleg.htmlHash), "htmlhash-ungueltig");
    const url = kanonischeArtikelUrl(beleg.url);
    fordere(url && kanonischeArtikelUrl(doc.url) === url, "artikelziel-abweichend");
    // Exakter Titel, nicht nur eine normalisierte Aehnlichkeit: sonst waere der Standhash
    // nicht mehr an genau die belegte Artikelidentitaet gebunden.
    fordere(typeof doc.title === "string" && doc.title.length > 0 && doc.title.length <= MAX_TITEL
      && beleg.titel === doc.title, "titel-abweichend");
    const tag = tagDesWerts(doc.published_at);
    fordere(tag && beleg.publikationstag === tag, "datum-nicht-tagesgenau");
    fordere(tag.slice(0, 4) === BERLIN_PRESSE_URL.exec(url)[1], "pressearchiv-jahr-abweichend");
    const { erster } = ersterAbsatz(beleg.volltext);
    const absatzHash = hash(erster);
    const stand = Object.freeze({ version: VERSION, herkunft: HERKUNFT, url, titel: doc.title,
      publikationstag: tag, absatzHash, volltextHash: beleg.volltextHash,
      standHash: standHashFuer({ url, titel: doc.title, publikationstag: tag, absatzHash,
        volltextHash: beleg.volltextHash }) });
    const kennung = "rd-" + stand.standHash;
    fordere(kennung !== "rd-" + hash("url:" + url), "namespace-kollision");
    // Neue minimierte Rohzeile: gleiche Minimierung wie im Bestand, aber ohne Uhrzeit
    // (published_at bleibt null), mit ausschliesslich den geschlossenen Stand-Metadaten
    // und dem geprueften ersten ganzen Absatz als summary (niemals gekuerzt).
    const quelle = { ...doc, id: kennung, content_hash: stand.standHash, published_at: null, publishedAt: null,
      summary: erster,
      raw: { ...(doc.raw && typeof doc.raw === "object" && !Array.isArray(doc.raw) ? doc.raw : {}),
        helmutBerlinArtikelstand: stand } };
    const dedup = require("./dedup");
    const row = dedup.toRawDocumentRow(quelle);
    fordere(row && row.id === kennung && row.content_hash === stand.standHash && row.published_at === null,
      "rohzeile-abweichend");
    fordere(row.summary === erster && row.summary === standZusammenfassung(row.summary, stand),
      "rohzeile-summary-abweichend");
    fordere(isDeepStrictEqual(row.raw?.helmutBerlinArtikelstand, { ...stand }), "rohzeile-metadaten-abweichend");
    return { ok: true, stand: { ...stand }, row, absatz: erster };
  } catch (error) {
    return { ok: false, reason: fehlerGrund(error, "berlin-artikelstand-") || "eingabe-ungueltig" };
  }
}

// Bequemer, sanktionierter Weg "aus dem Berliner Leser": erst den amtlichen Originaltext
// vollstaendig pruefen, danach nur die Identitaetsprojektion bilden. Der HTML-Rohtext und der
// Volltext verlassen diese Funktion nicht im Ergebnis.
function standAusOriginal(doc, eingabe) {
  let beleg;
  try { beleg = require("./berlin-presseartikel").pruefePresseartikel(eingabe); }
  catch (error) { return { ok: false, reason: fehlerGrund(error, "berlin-presseartikel-") || "quelle-ungueltig" }; }
  return erzeugeArtikelstand(doc, beleg);
}

// Erstellung des zweiten, streng getrennten Standvertrags: ausschliesslich aus dem eingefrorenen,
// geschlossenen Ergebnis des amtlichen Sondervorlagen-Lesers
// (lib/helmut/berlin-presse-sondervorlagen.js). Der gepruefte SACHABSATZ (auszug) ist die
// summary und absatzHash = auszugHash; der RBMSKZL-Absenderabsatz ist niemals summary und
// nichts wird gekuerzt. Volltexthash, Titel, Tag und Adresse kommen strikt aus DEMSELBEN
// Parserbeleg; ein ausgetauschter Absatz, eine falsche Familie, Herkunft, Titel, Tag, Hash oder
// Adresse sperren.
function erzeugeSondervorlagenstand(doc, beleg) {
  try {
    fordere(doc && typeof doc === "object" && !Array.isArray(doc), "eingabe-ungueltig");
    fordere(beleg && typeof beleg === "object" && !Array.isArray(beleg), "eingabe-ungueltig");
    fordere(Object.isFrozen(beleg), "beleg-nicht-geschlossen");
    const modul = require("./berlin-presse-sondervorlagen");
    const felder = modul.AUSGANG_FELDER;
    fordere(Object.keys(beleg).length === felder.length
      && felder.every(feld => Object.hasOwn(beleg, feld)), "beleg-felder-ungueltig");
    fordere(typeof beleg.volltext === "string" && beleg.volltext.endsWith("\n")
      && hash(beleg.volltext) === beleg.volltextHash, "volltexthash-abweichend");
    fordere(typeof beleg.auszug === "string" && hash(beleg.auszug) === beleg.auszugHash,
      "auszughash-abweichend");
    fordere(typeof beleg.htmlHash === "string" && HASH_64.test(beleg.htmlHash), "htmlhash-ungueltig");
    // Nur die zwei belegten Pfadfamilien, nur nach kanonischer Adresspruefung.
    const url = kanonischeSondervorlagenUrl(beleg.url);
    fordere(url && kanonischeSondervorlagenUrl(doc.url) === url, "artikelziel-abweichend");
    const pfad = BERLIN_SONDERVORLAGEN_URL.exec(url);
    const familie = modul.FAMILIEN.find(kandidat => kandidat.name === beleg.pfadfamilie);
    fordere(familie && familie.basis === pfad[1], "pfadfamilie-abweichend");
    // Ausgetauschter Absatz sperrt: der Auszug muss exakt der vom Leser an DIESE Familie
    // gebundene Absatz des vollstaendigen Volltexts sein. Keine Ersatzwahl, keine Kuerzung.
    const teile = beleg.volltext.slice(0, -1).split("\n\n");
    fordere(teile.length > 0 && teile.every(teil => teil.length > 0 && !teil.includes("\n")),
      "absatzstruktur-ungueltig");
    const gebunden = familie.absenderformel
      ? (teile.length >= 2 && teile[0] === modul.ABSENDER_RB ? teile[1] : null) : teile[0];
    fordere(gebunden && gebunden === beleg.auszug, "auszug-abweichend");
    fordere(beleg.auszug !== modul.ABSENDER_RB, "sachabsatz-fehlend");
    // Exakter Titel und reiner Kalendertag aus demselben Beleg.
    fordere(typeof doc.title === "string" && doc.title.length > 0 && doc.title.length <= MAX_TITEL
      && beleg.titel === doc.title, "titel-abweichend");
    const tag = tagDesWerts(doc.published_at);
    fordere(tag && beleg.publikationstag === tag, "datum-nicht-tagesgenau");
    fordere(tag.slice(0, 4) === pfad[2], "pfadjahr-abweichend");
    const absatzHash = beleg.auszugHash;
    const stand = Object.freeze({ version: VERSION, herkunft: HERKUNFT_SONDER, url,
      titel: beleg.titel, publikationstag: tag, absatzHash, volltextHash: beleg.volltextHash,
      standHash: standHashFuer({ herkunft: HERKUNFT_SONDER, url, titel: beleg.titel,
        publikationstag: tag, absatzHash, volltextHash: beleg.volltextHash }) });
    const kennung = "rd-" + stand.standHash;
    fordere(kennung !== "rd-" + hash("url:" + url), "namespace-kollision");
    const quelle = { ...doc, id: kennung, content_hash: stand.standHash, published_at: null,
      publishedAt: null, summary: beleg.auszug,
      raw: { ...(doc.raw && typeof doc.raw === "object" && !Array.isArray(doc.raw) ? doc.raw : {}),
        helmutBerlinArtikelstand: stand } };
    const dedup = require("./dedup");
    const row = dedup.toRawDocumentRow(quelle);
    fordere(row && row.id === kennung && row.content_hash === stand.standHash && row.published_at === null,
      "rohzeile-abweichend");
    fordere(row.summary === beleg.auszug && row.summary === standZusammenfassung(row.summary, stand),
      "rohzeile-summary-abweichend");
    fordere(isDeepStrictEqual(row.raw?.helmutBerlinArtikelstand, { ...stand }),
      "rohzeile-metadaten-abweichend");
    // Auch alle von dedup uebernommenen Adressen muessen vor der Rueckgabe zur Quelle passen.
    fordere(leseArtikelstand(row)?.standHash === stand.standHash, "rohzeile-stand-abweichend");
    return { ok: true, stand: { ...stand }, row, absatz: beleg.auszug };
  } catch (error) {
    return { ok: false, reason: fehlerGrund(error, "berlin-artikelstand-")
      || fehlerGrund(error, "berlin-presse-sondervorlagen-") || "eingabe-ungueltig" };
  }
}

// Bequemer, sanktionierter Weg "aus dem Sondervorlagen-Leser": erst die amtliche Vorlage
// vollstaendig pruefen, danach nur die Identitaetsprojektion bilden. HTML-Rohtext und Volltext
// verlassen diese Funktion nicht im Ergebnis.
function standAusSondervorlage(doc, eingabe) {
  let beleg;
  try { beleg = require("./berlin-presse-sondervorlagen").pruefeSondervorlage(eingabe); }
  catch (error) { return { ok: false, reason: fehlerGrund(error, "berlin-presse-sondervorlagen-") || "quelle-ungueltig" }; }
  return erzeugeSondervorlagenstand(doc, beleg);
}

module.exports = { VERSION, HERKUNFT, NAMESPACE, MAX_TITEL, MAX_ZEICHEN_ERSTER_ABSATZ, BERLIN_PRESSE_URL,
  HERKUNFT_SONDER, NAMESPACE_SONDER, BERLIN_SONDERVORLAGEN_URL,
  tagDesWerts, kanonischeArtikelUrl, kanonischeSondervorlagenUrl, standHashFuer, standZusammenfassung,
  kennungFuerStand, pruefeArtikelstand, leseArtikelstand, erzeugeArtikelstand, standAusOriginal,
  erzeugeSondervorlagenstand, standAusSondervorlage };
