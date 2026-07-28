"use strict";

// Helmut — Sprint 21 · Testsuite "Nachklassifikation des Altbestands" (OP-24).
// =============================================================================================
// OFFLINE, ohne Netz, ohne KI, ohne Datenbank. Gliederung:
//
//   A · Die 20 im Sprintauftrag verbindlich geforderten Testfaelle, einzeln und benannt
//   B · Fehlerklassen und Einstufungen
//   C · Werkzeug: Kandidatenauswahl, Grenzen, Schalter
//   D · DSGVO-Maskierung des Protokolls
//   E · Struktur-/Regressionsriegel (keine KI, kein zweiter Schreibpfad, keine Hardcodes)
//
// Aufruf:  node scripts/nachklassifikation-test.js

const fs = require("fs");
const path = require("path");

const N = require("../lib/helmut/quellenarchitektur/nachklassifikation");
const W = require("../scripts/nachklassifikation.js");

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail !== undefined ? `  -> ${JSON.stringify(detail)}` : ""}`); }
}

const T0 = "2026-07-01T00:00:00.000Z";
const T1 = "2026-07-27T12:00:00.000Z";

const DEUTSCHLAND = { name: "Deutschland", level: "bund", geography_id: "geo-bund" };
const BERLIN = { name: "Berlin", level: "land", geography_id: "geo-land-berlin" };
const BRANDENBURG = { name: "Brandenburg", level: "land", geography_id: "geo-land-brandenburg" };
const EU_FREI = { name: "Europäische Union", level: "eu", geography_id: null };

let laufendeNummer = 0;
// Ein gespeichertes Wissensobjekt in Altform (Eintraege OHNE Herkunft).
function ko(felder = {}) {
  laufendeNummer += 1;
  return {
    id: `ko-${laufendeNummer}`, vorgang_id: `vg-test-${laufendeNummer}`,
    understanding_status: "complete", status: "neu",
    created_at: T0, updated_at: T0,
    affected_geographies: [], mentioned_geographies: [], mentioned_locations: [],
    classification_confidence: {},
    ...felder
  };
}

const ids = (liste) => (liste || []).map((g) => g.geography_id || g.name).sort();
const betroffenNach = (plan, vorher) => (plan.patch && plan.patch.affected_geographies) || vorher.affected_geographies;

// Wendet einen Plan auf das Objekt an (so wie es der Schreiblauf taete).
function anwenden(objekt, plan) {
  if (!plan.patch) return objekt;
  return { ...objekt, ...plan.patch };
}

// ══════════════════════════════════════════════════════════════════════════════
// A · Die 20 verbindlich geforderten Testfaelle
// ══════════════════════════════════════════════════════════════════════════════
console.log("A · Die 20 verbindlich geforderten Testfaelle");

// --- 1 -----------------------------------------------------------------------
const a1KO = ko({
  decision_level: "bund", political_level: "bund",
  headline: "Bundestag beschliesst Rentenpaket",
  affected_geographies: [DEUTSCHLAND]
});
const a1 = N.planeNachklassifikation(a1KO, { jetzt: T1 });
check("A1 falsche Deutschland-Geografie aus der Bundesebene wird entfernt, wenn kein Nachweis vorliegt",
  betroffenNach(a1, a1KO).length === 0 && a1.klassen.includes("geo-ebenen-ableitung-bund"),
  { betroffen: betroffenNach(a1, a1KO), klassen: a1.klassen });

// --- 2 -----------------------------------------------------------------------
const a2KO = ko({
  decision_level: "land", political_level: "land",
  headline: "Landesregierung kuendigt Programm an",
  affected_geographies: [DEUTSCHLAND]
});
const a2 = N.planeNachklassifikation(a2KO, { jetzt: T1 });
check("A2 falsche Deutschland-Geografie aus unbekannter Landesregion wird entfernt",
  betroffenNach(a2, a2KO).length === 0 && a2.klassen.includes("geo-ersatzwert-land"),
  { betroffen: betroffenNach(a2, a2KO), klassen: a2.klassen });

// --- 3 -----------------------------------------------------------------------
const a3KO = ko({
  decision_level: "eu", political_level: "eu",
  headline: "Europaeische Kommission legt Verordnung vor",
  affected_geographies: [EU_FREI]
});
const a3 = N.planeNachklassifikation(a3KO, { jetzt: T1 });
check("A3 nicht kanonische Europaeische-Union-Geografie wird bereinigt",
  betroffenNach(a3, a3KO).length === 0 && a3.klassen.includes("geo-eu-nicht-kanonisch"),
  { betroffen: betroffenNach(a3, a3KO) });

// --- 4 -----------------------------------------------------------------------
// "Echt nachgewiesen" heisst hier: der Eintrag traegt eine echte Herkunft
// (Rang >= ki). Genau das unterscheidet einen Nachweis von einer Altableitung.
const a4KO = ko({
  decision_level: "bund", political_level: "bund",
  headline: "Bundesweite Auswirkungen",
  affected_geographies: [{ ...DEUTSCHLAND, herkunft: "ki" }],
  classification_confidence: { geography: "medium", geography_ermittelt_am: T0 }
});
const a4 = N.planeNachklassifikation(a4KO, { jetzt: T1 });
check("A4 eine echt nachgewiesene Deutschland-Betroffenheit bleibt erhalten",
  ids(betroffenNach(a4, a4KO)).join() === "geo-bund" && a4.klassen.includes("geo-belegt-geschuetzt"),
  { betroffen: betroffenNach(a4, a4KO), klassen: a4.klassen });

// --- 5 -----------------------------------------------------------------------
const a5KO = ko({
  decision_level: "land", political_level: "land",
  headline: "Abgeordnetenhaus von Berlin beschliesst Nachtragshaushalt",
  affected_geographies: [BERLIN],
  mentioned_geographies: [BERLIN], mentioned_locations: ["Berlin"]
});
const a5 = N.planeNachklassifikation(a5KO, { jetzt: T1 });
check("A5 eine echte Berliner Betroffenheit bleibt erhalten",
  ids(betroffenNach(a5, a5KO)).join() === "geo-land-berlin",
  { betroffen: betroffenNach(a5, a5KO) });
check("A5b und ihre Herkunft steigt vom Altbestand auf den inhaltlichen Nachweis",
  (betroffenNach(a5, a5KO)[0] || {}).herkunft === "inhalt",
  betroffenNach(a5, a5KO));
check("A5c eine nachgewiesene Region wird NIE als blosse Erwaehnung behandelt",
  !a5.klassen.includes("geo-erwaehnung-als-betroffenheit")
  && !a5.klassen.includes("geo-ebenen-ableitung-bund"),
  a5.klassen);

// --- 6 -----------------------------------------------------------------------
const a6KO = ko({
  decision_level: "land", political_level: "land",
  headline: "Debatte ueber den Wohnungsbau",
  was_ist_passiert: "In der Diskussion wurde auch Berlin genannt.",
  affected_geographies: [BERLIN],
  mentioned_geographies: [BERLIN], mentioned_locations: ["Berlin"]
});
const a6 = N.planeNachklassifikation(a6KO, { jetzt: T1 });
check("A6 eine reine Berlin-Erwaehnung wird nicht zu Betroffenheit",
  betroffenNach(a6, a6KO).length === 0 && a6.klassen.includes("geo-erwaehnung-als-betroffenheit"),
  { betroffen: betroffenNach(a6, a6KO), klassen: a6.klassen });
check("A6b die Erwaehnung geht dabei nicht verloren (sie bleibt in mentioned_geographies)",
  ids(a6.patch.mentioned_geographies || a6KO.mentioned_geographies).includes("geo-land-berlin"),
  a6.patch.mentioned_geographies);

// --- 7 -----------------------------------------------------------------------
const a7KO = ko({
  decision_level: "land", political_level: "land",
  headline: "Abgeordnetenhaus von Berlin und Landtag Brandenburg beschliessen Staatsvertrag",
  affected_geographies: []
});
const a7 = N.planeNachklassifikation(a7KO, { jetzt: T1 });
check("A7 Berlin und Brandenburg koennen gemeinsam gespeichert werden",
  ids(betroffenNach(a7, a7KO)).join() === "geo-land-berlin,geo-land-brandenburg",
  betroffenNach(a7, a7KO));

// --- 8 -----------------------------------------------------------------------
const a8KO = ko({
  decision_level: "land", political_level: "land",
  headline: "Meldung ohne jedes geografische Signal",
  affected_geographies: [{ ...BERLIN, herkunft: "inhalt" }],
  classification_confidence: { geography: "medium", geography_ermittelt_am: T0 }
});
const a8 = N.planeNachklassifikation(a8KO, { jetzt: T1 });
check("A8 ein belastbarer bestehender Wert bleibt erhalten, wenn die neue Analyse leer ist",
  ids(betroffenNach(a8, a8KO)).join() === "geo-land-berlin",
  betroffenNach(a8, a8KO));

// --- 9 -----------------------------------------------------------------------
// Schwacher falscher Altwert (Bayern, ohne Herkunft, nur erwaehnt) gegen einen
// echten inhaltlichen Nachweis (Abgeordnetenhaus von Berlin).
const a9KO = ko({
  decision_level: "land", political_level: "land",
  headline: "Abgeordnetenhaus von Berlin beschliesst Schulgesetz",
  was_ist_passiert: "Am Rande wurde Bayern erwaehnt.",
  affected_geographies: [{ name: "Bayern", level: "land", geography_id: "geo-land-bayern" }],
  mentioned_geographies: [{ name: "Bayern", level: "land", geography_id: "geo-land-bayern" }],
  mentioned_locations: ["Bayern"]
});
const a9 = N.planeNachklassifikation(a9KO, { jetzt: T1 });
check("A9 ein schwacher falscher Wert wird durch einen staerkeren Nachweis korrigiert",
  ids(betroffenNach(a9, a9KO)).join() === "geo-land-berlin",
  betroffenNach(a9, a9KO));

// --- 10 ----------------------------------------------------------------------
const a10KO = ko({
  decision_level: "land", political_level: "land",
  headline: "Landtag Brandenburg stimmt zu",
  affected_geographies: [{ ...BERLIN, herkunft: "inhalt" }],
  classification_confidence: { geography: "medium", geography_ermittelt_am: T0 }
});
const a10 = N.planeNachklassifikation(a10KO, { jetzt: T1 });
check("A10 ein gleichwertiger zusaetzlicher Nachweis vereinigt mehrere Regionen",
  ids(betroffenNach(a10, a10KO)).join() === "geo-land-berlin,geo-land-brandenburg",
  betroffenNach(a10, a10KO));

// --- 11 ----------------------------------------------------------------------
const zweiterLauf = [
  ["A1", a1KO, a1], ["A2", a2KO, a2], ["A3", a3KO, a3], ["A5", a5KO, a5],
  ["A6", a6KO, a6], ["A7", a7KO, a7], ["A9", a9KO, a9], ["A10", a10KO, a10]
].map(([name, objekt, plan]) => {
  const danach = anwenden(objekt, plan);
  const zweiter = N.planeNachklassifikation(danach, { jetzt: "2026-08-01T00:00:00.000Z" });
  return { name, unveraendert: zweiter.unveraendert, patch: zweiter.patch };
});
check("A11 ein zweiter Lauf erzeugt keine weiteren Aenderungen (Idempotenz, alle Faelle)",
  zweiterLauf.every((r) => r.unveraendert),
  zweiterLauf.filter((r) => !r.unveraendert));

// --- 12 ----------------------------------------------------------------------
// Ein abgebrochener Lauf: Objekt 1 wurde geschrieben, Objekt 2 nicht. Der
// Wiederaufsetzer plant fuer 1 nichts mehr und fuer 2 unveraendert dasselbe.
const a12A = ko({ decision_level: "bund", political_level: "bund", headline: "Bundestag A", affected_geographies: [DEUTSCHLAND] });
const a12B = ko({ decision_level: "bund", political_level: "bund", headline: "Bundestag B", affected_geographies: [DEUTSCHLAND] });
const a12PlanA = N.planeNachklassifikation(a12A, { jetzt: T1 });
const a12PlanB = N.planeNachklassifikation(a12B, { jetzt: T1 });
const a12NachAbbruch = [anwenden(a12A, a12PlanA), a12B]; // nur A geschrieben, dann Abbruch
const a12Fortsetzung = a12NachAbbruch.map((k) => N.planeNachklassifikation(k, { jetzt: T1 }));
check("A12 ein abgebrochener Lauf kann sicher fortgesetzt werden",
  a12Fortsetzung[0].unveraendert === true
  && a12Fortsetzung[1].unveraendert === false
  && JSON.stringify(a12Fortsetzung[1].patch) === JSON.stringify(a12PlanB.patch),
  a12Fortsetzung.map((p) => p.unveraendert));

// --- 13 ----------------------------------------------------------------------
// Der Vorschaumodus schreibt garantiert nichts: das Planungsmodul kennt keinen
// Schreibpfad, und das Werkzeug loest die Schreibfunktion erst nach dem
// Bestaetigungs-Gate auf.
const werkzeugQuelle = fs.readFileSync(path.join(__dirname, "nachklassifikation.js"), "utf8");
const modulQuelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "quellenarchitektur", "nachklassifikation.js"), "utf8");
check("A13a der Vorschaumodus schreibt garantiert nichts — das Planungsmodul hat keinen Schreibpfad",
  !/saveKnowledgeObject|supabaseRequest|require\(.*storage/.test(modulQuelle));
// Der tatsaechliche Schreibaufruf, nicht die blosse Erwaehnung des Namens im Kopfkommentar.
const SCHREIBAUFRUF = "storage.saveKnowledgeObjectEnrichment(";
check("A13b und im Werkzeug steht jeder Schreibaufruf hinter `args.ausfuehren`",
  (werkzeugQuelle.match(/storage\.saveKnowledgeObjectEnrichment\(/g) || []).length === 1
  && werkzeugQuelle.indexOf("if (!args.ausfuehren)") < werkzeugQuelle.indexOf(SCHREIBAUFRUF));
check("A13c die Vorschau ist der Standard (ausfuehren ist ohne Schalter false)",
  W.parseArgs(["node", "x"]).ausfuehren === false);

// --- 14 ----------------------------------------------------------------------
check("A14a der Schreibmodus verlangt den ausdruecklichen Schalter --ausfuehren",
  W.parseArgs(["node", "x", "--ausfuehren"]).ausfuehren === true);
check("A14b und zusaetzlich die Umgebungsvariable HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja",
  W.BESTAETIGUNG === "HELMUT_NACHKLASSIFIKATION_BESTAETIGT"
  && new RegExp(`${W.BESTAETIGUNG}[^\\n]*!== "ja"`).test(werkzeugQuelle.replace(/\s+/g, " ").replace("process.env[BESTAETIGUNG] || \"\").trim().toLowerCase()", W.BESTAETIGUNG)));
check("A14c und vor dem ersten Schreibzugriff laeuft das Production-Schreibgate",
  /erzwingeSchreibgate\(process\.env/.test(werkzeugQuelle)
  && werkzeugQuelle.indexOf("erzwingeSchreibgate(process.env") < werkzeugQuelle.indexOf(SCHREIBAUFRUF));

// --- 15 ----------------------------------------------------------------------
const vieleObjekte = Array.from({ length: 30 }, (_, i) => ({ id: `ko-m-${i}`, created_at: T0, understanding_status: "complete" }));
const a15 = W.waehleKandidaten(vieleObjekte, { max: 10 });
check("A15a das Mengenlimit wird eingehalten (ueber der Grenze bricht das Werkzeug ab statt zu kappen)",
  a15.ueberMax === true && a15.kandidaten.length === 30);
check("A15b das Batchlimit ist ein eigener, unabhaengiger Wert",
  W.parseArgs(["node", "x", "--batch=7"]).batch === 7 && W.BATCH_STANDARD === 25);
check("A15c --ids wirkt VOR jeder Mengenkappung (Lehre aus B4-3)",
  W.waehleKandidaten(vieleObjekte, { ids: ["ko-m-29"], max: 1 }).kandidaten.map((k) => k.id).join() === "ko-m-29");

// --- 16 ----------------------------------------------------------------------
// Ein kaputter Datensatz darf weder werfen noch einen anderen Datensatz veraendern.
const a16Kaputt = ko({ decision_level: "bund", affected_geographies: "{kein-json", classification_confidence: "auch-kaputt" });
const a16Gesund = ko({ decision_level: "bund", political_level: "bund", headline: "Bundestag", affected_geographies: [DEUTSCHLAND] });
let a16Fehler = null;
let a16PlanKaputt = null;
try { a16PlanKaputt = N.planeNachklassifikation(a16Kaputt, { jetzt: T1 }); } catch (e) { a16Fehler = e; }
const a16PlanGesund = N.planeNachklassifikation(a16Gesund, { jetzt: T1 });
check("A16a ein Fehler in einem Objekt veraendert kein anderes Objekt (Plan je Objekt ist unabhaengig)",
  a16Fehler === null && a16PlanKaputt !== null && betroffenNach(a16PlanGesund, a16Gesund).length === 0,
  a16Fehler && a16Fehler.message);
check("A16b im Schreiblauf zaehlt ein Fehler, bricht aber nicht die Schleife ab",
  /catch \(error\) \{[\s\S]{0,400}fehler \+= 1;/.test(werkzeugQuelle));

// --- 17 ----------------------------------------------------------------------
const a17KO = ko({
  decision_level: "bund", political_level: "bund",
  vorgang_id: "vg-kontakt-20260701-ab12cd",
  headline: "Streng vertraulicher Klartext, der nie ins Protokoll darf",
  was_ist_passiert: "Erreichbar unter test.person@example.com und +49 30 1234567.",
  affected_geographies: [DEUTSCHLAND]
});
const a17Plan = N.planeNachklassifikation(a17KO, { jetzt: T1 });
const a17Protokoll = JSON.stringify(N.maskiereProtokoll(a17Plan));
// (1) Prosafelder gelangen gar nicht erst in den Plan — die staerkste Garantie.
check("A17a weder Plan noch Protokoll enthalten Prosafelder des Vorgangs",
  !JSON.stringify(a17Plan).includes("Streng vertraulicher Klartext")
  && !a17Protokoll.includes("Streng vertraulicher Klartext")
  && !a17Protokoll.includes("test.person@example.com"));
// (2) Das Protokoll hat eine ABGESCHLOSSENE Feldliste. Ein zusaetzliches Feld
//     (etwa eine Ueberschrift) macht diese Zusage rot.
const ERLAUBTE_PROTOKOLLFELDER = [
  "aenderungen", "ebene", "geografie", "id", "kiNoetig", "klassen",
  "manuellePruefung", "sicherAutomatisch", "unveraendert", "vorgang_id"
];
check("A17b das Protokoll traegt ausschliesslich die freigegebenen Felder",
  Object.keys(N.maskiereProtokoll(a17Plan)).sort().join() === ERLAUBTE_PROTOKOLLFELDER.join(),
  Object.keys(N.maskiereProtokoll(a17Plan)).sort());
// (3) Die Redaction wirkt auf jede verbleibende Zeichenkette.
const a17Roh = { grund: "Kontakt test.person@example.com, Telefon +49 30 1234567", name: "Berlin" };
const a17Maskiert = JSON.stringify(N.maskiereWert(a17Roh));
check("A17c jede verbleibende Zeichenkette laeuft durch die zentrale Redaction",
  !a17Maskiert.includes("test.person@example.com") && !a17Maskiert.includes("+49 30 1234567")
  && a17Maskiert.includes("redacted"),
  a17Maskiert);
// Der kanonische Entitaetenkatalog enthaelt BEWUSST keine Person
// (Mandantenneutralitaet). Ein Personenname im Bestand steht deshalb als
// unaufgeloester Eintrag mit type "person" — genau daran greift die Maskierung.
check("A17d ein Personeneintrag wird im Protokoll ueber seinen Typ maskiert",
  JSON.stringify(N.maskiereWert({ name: "Eine reale Person", type: "person", entity_id: null }))
  === JSON.stringify({ name: "[person]", type: "person", entity_id: null }),
  N.maskiereWert({ name: "Eine reale Person", type: "person", entity_id: null }));
check("A17e Entitaetszeilen fuehren ihren Typ mit, damit die Maskierung greifen kann",
  N.planeEntitaeten("related_entities", [{ name: "Eine reale Person", type: "person", entity_id: null }], [])
    .aenderungen.every((a) => a.neuerWert == null || "type" in a.neuerWert)
  && JSON.stringify(N.maskiereProtokoll(N.planeNachklassifikation(ko({
    decision_level: "bund", political_level: "bund", headline: "Bundestag",
    related_entities: [{ name: "Eine reale Person", type: "person", entity_id: null }],
    parteien: ["SPD"]
  }), { jetzt: T1 }))).includes("Eine reale Person") === false);
check("A17f die Katalogschicht bleibt als zweite Absicherung bestehen",
  /PERSONEN_NAMEN\.has\(normText\(v\)\)/.test(modulQuelle));

// --- 18 ----------------------------------------------------------------------
check("A18a KI-Budgets werden respektiert: der Prozess bindet weder ai.js noch das LLM-Budget ein",
  !/require\([^)]*\b(ai|llm-budget)\b/.test(modulQuelle) && !/require\([^)]*\b(ai|llm-budget)\b/.test(werkzeugQuelle));
check("A18b und die Zusammenfassung weist 0 KI-Aufrufe und 0,00 USD aus",
  N.fasseZusammen([a1, a2, a3]).erwarteteKiAufrufe === 0 && N.fasseZusammen([a1]).erwarteteKostenUsd === 0);
check("A18c Objekte, die eine KI braeuchten, werden gemeldet statt still verarbeitet",
  N.KLASSEN["ebene-unbestimmt-ki"].einstufung === N.EINSTUFUNG.KI
  && N.KLASSEN["fachgebiet-fehlt-ki"].einstufung === N.EINSTUFUNG.KI
  && !N.AUTOMATISCH_ERLAUBT.has(N.EINSTUFUNG.KI));

// --- 19 ----------------------------------------------------------------------
const VERBOTENE_TABELLEN = [
  "retrieval_paths", "source_packages", "sources", "mandate_profiles", "profiles",
  "process_runs", "llm_budget_counters", "raw_documents", "ko_document_links"
];
check("A19a der Prozess beruehrt keine Quellen, Pakete, Crons oder Mandantenprofile",
  VERBOTENE_TABELLEN.every((t) => !modulQuelle.includes(t) && !werkzeugQuelle.includes(t)),
  VERBOTENE_TABELLEN.filter((t) => modulQuelle.includes(t) || werkzeugQuelle.includes(t)));
check("A19b der einzige Schreibpfad ist saveKnowledgeObjectEnrichment (nur Klassifikationsspalten)",
  (werkzeugQuelle.match(/storage\.save\w+/g) || []).join() === "storage.saveKnowledgeObjectEnrichment");
check("A19c es wird kein Lock genommen und kein Cron ausgeloest",
  !/acquireLock|releaseLock|cron|pipeline\/run/i.test(modulQuelle)
  && !/acquireLock|releaseLock|\/api\/cron/i.test(werkzeugQuelle));

// --- 20 ----------------------------------------------------------------------
const a20 = N.planeNachklassifikation(a6KO, { jetzt: T1 });
const a20Betroffen = a20.patch.affected_geographies;
const a20Erwaehnt = a20.patch.mentioned_geographies || a6KO.mentioned_geographies;
check("A20a alte und neue Geografiestrukturen werden nicht vermischt: betroffen und erwaehnt bleiben getrennte Felder",
  Array.isArray(a20Betroffen) && Array.isArray(a20Erwaehnt)
  && a20Betroffen.length === 0 && a20Erwaehnt.length > 0);
check("A20b jeder geschriebene Eintrag traegt genau die vier kanonischen Schluessel plus Herkunft",
  [...a20Betroffen, ...a20Erwaehnt].every((e) =>
    Object.keys(e).sort().join() === "geography_id,herkunft,level,name"),
  a20Erwaehnt);
check("A20c es entsteht keine zweite Geografiestruktur (keine neue Spalte, keine neue Tabelle)",
  Object.keys(a20.patch).every((k) => [
    "affected_geographies", "mentioned_geographies", "decision_level", "political_level",
    "decision_entities", "related_entities", "classification_confidence"
  ].includes(k)), Object.keys(a20.patch));

// ══════════════════════════════════════════════════════════════════════════════
// B · Fehlerklassen und Einstufungen
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nB · Fehlerklassen und Einstufungen");

check("B1 jede Fehlerklasse hat genau eine Einstufung aus dem verbindlichen Katalog",
  Object.values(N.KLASSEN).every((k) => Object.values(N.EINSTUFUNG).includes(k.einstufung)));
check("B2 nur 'sicher-korrigierbar' wird automatisch geschrieben",
  N.AUTOMATISCH_ERLAUBT.size === 1 && N.AUTOMATISCH_ERLAUBT.has(N.EINSTUFUNG.SICHER));
check("B3 alle fuenf Einstufungen des Auftrags existieren",
  ["SICHER", "WAHRSCHEINLICH", "KI", "MANUELL", "UNVERAENDERLICH"].every((k) => typeof N.EINSTUFUNG[k] === "string"));
check("B4 jede Klasse traegt Beschreibung und Massnahme (das Protokoll erklaert jede Aenderung)",
  Object.values(N.KLASSEN).every((k) => k.beschreibung && k.massnahme));

// Ein Altwert, der in keine bekannte Fehlerform passt, wird NICHT angefasst.
const b5KO = ko({
  decision_level: "kommune", political_level: "kommune",
  headline: "Kommunale Angelegenheit",
  affected_geographies: [{ name: "Irgendein Ort", level: "kommune", geography_id: null }]
});
const b5 = N.planeNachklassifikation(b5KO, { jetzt: T1 });
check("B5 ein unbekanntes Muster ohne Nachweis bleibt unveraendert und wird zur manuellen Pruefung gemeldet",
  b5.klassen.includes("geo-unklar-manuell") && b5.manuellePruefung === true
  && (b5.patch === null || !b5.patch.affected_geographies),
  { klassen: b5.klassen, patch: b5.patch });

// Deutschland auf einer Ebene, die die Altfunktion nie erzeugt hat -> nicht anfassen.
const b6KO = ko({
  decision_level: "international", political_level: "international",
  headline: "Internationale Lage", affected_geographies: [DEUTSCHLAND]
});
const b6 = N.planeNachklassifikation(b6KO, { jetzt: T1 });
check("B6 Deutschland auf einer Ebene ausserhalb der belegten Altfehler wird NICHT blind entfernt",
  ids(betroffenNach(b6, b6KO)).join() === "geo-bund" && b6.klassen.includes("geo-unklar-manuell"),
  { betroffen: betroffenNach(b6, b6KO), klassen: b6.klassen });

// Politische Ebene: fail closed.
const b7KO = ko({ decision_level: "bund", political_level: "bund", headline: "Ohne jedes Signal", affected_geographies: [] });
const b7 = N.planeNachklassifikation(b7KO, { jetzt: T1 });
check("B7 eine belastbare Ebene wird nie durch 'unknown' ersetzt (Sprint-19-Regel gilt weiter)",
  (!b7.patch || b7.patch.decision_level === undefined || b7.patch.decision_level === "bund")
  && b7.ebene.nachher === "bund",
  { patch: b7.patch, ebene: b7.ebene });
check("B7b und der gespeicherte Wert wird ausdruecklich WIEDERVERWENDET, nicht neu berechnet",
  b7.ebene.wiederverwendet === true && b7.ebene.vorher === "bund",
  b7.ebene);
check("B7c dasselbe fuer die Geografie: ein belastbarer Wert wird wiederverwendet",
  a8.geografie.wiederverwendet === true && a8.geografie.nachher.join() === "geo-land-berlin",
  a8.geografie);

const b8KO = ko({ decision_level: "unknown", political_level: "unknown", headline: "Bundestag beschliesst Gesetz", ausschuesse: ["Haushaltsausschuss"] });
const b8 = N.planeNachklassifikation(b8KO, { jetzt: T1 });
check("B8 eine unbestimmte Ebene darf durch die deterministische Ableitung erstermittelt werden",
  b8.patch && b8.patch.decision_level === "bund" && b8.klassen.includes("ebene-erstermittlung"),
  b8.patch && b8.patch.decision_level);

const b9KO = ko({ decision_level: "Bund", political_level: "", headline: "Bundestag beschliesst Gesetz" });
const b9 = N.planeNachklassifikation(b9KO, { jetzt: T1 });
check("B9 eine Alt-Schreibweise ('Bund') wird kanonisch klein geschrieben und gespiegelt",
  b9.patch && b9.patch.decision_level === "bund" && b9.patch.political_level === "bund"
  && b9.klassen.includes("ebene-schreibweise"),
  b9.patch);

const b10KO = ko({ decision_level: "bund", political_level: "bund", headline: "Bundestag", decision_entities: [{ name: "Haushaltsausschuss", type: "committee", entity_id: null }] });
const b10 = N.planeNachklassifikation(b10KO, { jetzt: T1 });
check("B10 ein Entitaetseintrag ohne kanonische ID wird kanonisiert, ohne den Namen zu veraendern",
  b10.patch && Array.isArray(b10.patch.decision_entities)
  && b10.patch.decision_entities.some((e) => e.name === "Haushaltsausschuss" && e.entity_id),
  b10.patch && b10.patch.decision_entities);

const b11KO = ko({
  decision_level: "bund", political_level: "bund", headline: "Bundestag",
  decision_entities: [{ name: "Ein Gremium ohne Katalogeintrag", type: "committee", entity_id: null }]
});
const b11 = N.planeNachklassifikation(b11KO, { jetzt: T1 });
const b11Entitaeten = (b11.patch && b11.patch.decision_entities) || b11KO.decision_entities;
check("B11 ein nicht aufloesbarer Entitaetseintrag geht nie verloren",
  b11Entitaeten.some((e) => e.name === "Ein Gremium ohne Katalogeintrag"),
  b11Entitaeten);
check("B11b die Entitaetenplanung ist strukturell additiv (kein Eingang faellt heraus)",
  N.planeEntitaeten("decision_entities",
    [{ name: "Voellig unbekannt", type: "organization", entity_id: null },
      { name: "Zweiter Unbekannter", type: "organization", entity_id: null }], [])
    .neu.map((e) => e.name).join() === "Voellig unbekannt,Zweiter Unbekannter",
  N.planeEntitaeten("decision_entities", [{ name: "Voellig unbekannt", type: "organization", entity_id: null }], []).neu);

check("B12 Fachgebiete werden gemeldet, aber von diesem Prozess nicht veraendert",
  b11.klassen.includes("fachgebiet-fehlt-ki")
  && !modulQuelle.includes("patch.tags") && !modulQuelle.includes("patch.policy_field"));

// ══════════════════════════════════════════════════════════════════════════════
// C · Werkzeug: Auswahl, Grenzen, Schalter
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nC · Werkzeug: Auswahl, Grenzen, Schalter");

const cObjekte = [
  { id: "ko-alt", created_at: "2026-06-01T00:00:00.000Z", understanding_status: "complete" },
  { id: "ko-mitte", created_at: "2026-07-10T00:00:00.000Z", understanding_status: "complete" },
  { id: "ko-neu", created_at: "2026-07-25T00:00:00.000Z", understanding_status: "complete" }
];
check("C1 Begrenzung nach Zeitraum (von)",
  W.waehleKandidaten(cObjekte, { von: "2026-07-01T00:00:00.000Z" }).kandidaten.map((k) => k.id).join() === "ko-mitte,ko-neu");
check("C2 Begrenzung nach Zeitraum (bis)",
  W.waehleKandidaten(cObjekte, { bis: "2026-07-11T00:00:00.000Z" }).kandidaten.map((k) => k.id).join() === "ko-alt,ko-mitte");
check("C3 Begrenzung nach Objekt-IDs",
  W.waehleKandidaten(cObjekte, { ids: ["ko-neu"] }).kandidaten.map((k) => k.id).join() === "ko-neu");
check("C4 nicht gefundene IDs werden benannt statt still uebergangen",
  W.waehleKandidaten(cObjekte, { ids: ["ko-neu", "ko-gibt-es-nicht"] }).fehlend.join() === "ko-gibt-es-nicht");
check("C5 Begrenzung nach Mandant ueber die relationale Zuordnung",
  W.waehleKandidaten(cObjekte, { mandantIds: ["ko-mitte"] }).kandidaten.map((k) => k.id).join() === "ko-mitte");
check("C6 die Verarbeitungsreihenfolge ist deterministisch (aelteste zuerst) — Grundlage der Fortsetzbarkeit",
  W.waehleKandidaten([...cObjekte].reverse(), {}).kandidaten.map((k) => k.id).join() === "ko-alt,ko-mitte,ko-neu");
check("C7 ein leeres --ids ist ein Abbruch, kein stiller Massenlauf",
  /--ids wurde ohne verwertbare Kennung/.test(werkzeugQuelle));
check("C8 die Mandantenbegrenzung ist fail closed (0 Zuordnungen -> Abbruch statt aller Objekte)",
  /if \(!mandantIds\.length\) \{/.test(werkzeugQuelle)
  && /0 zugeordnete Wissensobjekte/.test(werkzeugQuelle) && /process\.exit\(4\)/.test(werkzeugQuelle));
check("C9 die Mandantenabfrage traegt den Pflicht-Mandantenfilter (listDecisions mit userId)",
  /listDecisions\(\{ userId: args\.mandant/.test(werkzeugQuelle));
check("C10 ein Lesefehler wird nie als 'nichts zu tun' gedeutet (eigener Exit-Code 8)",
  /catch \(error\) \{[\s\S]{0,300}process\.exit\(8\)/.test(werkzeugQuelle));
check("C10b der Bestand wird SEITENWEISE gelesen — keine stille PostgREST-Kappung bei 1 000 Zeilen (W-1)",
  /listKnowledgeObjectsSeitenweise/.test(werkzeugQuelle)
  && !/storage\.listKnowledgeObjects\(/.test(werkzeugQuelle));
check("C10c und der Bericht sagt ehrlich, wenn die Leseobergrenze erreicht wurde",
  /moeglicherweiseUnvollstaendig/.test(werkzeugQuelle));
check("C11 die Fehlerquote ist eine Abbruchschwelle mit Standardwert",
  W.parseArgs(["node", "x"]).fehlerquote === 10 && /abgebrochen = `Fehlerquote/.test(werkzeugQuelle));
check("C12 kein paralleles Bearbeiten desselben Objekts: updated_at wird vor dem Schreiben erneut geprueft",
  /getKnowledgeObjectById\(plan\.id\)/.test(werkzeugQuelle) && /aktuell\.updated_at !== vorher\.updated_at/.test(werkzeugQuelle));
check("C13 die Vorschau nennt Batchanzahl und erwartete Schreibvorgaenge",
  /erwarteteBatches/.test(werkzeugQuelle) && /schreibvorgaenge/.test(werkzeugQuelle));

// --- Zustandsfilter: unverstandene Vorgaenge bleiben unangetastet -----------
// Belegter Production-Befund (2026-07-28): alle 489 Objekte ohne decision_level
// sind pending/failed. Eine Ebene aus ihrer blossen Schlagzeile abzuleiten
// wuerde wegen der Sprint-19-Monotonie eine Vermutung zum Gedaechtnis machen.
const cGemischt = [
  { id: "ko-fertig", created_at: T0, understanding_status: "complete" },
  { id: "ko-offen", created_at: T0, understanding_status: "pending" },
  { id: "ko-kaputt", created_at: T0, understanding_status: "failed" },
  { id: "ko-leer", created_at: T0 }
];
check("C14 nur verstandene Vorgaenge werden ueberhaupt geplant",
  W.waehleKandidaten(cGemischt, {}).kandidaten.map((k) => k.id).join() === "ko-fertig",
  W.waehleKandidaten(cGemischt, {}).kandidaten.map((k) => k.id));
check("C14b die Zahl der ausgeschlossenen Objekte wird ausgewiesen, nicht verschwiegen",
  W.waehleKandidaten(cGemischt, {}).unverstandenAusgeschlossen === 3);
check("C14c auch ein gezielter --ids-Lauf klassifiziert keinen unverstandenen Vorgang",
  W.waehleKandidaten(cGemischt, { ids: ["ko-offen"] }).kandidaten.length === 0
  && W.waehleKandidaten(cGemischt, { ids: ["ko-offen"] }).unverstandenGenannt.join() === "ko-offen");
check("C14d eine so ausgeschlossene Kennung gilt NICHT als 'nicht gefunden'",
  W.waehleKandidaten(cGemischt, { ids: ["ko-offen"] }).fehlend.length === 0);

// --- Klassenweise Freigabe --------------------------------------------------
// Abnahmebedingung des Auftrags: "Nur die vorher freigegebenen Objektklassen
// wurden veraendert." Die Positivliste macht das strukturell erzwingbar.
const c15 = N.planeNachklassifikation(a1KO, { jetzt: T1, erlaubteKlassen: ["konfidenz-geografie-ehrlich"] });
check("C15 eine Klassen-Positivliste begrenzt den Schreibumfang strukturell",
  c15.patch !== null && c15.patch.affected_geographies === undefined
  && c15.patch.classification_confidence.geography === "unknown",
  c15.patch && Object.keys(c15.patch));
check("C15b ohne Positivliste bleibt das Verhalten unveraendert (alle sicheren Klassen)",
  Array.isArray(N.planeNachklassifikation(a1KO, { jetzt: T1 }).patch.affected_geographies));
check("C15c eine Positivliste ohne Treffer schreibt garantiert nichts",
  N.planeNachklassifikation(a1KO, { jetzt: T1, erlaubteKlassen: ["ebene-erstermittlung"] }).patch === null);
check("C15d eine unbekannte Klasse ist ein Abbruch, kein stilles 'alle Klassen'",
  /--klassen kennt diese Klassen nicht/.test(werkzeugQuelle) && /Object\.keys\(KLASSEN\)/.test(werkzeugQuelle));
check("C15e die Positivliste wird an die Planung durchgereicht",
  /erlaubteKlassen: args\.klassen/.test(werkzeugQuelle));

// ══════════════════════════════════════════════════════════════════════════════
// D · Protokollinhalt
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nD · Protokollinhalt");

const dPlan = N.planeNachklassifikation(a1KO, { jetzt: T1 });
const dZeile = dPlan.aenderungen.find((x) => x.klasse === "geo-ebenen-ableitung-bund");
const GEFORDERTE_ANGABEN = [
  "feld", "alterWert", "neuerWert", "grund", "herkunftVorher", "herkunftNachher",
  "vertrauenVorher", "vertrauenNachher", "kiNoetig", "automatischSicher", "manuellePruefungEmpfohlen"
];
check("D1 jede Protokollzeile traegt alle im Auftrag geforderten Angaben",
  GEFORDERTE_ANGABEN.every((f) => Object.prototype.hasOwnProperty.call(dZeile, f)),
  GEFORDERTE_ANGABEN.filter((f) => !Object.prototype.hasOwnProperty.call(dZeile || {}, f)));
check("D2 Objekt-ID und Mandantenbezug stehen am Plan (knowledge_objects ist mandantenneutral)",
  dPlan.id === a1KO.id && dPlan.vorgang_id === a1KO.vorgang_id);
check("D3 Vertrauensrang vorher/nachher sind Zahlen bzw. ausdrueckliches null",
  (dZeile.vertrauenVorher === null || typeof dZeile.vertrauenVorher === "number")
  && (dZeile.vertrauenNachher === null || typeof dZeile.vertrauenNachher === "number"));
// Ebene und Geografie haben zwei verschiedene Herkunftsskalen. Wuerde man beide
// ueber dieselbe Tabelle rechnen, erschiene der Ebenen-Deriver als Rang 2.
const d3Ebene = b8.aenderungen.find((x) => x.feld === "decision_level" && x.aenderungSchreibt);
check("D3b der Vertrauensrang wird je Achse auf der RICHTIGEN Skala gerechnet",
  d3Ebene.vertrauensskala === "ebene" && d3Ebene.vertrauenNachher === 1
  && dZeile.vertrauensskala === "geografie" && dZeile.vertrauenVorher === 2,
  { ebene: d3Ebene.vertrauenNachher, geografie: dZeile.vertrauenVorher });
check("D4 die Zusammenfassung trennt nach Aenderungsklasse und Einstufung",
  typeof N.fasseZusammen([dPlan]).jeKlasse === "object" && typeof N.fasseZusammen([dPlan]).jeEinstufung === "object");
check("D5 die Zusammenfassung zaehlt unveraenderte Objekte getrennt",
  N.fasseZusammen([a4, dPlan]).unveraendert === 1 && N.fasseZusammen([a4, dPlan]).schreibvorgaenge === 1);

// ══════════════════════════════════════════════════════════════════════════════
// E · Struktur- und Regressionsriegel
// ══════════════════════════════════════════════════════════════════════════════
console.log("\nE · Struktur- und Regressionsriegel");

check("E1 keine mandantenspezifische Sonderlogik (kein Klarname, kein Default-Mandant)",
  !/cem|ince/i.test(modulQuelle) && !/cem|ince/i.test(werkzeugQuelle));
check("E2 keine fest codierten Geografien ausser den beiden belegten Altfehlerformen",
  (modulQuelle.match(/geo-land-[a-z]+/g) || []).length === 0,
  modulQuelle.match(/geo-land-[a-z]+/g));
// Fuer Strukturriegel zaehlt der CODE, nicht der Kommentar: der Kopf dieses
// Moduls zitiert die alte Fehlfunktion absichtlich, um sie zu erklaeren.
const modulCode = modulQuelle.split("\n").filter((z) => !/^\s*\/\//.test(z)).join("\n");
check("E3 der Prozess leitet keine Geografie aus der politischen Ebene ab",
  !/level === ['"]bund['"]/.test(modulCode)
  && !/deriveAffectedGeographies/.test(modulCode),
  modulCode.split("\n").filter((z) => /deriveAffectedGeographies|level === ['"]bund['"]/.test(z)));
check("E4 die Ebene wird ausschliesslich ueber das Sprint-19-Gedaechtnis entschieden",
  /entscheideEbene\(/.test(modulQuelle) && (modulQuelle.match(/entscheideEbene\(/g) || []).length === 1);
check("E5 die Geografie wird ausschliesslich ueber das Sprint-20-Gedaechtnis entschieden",
  /entscheideGeografien\(/.test(modulQuelle) && (modulQuelle.match(/entscheideGeografien\(/g) || []).length === 1);
check("E6 es entsteht keine zweite Klassifikationslogik — die Nachweissuche ist die des Schreibpfads",
  /sammleGeografieKandidaten/.test(modulQuelle));
check("E7 keine neue Abhaengigkeit ausserhalb des Repos",
  (modulQuelle.match(/require\("([^".]+)"\)/g) || []).length === 0,
  modulQuelle.match(/require\("([^".]+)"\)/g));
check("E8 keine Migration und keine neue Spalte",
  !/alter table|create table|ADD COLUMN/i.test(modulQuelle) && !/alter table|create table/i.test(werkzeugQuelle));
check("E9 Sprint-19-Regression: das Ebenen-Gedaechtnis ist unveraendert eingebunden",
  require("../lib/helmut/quellenarchitektur/ebenen-gedaechtnis").HERKUNFT_RANG.ki
  > require("../lib/helmut/quellenarchitektur/ebenen-gedaechtnis").HERKUNFT_RANG.deriver);
check("E10 Sprint-20-Regression: die Quellengeografie kann nie eine Betroffenheit werden",
  require("../lib/helmut/quellenarchitektur/geografie-gedaechtnis").NUR_INDIZ_HERKUENFTE.has("quelle"));
check("E11 der Plan schreibt nur, wenn sich wirklich etwas aendert (kein updated_at ohne Sachgrund)",
  N.planeNachklassifikation(anwenden(a1KO, a1), { jetzt: T1 }).patch === null);
// Kein falsches Gruen: ein Vorgang ohne belegte Region darf nicht "medium"
// Geografie-Konfidenz behaupten — auch dann nicht, wenn sonst nichts zu tun ist.
const e11bKO = ko({
  decision_level: "bund", political_level: "bund", headline: "Bundestag",
  affected_geographies: [],
  classification_confidence: { geography: "medium", level: "high" }
});
const e11b = N.planeNachklassifikation(e11bKO, { jetzt: T1 });
check("E11b eine unehrliche Geografie-Konfidenz ist ein eigener Schreibgrund",
  e11b.patch && e11b.patch.classification_confidence.geography === "unknown"
  && e11b.patch.affected_geographies === undefined,
  e11b.patch && e11b.patch.classification_confidence);
check("E11c und auch das ist idempotent",
  N.planeNachklassifikation(anwenden(e11bKO, e11b), { jetzt: T1 }).patch === null,
  N.planeNachklassifikation(anwenden(e11bKO, e11b), { jetzt: T1 }).patch);
check("E12 die Nachvollziehbarkeit steht im Datensatz selbst (Klassen und Zeitpunkt im Konfidenzblock)",
  Array.isArray(a1.patch.classification_confidence.nachklassifikation_klassen)
  && typeof a1.patch.classification_confidence.nachklassifikation_am === "string");
check("E13 fremde Schluessel im Konfidenzblock bleiben erhalten",
  N.planeNachklassifikation(ko({
    decision_level: "bund", political_level: "bund", headline: "Bundestag",
    affected_geographies: [DEUTSCHLAND],
    classification_confidence: { fremder_schluessel: "bleibt" }
  }), { jetzt: T1 }).patch.classification_confidence.fremder_schluessel === "bleibt");

console.log(`\n${pass}/${pass + fail} Nachklassifikations-Assertions erfolgreich.`);
if (fail > 0) { console.error(`${fail} FEHLGESCHLAGEN`); process.exit(1); }
