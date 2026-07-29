"use strict";

// Offline-Test des PARDOK-Parsers (lib/helmut/quellenarchitektur/pardok-parser.js).
// REINE LOGIK gegen Gold-Fixtures (Berlin/Brandenburg) + alle geforderten adversarialen Faelle.
// Kein Netz, keine DB, kein LLM.

const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(name) { return fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", name), "utf8"); }

// ============================ BERLIN Gold-Fixture ============================
const be = P.parsePardokDocumentsFromString(fx("berlin-gold.xml"), { land: "berlin", sourceUrl: "https://www.parlament-berlin.de/opendata/pardok-wp19.xml" });
const bd = be.documents;
check("BE: 10 Dokumente geparst", bd.length === 10 && be.stats.geparst === 10);
check("BE: jedes Dokument hat externe_id (DBID)", bd.every((d) => d.externe_id && d.externe_id.startsWith("D-")) && be.stats.mitExterneId === 10);
check("BE: 0 Platzhalter", be.stats.platzhalter === 0);
check("BE: 5 Dokumente mit Titel (Drs/VO/Antr/KlAnfr)", be.stats.mitTitel === 5);
check("BE: formatTitel-Erkennung 5/5 = 100%", be.stats.formatTitelVorhanden === 5 && be.stats.formatTitelErkannt === 5);
check("BE: titellose Typen bleiben titel=null (PlPr/GVBl/APr/Antwort)", bd.filter((d) => d.titel === null).length === 5);
const beByNr = Object.fromEntries(bd.map((d) => [d.externe_id, d]));
check("BE: Datum als ISO geparst (09.11.2021 -> 2021-11-09)", beByNr["D-351758"].veroeffentlichungsdatum === "2021-11-09");
check("BE: fehlendes Datum bleibt null", beByNr["D-360003"].veroeffentlichungsdatum === null);
check("BE: Wahlperiode aus <Wp> = 19", bd.every((d) => d.wahlperiode === 19));
check("BE: Drucksachennummer erkannt (19/10058)", beByNr["D-351758"].drucksachennummer === "19/10058");
check("BE: GVBl ohne DokNr -> drucksachennummer null, externe_id trotzdem DBID", beByNr["D-351046"].drucksachennummer === null && beByNr["D-351046"].externe_id === "D-351046");
check("BE: Ausschuss erkannt bei Ausschussprotokoll (Urheber enthaelt 'Ausschuss')", /Ausschuss f/.test(beByNr["D-354521"].ausschuss || ""));
check("BE: kein erfundener Ausschuss bei SchrAnfr", beByNr["D-351758"].ausschuss === null);
check("BE: Originaladresse = LokURL (pdf)", /S19-10058\.pdf$/.test(beByNr["D-351758"].originaladresse || ""));
check("BE: politische Ebene = land, Geografie = geo-land-berlin", bd.every((d) => d.politische_ebene === "land" && d.geografie === "geo-land-berlin"));
// Adversarial: gleiche Titel, unterschiedliche Vorgaenge -> unterschiedliche Fingerabdruecke
check("BE-adv: gleicher Titel (Haushaltsplan) -> 2 unterschiedliche Fingerabdruecke",
  beByNr["D-360001"].titel === beByNr["D-360002"].titel &&
  beByNr["D-360001"].inhaltsfingerabdruck !== beByNr["D-360002"].inhaltsfingerabdruck);

// ============================ BRANDENBURG Gold-Fixture ============================
const bb = P.parsePardokDocumentsFromString(fx("brandenburg-gold.xml"), { land: "brandenburg", sourceUrl: "https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml" });
const cd = bb.documents;
check("BB: 8 Roh-Vorgaenge, 1 delete-Stub, 1 ohne Dokument", bb.stats.rohRecords === 8 && bb.stats.deleteStubs === 1 && bb.stats.ohneDokument === 1);
check("BB: 7 Dokumente geparst (inkl. Multi-Dok-Vorgang)", cd.length === 7 && bb.stats.geparst === 7);
// Der echte Export fuehrt V-369325 ZWEIMAL: einmal als delete-Stub, einmal als vollstaendigen
// Eintrag (Sonde 26.07.2026, Records #0 und #1). Der Stub selbst erzeugt kein Dokument und darf
// den vollstaendigen Eintrag weder verdraengen noch verdoppeln -> genau EIN Dokument.
check("BB: delete-Stub erzeugt KEIN Dokument (Stub allein)",
  P.parseBrandenburgVorgang("<Vorgang><VNr>V-369325</VNr><VFunktion>delete</VFunktion></Vorgang>").documents.length === 0);
check("BB: delete-Stub + vollstaendiger Eintrag gleicher VNr -> genau EIN Dokument",
  cd.filter((d) => d.vorgangsnummer === "V-369325").length === 1);
check("BB: jedes Dokument hat externe_id (VNr#ReihNr)", cd.every((d) => /^V-\d+#/.test(d.externe_id)) && bb.stats.mitExterneId === 7);
check("BB: 0 Platzhalter", bb.stats.platzhalter === 0);
check("BB: externe_id eindeutig (kein Kollisions-Sammelcluster)", new Set(cd.map((d) => d.externe_id)).size === 7 && new Set(cd.map((d) => d.inhaltsfingerabdruck)).size === 7);
check("BB: 5 Dokumente mit Titel", bb.stats.mitTitel === 5 && bb.stats.formatTitelErkannt === 5 && bb.stats.formatTitelVorhanden === 5);
const bbById = Object.fromEntries(cd.map((d) => [d.externe_id, d]));
check("BB: Multi-Dok-Vorgang V-370081 -> 2 unterscheidbare Dokumente (ReihNr)", !!bbById["V-370081#r0001"] && !!bbById["V-370081#r0002"] &&
  bbById["V-370081#r0001"].inhaltsfingerabdruck !== bbById["V-370081#r0002"].inhaltsfingerabdruck);
check("BB: mehrere Urheber als Array", Array.isArray(bbById["V-369657#r0001"].urheber) && bbById["V-369657#r0001"].urheber.length === 2);
check("BB: Vorgangs-Stichworte (Desk) uebernommen", (bbById["V-369657#r0001"].stichworte || []).includes("Extremismus"));
check("BB: Vorgangstyp aus <VTypL>", bbById["V-369657#r0001"].vorgangstyp === "Anfrage");
check("BB: fehlendes Datum bleibt null", bbById["V-380500#r0001"].veroeffentlichungsdatum === null);
check("BB: Geografie = geo-land-brandenburg", cd.every((d) => d.geografie === "geo-land-brandenburg"));
// Adversarial: identische Drucksachennummer (08/30) aus unterschiedlichen Wahlperioden/Vorgaengen
check("BB-adv: DokNr 08/30 in WP8 und WP7 -> getrennte Dokumente, andere Fingerabdruecke",
  bbById["V-369657#r0001"].drucksachennummer === "08/30" && bbById["V-250100#r0001"].drucksachennummer === "08/30" &&
  bbById["V-369657#r0001"].wahlperiode === 8 && bbById["V-250100#r0001"].wahlperiode === 7 &&
  bbById["V-369657#r0001"].inhaltsfingerabdruck !== bbById["V-250100#r0001"].inhaltsfingerabdruck);
check("BB-adv: <Wp>-Feld hat Vorrang vor DokNr-Praefix (08/30 -> WP7, nicht 8)", bbById["V-250100#r0001"].wahlperiode === 7);

// ============================ Dedup + Fundstellen ============================
const dd = P.dedupToDocuments([...bd, ...cd], "pardok-test");
check("Dedup: keine Falsch-Zusammenfuehrung (17 rein -> 17 Dokumente)", dd.anzahl === 17 && dd.mehrfach === 0);
check("Dedup: kein Platzhalter-Sammelcluster", dd.dokumente.every((d) => d.fundstellen_anzahl === 1));
// Zwei IDENTISCHE Records (gleiche externe_id) -> EIN Dokument mit 2 Fundstellen
const twice = [P.parseBerlinDokument(fx("berlin-gold.xml").match(/<Dokument>[\s\S]*?<\/Dokument>/)[0]), P.parseBerlinDokument(fx("berlin-gold.xml").match(/<Dokument>[\s\S]*?<\/Dokument>/)[0])];
const dd2 = P.dedupToDocuments(twice, "pardok-test");
check("Fundstellen: identische Dokumente -> 1 Dokument, 2 Fundstellen", dd2.anzahl === 1 && dd2.dokumente[0].fundstellen_anzahl === 2 && dd2.mehrfach === 1);

// ============================ Adversarial: Namespace-Aenderung ============================
const nsDoc = '<p:Dokument xmlns:p="urn:x"><p:DBID>D-99999</p:DBID><p:Titel>Namespace-Titel</p:Titel><p:DokNr>19/9</p:DokNr><p:DokDat>01.01.2024</p:DokDat><p:Wp>19</p:Wp><p:DokArtL>Drucksache</p:DokArtL></p:Dokument>';
const nsParsed = P.parseBerlinDokument(nsDoc);
check("adv-Namespace: praefixierte Tags werden extrahiert", nsParsed.externe_id === "D-99999" && nsParsed.titel === "Namespace-Titel" && nsParsed.wahlperiode === 19);

// ============================ Adversarial: HTML-Fehlerseite statt XML ============================
const htmlBody = "<!DOCTYPE html>\n<html><head><title>503 Service Unavailable</title></head><body>Fehler</body></html>";
const htmlParsed = P.parsePardokDocumentsFromString(htmlBody, { land: "berlin" });
check("adv-HTML: Fehlerseite erkannt, 0 Dokumente, kein Crash", htmlParsed.fehlerseite === true && htmlParsed.documents.length === 0);

// ============================ Adversarial: sehr grosse XML + Record-Cap ============================
let big = '<?xml version="1.0"?><Export>';
for (let i = 0; i < 5000; i++) big += `<Dokument><DBID>D-${i}</DBID><DokNr>19/${i}</DokNr><DokDat>01.01.2024</DokDat><Wp>19</Wp><DokArtL>Drucksache</DokArtL></Dokument>`;
big += "</Export>";
const capped = P.parsePardokDocumentsFromString(big, { land: "berlin", maxRecords: 1000 });
check("adv-gross: Record-Cap greift (5000 vorhanden, 1000 verarbeitet)", capped.documents.length === 1000 && capped.stats.rohRecords === 1000);
check("adv-gross: alle Fingerabdruecke eindeutig (kein Cluster)", new Set(capped.documents.map((d) => d.inhaltsfingerabdruck)).size === 1000);

// ============================ Einheiten: Datum + Wahlperiode ============================
check("parseGermanDate: gueltig -> ISO", P.parseGermanDate("07.04.2022") === "2022-04-07");
check("parseGermanDate: falsches Format/leer/null -> null", P.parseGermanDate("2022-04-07") === null && P.parseGermanDate("kein Datum") === null && P.parseGermanDate("") === null && P.parseGermanDate(null) === null);
check("detectWahlperiode: <Wp> hat Vorrang", P.detectWahlperiode("19", "08/30", "x", /w(\d+)/i) === 19);
check("detectWahlperiode: aus DokNr-Praefix", P.detectWahlperiode(null, "08/30", null, null) === 8);
check("detectWahlperiode: aus Quell-URL", P.detectWahlperiode(null, null, "https://x/opendata/exportWP8.xml", /wp(\d+)/i) === 8);
check("detectWahlperiode: nichts -> null", P.detectWahlperiode(null, null, null, null) === null);

console.log(`\n== PARDOK-Parser Offline-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
