"use strict";

// Reine Vorpruefung fuer die neuen Fachwegmessungen 200 und 500.
// Kein Netz, keine Datenbank und keine Prozessstarts. Das Modul entscheidet nur,
// ob die zwei bereits getrennt belegten Voraussetzungen echt vorliegen:
//   1. die vollstaendige Azure Stichprobe mit 7 Werten je Arbeitsform,
//   2. sieben natuerliche Production Tage der unmittelbar vorherigen Stufe.

const crypto = require("crypto");
const K = require("./z3b-kapazitaetsauswertung");

const STUFEN = Object.freeze([200, 500]);
const VORSTUFE = Object.freeze({ 200: 100, 500: 200 });
const KLASSEN = Object.freeze(["understanding", "lage", "buero"]);
const AZURE_MODUS = "stichprobe";
const AZURE_AUFRUFE = 21;
const AZURE_JE_KLASSE = 7;
const AZURE_MAX_ALTER_TAGE = 7;
const TAG_MS = 24 * 60 * 60 * 1000;

function objekt(wert, name) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) {
    throw new Error(`${name} fehlt oder ist kein Objekt`);
  }
  return wert;
}

function zahl(wert, name, { minimum = 0, ganz = false } = {}) {
  const n = Number(wert);
  if (!Number.isFinite(n) || n < minimum || (ganz && !Number.isInteger(n))) {
    throw new Error(`${name} ist keine gueltige Zahl`);
  }
  return n;
}

function utcTag(wert, name) {
  const text = String(wert || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} ist kein UTC Datum`);
  const zeit = Date.parse(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(zeit) || new Date(zeit).toISOString().slice(0, 10) !== text) {
    throw new Error(`${name} ist kein gueltiges UTC Datum`);
  }
  return Object.freeze({ text, zeit });
}

function stufe(wert) {
  const n = Number(wert);
  if (!STUFEN.includes(n)) throw new Error("Z3b Fachwegstufe muss genau 200 oder 500 sein");
  return n;
}

function dateiFingerabdruck(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 16);
}

function pruefeAzureBericht(bericht, { heuteUtc = new Date().toISOString().slice(0, 10) } = {}) {
  const b = objekt(bericht, "Azure Bericht");
  if (b.art !== "Z3b Azure Laufzeit und Token Teilnachweis"
      || b.ergebnis !== "vollstaendig" || b.modus !== AZURE_MODUS) {
    throw new Error("Azure Bericht ist keine vollstaendige Z3b Stichprobe");
  }
  if (zahl(b.aufrufe, "Azure Aufrufe", { ganz: true }) !== AZURE_AUFRUFE
      || zahl(b.parallelitaet, "Azure Parallelitaet", { ganz: true }) !== 1
      || zahl(b.wiederholungen, "Azure Wiederholungen", { ganz: true }) !== 0) {
    throw new Error("Azure Stichprobe hat nicht den freigegebenen 21er Vertrag");
  }
  if (b.synthetischePrompts !== true || b.productionDatenBeruehrt !== false
      || b.datenbankBeruehrt !== false || b.antwortinhalteGespeichert !== false
      || b.storeParameter !== false) {
    throw new Error("Azure Stichprobe hat keinen sicheren Datenvertrag");
  }
  if (!/^(global|data-zone|regional)$/.test(String(b.deploymentart || ""))
      || !/^[a-z][a-z0-9]{1,31}$/.test(String(b.region || ""))) {
    throw new Error("Azure Deploymentart oder Region ist nicht belegt");
  }
  if (b.modell !== "gpt-5-mini") {
    throw new Error("Azure Modelltyp gpt-5-mini ist nicht belegt");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(String(b.deployment || ""))
      || !/^[a-f0-9]{12}$/.test(String(b.endpointHash || ""))) {
    throw new Error("Azure Deployment oder Zielfingerabdruck ist nicht belegt");
  }
  const preis = objekt(b.preis, "Azure Preis");
  const preisquelle = String(b.preisquelle || "").trim();
  if (preisquelle.length < 5) throw new Error("Azure Preisquelle ist nicht belegt");
  const preisWerte = Object.freeze({
    inputUsdJeMio: zahl(preis.inputUsdJeMio, "Azure Eingabepreis", { minimum: 0.00000001 }),
    outputUsdJeMio: zahl(preis.outputUsdJeMio, "Azure Ausgabepreis", { minimum: 0.00000001 })
  });
  const preisTag = utcTag(b.preisdatumUtc, "Azure Preisdatum");
  const heute = utcTag(heuteUtc, "heutiges UTC Datum");
  const alterTage = Math.floor((heute.zeit - preisTag.zeit) / TAG_MS);
  if (alterTage < 0 || alterTage > AZURE_MAX_ALTER_TAGE) {
    throw new Error(`Azure Stichprobe ist aelter als ${AZURE_MAX_ALTER_TAGE} UTC Tage`);
  }
  const auswertung = objekt(b.auswertung, "Azure Auswertung");
  const jeKlasse = objekt(auswertung.jeKlasse, "Azure Klassenwerte");
  if (Object.keys(jeKlasse).length !== KLASSEN.length
      || Object.keys(jeKlasse).some((klasse) => !KLASSEN.includes(klasse))) {
    throw new Error("Azure Bericht enthaelt unbekannte oder fehlende Arbeitsformen");
  }
  const klassen = {};
  for (const klasse of KLASSEN) {
    const wert = objekt(jeKlasse[klasse], `Azure Klasse ${klasse}`);
    if (zahl(wert.aufrufe, `${klasse} Aufrufe`, { ganz: true }) !== AZURE_JE_KLASSE) {
      throw new Error(`Azure Klasse ${klasse} braucht genau ${AZURE_JE_KLASSE} Werte`);
    }
    const dauer = objekt(wert.dauerMs, `${klasse} Laufzeit`);
    const input = objekt(wert.inputTokens, `${klasse} Eingabetoken`);
    const output = objekt(wert.outputTokens, `${klasse} Ausgabetoken`);
    const p95 = zahl(dauer.p95, `${klasse} Laufzeit p95`, { minimum: 1 });
    const maximum = zahl(dauer.max, `${klasse} Laufzeit Maximum`, { minimum: p95 });
    klassen[klasse] = Object.freeze({
      stichproben: AZURE_JE_KLASSE,
      dauerMsP95: p95,
      dauerMsMax: maximum,
      inputTokensP95: zahl(input.p95, `${klasse} Eingabetoken p95`, { minimum: 1 }),
      outputTokensP95: zahl(output.p95, `${klasse} Ausgabetoken p95`, { minimum: 1 })
    });
  }
  const langsamstesP95Ms = Math.ceil(Math.max(...KLASSEN.map((klasse) => klassen[klasse].dauerMsP95)));
  const langsamstesMaximumMs = Math.ceil(Math.max(...KLASSEN.map((klasse) => klassen[klasse].dauerMsMax)));
  return Object.freeze({
    deployment: String(b.deployment || ""),
    modell: b.modell,
    deploymentart: b.deploymentart,
    region: b.region,
    endpointHash: String(b.endpointHash || ""),
    preisdatumUtc: preisTag.text,
    preis: preisWerte,
    preisquelle,
    alterTage,
    klassen: Object.freeze(klassen),
    // Der lokale Fachweg bekommt konservativ fuer JEDEN Modellaufruf mindestens
    // das langsamste beobachtete Klassen-p95. Die Streuung reicht bis zum
    // langsamsten beobachteten Maximum. Das ist keine Anbieterhochrechnung.
    lokalesKiProfil: Object.freeze({
      latenzMs: langsamstesP95Ms,
      streuungMs: Math.max(1, langsamstesMaximumMs - langsamstesP95Ms + 1)
    })
  });
}

function pruefeVorstufenBericht(bericht, zielStufe) {
  const ziel = stufe(zielStufe);
  const b = objekt(bericht, "Vorstufenbericht");
  if (b.art !== "Z3b natuerlicher Production Beobachtungsnachweis"
      || b.production !== true || b.synthetisch !== false || b.hochrechnung !== false
      || b.simulation !== false) {
    throw new Error("Vorstufenbericht ist kein natuerlicher Production Nachweis");
  }
  if (Number(b.aktiveVorstufe) !== VORSTUFE[ziel]) {
    throw new Error(`Fachweg ${ziel} braucht sieben Tage der aktiven Vorstufe ${VORSTUFE[ziel]}`);
  }
  const tage = Array.isArray(b.tage) ? b.tage : null;
  if (!tage) throw new Error("Vorstufenbericht enthaelt keine Beobachtungstage");
  const beobachtung = K.bewerteBeobachtung(tage);
  if (!beobachtung.bestanden || beobachtung.aktiveMandate !== VORSTUFE[ziel]) {
    throw new Error("Die sieben natuerlichen Vorstufentage sind nicht vollstaendig gruen");
  }
  const slot = K.bewerteSlot(objekt(b.slot, "Vorstufen Slotmessung"));
  if (!slot.bestanden) throw new Error("Die Vorstufen Slotreserve ist nicht gruen");
  const code = objekt(b.codeUndMigrationen, "Vorstufen Code und Migrationen");
  const pflichten = [
    "pr272Merged", "pr273Merged", "f9Applied", "z22Applied",
    "parserfixDeployed", "planungszeitbudgetDeployed", "monitoringHardeningDeployed",
    "fuenferRegressionGruen"
  ];
  if (pflichten.some((name) => code[name] !== true)) {
    throw new Error("Vorstufenbericht belegt Code, Migrationen oder Fuenferregression nicht vollstaendig");
  }
  const deckel = objekt(b.kiDeckel, "Vorstufen KI Deckel");
  const gesamt = zahl(deckel.gesamt, "Vorstufen KI Gesamtdeckel", { minimum: 1, ganz: true });
  const understandingReserve = zahl(deckel.understandingReserve,
    "Vorstufen Understanding Reserve", { minimum: 0, ganz: true });
  if (understandingReserve > gesamt) throw new Error("Vorstufen Understanding Reserve liegt ueber dem Gesamtdeckel");
  const rotation = K.bewerteMandatsrotation({
    aktiveMandate: VORSTUFE[ziel],
    deckel: gesamt,
    globalAnteil: deckel.globalAnteil
  });
  if (!rotation.taeglichVollstaendig) {
    throw new Error(`Vorstufen KI Deckel unterschreitet die Fairness Untergrenze ${rotation.erforderlicherTagesdeckel}`);
  }
  return Object.freeze({
    ziel, vorstufe: VORSTUFE[ziel], beobachtung, slot,
    codeUndMigrationen: Object.freeze(Object.fromEntries(pflichten.map((name) => [name, true]))),
    kiDeckel: Object.freeze({ gesamt, understandingReserve, globalAnteil: rotation.globalAnteil }),
    kiRotation: rotation
  });
}

function laufFreigabe(zielStufe, laufKennung) {
  const ziel = stufe(zielStufe);
  const lauf = String(laufKennung || "").trim();
  if (!/^[a-z0-9]{6,32}$/.test(lauf)) {
    throw new Error("Z3b Fachweglauf braucht 6 bis 32 Kleinbuchstaben oder Ziffern");
  }
  return `z3b-fachweg:${ziel}:${lauf}`;
}

function kindUmgebung({ env = {}, zielStufe, laufKennung, azure, berichtDatei,
  logDatei, vergleichDatei = "", fehlerMandat = false } = {}) {
  const ziel = stufe(zielStufe);
  const a = objekt(azure, "gepruefter Azure Bericht");
  objekt(a.lokalesKiProfil, "Azure Laufzeitprofil");
  const basis = { ...env };
  return Object.freeze({
    ...basis,
    HELMUT_Z3_STUFEN: String(ziel),
    HELMUT_Z3_MAX_SLOTS: "6",
    HELMUT_Z3_KI_LATENZ_MS: String(zahl(a.lokalesKiProfil.latenzMs, "KI Latenz", { minimum: 1, ganz: true })),
    HELMUT_Z3_KI_STREUUNG_MS: String(zahl(a.lokalesKiProfil.streuungMs, "KI Streuung", { minimum: 1, ganz: true })),
    HELMUT_Z3_KI_FEHLER: "0",
    HELMUT_Z3_KI_DECKEL: "offen",
    HELMUT_Z3_KI_HOECHSTZAHL: String(Math.max(5000, ziel * 20)),
    HELMUT_Z3_FEHLERMANDAT: fehlerMandat ? "an" : "aus",
    HELMUT_Z3_VERGLEICH: fehlerMandat ? String(vergleichDatei || "") : "",
    HELMUT_Z3_BERICHT: String(berichtDatei || ""),
    HELMUT_Z3_LOG: String(logDatei || ""),
    HELMUT_Z3B_FACHWEG_LAUF: String(laufKennung || "")
  });
}

module.exports = {
  STUFEN,
  VORSTUFE,
  KLASSEN,
  AZURE_MODUS,
  AZURE_AUFRUFE,
  AZURE_JE_KLASSE,
  AZURE_MAX_ALTER_TAGE,
  stufe,
  dateiFingerabdruck,
  pruefeAzureBericht,
  pruefeVorstufenBericht,
  laufFreigabe,
  kindUmgebung
};
