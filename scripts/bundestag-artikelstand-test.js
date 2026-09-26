"use strict";

// Synthetischer Vertragstest des Quellen-Artikelstands fuer den belegten Bundestagsfall.
// Ausschliesslich erfundene Texte und erfundene Adressen; kein echter Artikelabsatz, kein
// Netz, kein Modell, keine Production-Daten. Der fetch-Ersatz ist eine lokale PostgREST-
// Attrappe fuer die echten Storage-Leser und die beiden echten Rohdokument-Schreibwege.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const B = require("../lib/helmut/bundestag-artikelstand");
const A = require("../lib/helmut/artikelkontext");
const D = require("../lib/helmut/dedup");
const G = require("../lib/helmut/quellenarchitektur/dedup-global");
const Q = require("../lib/helmut/quellen-zeitvertrag");
const LQ = require("../lib/helmut/lage-quellenbeleg");
const F = require("../lib/helmut/briefing-frische");
const AUS = require("../lib/helmut/quellen-auszug");
const U = require("../lib/helmut/understanding");
const storage = require("../lib/helmut/storage");

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const kopie = value => JSON.parse(JSON.stringify(value));
const TAG = "2026-09-25";
const TITEL = "Synthetischer Ausschussbericht zur Beispielreform beschlossen";
const ARTIKEL_URL = "https://www.bundestag.de/dokumente/textarchiv/2026/kw39-synthetische-beispielreform-1234567";
const KANONISCH = D.canonicalizeUrl(ARTIKEL_URL);
// Bewusst laenger als die alte generische 600-Zeichen-Grenze und innerhalb der
// amtlichen 1200-Zeichen-Grenze: nur so ist belegbar, dass der validierte
// Leitabsatz vollstaendig gebunden und niemals per Satzpraefix gekuerzt wird.
const ABSATZ = "Zu Beginn der synthetischen Sitzung hat der Beispielausschuss den Entwurf fuer eine Beispielreform "
  + "ohne Aussprache angenommen. In namentlicher Abstimmung stimmten 300 Abgeordnete zu, 100 stimmten dagegen. "
  + "Es gab 50 Enthaltungen. Der Beschluss empfiehlt dem Plenum, die Vorlage in der kommenden Sitzungswoche in "
  + "zweiter Lesung zu beraten und die vorgesehenen Mittel fuer die Jahre 2027 bis 2029 in der vereinbarten "
  + "Hoehe einzusetzen. Die Berichterstatterinnen und Berichterstatter sollen die Stellungnahmen der beteiligten "
  + "Verbaende in die Beschlussempfehlung aufnehmen und dem Ausschuss vor der Sitzungswoche schriftlich berichten. "
  + "Eine weitere Pruefung durch ein unabhaengiges Gutachten ist nicht vorgesehen.";
const ALTER_TITEL = "Frueherer synthetischer Bericht derselben Adresse";
const ALTER_TAG = "2026-09-14T11:20:09.000Z";
let bestanden = 0;
function test(name, fn) { fn(); bestanden += 1; console.log("OK " + name); }
function wirft(fn, enthalt) {
  const muster = typeof enthalt === "string" ? new RegExp(enthalt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) : enthalt;
  try { fn(); } catch (error) { assert.match(String(error && error.message), muster); return; }
  assert.fail("erwarteter Fehler fehlt: " + enthalt);
}
function dokument(patch = {}) {
  return { id: "local-synthetischer-bundestagsbeleg", title: TITEL, url: ARTIKEL_URL, canonical_url: ARTIKEL_URL,
    published_at: TAG, retrieved_at: "2026-09-26T09:00:00.000Z", summary: "", ...patch };
}
function beleg(doc = dokument(), patch = {}, gewinnungPatch = {}) {
  return { version: 2, dokumentId: doc.id, quellenHash: A.quellenstandHash(doc), artikelUrl: doc.url,
    artikelTitel: doc.title, herkunft: "strukturierter-originalartikel", gelesenAm: "2026-09-26T10:15:00.000Z",
    absatzPosition: 1, text: ABSATZ, textHash: sha(ABSATZ),
    gewinnung: { verfahren: "bundestag-artikel-leitabsatz-v1", positionsbasis: "html-article-p",
      antwortHash: sha("synthetische-antwort"), artikelTextHash: sha("synthetischer-artikeltext"),
      artikelTextPosition: 0, titelTreffer: 3, kandidatZahl: 1, artikelAbsatzZahl: 4, ...gewinnungPatch },
    ...patch };
}
function abweisung(doc, belegwert, grund) {
  const ergebnis = B.erzeugeArtikelstand(doc, belegwert);
  assert.equal(ergebnis.ok, false, grund);
  assert.equal(ergebnis.reason, grund);
}
const DOK = dokument();
const BELEG = beleg(DOK);
const ERZEUGT = B.erzeugeArtikelstand(DOK, BELEG);
const STAND = ERZEUGT.stand;
const ROW = ERZEUGT.row;
const ALT = { id: "rd-" + sha("url:" + KANONISCH), content_hash: sha("url:" + KANONISCH),
  canonical_url: KANONISCH, url: ARTIKEL_URL, title: ALTER_TITEL, published_at: ALTER_TAG,
  source_name: "Synthetische Altquelle" };
const NORMAL = { title: "Synthetische Stadtratsmeldung ohne Stand", url: "https://beispiel.test/ratsmeldung",
  content: "Der Stadtrat beriet am Dienstag ueber die Finanzierung des Beispielbades.", publishedAt: "2026-09-24T06:00:00Z" };

test("Erstellung bindet die neue Kennung an URL, exakten Titel, Tag und Absatzhash", () => {
  assert.equal(ERZEUGT.ok, true);
  assert.deepEqual(Object.keys(STAND), ["version", "herkunft", "url", "titel", "publikationstag", "absatzHash", "standHash"]);
  assert.equal(STAND.version, 1);
  assert.equal(STAND.herkunft, "bundestag-textarchiv-leitabsatz");
  assert.equal(STAND.url, KANONISCH);
  assert.equal(STAND.titel, TITEL);
  assert.equal(STAND.publikationstag, TAG);
  assert.equal(STAND.absatzHash, sha(ABSATZ));
  assert.equal(STAND.standHash, B.standHashFuer({ url: KANONISCH, titel: TITEL, publikationstag: TAG, absatzHash: sha(ABSATZ) }));
  assert.equal(ROW.id, "rd-" + STAND.standHash);
  assert.equal(ROW.content_hash, STAND.standHash);
  assert.equal(ROW.canonical_url, KANONISCH);
  assert.equal(ROW.title, TITEL);
  assert.equal(ROW.published_at, null);
  // Der validierte Leitabsatz selbst steht unveraendert als summary der Rohzeile.
  assert.equal(ROW.summary, ABSATZ);
  assert.equal(ROW.summary.length, ABSATZ.length);
  assert.deepEqual(Object.keys(ROW.raw), ["sourcePriority", "originalUrl", "helmutBundestagArtikelstand"]);
  assert.deepEqual(ROW.raw.helmutBundestagArtikelstand, STAND);
  assert.equal(B.leseArtikelstand(ROW).standHash, STAND.standHash);
  // Eigener Namespace: niemals die alte URL-Kennung, und kein Absatztext/Roh-HTML in raw.
  assert.notEqual(ROW.id, ALT.id);
  assert.notEqual(ROW.id, "rd-" + sha("url:" + KANONISCH));
  assert.equal(JSON.stringify(ROW.raw).includes(ABSATZ.slice(0, 60)), false);
  assert.equal(JSON.stringify(ROW.raw).includes("<"), false);
});

test("Der Beleg ist nach der Projektion nur ueber die neue Kennung gebunden", () => {
  assert.equal(ERZEUGT.beleg.dokumentId, ROW.id);
  assert.equal(ERZEUGT.beleg.quellenHash, A.quellenstandHash(ROW));
  assert.equal(ERZEUGT.beleg.text, ABSATZ);
  assert.equal(ERZEUGT.beleg.textHash, sha(ABSATZ));
  assert.equal(ERZEUGT.beleg.artikelUrl, DOK.url);
  assert.equal(ERZEUGT.beleg.artikelTitel, TITEL);
  assert.deepEqual(ERZEUGT.beleg.gewinnung, BELEG.gewinnung);
  assert.equal(A.pruefeArtikelkontext([ROW], ERZEUGT.beleg).dokumentId, ROW.id);
  wirft(() => A.pruefeArtikelkontext([DOK], ERZEUGT.beleg), /artikelkontext-/);
});

test("Wiederholte Erzeugung desselben Standes behaelt dieselbe Kennung", () => {
  const erneut = B.erzeugeArtikelstand(kopie(DOK), kopie(BELEG));
  assert.equal(erneut.ok, true);
  assert.deepEqual(erneut.stand, STAND);
  assert.deepEqual(erneut.row, ROW);
  assert.deepEqual(erneut.beleg, ERZEUGT.beleg);
  assert.equal(D.contentHash(ROW), STAND.standHash);
  assert.equal(B.kennungFuerStand(erneut.stand), ROW.id);
  // Ein anderer lokaler Belegname ist kein Identitaetsbeweis: derselbe Stand bleibt derselbe.
  const zweiter = dokument({ id: "local-zweiter-abruf" });
  const nochmal = B.erzeugeArtikelstand(zweiter, beleg(zweiter));
  assert.equal(nochmal.ok, true);
  assert.equal(nochmal.stand.standHash, STAND.standHash);
  assert.equal(nochmal.row.id, ROW.id);
  assert.equal(nochmal.beleg.dokumentId, ROW.id);
});

test("DIP-Metadaten bleiben unveraendert neben dem bestehenden Rohquellenvertrag", () => {
  const DIP = require("../lib/helmut/dip");
  const S = require("../lib/helmut/scheduler");
  const QF = require("../lib/helmut/dip-quellfelder");
  const dipItem = S.dipDocToRawItem(DIP.normalizeDrucksache({ id: 990001,
    titel: "Synthetische Antwort auf die Kleine Anfrage - Drucksache 21/9900 - Beispielpruefung",
    drucksachetyp: "Antwort", dokumentart: "Drucksache", datum: "2026-09-19", wahlperiode: 21,
    fundstelle: { pdf_url: "https://dserver.bundestag.de/btd/21/099/2109900.pdf" } }));
  const dipRow = D.toRawDocumentRow(dipItem);
  assert.equal(QF.quellenangaben(dipRow).dokumenttyp, "Antwort");
  assert.equal(Object.hasOwn(dipRow.raw, "helmutBundestagArtikelstand"), false);
  assert.deepEqual(D.toRawDocumentRow(dipRow), dipRow);
  assert.deepEqual(Object.keys(dipRow.raw), ["sourcePriority", "originalUrl", "helmutDipQuellfelder"]);
});

test("Verschiedene Titel, Tage und Absaetze bleiben verschiedene Staende", () => {
  const titelDoc = dokument({ title: TITEL + " (aktualisierte Fassung)" });
  const tagDoc = dokument({ published_at: "2026-09-24" });
  const absatz = ABSATZ.replace("50 Enthaltungen", "49 Enthaltungen");
  const variante = B.erzeugeArtikelstand(titelDoc, beleg(titelDoc));
  const tag = B.erzeugeArtikelstand(tagDoc, beleg(tagDoc));
  const text = B.erzeugeArtikelstand(DOK, beleg(DOK, { text: absatz, textHash: sha(absatz) }));
  for (const andere of [variante, tag, text]) {
    assert.equal(andere.ok, true);
    assert.notEqual(andere.stand.standHash, STAND.standHash);
    assert.notEqual(andere.row.id, ROW.id);
  }
  assert.equal(text.stand.absatzHash, sha(ABSATZ.replace("50 Enthaltungen", "49 Enthaltungen")));
});

test("Die Rohzeile ist gegen sich selbst stabil und dedupliziert nur mit sich", () => {
  assert.deepEqual(D.toRawDocumentRow(ROW), ROW);
  assert.deepEqual(D.toRawDocumentRow({ ...ROW, bundestag_artikelstand: kopie(STAND) }), ROW);
  assert.equal(D.dedupeRawDocuments([ROW, kopie(ROW)]).length, 1);
  assert.equal(D.dedupeRawDocuments([ROW, kopie(ROW)])[0].id, ROW.id);
  assert.equal(B.leseArtikelstand({ ...ROW, raw: undefined, bundestag_artikelstand: kopie(STAND) }).standHash, STAND.standHash);
  assert.equal(B.leseArtikelstand({ id: ROW.id, canonical_target_url: KANONISCH, bundestag_artikelstand: kopie(STAND) }).standHash,
    STAND.standHash);
});

test("Die historische Altquelle derselben URL bleibt unveraendert", () => {
  const alt = kopie(ALT);
  const vorher = JSON.stringify(alt);
  const erneut = B.erzeugeArtikelstand(kopie(DOK), kopie(BELEG));
  assert.equal(JSON.stringify(alt), vorher);
  assert.deepEqual(alt, ALT);
  assert.equal(alt.content_hash, sha("url:" + KANONISCH));
  assert.equal(D.contentHash(alt), alt.content_hash);
  assert.equal(B.leseArtikelstand(alt), null);
  assert.equal(D.toRawDocumentRow(alt).id, alt.id);
  assert.notEqual(alt.id, erneut.row.id);
  assert.notEqual(D.contentHash(alt), D.contentHash(ROW));
});

test("Ungueltige oder widerspruechliche Standmetadaten fallen nie auf die alte URL-Kennung zurueck", () => {
  const absatz = ABSATZ.replace("50 Enthaltungen", "49 Enthaltungen");
  const andererStand = B.erzeugeArtikelstand(DOK, beleg(DOK, { text: absatz, textHash: sha(absatz) })).stand;
  const stelle = "bundestag-artikelstand-";
  const kaputt = [];
  const a = kopie(ROW); a.raw.helmutBundestagArtikelstand.standHash = "0".repeat(64); kaputt.push(a);
  const b = kopie(ROW); b.raw.helmutBundestagArtikelstand.titel = "Fremder Titel"; kaputt.push(b);
  const c = kopie(ROW); c.raw.helmutBundestagArtikelstand.zusatz = "unerlaubt"; kaputt.push(c);
  const d = kopie(ROW); d.raw.helmutBundestagArtikelstand.standHash = undefined; kaputt.push(d);
  const e = kopie(ROW); e.published_at = "2026-09-25T00:00:00.000Z"; kaputt.push(e);
  const f = kopie(ROW); f.url = "https://www.bundestag.de/dokumente/textarchiv/2026/kw39-andere-reform-7654321"; kaputt.push(f);
  const g = kopie(ROW); g.bundestag_artikelstand = { ...kopie(STAND), publikationstag: "2026-09-24" }; kaputt.push(g);
  const h = kopie(ROW); h.bundestag_artikelstand = kopie(andererStand); kaputt.push(h);
  for (const row of kaputt) {
    wirft(() => D.contentHash(row), stelle);
    wirft(() => D.toRawDocumentRow(row), stelle);
    wirft(() => B.leseArtikelstand(row), stelle);
  }
  const kennung = kopie(ROW); kennung.content_hash = sha("url:" + KANONISCH);
  wirft(() => D.dedupeRawDocuments([kennung]), /bundestag-artikelstand-kennung-abweichend/);
  const idFremd = kopie(ROW); idFremd.id = ALT.id;
  wirft(() => D.dedupeRawDocuments([idFremd]), /bundestag-artikelstand-kennung-abweichend/);
  wirft(() => B.leseArtikelstand({ ...kopie(ROW), bundestag_artikelstand: kopie(andererStand) }),
    /bundestag-artikelstand-darstellung-widerspruechlich/);
  // Gegenprobe: ohne Standmetadaten ist derselbe Inhalt weiterhin die normale URL-Identitaet.
  const ohne = { ...ROW, raw: { ...ROW.raw } };
  delete ohne.raw.helmutBundestagArtikelstand;
  assert.equal(D.toRawDocumentRow(ohne).id, ALT.id);
});

test("Nicht-Bundestag, generische und manuelle Belege werden abgewiesen", () => {
  abweisung(DOK, { ...BELEG, version: 1, herkunft: "manueller-originalvergleich" }, "beleg-nicht-bundestag");
  abweisung(DOK, beleg(DOK, {}, { verfahren: "deutschlandfunk-artikel-leitabsatz-v1", positionsbasis: "html-article-div" }),
    "beleg-nicht-bundestag");
  abweisung(DOK, beleg(DOK, {}, { verfahren: "artikel-absatz-titel-v1" }), "beleg-nicht-bundestag");
  const fremd = dokument({ url: "https://beispiel.test/dokumente/textarchiv/2026/kw39-beispiel-1",
    canonical_url: "https://beispiel.test/dokumente/textarchiv/2026/kw39-beispiel-1" });
  const fremdBeleg = beleg(fremd);
  abweisung(fremd, fremdBeleg, "gewinnung-ungueltig");
});

test("Falscher Titel, fehlende Tagesgenauigkeit, falsche Hashes und unbekannte Felder werden abgewiesen", () => {
  abweisung(DOK, { ...BELEG, artikelTitel: TITEL.toUpperCase() }, "titel-abweichend");
  abweisung(DOK, { ...BELEG, textHash: "a".repeat(64) }, "text-hash-abweichend");
  abweisung(DOK, { ...BELEG, zusatz: true }, "beleg-feld-unbekannt");
  abweisung(DOK, beleg(DOK, {}, { zusatz: true }), "gewinnung-feld-unbekannt");
  for (const tag of ["2026-09-25T00:00:00Z", "2026-09-25T00:00:00.000Z", "", null, "2026-09-31", "25.09.2026"]) {
    const doc = dokument({ published_at: tag });
    abweisung(doc, beleg(doc), "datum-nicht-tagesgenau");
  }
  abweisung(DOK, beleg(DOK, { dokumentId: "" }), "dokumentkennung-fehlt");
  abweisung(DOK, beleg(DOK, { dokumentId: "andere-kennung" }), "dokumentbindung-mehrdeutig-oder-fehlend");
  abweisung(DOK, beleg(DOK, { text: "zu kurz" , textHash: sha("zu kurz") }), "absatz-ungueltig");
});

test("Zeitvertrag und Prompt kennen nur den validierten Tag, keine Uhrzeit", () => {
  const quelle = Q.understandingQuelle(ROW);
  assert.equal(quelle.veroeffentlichtAm, TAG);
  assert.equal(quelle.zeitbezug.veroeffentlichtAmOriginal, TAG);
  assert.equal(quelle.zeitbezug.publikationsjahr, 2026);
  assert.equal(quelle.zeitbezug.ereignisdatum, null);
  assert.equal(JSON.stringify(quelle).includes("T00:00"), false);
  const prompt = U.buildUnderstandingPrompt({ documents: [ROW] });
  assert.equal(prompt.includes('"veroeffentlichtAm":"' + TAG + '"'), true);
  assert.equal(prompt.includes(TAG + "T00:00"), false);
  const normal = { id: "rd-normal", title: "Synthetische Meldung", url: "https://beispiel.test/meldung",
    summary: "Der Stadtrat beriet ueber das Beispielbad.", published_at: "2026-09-24T06:00:00.000Z" };
  assert.equal(Q.understandingQuelle(normal).veroeffentlichtAm, "2026-09-24T06:00:00.000Z");
  assert.equal(B.leseArtikelstand(normal), null);
});

test("Der ganze Leitabsatz ueber 600 Zeichen wird nie gekuerzt oder praefixiert", () => {
  assert(ABSATZ.length > 600 && ABSATZ.length <= require("../lib/helmut/artikelkontext").MAX_ZEICHEN_BUNDESTAG_LEITABSATZ);
  assert.equal(ROW.summary, ABSATZ);
  assert.equal(sha(ROW.summary), STAND.absatzHash);
  assert.deepEqual(D.toRawDocumentRow(ROW), ROW);
  assert.equal(D.dedupeRawDocuments([ROW, kopie(ROW)])[0].summary, ABSATZ);
  assert.equal(G.mergeIntoDocuments([ROW])[0].summary, ABSATZ);
  assert.equal(Q.understandingQuelle(ROW).auszug, ABSATZ);
  assert.equal(AUS.geleseneQuelle({ ...kopie(ROW), quellenauszug_beleg: null }).summary, ABSATZ);
  // Die generische Snippetgrenze fuer gewoehnliche Quellen bleibt unveraendert.
  const lang = "Synthetischer Satz zur Finanzierung des Beispielbades. ".repeat(30);
  const normalRow = D.toRawDocumentRow({ title: "Synthetischer Bericht zum Beispielbad",
    url: "https://beispiel.test/beispielbad", summary: lang, publishedAt: "2026-09-24T06:00:00Z" });
  assert(normalRow.summary.length <= D.SUMMARY_MAX);
  assert(normalRow.summary.length < lang.length);
});

test("Eine manipulierte oder gekuerzte Stand-summary wird laut abgewiesen", () => {
  const faelle = [["gekuerzt", ABSATZ.slice(0, 600)],
    ["veraendert", ABSATZ.replace("50 Enthaltungen", "49 Enthaltungen")],
    ["Leerzeichen angehaengt", ABSATZ + " "],
    ["zu lang", "x".repeat(require("../lib/helmut/artikelkontext").MAX_ZEICHEN_BUNDESTAG_LEITABSATZ + 1)],
    ["kein Text", 42]];
  for (const [name, summary] of faelle) {
    const falsch = { ...kopie(ROW), summary };
    for (const lesen of [B.leseArtikelstand, D.contentHash, D.toRawDocumentRow, Q.understandingQuelle,
      doc => AUS.geleseneQuelle({ ...doc, quellenauszug_beleg: null })]) {
      wirft(() => lesen(falsch), /bundestag-artikelstand-/);
    }
    wirft(() => G.planDedupWrites([falsch], []), /bundestag-artikelstand-/, name);
  }
  // Gegenprobe: die Erzeugung selbst bindet den vollstaendigen Absatz unveraendert.
  const neu = B.erzeugeArtikelstand(kopie(DOK), kopie(BELEG));
  assert.equal(neu.ok, true);
  assert.equal(neu.row.summary, ABSATZ);
  assert.equal(neu.row.summary.length, ABSATZ.length);
});

test("Legacy-Stand ohne summary bleibt lesbar und erfindet keinen Absatz", () => {
  const ohneFeld = kopie(ROW); delete ohneFeld.summary;
  for (const wert of [{ ...kopie(ROW), summary: null }, ohneFeld]) {
    assert.equal(B.leseArtikelstand(wert).standHash, STAND.standHash);
    assert.equal(D.contentHash(wert), STAND.standHash);
    assert.equal(D.toRawDocumentRow(wert).summary, null);
    assert.equal(Q.understandingQuelle(wert).auszug, "");
    assert.equal(AUS.geleseneQuelle({ ...wert, quellenauszug_beleg: null }).summary ?? null, null);
  }
  const eingabe = LQ.baueEingabe([{ id: "ko-legacy", vorgang_id: "vg-legacy" }],
    { "vg-legacy": [{ ...kopie(ROW), summary: null }] }, new Date("2026-09-26T12:00:00Z"));
  assert.equal(eingabe.length, 1);
  assert.equal(eingabe[0].quellenbelege[0].auszug, "");
  assert.equal(eingabe[0].quellenbelege[0].veroeffentlichtAm, TAG);
});

test("Lagefenster: nur der ganze Berliner Publikationstag zaehlt, DST-fest", () => {
  const koFenster = { id: "ko-fenster", vorgang_id: "vg-fenster" };
  const standFuerTag = (tag) => {
    const doc = dokument({ published_at: tag });
    const erzeugt = B.erzeugeArtikelstand(doc, beleg(doc));
    assert.equal(erzeugt.ok, true, tag);
    return erzeugt.row;
  };
  const akzeptiert = (tag, jetzt) => LQ.baueEingabe([koFenster], { "vg-fenster": [standFuerTag(tag)] }, jetzt).length === 1;
  const fruehjahr = new Date("2026-03-31T12:00:00Z"); // Fenster 17.03.2026 12:00Z bis 31.03.2026 12:00Z
  assert.equal(akzeptiert("2026-03-18", fruehjahr), true);  // innerer Rand: ganzer Tag im Fenster
  assert.equal(akzeptiert("2026-03-29", fruehjahr), true);  // DST-Tag (23 Stunden) vollstaendig im Fenster
  assert.equal(akzeptiert("2026-03-17", fruehjahr), false); // angebrochener Randtag -> verwerfen
  assert.equal(akzeptiert("2026-03-16", fruehjahr), false); // ausserhalb
  assert.equal(akzeptiert("2026-03-31", fruehjahr), false); // heute noch nicht beendet
  assert.equal(akzeptiert("2026-04-01", fruehjahr), false); // kuenftig
  const herbst = new Date("2026-10-26T12:00:00Z");    // Fenster 12.10.2026 12:00Z bis 26.10.2026 12:00Z
  assert.equal(akzeptiert("2026-10-13", herbst), true);
  assert.equal(akzeptiert("2026-10-25", herbst), true);     // DST-Ende (25 Stunden) vollstaendig im Fenster
  assert.equal(akzeptiert("2026-10-12", herbst), false);
  const lageBeleg = LQ.baueEingabe([koFenster], { "vg-fenster": [standFuerTag("2026-03-29")] }, fruehjahr)[0].quellenbelege[0];
  assert.equal(lageBeleg.veroeffentlichtAm, "2026-03-29");
  assert.equal(lageBeleg.auszug, ABSATZ);
  assert.equal(JSON.stringify(lageBeleg).includes("T00:00"), false);
  // Direkter Randbeweis ueber die bestehenden Berliner Datumshelfer: an beiden
  // DST-Tagen ist der Kalendertag 23 bzw. 25 Stunden lang, kein 24-Stunden-Fenster.
  assert.equal(F.berlinTagVollImFenster("2026-03-29", Date.parse("2026-03-28T23:00:00Z"), Date.parse("2026-03-29T22:00:00Z")), true);
  assert.equal(F.berlinTagVollImFenster("2026-03-29", Date.parse("2026-03-28T23:00:01Z"), Date.parse("2026-03-29T22:00:00Z")), false);
  assert.equal(F.berlinTagVollImFenster("2026-03-29", Date.parse("2026-03-28T23:00:00Z"), Date.parse("2026-03-29T21:59:59Z")), false);
  assert.equal(F.berlinTagVollImFenster("2026-10-25", Date.parse("2026-10-24T22:00:00Z"), Date.parse("2026-10-25T23:00:00Z")), true);
  assert.equal(F.berlinTagVollImFenster("2026-10-25", Date.parse("2026-10-24T22:00:00Z"), Date.parse("2026-10-25T22:59:59Z")), false);
  assert.equal(F.berlinTagVollImFenster("2026-02-30", 0, Number.MAX_SAFE_INTEGER), false);
  assert.equal(F.berlinTagVollImFenster("2026-03-29", NaN, Date.now()), false);
});

test("Gewoehnliche Quellen behalten unveraendert ihren Zeitstempelvertrag", () => {
  const jetzt = new Date("2026-03-31T12:00:00Z");
  const normal = { title: "Synthetische Meldung zum Beispielbad", url: "https://beispiel.test/beispielbad",
    source_name: "Synthetische Quelle", summary: "Der Stadtrat beriet ueber die Finanzierung des Beispielbades.",
    published_at: "2026-03-31T11:59:59Z" };
  const lageBeleg = LQ.baueEingabe([{ id: "ko-normal", vorgang_id: "vg-normal" }], { "vg-normal": [normal] }, jetzt)[0].quellenbelege[0];
  assert.equal(lageBeleg.veroeffentlichtAm, "2026-03-31T11:59:59.000Z");
  assert.equal(lageBeleg.auszug, normal.summary);
  assert.deepEqual(LQ.baueEingabe([{ id: "ko-normal", vorgang_id: "vg-normal" }],
    { "vg-normal": [{ ...normal, published_at: "2026-03-31T12:00:01Z" }] }, jetzt), []);
});

test("Verschiedene Staende an derselben URL bleiben getrennte Belege", () => {
  const absatzZwei = ABSATZ.replace("50 Enthaltungen", "49 Enthaltungen");
  const zweiter = B.erzeugeArtikelstand(DOK, beleg(DOK, { text: absatzZwei, textHash: sha(absatzZwei) }));
  const andererTitel = "Aktualisierte synthetische Fassung derselben Adresse";
  const docZwei = dokument({ title: andererTitel });
  const dritter = B.erzeugeArtikelstand(docZwei, beleg(docZwei));
  for (const stand of [zweiter, dritter]) assert.equal(stand.ok, true);
  const eingabe = LQ.baueEingabe([{ id: "ko-getrennt", vorgang_id: "vg-getrennt" }],
    { "vg-getrennt": [ROW, zweiter.row, dritter.row, ALT] }, new Date("2026-09-26T12:00:00Z"));
  assert.equal(eingabe.length, 1);
  const belege = eingabe[0].quellenbelege;
  assert.equal(belege.length, 4);
  assert.equal(new Set(belege.map(b => b.quelle_id)).size, 4);
  // Gleiche Adresse und gleicher Titel, aber anderer Absatz: eigener Beleg und eigene Kennung.
  const grundfassung = belege.find(b => b.auszug === ABSATZ && b.veroeffentlichtAm === TAG);
  const andereFassung = belege.find(b => b.auszug === absatzZwei && b.veroeffentlichtAm === TAG);
  assert(grundfassung && andereFassung);
  assert.notEqual(grundfassung.quelle_id, andereFassung.quelle_id);
  // Die alte URL-Quelle bleibt ein eigener Beleg mit ihrem echten Zeitstempel.
  const alt = belege.find(b => b.veroeffentlichtAm === "2026-09-14T11:20:09.000Z");
  assert(alt && alt.auszug === "");
  assert.equal(G.mergeIntoDocuments([ROW, zweiter.row, dritter.row, ALT]).length, 4);
});

test("Gleicher Stand faellt zusammen; verschiedene Staende und Altquelle nicht", () => {
  const zweiterFund = { ...kopie(ROW), sourceId: "zweiter-abrufweg", linkType: "direct" };
  const zusammen = G.mergeIntoDocuments([ROW, zweiterFund]);
  assert.equal(zusammen.length, 1);
  assert.equal(zusammen[0].id, ROW.id);
  assert.equal(zusammen[0].finding_count, 2);
  assert.deepEqual(zusammen[0].raw.helmutBundestagArtikelstand, STAND);
  const absatz = ABSATZ.replace("50 Enthaltungen", "48 Enthaltungen");
  const anderer = B.erzeugeArtikelstand(DOK, beleg(DOK, { text: absatz, textHash: sha(absatz) }));
  const faelle = [["Altquelle", ALT], ["anderer Stand", anderer.row]];
  for (const [name, zweiter] of faelle) {
    const reihenfolgen = [[ROW, zweiter], [zweiter, ROW]];
    for (const reihenfolge of reihenfolgen) {
      const docs = G.mergeIntoDocuments(reihenfolge);
      assert.equal(docs.length, 2, name);
      assert.deepEqual(docs.map(d => d.id).sort(), [ROW.id, zweiter.id].sort(), name);
      const standDoc = docs.find(d => d.id === ROW.id);
      assert.deepEqual(standDoc.raw.helmutBundestagArtikelstand, STAND, name);
      const fremdDoc = docs.find(d => d.id === zweiter.id);
      assert.equal(fremdDoc.raw?.helmutBundestagArtikelstand?.standHash === STAND.standHash, false, name);
    }
  }
});

test("Bestandsabgleich in beiden Richtungen verschluckt weder Stand noch Altquelle", () => {
  const standFp = G.mergeIntoDocuments([ROW])[0].content_fingerprint;
  const mitStand = [{ id: ROW.id, content_fingerprint: standFp, canonical_target_url: STAND.url,
    bundestag_artikelstand: kopie(STAND) }];
  const ohneStand = [{ id: ALT.id, content_fingerprint: sha("url:" + KANONISCH), canonical_target_url: STAND.url }];
  const eigene = G.planDedupWrites([ROW], ohneStand);
  assert.equal(eigene.persists.length, 1);
  assert.equal(eigene.persists[0].id, ROW.id);
  assert.equal(eigene.findings[0].raw_document_id, ROW.id);
  const bekannt = G.planDedupWrites([ROW], mitStand);
  assert.equal(bekannt.persists.length, 0);
  assert.equal(bekannt.findings[0].raw_document_id, ROW.id);
  assert.equal(bekannt.countIncrements[ROW.id], 1);
  const altItem = { title: ALTER_TITEL, url: ARTIKEL_URL, canonical_url: ARTIKEL_URL, publishedAt: ALTER_TAG };
  const altGegenStand = G.planDedupWrites([altItem], mitStand);
  assert.equal(altGegenStand.persists.length, 1);
  assert.notEqual(altGegenStand.persists[0].id, ROW.id);
  const altGegenAlt = G.planDedupWrites([altItem], ohneStand);
  assert.equal(altGegenAlt.persists.length, 0);
  assert.equal(altGegenAlt.findings[0].raw_document_id, ALT.id);
  const doppelt = G.planDedupWrites([ROW, { ...kopie(ROW), sourceId: "zweiter-abrufweg" }], []);
  assert.equal(doppelt.persists.length, 1);
  assert.equal(doppelt.persists[0].finding_count, 2);
});

test("Fremde Standardquellen bleiben unveraendert", () => {
  assert.equal(G.externalIdentity(NORMAL), null);
  assert.equal(B.leseArtikelstand(NORMAL), null);
  const plan = G.planDedupWrites([NORMAL], []);
  assert.equal(plan.persists.length, 1);
  assert.equal(plan.persists[0].id, "rd-" + sha("url:" + D.canonicalizeUrl(NORMAL.url)));
  assert.equal(plan.persists[0].external_identity, null);
  assert.equal(Object.hasOwn(plan.persists[0], "raw"), false);
  assert.equal(D.contentHash(NORMAL), sha("url:" + D.canonicalizeUrl(NORMAL.url)));
  assert.equal(D.toRawDocumentRow(NORMAL).published_at, NORMAL.publishedAt);
});

test("Fremde Kennungen werden in jedem Stand-Lesepfad abgewiesen", () => {
  for (const aenderung of [{ id: ALT.id }, { content_hash: ALT.content_hash }]) {
    const falsch = { ...kopie(ROW), ...aenderung };
    for (const lesen of [B.leseArtikelstand, D.toRawDocumentRow, Q.understandingQuelle,
      doc => G.planDedupWrites([doc], [])]) {
      wirft(() => lesen(falsch), /kennung-abweichend/);
    }
  }
});

test("Bekannte Abrufzeit bleibt beim PostgreSQL-Roundtrip beleggleich", () => {
  assert.equal(ROW.retrieved_at, DOK.retrieved_at);
  const ausDb = { ...ROW, retrieved_at: "2026-09-26T09:00:00+00:00" };
  assert.equal(A.pruefeArtikelkontext([ausDb], ERZEUGT.beleg).quellenHash, ERZEUGT.beleg.quellenHash);
  assert.equal(Q.understandingQuelle(ausDb).abgerufenAm, DOK.retrieved_at);
});

async function speicherUndLeser() {
  const echtesFetch = global.fetch;
  const gespeichert = new Map();
  let schreibAnfragen = 0;
  let fundstellen = 0;
  const geseheneSelects = [];
  const antwort = (daten, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status,
    statusText: "OK", text: () => Promise.resolve(daten == null ? "" : JSON.stringify(daten)) });
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
    if (methode === "GET" && url.pathname === "/rest/v1/raw_documents") {
      geseheneSelects.push(select);
      const spalten = select.replace(/^.*raw_documents(?:!inner)?\(/u, "").replace(/\)$/u, "").split(",");
      return antwort([...gespeichert.values()].map(row => Object.fromEntries(spalten.map(spalte => {
        if (spalte === "bundestag_artikelstand:raw->helmutBundestagArtikelstand") {
          return ["bundestag_artikelstand", row.raw?.helmutBundestagArtikelstand || null];
        }
        if (spalte === "bundestag_abgerufen_at:retrieved_at") return ["bundestag_abgerufen_at", row.retrieved_at];
        if (spalte === "dip_quellfelder:raw->helmutDipQuellfelder") return ["dip_quellfelder", row.raw?.helmutDipQuellfelder || null];
        if (spalte === "quellenauszug_beleg:raw->helmutQuellenkontext") return ["quellenauszug_beleg", null];
        return [spalte, row[spalte]];
      }).filter(([, wert]) => wert !== undefined))));
    }
    if (methode === "GET" && url.pathname === "/rest/v1/ko_document_links") {
      geseheneSelects.push(select);
      const spalten = select.replace(/^.*raw_documents(?:!inner)?\(/u, "").replace(/\)$/u, "").split(",");
      const koFilter = url.searchParams.get("knowledge_object_id") || "";
      const docFilter = url.searchParams.get("raw_document_id") || "";
      const koIds = koFilter.startsWith("in.") ? JSON.parse("[" + koFilter.slice(4, -1) + "]") : null;
      const docIds = docFilter.startsWith("in.") ? JSON.parse("[" + docFilter.slice(4, -1) + "]") : null;
      const passt = (row) => {
        if (koIds && !koIds.includes("ko-synthetisch")) return false;
        if (docIds && !docIds.includes(row.id)) return false;
        for (const filter of url.searchParams.getAll("raw_documents.published_at")) {
          if (filter === "is.null") { if (row.published_at != null) return false; continue; }
          if (row.published_at == null) return false;
          const grenze = Date.parse(filter.slice(4));
          if (filter.startsWith("gte.") ? Date.parse(row.published_at) < grenze : Date.parse(row.published_at) > grenze) return false;
        }
        if (url.searchParams.get("raw_documents.raw->helmutBundestagArtikelstand") === "not.is.null"
          && !row.raw?.helmutBundestagArtikelstand) return false;
        return true;
      };
      return antwort([...gespeichert.values()].filter(passt).map(row => ({ knowledge_object_id: "ko-synthetisch",
        raw_document_id: row.id, raw_documents: Object.fromEntries(spalten.map(spalte => {
          if (spalte === "bundestag_artikelstand:raw->helmutBundestagArtikelstand") {
            return ["bundestag_artikelstand", row.raw?.helmutBundestagArtikelstand || null];
          }
          if (spalte === "bundestag_abgerufen_at:retrieved_at") return ["bundestag_abgerufen_at", row.retrieved_at];
        if (spalte === "dip_quellfelder:raw->helmutDipQuellfelder") return ["dip_quellfelder", row.raw?.helmutDipQuellfelder || null];
          if (spalte === "quellenauszug_beleg:raw->helmutQuellenkontext") return ["quellenauszug_beleg", null];
          return [spalte, row[spalte]];
        }).filter(([, wert]) => wert !== undefined)) })));
    }
    return antwort([]);
  };
  const namen = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "HELMUT_V3_STORE"];
  const vorher = Object.fromEntries(namen.map(name => [name, process.env[name]]));
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "rein-lokaler-testwert-artikelstand";
  process.env.HELMUT_V3_STORE = "on";
  try {
    const warteschlange = await storage.persistiereRohdokumenteWarteschlange([ROW]);
    assert.equal(warteschlange.ok, true);
    assert.equal(warteschlange.neuIds.length, 1);
    assert.deepEqual([...gespeichert.values()][0].raw.helmutBundestagArtikelstand, STAND);
    assert.equal([...gespeichert.values()][0].published_at, null);

    const plan = G.planDedupWrites([ROW], []);
    const lauf = await storage.persistRawDocumentsDeduped([ROW]);
    assert.equal(lauf.persisted, plan.persists.length);
    assert.equal(schreibAnfragen, 2);
    const geschrieben = [...gespeichert.values()][0];
    assert.equal(geschrieben.canonical_target_url, null);
    assert.equal(geschrieben.content_fingerprint, plan.persists[0].content_fingerprint);
    assert.equal(geschrieben.content_hash, STAND.standHash);
    assert.equal(fundstellen, 1);
    bestanden += 1; console.log("OK Beide echten Schreibwege behalten den Stand und die leere Uhrzeit");

    const wiederholung = await storage.persistRawDocumentsDeduped([ROW]);
    assert.equal(wiederholung.persisted, 0);
    assert.equal(schreibAnfragen, 2);
    bestanden += 1; console.log("OK Zweiter Cutover liest gespeicherten Stand ohne kanonisches Ziel wieder");

    const erwartete = [ROW];
    const leser = [
      ["Erstverstehen", () => storage.listRecentRawDocuments(10, 30)],
      ["Rohdokumentfenster", () => storage.listRawDocuments({ limit: 10, days: 30 })],
      ["Warteschlangenauftrag", () => storage.getRawDocumentsByIds([ROW.id])],
      ["Aktualisierung", () => storage.listKoDocuments("ko-synthetisch")],
      ["Vorgangsquellen", () => storage.getSourcesForVorgang("vg-synthetisch")],
      ["Gebundene Lagequellen", () => storage.getSourcesForVorgang("vg-synthetisch",
        { lageKoId: "ko-synthetisch", lageQuellen: erwartete })]
    ];
    for (const [name, lesen] of leser) {
      const gelesen = await lesen();
      assert.equal(gelesen.length, 1, name);
      const quelle = gelesen[0];
      assert.equal(Object.hasOwn(quelle, "raw"), false, name);
      assert.equal(quelle.summary, ABSATZ, name);
      assert.deepEqual(quelle.bundestag_artikelstand, STAND, name);
      assert.equal(D.toRawDocumentRow(quelle).id, ROW.id, name);
      assert.deepEqual(D.toRawDocumentRow(quelle).raw.helmutBundestagArtikelstand, STAND, name);
      assert.equal(A.pruefeArtikelkontext([quelle], ERZEUGT.beleg).dokumentId, ROW.id, name);
      assert.equal(Q.understandingQuelle(quelle).veroeffentlichtAm, TAG, name);
      bestanden += 1; console.log("OK " + name + ": Stand-Metadaten und gebundener Artikelbeleg bleiben erhalten");
    }
    // Reale Leserprojektion bis zur Lageeingabe: derselbe Stand erreicht den
    // Lage-Quellenvertrag mit seinem ganzen Absatz und seinem tagesgenauen Tag.
    const lageJetzt = new Date("2026-09-26T12:00:00Z");
    const koLage = { id: "ko-synthetisch", vorgang_id: "vg-synthetisch" };
    const metadata = await storage.listAktuelleLageQuellen([koLage.id], lageJetzt);
    assert.equal(metadata.length, 1);
    assert.equal(metadata[0].raw_documents.published_at, null);
    assert.equal(metadata[0].raw_documents.summary, ABSATZ);
    const lageEingabe = LQ.baueEingabe([koLage], { [koLage.vorgang_id]: metadata.map(r => r.raw_documents) }, lageJetzt);
    assert.equal(lageEingabe.length, 1);
    assert.equal(lageEingabe[0].quellenbelege[0].auszug, ABSATZ);
    assert.equal(lageEingabe[0].quellenbelege[0].veroeffentlichtAm, TAG);
    const gebunden = await storage.getSourcesForVorgang(koLage.vorgang_id,
      { lageKoId: koLage.id, lageQuellen: metadata.map(r => r.raw_documents) });
    assert.equal(gebunden.length, 1);
    assert.equal(gebunden[0].summary, ABSATZ);
    const gebundeneEingabe = LQ.baueEingabe([koLage], { [koLage.vorgang_id]: gebunden }, lageJetzt);
    assert.equal(gebundeneEingabe[0].quellenbelege[0].auszug, ABSATZ);
    assert.equal(gebundeneEingabe[0].quellenbelege[0].veroeffentlichtAm, TAG);
    assert.equal(gebundeneEingabe[0].quellenbelege[0].quelle_id, lageEingabe[0].quellenbelege[0].quelle_id);
    bestanden += 1; console.log("OK Reale Leserprojektion traegt Tag und vollen Absatz bis in die Lageeingabe");
    // Zwischen Metadatenwahl und Folgelesen darf weder der Stand noch sein
    // bekannter Absatz still verschwinden. Die minimale Legacy-Projektion
    // ohne summary bleibt dagegen zulaessig.
    const vorherQuelle = kopie(gespeichert.get(ROW.id));
    for (const aenderung of [{ raw: {} }, { summary: null }, { summary: "" }, { summary: ABSATZ + " Fremder Zusatz." }]) {
      gespeichert.set(ROW.id, { ...kopie(vorherQuelle), ...aenderung });
      await assert.rejects(() => storage.getSourcesForVorgang(koLage.vorgang_id,
        { lageKoId: koLage.id, lageQuellen: metadata.map(r => r.raw_documents) }),
      e => e.name === "StorageReadError" && e.quelle === "lage-quellenbindung");
    }
    gespeichert.set(ROW.id, vorherQuelle);
    const minimal = metadata.map(r => { const { summary, ...d } = r.raw_documents; return d; });
    assert.equal((await storage.getSourcesForVorgang(koLage.vorgang_id,
      { lageKoId: koLage.id, lageQuellen: minimal }))[0].summary, ABSATZ);
    bestanden += 1; console.log("OK Stand- oder Absatzverlust beim Folgelesen wird laut verweigert");
    assert.equal(geseheneSelects.length >= 6, true);
    // Der gewoehnliche Zeitstempelpfad des Lagefensters bleibt bewusst ohne Stand-Alias.
    const ohneAlias = geseheneSelects.filter(sel => sel !== "id,finding_count"
      && sel !== "knowledge_object_id,raw_documents!inner(id,title,url,canonical_url,published_at)"
      && !sel.includes("bundestag_artikelstand:raw->helmutBundestagArtikelstand"));
    assert.deepEqual(ohneAlias, []);
    bestanden += 1; console.log("OK Alle relevanten Leser fragen die Aliasprojektion raw->helmutBundestagArtikelstand ab");
  } finally {
    for (const name of namen) {
      if (vorher[name] === undefined) delete process.env[name];
      else process.env[name] = vorher[name];
    }
    global.fetch = echtesFetch;
  }
}

speicherUndLeser().then(() => {
  console.log(`\n${bestanden} Pruefgruppen erfolgreich; synthetische Belege, keine Production-Daten.`);
}).catch(error => { console.error(error); process.exitCode = 1; });
