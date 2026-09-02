"use strict";

// Helmut — KANONISCHE KLASSIFIZIERUNG EINER MANDATSKENNUNG (real / synthetisch).
// =============================================================================
// WOZU. Vor dem 500er-Funktionstest (5 REALE Mandate + 495 SYNTHETISCHE
// Kohortenprofile) gab es die Frage „ist diese Kennung synthetisch?" an genau
// EINER Stelle beantwortet: im Kommunikationsriegel. Die Warteschlange, die
// Priorisierung und das KI-Budget kannten den Begriff NICHT — dort war ein
// synthetisches Profil ein Mandat wie jedes andere und konnte ein reales
// verdrängen (Beleg: `llm-budget-fair.rotationsReihenfolge` sortiert rein nach
// Streuwert; `storage.reserveLlmCall` kennt nur „Mandant" und „geteilt").
//
// Dieses Modul ist die EINE kanonische Antwort. Es ist reine Logik: kein Netz,
// keine Datenbank, keine Uhr, keine Secrets — die Umgebung ist ein Parameter.
// Es wirft nie.
//
// ─── WAS ES AUSDRÜCKLICH NICHT TUT ──────────────────────────────────────────
//  * Es setzt KEINEN Deckel, KEINE Reserve und KEINE Umgebungsvariable.
//  * Es enthält KEINEN einzigen realen Mandats-Slug (CLAUDE.md §4.2). Die
//    Klassifizierung ist eine ERLAUBNISLISTE DES SYNTHETISCHEN: bekannt
//    synthetische Kennungsfamilien sind aufgezählt, alles andere gilt als real.
//    Ein reales Mandat kann so nie versehentlich als synthetisch behandelt
//    (und damit benachteiligt) werden.
//  * Es ist in der HEUTIGEN Production strukturell wirkungslos: dort existieren
//    0 synthetische Mandatszeilen (rein lesend bestätigt 2026-09-02). Jede
//    Schutzregel, die auf dieser Klassifizierung aufsetzt, ist damit bis zur
//    ersten Provisionierung ein nachweisbarer No-Op — genau das belegen die
//    Regressionstests (`scripts/mandatsklasse-test.js`, Abschnitt „Inertheit").
//
// ─── DIE VIER SYNTHETISCHEN KENNUNGSFAMILIEN ────────────────────────────────
// Sie stammen aus dem Repository selbst und werden dort AUSSCHLIESSLICH für
// Testdaten vergeben:
//   test-kohorte-…   die 495 Profile des 500er-Funktionstests
//                    (`lib/helmut/test-kohorte-500.js`)
//   test-mdb-…       die 5 deaktivierten Offline-Testmandate im Repo
//   synth-mandat-…   die 1.000er-Lastfixture
//                    (`scripts/fixtures/synthetische-mandate-1000.js`)
//   stapel-…         Kennungen der Anlage-Stapel-Testsuite
//
// Die Liste ist bewusst identisch mit `kommunikationsriegel`. Sie stand dort
// als zweite Kopie; seit diesem Sprint ist DIESES Modul die eine Wahrheit und
// der Riegel bezieht sie von hier (CLAUDE.md §7.7: eine kanonische Stelle).

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

// ═════════════════════════════════════════════════════════════════════════════
// VORRANGRESERVE DER REALEN MANDATE (KI-Tagesbudget)
// ═════════════════════════════════════════════════════════════════════════════
//
// DAS PROBLEM, BELEGT. `storage.reserveLlmCall` reserviert gegen EINEN globalen
// Tageszähler. 495 synthetische Profile und 5 reale greifen in denselben Topf,
// „wer zuerst kommt". Der Kommunikationsriegel schützt die Außenkanäle, nicht
// das Budget. `HELMUT_TENANT_LLM_CAP` ist AUS und begrenzt ohnehin nur je
// Mandant — es hält den globalen Topf nicht frei.
//
// DIE REGEL. Ein Anteil des Tagesdeckels bleibt für die realen Mandate
// freigehalten; SYNTHETISCHE, mandatsgebundene Aufrufe dürfen ihn nicht
// anfassen. Die Reserve liegt — wie die Verstehens-Reserve — IM Deckel und wird
// NIE addiert.
//
// DER WERT. `HELMUT_TESTLAUF_VORRANG_REAL`. Default AUS (0) —
// verhaltensneutral, wie jede andere Reserve dieses Projekts. Der später zu
// setzende Wert ist NICHT 5: 5 schützt nur die ANZAHL der Mandate, nicht ihren
// Tagesbedarf. Gemessen (60 volle Tage, `helmut_store.data.llmUsage`,
// Beleg 500-funktionstest-sicherheitsrahmen §16.3) liegt der p95-Tagesbedarf
// der fünf realen Mandate bei 170 Aufrufen — und das ist eine UNTERGRENZE
// (bewiesene Untererfassung des Blob-Rings, §17.2/§17.4).
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
      meldung: `${VORRANG_REAL_ENV} ist nicht gesetzt — die realen Mandate haben KEINEN wirksamen `
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
      meldung: `${VORRANG_REAL_ENV}=${zahl} — so viele Aufrufe des Tagesdeckels bleiben den realen `
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

// Wirkt die Vorrangreserve für DIESEN Aufruf?
//
// AUSGENOMMEN IST GENAU EINE KLASSE: mandatsgebundene Arbeit eines REALEN
// Mandats. Sie ist der Zweck der Reserve und sieht unverändert dasselbe
// Tagesmaximum wie bisher.
//
// ALLES ANDERE ist betroffen — und zwar auch die GETEILTE Arbeit (Verstehen,
// Backfills, geteilter Wissenskorpus). Das ist eine bewusste Entscheidung und
// folgt der dokumentierten Deckelsemantik (§4): beide Reserven liegen IM Deckel
// und werden nie addiert (`Verstehens-Reserve + Vorrangreserve < Deckel`). Das
// Verstehen hat mit `HELMUT_LLM_RESERVE_UNDERSTANDING` seine EIGENE Reserve;
// dürfte es zusätzlich die Vorrangreserve aufbrauchen, wäre diese keine Reserve
// mehr, sondern eine Empfehlung. Belegter Anlass: `LLM_PRIORITY_CALLTYPES`
// erlaubt dem Verstehen heute den VOLLEN Tagesdeckel (storage.js) — bei 500
// Profilen wächst genau dieser Pfad am stärksten, und die sichtbare Lage der
// fünf realen Mandate fiele als Erstes aus.
//
// „Nicht bestimmbar" bekommt die strengere Stellung (fail closed), sonst wäre
// ein fehlendes Feld der Weg an der Reserve vorbei.
function vorrangGiltFuer({ kennung = null, geteilt = false } = {}) {
  if (geteilt === true) {
    return Object.freeze({ gilt: true, klasse: "geteilt", grund: "geteilte-arbeit-hat-eigene-reserve" });
  }
  const klasse = klassifiziereMandat(kennung);
  if (klasse === KLASSE_SYNTHETISCH) {
    return Object.freeze({ gilt: true, klasse, grund: "synthetische-kennungsfamilie" });
  }
  if (klasse === KLASSE_UNBESTIMMT) {
    return Object.freeze({ gilt: true, klasse, grund: "kennung-nicht-bestimmbar-fail-closed" });
  }
  return Object.freeze({ gilt: false, klasse, grund: "reales-mandat" });
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
