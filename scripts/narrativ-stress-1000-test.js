"use strict";

// Helmut — STRESSTEST 1 000 MANDATE MIT ALLEN FUENF AUFTRAGSTYPEN (E1: tenant_narrative).
// =============================================================================================
// EIGENE Suite, getrennt von `scripts/narrativ-stufen-test.js`: der 1 000er-Lauf allein
// braucht ~2 Minuten; in einer gemeinsamen Datei laege der Lauf ueber dem 180-s-Zeitlimit
// des kanonischen Runners und wuerde abgeschossen (beim ersten vollstaendigen Offline-Lauf
// dieses Sprints genau so passiert, exit=null).
//
// KEIN Abnahmekriterium fuer Phase 1 — er dient ausschliesslich der Erkennung frueher
// Architekturgrenzen. Ein Fehlschlag hier ist KEIN Grund, den 200er-Nachweis abzulehnen,
// und ein Erfolg ist keine Zusage. Dieselben Grenzen wie in der Stufensuite: lokale
// Simulation, kein Production-Beweis.

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const { simuliereTag } = require(path.join(ROOT, "scripts/fixtures/skalierung-lauf.js"));

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) { offen += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
const z = (n) => Number(n).toLocaleString("de-DE");
const uhrzeit = (ms) => {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

// Dieselbe Preisgrundlage wie in der Stufensuite (dort begruendet und gekennzeichnet).
const USD_JE_NARRATIV_AUFRUF = 0.001307;
const USD_JE_VERSTEHEN_AUFRUF = 0.0025;
const NUTZUNGSTAGE = 22;
const MARGE = 1.3;

async function main() {
  console.log("Helmut — Stresstest 1 000 Mandate, fuenf Auftragstypen (E1: tenant_narrative)");
  console.log("  dasselbe unfreundliche Szenario und Stoerprofil wie narrativ-stufen-test.js\n");

  const r = await simuliereTag({
    anzahlMandate: 1000,
    deckel: 90000,
    fairness: true,
    narrativ: true,
    narrativStoerung: { fehlerRate: 0.05, rateLimitRate: 0.02, timeoutRate: 0.03 },
    workerJeRunde: 4,
    drosselung: 0.1,
    ausfall: ["bundestag.de"],
    absturzInStunde: 6,
    doppelterScheduler: true,
    langsam: true,
    deaktivierteMandate: 100,
    neueMandateAbStunde: 8,
    neueMandate: 50,
    vorlaufRueckstand: 1000,
    grossesMandat: true
  });
  const nrv = r.narrativ || {};
  const gescheitert = (nrv.fehler || 0) + (nrv.rateLimits || 0) + (nrv.timeouts || 0);
  const kosten = nrv.erzeugt * USD_JE_NARRATIV_AUFRUF + r.ki.aufrufe * USD_JE_VERSTEHEN_AUFRUF;

  console.log(`  Auftraege gesamt ${z(r.queue.gesamt)} · Narrative ${z(nrv.veroeffentlichteMandate)} ·`
    + ` Narrativ-Aufrufe ${z(nrv.aufrufe)} · Verstehen ${z(r.ki.aufrufe)} ·`
    + ` Anbieterzeit ${z(Math.round(nrv.anbieterZeitMs / 1000))} s`);
  console.log(`  erstes/letztes Narrativ ${uhrzeit(nrv.erstesFertigMs)}/${uhrzeit(nrv.letztesFertigMs)} ·`
    + ` Pflichtarbeit fertig ${uhrzeit(r.fertigMs)} · groesste Queue ${z(r.queue.maxQueue)} Zeilen`);
  console.log(`  Kosten (Tag) ${kosten.toFixed(4)} USD · (Monat, ${NUTZUNGSTAGE} Tage) ${(kosten * NUTZUNGSTAGE).toFixed(2)} USD ·`
    + ` mit 30 % Marge ${(kosten * NUTZUNGSTAGE * MARGE).toFixed(2)} USD · unbekannte Aufrufe ${z(gescheitert)}\n`);

  check("S1 Alle 1 000 aktiven Mandate haben ein veroeffentlichtes Narrativ",
    (nrv.veroeffentlichteMandate || 0) >= 1000, `${nrv.veroeffentlichteMandate}/1000`);
  check("S2 Kein Verlust, kein Doppel-Narrativ, kein fremder Mandatskontext",
    (r.verloren + r.unterPlan) === 0 && (nrv.doppeltErzeugt || 0) === 0
    && (nrv.fremd || 0) === 0 && r.fremdzugriffe === 0);
  check("S3 Deaktivierte Mandate bleiben unberuehrt", r.mandate.deaktivierteInArbeit === 0,
    `${r.mandate.deaktiviertBeigemischt} beigemischt`);
  check("S4 Kein Budget ueberschritten", r.kosten.buchungen <= r.deckel,
    `${z(r.kosten.buchungen)} von ${z(r.deckel)}`);
  check("S5 Das Stoerprofil hat wirklich gestoert (Fehler/Rate Limits/Timeouts > 0)",
    gescheitert > 0, `${nrv.fehler} Fehler · ${nrv.rateLimits} Rate Limits · ${nrv.timeouts} Timeouts`);
  check("S5b Kein Narrativauftrag endet endgueltig fehlgeschlagen (Wiederholung traegt)",
    (nrv.fehlgeschlagen || 0) === 0, `fehlgeschlagen=${nrv.fehlgeschlagen}`);
  check("S6 Jeder gescheiterte Aufruf zaehlt als UNBEKANNTE Kosten (nie still 0)",
    gescheitert > 0, `${gescheitert} Aufrufe unbekannt`);
  if (r.fertigMs != null && r.fertigMs <= 24 * 3600 * 1000 && r.queue.wartendFaellig === 0) {
    check("S7 Auch bei 1 000 Mandaten ist die Pflichtarbeit im Tag fertig", true,
      `fertig ${uhrzeit(r.fertigMs)}`);
  } else {
    nichtBewiesen("S7 Vollstaendige Abarbeitung bei 1 000 Mandaten",
      "die Pflichtarbeit wurde im simulierten Tag nicht fertig — frueheste erkennbare "
      + "Architekturgrenze, KEIN Abnahmekriterium fuer Phase 1.");
  }

  nichtBewiesen("S8 Production-Tauglichkeit fuer 1 000 Mandate",
    "lokale Simulation (synthetische Profile, In-Speicher-Ablage, Anbieter-Adapter, "
    + "virtuelle Uhr) — eine Zahl zur Architektur, keine Zusage.");

  console.log(`\nERGEBNIS: PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
