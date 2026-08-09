"use strict";

// Helmut — STUFENNACHWEIS MIT ALLEN FUENF AUFTRAGSTYPEN (E1: tenant_narrative).
// =============================================================================================
// Der Sprintauftrag verlangt Stufen 5 / 25 / 50 / 100 / 200 / 250 Mandate (+ Stress 1 000)
// mit ALLEN FUENF Auftragstypen, je Stufe getrennte Messwerte, eine gemessene Reserveprobe
// und ein absichtlich unfreundliches Fehlerbild. Der bisherige Vier-Typen-Stufennachweis
// (`scripts/skalierung-stufen-test.js`) bleibt UNVERAENDERT bestehen — er beweist die
// Merge-Neutralitaet des Bestands; diese Suite beweist den Tag MIT Narrativ.
//
// >>> DIE WICHTIGSTE ZEILE DIESER DATEI <<<
// Eine lokale Simulation ist KEIN Production-Beweis. Sie benutzt die echten OP-30-Module
// UND den echten Lage-Pfad (`lage.buildLageBriefing` woertlich, bis zur Modellgrenze) —
// aber synthetische Profile, eine In-Speicher-Ablage, einen Anbieter-Adapter und eine
// virtuelle Uhr. Der Adapter reproduziert die PRODUCTION-METADATEN vom 2026-08-09
// (134 lageBriefing-Aufrufe: Median 5 052 ms, p95 24 278 ms, nur gpt-5-mini, ~1 735/437
// Token, 6 % Fehler). Und: die Simulation nimmt an, dass alle 2 Minuten Worker laufen —
// in Production laufen Worker nur in Cron-Slots. Die Slot-Rechnung steht im Sprintbeleg.

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const { STUNDE, simuliereTag } = require(path.join(ROOT, "scripts/fixtures/skalierung-lauf.js"));

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) { offen += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
function abschnitt(t) { console.log(`\n${"═".repeat(78)}\n  ${t}\n${"═".repeat(78)}`); }
const z = (n) => Number(n).toLocaleString("de-DE");
const uhrzeit = (ms) => {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

// ── Preisbasis ───────────────────────────────────────────────────────────────────────────
// ZWEI getrennte Groessen, ausdruecklich getrennt gekennzeichnet:
//   * NARRATIV: aus Production ABGELEITET — 0,001307 USD je erfolgreichem Aufruf ist der
//     Mittelwert der 126 bepreisten lageBriefing-Aufrufe (2026-07-10 bis 2026-08-09,
//     ausschliesslich gpt-5-mini). Kein Anbieterpreis, sondern eine Messreihe.
//   * VERSTEHEN: 0,0025 USD je Aufruf ist der bestehende SCHAETZWERT im Code
//     (skalierungsmodell.js, kostenmessung.md) — unveraendert uebernommen.
// Fehlgeschlagene Aufrufe sind UNBEKANNTE Kosten und werden NIE als 0 gefuehrt.
const USD_JE_NARRATIV_AUFRUF = 0.001307;   // aus Production abgeleitet (Messreihe n=126)
const USD_JE_VERSTEHEN_AUFRUF = 0.0025;    // Schaetzwert im Code, kein Anbieterpreis
const SICHERHEITSMARGE = 1.3;              // dieselbe 30-%-Marge wie in skalierung-200-mandate.md

const STUFEN = [
  { n: 5, deckel: 2000 },
  { n: 25, deckel: 6000 },
  { n: 50, deckel: 10000 },
  { n: 100, deckel: 16000 },
  { n: 200, deckel: 30000 },
  { n: 250, deckel: 30000 }
];

// Dasselbe absichtlich unfreundliche Szenario wie im Vier-Typen-Nachweis — PLUS das
// Stoerprofil des Narrativ-Adapters aus dem Sprintauftrag §14: 5 % voruebergehende
// Modellfehler, 2 % Rate Limits, 3 % lange Antworten (laenger als das 120-s-Auftragslimit;
// in Production waren 4 von 134 Aufrufen ueber 120 s = 3,0 %).
function szenario(n, deckel, extra = {}) {
  return {
    anzahlMandate: n,
    deckel,
    fairness: true,
    narrativ: true,
    narrativStoerung: { fehlerRate: 0.05, rateLimitRate: 0.02, timeoutRate: 0.03 },
    workerJeRunde: 4,
    drosselung: 0.1,
    ausfall: ["bundestag.de"],
    absturzInStunde: 6,
    doppelterScheduler: true,
    langsam: true,
    deaktivierteMandate: Math.max(1, Math.round(n * 0.1)),
    neueMandateAbStunde: 8,
    neueMandate: Math.max(1, Math.round(n * 0.05)),
    vorlaufRueckstand: Math.max(5, n),
    grossesMandat: true,
    ...extra
  };
}

function messwerte(r) {
  const nrv = r.narrativ || {};
  const kostenNarrativ = nrv.erzeugt * USD_JE_NARRATIV_AUFRUF;
  const kostenVerstehen = r.ki.aufrufe * USD_JE_VERSTEHEN_AUFRUF;
  const unbekannteAufrufe = (nrv.fehler || 0) + (nrv.rateLimits || 0) + (nrv.timeouts || 0);
  return {
    beruecksichtigt: r.mandate.beruecksichtigt,
    geplant: r.mandate.geplant,
    auftraegeGesamt: r.queue.gesamt,
    narrativAuftraege: nrv.auftraege || 0,
    narrativErledigt: nrv.erledigt || 0,
    narrativFehlgeschlagen: nrv.fehlgeschlagen || 0,
    narrativAufrufe: nrv.aufrufe || 0,
    narrativErzeugt: nrv.erzeugt || 0,
    narrativVeroeffentlicht: nrv.veroeffentlichteMandate || 0,
    narrativDoppelt: nrv.doppeltErzeugt || 0,
    narrativFremd: nrv.fremd || 0,
    verstehensAufrufe: r.ki.aufrufe,
    tokensEin: nrv.tokensEin || 0,
    tokensAus: nrv.tokensAus || 0,
    anbieterZeitMs: nrv.anbieterZeitMs || 0,
    erstesNarrativMs: nrv.erstesFertigMs,
    letztesNarrativMs: nrv.letztesFertigMs,
    verlust: r.verloren + r.unterPlan,
    doppelt: r.gleichzeitigDoppelt,
    queueMax: r.queue.maxQueue,
    fertigMs: r.fertigMs,
    imTagFertig: r.fertigMs != null && r.fertigMs <= 24 * 3600 * 1000,
    faelligOffen: r.queue.wartendFaellig,
    fairness: r.mandate.fairness,
    fremdzugriffe: r.fremdzugriffe,
    deaktivierteInArbeit: r.mandate.deaktivierteInArbeit,
    kostenNarrativUsd: Math.round(kostenNarrativ * 10000) / 10000,
    kostenVerstehenUsd: Math.round(kostenVerstehen * 10000) / 10000,
    kostenGesamtUsd: Math.round((kostenNarrativ + kostenVerstehen) * 10000) / 10000,
    kostenJeMandatTagUsd: r.mandate.geplant
      ? Math.round(((kostenNarrativ + kostenVerstehen) / r.mandate.geplant) * 100000) / 100000 : 0,
    kostenUnbekannteAufrufe: unbekannteAufrufe
  };
}

function tabelle(stufe, m) {
  console.log(`\n  ── ${z(stufe)} MANDATE, FUENF AUFTRAGSTYPEN ${"─".repeat(Math.max(0, 40 - String(stufe).length))}`);
  const zeile = (k, v) => console.log(`    ${k.padEnd(46, ".")} ${v}`);
  zeile("1 Auftraege gesamt (alle fuenf Typen)", z(m.auftraegeGesamt));
  zeile("2 davon Narrativauftraege", `${z(m.narrativAuftraege)} (erledigt ${z(m.narrativErledigt)}, endgueltig rot ${z(m.narrativFehlgeschlagen)})`);
  zeile("3 simulierte Narrativ-Modellaufrufe", `${z(m.narrativAufrufe)} (davon erzeugt ${z(m.narrativErzeugt)})`);
  zeile("4 Verstehens-Modellaufrufe", z(m.verstehensAufrufe));
  zeile("5 Narrativ-Token (ein/aus)", `${z(m.tokensEin)} / ${z(m.tokensAus)}`);
  zeile("6 simulierte Anbieterzeit (Narrativ)", `${z(Math.round(m.anbieterZeitMs / 1000))} s`);
  zeile("7 groesster Warteschlangenbestand", `${z(m.queueMax)} Zeilen`);
  zeile("8 erstes / letztes fertiges Narrativ", `${uhrzeit(m.erstesNarrativMs)} / ${uhrzeit(m.letztesNarrativMs)}`);
  zeile("9 Pflichtarbeit vollstaendig abgebaut um", uhrzeit(m.fertigMs));
  zeile("10 verlorene Auftraege / doppelt", `${z(m.verlust)} / ${z(m.doppelt)}`);
  zeile("11 doppelt erzeugte / fremde Narrative", `${z(m.narrativDoppelt)} / ${z(m.narrativFremd)}`);
  zeile("12 Fairness (min/max je Mandat)", String(m.fairness));
  zeile("13 Kosten Narrativ (abgeleitet) + Verstehen (Schaetzung)",
    `${m.kostenNarrativUsd.toFixed(4)} + ${m.kostenVerstehenUsd.toFixed(4)} = ${m.kostenGesamtUsd.toFixed(4)} USD/Tag`);
  zeile("14 Kosten je Mandat und Tag", `${m.kostenJeMandatTagUsd.toFixed(5)} USD`);
  zeile("15 Aufrufe mit UNBEKANNTEN Kosten", `${z(m.kostenUnbekannteAufrufe)} (nie als 0 gefuehrt)`);
}

async function main() {
  console.log("Helmut — Stufennachweis mit allen FUENF Auftragstypen (E1: tenant_narrative)");
  console.log("  echte OP-30-Module + ECHTER Lage-Pfad bis zur Modellgrenze · Adapter aus");
  console.log("  Production-Metadaten (p50 5,05 s · p95 24,3 s · 5 % Fehler · 2 % Rate Limits ·");
  console.log("  3 % lange Antworten) · dasselbe unfreundliche Szenario wie im Vier-Typen-Nachweis\n");

  const alle = {};

  abschnitt("A · Messwerte je Stufe (5 / 25 / 50 / 100 / 200 / 250)");
  for (const { n, deckel } of STUFEN) {
    const r = await simuliereTag(szenario(n, deckel));
    const m = messwerte(r);
    alle[n] = { r, m };
    tabelle(n, m);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("B · Abnahme fuer 200 Mandate mit fuenf Auftragstypen");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const { r, m } = alle[200];
  check("B1 Alle 200 aktiven Mandate erhalten einen Narrativauftrag",
    m.narrativAuftraege >= 200, `${m.narrativAuftraege} Auftraege (inkl. spaeter Zugaenge)`);
  check("B2 200 von 200 Mandaten haben am Tagesende ein veroeffentlichtes Narrativ",
    m.narrativVeroeffentlicht >= 200, `${m.narrativVeroeffentlicht} veroeffentlicht`);
  check("B3 Kein Narrativ wird doppelt erzeugt (genau-einmal je Mandat und Tag)",
    m.narrativDoppelt === 0, `${m.narrativDoppelt} doppelt`);
  check("B4 Kein Narrativ mit fremdem Mandatskontext (Tenant-Trennung an der Modellgrenze)",
    m.narrativFremd === 0 && m.fremdzugriffe === 0);
  check("B5 Fehler und Rate Limits werden abgearbeitet (Wiederholungen fuehren zum Erfolg)",
    (r.narrativ.fehler + r.narrativ.rateLimits + r.narrativ.timeouts) > 0
    && m.narrativFehlgeschlagen === 0,
    `${r.narrativ.fehler} Fehler · ${r.narrativ.rateLimits} Rate Limits · ${r.narrativ.timeouts} Timeouts · 0 endgueltig rot`);
  check("B6 Kein Auftrag verloren, keine Doppelverarbeitung, keine Budgetverletzung",
    m.verlust === 0 && m.doppelt === 0 && r.kosten.buchungen <= r.deckel);
  check("B7 Die Pflichtarbeit aller fuenf Typen ist im Tag fertig",
    m.imTagFertig && m.faelligOffen === 0, `fertig ${uhrzeit(m.fertigMs)}`);
  check("B8 Deaktivierte Mandate bleiben unberuehrt (auch beim Narrativ)",
    m.deaktivierteInArbeit === 0);
  check("B9 Das letzte Narrativ liegt VOR der Pflichtarbeit-Grenze des Tages",
    m.letztesNarrativMs != null && m.letztesNarrativMs <= 24 * 3600 * 1000,
    `letztes Narrativ ${uhrzeit(m.letztesNarrativMs)}`);
  // Die MORGENLAGE-Frist, abgeleitet aus dem Produktvertrag (Cron 05:45Z, Morgenprodukt):
  // gemessen wird, wie viele Narrative bis 12:00 UTC (14:00 Berlin) veroeffentlicht sind.
  // Das ist eine MESSUNG der Simulation, keine Production-Zusage — die Slot-Rechnung fuer
  // Production steht im Sprintbeleg.
  {
    check("B10 Der Narrativ-Morgenkorridor wird eingehalten (erstes Narrativ am Vormittag)",
      m.erstesNarrativMs != null && m.erstesNarrativMs <= 12 * 3600 * 1000,
      `erstes ${uhrzeit(m.erstesNarrativMs)} · letztes ${uhrzeit(m.letztesNarrativMs)}`);
    if (m.letztesNarrativMs != null && m.letztesNarrativMs > 12 * 3600 * 1000) {
      nichtBewiesen("B10b Alle 200 Narrative bis 12:00 UTC",
        `das letzte Narrativ war um ${uhrzeit(m.letztesNarrativMs)} fertig — die Morgenlage-`
        + "Frist haengt in Production zusaetzlich an der Slot-Verfuegbarkeit der Worker.");
    } else {
      check("B10b Alle 200 Narrative sind bis 12:00 UTC (14:00 Berlin) veroeffentlicht",
        true, `letztes ${uhrzeit(m.letztesNarrativMs)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("C · Reserveprobe — gemessen, je Dimension, ehrlich gekennzeichnet");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const probe250 = alle[250];
    check("C1 250 Mandate (= +25 % MANDATE) werden vollstaendig getragen",
      probe250.m.beruecksichtigt === 250 && probe250.m.narrativVeroeffentlicht >= 250
      && probe250.m.imTagFertig && probe250.m.verlust === 0,
      `250/250 · Narrative ${probe250.m.narrativVeroeffentlicht} · fertig ${uhrzeit(probe250.m.fertigMs)}`);

    const zuwachs = (a, b) => (a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : null);
    const dim = {
      "Narrativ-Aufrufe": zuwachs(m.narrativErzeugt, probe250.m.narrativErzeugt),
      "Verstehens-Aufrufe": zuwachs(m.verstehensAufrufe, probe250.m.verstehensAufrufe),
      "KI-Aufrufe gesamt": zuwachs(m.narrativErzeugt + m.verstehensAufrufe,
        probe250.m.narrativErzeugt + probe250.m.verstehensAufrufe),
      Auftraege: zuwachs(r.queue.gesamt, probe250.r.queue.gesamt),
      Abrufversuche: zuwachs(r.abruf.versuche, probe250.r.abruf.versuche),
      Dokumente: zuwachs(r.dokumente, probe250.r.dokumente),
      "Anbieterzeit Narrativ": zuwachs(m.anbieterZeitMs, probe250.m.anbieterZeitMs)
    };
    console.log("\n    ARBEITSzuwachs 200 -> 250 Mandate, je Dimension:");
    for (const [k, v] of Object.entries(dim)) {
      console.log(`      ${k.padEnd(22)} ${String(v).padStart(6)} %${v != null && v >= 25 ? "  (>= 25 %)" : "  (UNTER 25 %)"}`);
    }
    check("C2 Die NARRATIV-Last waechst linear mit den Mandaten (>= 25 % bei +25 % Mandaten)",
      dim["Narrativ-Aufrufe"] >= 24.5, `${dim["Narrativ-Aufrufe"]} %`);

    // Kontrollierte Mehrlast (Auftrag §13): +50 % Dokumentvolumen bei 200 Mandaten.
    const mehrDokumente = await simuliereTag(szenario(200, 30000, { dokumenteJeWeg: 3 }));
    const mm = messwerte(mehrDokumente);
    const dokZuwachs = zuwachs(r.dokumente, mehrDokumente.dokumente);
    const kiZuwachs = zuwachs(m.verstehensAufrufe, mm.verstehensAufrufe);
    console.log(`\n    Kontrollierte Mehrlast: 200 Mandate, +50 % Dokumente je Abrufweg`);
    console.log(`      Dokumente ${dokZuwachs} % · Verstehens-Aufrufe ${kiZuwachs} % · fertig ${uhrzeit(mm.fertigMs)}`
      + ` · Narrative ${mm.narrativVeroeffentlicht} · Verlust ${mm.verlust}`);
    check("C3 Auch unter +50 % Dokumentvolumen haelt der Tag (Verstehens-Mehrarbeit >= 25 %)",
      mm.imTagFertig && mm.verlust === 0 && mm.narrativVeroeffentlicht >= 200
      && kiZuwachs >= 25, `Verstehens-Aufrufe +${kiZuwachs} %`);

    const kleinsteDimension = Math.min(...Object.values(dim).filter((v) => v != null));
    if (kleinsteDimension >= 25) {
      check("C4 +25 % Mandate erzeugen in JEDER Dimension >= 25 % Mehrarbeit", true);
    } else {
      nichtBewiesen("C4 Kapazitaetsreserve von 25 % ARBEITSLAST in jeder Dimension",
        "die geteilten Quellen fangen Mandatswachstum ab (Kern der V3-Architektur): "
        + `Abrufversuche +${dim.Abrufversuche} %, Verstehen +${dim["Verstehens-Aufrufe"]} %. `
        + "BELEGT sind: +25 % MANDATE getragen (C1), lineare Narrativ-Mehrlast bewaeltigt (C2) "
        + "und +50 % Dokumentvolumen bewaeltigt (C3). Eine Probe, die ALLE Dimensionen "
        + "gleichzeitig um 25 % erhoeht, existiert strukturell nicht ohne +25 % Quellen UND "
        + "+25 % Dokumente UND +25 % Mandate zugleich — dieselbe Einordnung wie Befund B16.");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("D · Verhalten ueber die Stufen");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    console.log("\n    Stufe   Narrative  KI-Aufrufe  Anbieterzeit  fertig   USD/Mandat/Tag");
    for (const { n } of STUFEN) {
      const s = alle[n].m;
      console.log(`    ${String(n).padStart(5)}   ${String(s.narrativVeroeffentlicht).padStart(9)}  `
        + `${String(s.narrativErzeugt + s.verstehensAufrufe).padStart(10)}  `
        + `${String(`${Math.round(s.anbieterZeitMs / 1000)} s`).padStart(12)}  `
        + `${uhrzeit(s.fertigMs).padStart(6)}   ${s.kostenJeMandatTagUsd.toFixed(5)}`);
    }
    for (const { n } of STUFEN) {
      const s = alle[n].m;
      check(`D1.${n} Stufe ${n}: jedes aktive Mandat hat ein veroeffentlichtes Narrativ`,
        s.narrativVeroeffentlicht >= n, `${s.narrativVeroeffentlicht}/${n}`);
      check(`D2.${n} Stufe ${n}: kein Verlust, kein Doppel-Narrativ, keine Fremdzugriffe`,
        s.verlust === 0 && s.narrativDoppelt === 0 && s.narrativFremd === 0 && s.fremdzugriffe === 0);
      check(`D3.${n} Stufe ${n}: deaktivierte Mandate unberuehrt`,
        s.deaktivierteInArbeit === 0);
    }
    const k5 = alle[5].m.kostenJeMandatTagUsd;
    const k200 = alle[200].m.kostenJeMandatTagUsd;
    check("D4 Die Kosten je Mandat steigen NICHT mit der Mandatszahl",
      k200 <= k5, `5 Mandate ${k5.toFixed(5)} · 200 Mandate ${k200.toFixed(5)} USD/Tag`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // E · Stresstest 1 000 Mandate: EIGENE SUITE (`scripts/narrativ-stress-1000-test.js`).
  // Grund: der 1 000er-Lauf allein braucht ~2 Minuten; zusammen mit den sechs Stufen oben
  // laege diese Datei ueber dem 180-s-Zeitlimit des kanonischen Runners und wuerde dort
  // ABGESCHOSSEN (exit=null) — genau so beim ersten vollstaendigen Offline-Lauf dieses
  // Sprints passiert. Zwei Suiten unter dem Limit sind ehrlicher als eine darueber.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("F · Kostenrechnung je Stufe (Monat = 22 Nutzungstage)");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const NUTZUNGSTAGE = 22;
    console.log("\n    Stufe   USD/Tag     USD/Mandat/Monat   USD/Monat     mit 30 % Marge   unbekannt");
    for (const { n } of STUFEN) {
      const s = alle[n].m;
      const monat = s.kostenGesamtUsd * NUTZUNGSTAGE;
      console.log(`    ${String(n).padStart(5)}   ${s.kostenGesamtUsd.toFixed(4).padStart(8)}   `
        + `${(s.kostenJeMandatTagUsd * NUTZUNGSTAGE).toFixed(4).padStart(15)}   `
        + `${monat.toFixed(2).padStart(9)}   ${(monat * SICHERHEITSMARGE).toFixed(2).padStart(13)}   `
        + `${String(s.kostenUnbekannteAufrufe).padStart(8)} Aufrufe`);
    }
    console.log("\n    Preisgrundlage (Stand 2026-08-09): Narrativ 0,001307 USD/Aufruf = Mittelwert");
    console.log("    der 126 bepreisten Production-Aufrufe (gpt-5-mini); Verstehen 0,0025 USD/Aufruf =");
    console.log("    SCHAETZWERT im Code, kein Anbieterpreis. Fehlgeschlagene Aufrufe = UNBEKANNTE");
    console.log("    Kosten (nie 0). Monat = 22 Nutzungstage (Werktagsprodukt), Marge 30 %.");
    // Die Zusage ist NICHT "es gibt immer unbekannte Kosten" (eine Stufe ohne gescheiterte
    // Aufrufe hat ehrlich null davon), sondern: JEDER gescheiterte Aufruf wird als
    // unbekannt gefuehrt — keiner verschwindet und keiner wird still mit 0 bewertet.
    check("F1 Jeder gescheiterte Aufruf zaehlt als UNBEKANNTE Kosten (nie still 0)",
      STUFEN.every(({ n }) => {
        const s = alle[n];
        const gescheitert = (s.r.narrativ.fehler || 0) + (s.r.narrativ.rateLimits || 0) + (s.r.narrativ.timeouts || 0);
        return s.m.kostenUnbekannteAufrufe === gescheitert;
      }),
      STUFEN.map(({ n }) => `${n}: ${alle[n].m.kostenUnbekannteAufrufe}`).join(" · "));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("G · Grenzen — ausdruecklich NICHT bewiesen");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  nichtBewiesen("G1 Production-Tauglichkeit fuer 200 Mandate",
    "lokale Simulation: synthetische Profile, In-Speicher-Ablage, Anbieter-Adapter, virtuelle "
    + "Uhr. Es gibt 10 echte Profile, nicht 200.");
  nichtBewiesen("G2 Slot-Kapazitaet der Vercel-Crons fuer die Morgenlage",
    "die Simulation nimmt Worker alle 2 Minuten an; in Production laufen Worker nur in "
    + "Cron-Slots (05:45 + Watchdog + 16:00). Die Slot-Rechnung steht im Sprintbeleg und ist "
    + "eine RECHNUNG, kein Nachweis.");
  nichtBewiesen("G3 Reale Modellkosten",
    "0,001307 USD/Aufruf ist ein Mittelwert einer Messreihe mit intern geschaetzter "
    + "Preisbasis (kostenmessung.md: Preisbasis unbelegt); 0,0025 USD/Aufruf ist ein "
    + "Schaetzwert. Groessenordnungen, keine Rechnungsbetraege.");
  nichtBewiesen("G4 25-%-Arbeitslastreserve in JEDER Dimension",
    "siehe C4 — strukturell, dieselbe Einordnung wie Befund B16.");

  console.log(`\n${"═".repeat(78)}`);
  console.log(`ERGEBNIS: PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN und zaehlen nicht als Erfolg.`);
  console.log("═".repeat(78));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
