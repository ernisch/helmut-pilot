"use strict";

// Reiner fail closed Vertrag fuer einen aus dem lokalen Fachweg erhobenen
// Tagesbedarf. Kein Netz, keine Datenbank und keine Aktivierungsfunktion.

const SCHEMA_VERSION = "z3b-tagesbedarf-v2";
const ART = "Z3b Tagesbedarfsbericht aus lokalem Fachweg";
const ERGEBNIS_FORMAL = "formal-strukturiert-fachweg-integration-offen";
const KLASSEN = Object.freeze(["understanding", "lage", "buero"]);
const ZIELSTUFEN = Object.freeze([10, 25, 50, 100, 200, 500]);
const MINDESTTAGE = 2;

function objekt(wert, name) {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) {
    throw new Error(`${name} fehlt oder ist kein Objekt`);
  }
  return wert;
}

function nurSchluessel(wert, erlaubt, name) {
  const o = objekt(wert, name);
  const vorhanden = Object.keys(o);
  const fremd = vorhanden.filter((feld) => !erlaubt.includes(feld));
  const fehlt = erlaubt.filter((feld) => !(feld in o));
  if (fremd.length) throw new Error(`${name} enthaelt unbekannte Felder: ${fremd.join(", ")}`);
  if (fehlt.length) throw new Error(`${name} fehlt: ${fehlt.join(", ")}`);
  return o;
}

function ganzzahl(wert, name, { minimum = 0 } = {}) {
  if (typeof wert !== "number" || !Number.isSafeInteger(wert) || wert < minimum) {
    throw new Error(`${name} ist keine sichere Ganzzahl`);
  }
  return wert;
}

function jeKlasse(wert, name) {
  const o = objekt(wert, name);
  if (Object.keys(o).length !== KLASSEN.length
      || Object.keys(o).some((klasse) => !KLASSEN.includes(klasse))) {
    throw new Error(`${name} enthaelt unbekannte oder fehlende Arbeitsformen`);
  }
  return Object.freeze(Object.fromEntries(KLASSEN.map((klasse) => [
    klasse, ganzzahl(o[klasse], `${name}.${klasse}`)
  ])));
}

function pruefeTagesbedarfBericht(bericht) {
  const b = nurSchluessel(bericht, [
    "schemaVersion", "art", "ergebnis", "zielMandate", "lokalerFachweg",
    "production", "synthetisch", "hochrechnung", "laufKennung",
    "fachwegBelegHash", "gitSha", "fachwegtage"
  ], "Tagesbedarfsbericht");
  if (b.schemaVersion !== SCHEMA_VERSION || b.art !== ART || b.ergebnis !== ERGEBNIS_FORMAL) {
    throw new Error("Tagesbedarfsbericht hat nicht den versionierten formalen Vertrag");
  }
  if (b.lokalerFachweg !== true || b.production !== false
      || b.synthetisch !== true || b.hochrechnung !== false) {
    throw new Error("Tagesbedarfsbericht ist keine formale lokale Fachwegzusammenfassung");
  }
  const zielMandate = ganzzahl(b.zielMandate, "Tagesbedarf Zielstufe", { minimum: 1 });
  if (!ZIELSTUFEN.includes(zielMandate)) throw new Error("Tagesbedarf Zielstufe ist nicht zugelassen");
  const laufKennung = typeof b.laufKennung === "string" ? b.laufKennung : "";
  if (!/^[a-z0-9]{6,32}$/.test(laufKennung)) throw new Error("Tagesbedarf Laufkennung ist nicht belegt");
  const fachwegBelegHash = typeof b.fachwegBelegHash === "string" ? b.fachwegBelegHash : "";
  if (!/^[a-f0-9]{64}$/.test(fachwegBelegHash)) {
    throw new Error("Tagesbedarf braucht einen 64 Zeichen Fachwegbeleg Hash");
  }
  const gitSha = typeof b.gitSha === "string" ? b.gitSha : "";
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(gitSha)) {
    throw new Error("Tagesbedarf Git SHA ist nicht belegt");
  }
  if (!Array.isArray(b.fachwegtage) || b.fachwegtage.length < MINDESTTAGE) {
    throw new Error(`Tagesbedarf braucht mindestens ${MINDESTTAGE} vollstaendige lokale Fachwegtage`);
  }
  for (let index = 0; index < b.fachwegtage.length; index += 1) {
    if (!(index in b.fachwegtage)) {
      throw new Error(`Tagesbedarf Fachwegtage enthalten eine Arrayluecke bei Position ${index + 1}`);
    }
  }
  const tage = b.fachwegtage.map((roh, index) => {
    const tag = nurSchluessel(roh, ["tag", "vollstaendig", "aufrufe"], `Fachweg Tag ${index + 1}`);
    if (ganzzahl(tag.tag, `Fachweg Tag ${index + 1} Nummer`, { minimum: 1 }) !== index + 1
        || tag.vollstaendig !== true) {
      throw new Error("Lokale Fachwegtage muessen vollstaendig und lueckenlos nummeriert sein");
    }
    const aufrufe = jeKlasse(tag.aufrufe, `Fachweg Tag ${index + 1} Aufrufe`);
    const tagSumme = KLASSEN.reduce((summe, klasse) => summe + aufrufe[klasse], 0);
    if (!Number.isSafeInteger(tagSumme)) {
      throw new Error(`Fachweg Tag ${index + 1} Aufrufsumme ist keine sichere Ganzzahlsumme`);
    }
    if (tagSumme <= 0) {
      throw new Error(`Fachweg Tag ${index + 1} hat keinen KI Bedarf`);
    }
    return Object.freeze({ tag: index + 1, vollstaendig: true, aufrufe });
  });
  const beobachteteKlassenTagesmaxima = Object.freeze(Object.fromEntries(KLASSEN.map((klasse) => {
    const maximum = Math.max(...tage.map((tag) => tag.aufrufe[klasse]));
    return [klasse, ganzzahl(maximum, `Tagesmaximum ${klasse}`)];
  })));
  if (KLASSEN.some((klasse) => beobachteteKlassenTagesmaxima[klasse] <= 0)) {
    throw new Error("Jede Arbeitsform muss im lokalen Fachwegfenster mindestens einmal gemessen sein");
  }
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    art: ART,
    zielMandate,
    laufKennung,
    fachwegBelegHash,
    gitSha,
    fachwegtage: Object.freeze(tage),
    beobachteteKlassenTagesmaxima,
    status: ERGEBNIS_FORMAL,
    strukturInternKonsistent: true,
    fachwegGesamtberichtMitgeliefert: false,
    fachwegGesamtberichtInternNachgeprueft: false,
    externeHerkunftBewiesen: false,
    entscheidungsgrundlageVollstaendig: false,
    integrationshinweis: "Das vollstaendige Fachweg Gesamtschema ist noch nicht stabil eingebunden; die angegebenen Tagesaggregate werden nur formal geprueft."
  });
}

module.exports = {
  SCHEMA_VERSION,
  ART,
  ERGEBNIS_FORMAL,
  KLASSEN,
  ZIELSTUFEN,
  MINDESTTAGE,
  pruefeTagesbedarfBericht
};
