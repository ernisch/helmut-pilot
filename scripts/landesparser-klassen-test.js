"use strict";

// Roadmap-Punkt 24 — Landtags-Parser Berlin/Brandenburg: Nachweis, dass Drucksachen, Anfragen,
// Antworten, Sitzungsdokumente und Vorgangsbezuege SAUBER GETRENNT werden.
// =============================================================================================
// REINE LOGIK gegen versionierte Fixtures. Kein Netz, keine DB, kein LLM, keine Secrets.
// Berlin und Brandenburg werden GETRENNT nachgewiesen — ein gruener Nachweis fuer ein Land
// ersetzt den fuer das andere ausdruecklich nicht.
//
// Geprueft wird der vollstaendige Offline-Weg innerhalb der bestehenden Architektur:
//   gespeicherte Quellantwort (XML-Fixture)
//     -> Parser            (pardok-parser.js, laenderspezifische Adapter)
//     -> Dokumentklasse    (pardok-dokumentklassen.js, laenderspezifische Tabellen, fail closed)
//     -> Rohdokument       (kanonischer Vertrag public.raw_documents, KEINE neue Struktur)
//     -> Identitaet/Dedup  (content_hash + dedupToDocuments)
//     -> Datenmotor        (understanding-gate.assessDocument — der naechste echte Schritt)

const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const K = require("../lib/helmut/quellenarchitektur/pardok-dokumentklassen");
const G = require("../lib/helmut/quellenarchitektur/understanding-gate");
const D = require("../lib/helmut/quellenarchitektur/dedup-global");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const BUND_STICHPROBE = require("../test/fixtures/gate/realdata-sample.js");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(name) { return fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", name), "utf8"); }
function klassenVerteilung(docs) {
  return docs.reduce((acc, d) => { acc[d.dokumentklasse] = (acc[d.dokumentklasse] || 0) + 1; return acc; }, {});
}

const JETZT = Date.parse("2026-07-29T00:00:00Z");
const ABGERUFEN_AM = "2026-07-29T06:00:00.000Z"; // injiziert — der Mapper kennt keine Uhr

// Abrufweg-Kontext AUS DEM ECHTEN vorbereiteten Seed ziehen (keine erfundenen Konstanten).
const SEED = buildLandesmodulSeed();
const WEG = Object.fromEntries(SEED.retrievalPaths.filter((p) => p.legacy_source_id === "be-plenum" || p.legacy_source_id === "bb-plenum")
  .map((p) => [p.legacy_source_id, p]));
const PUBLISHER = new Map(SEED.publishers.map((p) => [p.id, p]));

function kontextFuer(land) {
  const p = WEG[land === "berlin" ? "be-plenum" : "bb-plenum"];
  const pub = PUBLISHER.get(p.publisher_id);
  return {
    sourceId: p.legacy_source_id, sourceName: pub ? pub.name : p.name, sourceType: "parliament",
    publisherId: p.publisher_id, abrufwegId: p.id, quelleUrl: p.url, abgerufenAm: ABGERUFEN_AM
  };
}

// ================================ TEIL A — Klassenvertrag ====================================
console.log("\n--- A · Kanonischer Klassenvertrag (gemeinsam fuer beide Laender) ---");
check("A1 acht kanonische Klassen definiert", K.DOKUMENTKLASSEN.length === 8);
check("A2 alle Pflichtklassen des Auftrags sind im Vertrag",
  ["drucksache", "anfrage", "antwort", "sitzung", "tagesordnung", "pressemitteilung", "sonstiges"].every((k) => K.KLASSEN_SET.has(k)));
check("A3 fail-closed-Klasse `unbekannt` vorhanden", K.KLASSEN_SET.has("unbekannt"));
// GRUNDREGEL: ein Dokument ist kein Vorgang. `vorgang` darf keine Dokumentklasse sein.
check("A4 `vorgang` ist KEINE Dokumentklasse (Dokument != Vorgang)", !K.KLASSEN_SET.has("vorgang"));
const alleTabellen = [K.BERLIN_TYPEN, K.BERLIN_ARTEN, K.BRANDENBURG_TYPEN, K.BRANDENBURG_ARTEN];
check("A5 kein Tabelleneintrag zeigt auf eine unbekannte Klasse",
  alleTabellen.every((t) => Object.values(t).every((e) => K.KLASSEN_SET.has(e.klasse))));
check("A6 kein Tabelleneintrag klassifiziert als `vorgang`",
  alleTabellen.every((t) => Object.values(t).every((e) => e.klasse !== "vorgang")));
check("A7 JEDER Tabelleneintrag traegt einen registrierten Beleg (Belegpflicht)",
  alleTabellen.every((t) => Object.values(t).every((e) => e.beleg && Object.prototype.hasOwnProperty.call(K.BELEGE, e.beleg))));
check("A8 die nachrangige Auffangebene zeigt nur auf bekannte Klassen",
  Object.values(K.ALLGEMEINE_BEZEICHNUNGEN).every((k) => K.KLASSEN_SET.has(k)));

// ============================== TEIL B — BERLIN, Pflichtklassen ==============================
console.log("\n--- B · Berlin (PARDOK, Abgeordnetenhaus) ---");
const be = P.parsePardokDocumentsFromString(fx("berlin-gold.xml"), {
  land: "berlin", sourceUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml"
});
const beDocs = be.documents;
const beById = Object.fromEntries(beDocs.map((d) => [d.externe_id, d]));
const beVerteilung = klassenVerteilung(beDocs);

check("B1 Klasse DRUCKSACHE belegt (Drs/Verordnung + Drs/Antrag)",
  beById["D-351040"].dokumentklasse === "drucksache" && beById["D-360001"].dokumentklasse === "drucksache");
check("B2 Klasse SCHRIFTLICHE ANFRAGE belegt (DokTypL 'Schriftliche Anfrage')",
  beById["D-351758"].dokumentklasse === "anfrage" && beById["D-351758"].dokumenttyp === "Schriftliche Anfrage");
check("B3 Klasse ANTWORT belegt (DokTypL 'Antwort')",
  beById["D-351603"].dokumentklasse === "antwort" && beById["D-351603"].dokumenttyp === "Antwort");
check("B4 Klasse SITZUNG belegt (Plenarprotokoll + Ausschussprotokoll)",
  beById["D-351042"].dokumentklasse === "sitzung" && beById["D-354521"].dokumentklasse === "sitzung");
check("B5 Klasse SONSTIGES belegt (Gesetz- und Verordnungsblatt)",
  beById["D-351046"].dokumentklasse === "sonstiges");
// DER entscheidende Trennfall: DokArt sagt Sitzung, DokTyp sagt Antwort -> Typ hat Vorrang.
check("B6 Dokumenttyp schlaegt Dokumentart (PlPr + 'Antwort' -> antwort, NICHT sitzung)",
  beById["D-351603"].dokumentart === "Plenarprotokoll" && beById["D-351603"].dokumentklasse === "antwort");
check("B7 alle Berliner Klassen laenderspezifisch belegt (keine Auffangebene noetig)",
  beDocs.every((d) => d.dokumentklasse_quelle === "land-doktyp" || d.dokumentklasse_quelle === "land-dokart"));
check("B8 kein Berliner Gold-Dokument bleibt unbekannt", !beVerteilung.unbekannt);
// KORREKTUR (Restpunkt 1): die frueher hier stehende Aussage "Berlin liefert keinen
// Vorgangsbezug" ist durch den Sondenlauf 30483735900 WIDERLEGT — siehe Teil B2. Diese flache
// Gold-Fixture enthaelt keinen <Vorgang>-Rahmen, deshalb bleibt der Bezug HIER leer; erfunden
// wird er nicht.
check("B9 ohne Vorgangsrahmen bleibt der Bezug leer — und wird nicht erfunden",
  beDocs.every((d) => d.vorgangsnummer === null) && K.VORGANGSBEZUG.berlin.verfuegbar === true);

// ============================ TEIL C — BRANDENBURG, Pflichtklassen ===========================
console.log("\n--- C · Brandenburg (parldok, Landtag) ---");
const bb = P.parsePardokDocumentsFromString(fx("brandenburg-gold.xml"), {
  land: "brandenburg", sourceUrl: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml"
});
const bbDocs = bb.documents;
const bbById = Object.fromEntries(bbDocs.map((d) => [d.externe_id, d]));
const bbVerteilung = klassenVerteilung(bbDocs);

check("C1 Klasse DRUCKSACHE belegt (Drs/Gesetzentwurf + Drs ohne DokTyp)",
  bbById["V-370081#r0001"].dokumentklasse === "drucksache" && bbById["V-380500#r0001"].dokumentklasse === "drucksache");
check("C2 Klasse ANFRAGE belegt (DokTypL 'Kleine Anfrage')",
  bbById["V-369657#r0001"].dokumentklasse === "anfrage" && bbById["V-369657#r0001"].dokumenttyp === "Kleine Anfrage");
check("C3 Klasse SITZUNG belegt (Plenarprotokoll, auch ohne DokTyp ueber die Dokumentart)",
  bbById["V-369325#r0001"].dokumentklasse === "sitzung" && bbById["V-369325#r0001"].dokumenttyp === null);
check("C4 kein Brandenburger Gold-Dokument bleibt unbekannt", !bbVerteilung.unbekannt);
check("C5 Brandenburg liefert einen belegten VORGANGSBEZUG (VNr + VTypL)",
  bbById["V-369657#r0001"].vorgangsnummer === "V-369657" && bbById["V-369657#r0001"].vorgangstyp === "Anfrage"
  && K.VORGANGSBEZUG.brandenburg.verfuegbar === true);
check("C6 delete-Stub + vollstaendiger Eintrag derselben VNr -> genau EIN Dokument (aktualisierter Eintrag)",
  bbDocs.filter((d) => d.vorgangsnummer === "V-369325").length === 1 && bb.stats.deleteStubs === 1);
check("C7 Vorgang ohne Dokument erzeugt KEIN Dokument", bb.stats.ohneDokument === 1);
// Fachlich begruendete Ausnahme, ehrlich statt simuliert:
check("C8 Klasse ANTWORT fuer Brandenburg als begruendete Ausnahme dokumentiert (nicht simuliert)",
  K.KLASSEN_AUSNAHMEN.some((a) => a.land === "brandenburg" && a.klasse === "antwort" && a.grund && a.beleg)
  && !bbVerteilung.antwort);

// ============ TEIL C2 — GEMESSENE Dokumentart-Verteilung deckt die Tabellen ab ===============
// Die Gold-Fixtures zeigen nur, was in ihnen steht. Diese Prüfung geht gegen die REAL GEMESSENE
// Verteilung aus dem Shadow-Lauf 30481670298 vom 29.07.2026 (je 800 Records aus den Live-Dateien)
// und stellt sicher, dass JEDE dort vorkommende Dokumentart eine belegte Landeszuordnung hat.
// Genau diese Prüfung hat den Befund erzeugt, dass Brandenburg ELF Dokumentarten führt (Berlin
// nur vier) — ohne sie wären 290 von 816 Dokumenten (35,5 %) fälschlich `unbekannt` geblieben.
console.log("\n--- C2 · Gemessene Dokumentart-Verteilung (800 Records je Quelle, 29.07.2026) ---");
const GEMESSEN = {
  berlin: { "Drucksache": 534, "Plenarprotokoll": 206, "Ausschussprotokoll": 34, "Gesetz- und Verordnungsblatt": 26 },
  brandenburg: {
    "Drucksache": 411, "Ausschussprotokoll": 221, "Plenarprotokoll": 70, "Unterrichtung": 34,
    "Präsidiumsprotokoll": 28, "Information": 22, "Einladung": 11, "Frühwarndokument": 10,
    "Gesetz- und Verordnungsblatt": 6, "Zuschrift": 2, "Gutachten": 1
  }
};
for (const land of ["berlin", "brandenburg"]) {
  const arten = Object.keys(GEMESSEN[land]);
  const offen = arten.filter((a) => {
    const r = K.klassifiziereDokument({ land, dokumentart: a });
    return r.dokumentklasse === "unbekannt" || r.klasse_quelle !== "land-dokart";
  });
  const gesamt = Object.values(GEMESSEN[land]).reduce((a, b) => a + b, 0);
  check(`C2-${land}: alle ${arten.length} gemessenen Dokumentarten sind laenderspezifisch belegt (${gesamt} Dokumente)`,
    offen.length === 0);
  if (offen.length) console.log(`      ungedeckt: ${offen.join(", ")}`);
}
check("C2-vergleich: Brandenburg fuehrt deutlich mehr Dokumentarten als Berlin (11 vs. 4)",
  Object.keys(GEMESSEN.brandenburg).length === 11 && Object.keys(GEMESSEN.berlin).length === 4);
check("C2: Klasse TAGESORDNUNG ist fuer Brandenburg belegt (Dokumentart 'Einladung'), fuer Berlin nicht",
  K.klassifiziereDokument({ land: "brandenburg", dokumentart: "Einladung" }).dokumentklasse === "tagesordnung"
  && K.klassifiziereDokument({ land: "brandenburg", dokumentart: "Einladung" }).klasse_quelle === "land-dokart"
  && K.klassifiziereDokument({ land: "berlin", dokumentart: "Einladung" }).klasse_quelle !== "land-dokart"
  && K.KLASSEN_AUSNAHMEN.some((a) => a.land === "berlin" && a.klasse === "tagesordnung")
  && !K.KLASSEN_AUSNAHMEN.some((a) => a.land === "brandenburg" && a.klasse === "tagesordnung"));
check("C2: benannte, aber fachlich nicht einzuordnende Arten werden `sonstiges`, nicht geraten",
  ["Information", "Frühwarndokument", "Gutachten", "Zuschrift"]
    .every((a) => K.klassifiziereDokument({ land: "brandenburg", dokumentart: a }).dokumentklasse === "sonstiges"));

// ===================== TEIL B2 — Berliner VORGANGSBEZUG (Restpunkt 1) ========================
// Belegt durch den Sondenlauf 30483735900 vom 29.07.2026 (PP_RECORD_TAG=Vorgang). Die frueher
// hier notierte Aussage "Berlin liefert keinen Vorgangsbezug" ist damit WIDERLEGT.
console.log("\n--- B2 · Berlin ist vorgangsstrukturiert (Sondenlauf 29.07.2026) ---");
const beV = P.parsePardokDocumentsFromString(fx("berlin-vorgang-gold.xml"), { land: "berlin" });
const beVDocs = beV.documents;
const beVById = Object.fromEntries(beVDocs.map((d) => [d.externe_id, d]));
check("B2-1 Berlin fuehrt einen belegten Vorgangsbezug (VNr + VTypL)",
  beVById["D-351040"].vorgangsnummer === "V-351039" && beVById["D-351040"].vorgangstyp === "Debatte"
  && K.VORGANGSBEZUG.berlin.verfuegbar === true);
check("B2-2 delete-Stubs erzeugen kein Dokument (Berlin hat sie wie Brandenburg)",
  beV.stats.deleteStubs === 2 && beVDocs.length === 3);
check("B2-3 delete-Stub + vollstaendiger Eintrag derselben VNr -> genau EIN Vorgangsbezug",
  beVDocs.filter((d) => d.vorgangsnummer === "V-351039").length === 2
  && new Set(beVDocs.filter((d) => d.vorgangsnummer === "V-351039").map((d) => d.externe_id)).size === 2);
check("B2-4 EIN Berliner Vorgang traegt MEHRERE Dokumentklassen (Drucksache + Sitzung)",
  beVById["D-351040"].dokumentklasse === "drucksache" && beVById["D-351042"].dokumentklasse === "sitzung");
check("B2-5 die Dokumentidentitaet bleibt die DBID, nicht die Vorgangsnummer",
  beVDocs.every((d) => /^D-\d+$/.test(d.externe_id))
  && new Set(beVDocs.map((d) => d.inhaltsfingerabdruck)).size === beVDocs.length);
check("B2-6 Klasse ANFRAGE auch ueber den belegten Typ 'Muendliche Anfrage' (MdlAnfr)",
  beVById["D-351617"].dokumentklasse === "anfrage" && beVById["D-351617"].dokumentklasse_quelle === "land-doktyp"
  && beVById["D-351617"].dokumenttyp === "M\u00fcndliche Anfrage");
check("B2-7 der Vorgang bleibt BEZUG — keine Dokumentklasse `vorgang`, keine cluster_id",
  beVDocs.every((d) => d.dokumentklasse !== "vorgang")
  && beVDocs.every((d) => K.zuRohdokument(d, kontextFuer("berlin")).cluster_id === null));
check("B2-8 flache Berliner Exporte bleiben lesbar (Rueckwaertskompatibilitaet des Adapters)",
  beDocs.length === 10 && beDocs.every((d) => d.vorgangsnummer === null));
check("B2-9 DREI eigenstaendige Dokumente teilen dieselbe PDF-Adresse (Adresse != Identitaet)",
  [beById["D-351042"], beById["D-351603"], beVById["D-351617"]]
    .every((d) => (d.originaladresse || "").endsWith("p19-002-wp.pdf"))
  && new Set([beById["D-351042"], beById["D-351603"], beVById["D-351617"]].map((d) => d.inhaltsfingerabdruck)).size === 3);

// =========================== TEIL D — Laenderspezifik statt Textmuster =======================
console.log("\n--- D · Berlin und Brandenburg werden getrennt behandelt ---");
check("D1 Berlin kennt den Typwert 'SchrAnfr', Brandenburg NICHT (eigene Tabellen)",
  !!K.BERLIN_TYPEN["schranfr"] && !K.BRANDENBURG_TYPEN["schranfr"]);
check("D2 Brandenburg kennt den Typwert 'Antr mit Wahlvorschl', Berlin NICHT",
  !!K.BRANDENBURG_TYPEN["antr mit wahlvorschl"] && !K.BERLIN_TYPEN["antr mit wahlvorschl"]);
check("D3 Berlin kennt 'Behandlung im Plenum'/'Ausschussberatung', Brandenburg NICHT",
  !!K.BERLIN_TYPEN["behandlung im plenum"] && !!K.BERLIN_TYPEN["ausschussberatung"]
  && !K.BRANDENBURG_TYPEN["behandlung im plenum"] && !K.BRANDENBURG_TYPEN["ausschussberatung"]);
check("D4 die Typtabellen der beiden Laender sind nicht identisch",
  JSON.stringify(Object.keys(K.BERLIN_TYPEN).sort()) !== JSON.stringify(Object.keys(K.BRANDENBURG_TYPEN).sort()));
check("D5 getrennte Geografie/Ebene bleibt erhalten",
  beDocs.every((d) => d.geografie === "geo-land-berlin" && d.politische_ebene === "land")
  && bbDocs.every((d) => d.geografie === "geo-land-brandenburg" && d.politische_ebene === "land"));
// Korrektur einer Annahme, die die Verteilungsmessung widerlegt hat: Tagesordnung ist NUR fuer
// Berlin eine Ausnahme. Pressemitteilung ist es fuer beide Laender — dort ist die Ausnahme echt.
check("D6 Ausnahmen sind je Land dokumentiert (Pressemitteilung fuer BEIDE Laender)",
  ["berlin", "brandenburg"].every((l) => K.KLASSEN_AUSNAHMEN.some((a) => a.land === l && a.klasse === "pressemitteilung" && a.grund && a.beleg)));
check("D6b Ausnahmen sind NICHT pauschal: Tagesordnung nur fuer Berlin, Antwort nur fuer Brandenburg",
  K.KLASSEN_AUSNAHMEN.some((a) => a.land === "berlin" && a.klasse === "tagesordnung")
  && !K.KLASSEN_AUSNAHMEN.some((a) => a.land === "brandenburg" && a.klasse === "tagesordnung")
  && K.KLASSEN_AUSNAHMEN.some((a) => a.land === "brandenburg" && a.klasse === "antwort")
  && !K.KLASSEN_AUSNAHMEN.some((a) => a.land === "berlin" && a.klasse === "antwort"));
check("D7 keine Ausnahme ohne registrierten Beleg",
  K.KLASSEN_AUSNAHMEN.every((a) => Object.prototype.hasOwnProperty.call(K.BELEGE, a.beleg)));
check("D8 keine Ausnahme behauptet eine Klasse, die es im Vertrag nicht gibt",
  K.KLASSEN_AUSNAHMEN.every((a) => K.KLASSEN_SET.has(a.klasse)));

// ====================== TEIL E — Kanonischer Rohdokument-Vertrag (9 Felder) ==================
console.log("\n--- E · Normalisierung auf den bestehenden Rohdokument-Vertrag ---");
const beRoh = beDocs.map((d) => K.zuRohdokument(d, kontextFuer("berlin")));
const bbRoh = bbDocs.map((d) => K.zuRohdokument(d, kontextFuer("brandenburg")));
const alleRoh = [...beRoh, ...bbRoh];
// Der Vertrag ist die BESTEHENDE Spaltenliste — keine zweite Datenstruktur daneben.
const V3_SPALTEN = new Set(["id", "canonical_url", "content_hash", "cluster_id", "title", "summary", "url",
  "source_name", "source_id", "source_type", "confidence", "link_type", "published_at", "retrieved_at",
  "document_type", "wahlperiode", "raw", "created_at", "content_fingerprint", "publisher_id",
  "canonical_target_url", "finding_count"]);
check("E1 kein Feld ausserhalb des bestehenden raw_documents-Vertrags",
  alleRoh.every((r) => Object.keys(r).every((k) => V3_SPALTEN.has(k))));
check("E2 (1) Bundesland/Geografie erhalten",
  beRoh.every((r) => r.raw.geografie === "geo-land-berlin" && r.raw.politische_ebene === "land")
  && bbRoh.every((r) => r.raw.geografie === "geo-land-brandenburg" && r.raw.herkunft === "BRA"));
check("E3 (2) Herausgeber/Quelle erhalten (aus dem echten vorbereiteten Seed)",
  beRoh.every((r) => r.source_id === "be-plenum" && r.publisher_id === "publisher-parlament-berlin.de")
  && bbRoh.every((r) => r.source_id === "bb-plenum" && r.publisher_id === "publisher-parlamentsdokumentation.brandenburg.de"));
check("E4 (3) Dokumenttyp erhalten — amtliche Bezeichnung in document_type, Klasse in raw",
  alleRoh.every((r) => (r.document_type === null || typeof r.document_type === "string") && K.KLASSEN_SET.has(r.raw.dokumentklasse)));
check("E5 (4) Titel: echter Titel bleibt, titellose Formate bekommen eine GEKENNZEICHNETE Bezeichnung",
  alleRoh.every((r) => typeof r.title === "string" && r.title.length > 0)
  && alleRoh.filter((r) => r.raw.titel_abgeleitet).every((r) => r.raw.titel_original === null)
  && alleRoh.filter((r) => !r.raw.titel_abgeleitet).every((r) => r.raw.titel_original === r.title));
check("E6 (5) Veroeffentlichungsdatum erhalten, fehlend bleibt null (nichts erfunden)",
  beRoh.find((r) => r.raw.externe_id === "D-351758").published_at === "2021-11-09"
  && beRoh.find((r) => r.raw.externe_id === "D-360003").published_at === null);
check("E7 (6) Externe Kennung erhalten und identisch mit der Parserkennung",
  beRoh.every((r, i) => r.raw.externe_id === beDocs[i].externe_id)
  && bbRoh.every((r, i) => r.raw.externe_id === bbDocs[i].externe_id));
check("E8 (7) Kanonische URL: pdf bevorzugt, fehlend -> link_type 'missing' statt Platzhalter-URL",
  bbRoh.find((r) => r.raw.externe_id === "V-369325#r0001").canonical_url.endsWith(".pdf")
  && beRoh.find((r) => r.raw.externe_id === "D-360001").canonical_url === null
  && beRoh.find((r) => r.raw.externe_id === "D-360001").link_type === "missing");
check("E9 (8) Vorgangsbezug: Brandenburg gesetzt, Berlin ehrlich null",
  bbRoh.every((r) => r.raw.vorgangsnummer && r.raw.vorgangsnummer.startsWith("V-"))
  && beRoh.every((r) => r.raw.vorgangsnummer === null));
check("E10 (9) Herkunft und Abrufweg erhalten",
  beRoh.every((r) => r.raw.abrufweg === "rp-be-plenum" && r.raw.herkunft === "BLN" && r.raw.quelle_url.includes("pardok-wp19.xml"))
  && bbRoh.every((r) => r.raw.abrufweg === "rp-bb-plenum" && r.raw.quelle_url.includes("exportWP8.xml")));
check("E11 Wahlperiode landet in der bestehenden Spalte (als Text)",
  beRoh.every((r) => r.wahlperiode === "19") && bbRoh.filter((r) => r.raw.externe_id !== "V-250100#r0001").every((r) => r.wahlperiode === "8"));
check("E12 Abrufzeit wird injiziert (der Mapper kennt keine Uhr)",
  alleRoh.every((r) => r.retrieved_at === ABGERUFEN_AM));
check("E13 keine erfundene Kurzfassung", alleRoh.every((r) => r.summary === ""));

// ============================= TEIL F — Fail closed bei Formatdrift =========================
console.log("\n--- F · Unbekannte und veraenderte Formate (fail closed, je Land) ---");
const beG = P.parsePardokDocumentsFromString(fx("berlin-grenzfaelle.xml"), { land: "berlin" }).documents;
const bbG = P.parsePardokDocumentsFromString(fx("brandenburg-grenzfaelle.xml"), { land: "brandenburg" }).documents;
const beGById = Object.fromEntries(beG.map((d) => [d.externe_id, d]));
const bbGById = Object.fromEntries(bbG.map((d) => [d.externe_id, d]));

check("F1 BE: unbekannter Dokumenttyp -> `unbekannt`, KEINE Ersatzklasse",
  beGById["D-900002"].dokumentklasse === "unbekannt" && beGById["D-900002"].dokumentklasse_quelle === "nicht-zugeordnet");
check("F2 BE: gar kein Typfeld -> `unbekannt` mit Herkunft `kein-typfeld`",
  beGById["D-900003"].dokumentklasse === "unbekannt" && beGById["D-900003"].dokumentklasse_quelle === "kein-typfeld");
check("F3 BB: unbekannter Dokumenttyp -> `unbekannt`, KEINE Ersatzklasse",
  bbGById["V-900002#r0001"].dokumentklasse === "unbekannt" && bbGById["V-900002#r0001"].dokumentklasse_quelle === "nicht-zugeordnet");
check("F4 BB: gar kein Typfeld -> `unbekannt` mit Herkunft `kein-typfeld`",
  bbGById["V-900003#r0001"].dokumentklasse === "unbekannt" && bbGById["V-900003#r0001"].dokumentklasse_quelle === "kein-typfeld");
check("F5 unbekannte Typen werden NIE still zu drucksache/anfrage/sitzung",
  ["D-900002", "D-900003"].every((id) => !["drucksache", "anfrage", "sitzung", "antwort"].includes(beGById[id].dokumentklasse))
  && ["V-900002#r0001", "V-900003#r0001"].every((id) => !["drucksache", "anfrage", "sitzung", "antwort"].includes(bbGById[id].dokumentklasse)));
check("F6 BE: nur Kurzcodes (L-Felder fehlen) -> Klasse bleibt belegt erkannt",
  beGById["D-900001"].dokumentklasse === "anfrage" && beGById["D-900001"].dokumentklasse_quelle === "land-doktyp");
check("F7 amtliche Bezeichnung ohne Landesbeleg wird als solche AUSGEWIESEN (nicht als Landesbeleg)",
  beGById["D-900004"].dokumentklasse === "anfrage" && beGById["D-900004"].dokumentklasse_quelle === "amtliche-bezeichnung");
check("F8 unbekannte Typen behalten trotzdem eine stabile Identitaet (kein Sammelcluster)",
  beGById["D-900002"].inhaltsfingerabdruck !== beGById["D-900003"].inhaltsfingerabdruck
  && beGById["D-900002"].externe_id === "D-900002");
check("F9 unbekanntes Land -> fail closed statt Rateschluss",
  K.klassifiziereDokument({ land: "sachsen", dokumenttyp: "Drucksache" }).dokumentklasse === "unbekannt");
check("F10 HTML-Fehlerseite statt XML -> 0 Dokumente, kein Crash, keine Klasse",
  P.parsePardokDocumentsFromString("<!doctype html><html>503</html>", { land: "brandenburg" }).documents.length === 0);

// ====================== TEIL G — Fehlende und uneinheitliche Metadaten ======================
console.log("\n--- G · Fehlende Felder ---");
check("G1 BE: fehlendes Datum bleibt null und blockiert die Klassifizierung nicht",
  beById["D-360003"].veroeffentlichungsdatum === null && beById["D-360003"].dokumentklasse === "anfrage");
check("G2 BB: fehlendes Datum bleibt null und blockiert die Klassifizierung nicht",
  bbById["V-380500#r0001"].veroeffentlichungsdatum === null && bbById["V-380500#r0001"].dokumentklasse === "drucksache");
check("G3 BE: fehlende Drucksachennummer erzeugt keine erfundene Nummer",
  beById["D-351046"].drucksachennummer === null);
check("G4 titellose Formate bleiben titel=null im Parser (Bezeichnung entsteht erst im Rohdokument)",
  beById["D-351042"].titel === null && K.zuRohdokument(beById["D-351042"], kontextFuer("berlin")).raw.titel_abgeleitet === true);
check("G5 fehlender Ausschuss wird nicht geraten",
  beById["D-351758"].ausschuss === null && /Ausschuss/.test(beById["D-354521"].ausschuss || ""));

// ==================== TEIL H — Identitaet, Mehrfachfundstellen, Dubletten ===================
console.log("\n--- H · Dokumentidentitaet und Dublettenschutz ---");
const beDedup = P.dedupToDocuments(beDocs, "be-plenum");
const bbDedup = P.dedupToDocuments(bbDocs, "bb-plenum");
check("H1 BE: 10 Records -> 10 Dokumente, keine Falsch-Zusammenfuehrung",
  beDedup.anzahl === 10 && beDedup.mehrfach === 0);
check("H2 BB: 7 Records -> 7 Dokumente, keine Falsch-Zusammenfuehrung",
  bbDedup.anzahl === 7 && bbDedup.mehrfach === 0);
// REALER Fall aus der Quelle: Plenarprotokoll und die darin enthaltene Antwort zeigen auf
// DIESELBE PDF-Adresse. Sie sind zwei Dokumente und duerfen nicht verschmelzen.
const geteilteUrl = beDocs.filter((d) => (d.originaladresse || "").endsWith("p19-002-wp.pdf"));
check("H3 BE: zwei Dokumente mit IDENTISCHER Quelladresse bleiben getrennt (Protokoll vs. Antwort)",
  geteilteUrl.length === 2 && new Set(geteilteUrl.map((d) => d.inhaltsfingerabdruck)).size === 2
  && new Set(geteilteUrl.map((d) => d.dokumentklasse)).size === 2);
check("H4 BE: dieselbe Fundstelle zweimal -> EIN Dokument, ZWEI Fundstellen",
  (() => { const d = P.dedupToDocuments(beG.filter((x) => x.externe_id === "D-900005"), "be-plenum");
    return d.anzahl === 1 && d.dokumente[0].fundstellen_anzahl === 2 && d.mehrfach === 1; })());
check("H5 content_hash traegt die Dedup-Identitaet und ist ueber beide Laender eindeutig",
  new Set(alleRoh.map((r) => r.content_hash)).size === alleRoh.length && alleRoh.every((r) => r.content_hash.startsWith("pardok-")));
check("H6 Rohdokument-id ist deterministisch aus dem content_hash abgeleitet",
  alleRoh.every((r) => /^raw-[0-9a-f]{16}$/.test(r.id))
  && K.zuRohdokument(beDocs[0], kontextFuer("berlin")).id === beRoh[0].id);
check("H7 gleiche DokNr in unterschiedlichen Wahlperioden bleibt getrennt (BB 08/30 in WP8 und WP7)",
  bbById["V-369657#r0001"].drucksachennummer === bbById["V-250100#r0001"].drucksachennummer
  && bbById["V-369657#r0001"].inhaltsfingerabdruck !== bbById["V-250100#r0001"].inhaltsfingerabdruck);
// BEHOBEN (Restpunkt 2): die globale Dedup gruppierte ZUERST nach kanonischer URL und danach nach
// Titel-Fingerabdruck. Beides ist fuer PARDOK falsch — ein Protokoll-PDF traegt viele Eintraege,
// und mehrere Drucksachen koennen denselben Titel haben. Gemessen am Berliner Gold-Bestand:
// 10 eigenstaendige Rohdokumente -> 8 Dokumente (2 Verluste). Jetzt gilt Regel 0: Identitaet aus
// Herausgeber + externer Kennung + Dokumenttyp; die Adresse ist nur noch Rueckfall.
function alsDedupItem(rd) {
  return {
    id: rd.id, sourceId: rd.source_id, title: rd.title, url: rd.url, originalUrl: rd.canonical_url,
    publishedAt: rd.published_at, linkType: rd.link_type, confidence: rd.confidence, summary: rd.summary,
    externe_id: rd.raw.externe_id, publisher_id: rd.publisher_id, document_type: rd.document_type
  };
}
const dedupItems = beRoh.map(alsDedupItem);
const globalMerged = D.mergeIntoDocuments(dedupItems);
check("H8 BEHOBEN: 10 eigenstaendige Rohdokumente bleiben 10 Dokumente (vorher 8)",
  dedupItems.length === 10 && globalMerged.length === 10);
check("H8b geteilte PDF-Adresse fuehrt NICHT mehr zusammen",
  globalMerged.filter((m) => (m.canonical_url || "").endsWith("p19-002-wp.pdf")).length === 2);
check("H8c gleicher Titel bei unterschiedlicher Kennung fuehrt NICHT mehr zusammen",
  globalMerged.filter((m) => m.title === "Haushaltsplan 2024/2025").length === 2);
check("H8d jedes Dokument mit eigener Kennung traegt seine Identitaet",
  globalMerged.every((m) => m.external_identity && m.external_identity.includes("|")));
// Folgelauf gegen den Bestand: frueher wurde das Antwort-Dokument GAR NICHT gespeichert, sondern
// als Fundstelle an das Protokoll gehaengt (persists 0). Jetzt eigenstaendig — und beim zweiten
// Mal idempotent.
const protokollItem = dedupItems.find((i) => i.externe_id === "D-351042");
const antwortItem = dedupItems.find((i) => i.externe_id === "D-351603");
const lauf1 = D.planDedupWrites([protokollItem], []);
const bestand1 = lauf1.persists.map((d) => ({ id: d.id, content_fingerprint: d.content_fingerprint, canonical_target_url: d.canonical_url }));
const lauf2 = D.planDedupWrites([antwortItem], bestand1);
check("H8e Folgelauf: das Antwort-Dokument wird eigenstaendig gespeichert (vorher: verworfen)",
  lauf2.persists.length === 1 && Object.keys(lauf2.countIncrements).length === 0);
const bestand2 = [...bestand1, ...lauf2.persists.map((d) => ({ id: d.id, content_fingerprint: d.content_fingerprint, canonical_target_url: d.canonical_url }))];
const lauf3 = D.planDedupWrites([antwortItem], bestand2);
check("H8f erneuter Lauf ist idempotent: keine Dublette, Fundstelle am EIGENEN Dokument",
  // `lauf2.persists.length === 1` steht hier als Schranke, nicht als Wiederholung von H8e: ohne
  // sie bricht der Lauf bei einem Regressionsfall mit einem TypeError ab, statt die Zeile rot zu
  // faerben — und alle nachfolgenden Nachweise fielen still aus (im Mutationstest aufgefallen).
  lauf3.persists.length === 0 && lauf2.persists.length === 1
  && Object.keys(lauf3.countIncrements)[0] === lauf2.persists[0].id);
// RUECKWAERTSKOMPATIBILITAET: Items OHNE externe Kennung (alle heutigen Quellen inkl. Bund)
// laufen unveraendert ueber die Adress-/Titelregeln.
const bundOhneKennung = [
  { id: "b1", sourceId: "general-hib", title: "Rentenpaket im Bundestag beschlossen", url: "https://bundestag.example.invalid/a", publishedAt: "2026-07-20T08:00:00Z" },
  { id: "b2", sourceId: "committee-arbeit", title: "Rentenpaket im Bundestag beschlossen", url: "https://bundestag.example.invalid/a", publishedAt: "2026-07-20T09:00:00Z" }
];
check("H8g Bund ohne externe Kennung: ein Artikel ueber zwei Wege bleibt EIN Dokument + 2 Fundstellen",
  (() => { const m = D.mergeIntoDocuments(bundOhneKennung);
    return m.length === 1 && m[0].finding_count === 2 && m[0].external_identity === null; })());
check("H8h externalIdentity ist null ohne externe Kennung (Regel 0 bleibt fuer Bestandsquellen inert)",
  D.externalIdentity(bundOhneKennung[0]) === null && D.externalIdentity({ externe_id: "D-1", sourceId: "be-plenum" }) !== null);

// ========================= TEIL I — Dokument und Vorgang bleiben getrennt ====================
console.log("\n--- I · Dokumentklassifizierung != Vorgangsbildung ---");
check("I1 kein Rohdokument bekommt eine cluster_id (keine Vorgangsbildung im Parserpfad)",
  alleRoh.every((r) => r.cluster_id === null));
check("I2 keine Dokumentklasse lautet `vorgang`",
  [...beDocs, ...bbDocs, ...beG, ...bbG].every((d) => d.dokumentklasse !== "vorgang"));
check("I3 EIN Vorgang traegt MEHRERE Dokumente mit EIGENER Identitaet (BB V-370081)",
  bbDocs.filter((d) => d.vorgangsnummer === "V-370081").length === 2
  && bbById["V-370081#r0001"].externe_id !== bbById["V-370081#r0002"].externe_id);
check("I4 EIN Vorgang kann UNTERSCHIEDLICHE Dokumentklassen tragen (Drucksache + Sitzung)",
  bbById["V-370081#r0001"].dokumentklasse === "drucksache" && bbById["V-370081#r0002"].dokumentklasse === "sitzung");
check("I5 EIN Anfrage-Vorgang traegt Anfrage UND zugehoerige Drucksache getrennt (Grenzfall G4)",
  bbG.filter((d) => d.vorgangsnummer === "V-900004").length === 2
  && new Set(bbG.filter((d) => d.vorgangsnummer === "V-900004").map((d) => d.dokumentklasse)).size === 2);
check("I6 der Vorgangstyp wird als BEZUG mitgefuehrt, nicht als Dokumentklasse",
  bbById["V-370081#r0001"].vorgangstyp === "Gesetzgebung" && bbById["V-370081#r0001"].dokumentklasse === "drucksache");

// ===================== TEIL J — Vollstaendiger Offline-Weg bis zum Datenmotor ================
console.log("\n--- J · Vollstaendiger Offline-Ingestionspfad (je Land) ---");
function zumGate(rd) {
  return {
    id: rd.id, content_hash: rd.content_hash, title: rd.title, summary: rd.summary,
    source_id: rd.source_id, document_type: rd.document_type, published_at: rd.published_at,
    politische_ebene: rd.raw.politische_ebene
  };
}
const beGate = beRoh.map((r) => G.assessDocument(zumGate(r), { now: JETZT }));
const bbGate = bbRoh.map((r) => G.assessDocument(zumGate(r), { now: JETZT }));
check("J1 BE: jedes normalisierte Rohdokument erreicht den Datenmotor mit `verstehen`",
  beGate.length === 10 && beGate.every((g) => g.decision === "verstehen" && g.structured === true));
check("J2 BB: jedes normalisierte Rohdokument erreicht den Datenmotor mit `verstehen`",
  bbGate.length === 7 && bbGate.every((g) => g.decision === "verstehen" && g.structured === true));
check("J3 kein Dokument wird wegen fehlendem Titel oder Alter verworfen",
  [...beGate, ...bbGate].every((g) => g.decision !== "parken" && g.decision !== "hygiene"));
// Zweite Sicherung: auch OHNE die '-plenum'-Namenskonvention traegt die amtliche Dokumentart.
const ohneKonvention = beRoh.map((r) => G.assessDocument({ ...zumGate(r), source_id: "irgendein-weg" }, { now: JETZT }));
check("J4 amtliche Dokumentart traegt auch ohne die '-plenum'-Namenskonvention",
  ohneKonvention.filter((g) => g.reason === "amtliche-dokumentart").length === beRoh.length);
check("J5 unbekannte Typen erreichen den Datenmotor ehrlich als unbekannt (keine erfundene Klasse)",
  K.zuRohdokument(beGById["D-900002"], kontextFuer("berlin")).raw.dokumentklasse === "unbekannt"
  && K.zuRohdokument(beGById["D-900002"], kontextFuer("berlin")).document_type === "Voellig neuer Dokumenttyp");

// ===================== TEIL K — Rueckwaertskompatibilitaet der Bundesquellen ================
console.log("\n--- K · Bestehende Bundesverarbeitung bleibt unveraendert ---");
const bundAbweichungen = BUND_STICHPROBE.filter((row) => G.assessDocument(row, { now: Date.parse("2026-07-14T12:00:00Z") }).decision !== row.sqlgate);
check("K1 reale Production-Stichprobe (Bund): 42/42 Gate-Entscheidungen unveraendert",
  BUND_STICHPROBE.length === 42 && bundAbweichungen.length === 0);
check("K2 kein Bundes-Rohdokument der Stichprobe traegt eine der neu ergaenzten Dokumentarten",
  BUND_STICHPROBE.every((r) => !["Behandlung im Plenum", "Ausschussberatung"].includes(r.document_type)));
// Korrektur einer Annahme, die dieser Test selbst widerlegt hat: 6 der 42 realen Bundeszeilen
// tragen sehr wohl einen document_type. Entscheidend ist deshalb nicht "gar keiner", sondern dass
// alle vorkommenden Werte BEREITS VORHER in OFFICIAL_DOC_TYPES standen — die Ergaenzung kann dort
// also nichts verschieben.
const BUND_TYPEN_VORHER = new Set(["Antwort", "Wahlvorschlag", "Kleine Anfrage", "Beschlussempfehlung und Bericht"]);
check("K3 alle in der Bundesstichprobe vorkommenden Dokumentarten waren bereits vorher gelistet",
  BUND_STICHPROBE.filter((r) => r.document_type !== null).length === 6
  && BUND_STICHPROBE.every((r) => r.document_type === null || BUND_TYPEN_VORHER.has(r.document_type)));
check("K4 die Klassifizierung ist an das Land gebunden und laesst Bundesdokumente unberuehrt",
  K.klassifiziereDokument({ land: null, dokumenttyp: "Drucksache" }).dokumentklasse === "unbekannt");
// Restpunkt 3: die drei ergaenzten Dokumenttypen greifen AUSSCHLIESSLICH fuer Landesdokumente.
// Grund: die aktive DIP-Bundestagsquelle setzt document_type aus der API; ihr Wertevokabular ist
// offline nicht pruefbar, eine Production-Abfrage ist nicht freigegeben.
const landTypen = [...G.LANDESPARLAMENT_DOC_TYPES];
check("K5 die drei ergaenzten Typen stehen NICHT in der globalen Liste",
  landTypen.length === 3 && landTypen.every((t) => !G.OFFICIAL_DOC_TYPES.has(t)));
check("K6 ohne Landessignal bleibt ein solcher Typ WIRKUNGSLOS (kein amtliche-dokumentart)",
  G.assessDocument({ id: "x1", content_hash: "h", title: "Ein Vorgang aus dem Bundestag", summary: "",
    source_id: "dip", document_type: "Schriftliche Anfrage", published_at: "2020-01-01T00:00:00Z" },
    { now: JETZT }).reason !== "amtliche-dokumentart");
check("K7 MIT Landessignal greift er (politische_ebene = land)",
  G.assessDocument({ id: "x2", content_hash: "h", title: "Ein Berliner Vorgang", summary: "",
    source_id: "irgendein-weg", document_type: "Schriftliche Anfrage", published_at: "2020-01-01T00:00:00Z",
    politische_ebene: "land" }, { now: JETZT }).reason === "amtliche-dokumentart");
check("K8 Landessignal auch ueber Herkunft (BLN/BRA) und be-/bb-Abrufweg",
  G.istLandesdokument({ herkunft: "BLN" }) && G.istLandesdokument({ herkunft: "BRA" })
  && G.istLandesdokument({ source_id: "be-plenum" }) && G.istLandesdokument({ source_id: "bb-plenum" }));
check("K9 KEINE reale Bundes-Stichprobenquelle wird faelschlich als Landesdokument erkannt",
  BUND_STICHPROBE.every((r) => !G.istLandesdokument(r)));
check("K10 die Begrenzung kostet keinen zusaetzlichen KI-Aufruf im Bund: Entscheidungen unveraendert",
  BUND_STICHPROBE.every((r) => G.assessDocument(r, { now: Date.parse("2026-07-14T12:00:00Z") }).decision === r.sqlgate));

// ==================== TEIL L — Determinismus, Isolation, kein Netz ==========================
console.log("\n--- L · Determinismus und Isolation ---");
const determLauf1 = JSON.stringify(beDocs.map((d) => K.zuRohdokument(d, kontextFuer("berlin"))));
const determLauf2 = JSON.stringify(P.parsePardokDocumentsFromString(fx("berlin-gold.xml"), {
  land: "berlin", sourceUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml"
}).documents.map((d) => K.zuRohdokument(d, kontextFuer("berlin"))));
check("L1 zweimal derselbe Lauf -> byte-identisches Ergebnis", determLauf1 === determLauf2);
const quellen = ["../lib/helmut/quellenarchitektur/pardok-parser.js", "../lib/helmut/quellenarchitektur/pardok-dokumentklassen.js"]
  .map((p) => fs.readFileSync(path.join(__dirname, p), "utf8"));
check("L2 weder Parser noch Klassifizierung binden Netz-, DB- oder KI-Module ein",
  quellen.every((s) => !/require\(["'](https?|node:https?|node-fetch|undici)["']\)/.test(s) && !/openai|supabase/i.test(s)));
check("L3 die Klassifizierung schreibt nichts (rein)",
  quellen.every((s) => !/writeFileSync|appendFileSync|mkdirSync/.test(s)) || !/writeFileSync/.test(quellen[1]));
// Sicherheitsnetz zum Sprintauftrag: die beiden Plenumswege bleiben unaktiviert.
check("L4 be-plenum und bb-plenum bleiben `needs_review` + `manual` (keine Aktivierung)",
  ["be-plenum", "bb-plenum"].every((id) => WEG[id].status === "needs_review" && WEG[id].activation_mode === "manual"));

// ============ TEIL M — VORGANGSBEZUG: Kardinalitaet, Kennungsstabilitaet, fail closed ========
// Grundlage: Vorgangs-Analyse gegen die ECHTEN Exporte (scripts/pardok-vorgangs-analyse.js).
//   Berlin      Lauf 30493097161 — 41 853 <Vorgang> / 47 415 <Dokument> (erste 48 MiB des Exports)
//   Berlin + BB Lauf 30493614179 — Brandenburg WP8 vollstaendig: 9 092 <Vorgang> / 8 133 <Dokument>
// Kennzahlen und offene Punkte: docs/quellenarchitektur/17-pardok-parser.md Teil C.
//
// Die Tests hier pruefen NICHT die Messung nach (das kann offline niemand), sondern das VERHALTEN
// des Parsers in genau den Faellen, die die Messung als vorhanden bzw. als nicht vorkommend
// ausgewiesen hat. Beide Laender getrennt.
console.log("\n--- M · Vorgangsbezug: Kardinalitaet, Kennungsstabilitaet, fail closed ---");
const mXml = fx("vorgangsbezug-grenzfaelle.xml");
const mBe = P.parsePardokDocumentsFromString(mXml, { land: "berlin" });
const mBb = P.parsePardokDocumentsFromString(mXml, { land: "brandenburg" });
const mBeById = Object.fromEntries(mBe.documents.map((d) => [d.externe_id, d]));

// 1 · Stabile externe Vorgangskennung. Berlin: VNr in 41 853/41 853, Form immer V-<Ziffern>,
// 0 Platzhalter. Brandenburg: VNr in 8 681/9 092 — also NICHT flaechendeckend (siehe M6).
check("M1 der Vorgangsbezug ist die externe Kennung der Quelle, unveraendert uebernommen",
  mBeById["D-800009"].vorgangsnummer === "V-800008"
  && [...beVDocs, ...bbDocs].filter((d) => d.vorgangsnummer).every((d) => /^V-\d+$/.test(d.vorgangsnummer)));

// 2 · Widerspruechliche Kennungen -> fail closed. Gemessen 0 Faelle (BE: 0 von 41 853 Abweichungen
// VNr/VID; BB: kein <VID> vorhanden, also kein Widerspruch moeglich).
check("M2 VNr != VID -> KEIN Vorgangsbezug (keine willkuerliche Auswahl) und sichtbar gezaehlt",
  mBeById["D-800003"].vorgangsnummer === null && mBe.stats.kennungKonflikt === 1
  && mBb.stats.kennungKonflikt === 1);
check("M2b das Dokument bleibt trotz verworfener Vorgangskennung lesbar und eigenstaendig",
  mBeById["D-800003"].externe_id === "D-800003" && mBeById["D-800003"].platzhalter === false
  && mBeById["D-800003"].dokumentklasse === "drucksache");

// 3 · Platzhalterwert. Der Export fuehrt einen blossen Bindestrich als LEERWERT (belegt an <VIR>).
check("M3 Platzhalter \"-\" ist KEINE Kennung -> kein Vorgangsbezug, kein Schein-Vorgang",
  mBeById["D-800004"].vorgangsnummer === null && mBeById["D-800005"].vorgangsnummer === null);
check("M3b zwei Dokumente mit Platzhalter-Kennung fallen NICHT zu einem Sammelcluster zusammen",
  mBeById["D-800004"].inhaltsfingerabdruck !== mBeById["D-800005"].inhaltsfingerabdruck
  && P.dedupToDocuments([mBeById["D-800004"], mBeById["D-800005"]], "be-plenum").anzahl === 2);

// 4 · Verbindung Dokument -> Vorgang. Sie entsteht AUSSCHLIESSLICH aus der Verschachtelung; ein
// Verweisfeld am Dokument gibt es in keinem der beiden Exporte (Feld-Inventar beider Laeufe).
check("M4 der Bezug entsteht aus der Verschachtelung: flache Dokumente haben KEINEN Vorgang",
  beDocs.every((d) => d.vorgangsnummer === null) && beDocs.length === 10);
check("M4b jedes Dokument traegt GENAU EINEN Vorgangsbezug (Skalar, keine Liste)",
  [...beVDocs, ...bbDocs, ...mBe.documents].every((d) => d.vorgangsnummer === null || typeof d.vorgangsnummer === "string"));

// 5 · Kardinalitaet 1:n. Gemessen BE: 1..75 Dokumente je Vorgang (17 407 mit genau 2); BB: 1..33.
// UND: keine <DBID> unter mehreren <VNr> (BE, 47 415 Dokumente) -> die Auswahl ist nicht willkuerlich.
check("M5 EIN Vorgang traegt MEHRERE Dokumente mit gleichem Bezug und eigener Identitaet",
  mBeById["D-800009"].vorgangsnummer === mBeById["D-800010"].vorgangsnummer
  && mBeById["D-800009"].externe_id !== mBeById["D-800010"].externe_id
  && mBeById["D-800009"].inhaltsfingerabdruck !== mBeById["D-800010"].inhaltsfingerabdruck);
check("M5b kein Dokument taucht mit ZWEI verschiedenen Vorgangsbezuegen auf (1:n, nicht n:m)",
  (() => {
    const zuVnr = new Map();
    for (const d of [...beVDocs, ...bbDocs, ...bbG, ...mBe.documents]) {
      if (!d.vorgangsnummer) continue;
      if (!zuVnr.has(d.externe_id)) zuVnr.set(d.externe_id, new Set());
      zuVnr.get(d.externe_id).add(d.vorgangsnummer);
    }
    return [...zuVnr.values()].every((s) => s.size === 1);
  })());

// 6 · Fehlender Bezug. GEMESSENER Regelfall in Brandenburg: 411 von 4 751 vollstaendigen
// Vorgaengen haben Dokumente, aber keinen verwertbaren <VNr>-Wert (8,7 %).
check("M6 Vorgang ohne verwertbare Kennung -> Bezug null, Dokument bleibt lesbar",
  mBb.documents.some((d) => d.externe_id === "bra:08/9411#r0001" && d.vorgangsnummer === null
    && d.titel === "Bericht ohne verwertbare Vorgangsnummer"));
check("M6b Berlin: nur VID vorhanden -> VID ist die Kennung (Rueckfall, kein Normalweg)",
  mBeById["D-800007"].vorgangsnummer === "V-800006");
check("M6c ein fehlender Bezug wird NIE aus Titel, Adresse oder DokNr erfunden",
  mBb.documents.filter((d) => !d.vorgangsnummer).every((d) => d.vorgangsnummer === null)
  && mBe.documents.filter((d) => !d.vorgangsnummer).length === 4);

// 7 · Deterministische Normalisierung.
check("M7 Zeilenumbruch/Mehrfach-Leerzeichen in der Kennung wird deterministisch normalisiert",
  mBeById["D-800012"].vorgangsnummer === "V-800011");
check("M7b zweimal derselbe Lauf -> byte-identische Vorgangsbezuege",
  JSON.stringify(P.parsePardokDocumentsFromString(mXml, { land: "berlin" }).documents.map((d) => d.vorgangsnummer))
  === JSON.stringify(mBe.documents.map((d) => d.vorgangsnummer)));

// 8 · delete-Stubs. BE 20 939 von 41 853, BB 4 341 von 9 092 — beide Exporte fuehren Tombstones.
check("M8 delete-Stubs erzeugen weder Dokument noch Vorgangsbezug",
  beV.stats.deleteStubs === 2 && bb.stats.deleteStubs === 1
  && beVDocs.length === 3 && bbDocs.length === 7);

// 9 · Der Bezug bleibt im BESTEHENDEN kanonischen Vertrag. Keine neue Struktur, kein Vorgangsobjekt.
const mRoh = mBe.documents.map((d) => K.zuRohdokument(d, kontextFuer("berlin")));
check("M9 der Vorgangsbezug landet im bestehenden `raw`-Feld, nicht in einer neuen Spalte",
  mRoh.every((r) => Object.keys(r).every((k) => V3_SPALTEN.has(k)))
  && mRoh.find((r) => r.raw.externe_id === "D-800009").raw.vorgangsnummer === "V-800008");
check("M9b kein Rohdokument bekommt eine cluster_id — der Bezug ist KEINE Vorgangsbildung",
  mRoh.every((r) => r.cluster_id === null));
check("M9c keine Dokumentklasse `vorgang`, auch nicht bei mehrdokumentigen Vorgaengen",
  mBe.documents.every((d) => d.dokumentklasse !== "vorgang" && d.dokumentklasse !== "unbekannt"));

// 10 · WECHSELWIRKUNG mit der unveraenderten globalen Dedup (Vorbedingung fuer einen Cutover).
// Regel A gruppiert nach kanonischer URL. Zwei Dokumente EINES Vorgangs koennen dieselbe
// Protokoll-Adresse tragen — ohne Regel 0 (externe Kennung) verschmelzen sie, und der Vorgang
// verliert eines seiner Dokumente. Genau das wird hier gemessen, nicht behauptet.
const mDedupItems = mRoh.map(alsDedupItem);
const mMerged = D.mergeIntoDocuments(mDedupItems);
check("M10 acht eigenstaendige Rohdokumente bleiben acht Dokumente (Regel 0 greift vor Adresse)",
  mDedupItems.length === 8 && mMerged.length === 8);
check("M10b zwei Dokumente EINES Vorgangs mit IDENTISCHER Adresse verschmelzen nicht",
  mMerged.filter((m) => (m.canonical_url || "").endsWith("p19-800.pdf")).length === 2);
check("M10c ohne externe Kennung WUERDE die Adressregel sie zusammenfuehren (Nachweis der Ursache)",
  D.mergeIntoDocuments(mDedupItems.map((i) => ({ ...i, externe_id: null })))
    .filter((m) => (m.canonical_url || "").endsWith("p19-800.pdf")).length === 1);
check("M10d Dokumente mit verworfener Vorgangskennung behalten je eigene Identitaet",
  new Set(mMerged.map((m) => m.external_identity)).size === 8);

// 11 · Kein Netz, keine DB, kein LLM in diesem Nachweis.
check("M11 die Vorgangsbezug-Fixture ist eine Datei im Repo, kein Abruf",
  fs.existsSync(path.join(__dirname, "..", "test", "fixtures", "pardok", "vorgangsbezug-grenzfaelle.xml")));
check("M11b die Fixture ist als KEIN QUELLENBELEG fuer Feldinhalte gekennzeichnet",
  /KEIN QUELLENBELEG/.test(mXml));
// 12 · Die Analyse selbst ist ein Diagnosewerkzeug und darf die Offline-Suite nicht ans Netz haengen.
check("M12 die Vorgangs-Analyse heisst NICHT `*-test.js` (Offline-Runner sammelt sie nicht ein)",
  fs.existsSync(path.join(__dirname, "pardok-vorgangs-analyse.js"))
  && !fs.existsSync(path.join(__dirname, "pardok-vorgangs-analyse-test.js")));

console.log(`\nBerlin-Klassenverteilung:      ${JSON.stringify(beVerteilung)}`);
console.log(`Brandenburg-Klassenverteilung: ${JSON.stringify(bbVerteilung)}`);
console.log(`\n== Landesparser-Klassen (Roadmap-Punkt 24): ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
