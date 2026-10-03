"use strict";

// Zwei gespeicherte amtliche Originale: senderlose RBMSKZL-Vorlage 1720589 und
// Landtag-Tagesueberschrift 50253 mit ", und". Keine anderen Artikeloriginale laden.
// Nur Offline-Leser/Stand/Normalizer; kein Crawl, HTTP, Importjournal oder Datenbankschreiben.
// Aufruf mit Netz-Guard:
// NO_NETWORK_TESTS=1 node --require ./scripts/run-offline-tests.js \
//   scripts/berlin-brandenburg-source-parser-two-variants-test.js

const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const BE = require("../lib/helmut/berlin-presse-sondervorlagen");
const BES = require("../lib/helmut/berlin-artikelstand");
const BB = require("../lib/helmut/brandenburg-landtag-presseartikel");
const BBS = require("../lib/helmut/brandenburg-landtag-presseartikelstand");
const RSS = require("../lib/helmut/brandenburg-landtag-presse-rss");
const CHAIN = require("../lib/helmut/brandenburg-landtag-presse-kette");
const dedup = require("../lib/helmut/dedup");

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function fixture(name, bytes, pin) {
  const raw = fs.readFileSync(path.join(__dirname, "fixtures", name));
  A.equal(raw.length, bytes, "Ganzes Originalfixture, keine Ausschnittprobe");
  A.equal(sha(raw), pin, "Unveraenderter physischer Originalbody");
  const html = raw.toString("utf8");
  A.ok(Buffer.from(html, "utf8").equals(raw), "Verlustfreie UTF-8-Dekodierung");
  return html;
}
function einmal(html, vorher, nachher) {
  A.equal(html.split(vorher).length - 1, 1, "Negativmutation trifft genau eine Stelle");
  return html.replace(vorher, nachher);
}
function alle(html, vorher, nachher) {
  A.ok(html.includes(vorher), "Negativmutation muss tatsaechlich die Bindung aendern");
  return html.split(vorher).join(nachher);
}
let negative = 0;
function rejectBE(html, url = BE_URL) {
  A.throws(() => BE.pruefeSondervorlage({ url, finalUrl: url, http: 200, html }),
    /berlin-presse-sondervorlagen-/);
  negative += 1;
}
function rejectBB(html, reason = /brandenburg-landtag-presseartikel-/) {
  A.throws(() => BB.pruefePresseartikel({ url: BB_URL, finalUrl: BB_URL, http: 200, html }), reason);
  negative += 1;
}
function closedBE(beleg, doc, reason = "auszug-abweichend") {
  const result = BES.erzeugeSondervorlagenstand(doc, Object.freeze(beleg));
  A.equal(result.ok, false);
  A.equal(result.reason, reason);
  negative += 1;
}
function rawBinding(result, module, rawField) {
  A.equal(result.ok, true, JSON.stringify(result));
  const row = dedup.toRawDocumentRow(result.row);
  A.equal(row.id, "rd-" + result.stand.standHash);
  A.equal(row.content_hash, result.stand.standHash);
  A.equal(row.title, result.stand.titel);
  A.equal(row.url, result.row.url, "Oeffentlicher Originalartikellink bleibt unveraendert");
  A.equal(row.canonical_url, result.stand.url);
  A.equal(row.summary, result.absatz);
  A.equal(row.published_at, null);
  A.deepEqual(row.raw[rawField], result.stand);
  A.equal(module.leseArtikelstand(row).standHash, result.stand.standHash);
  for (const field of ["html", "volltext", "content", "rss", "rssText"]) {
    A.equal(Object.hasOwn(row, field), false);
    A.equal(Object.hasOwn(row.raw[rawField], field), false);
  }
  return row;
}

const BE_URL = "https://www.berlin.de/rbmskzl/aktuelles/pressemitteilungen/2026/pressemitteilung.1720589.php";
const BE_TITEL = "BärGPT gewinnt Platz 2 beim European Public Sector Award";
const BE_TAG = "2026-10-01";
const BE_HTML_SHA = "5e31bcfc52bc102e90eb82d20f11e39e00ff3a4f515ba9b89845d78ab01db2cc";
const beHtml = fixture("berlin-rbmskzl-baergpt-1720589-20261001.html", 40113, BE_HTML_SHA);
// Manuell am gesamten sichtbaren Originaltext belegte Erwartung; kein Parser als Oracle.
const beAbsaetze = [
  "Die Senatskanzlei wurde gemeinsam mit dem CityLAB Berlin am 24. September 2026 für den verwaltungsinternen KI-Assistenten BärGPT mit dem 2. Platz des European Sector Award 2025-2026 in der Kategorie „Delivering User-Centric Services at Subnational Level“ ausgezeichnet.",
  "Insgesamt haben sich 134 Projekte aus 30 Ländern für die diesjährigen European Public Sector Awards des European Institute of Public Administration (EIPA) in drei Hauptkategorien beworben.",
  "BärGPT ist ein Open-Source basierter KI-Assistent, der speziell auf die Anforderungen der Berliner Landesverwaltung zugeschnitten ist. Gemeinsam von Senatskanzlei und CityLAB Berlin entwickelt, unterstützt er Mitarbeiterinnen und Mitarbeiter bei Routineaufgaben im Arbeitsalltag – mit KI-Funktionen, die Prozesse einfacher, schneller und nutzerfreundlicher machen. BärGPT kombiniert moderne große Sprachmodelle (LLMs) mit geprüftem Berliner Verwaltungswissen, um die Mitarbeiterinnen und Mitarbeiter bei der Bearbeitung von Dokumenten, der Informationsrecherche und der Texterstellung zu unterstützen. Aktuell nutzen rund 19.000 Mitarbeitende diesen Assistenten, der am 25. November 2025 in Betrieb ging.",
  "Mit der Prämierung von BärGPT wurde unter anderem gewürdigt, dass hier Verwaltungsdigitalisierung konsequent aus der Perspektive der Nutzerinnen und Nutzer gedacht und umgesetzt wurde.",
  "Mehr Informationen zu BärGPT finden sich hier: https://citylab-berlin.org/projekte/baergpt/ .",
  "Mehr Informationen zum European Public Sector Award finden sich hier: https://www.eipa.eu/epsa/ ."
];
const beVolltext = beAbsaetze.join("\n\n") + "\n";
const beArtikel = BE.pruefeSondervorlage({ url: BE_URL, finalUrl: BE_URL, http: 200, html: beHtml });
A.deepEqual(Object.keys(beArtikel).sort(), [...BE.AUSGANG_FELDER].sort());
A.equal(beArtikel.url, BE_URL);
A.equal(beArtikel.pfadfamilie, "rbmskzl");
A.equal(beArtikel.titel, BE_TITEL);
A.equal(beArtikel.publikationstag, BE_TAG);
A.equal(beArtikel.volltext, beVolltext);
A.equal(beArtikel.volltextHash, sha(beVolltext));
A.equal(beArtikel.htmlHash, BE_HTML_SHA);
A.equal(beArtikel.auszug, beAbsaetze[0]);
A.equal(beArtikel.auszugHash, sha(beAbsaetze[0]));
A.equal(BE.istRbmskzlAbsenderformel(beArtikel.auszug, BE_TAG), false,
  "Senderloser Sachabsatz bleibt Sachinhalt und wird kein Fake-Absender");
const beDoc = { url: BE_URL, canonical_url: BE_URL, title: BE_TITEL,
  published_at: BE_TAG, summary: "" };
const beStand = BES.erzeugeSondervorlagenstand(beDoc, beArtikel);
const beRow = rawBinding(beStand, BES, "helmutBerlinArtikelstand");
A.equal(beRow.summary, beAbsaetze[0]);
A.equal(beStand.stand.url, BE_URL.replace("www.berlin.de", "berlin.de"));
A.equal(beStand.stand.herkunft, BES.HERKUNFT_SONDER);
A.equal(beStand.stand.publikationstag, BE_TAG);
A.equal(beStand.stand.absatzHash, sha(beAbsaetze[0]));
A.equal(beStand.stand.volltextHash, sha(beVolltext));

// Senderlose Freigabe bleibt exklusiv an die belegte Identitaet/Metadaten/Absatzbindung.
const fremdeBeUrl = BE_URL.replace("1720589", "1720353");
rejectBE(alle(beHtml, BE_URL, fremdeBeUrl), fremdeBeUrl);
rejectBE(alle(beHtml, BE_TITEL, BE_TITEL + " – Fremdtext"));
rejectBE(einmal(einmal(beHtml, 'name="dcterms.date" content="2026-10-01"',
  'name="dcterms.date" content="2026-10-02"'),
  "Pressemitteilung vom 01.10.2026", "Pressemitteilung vom 02.10.2026"));
rejectBE(einmal(beHtml, beAbsaetze[0], beAbsaetze[0] + " Fremder eingefuegter Vorspann."));
rejectBE(einmal(beHtml, "<p>\n    Die Senatskanzlei wurde", "<p hidden>\n    Die Senatskanzlei wurde"));
rejectBE(einmal(beHtml, "<p>\n    Insgesamt haben sich", "<aside>Fremde Kontaktmeldung</aside><p>\n    Insgesamt haben sich"));
rejectBE(einmal(beHtml, "<p>\n    Insgesamt haben sich", '<p>\n    <a href="mailto:fremd@example.invalid">Fremder Kontakt</a> Insgesamt haben sich'));
closedBE({ ...beArtikel, auszug: beAbsaetze[1], auszugHash: sha(beAbsaetze[1]) }, beDoc);
const andererErster = beAbsaetze[0] + " Fremder eingefuegter Vorspann.";
const fremderVolltext = [andererErster, ...beAbsaetze.slice(1)].join("\n\n") + "\n";
closedBE({ ...beArtikel, volltext: fremderVolltext, volltextHash: sha(fremderVolltext),
  auszug: andererErster, auszugHash: sha(andererErster) }, beDoc);
closedBE({ ...beArtikel, url: fremdeBeUrl }, { ...beDoc, url: fremdeBeUrl, canonical_url: fremdeBeUrl });
closedBE({ ...beArtikel, titel: BE_TITEL + " – Fremdtext" }, { ...beDoc, title: BE_TITEL + " – Fremdtext" });
closedBE({ ...beArtikel, publikationstag: "2026-10-02" }, { ...beDoc, published_at: "2026-10-02" });

const BB_URL = "https://www.landtag.brandenburg.de/de/meldungen/termine_des_landtages_brandenburg_in_der_zeit_vom_2._bis_9._oktober_2026/50253";
const BB_WEICHE = "https://www.landtag.brandenburg.de/sixcms/detail.php?id=brandenburg_01.c.50253.de";
const BB_TITEL = "Termine des Landtages Brandenburg in der Zeit vom 2. bis 9. Oktober 2026";
const BB_HTML_SHA = "d7f599680e256e61dceaec974a3bb08ea033867e3976d4c72bf941f09d2122e3";
const bbHtml = fixture("brandenburg-landtag-termine-50253-20261002.html", 92070, BB_HTML_SHA);
const DOPPELTAG = "Freitag, 2. Oktober, und Samstag, 3. Oktober 2026";
// Die vorhandene reine Textnormalisierung entfernt <br /> ohne erfundene Leerzeichen.
// Diese gesamte Erwartung bewahrt ihre bestehenden Wort-/Absatzgrenzen unveraendert.
const bbAbsaetze = [
  DOPPELTAG,
  "Landtagspräsidentin Prof. Dr. Liedtke nimmt an den Feierlichkeiten zum Tag der Deutschen Einheit teil.Ort: Freie Hansestadt Bremen",
  "Dienstag, 6. Oktober 2026",
  "12:00 Uhr",
  "Landtagspräsidentin Prof. Dr. Liedtke empfängt eine Delegation von Parlamentariern aus Griechenland.Ort: Landtag, Lobby",
  "13:30 Uhr",
  "26. (nicht öffentliche) Sitzung des PetitionsausschussesOrt: Landtag, Raum E.050",
  "Mittwoch, 7. Oktober 2026",
  "09:30 Uhr",
  "23. (nicht öffentliche) Sitzung des PräsidiumsOrt: Landtag, Raum 1.055",
  "10:00 Uhr",
  "20. (öffentliche) Sitzung des Ausschusses für Wirtschaft, Energie und KlimaschutzOrt: Landtag, Raum 1.050 (Livestream/Aufzeichnung)",
  "11:00 Uhr",
  "28. (öffentliche) Sitzung des HauptausschussesOrt: Landtag, Raum 1.070 (Livestream/Aufzeichnung)",
  "13:00 Uhr",
  "18. (öffentliche) Sitzung des Ausschusses für Wissenschaft, Forschung und KulturOrt: Landtag, Raum 2.050 (Livestream/Aufzeichnung)",
  "Donnerstag, 8. Oktober 2026",
  "09:15 Uhr",
  "Landtagspräsidentin Prof. Dr. Liedtke empfängt die Botschafterin Irlands, I. E. Maeve Collins, anlässlich der Übernahme der EU-Ratspräsidentschaft durch Irland.Ort: Landtag, Lobby",
  "10:00 Uhr",
  "16. (öffentliche) Sitzung des Ausschusses für Europaangelegenheiten und Entwicklungspolitik(u. a. Fachgespräch mit der Botschafterin von Irland in der Bundesrepublik Deutschland, I. E. Maeve Collins, zu Prioritäten der irischen EU-Ratspräsidentschaft)Ort: Raum 2.050 (Livestream/Aufzeichnung)",
  "11:00 Uhr",
  "Landtagspräsidentin Prof. Dr. Liedtke empfängt eine Delegation der in der Bundesrepublik Deutschland neu akkreditierten Botschafterinnen und Botschafter verschiedener Länder.Ort: Landtag, Raum 1.055",
  "13:00 Uhr",
  "17. (öffentliche) Sitzung des Ausschusses für Infrastruktur und Landesplanung(u. a. Fachgespräch zur Niederbarnimer Eisenbahn: betriebliche Situation und Weiterentwicklung)Ort: Landtag, Raum 1.050 (Livestream/Aufzeichnung)",
  "18:30 Uhr",
  "Landtagspräsidentin Prof. Dr. Liedtke nimmt am „Brandenburg-Essen“ auf Einladung des Katholischen Büros Berlin-Brandenburg teil.Ort: Katholische Marienschule, Espengrund 10, 14482 Potsdam",
  "Freitag, 9. Oktober 2026",
  "10:00 Uhr",
  "17. (öffentliche) Sitzung des Sonderausschusses Bürokratieabbau(u. a. Fachgespräche Bürokratieabbau im Fachbereich Justiz sowie im Fachbereich Gastronomie)Ort: Landtag, Raum 1.050 (Livestream)",
  "10:00 Uhr",
  "9. (öffentliche) Sitzung der Enquete-Kommission 8/2Ort: Landtag, Raum 2.050 (Livestream/Aufzeichnung)",
  "Veränderungen und Ergänzungen vorbehalten!"
];
const bbVolltext = bbAbsaetze.join("\n\n") + "\n";
A.equal(CHAIN.kanonischeArtikelUrlAusAntwort(BB_WEICHE, bbHtml, "50253"), BB_URL);
const bbArtikel = BB.pruefePresseartikel({ url: BB_URL, finalUrl: BB_URL, http: 200, html: bbHtml });
A.deepEqual(Object.keys(bbArtikel).sort(), [...BB.AUSGANG_FELDER].sort());
A.equal(bbArtikel.url, BB_URL);
A.equal(bbArtikel.titel, BB_TITEL);
A.equal(bbArtikel.publikationstag, "2026-10-02");
A.equal(bbArtikel.volltext, bbVolltext);
A.equal(bbArtikel.volltextHash, sha(bbVolltext));
A.equal(bbArtikel.htmlHash, BB_HTML_SHA);
const bbItem = { nummer: "50253", titel: BB_TITEL, link: BB_WEICHE, guid: BB_WEICHE,
  author: "brandenburg_01.c.50253.de (50253)", pubDate: "Fri, 02 Oct 2026 12:57:00 +0200",
  publikationstag: "2026-10-02" };
const bbBindung = RSS.bindeRssItemAnArtikel(bbItem, bbArtikel);
A.equal(bbBindung.publikationszeitpunktUtc, "2026-10-02T10:57:00.000Z");
const bbQuelle = { source_id: "bb-landesparlament", source_name: "Landtag Brandenburg", source_type: "parliament" };
const bbDoc = { ...bbQuelle, url: BB_URL, canonical_url: BB_URL, title: BB_TITEL, published_at: null };
const bbStand = BBS.erzeugeArtikelstand(bbDoc, bbArtikel, bbBindung);
const bbRow = rawBinding(bbStand, BBS, BBS.ROHFELD);
A.equal(bbStand.stand.url, BB_URL.replace("www.landtag.brandenburg.de", "landtag.brandenburg.de"));
A.equal(bbStand.stand.publikationstag, "2026-10-02");
A.equal(bbStand.stand.publikationszeitpunktUtc, "2026-10-02T10:57:00.000Z");
A.equal(bbStand.stand.absatzHash, sha(DOPPELTAG));
A.equal(bbStand.stand.volltextHash, sha(bbVolltext));
A.equal(bbRow.summary, DOPPELTAG);
A.deepEqual(CHAIN.pruefeKettenrohzeile(bbQuelle, bbStand.stand, bbStand.row), { ok: true });

// Der neue verbindende Text ist kein Freibrief fuer fremde Ueberschriften oder Module.
const zwischen = /brandenburg-landtag-presseartikel-fremdinhalt-zwischen-absaetzen/;
rejectBB(einmal(bbHtml, DOPPELTAG, "Freitag, 2. Oktober, sowie Samstag, 3. Oktober 2026"), zwischen);
rejectBB(einmal(bbHtml, DOPPELTAG, "Freitag, 2. Oktober, und Samstag, 32. Oktober 2026"), zwischen);
rejectBB(einmal(bbHtml, DOPPELTAG, "Freitag, 2. Oktober, und Samstag, 3. Fantasiemonat 2026"), zwischen);
rejectBB(einmal(bbHtml, DOPPELTAG, DOPPELTAG + " Fremde Kontaktnachricht"), zwischen);
rejectBB(einmal(bbHtml, "<h6>" + DOPPELTAG + "</h6>",
  "<h6>" + DOPPELTAG + "</h6><div>Fremde Kontaktnachricht</div>"));
rejectBB(einmal(bbHtml, "<p><strong>Landtagspr&auml;sidentin Prof. Dr. Liedtke</strong> nimmt an den Feierlichkeiten",
  '<p class="fremd"><strong>Landtagspr&auml;sidentin Prof. Dr. Liedtke</strong> nimmt an den Feierlichkeiten'), zwischen);
rejectBB(einmal(bbHtml, "<h6>" + DOPPELTAG + "</h6>",
  '<h6 hidden>' + DOPPELTAG + "</h6>"));
rejectBB(einmal(bbHtml, "<h6>" + DOPPELTAG + "</h6>",
  "<h6>" + DOPPELTAG + "</h6><aside><p>Fremde Kontaktmeldung</p></aside>"));
for (const changedItem of [
  { ...bbItem, titel: BB_TITEL + " – Fremdtext" },
  { ...bbItem, publikationstag: "2026-10-03", pubDate: "Sat, 03 Oct 2026 12:57:00 +0200" },
  { ...bbItem, nummer: "50179" }
]) {
  A.throws(() => RSS.bindeRssItemAnArtikel(changedItem, bbArtikel), /brandenburg-landtag-presse-rss-/);
  negative += 1;
}

console.log(`PASS zwei ganze amtliche Originale, gebundene Staende/Rohzeilen und ${negative} gezielte Negativfaelle`);
