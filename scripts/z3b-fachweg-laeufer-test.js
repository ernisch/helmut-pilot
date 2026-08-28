"use strict";

// Reiner Offline-Vertrag fuer das neue 200/500 Fachwegtor. Kein Netz,
// keine Datenbank, keine Prozessstarts und keine Production Kennung.

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const P = require("./fixtures/z3b-fachweg-plan");
const A = require("./fixtures/z3b-azure-bericht");
const L = require("./skalierung-z3b-fachweg");

let pass = 0;
let fail = 0;
const JETZT = new Date("2026-08-28T23:59:59.000Z");
const HEUTE_UTC = "2026-08-28";
const TAG_MS = 24 * 60 * 60 * 1000;
const SLOT_IDS = Object.freeze(Array.from({ length: 20 }, (_, index) =>
  `slot-${String(index + 1).padStart(2, "0")}`));
function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}
function wirft(fn, muster) {
  try { fn(); return false; }
  catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

function hash(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function verteilung(werte) {
  const sortiert = [...werte].sort((a, b) => a - b);
  const q = (p) => sortiert[Math.min(sortiert.length - 1, Math.floor(p * (sortiert.length - 1)))];
  return {
    n: sortiert.length,
    min: sortiert[0],
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: sortiert[sortiert.length - 1],
    mittel: Math.round(sortiert.reduce((summe, wert) => summe + wert, 0) / sortiert.length * 10) / 10
  };
}

function azureMessblock(dauern, inputs, outputs, preis) {
  const input = inputs.reduce((summe, wert) => summe + wert, 0);
  const output = outputs.reduce((summe, wert) => summe + wert, 0);
  const usage = { input, output, total: input + output, cached: 0, reasoning: 0 };
  return {
    aufrufe: dauern.length,
    dauerMs: verteilung(dauern),
    inputTokens: verteilung(inputs),
    outputTokens: verteilung(outputs),
    usage,
    kostenGeschaetztUsd: Math.round(
      ((input / 1e6) * preis.inputUsdJeMio + (output / 1e6) * preis.outputUsdJeMio) * 1e8
    ) / 1e8
  };
}

function azureBericht() {
  const preis = { inputUsdJeMio: 0.28, outputUsdJeMio: 2.2 };
  const roh = {
    understanding: {
      dauern: [2100, 2100, 2100, 2100, 2100, 2100, 2400],
      inputs: Array(7).fill(4800), outputs: Array(7).fill(360)
    },
    lage: {
      dauern: [1700, 1700, 1700, 1700, 1700, 1700, 1900],
      inputs: Array(7).fill(2100), outputs: Array(7).fill(420)
    },
    buero: {
      dauern: [1200, 1200, 1200, 1200, 1200, 1200, 1400],
      inputs: Array(7).fill(900), outputs: Array(7).fill(260)
    }
  };
  const jeKlasse = Object.fromEntries(Object.entries(roh).map(([klasse, wert]) => [
    klasse, azureMessblock(wert.dauern, wert.inputs, wert.outputs, preis)
  ]));
  const alle = (feld) => Object.values(roh).flatMap((wert) => wert[feld]);
  const einzelmessungen = Object.entries(roh).flatMap(([klasse, wert]) => (
    wert.dauern.map((dauerMs, index) => ({
      runId: `azure2101:${klasse}:${index + 1}`,
      klasse,
      dauerMs,
      usage: {
        input: wert.inputs[index], output: wert.outputs[index],
        total: wert.inputs[index] + wert.outputs[index], cached: 0, reasoning: 0
      }
    }))
  ));
  return {
    schemaVersion: A.SCHEMA_VERSION,
    art: A.ART,
    ergebnis: A.ERGEBNIS_FORMAL,
    modus: "stichprobe",
    laufKennung: "azure2101",
    erhobenUtc: "2026-08-28T12:00:00.000Z",
    beendetUtc: "2026-08-28T12:02:00.000Z",
    deployment: "gpt5mini-prod",
    modell: "gpt-5-mini",
    deploymentart: "data-zone",
    region: "swedencentral",
    endpointHash: "1".repeat(64),
    aufrufe: 21,
    parallelitaet: 1,
    wiederholungen: 0,
    dauerGesamtMs: 120000,
    synthetischePrompts: true,
    productionDatenBeruehrt: false,
    datenbankBeruehrt: false,
    quellenanbieterAufrufe: 0,
    antwortinhalteGespeichert: false,
    storeParameter: false,
    preis,
    preisquelle: "Azure OpenAI Service Pricing",
    preisdatumUtc: "2026-08-28",
    kostenlimitUsd: 0.25,
    konservativeKostenobergrenzeVorherUsd: 0.2,
    einzelmessungen,
    auswertung: {
      gesamt: azureMessblock(alle("dauern"), alle("inputs"), alle("outputs"), preis),
      jeKlasse
    }
  };
}

function azureOptionen(heuteUtc = "2026-08-28") {
  return { heuteUtc, jetzt: new Date(`${heuteUtc}T23:59:59.000Z`) };
}

function datum(index, start = "2026-08-21") {
  return new Date(Date.parse(`${start}T00:00:00.000Z`) + index * TAG_MS).toISOString().slice(0, 10);
}

function vorstufenTag(aktiveMandate, index, { transport = "sqs", start = "2026-08-21" } = {}) {
  const tag = datum(index, start);
  const slots = SLOT_IDS.map((slotId, slotIndex) => ({
    slotId,
    runId: `slotrun-${tag}-${slotIndex + 1}`,
    dauerMs: 100000 + slotIndex * 1000,
    ausloeser: "cron",
    natuerlich: true,
    vollstaendig: true
  }));
  const weckquittungen = slots.map((slot, slotIndex) => ({
    quittungId: `wakeq-${tag}-${slotIndex + 1}`,
    slotId: slot.slotId,
    ausloeserRunId: slot.runId,
    weckRunId: `wakerun-${tag}-${slotIndex + 1}`,
    transport,
    natuerlich: true,
    vollstaendig: true,
    angenommen: true,
    verarbeitet: true,
    doppelt: false
  }));
  return {
    datumUtc: tag,
    vonUtc: `${tag}T00:00:00.000Z`,
    bisUtcExklusiv: new Date(Date.parse(`${tag}T00:00:00.000Z`) + TAG_MS).toISOString(),
    vollstaendig: true,
    natuerlich: true,
    aktiveMandate,
    aktiveMandatsmengenSha256: hash(`mandatsmenge-${aktiveMandate}`),
    gitSha: "a".repeat(40),
    deployment: "dpl_StrictFachwegProof",
    migrationenSha256: hash("migrationen-1"),
    konfigurationSha256: hash(`konfiguration-${aktiveMandate}-${transport}`),
    rohwerteSha256: hash(`rohwerte-${tag}-${index}`),
    runIds: [...slots.map((slot) => slot.runId), ...weckquittungen.map((q) => q.weckRunId)],
    zaehler: {
      offenAnfang: 5,
      ankunft: 100,
      abfluss: 100,
      offenEnde: 5,
      endgueltigeFehler: 0,
      unbekannt: 0,
      dubletten: 0,
      haengendeLeases: 0,
      briefingFehlt: 0,
      kiDeckelErreicht: false
    },
    aeltesterOffenerStunden: 2,
    slots,
    weckquittungen
  };
}

function vorstufenBericht(aktiveMandate, { start = "2026-08-21" } = {}) {
  return {
    schema: "z3b-production-beobachtung/v1",
    art: "Z3b strenger Production Beobachtungsbericht",
    production: true,
    synthetisch: false,
    simulation: false,
    hochrechnung: false,
    erhobenUtc: "2026-08-28T00:05:00.000Z",
    aktiveStufe: aktiveMandate,
    erwarteteSlotIds: [...SLOT_IDS],
    ereignistransport: "sqs",
    tage: Array.from({ length: 7 }, (_, index) => vorstufenTag(aktiveMandate, index, { start }))
  };
}

function vorstufenOptionen({ slotplan = true } = {}) {
  return {
    jetzt: JETZT,
    heuteUtc: HEUTE_UTC,
    ...(slotplan ? { vertrauenswuerdigeSlotIds: SLOT_IDS } : {})
  };
}

async function main() {
  console.log("Helmut — Vertragstest Z3b Fachweg 200/500\n");

  console.log("== A · echte Azure Stichprobe ==");
  const azure = P.pruefeAzureBericht(azureBericht(), azureOptionen());
  check("A1 Genau 7 Werte je Arbeitsform werden uebernommen",
    Object.values(azure.klassen).every((wert) => wert.stichproben === 7)
      && azure.gesamt.aufrufe === 21 && azure.laufKennung === "azure2101"
      && azure.erhobenUtc === "2026-08-28T12:00:00.000Z");
  check("A2 Der lokale Fachweg beginnt konservativ beim langsamsten Klassen p95",
    azure.lokalesKiProfil.latenzMs === 2100 && azure.lokalesKiProfil.streuungMs === 301);
  check("A3 Eine Vorprobe statt der 21er Stichprobe wird abgelehnt",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), modus: "vorprobe", aufrufe: 3 },
      azureOptionen()), /versionierten Stichprobenvertrag|21er Vertrag/));
  const zuWenig = azureBericht();
  zuWenig.einzelmessungen.find((messung) => messung.klasse === "lage").klasse = "understanding";
  check("A4 Weniger als 7 Werte einer Arbeitsform werden abgelehnt",
    wirft(() => P.pruefeAzureBericht(zuWenig, azureOptionen()), /exakt 7/));
  check("A5 Eine veraltete Stichprobe wird nicht still weiterverwendet",
    wirft(() => P.pruefeAzureBericht(azureBericht(), azureOptionen("2026-09-05")), /aelter als 7/));
  check("A6 Fehlende sichere Dateneigenschaften brechen ab",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), storeParameter: true },
      azureOptionen()), /sicheren Datenvertrag/));
  check("A7 Unbelegte Deploymentart wird abgelehnt",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), deploymentart: "unbekannt" },
      azureOptionen()), /Deployment|Region|Zielfingerabdruck/));
  check("A8 Ohne belegte Tagespreise wird der Bericht abgelehnt",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), preisquelle: "" },
      azureOptionen()), /Preisquelle/));
  const ohneModell = azureBericht(); delete ohneModell.modell;
  check("A9 Ein fehlender oder anderer Modelltyp wird abgelehnt",
    wirft(() => P.pruefeAzureBericht(ohneModell, azureOptionen()), /fehlt: modell|Modelltyp.*gpt-5-mini/)
      && wirft(() => P.pruefeAzureBericht({ ...azureBericht(), modell: "gpt-5" },
        azureOptionen()), /Modelltyp.*gpt-5-mini/));
  check("A10 Eine fehlende oder ungueltige Laufkennung wird abgelehnt",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), laufKennung: "FALSCH" },
      azureOptionen()), /Laufkennung/));
  check("A11 Ohne echten UTC Erhebungszeitpunkt gibt es keinen Beleg",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), erhobenUtc: "" },
      azureOptionen()), /Laufbeginn/));
  check("A12 Preisdatum und Erhebungstag muessen deckungsgleich sein",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), preisdatumUtc: "2026-08-27" },
      azureOptionen()), /Preisdatum.*UTC Lauftag/));
  const falschesN = azureBericht(); falschesN.auswertung.jeKlasse.lage.inputTokens.n = 6;
  check("A13 Jede Laufzeit und Tokenverteilung braucht ihr exaktes n",
    wirft(() => P.pruefeAzureBericht(falschesN, azureOptionen()), /\.n ist falsch/));
  const nichtMonoton = azureBericht();
  nichtMonoton.auswertung.jeKlasse.buero.outputTokens.p95 =
    nichtMonoton.auswertung.jeKlasse.buero.outputTokens.max + 1;
  check("A14 Nicht aus Einzelmessungen ableitbare Verteilungen werden abgelehnt",
    wirft(() => P.pruefeAzureBericht(nichtMonoton, azureOptionen()), /Aggregate/));
  const usageWiderspruch = azureBericht();
  usageWiderspruch.auswertung.gesamt.usage.cached = 1;
  check("A15 Gesamt Usage muss exakt der Summe der drei Klassen entsprechen",
    wirft(() => P.pruefeAzureBericht(usageWiderspruch, azureOptionen()), /Aggregate/));
  check("A16 Schon ein Quellenanbieteraufruf verletzt den sicheren Datenvertrag",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), quellenanbieterAufrufe: 1 },
      azureOptionen()), /sicheren Datenvertrag/));
  check("A17 Region und Zielfingerabdruck sind zwingende Berichtsfelder",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), region: "" },
      azureOptionen()), /Region/)
      && wirft(() => P.pruefeAzureBericht({ ...azureBericht(), endpointHash: "" },
        azureOptionen()), /Zielfingerabdruck/));
  check("A18 Null, Boolean und Leerstring werden nie als Zahlen umgedeutet",
    [null, true, false, "", "   "].every((ungueltig) => {
      const bericht = azureBericht();
      bericht.auswertung.jeKlasse.understanding.dauerMs.min = ungueltig;
      bericht.auswertung.gesamt.dauerMs.min = ungueltig;
      return wirft(() => P.pruefeAzureBericht(bericht, azureOptionen()), /sichere Ganzzahl/);
    }));
  check("A19 Quellenanbieteraufrufe brauchen eine echte Ganzzahl statt Nullkonvertierung",
    [null, false, ""].every((ungueltig) => wirft(() => P.pruefeAzureBericht({
      ...azureBericht(), quellenanbieterAufrufe: ungueltig
    }, azureOptionen()), /Quellenanbieteraufrufe.*sichere Ganzzahl/)));
  check("A20 Die 21 Run IDs muessen eindeutig sein", (() => {
    const doppelt = azureBericht();
    doppelt.einzelmessungen[1].runId = doppelt.einzelmessungen[0].runId;
    return wirft(() => P.pruefeAzureBericht(doppelt, azureOptionen()), /eindeutigen Run IDs/);
  })());
  check("A21 Eine manipulierte Einzelmessung ohne neu berechnete Aggregate bleibt rot", (() => {
    const manipuliert = azureBericht();
    manipuliert.einzelmessungen[0].dauerMs += 1;
    return wirft(() => P.pruefeAzureBericht(manipuliert, azureOptionen()), /Aggregate/);
  })());

  console.log("\n== B · natuerliches Vorstufentor ==");
  const vor200 = P.pruefeVorstufenBericht(vorstufenBericht(100), 200, vorstufenOptionen());
  check("B1 Fachweg 200 prueft intern genau die natuerliche Vorstufe 100",
    vor200.vorstufe === 100 && vor200.beobachtung.tage === 7
      && vor200.beobachtung.slotplanSeparatEingebunden === true);
  const vor500 = P.pruefeVorstufenBericht(vorstufenBericht(200), 500, vorstufenOptionen());
  check("B2 Fachweg 500 prueft intern genau die natuerliche Vorstufe 200",
    vor500.vorstufe === 200 && vor500.beobachtung.tage === 7);
  check("B3 Sieben Tage der falschen Vorstufe reichen nicht",
    wirft(() => P.pruefeVorstufenBericht(vorstufenBericht(100), 500, vorstufenOptionen()), /Vorstufe 200/));
  const simuliert = { ...vorstufenBericht(100), simulation: true };
  check("B4 Simulation kann das Tor nicht oeffnen",
    wirft(() => P.pruefeVorstufenBericht(simuliert, 200, vorstufenOptionen()), /natuerlicher Bericht/));
  const hochgerechnet = { ...vorstufenBericht(100), hochrechnung: true };
  check("B5 Hochrechnung kann das Tor nicht oeffnen",
    wirft(() => P.pruefeVorstufenBericht(hochgerechnet, 200, vorstufenOptionen()), /natuerlicher Bericht/));
  const sechs = vorstufenBericht(100); sechs.tage.pop();
  check("B6 Sechs Tage bleiben unzureichend",
    wirft(() => P.pruefeVorstufenBericht(sechs, 200, vorstufenOptionen()), /exakt 7/));
  const fehlerTag = vorstufenBericht(100); fehlerTag.tage[3].zaehler.endgueltigeFehler = 1;
  check("B7 Ein roter natuerlicher Tag sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(fehlerTag, 200, vorstufenOptionen()), /intern nicht vollstaendig gruen/));
  const slotRot = vorstufenBericht(100);
  slotRot.tage[0].slots[18].dauerMs = 218000;
  slotRot.tage[0].slots[19].dauerMs = 219000;
  check("B8 Fehlende Slotreserve sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(slotRot, 200, vorstufenOptionen()), /intern nicht vollstaendig gruen/));
  const selbstDeklariert = vorstufenBericht(100);
  selbstDeklariert.codeUndMigrationen = { pr272Merged: true, z22Applied: true };
  check("B9 Selbst deklarierte Merge und Migrationsbooleans sind kein Vertragsfeld",
    wirft(() => P.pruefeVorstufenBericht(selbstDeklariert, 200, vorstufenOptionen()), /unbekannte Felder/));
  check("B10 Ohne separat gebundenen Slotplan bleibt die Vorstufe gesperrt",
    wirft(() => P.pruefeVorstufenBericht(vorstufenBericht(100), 200,
      vorstufenOptionen({ slotplan: false })), /separat vertrauenswuerdigen Slotplan/));
  check("B11 Ein altes statt unmittelbar abgeschlossenes Siebentagefenster wird abgelehnt",
    wirft(() => P.pruefeVorstufenBericht(vorstufenBericht(100, { start: "2026-08-20" }), 200,
      vorstufenOptionen()), /UTC Position/));
  const eigenerSlotplan = vorstufenBericht(100); eigenerSlotplan.erwarteteSlotIds = [SLOT_IDS[0]];
  eigenerSlotplan.tage.forEach((tag) => {
    tag.slots = [tag.slots[0]];
    tag.weckquittungen = [tag.weckquittungen[0]];
    tag.runIds = [tag.slots[0].runId, tag.weckquittungen[0].weckRunId];
  });
  check("B12 Eine selbst verkleinerte Slotmenge kann den separaten Slotplan nicht ersetzen",
    wirft(() => P.pruefeVorstufenBericht(eigenerSlotplan, 200, vorstufenOptionen()), /Slotplan/));
  check("B13 Auch intern gruene Vorstufentage behaupten keine externe Herkunft oder Startfreigabe",
    vor200.externeHerkunftBewiesen === false
      && vor200.codeUndMigrationsvollzugExternBewiesen === false
      && vor200.startfreigabe === false);

  console.log("\n== C · exakt ein neuer Fachweg je Freigabe ==");
  check("C1 Erlaubt sind nur die bisher ungemessenen Stufen 200 und 500",
    P.stufe(200) === 200 && P.stufe("500") === 500
      && [100, [200], "200.0"].every((wert) => wirft(() => P.stufe(wert), /200 oder 500/)));
  check("C2 Die Freigabe bindet Ziel und Laufkennung",
    P.laufFreigabe(200, "fachweg01") === "z3b-fachweg:200:fachweg01");
  const kindKontrolle = P.kindUmgebung({
    env: { HELMUT_TEST_PG_HOST: "127.0.0.1", CALLMEBOT_APIKEY: "geheim",
      HELMUT_GOOGLE_NEWS_MAX_ITEMS: "1", CRAWLER_CONCURRENCY: "99" }, zielStufe: 200,
    laufKennung: "fachweg01", azure,
    azureBelegSha256: "a".repeat(64), vorstufenBelegSha256: "b".repeat(64),
    berichtDatei: "/tmp/kontrolle.json", logDatei: "/tmp/kontrolle.log"
  });
  check("C3 Ein Kindprozess bekommt genau eine Stufe und sechs Slots",
    kindKontrolle.HELMUT_Z3_STUFEN === "200" && kindKontrolle.HELMUT_Z3_MAX_SLOTS === "6"
      && kindKontrolle.HELMUT_Z3B_FACHWEG_KI_MODELL === "gpt-5-mini"
      && kindKontrolle.HELMUT_Z3B_FACHWEG_AZURE_BELEG_SHA256 === "a".repeat(64)
      && kindKontrolle.HELMUT_Z3B_FACHWEG_VORSTUFEN_BELEG_SHA256 === "b".repeat(64));
  check("C4 Kontrollkind erbt weder Secret noch Quellen oder Parallelitaetsoverride",
    kindKontrolle.HELMUT_Z3_FEHLERMANDAT === "aus" && kindKontrolle.HELMUT_Z3_VERGLEICH === ""
      && kindKontrolle.HELMUT_Z3B_FACHWEG_KONTROLL_BELEG_SHA256 === ""
      && !("CALLMEBOT_APIKEY" in kindKontrolle)
      && !("HELMUT_GOOGLE_NEWS_MAX_ITEMS" in kindKontrolle)
      && !("CRAWLER_CONCURRENCY" in kindKontrolle));
  check("C5 Azure p95 und Maximum werden als lokales Laufzeitprofil gesetzt",
    kindKontrolle.HELMUT_Z3_KI_LATENZ_MS === "2100"
      && kindKontrolle.HELMUT_Z3_KI_STREUUNG_MS === "301");
  const kindFehler = P.kindUmgebung({
    env: {}, zielStufe: 200, laufKennung: "fachweg01", azure,
    azureBelegSha256: "a".repeat(64), vorstufenBelegSha256: "b".repeat(64),
    berichtDatei: "/tmp/fehler.json", logDatei: "/tmp/fehler.log",
    vergleichDatei: "/tmp/kontrolle.json", kontrollBelegSha256: "c".repeat(64),
    fehlerMandat: true
  });
  check("C6 Der zweite Lauf bindet Fehlermandat, Kontrollbericht und vollen Kontrollhash",
    kindFehler.HELMUT_Z3_FEHLERMANDAT === "an"
      && kindFehler.HELMUT_Z3_VERGLEICH === "/tmp/kontrolle.json"
      && kindFehler.HELMUT_Z3B_FACHWEG_KONTROLL_BELEG_SHA256 === "c".repeat(64));
  const kind500 = P.kindUmgebung({ env: {}, zielStufe: 500, laufKennung: "fachweg02", azure,
    azureBelegSha256: "a".repeat(64), vorstufenBelegSha256: "b".repeat(64),
    berichtDatei: "/tmp/500.json", logDatei: "/tmp/500.log" });
  check("C7 Die lokalen KI Aufruflimits sind zielgebunden, endlich und exakt",
    kindFehler.HELMUT_Z3_KI_HOECHSTZAHL === "5000"
      && kind500.HELMUT_Z3_KI_HOECHSTZAHL === "10000");

  console.log("\n== D · Dateibelege und keine stille Ausfuehrung ==");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-z3b-fachweg-test-"));
  try {
    const azurePfad = path.join(tmp, "azure.json");
    const vorPfad = path.join(tmp, "vorstufe.json");
    fs.writeFileSync(azurePfad, JSON.stringify(azureBericht()), "utf8");
    fs.writeFileSync(vorPfad, JSON.stringify(vorstufenBericht(100)), "utf8");
    const ausgabe = path.join(tmp, "beleg");
    const env = {
      HELMUT_Z3B_FACHWEG_STUFE: "200",
      HELMUT_Z3B_FACHWEG_LAUF: "fachweg01",
      HELMUT_Z3B_FACHWEG_FREIGABE: "z3b-fachweg:200:fachweg01",
      HELMUT_Z3B_FACHWEG_AZURE_BERICHT: azurePfad,
      HELMUT_Z3B_FACHWEG_VORSTUFEN_BERICHT: vorPfad,
      HELMUT_Z3B_FACHWEG_VERZEICHNIS: ausgabe
    };
    const formal = L.pruefeEingangsbelege(env, vorstufenOptionen());
    check("D1 Vollstaendige Dateien werden nur formal geprueft und mit vollen Hashes gebunden",
      formal.ziel === 200 && formal.azureBeleg.hash.length === 64
        && formal.vorstufenBeleg.hash.length === 64
        && formal.azure.externeHerkunftBewiesen === false
        && formal.vorstufe.externeHerkunftBewiesen === false && !fs.existsSync(ausgabe));
    check("D2 Intern konsistente Belege oeffnen das Tor ohne externe Herkunft nie",
      wirft(() => L.liesKonfiguration(env, vorstufenOptionen()), /Azure.*extern|externe Herkunft/)
        && !fs.existsSync(ausgabe));
    let startGesperrt = false;
    try { await L.fuehreAus({ ausgabe }); }
    catch (fehler) { startGesperrt = /konstruktiv gesperrt/.test(String(fehler && fehler.message)); }
    check("D3 Auch ein direkt gebautes Konfigurationsobjekt kann keinen Prozessstart ausloesen",
      startGesperrt && !fs.existsSync(ausgabe) && L.EXTERNE_STARTVERIFIER_AKTIV === false);
    check("D4 Belegfingerabdruecke sind volle stabile und inhaltsabhaengige SHA256",
      P.dateiFingerabdruck("a") === P.dateiFingerabdruck("a")
        && P.dateiFingerabdruck("a") !== P.dateiFingerabdruck("b")
        && P.dateiFingerabdruck("a").length === 64);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((fehler) => {
  console.error(fehler && fehler.stack || fehler);
  process.exitCode = 1;
});
