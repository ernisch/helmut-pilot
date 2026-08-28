"use strict";

// Reiner Offline-Vertrag fuer das neue 200/500 Fachwegtor. Kein Netz,
// keine Datenbank, keine Prozessstarts und keine Production Kennung.

const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./fixtures/z3b-fachweg-plan");
const L = require("./skalierung-z3b-fachweg");

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}
function wirft(fn, muster) {
  try { fn(); return false; }
  catch (fehler) { return muster.test(String(fehler && fehler.message)); }
}

function azureBericht() {
  const klasse = (p95, max, input, output) => ({
    aufrufe: 7,
    dauerMs: { p95, max },
    inputTokens: { p95: input },
    outputTokens: { p95: output }
  });
  return {
    art: "Z3b Azure Laufzeit und Token Teilnachweis",
    ergebnis: "vollstaendig",
    modus: "stichprobe",
    laufKennung: "azure2101",
    deployment: "gpt5mini-prod",
    modell: "gpt-5-mini",
    deploymentart: "data-zone",
    region: "swedencentral",
    endpointHash: "123456789abc",
    aufrufe: 21,
    parallelitaet: 1,
    wiederholungen: 0,
    synthetischePrompts: true,
    productionDatenBeruehrt: false,
    datenbankBeruehrt: false,
    antwortinhalteGespeichert: false,
    storeParameter: false,
    preis: { inputUsdJeMio: 0.28, outputUsdJeMio: 2.2 },
    preisquelle: "Azure OpenAI Service Pricing",
    preisdatumUtc: "2026-08-28",
    auswertung: {
      jeKlasse: {
        understanding: klasse(2100, 2400, 4800, 360),
        lage: klasse(1700, 1900, 2100, 420),
        buero: klasse(1200, 1400, 900, 260)
      }
    }
  };
}

function tage(aktiveMandate, anzahl = 7) {
  return Array.from({ length: anzahl }, (_, index) => ({
    datumUtc: `2026-08-${String(index + 1).padStart(2, "0")}`,
    vollstaendig: true,
    aktiveMandate,
    ankunft: 300,
    abfluss: 305,
    aeltesterOffenerStunden: 2,
    unbekannt: 0,
    dubletten: 0,
    haengendeLeases: 0,
    endgueltigeFehler: 0,
    briefingFehlt: 0,
    kiDeckelErreicht: false
  }));
}

function vorstufenBericht(aktiveMandate) {
  return {
    art: "Z3b natuerlicher Production Beobachtungsnachweis",
    production: true,
    synthetisch: false,
    hochrechnung: false,
    simulation: false,
    aktiveVorstufe: aktiveMandate,
    tage: tage(aktiveMandate),
    slot: { p95Ms: 210000, maxMs: 275000 },
    codeUndMigrationen: {
      pr272Merged: true,
      pr273Merged: true,
      f9Applied: true,
      z22Applied: true,
      parserfixDeployed: true,
      planungszeitbudgetDeployed: true,
      monitoringHardeningDeployed: true,
      fuenferRegressionGruen: true
    },
    kiDeckel: {
      gesamt: aktiveMandate === 100 ? 199 : 399,
      understandingReserve: aktiveMandate === 100 ? 100 : 200,
      globalAnteil: 0.5
    }
  };
}

function main() {
  console.log("Helmut — Vertragstest Z3b Fachweg 200/500\n");

  console.log("== A · echte Azure Stichprobe ==");
  const azure = P.pruefeAzureBericht(azureBericht(), { heuteUtc: "2026-08-28" });
  check("A1 Genau 7 Werte je Arbeitsform werden uebernommen",
    Object.values(azure.klassen).every((wert) => wert.stichproben === 7));
  check("A2 Der lokale Fachweg beginnt konservativ beim langsamsten Klassen p95",
    azure.lokalesKiProfil.latenzMs === 2100 && azure.lokalesKiProfil.streuungMs === 301);
  check("A3 Eine Vorprobe statt der 21er Stichprobe wird abgelehnt",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), modus: "vorprobe", aufrufe: 3 },
      { heuteUtc: "2026-08-28" }), /vollstaendige Z3b Stichprobe/));
  const zuWenig = azureBericht(); zuWenig.auswertung.jeKlasse.lage.aufrufe = 6;
  check("A4 Weniger als 7 Werte einer Arbeitsform werden abgelehnt",
    wirft(() => P.pruefeAzureBericht(zuWenig, { heuteUtc: "2026-08-28" }), /genau 7/));
  check("A5 Eine veraltete Stichprobe wird nicht still weiterverwendet",
    wirft(() => P.pruefeAzureBericht(azureBericht(), { heuteUtc: "2026-09-05" }), /aelter als 7/));
  check("A6 Fehlende sichere Dateneigenschaften brechen ab",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), storeParameter: true },
      { heuteUtc: "2026-08-28" }), /sicheren Datenvertrag/));
  check("A7 Unbelegte Deploymentart wird abgelehnt",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), deploymentart: "unbekannt" },
      { heuteUtc: "2026-08-28" }), /Deploymentart/));
  check("A8 Ohne belegte Tagespreise wird der Bericht abgelehnt",
    wirft(() => P.pruefeAzureBericht({ ...azureBericht(), preisquelle: "" },
      { heuteUtc: "2026-08-28" }), /Preisquelle/));
  const ohneModell = azureBericht(); delete ohneModell.modell;
  check("A9 Ein fehlender oder anderer Modelltyp wird abgelehnt",
    wirft(() => P.pruefeAzureBericht(ohneModell, { heuteUtc: "2026-08-28" }), /Modelltyp.*gpt-5-mini/)
      && wirft(() => P.pruefeAzureBericht({ ...azureBericht(), modell: "gpt-5" },
        { heuteUtc: "2026-08-28" }), /Modelltyp.*gpt-5-mini/));

  console.log("\n== B · natuerliches Vorstufentor ==");
  const vor200 = P.pruefeVorstufenBericht(vorstufenBericht(100), 200);
  check("B1 Fachweg 200 verlangt und akzeptiert genau die natuerliche Vorstufe 100",
    vor200.vorstufe === 100 && vor200.beobachtung.tage === 7);
  const vor500 = P.pruefeVorstufenBericht(vorstufenBericht(200), 500);
  check("B2 Fachweg 500 verlangt und akzeptiert genau die natuerliche Vorstufe 200",
    vor500.vorstufe === 200 && vor500.beobachtung.tage === 7);
  check("B3 Sieben Tage der falschen Vorstufe reichen nicht",
    wirft(() => P.pruefeVorstufenBericht(vorstufenBericht(100), 500), /Vorstufe 200/));
  const simuliert = { ...vorstufenBericht(100), simulation: true };
  check("B4 Simulation kann das Tor nicht oeffnen",
    wirft(() => P.pruefeVorstufenBericht(simuliert, 200), /natuerlicher Production/));
  const hochgerechnet = { ...vorstufenBericht(100), hochrechnung: true };
  check("B5 Hochrechnung kann das Tor nicht oeffnen",
    wirft(() => P.pruefeVorstufenBericht(hochgerechnet, 200), /natuerlicher Production/));
  const sechs = vorstufenBericht(100); sechs.tage = tage(100, 6);
  check("B6 Sechs Tage bleiben unzureichend",
    wirft(() => P.pruefeVorstufenBericht(sechs, 200), /mindestens 7/));
  const rueckstau = vorstufenBericht(100); rueckstau.tage[3].abfluss = 299;
  check("B7 Ein roter natuerlicher Tag sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(rueckstau, 200), /nicht vollstaendig gruen/));
  const slotRot = vorstufenBericht(100); slotRot.slot.p95Ms = 218000;
  check("B8 Fehlende Slotreserve sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(slotRot, 200), /Slotreserve/));
  const migrationOffen = vorstufenBericht(100); migrationOffen.codeUndMigrationen.z22Applied = false;
  check("B9 Offene Code oder Migrationspflichten sperren den Lauf",
    wirft(() => P.pruefeVorstufenBericht(migrationOffen, 200), /nicht vollstaendig/));
  const parserfixOffen = vorstufenBericht(100); parserfixOffen.codeUndMigrationen.parserfixDeployed = false;
  check("B10 Ein nicht deployter Parserfix sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(parserfixOffen, 200), /nicht vollstaendig/));
  const planungOffen = vorstufenBericht(100); planungOffen.codeUndMigrationen.planungszeitbudgetDeployed = false;
  check("B11 Eine nicht deployte Planungszeitbudget Haertung sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(planungOffen, 200), /nicht vollstaendig/));
  const monitoringOffen = vorstufenBericht(100); monitoringOffen.codeUndMigrationen.monitoringHardeningDeployed = false;
  check("B12 Eine nicht deployte Monitoring Haertung sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(monitoringOffen, 200), /nicht vollstaendig/));
  const deckelZuKlein = vorstufenBericht(100); deckelZuKlein.kiDeckel.gesamt = 198;
  check("B13 Ein Deckel unter der Fairness Untergrenze der Vorstufe sperrt den Lauf",
    wirft(() => P.pruefeVorstufenBericht(deckelZuKlein, 200), /Fairness Untergrenze 199/));

  console.log("\n== C · exakt ein neuer Fachweg je Freigabe ==");
  check("C1 Erlaubt sind nur die bisher ungemessenen Stufen 200 und 500",
    P.stufe(200) === 200 && P.stufe(500) === 500 && wirft(() => P.stufe(100), /200 oder 500/));
  check("C2 Die Freigabe bindet Ziel und Laufkennung",
    P.laufFreigabe(200, "fachweg01") === "z3b-fachweg:200:fachweg01");
  const kindKontrolle = P.kindUmgebung({
    env: { HELMUT_TEST_PG_HOST: "127.0.0.1" }, zielStufe: 200,
    laufKennung: "fachweg01", azure,
    berichtDatei: "/tmp/kontrolle.json", logDatei: "/tmp/kontrolle.log"
  });
  check("C3 Ein Kindprozess bekommt genau eine Stufe und sechs Slots",
    kindKontrolle.HELMUT_Z3_STUFEN === "200" && kindKontrolle.HELMUT_Z3_MAX_SLOTS === "6");
  check("C4 Der Kontrolllauf hat kein Fehlermandat und keinen Vergleich",
    kindKontrolle.HELMUT_Z3_FEHLERMANDAT === "aus" && kindKontrolle.HELMUT_Z3_VERGLEICH === "");
  check("C5 Azure p95 und Maximum werden als lokales Laufzeitprofil gesetzt",
    kindKontrolle.HELMUT_Z3_KI_LATENZ_MS === "2100"
      && kindKontrolle.HELMUT_Z3_KI_STREUUNG_MS === "301");
  const kindFehler = P.kindUmgebung({
    env: {}, zielStufe: 200, laufKennung: "fachweg01", azure,
    berichtDatei: "/tmp/fehler.json", logDatei: "/tmp/fehler.log",
    vergleichDatei: "/tmp/kontrolle.json", fehlerMandat: true
  });
  check("C6 Der zweite Lauf bindet das Fehlermandat an genau den Kontrollbericht",
    kindFehler.HELMUT_Z3_FEHLERMANDAT === "an"
      && kindFehler.HELMUT_Z3_VERGLEICH === "/tmp/kontrolle.json");
  check("C7 Das lokale KI Aufruflimit bleibt endlich",
    Number(kindFehler.HELMUT_Z3_KI_HOECHSTZAHL) === 5000);

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
    const konfiguration = L.liesKonfiguration(env, { heuteUtc: "2026-08-28" });
    check("D1 Vollstaendige Belege machen nur die Konfiguration bereit",
      konfiguration.ziel === 200 && konfiguration.ausgabe === ausgabe && !fs.existsSync(ausgabe));
    check("D2 Schon eine abweichende Freigabe verhindert jede Ausgabe",
      wirft(() => L.liesKonfiguration({ ...env, HELMUT_Z3B_FACHWEG_FREIGABE: "falsch" },
        { heuteUtc: "2026-08-28" }), /nicht stufen und laufbezogen/));
    fs.mkdirSync(ausgabe);
    check("D3 Ein vorhandenes Ziel wird niemals ueberschrieben",
      wirft(() => L.liesKonfiguration(env, { heuteUtc: "2026-08-28" }), /noch nicht vorhandenes/));
    check("D4 Belegfingerabdruecke sind stabil und inhaltsabhaengig",
      P.dateiFingerabdruck("a") === P.dateiFingerabdruck("a")
        && P.dateiFingerabdruck("a") !== P.dateiFingerabdruck("b"));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\nPASS ${pass}  FAIL ${fail}`);
  process.exitCode = fail ? 1 : 0;
}

main();
