"use strict";

// Kanonische technische Kennungsklassen. Sie steuern Kennungsvalidierung und
// Kommunikationsschutz, keinen Produktvorrang. Alle gueltigen Mandate haben
// denselben Budgetzugang. Die fuenf realen Zielprofile sind ausschliesslich
// im separaten Loeschschutz besonders geschuetzt (aktueller AGENTS-Vertrag).
// Historische Diagnose-/Konfigurationsnamen bleiben API-kompatibel erhalten.

const KLASSE_REAL = "real";
const KLASSE_SYNTHETISCH = "synthetisch";
const KLASSE_UNBESTIMMT = "unbestimmt";

const KENNUNGSFAMILIEN_SYNTHETISCH = Object.freeze([
  "test-kohorte-",
  "test-mdb-",
  "synth-mandat-",
  "stapel-"
]);

function text(wert) {
  return typeof wert === "string" ? wert.trim() : "";
}

// Gehört die Kennung einer synthetischen Familie an?
// Kleinschreibung, damit eine abweichend geschriebene Kennung nicht durchrutscht.
function istSynthetischeKennung(kennung) {
  const wert = text(kennung).toLowerCase();
  if (!wert) return false;
  return KENNUNGSFAMILIEN_SYNTHETISCH.some((familie) => wert.startsWith(familie));
}

// Die eine Klassifizierung. Eine leere/fehlende Kennung ist NICHT „real",
// sondern `unbestimmt` — wer daraus eine Schutzentscheidung ableitet, muss den
// Fall ausdrücklich behandeln (fail closed), statt ihn stillschweigend als
// real durchzuwinken.
function klassifiziereMandat(kennung) {
  const wert = text(kennung);
  if (!wert) return KLASSE_UNBESTIMMT;
  return istSynthetischeKennung(wert) ? KLASSE_SYNTHETISCH : KLASSE_REAL;
}

function istRealesMandat(kennung) {
  return klassifiziereMandat(kennung) === KLASSE_REAL;
}

// Zerlegt eine Kennungsliste in ihre drei Klassen. Reihenfolge INNERHALB einer
// Klasse bleibt die Eingabereihenfolge — die Aufrufer sortieren selbst weiter.
function teileNachKlasse(kennungen = []) {
  const real = [];
  const synthetisch = [];
  const unbestimmt = [];
  for (const roh of Array.isArray(kennungen) ? kennungen : []) {
    const wert = text(roh);
    if (!wert) { unbestimmt.push(roh); continue; }
    if (istSynthetischeKennung(wert)) synthetisch.push(wert);
    else real.push(wert);
  }
  return Object.freeze({
    real: Object.freeze(real),
    synthetisch: Object.freeze(synthetisch),
    unbestimmt: Object.freeze(unbestimmt),
    gemischt: real.length > 0 && synthetisch.length > 0
  });
}

// Stellt reale Mandate STABIL vor synthetische, ohne die Reihenfolge innerhalb
// einer Klasse zu verändern (stabile Sortierung). Ist die Liste homogen — der
// heutige Production-Zustand mit 0 synthetischen Zeilen —, ist die Ausgabe
// element-identisch zur Eingabe.
//
// `kennungVon` liest die Mandatskennung aus einem Listenelement; ohne Angabe
// gilt das Element selbst als Kennung.
function sortiereRealZuerst(liste = [], kennungVon = null) {
  const eingang = Array.isArray(liste) ? liste : [];
  const lies = typeof kennungVon === "function" ? kennungVon : ((x) => x);
  const real = [];
  const rest = [];
  for (const eintrag of eingang) {
    let kennung = null;
    try { kennung = lies(eintrag); } catch (_) { kennung = null; }
    if (klassifiziereMandat(kennung) === KLASSE_SYNTHETISCH) rest.push(eintrag);
    else real.push(eintrag);
  }
  return rest.length === 0 || real.length === 0 ? eingang.slice() : [...real, ...rest];
}

// Historischer Umgebungsname: diese Reserve schuetzt inzwischen ALLE
// mandatsgebundenen Aufrufe gegen geteilte Arbeit. Sie liegt im Tagesdeckel;
// der Geldriegel bleibt zusaetzlich wirksam. Die historischen Messwerte unten
// aendern weder diese Gleichbehandlung noch die benoetigte 500er Kostenabnahme.
const VORRANG_REAL_ENV = "HELMUT_TESTLAUF_VORRANG_REAL";

// Gemessener p95-Tagesbedarf der realen Mandate — UNTERGRENZE, keine
// Punktschätzung. Nur Bezugsgröße für die Prüfung; hier wird nichts gesetzt.
const VORRANG_REAL_MESSBEDARF_P95 = 170;
// Aufschlag für die bewiesene Untererfassung (~12 %, §16.3/§17.2). Konservativ
// aufgerundet — der Beleg trägt die Größenordnung, nicht den exakten Betrag.
const VORRANG_REAL_EMPFEHLUNG = 200;

let gewarntVorrangUngueltig = false;

// Liest die Vorrangreserve aus der Umgebung. Antwortet IMMER vollständig und
// benennt die Herkunft — „nicht konfiguriert" wirkt nie wie „geschützt".
function vorrangreserveReal(env = process.env) {
  let roh = "";
  try {
    roh = String((env && env[VORRANG_REAL_ENV]) ?? "").trim();
  } catch (_) {
    roh = "";
  }
  if (roh === "") {
    return Object.freeze({
      wert: 0,
      konfiguriert: false,
      gueltig: true,
      quelle: "nicht-gesetzt",
      env: VORRANG_REAL_ENV,
      meldung: `${VORRANG_REAL_ENV} ist nicht gesetzt — mandatsgebundene Aufrufe haben KEINEN wirksamen `
        + "Verdrängungsschutz im KI-Tagesbudget. Für den 500er-Funktionstest ist das ein Startblocker."
    });
  }
  const zahl = Number(roh);
  if (Number.isSafeInteger(zahl) && zahl > 0) {
    return Object.freeze({
      wert: zahl,
      konfiguriert: true,
      gueltig: true,
      quelle: "umgebung",
      env: VORRANG_REAL_ENV,
      meldung: `${VORRANG_REAL_ENV}=${zahl} — so viele Aufrufe des Tagesdeckels bleiben allen `
        + "Mandaten vorbehalten (Reserve liegt IM Deckel)."
    });
  }
  if (!gewarntVorrangUngueltig) {
    gewarntVorrangUngueltig = true;
    try {
      console.warn(`[vorrang-real] ${VORRANG_REAL_ENV} ist gesetzt, aber ungueltig — Vorrangreserve 0 aktiv. `
        + "Der Tagesdeckel selbst bleibt unveraendert.");
    } catch (_) { /* Logging darf nie den Pfad brechen */ }
  }
  return Object.freeze({
    wert: 0,
    konfiguriert: true,
    gueltig: false,
    quelle: "ungueltig",
    env: VORRANG_REAL_ENV,
    meldung: `${VORRANG_REAL_ENV} trägt keinen gültigen positiven Ganzzahlwert — Vorrangreserve 0 `
      + "(kein Verdrängungsschutz). Der Tagesdeckel selbst bleibt unberührt."
  });
}

// NUR für Tests: die einmalige Warnung erneut zulassen.
function __resetVorrangWarnungFuerTests() {
  gewarntVorrangUngueltig = false;
}

// Die historische Umgebungskennung bleibt erhalten. Die Reserve schuetzt
// mandatsgebundene Arbeit aller Profile gegen geteilte Arbeit. Reale und
// synthetische Kennungen haben denselben Zugang; fehlende Kennungen bleiben
// konservativ eingeordnet. Klassifikation ist kein Produktvorrang.
function vorrangGiltFuer({ kennung = null, geteilt = false } = {}) {
  if (geteilt === true) {
    return Object.freeze({ gilt: true, klasse: "geteilt", grund: "geteilte-arbeit-hat-eigene-reserve" });
  }
  const klasse = klassifiziereMandat(kennung);
  if (klasse === KLASSE_UNBESTIMMT) {
    return Object.freeze({ gilt: true, klasse, grund: "kennung-nicht-bestimmbar-fail-closed" });
  }
  return Object.freeze({ gilt: false, klasse, grund: "mandatsgebundene-arbeit" });
}

module.exports = {
  KLASSE_REAL,
  KLASSE_SYNTHETISCH,
  KLASSE_UNBESTIMMT,
  KENNUNGSFAMILIEN_SYNTHETISCH,
  VORRANG_REAL_ENV,
  VORRANG_REAL_MESSBEDARF_P95,
  VORRANG_REAL_EMPFEHLUNG,
  istSynthetischeKennung,
  klassifiziereMandat,
  istRealesMandat,
  teileNachKlasse,
  sortiereRealZuerst,
  vorrangreserveReal,
  vorrangGiltFuer,
  __resetVorrangWarnungFuerTests
};
