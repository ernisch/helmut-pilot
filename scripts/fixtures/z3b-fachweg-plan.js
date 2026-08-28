"use strict";

// Reine Vorpruefung fuer die neuen Fachwegmessungen 200 und 500.
// Kein Netz, keine Datenbank und keine Prozessstarts. Formale Offline-Pruefungen
// duerfen niemals selbst externe Azure- oder Production-Herkunft behaupten.

const crypto = require("crypto");
const path = require("path");
const {
  KLASSEN,
  AZURE_MODUS,
  AZURE_AUFRUFE,
  AZURE_JE_KLASSE,
  AZURE_MAX_ALTER_TAGE,
  pruefeAzureBericht
} = require("./z3b-azure-bericht");
const { pruefeProduktionsBeobachtung } = require("./z3b-production-beobachtung");

const STUFEN = Object.freeze([200, 500]);
const VORSTUFE = Object.freeze({ 200: 100, 500: 200 });
const KI_AUFRUFLIMIT = Object.freeze({ 200: 5000, 500: 10000 });
const SHA256_RE = /^[0-9a-f]{64}$/;
const MODELL_RE = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const KIND_BASIS_ERLAUBT = Object.freeze([
  "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "TMPDIR", "TMP", "TEMP",
  "SystemRoot", "SYSTEMROOT", "COMSPEC", "PATHEXT",
  "HELMUT_TEST_PG_HOST", "HELMUT_TEST_PG_PORT", "HELMUT_TEST_PG_USER",
  "HELMUT_Z3_POSTGREST"
]);

function objekt(wert, name) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) {
    throw new Error(`${name} fehlt oder ist kein Objekt`);
  }
  return wert;
}

function sichereGanzzahl(wert, name, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof wert !== "number" || !Number.isSafeInteger(wert)
      || wert < minimum || wert > maximum) {
    throw new Error(`${name} ist keine sichere Ganzzahl`);
  }
  return wert;
}

function stufe(wert) {
  if (wert !== 200 && wert !== 500 && wert !== "200" && wert !== "500") {
    throw new Error("Z3b Fachwegstufe muss genau 200 oder 500 sein");
  }
  return Number(wert);
}

function vollerSha256(wert, name) {
  if (typeof wert !== "string" || !SHA256_RE.test(wert)) {
    throw new Error(`${name} muss ein voller 64 Zeichen SHA256 sein`);
  }
  return wert;
}

function dateiFingerabdruck(text) {
  const inhalt = Buffer.isBuffer(text) ? text : Buffer.from(String(text == null ? "" : text));
  return crypto.createHash("sha256").update(inhalt).digest("hex");
}

function pruefeVorstufenBericht(bericht, zielStufe, {
  jetzt = new Date(),
  heuteUtc = new Date(jetzt).toISOString().slice(0, 10),
  vertrauenswuerdigeSlotIds
} = {}) {
  const ziel = stufe(zielStufe);
  const beobachtung = pruefeProduktionsBeobachtung(bericht, {
    jetzt, heuteUtc, vertrauenswuerdigeSlotIds
  });
  if (beobachtung.aktiveStufe !== VORSTUFE[ziel]) {
    throw new Error(`Fachweg ${ziel} braucht sieben Tage der aktiven Vorstufe ${VORSTUFE[ziel]}`);
  }
  if (beobachtung.slotplanSeparatEingebunden !== true) {
    throw new Error("Vorstufenbericht ist nicht an einen separat vertrauenswuerdigen Slotplan gebunden");
  }
  if (beobachtung.kriterienInternBestanden !== true) {
    throw new Error("Die sieben natuerlichen Vorstufentage sind intern nicht vollstaendig gruen");
  }
  return Object.freeze({
    ziel,
    vorstufe: VORSTUFE[ziel],
    beobachtung,
    externeHerkunftBewiesen: false,
    codeUndMigrationsvollzugExternBewiesen: false,
    startfreigabe: false,
    beweisgrenze: "Form und innere Konsistenz sind geprueft; Production Herkunft sowie Code und Migrationsvollzug sind extern offen"
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

function absoluteDatei(wert, name) {
  if (typeof wert !== "string" || !path.isAbsolute(wert) || path.resolve(wert) !== wert) {
    throw new Error(`${name} muss ein normalisierter absoluter Pfad sein`);
  }
  return wert;
}

function kindBasis(env) {
  const basis = {};
  for (const name of KIND_BASIS_ERLAUBT) {
    if (typeof env[name] === "string" && env[name] !== "") basis[name] = env[name];
  }
  return basis;
}

function kindUmgebung({ env = {}, zielStufe, laufKennung, azure,
  azureBelegSha256, vorstufenBelegSha256, berichtDatei, logDatei,
  vergleichDatei = "", kontrollBelegSha256 = "", fehlerMandat = false } = {}) {
  const ziel = stufe(zielStufe);
  const lauf = String(laufKennung || "").trim();
  const freigabe = laufFreigabe(ziel, lauf);
  const a = objekt(azure, "gepruefter Azure Bericht");
  const profil = objekt(a.lokalesKiProfil, "Azure Laufzeitprofil");
  const modell = typeof a.modell === "string" ? a.modell.trim().toLowerCase() : "";
  if (!MODELL_RE.test(modell)) throw new Error("Azure Modell ist nicht eindeutig gebunden");
  const latenzMs = sichereGanzzahl(profil.latenzMs, "KI Latenz", { minimum: 1, maximum: 300000 });
  const streuungMs = sichereGanzzahl(profil.streuungMs, "KI Streuung", { minimum: 1, maximum: 300000 });
  const azureHash = vollerSha256(azureBelegSha256, "Azure Beleg");
  const vorstufenHash = vollerSha256(vorstufenBelegSha256, "Vorstufen Beleg");
  const bericht = absoluteDatei(berichtDatei, "Fachweg Bericht");
  const log = absoluteDatei(logDatei, "Fachweg Log");
  if (bericht === log) throw new Error("Fachweg Bericht und Log muessen getrennte Dateien sein");
  let vergleich = "";
  let kontrollHash = "";
  if (fehlerMandat === true) {
    vergleich = absoluteDatei(vergleichDatei, "Kontrollbericht");
    kontrollHash = vollerSha256(kontrollBelegSha256, "Kontrollbeleg");
    if (vergleich === bericht || vergleich === log) {
      throw new Error("Kontrollbericht, Fehlerbericht und Fehlerlog muessen getrennte Dateien sein");
    }
  } else if (fehlerMandat !== false || vergleichDatei !== "" || kontrollBelegSha256 !== "") {
    throw new Error("Kontrolllauf darf weder Vergleichsdatei noch Kontrollhash erben");
  }
  return Object.freeze({
    ...kindBasis(objekt(env, "Kind Basisumgebung")),
    HELMUT_Z3_STUFEN: String(ziel),
    HELMUT_Z3_MAX_SLOTS: "6",
    HELMUT_Z3_KI_LATENZ_MS: String(latenzMs),
    HELMUT_Z3_KI_STREUUNG_MS: String(streuungMs),
    HELMUT_Z3_KI_FEHLER: "0",
    HELMUT_Z3_KI_DECKEL: "offen",
    HELMUT_Z3_KI_HOECHSTZAHL: String(KI_AUFRUFLIMIT[ziel]),
    HELMUT_Z3_FEHLERMANDAT: fehlerMandat ? "an" : "aus",
    HELMUT_Z3_VERGLEICH: vergleich,
    HELMUT_Z3_BERICHT: bericht,
    HELMUT_Z3_LOG: log,
    HELMUT_Z3B_FACHWEG_LAUF: lauf,
    HELMUT_Z3B_FACHWEG_FREIGABE: freigabe,
    HELMUT_Z3B_FACHWEG_KI_MODELL: modell,
    HELMUT_Z3B_FACHWEG_AZURE_BELEG_SHA256: azureHash,
    HELMUT_Z3B_FACHWEG_VORSTUFEN_BELEG_SHA256: vorstufenHash,
    HELMUT_Z3B_FACHWEG_KONTROLL_BELEG_SHA256: kontrollHash
  });
}

module.exports = {
  STUFEN,
  VORSTUFE,
  KI_AUFRUFLIMIT,
  KIND_BASIS_ERLAUBT,
  KLASSEN,
  AZURE_MODUS,
  AZURE_AUFRUFE,
  AZURE_JE_KLASSE,
  AZURE_MAX_ALTER_TAGE,
  stufe,
  vollerSha256,
  dateiFingerabdruck,
  pruefeAzureBericht,
  pruefeVorstufenBericht,
  laufFreigabe,
  kindUmgebung
};
