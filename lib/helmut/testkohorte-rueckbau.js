"use strict";

// Helmut — DER AUSFÜHRER DES RÜCKBAUS (495er-Testkohorte).
// =============================================================================
// WAS BISHER FEHLTE (adversarialer Review 02.09., bestätigter Befund):
// `testkohorte-betrieb.js` PLANT den Rückbau, und `scripts/testkohorte-495.js`
// weist jeden scharfen Lauf ab. Es gab damit KEINEN Weg, die 495 Profile
// tatsächlich wieder abzuschalten — außer `scripts/provision-tenant.js
// --deactivate <id>`, ein Mandat je Aufruf, OHNE die Erlaubnisliste der Kohorte.
// Für den gefährlichsten Moment des ganzen Vorhabens — ein missglückter Lauf mit
// 400 aktiven synthetischen Profilen — war das kein Rückweg, sondern 495
// Einzelaufrufe von Hand, jeder davon ohne strukturellen Schutz der fünf realen
// Mandate.
//
// Dieses Modul ist dieser Rückweg. Es ist die EINZIGE Stelle dieses Vorhabens,
// die Production-Daten ändern darf — und sie ist dreifach verriegelt:
//
//   1. ERLAUBNISLISTE. Es wirkt ausschließlich auf die 495 deterministischen
//      Kennungen aus `baueKohorte()`. Eine fremde Kennung wird NICHT gefiltert,
//      sondern bricht den gesamten Vorgang ab (`pruefeZielmenge`). Ein reales
//      Mandat kann strukturell nicht erreicht werden.
//   2. ZWEI UNABHÄNGIGE FREIGABEN. `HELMUT_TESTKOHORTE_EXECUTE` UND
//      `HELMUT_TESTKOHORTE_CONFIRM` mit dem Wort des Schrittes „deaktivierung".
//      Ohne beides läuft ein TROCKENLAUF — er ruft nichts auf.
//   3. NACHPRÜFUNG JE ZEILE. Nach jedem Schreibvorgang wird der erreichte
//      Zustand GELESEN. Gemeldet wird nur, was die Ablage trägt (CLAUDE.md
//      §4.10). Ein Schreibfehler wird gezählt und benannt, nie verschluckt.
//
// KEIN LÖSCHPFAD IM RÜCKWEG. `fuehreRueckbauAus` deaktiviert — es kennt kein
// `delete`, kein `teardown`, keine Löschmarke, und es rührt keine Profildaten an.
// Der Rückweg zweiter Wahl (Restore) bleibt eine getrennte Betreiberentscheidung.
//
// DAVON GETRENNT (ergänzt 02.09., adversariale Analyse): `entferneSchedulerSpur`
// räumt die NACHWIRKUNG des Testtages auf. Das Deaktivieren lässt die Spur der
// 495 Kennungen in der EINEN Fairness-Zeile stehen; dort bleibt sie 90 Tage und
// verlangsamt danach jeden Fairness-Schreibvorgang der fünf realen Mandate.
// Diese Funktion entfernt AUSSCHLIESSLICH Scheduler-Metadaten (Zeitstempel und
// Zähler je Cron), niemals Profil-, Inhalts- oder Kontodaten, und sie hat ihre
// EIGENE Freigabe. Sie ist bewusst nicht Teil des Rückwegs: der muss in jedem
// Moment sofort laufen dürfen, das Aufräumen hat Zeit.
//
// FEHLERTOLERANZ: ein Fehlschlag an EINER Kennung beendet den Lauf nicht — sonst
// bliebe der Rest der Kohorte aktiv stehen. Er wird gezählt, benannt und am Ende
// ausgewiesen; das Gesamturteil ist dann `ok: false`.

const {
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  FREIGABEWORTE,
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  KOHORTE_KENNUNGEN,
  istKohortenKennung,
  pruefeZielmenge,
  freigabe
} = require("./testkohorte-betrieb");

const SCHRITT = "deaktivierung";
const SCHRITT_SPUR = "scheduler-spur";

// Die Zielmenge EINES Laufs: entweder die ganze Kohorte oder eine ausdrücklich
// übergebene Teilmenge (etwa die Kennungen, die eine vorherige Erhebung als noch
// aktiv gemeldet hat). Jede Teilmenge läuft durch die Erlaubnisliste.
function zielmenge(kennungen = null) {
  if (kennungen == null) return pruefeZielmenge([...KOHORTE_KENNUNGEN], "Rückbau (vollständige Kohorte)");
  if (!Array.isArray(kennungen)) {
    const fehler = new Error("Rückbau: Zielmenge ist keine Liste von Kennungen");
    fehler.grund = "zielmenge";
    throw fehler;
  }
  return pruefeZielmenge(kennungen, "Rückbau (Teilmenge)");
}

// Führt den Rückbau aus — oder eben nicht.
//
// deps.deaktiviere(id)  → Schreibvorgang je Kennung (Default: provisioning.deactivateTenant)
// deps.leseZustand(id)  → { aktiv } NACH dem Schreibvorgang (Default: storage.getProfile)
// Beide sind injizierbar, damit dieser Ablauf OFFLINE vollständig prüfbar ist,
// ohne je eine echte Datenbank zu berühren.
async function fuehreRueckbauAus({
  kennungen = null,
  modus = MODUS_TROCKENLAUF,
  env = process.env,
  deps = {}
} = {}) {
  const ziel = zielmenge(kennungen);
  const erlaubnis = freigabe(SCHRITT, env);
  const gewuenscht = String(modus || MODUS_TROCKENLAUF).trim().toLowerCase();
  if (gewuenscht !== MODUS_TROCKENLAUF && gewuenscht !== MODUS_SCHARF) {
    const fehler = new Error(`Rückbau: Modus muss ${MODUS_TROCKENLAUF} oder ${MODUS_SCHARF} sein`);
    fehler.grund = "modus";
    throw fehler;
  }
  const wirksam = gewuenscht === MODUS_SCHARF && erlaubnis.erteilt ? MODUS_SCHARF : MODUS_TROCKENLAUF;

  const ergebnisse = [];
  let deaktiviert = 0;
  let bereitsInaktiv = 0;
  let fehlgeschlagen = 0;

  if (wirksam === MODUS_SCHARF) {
    const deaktiviere = deps.deaktiviere
      || ((id) => require("./provisioning").deactivateTenant(id));
    const leseZustand = deps.leseZustand
      || (async (id) => {
        const profil = await require("./storage").getProfile(id);
        return { vorhanden: Boolean(profil), aktiv: Boolean(profil && profil.profileActive !== false) };
      });

    for (const id of ziel) {
      // Doppelte Sicherung an der engsten Stelle: unmittelbar VOR dem
      // Schreibvorgang wird die einzelne Kennung noch einmal gegen die
      // Erlaubnisliste gehalten. Eine Liste, die zwischen Prüfung und Schleife
      // verändert würde, käme hier nicht durch.
      if (!istKohortenKennung(id)) {
        const fehler = new Error(`Rückbau: ${String(id).slice(0, 40)} gehört nicht zur Kohorte — Abbruch`);
        fehler.grund = "fremde-kennung";
        throw fehler;
      }
      let schreibfehler = null;
      try {
        const r = await deaktiviere(id);
        if (r && r.ok === false) schreibfehler = String(r.reason || "deaktivierung-abgelehnt").slice(0, 120);
      } catch (error) {
        schreibfehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      // NACHPRÜFUNG: gemeldet wird nur, was die Ablage trägt.
      let zustand = null;
      let lesefehler = null;
      try {
        zustand = await leseZustand(id);
      } catch (error) {
        lesefehler = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      const jetztInaktiv = Boolean(zustand && zustand.aktiv === false);
      const nichtVorhanden = Boolean(zustand && zustand.vorhanden === false);
      if (jetztInaktiv || nichtVorhanden) {
        if (schreibfehler) bereitsInaktiv += 1; else deaktiviert += 1;
        ergebnisse.push(Object.freeze({ id, zustand: nichtVorhanden ? "nicht-vorhanden" : "inaktiv", schreibfehler, lesefehler }));
      } else {
        fehlgeschlagen += 1;
        ergebnisse.push(Object.freeze({
          id,
          zustand: "weiterhin-aktiv-oder-unbestaetigt",
          schreibfehler,
          lesefehler: lesefehler || (zustand ? null : "kein Zustand gelesen")
        }));
      }
    }
  }

  // KORRIGIERT 02.09. (adversariales Diff-Review, bestaetigter Befund): Eine
  // LEERE Zielmenge meldete `ok: true` — "nichts getan" sah aus wie
  // "vollstaendig zurueckgebaut". Genau in dem Moment, in dem der Rueckweg
  // zaehlt, waere das die gefaehrlichste Falschmeldung (CLAUDE.md §4.4).
  const ok = wirksam === MODUS_SCHARF && fehlgeschlagen === 0 && ziel.length > 0;
  return Object.freeze({
    werkzeug: "rueckbau-ausfuehrer",
    modus: wirksam,
    modusGewuenscht: gewuenscht,
    freigabe: erlaubnis,
    zielGroesse: ziel.length,
    ziel: Object.freeze([...ziel]),
    deaktiviert,
    bereitsInaktiv,
    fehlgeschlagen,
    ergebnisse: Object.freeze(ergebnisse),
    realeMandateBeruehrt: 0,
    loeschtNichts: true,
    ok,
    meldung: wirksam === MODUS_TROCKENLAUF
      ? `TROCKENLAUF: ${ziel.length} Kohortenkennungen wären zu deaktivieren. `
        + `${erlaubnis.meldung} Es wurde nichts geschrieben.`
      : (ok
        ? `Rückbau ausgeführt: ${deaktiviert} deaktiviert, ${bereitsInaktiv} bereits inaktiv, `
          + "0 fehlgeschlagen — jede Zeile nach dem Schreiben gegengelesen."
        : `Rückbau UNVOLLSTÄNDIG: ${fehlgeschlagen} von ${ziel.length} Kennungen sind nicht `
          + "bestätigt inaktiv. Der Lauf wurde NICHT abgebrochen (sonst bliebe der Rest aktiv); "
          + "die betroffenen Kennungen stehen einzeln im Ergebnis.")
  });
}

// ── Nacharbeit: die Scheduler-Spur der Kohorte entfernen ────────────────────
//
// Gleiche drei Riegel wie der Rückweg: Erlaubnisliste (eine fremde Kennung
// bricht ab), zwei unabhängige Freigaben mit EIGENEM Wort, Nachprüfung je
// Zeile. Ein Fehlschlag an einer Kennung beendet den Lauf nicht.
//
// deps.entferneSpur(id) → Schreibvorgang je Kennung
//                         (Default: storage.deleteCronFairnessTenant)
async function entferneSchedulerSpur({
  kennungen = null,
  modus = MODUS_TROCKENLAUF,
  env = process.env,
  deps = {}
} = {}) {
  const ziel = zielmenge(kennungen);
  const erlaubnis = freigabe(SCHRITT_SPUR, env);
  const gewuenscht = String(modus || MODUS_TROCKENLAUF).trim().toLowerCase();
  if (gewuenscht !== MODUS_TROCKENLAUF && gewuenscht !== MODUS_SCHARF) {
    const fehler = new Error(`Scheduler-Spur: Modus muss ${MODUS_TROCKENLAUF} oder ${MODUS_SCHARF} sein`);
    fehler.grund = "modus";
    throw fehler;
  }
  const wirksam = gewuenscht === MODUS_SCHARF && erlaubnis.erteilt ? MODUS_SCHARF : MODUS_TROCKENLAUF;

  const ergebnisse = [];
  let entfernt = 0;
  let fehlgeschlagen = 0;

  if (wirksam === MODUS_SCHARF) {
    const entferneSpur = deps.entferneSpur
      || ((id) => require("./storage").deleteCronFairnessTenant(id));
    for (const id of ziel) {
      // Dieselbe engste Sicherung wie im Rückweg.
      if (!istKohortenKennung(id)) {
        const fehler = new Error(`Scheduler-Spur: ${String(id).slice(0, 40)} gehört nicht zur Kohorte — Abbruch`);
        fehler.grund = "fremde-kennung";
        throw fehler;
      }
      let fehlermeldung = null;
      let bestaetigt = false;
      try {
        const r = await entferneSpur(id);
        // Gemeldet wird nur, was die Ablage trägt: `ok === true` ist die
        // einzige Bestätigung. Alles andere zählt als Fehlschlag.
        bestaetigt = Boolean(r && r.ok === true);
        if (!bestaetigt) fehlermeldung = String((r && r.grund) || "spur-nicht-bestaetigt").slice(0, 120);
      } catch (error) {
        fehlermeldung = String((error && error.message) || error || "unbekannt").slice(0, 120);
      }
      if (bestaetigt) entfernt += 1; else fehlgeschlagen += 1;
      ergebnisse.push(Object.freeze({ id, entfernt: bestaetigt, fehler: fehlermeldung }));
    }
  }

  // KORRIGIERT 02.09. (adversariales Diff-Review, bestaetigter Befund): Eine
  // LEERE Zielmenge meldete `ok: true` — "nichts getan" sah aus wie
  // "vollstaendig zurueckgebaut". Genau in dem Moment, in dem der Rueckweg
  // zaehlt, waere das die gefaehrlichste Falschmeldung (CLAUDE.md §4.4).
  const ok = wirksam === MODUS_SCHARF && fehlgeschlagen === 0 && ziel.length > 0;
  return Object.freeze({
    werkzeug: "scheduler-spur",
    schritt: SCHRITT_SPUR,
    modusGewuenscht: gewuenscht,
    modus: wirksam,
    freigabe: erlaubnis,
    zielGroesse: ziel.length,
    entfernt,
    fehlgeschlagen,
    // Ausdrücklich: hier werden NUR Scheduler-Metadaten entfernt.
    beruehrtProfildaten: false,
    realeMandateBeruehrt: 0,
    ergebnisse: Object.freeze(ergebnisse),
    ok,
    meldung: wirksam === MODUS_TROCKENLAUF
      ? `Trockenlauf: ${ziel.length} Kennungen wären an der Scheduler-Spur bereinigt worden. `
        + `${erlaubnis.meldung} Es wurde nichts geschrieben.`
      : (ok
        ? `Scheduler-Spur bereinigt: ${entfernt} Kennungen, 0 fehlgeschlagen.`
        : `Scheduler-Spur UNVOLLSTÄNDIG: ${fehlgeschlagen} von ${ziel.length} Kennungen nicht `
          + "bestätigt entfernt. Der Lauf wurde NICHT abgebrochen; die betroffenen Kennungen "
          + "stehen einzeln im Ergebnis.")
  });
}

module.exports = {
  SCHRITT,
  SCHRITT_SPUR,
  FREIGABEWORT_SPUR: FREIGABEWORTE[SCHRITT_SPUR],
  entferneSchedulerSpur,
  EXECUTE_FLAG,
  CONFIRM_VARIABLE,
  FREIGABEWORT: FREIGABEWORTE[SCHRITT],
  MODUS_TROCKENLAUF,
  MODUS_SCHARF,
  zielmenge,
  fuehreRueckbauAus
};
