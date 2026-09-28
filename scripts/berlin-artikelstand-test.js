"use strict";

// Helmut — Offline-Vertragstest des geschlossenen Berliner Artikelstands.
// =============================================================================================
// Zwei Ebenen, beide ohne Netz, DB, Modell oder Production-Daten:
//   * Synthetische Proben belegen den Vertrag (Erstellung, Drift-, Zeit- und Negativfaelle).
//   * Die lokale amtliche Originalprobe unter /private/tmp/helmut-landesversorgung-originale
//     wird — falls vorhanden — durch den ECHTEN Berliner Leser gefuehrt; fehlt sie, laeuft
//     der Test weiterhin vollstaendig (CI-tauglich) und meldet das ausdruecklich.
//   * Ein In-Memory-Storage (lokale PostgREST-Attrappe fuer die ECHTEN Storage-Leser und
//     -Schreibwege) belegt Import/Dedup, Speicherprojektion, Lage-Quellenbeleg und
//     sichtbares Datum bis zur fertigen Lageeingabe.
//
// Aufruf: node scripts/berlin-artikelstand-test.js
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const B = require("../lib/helmut/berlin-artikelstand");
const BT = require("../lib/helmut/bundestag-artikelstand");
const ST = require("../lib/helmut/artikelstand");
const P = require("../lib/helmut/berlin-presseartikel");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const Q = require("../lib/helmut/quellen-zeitvertrag");
const LQ = require("../lib/helmut/lage-quellenbeleg");
const lage = require("../lib/helmut/lage");
const F = require("../lib/helmut/briefing-frische");
const AUS = require("../lib/helmut/quellen-auszug");
const storage = require("../lib/helmut/storage");

const sha = value => crypto.createHash("sha256").update(value, "utf8").digest("hex");
const kopie = value => JSON.parse(JSON.stringify(value));
let bestanden = 0;
function test(name, fn) { fn(); bestanden += 1; console.log("OK " + name); }
function wirft(fn, enthalt) {
  const muster = typeof enthalt === "string" ? new RegExp(enthalt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : enthalt;
  try { fn(); } catch (error) { assert.match(String(error && error.message), muster); return; }
  assert.fail("erwarteter Fehler fehlt: " + enthalt);
}

// --- Synthetische amtliche Berlin.de-Seite (echte Struktur des Lesers) ----------------------
const TAG = "2026-09-24";
const TITEL = "Synthetische Berliner Pressemitteilung zum Beispielprogramm";
const BE_URL = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1999999.php";
const ABSATZ = "Die synthetische Senatsverwaltung hat am Beispieltag ein Beispielprogramm fuer die "
  + "Beispielbezirke angekuendigt. Das Programm soll im kommenden Haushaltsjahr beginnen und wird aus "
  + "Landesmitteln finanziert. Eine Entscheidung des Abgeordnetenhauses steht noch aus.";
const ABSATZ_ZWEI = "Ein zweiter Absatz beschreibt die Begruendung und die naechsten Schritte des Vorhabens.";
function dmY(iso) { const [j, m, t] = iso.split("-"); return `${t}.${m}.${j}`; }
function seite(optionen = {}) {
  const datum = optionen.datum || TAG;
  const jahr = optionen.jahr || datum.slice(0, 4);
  const titel = optionen.titel === undefined ? TITEL : optionen.titel;
  const dateiname = optionen.dateiname || "pressemitteilung.1999999.php";
  const canonical = optionen.canonical || `https://www.berlin.de/sen/bjf/service/presse/pressearchiv-${jahr}/${dateiname}`;
  const absaetze = optionen.absaetze || [ABSATZ, ABSATZ_ZWEI];
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">`
    + `<meta name="dcterms.date" content="${datum}"><meta name="dcterms.title" content="${titel}">`
    + `<link rel="canonical" href="${canonical}"></head><body>`
    + `<div id="layout-grid__area--herounit"><h1 class="title">${titel}</h1></div>`
    + `<div id="layout-grid__area--maincontent"><p class="pressnumber">Pressemitteilung vom ${dmY(datum)}</p>`
    + `<section class="modul-text_bild"><div class="text"><div class="textile">`
    + absaetze.map(absatz => `<p>${absatz}</p>`).join("")
    + `</div></div></section></div>`
    + `<div id="layout-grid__area--marginal"><div class="modul-contact">Kontakt: pressestelle@senbjf.berlin.de</div></div>`
    + `</body></html>`;
  return { eingabe: { url: canonical, finalUrl: canonical, http: 200, html }, canonical, datum, titel };
}
function behoerde(optionen = {}) {
  const s = seite(optionen);
  return { ...s, beleg: P.pruefePresseartikel(s.eingabe) };
}
function dokument(beleg, patch = {}) {
  return { id: "local-synthetischer-berlinbeleg", title: beleg.titel, url: beleg.url,
    canonical_url: beleg.url, published_at: beleg.publikationstag, retrieved_at: null, summary: "", ...patch };
}

const SYN = behoerde();
const DOK = dokument(SYN.beleg);
const ERZEUGT = B.erzeugeArtikelstand(DOK, SYN.beleg);
const STAND = ERZEUGT.stand;
const ROW = ERZEUGT.row;
const KANONISCH = B.kanonischeArtikelUrl(BE_URL);
const ALT = { id: "rd-" + sha("url:" + KANONISCH), content_hash: sha("url:" + KANONISCH),
  canonical_url: KANONISCH, url: BE_URL, title: "Fruehere synthetische Fassung derselben Adresse",
  published_at: "2026-08-01T09:30:00.000Z", source_name: "Synthetische Altquelle" };

test("Erstellung bindet einen eigenen Namespace an URL, Titel, Tag, Absatz- und Volltexthash", () => {
  assert.equal(ERZEUGT.ok, true, JSON.stringify(ERZEUGT));
  assert.deepEqual(Object.keys(STAND), ["version", "herkunft", "url", "titel", "publikationstag",
    "absatzHash", "volltextHash", "standHash"]);
  assert.equal(STAND.version, 1);
  assert.equal(STAND.herkunft, "berlin-de-pressearchiv-artikel");
  assert.equal(B.NAMESPACE, "helmut-berlin-artikelstand-v1");
  assert.equal(STAND.url, KANONISCH);
  assert.equal(STAND.titel, TITEL);
  assert.equal(STAND.publikationstag, TAG);
  assert.equal(STAND.absatzHash, sha(ABSATZ));
  assert.equal(STAND.volltextHash, sha(SYN.beleg.volltext));
  assert.equal(STAND.standHash, B.standHashFuer({ url: KANONISCH, titel: TITEL, publikationstag: TAG,
    absatzHash: sha(ABSATZ), volltextHash: SYN.beleg.volltextHash }));
  assert.equal(ROW.id, "rd-" + STAND.standHash);
  assert.equal(ROW.content_hash, STAND.standHash);
  assert.equal(ROW.title, TITEL);
  assert.equal(ROW.published_at, null);
  assert.equal(ROW.publishedAt ?? null, null);
  // Nur der gepruefte ERSTE ganze Absatz steht als summary in der Rohzeile.
  assert.equal(ROW.summary, ABSATZ);
  assert.equal(ERZEUGT.absatz, ABSATZ);
  assert.deepEqual(Object.keys(ROW.raw), ["sourcePriority", "originalUrl", "helmutBerlinArtikelstand"]);
  assert.deepEqual(ROW.raw.helmutBerlinArtikelstand, STAND);
  assert.equal(B.leseArtikelstand(ROW).standHash, STAND.standHash);
  assert.equal(ST.leseStand(ROW).name, "berlin");
});

test("Kein Volltext und kein HTML in der gespeicherten Rohzeile", () => {
  const volltext = SYN.beleg.volltext;
  assert.notEqual(ROW.summary, volltext);
  assert.equal(ROW.summary.length < volltext.length, true);
  assert.equal(JSON.stringify(ROW).includes(volltext), false);
  assert.equal(JSON.stringify(ROW.raw).includes(ABSATZ.slice(0, 60)), false);
  assert.equal(JSON.stringify(ROW.raw).includes("<"), false);
  // Der erste Absatz DARF als hashgebundene summary vorkommen; der zweite Absatz und der
  // vollstaendige Text duerfen nirgends stehen.
  assert.equal(JSON.stringify(ROW).includes(ABSATZ_ZWEI), false);
});

test("Eigener Namespace: niemals die alte URL-Kennung", () => {
  assert.notEqual(ROW.id, ALT.id);
  assert.notEqual(ROW.id, "rd-" + sha("url:" + KANONISCH));
  assert.notEqual(ROW.content_hash, ALT.content_hash);
  assert.equal(D.contentHash(ALT), ALT.content_hash);
  assert.equal(B.leseArtikelstand(ALT), null);
  assert.equal(ST.leseStand(ALT), null);
});

test("Der Bundestagspfad bleibt getrennt und unveraendert", () => {
  assert.equal(BT.leseArtikelstand(ROW), null);
  const btUrl = "https://www.bundestag.de/dokumente/textarchiv/2026/kw39-synthetische-vorlage-1234567";
  const btText = "Der synthetische Beispielausschuss hat den Entwurf zur Beispielreform beraten und dem "
    + "Plenum die Annahme empfohlen. Es gab keine Gegenstimme.";
  const A = require("../lib/helmut/artikelkontext");
  const btDoc = { id: "local-bt", title: "Synthetischer Beschlussbericht", url: btUrl, canonical_url: btUrl,
    published_at: TAG, retrieved_at: null, summary: "" };
  const btBeleg = { version: 2, dokumentId: btDoc.id, quellenHash: A.quellenstandHash(btDoc), artikelUrl: btUrl,
    artikelTitel: btDoc.title, herkunft: "strukturierter-originalartikel", gelesenAm: "2026-09-26T10:15:00.000Z",
    absatzPosition: 1, text: btText, textHash: sha(btText),
    gewinnung: { verfahren: "bundestag-artikel-leitabsatz-v1", positionsbasis: "html-article-p",
      antwortHash: sha("antwort"), artikelTextHash: sha("artikel"), artikelTextPosition: 0,
      titelTreffer: 3, kandidatZahl: 1, artikelAbsatzZahl: 3 } };
  const bt = BT.erzeugeArtikelstand(btDoc, btBeleg);
  assert.equal(bt.ok, true);
  assert.equal(bt.stand.herkunft, "bundestag-textarchiv-leitabsatz");
  assert.equal(Object.keys(bt.stand).length, 7);
  assert.equal(B.leseArtikelstand(bt.row), null);
  assert.equal(ST.leseStand(bt.row).name, "bundestag");
  // Eine Zeile, die zugleich als Bundestags- und als Berliner Stand ausgewiesen ist, ist
  // widerspruechlich und wird laut abgewiesen (kein stilles Bevorzugen eines Namespace).
  wirft(() => ST.leseStand({ raw: { helmutBundestagArtikelstand: { ...bt.stand },
    helmutBerlinArtikelstand: { ...STAND } } }), /artikelstand-mehrdeutig/);
});

test("Wiederholte Erzeugung desselben Standes behaelt dieselbe Kennung", () => {
  const erneut = B.erzeugeArtikelstand(kopie(DOK), SYN.beleg);
  assert.equal(erneut.ok, true);
  assert.deepEqual(erneut.stand, STAND);
  assert.deepEqual(erneut.row, ROW);
  assert.equal(D.contentHash(ROW), STAND.standHash);
  assert.equal(B.kennungFuerStand(erneut.stand), ROW.id);
  const zweiter = dokument(SYN.beleg, { id: "local-zweiter-abruf" });
  assert.equal(B.erzeugeArtikelstand(zweiter, SYN.beleg).row.id, ROW.id);
});

test("Verschiedene Titel, Tage und Absaetze bleiben verschiedene Staende", () => {
  const titel = behoerde({ titel: TITEL + " (aktualisierte Fassung)" });
  const tag = behoerde({ datum: "2026-09-23" });
  const absatz = behoerde({ absaetze: [ABSATZ.replace("steht noch aus", "steht weiterhin aus"), ABSATZ_ZWEI] });
  for (const probe of [titel, tag, absatz]) {
    const erzeugt = B.erzeugeArtikelstand(dokument(probe.beleg), probe.beleg);
    assert.equal(erzeugt.ok, true, JSON.stringify(erzeugt));
    assert.notEqual(erzeugt.stand.standHash, STAND.standHash);
    assert.notEqual(erzeugt.row.id, ROW.id);
  }
});

test("Lage-Anzeige bindet zwei Staende derselben URL an ihre jeweilige Belegkennung", () => {
  const aelter = behoerde({ datum: "2026-09-23" });
  const aeltererStand = B.erzeugeArtikelstand(dokument(aelter.beleg), aelter.beleg).row;
  const vorgangId = "vg-zwei-staende";
  const quellen = [ROW, aeltererStand];
  const eingabe = LQ.baueEingabe([{ vorgang_id: vorgangId }], { [vorgangId]: quellen },
    new Date("2026-09-28T12:00:00Z"));
  assert.equal(eingabe[0].quellenbelege.length, 2);
  const sichtbar = lage.mapAbsatzQuellen(eingabe, { [vorgangId]: quellen })[vorgangId];
  assert.deepEqual(sichtbar.map(q => q.quelleId), eingabe[0].quellenbelege.map(q => q.quelle_id));
  assert.deepEqual(sichtbar.map(q => q.dateLabel), ["24. September 2026", "23. September 2026"]);
  assert.ok(sichtbar.every(q => q.publishedAt === ""));
});

test("Dedup trennt Stand, Altquelle und verschiedene Staende", () => {
  assert.deepEqual(D.toRawDocumentRow(ROW), ROW);
  assert.equal(D.dedupeRawDocuments([ROW, kopie(ROW)]).length, 1);
  assert.equal(G.mergeIntoDocuments([ROW])[0].raw.helmutBerlinArtikelstand.standHash, STAND.standHash);
  const zweiterFund = { ...kopie(ROW), sourceId: "zweiter-abrufweg", linkType: "direct" };
  const zusammen = G.mergeIntoDocuments([ROW, zweiterFund]);
  assert.equal(zusammen.length, 1);
  assert.equal(zusammen[0].id, ROW.id);
  assert.equal(zusammen[0].finding_count, 2);
  const andere = behoerde({ absaetze: [ABSATZ.replace("steht noch aus", "steht weiterhin aus"), ABSATZ_ZWEI] });
  const andererStand = B.erzeugeArtikelstand(dokument(andere.beleg), andere.beleg).row;
  for (const [name, fremd] of [["Altquelle", ALT], ["anderer Stand", andererStand]]) {
    for (const reihenfolge of [[ROW, fremd], [fremd, ROW]]) {
      const docs = G.mergeIntoDocuments(reihenfolge);
      assert.equal(docs.length, 2, name);
      assert.deepEqual(docs.map(d => d.id).sort(), [ROW.id, fremd.id].sort(), name);
    }
  }
  assert.equal(G.externalIdentity(ROW), "berlin-presse|" + STAND.standHash + "|erster-absatz");
  assert.equal(G.externalIdentity(ALT), null);
});

test("Drift der Stand-Metadaten wird in jedem Lesepfad laut abgewiesen", () => {
  const stelle = /berlin-artikelstand-/;
  const kaputt = [];
  const a = kopie(ROW); a.raw.helmutBerlinArtikelstand.standHash = "0".repeat(64); kaputt.push(a);
  const b = kopie(ROW); b.raw.helmutBerlinArtikelstand.titel = "Fremder Titel"; kaputt.push(b);
  const c = kopie(ROW); c.raw.helmutBerlinArtikelstand.zusatz = "unerlaubt"; kaputt.push(c);
  const d = kopie(ROW); delete d.raw.helmutBerlinArtikelstand.volltextHash; kaputt.push(d);
  const e = kopie(ROW); e.raw.helmutBerlinArtikelstand.publikationstag = "2026-09-23"; kaputt.push(e);
  const f = kopie(ROW); f.url = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1000000.php"; kaputt.push(f);
  for (const row of kaputt) {
    wirft(() => D.contentHash(row), stelle);
    wirft(() => D.toRawDocumentRow(row), stelle);
    wirft(() => B.leseArtikelstand(row), stelle);
    wirft(() => Q.understandingQuelle(row), stelle);
    wirft(() => AUS.geleseneQuelle({ ...row, quellenauszug_beleg: null }), stelle);
    wirft(() => G.planDedupWrites([row], []), stelle);
  }
  const fremd = kopie(ROW); fremd.id = ALT.id;
  wirft(() => D.dedupeRawDocuments([fremd]), /berlin-artikelstand-kennung-abweichend/);
  // Zwei gueltige, aber unterschiedliche Darstellungen desselben Standes sind widerspruechlich.
  const andere2 = behoerde({ datum: "2026-09-23" });
  const anderer = B.erzeugeArtikelstand(dokument(andere2.beleg), andere2.beleg).stand;
  wirft(() => B.leseArtikelstand({ ...kopie(ROW), berlin_artikelstand: { ...anderer } }),
    /darstellung-widerspruechlich/);
});

test("Eine manipulierte, gekuerzte oder erfundene summary wird abgewiesen", () => {
  const faelle = [["gekuerzt", ABSATZ.slice(0, 60)],
    ["veraendert", ABSATZ.replace("Beispielprogramm", "Beispielprojekt")],
    ["Leerzeichen angehaengt", ABSATZ + " "],
    ["zu lang", "x".repeat(B.MAX_ZEICHEN_ERSTER_ABSATZ + 1)],
    ["kein Text", 42]];
  for (const [name, summary] of faelle) {
    const falsch = { ...kopie(ROW), summary };
    for (const lesen of [B.leseArtikelstand, D.contentHash, D.toRawDocumentRow, Q.understandingQuelle,
      doc => AUS.geleseneQuelle({ ...doc, quellenauszug_beleg: null })]) {
      wirft(() => lesen(falsch), /berlin-artikelstand-/, name);
    }
  }
  const ohne = kopie(ROW); delete ohne.summary;
  for (const wert of [{ ...kopie(ROW), summary: null }, ohne]) {
    assert.equal(B.leseArtikelstand(wert).standHash, STAND.standHash);
    assert.equal(D.toRawDocumentRow(wert).summary, null);
    assert.equal(Q.understandingQuelle(wert).auszug, "");
  }
});

test("Zeitvertrag: sichtbar ist nur der Tag, niemals eine erfundene Uhrzeit", () => {
  const quelle = Q.understandingQuelle(ROW);
  assert.equal(quelle.veroeffentlichtAm, TAG);
  assert.equal(quelle.zeitbezug.veroeffentlichtAmOriginal, TAG);
  assert.equal(quelle.zeitbezug.publikationsjahr, 2026);
  assert.equal(quelle.zeitbezug.ereignisdatum, null);
  assert.equal(JSON.stringify(quelle).includes("T00:00"), false);
  assert.equal(quelle.auszug, ABSATZ);
  for (const zeit of ["2026-09-24T09:00:00Z", "2026-09-24T00:00:00.000Z"]) {
    wirft(() => B.leseArtikelstand({ ...kopie(ROW), published_at: zeit }), /veroeffentlichtzeit-widerspricht-tag/);
    wirft(() => Q.understandingQuelle({ ...kopie(ROW), published_at: zeit }), /berlin-artikelstand-/);
  }
  const normal = { id: "rd-normal", title: "Synthetische Meldung", url: "https://beispiel.test/meldung",
    summary: "Der Stadtrat beriet ueber das Beispielbad.", published_at: "2026-09-24T06:00:00.000Z" };
  assert.equal(Q.understandingQuelle(normal).veroeffentlichtAm, "2026-09-24T06:00:00.000Z");
  assert.equal(B.leseArtikelstand(normal), null);
  assert.equal(D.toRawDocumentRow(normal).published_at, normal.published_at);
});

test("Quellendrift: falscher Titel, falscher Tag, fremde URL, veraenderter Volltext", () => {
  const abw = (doc, belegwert, grund) => {
    const ergebnis = B.erzeugeArtikelstand(doc, belegwert);
    assert.equal(ergebnis.ok, false, grund);
    assert.equal(ergebnis.reason, grund);
  };
  abw(dokument(SYN.beleg, { title: TITEL.toUpperCase() }), SYN.beleg, "titel-abweichend");
  abw(dokument(SYN.beleg, { published_at: "2026-09-24T09:00:00Z" }), SYN.beleg, "datum-nicht-tagesgenau");
  abw(dokument(SYN.beleg, { published_at: null }), SYN.beleg, "datum-nicht-tagesgenau");
  abw(dokument(SYN.beleg, { url: "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1000000.php" }),
    SYN.beleg, "artikelziel-abweichend");
  const fremd = behoerde({ jahr: "2025", datum: "2025-09-24" });
  abw(dokument(fremd.beleg), SYN.beleg, "artikelziel-abweichend");
  const gedreht = Object.freeze({ ...SYN.beleg, volltext: SYN.beleg.volltext.replace("Beispielprogramm", "Beispielprojekt") });
  abw(DOK, gedreht, "volltexthash-abweichend");
  abw(DOK, Object.freeze({ ...SYN.beleg, zusatz: true }), "beleg-felder-ungueltig");
  // Ein nicht eingefrorener Beleg gilt nicht als geschlossenes Leserergebnis.
  abw(DOK, { ...SYN.beleg }, "beleg-nicht-geschlossen");
});

test("Lagefenster: nur der ganze Berliner Publikationstag zaehlt, DST-fest", () => {
  const ko = { id: "ko-fenster", vorgang_id: "vg-fenster" };
  const standFuerTag = tag => {
    const probe = behoerde({ datum: tag });
    const erzeugt = B.erzeugeArtikelstand(dokument(probe.beleg), probe.beleg);
    assert.equal(erzeugt.ok, true, tag);
    return erzeugt.row;
  };
  const akzeptiert = (tag, jetzt) => LQ.baueEingabe([ko], { "vg-fenster": [standFuerTag(tag)] }, jetzt).length === 1;
  const fruehjahr = new Date("2026-03-31T12:00:00Z");
  assert.equal(akzeptiert("2026-03-18", fruehjahr), true);
  assert.equal(akzeptiert("2026-03-29", fruehjahr), true);
  assert.equal(akzeptiert("2026-03-17", fruehjahr), false);
  assert.equal(akzeptiert("2026-03-31", fruehjahr), false);
  assert.equal(akzeptiert("2026-04-01", fruehjahr), false);
  const herbst = new Date("2026-10-26T12:00:00Z");
  assert.equal(akzeptiert("2026-10-13", herbst), true);
  assert.equal(akzeptiert("2026-10-25", herbst), true);
  assert.equal(akzeptiert("2026-10-12", herbst), false);
  const beleg = LQ.baueEingabe([ko], { "vg-fenster": [standFuerTag("2026-03-29")] }, fruehjahr)[0].quellenbelege[0];
  assert.equal(beleg.veroeffentlichtAm, "2026-03-29");
  assert.equal(beleg.auszug, ABSATZ);
  assert.equal(JSON.stringify(beleg).includes("T00:00"), false);
  assert.equal(F.berlinTagVollImFenster("2026-03-29", Date.parse("2026-03-28T23:00:00Z"), Date.parse("2026-03-29T22:00:00Z")), true);
  assert.equal(F.berlinTagVollImFenster("2026-03-29", Date.parse("2026-03-28T23:00:01Z"), Date.parse("2026-03-29T22:00:00Z")), false);
  assert.equal(F.berlinTagVollImFenster("2026-02-30", 0, Number.MAX_SAFE_INTEGER), false);
});

// --- Echte amtliche Originalprobe (nur wenn vorhanden) ------------------------------------
const ORIGINAL_DIR = "/private/tmp/helmut-landesversorgung-originale";
const ORIGINAL_URL = "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php";
const ORIGINAL_TITEL = "Reform der Kinder- und Jugendhilfe: Berlin fordert verbindlichen Fahrplan und verlässliche Finanzierung";
const ORIGINAL_TAG = "2026-09-25";
const ORIGINAL_VOLLTEXT_HASH = "6981f4be2aba74e8a8372aa29f0317c8193596111bc2ea448e86b4302a64d24a";
const ORIGINAL_HTML_HASH = "6f026cd9b508e7c15e1c54960918201c3401d54ec6335daec4c9f5b2e88b871e";
const ORIGINAL_ABSATZ_HASH = "43baa7c74488a39c41f531c0d3dbb141af207937069215408507d6101fd70826";
let ORIGINAL = null;
{
  const htmlDatei = path.join(ORIGINAL_DIR, "be-bjf-kinder-jugendhilfe-20260925.html");
  const pruefDatei = path.join(ORIGINAL_DIR, "be-bjf-kinder-jugendhilfe-pruefung.json");
  if (fs.existsSync(htmlDatei) && fs.existsSync(pruefDatei)) {
    const pruefung = JSON.parse(fs.readFileSync(pruefDatei, "utf8"));
    const html = fs.readFileSync(htmlDatei, "utf8");
    const doc = { id: "local-berlin-bjf-kinder-jugendhilfe", title: ORIGINAL_TITEL, url: ORIGINAL_URL,
      canonical_url: ORIGINAL_URL, published_at: ORIGINAL_TAG, retrieved_at: null, summary: "" };
    ORIGINAL = { doc, eingabe: { url: pruefung.quelle.url, finalUrl: pruefung.quelle.finalUrl,
      http: pruefung.quelle.http, html } };
  }
}

test("Echte Originalprobe: 619 Zeichen, hashgebundener erster Absatz, Tag ohne Uhrzeit", () => {
  if (!ORIGINAL) { console.log("SKIP echte Originalprobe: /private/tmp/helmut-landesversorgung-originale fehlt (CI-tauglich)"); return; }
  const erzeugt = B.standAusOriginal(ORIGINAL.doc, ORIGINAL.eingabe);
  assert.equal(erzeugt.ok, true, JSON.stringify(erzeugt));
  const { stand, row, absatz } = erzeugt;
  assert.equal(stand.url, "https://berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1718345.php");
  assert.equal(stand.titel, ORIGINAL_TITEL);
  assert.equal(stand.publikationstag, ORIGINAL_TAG);
  assert.equal(stand.absatzHash, ORIGINAL_ABSATZ_HASH);
  assert.equal(stand.volltextHash, ORIGINAL_VOLLTEXT_HASH);
  assert.equal(absatz.length, 619);
  assert.equal(sha(absatz), ORIGINAL_ABSATZ_HASH);
  assert.equal(row.summary, absatz);
  assert.equal(row.published_at, null);
  // Die geschlossene Normalform ist revalidierbar; der Beleg selbst bleibt eingefroren.
  assert.equal(B.pruefeArtikelstand(stand).standHash, stand.standHash);
  assert.deepEqual(row.raw.helmutBerlinArtikelstand, { ...stand });
  assert.equal(JSON.stringify(row.raw).includes(absatz.slice(0, 60)), false);
  assert.equal(JSON.stringify(row.raw).includes("<"), false);
  assert.equal(sha(ORIGINAL.eingabe.html), ORIGINAL_HTML_HASH);
  console.log(`     Original: erster Absatz ${absatz.length} Zeichen, Absatzhash ${stand.absatzHash.slice(0, 12)}..., Tag ${stand.publikationstag}`);
});

// --- Import/Dedup -> Speicherprojektion -> Lage-Quellenbeleg -> sichtbares Datum ------------
async function speicherUndLeser() {
  const quelle = ORIGINAL || { doc: DOK, eingabe: SYN.eingabe };
  const erzeugt = ORIGINAL ? B.standAusOriginal(quelle.doc, quelle.eingabe) : ERZEUGT;
  assert.equal(erzeugt.ok, true);
  const doc = erzeugt.row;
  const absatz = erzeugt.absatz;
  const tag = erzeugt.stand.publikationstag;
  const KO = "ko-vg-berlin", VORGANG = "vg-berlin";

  const echtesFetch = global.fetch;
  const gespeichert = new Map();
  const links = [{ knowledge_object_id: KO, raw_document_id: doc.id }];
  let schreibAnfragen = 0, fundstellen = 0;
  const antwort = (daten, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status,
    statusText: "OK", text: () => Promise.resolve(daten == null ? "" : JSON.stringify(daten)) });
  const spaltenAus = select => select.replace(/^.*raw_documents(?:!inner)?\(/u, "").replace(/\)$/u, "").split(",");
  const projiziere = (row, select) => Object.fromEntries(spaltenAus(select).map(spalte => {
    if (spalte === "bundestag_artikelstand:raw->helmutBundestagArtikelstand") return ["bundestag_artikelstand", row.raw?.helmutBundestagArtikelstand || null];
    if (spalte === "berlin_artikelstand:raw->helmutBerlinArtikelstand") return ["berlin_artikelstand", row.raw?.helmutBerlinArtikelstand || null];
    if (spalte === "bundestag_abgerufen_at:retrieved_at") return ["bundestag_abgerufen_at", row.retrieved_at ?? null];
    if (spalte === "berlin_abgerufen_at:retrieved_at") return ["berlin_abgerufen_at", row.retrieved_at ?? null];
    if (spalte === "dip_quellfelder:raw->helmutDipQuellfelder") return ["dip_quellfelder", row.raw?.helmutDipQuellfelder || null];
    if (spalte === "quellenauszug_beleg:raw->helmutQuellenkontext") return ["quellenauszug_beleg", null];
    return [spalte, row[spalte]];
  }).filter(([, wert]) => wert !== undefined));
  const pubFilter = (zeilen, url) => {
    let out = zeilen;
    for (const filter of url.searchParams.getAll("raw_documents.published_at")) {
      if (filter === "is.null") out = out.filter(x => x.doc.published_at == null);
      else if (filter.startsWith("gte.")) out = out.filter(x => x.doc.published_at != null && Date.parse(x.doc.published_at) >= Date.parse(filter.slice(4)));
      else if (filter.startsWith("lte.")) out = out.filter(x => x.doc.published_at != null && Date.parse(x.doc.published_at) <= Date.parse(filter.slice(4)));
    }
    if (url.searchParams.get("raw_documents.raw->helmutBundestagArtikelstand") === "not.is.null") {
      out = out.filter(x => x.doc.raw?.helmutBundestagArtikelstand != null);
    }
    if (url.searchParams.get("raw_documents.raw->helmutBerlinArtikelstand") === "not.is.null") {
      out = out.filter(x => x.doc.raw?.helmutBerlinArtikelstand != null);
    }
    return out;
  };
  // Lokale PostgREST-Attrappe: dieselben echten Storage-Leser und -Schreibwege, kein Netz.
  global.fetch = (adresse, options = {}) => {
    const url = new URL(String(adresse), "http://127.0.0.1:9");
    const select = url.searchParams.get("select") || "";
    const methode = String(options.method || "GET").toUpperCase();
    if (methode === "POST" && url.pathname === "/rest/v1/raw_documents") {
      schreibAnfragen += 1;
      const rows = JSON.parse(String(options.body || "[]"));
      const liste = Array.isArray(rows) ? rows : [rows];
      for (const row of liste) gespeichert.set(row.id, kopie(row));
      return antwort(liste.map(row => ({ id: row.id })));
    }
    if (methode === "POST" && url.pathname === "/rest/v1/document_findings") { fundstellen += 1; return antwort([]); }
    if (methode === "PATCH" && url.pathname === "/rest/v1/raw_documents") return antwort([]);
    if (methode === "GET" && url.pathname === "/rest/v1/raw_documents") {
      let zeilen = [...gespeichert.values()];
      const idFilter = url.searchParams.get("id") || "";
      if (idFilter.startsWith("in.")) {
        const ids = idFilter.slice(4, -1).split(",").map(v => v.replace(/^"|"$/g, ""));
        zeilen = zeilen.filter(row => ids.includes(row.id));
      }
      const offset = Number(url.searchParams.get("offset") || 0);
      zeilen = zeilen.slice(offset, offset + Number(url.searchParams.get("limit") || 1000));
      return antwort(zeilen.map(row => projiziere(row, select)));
    }
    if (methode === "GET" && url.pathname === "/rest/v1/ko_document_links") {
      const koFilter = url.searchParams.get("knowledge_object_id") || "";
      const koIds = koFilter.startsWith("in.") ? JSON.parse("[" + koFilter.slice(4, -1) + "]") : [koFilter.replace(/^eq\./, "")];
      let zeilen = links.filter(link => koIds.includes(link.knowledge_object_id))
        .map(link => ({ knowledge_object_id: link.knowledge_object_id, raw_document_id: link.raw_document_id,
          doc: gespeichert.get(link.raw_document_id) })).filter(x => x.doc);
      const docFilter = url.searchParams.get("raw_document_id") || "";
      if (docFilter.startsWith("in.")) {
        const ids = docFilter.slice(4, -1).split(",").map(v => v.replace(/^\\?"|\\?"$/g, ""));
        zeilen = zeilen.filter(x => ids.includes(x.raw_document_id));
      }
      zeilen = pubFilter(zeilen, url);
      const offset = Number(url.searchParams.get("offset") || 0);
      zeilen = zeilen.slice(offset, offset + Number(url.searchParams.get("limit") || 1000));
      return antwort(zeilen.map(x => select.includes("knowledge_object_id")
        ? { knowledge_object_id: x.knowledge_object_id, raw_document_id: x.raw_document_id, raw_documents: projiziere(x.doc, select) }
        : { raw_documents: projiziere(x.doc, select) }));
    }
    return antwort([]);
  };
  const namen = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE"];
  const vorher = Object.fromEntries(namen.map(name => [name, process.env[name]]));
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "rein-lokaler-testwert-berlin-artikelstand";
  process.env.HELMUT_V3_STORE = "on";
  try {
    const warteschlange = await storage.persistiereRohdokumenteWarteschlange([doc]);
    assert.equal(warteschlange.ok, true);
    assert.equal(warteschlange.neuIds.length, 1);
    const geschrieben = [...gespeichert.values()][0];
    assert.equal(geschrieben.published_at, null);
    assert.deepEqual(geschrieben.raw.helmutBerlinArtikelstand, erzeugt.stand);
    assert.equal(geschrieben.raw.helmutBundestagArtikelstand, undefined);
    assert.equal(geschrieben.summary, absatz);
    assert.equal(JSON.stringify(geschrieben.raw).includes(absatz.slice(0, 40)), false);
    bestanden += 1; console.log("OK Warteschlangen-Schreibweg speichert Stand, ersten Absatz und leere Uhrzeit");

    const plan = G.planDedupWrites([doc], []);
    const lauf = await storage.persistRawDocumentsDeduped([doc]);
    assert.equal(lauf.persisted, plan.persists.length);
    assert.equal(fundstellen, 1);
    const erneut = await storage.persistRawDocumentsDeduped([doc]);
    assert.equal(erneut.persisted, 0);
    assert.equal(schreibAnfragen, 2);
    bestanden += 1; console.log("OK Zweiter Cutover liest den gespeicherten Stand ohne kanonisches Ziel wieder");

    const erwartet = [doc];
    const leser = [
      ["Erstverstehen", () => storage.listRecentRawDocuments(10, 30)],
      ["Rohdokumentfenster", () => storage.listRawDocuments({ limit: 10, days: 30 })],
      ["Warteschlangenauftrag", () => storage.getRawDocumentsByIds([doc.id])],
      ["Aktualisierung", () => storage.listKoDocuments(KO)],
      ["Vorgangsquellen", () => storage.getSourcesForVorgang(VORGANG)],
      ["Gebundene Lagequellen", () => storage.getSourcesForVorgang(VORGANG, { lageKoId: KO, lageQuellen: erwartet })]
    ];
    for (const [name, lesen] of leser) {
      const gelesen = await lesen();
      assert.equal(gelesen.length, 1, name);
      const quelleRow = gelesen[0];
      assert.equal(Object.hasOwn(quelleRow, "raw"), false, name);
      assert.equal(quelleRow.summary, absatz, name);
      assert.deepEqual(quelleRow.berlin_artikelstand, erzeugt.stand, name);
      assert.equal(B.leseArtikelstand(quelleRow).standHash, erzeugt.stand.standHash, name);
      assert.equal(D.toRawDocumentRow(quelleRow).id, doc.id, name);
      assert.equal(Q.understandingQuelle(quelleRow).veroeffentlichtAm, tag, name);
      bestanden += 1; console.log("OK " + name + ": Stand-Metadaten und sichtbarer Tag bleiben erhalten");
    }

    const lageJetzt = new Date("2026-09-28T12:00:00Z");
    const koLage = { id: KO, vorgang_id: VORGANG };
    const metadata = await storage.listAktuelleLageQuellen([KO], lageJetzt);
    assert.equal(metadata.length, 1);
    assert.equal(metadata[0].raw_documents.published_at, null);
    assert.equal(metadata[0].raw_documents.summary, absatz);
    assert.deepEqual(metadata[0].raw_documents.berlin_artikelstand, erzeugt.stand);
    const lageEingabe = LQ.baueEingabe([koLage], { [VORGANG]: metadata.map(r => r.raw_documents) }, lageJetzt);
    assert.equal(lageEingabe.length, 1);
    assert.equal(lageEingabe[0].quellenbelege[0].auszug, absatz);
    assert.equal(lageEingabe[0].quellenbelege[0].veroeffentlichtAm, tag);
    assert.equal(JSON.stringify(lageEingabe).includes("T00:00"), false);
    const gebunden = await storage.getSourcesForVorgang(VORGANG, { lageKoId: KO, lageQuellen: metadata.map(r => r.raw_documents) });
    assert.equal(gebunden.length, 1);
    assert.equal(gebunden[0].summary, absatz);
    const gebundeneEingabe = LQ.baueEingabe([koLage], { [VORGANG]: gebunden }, lageJetzt);
    assert.equal(gebundeneEingabe[0].quellenbelege[0].auszug, absatz);
    assert.equal(gebundeneEingabe[0].quellenbelege[0].veroeffentlichtAm, tag);
    assert.equal(gebundeneEingabe[0].quellenbelege[0].quelle_id, lageEingabe[0].quellenbelege[0].quelle_id);
    const sichtbar = lage.mapSource(gebunden[0]);
    assert.equal(sichtbar.dateLabel, "25. September 2026");
    assert.equal(sichtbar.publishedAt, "");
    const karte = lage.koToVorgangCard({ vorgang_id: VORGANG, headline: "Berliner Artikel" }, gebunden, lageJetzt);
    assert.equal(karte.sources[0].dateLabel, "25. September 2026");
    assert.equal(karte.sources[0].publishedAt, "");
    wirft(() => lage.mapSource({ ...gebunden[0], published_at: "2026-09-25T00:00:00Z" }),
      /berlin-artikelstand-veroeffentlichtzeit-widerspricht-tag/);
    bestanden += 1; console.log("OK Berliner Stand erreicht den Lage-Quellenbeleg mit ganzem erstem Absatz und tagesgenauem Datum");

    const vorherRow = kopie(gespeichert.get(doc.id));
    for (const aenderung of [{ raw: {} }, { summary: null }, { summary: absatz + " Fremder Zusatz." }]) {
      gespeichert.set(doc.id, { ...kopie(vorherRow), ...aenderung });
      await assert.rejects(() => storage.getSourcesForVorgang(VORGANG,
        { lageKoId: KO, lageQuellen: metadata.map(r => r.raw_documents) }),
      e => e.name === "StorageReadError" && e.quelle === "lage-quellenbindung");
    }
    gespeichert.set(doc.id, vorherRow);
    bestanden += 1; console.log("OK Stand- oder Absatzverlust beim Folgelesen wird laut verweigert");

    const ohneStand = kopie(vorherRow);
    delete ohneStand.raw.helmutBerlinArtikelstand;
    gespeichert.set(doc.id, ohneStand);
    assert.deepEqual(await storage.listAktuelleLageQuellen([KO], lageJetzt), []);
    gespeichert.set(doc.id, vorherRow);
    bestanden += 1; console.log("OK Ohne Stand-Metadaten ist die Zeile im Lagefenster unsichtbar (kein Ersatzdatum)");
  } finally {
    for (const name of namen) {
      if (vorher[name] === undefined) delete process.env[name];
      else process.env[name] = vorher[name];
    }
    global.fetch = echtesFetch;
  }
}

speicherUndLeser().then(() => {
  console.log(`\n${bestanden} Pruefgruppen erfolgreich; synthetische und amtliche lokale Belege, keine Production-Daten.`);
}).catch(error => { console.error(error); process.exitCode = 1; });
