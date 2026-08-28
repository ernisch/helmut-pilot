"use strict";

// Neuer Fachweglauf fuer genau eine bisher ungemessene Stufe 200 ODER 500.
// Er wiederholt keine alte Z3a Stufe. Je Ziel laufen zwei vollstaendige lokale
// Fachwege: zuerst ohne Fehlermandat, danach mit genau diesem Kontrollbericht.
// Azure antwortet dabei NICHT erneut. Seine echte 21er Stichprobe liefert nur das
// konservative Laufzeitprofil fuer den lokalen TLS Endpunkt.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const P = require("./fixtures/z3b-fachweg-plan");

const ROOT = path.join(__dirname, "..");
const LOKAL = path.join(ROOT, "scripts", "lokal.js");
const FACHWEG = path.join(ROOT, "scripts", "skalierung-z3-realistiklauf.js");

class Z3bFachwegAbbruch extends Error {
  constructor(nachricht, grund = "sicherheitsabbruch") {
    super(nachricht);
    this.name = "Z3bFachwegAbbruch";
    this.grund = grund;
  }
}

function liesJson(datei, name) {
  const ziel = path.resolve(String(datei || ""));
  if (!datei || !path.isAbsolute(String(datei)) || !fs.existsSync(ziel) || !fs.statSync(ziel).isFile()) {
    throw new Z3bFachwegAbbruch(`${name} fehlt oder ist keine vorhandene absolute Datei`, "beleg");
  }
  const roh = fs.readFileSync(ziel, "utf8");
  let json;
  try { json = JSON.parse(roh); }
  catch (_) { throw new Z3bFachwegAbbruch(`${name} ist kein gueltiges JSON`, "beleg"); }
  return Object.freeze({ datei: ziel, roh, json, hash: P.dateiFingerabdruck(roh) });
}

function neuesAusgabeverzeichnis(roh) {
  const ziel = path.resolve(String(roh || ""));
  if (!roh || !path.isAbsolute(String(roh)) || ziel === path.parse(ziel).root
      || ziel === path.dirname(ziel) || fs.existsSync(ziel)) {
    throw new Z3bFachwegAbbruch(
      "Z3b Fachweg braucht ein neues, absolutes und noch nicht vorhandenes Ausgabeverzeichnis",
      "ausgabe"
    );
  }
  const eltern = path.dirname(ziel);
  if (!fs.existsSync(eltern) || !fs.statSync(eltern).isDirectory()) {
    throw new Z3bFachwegAbbruch("Elternverzeichnis der Z3b Fachwegausgabe fehlt", "ausgabe");
  }
  return ziel;
}

function liesKonfiguration(env = process.env, { heuteUtc = new Date().toISOString().slice(0, 10) } = {}) {
  let ziel;
  try { ziel = P.stufe(env.HELMUT_Z3B_FACHWEG_STUFE); }
  catch (fehler) { throw new Z3bFachwegAbbruch(fehler.message, "stufe"); }
  const lauf = String(env.HELMUT_Z3B_FACHWEG_LAUF || "").trim();
  let freigabe;
  try { freigabe = P.laufFreigabe(ziel, lauf); }
  catch (fehler) { throw new Z3bFachwegAbbruch(fehler.message, "freigabe"); }
  if (String(env.HELMUT_Z3B_FACHWEG_FREIGABE || "") !== freigabe) {
    throw new Z3bFachwegAbbruch("Z3b Fachweg ist nicht stufen und laufbezogen freigegeben", "freigabe");
  }
  const azureDatei = liesJson(env.HELMUT_Z3B_FACHWEG_AZURE_BERICHT, "Azure Stichprobenbericht");
  const vorstufenDatei = liesJson(env.HELMUT_Z3B_FACHWEG_VORSTUFEN_BERICHT, "Vorstufenbericht");
  let azure;
  let vorstufe;
  try {
    azure = P.pruefeAzureBericht(azureDatei.json, { heuteUtc });
    vorstufe = P.pruefeVorstufenBericht(vorstufenDatei.json, ziel);
  } catch (fehler) {
    throw new Z3bFachwegAbbruch(fehler.message, "beleg");
  }
  const ausgabe = neuesAusgabeverzeichnis(env.HELMUT_Z3B_FACHWEG_VERZEICHNIS);
  return Object.freeze({
    ziel, lauf, freigabe, azure, vorstufe, ausgabe,
    azureBeleg: Object.freeze({ hash: azureDatei.hash, datei: azureDatei.datei }),
    vorstufenBeleg: Object.freeze({ hash: vorstufenDatei.hash, datei: vorstufenDatei.datei })
  });
}

function starteKind(env) {
  return new Promise((resolve, reject) => {
    const kind = spawn(process.execPath, [LOKAL, "--", process.execPath, FACHWEG], {
      cwd: ROOT,
      env,
      stdio: "inherit"
    });
    kind.on("error", reject);
    kind.on("close", (code, signal) => resolve({ code, signal: signal || null }));
  });
}

function pruefeFachwegBericht(datei, ziel, { fehlerMandat }) {
  const beleg = liesJson(datei, fehlerMandat ? "Fehlerlaufbericht" : "Kontrolllaufbericht");
  const b = beleg.json;
  const stufen = b && Array.isArray(b.stufen) ? b.stufen : [];
  const messung = stufen.length === 1 ? stufen[0] : null;
  if (!b || b.stand !== "Z3a-teilnachweis-lokale-anbieter" || Number(b.fail) !== 0
      || Number(b.befundOffen) !== 0 || !messung || Number(messung.mandate) !== ziel) {
    throw new Z3bFachwegAbbruch(
      `${fehlerMandat ? "Fehlerlauf" : "Kontrolllauf"} ist nicht vollstaendig gruen`,
      "fachweg-rot"
    );
  }
  if (fehlerMandat ? !messung.fehlerMandat : Boolean(messung.fehlerMandat)) {
    throw new Z3bFachwegAbbruch("Fachwegbericht hat den falschen Fehlermandatsmodus", "fachweg-rot");
  }
  return Object.freeze({ bericht: b, hash: beleg.hash });
}

async function fuehreAus(konfiguration, env = process.env) {
  const k = konfiguration;
  fs.mkdirSync(k.ausgabe, { recursive: false, mode: 0o700 });
  const kontrollBericht = path.join(k.ausgabe, "kontrolllauf.json");
  const kontrollLog = path.join(k.ausgabe, "kontrolllauf.log");
  const fehlerBericht = path.join(k.ausgabe, "fehlerlauf.json");
  const fehlerLog = path.join(k.ausgabe, "fehlerlauf.log");

  const kontrollEnv = P.kindUmgebung({
    env, zielStufe: k.ziel, laufKennung: k.lauf, azure: k.azure,
    berichtDatei: kontrollBericht, logDatei: kontrollLog, fehlerMandat: false
  });
  const kontrollProzess = await starteKind(kontrollEnv);
  if (kontrollProzess.code !== 0) {
    throw new Z3bFachwegAbbruch("Z3b Fachweg Kontrolllauf ist fehlgeschlagen", "fachweg-rot");
  }
  const kontroll = pruefeFachwegBericht(kontrollBericht, k.ziel, { fehlerMandat: false });

  const fehlerEnv = P.kindUmgebung({
    env, zielStufe: k.ziel, laufKennung: k.lauf, azure: k.azure,
    berichtDatei: fehlerBericht, logDatei: fehlerLog,
    vergleichDatei: kontrollBericht, fehlerMandat: true
  });
  const fehlerProzess = await starteKind(fehlerEnv);
  if (fehlerProzess.code !== 0) {
    throw new Z3bFachwegAbbruch("Z3b Fachweg Fehlerlauf ist fehlgeschlagen", "fachweg-rot");
  }
  const fehler = pruefeFachwegBericht(fehlerBericht, k.ziel, { fehlerMandat: true });

  const bericht = {
    art: "Z3b Fachwegmessung 200 oder 500",
    ergebnis: "vollstaendig-gruen",
    erhobenUtc: new Date().toISOString(),
    zielMandate: k.ziel,
    laufKennung: k.lauf,
    fachwege: 2,
    kontrolllaufOhneFehlermandat: true,
    fehlerlaufMitKontrollvergleich: true,
    echteFachhandler: true,
    datenbankweg: "lokales HTTP zu PostgREST zu PostgreSQL",
    quellenanbieter: "lokal-synthetisch",
    kiAnbieterImFachweg: "lokaler TLS Endpunkt mit konservativem Azure Laufzeitprofil",
    azureWaehrenDesFachwegsAufgerufen: false,
    productionDatenBeruehrt: false,
    productionBewiesen: false,
    hochrechnung: false,
    einordnung: "Vollstaendiger lokaler Fachwegnachweis der neuen Stufe, kein Production oder Anbieterlastnachweis",
    azureStichprobe: {
      belegHash: k.azureBeleg.hash,
      modell: k.azure.modell,
      deploymentart: k.azure.deploymentart,
      region: k.azure.region,
      endpointHash: k.azure.endpointHash,
      preisdatumUtc: k.azure.preisdatumUtc,
      preis: k.azure.preis,
      preisquelle: k.azure.preisquelle,
      lokalesKiProfil: k.azure.lokalesKiProfil,
      klassen: k.azure.klassen
    },
    natuerlichesVorstufentor: {
      belegHash: k.vorstufenBeleg.hash,
      vorstufe: k.vorstufe.vorstufe,
      vonDatumUtc: k.vorstufe.beobachtung.vonDatumUtc,
      bisDatumUtc: k.vorstufe.beobachtung.bisDatumUtc,
      tage: k.vorstufe.beobachtung.tage,
      slot: k.vorstufe.slot,
      codeUndMigrationen: k.vorstufe.codeUndMigrationen,
      kiDeckel: k.vorstufe.kiDeckel,
      kiRotation: k.vorstufe.kiRotation
    },
    kontrolllauf: { belegHash: kontroll.hash, messung: kontroll.bericht.stufen[0] },
    fehlerlauf: { belegHash: fehler.hash, messung: fehler.bericht.stufen[0] }
  };
  const gesamtDatei = path.join(k.ausgabe, "fachweg-gesamtbericht.json");
  fs.writeFileSync(gesamtDatei, `${JSON.stringify(bericht, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return Object.freeze({ bericht: Object.freeze(bericht), gesamtDatei });
}

function sichererFehler(fehler) {
  if (fehler instanceof Z3bFachwegAbbruch) {
    return Object.freeze({ grund: fehler.grund, nachricht: fehler.message });
  }
  return Object.freeze({
    grund: "interner-fehler",
    nachricht: "Z3b Fachweg wurde wegen eines internen Fehlers ohne Detailausgabe abgebrochen"
  });
}

async function main() {
  try {
    const konfiguration = liesKonfiguration();
    const ergebnis = await fuehreAus(konfiguration);
    process.stdout.write(`${JSON.stringify({
      art: ergebnis.bericht.art,
      ergebnis: ergebnis.bericht.ergebnis,
      zielMandate: ergebnis.bericht.zielMandate,
      gesamtbericht: ergebnis.gesamtDatei
    }, null, 2)}\n`);
  } catch (fehler) {
    process.stderr.write(`${JSON.stringify({
      art: "Z3b Fachwegmessung 200 oder 500",
      ergebnis: "abgebrochen",
      productionDatenBeruehrt: false,
      fehler: sichererFehler(fehler)
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  Z3bFachwegAbbruch,
  liesJson,
  neuesAusgabeverzeichnis,
  liesKonfiguration,
  pruefeFachwegBericht,
  fuehreAus,
  sichererFehler
};
