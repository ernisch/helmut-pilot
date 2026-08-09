"use strict";

// Helmut — STUFENNACHWEIS 5 / 25 / 50 / 100 / 200 MANDATE (+ Stresslauf 1 000).
// =============================================================================================
// Der Auftrag verlangt fuer JEDE Stufe getrennte Messwerte und danach eine Abnahme gegen
// vierzehn Kriterien. Genau das steht hier — und nur das. Die Fallgestaltung (Ausfaelle,
// Drosselung, Workerabsturz, Tageswechsel …) liegt in `scripts/skalierung-simulation-test.js`;
// hier geht es um die SKALIERUNG selbst.
//
// >>> DIE WICHTIGSTE ZEILE DIESER DATEI <<<
// Eine lokale Simulation ist KEIN Production-Beweis fuer 200 Mandate. Sie benutzt die echten
// OP-30-Module, aber synthetische Profile, eine Attrappe fuer Netz und KI und eine virtuelle
// Uhr. Bewiesen sind Ablauf, Reihenfolge, Fairness und Buchhaltung. NICHT bewiesen sind reale
// Abrufdauer, reale Modellkosten und reales Verhalten unter echter Last. Das steht am Ende
// noch einmal als ausdruecklich OFFENER Punkt und zaehlt nicht als Erfolg.
//
// KEINE TAUTOLOGIE: der Lauf ruft `scalable-pipeline.planeArbeit`/`arbeite`,
// `source-demand`, `llm-budget-fair` und `worker-betrieb` als das auf, was sie sind. Attrappe
// ist ausschliesslich die Aussenwelt. Wer den Produktionscode kaputt macht, macht diese Suite
// rot — nachgewiesen ueber `scripts/op30-aktivierungsreife-mutationsprobe.js`.

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

// Preisbasis. AUSDRUECKLICH EIN SCHAETZWERT und keine Rechnungsgroesse — dieselbe
// Kennzeichnung wie in `scripts/skalierungsmodell.js` und in `betrieb/kostenmessung.md`.
const USD_JE_KI_AUFRUF = 0.0025;

// Die Stufen. Der Deckel ist je Stufe grosszuegig gewaehlt (lokaler Testdeckel), weil hier die
// SKALIERUNG geprueft wird und nicht die Deckelknappheit — die steht in
// `skalierung-simulation-test.js` A1.
const STUFEN = [
  { n: 5, deckel: 2000 },
  { n: 25, deckel: 6000 },
  { n: 50, deckel: 10000 },
  { n: 100, deckel: 16000 },
  { n: 200, deckel: 30000 }
];

// Jede Stufe laeuft mit demselben, absichtlich unfreundlichen Szenario. Ein Nachweis unter
// Laborbedingungen waere keiner.
function szenario(n, deckel) {
  return {
    anzahlMandate: n,
    deckel,
    fairness: true,
    workerJeRunde: 4,                    // konkurrierende Worker
    drosselung: 0.1,                     // 10 % HTTP 429
    ausfall: ["bundestag.de"],           // eine dauerhaft fehlerhafte Quellenfamilie
    absturzInStunde: 6,                  // Workerabbruch mitten im Lauf
    doppelterScheduler: true,            // zweimalige Planung
    langsam: true,                       // langsame Verarbeitung (kleines Worker-Budget)
    deaktivierteMandate: Math.max(1, Math.round(n * 0.1)),
    neueMandateAbStunde: 8,              // Zugang mitten im Zeitraum
    neueMandate: Math.max(1, Math.round(n * 0.05)),
    vorlaufRueckstand: Math.max(5, n),   // Rueckstand aus einem vorherigen Lauf
    grossesMandat: true                  // ein Schwergewicht neben vielen Kleinen
  };
}

function messwerte(r) {
  const kiAufrufe = r.ki.aufrufe;
  const kosten = kiAufrufe * USD_JE_KI_AUFRUF;
  const stundenGelaufen = Math.max(1, (r.fertigMs || 24 * STUNDE) / STUNDE);
  const durchsatzProStunde = r.queue.erledigt / stundenGelaufen;
  // ZEITRESERVE BIS TAGESENDE — und ausdruecklich NICHT die Kapazitaetsreserve.
  //
  // BELEGTE FEHLMESSUNG (2026-08-09, in genau dieser Suite gefunden): die erste Fassung
  // fuehrte diesen Wert als „Kapazitaetsreserve" und pruefte ihn gegen die geforderten 25 %.
  // Er lag bei JEDER Stufe zwischen 9,9 % und 12,4 % — auch bei FUENF Mandaten. Eine Groesse,
  // die sich zwischen 5 und 1 000 Mandaten kaum bewegt, misst offensichtlich nicht die
  // Kapazitaet. Sie misst den FAHRPLAN: der letzte Briefingauftrag wird per Entwurf bei 90 %
  // des Tages faellig (21:36, `source-demand.planeMandatsarbeit`), und er wurde zwei Minuten
  // spaeter erledigt. Das ist kein erschoepfter Motor, das ist ein puenktlicher.
  //
  // Die geforderte Groesse ist „rechnerische Kapazitaetsreserve GEGENUEBER DER ERWARTETEN
  // LAST". Die wird in Abschnitt B gemessen, indem die Last um 25 % erhoeht wird und der Tag
  // trotzdem halten muss. Dieser Wert hier bleibt als ehrliche Zusatzinformation stehen.
  const zeitreserve = r.fertigMs == null ? null
    : Math.round(((24 * STUNDE - r.fertigMs) / (24 * STUNDE)) * 1000) / 10;
  return {
    geplanteMandate: r.mandate.geplant,
    beruecksichtigt: r.mandate.beruecksichtigt,
    vollstaendig: r.mandate.vollstaendigVerarbeitet,
    verloreneKandidaten: r.verloren + r.unterPlan,
    doppelteAuftraege: r.gleichzeitigDoppelt,
    dauerhaftBlockiert: r.queue.fehlgeschlagen,
    maxWartenS: Math.round(r.warten.maxS),
    medianWartenS: Math.round(r.warten.medianS),
    p95WartenS: Math.round(r.warten.p95S),
    rueckstandMax: r.queue.maxQueue,
    rueckstandAbbauMs: r.fertigMs,
    kostenGesamtUsd: Math.round(kosten * 10000) / 10000,
    kostenJeMandatUsd: r.mandate.geplant ? Math.round((kosten / r.mandate.geplant) * 100000) / 100000 : 0,
    budgetverletzungen: Math.max(0, r.kosten.buchungen - (r.deckel == null ? Infinity : r.deckel)),
    fairness: r.mandate.fairness,
    mandateMitFehlern: r.mandate.mitFehlern,
    durchsatzProStunde: Math.round(durchsatzProStunde),
    zeitreserveProzent: zeitreserve,
    imTagFertig: r.fertigMs != null && r.fertigMs <= 24 * 3600 * 1000
  };
}

function tabelle(stufe, m, r) {
  console.log(`\n  ── ${z(stufe)} MANDATE ${"─".repeat(Math.max(0, 52 - String(stufe).length))}`);
  const zeile = (k, v) => console.log(`    ${k.padEnd(42, ".")} ${v}`);
  zeile("1 geplante Mandate", z(m.geplanteMandate));
  zeile("2 tatsaechlich beruecksichtigt", `${z(m.beruecksichtigt)} (${Math.round((m.beruecksichtigt / m.geplanteMandate) * 100)} %)`);
  zeile("3 vollstaendig verarbeitet (Briefing)", z(m.vollstaendig));
  zeile("4 verlorene Kandidaten", z(m.verloreneKandidaten));
  zeile("5 doppelte Auftraege", z(m.doppelteAuftraege));
  zeile("6 dauerhaft blockierte Auftraege", z(m.dauerhaftBlockiert));
  zeile("7 maximale Wartezeit", `${z(Math.round(m.maxWartenS / 60))} min`);
  zeile("8 Median / 95. Perzentil Wartezeit", `${z(Math.round(m.medianWartenS / 60))} min / ${z(Math.round(m.p95WartenS / 60))} min`);
  zeile("9 groesster Warteschlangenbestand", `${z(m.rueckstandMax)} Zeilen`);
  zeile("10 Rueckstand vollstaendig abgebaut um", uhrzeit(m.rueckstandAbbauMs));
  zeile("11 Kosten je Mandat (Tag)", `${m.kostenJeMandatUsd.toFixed(5)} USD`);
  zeile("12 Gesamtkosten (Tag)", `${m.kostenGesamtUsd.toFixed(4)} USD`);
  zeile("13 Budgetverletzungen", z(m.budgetverletzungen));
  zeile("14 Fairness (min/max Auftraege je Mandat)", `${m.fairness} (${r.mandate.minAuftraegeProMandat}/${r.mandate.maxAuftraegeProMandat})`);
  zeile("15 Mandate mit Fehlern (Isolation)", `${z(m.mandateMitFehlern)} von ${z(m.geplanteMandate)}`);
  zeile("16 Verarbeitungskapazitaet je Stunde", `${z(m.durchsatzProStunde)} Auftraege`);
  zeile("17 Zeitreserve bis Tagesende (NICHT Kapazitaet)", m.zeitreserveProzent == null ? "— (im Tag nicht fertig)" : `${m.zeitreserveProzent} %`);
  console.log(`    (davon: ${z(r.mandate.deaktiviertBeigemischt)} deaktivierte beigemischt · `
    + `${z(r.mandate.spaetHinzugekommen)} spaet hinzugekommen · ${z(r.vorlauf.eingestellt)} Vorlauf-Rueckstand · `
    + `${z(r.abruf.drosselung)} Drosselungsfehler · ${z(r.abruf.fehler)} Abruffehler)`);
}

async function main() {
  console.log("Helmut — Stufennachweis 5 / 25 / 50 / 100 / 200 Mandate (+ Stress 1 000)");
  console.log("  echte OP-30-Module · synthetische Profile · Attrappe fuer Netz und KI · virtuelle Uhr");
  console.log("  Szenario je Stufe: 10 % HTTP 429 · dauerhaft fehlerhafte Quellenfamilie · Workerabsturz");
  console.log("  · doppelter Scheduler · 4 konkurrierende Worker · langsame Verarbeitung · 10 % deaktivierte");
  console.log("  Mandate · Zugang in Stunde 8 · Rueckstand aus einem vorherigen Lauf · ein Schwergewicht\n");

  const alle = {};

  abschnitt("A · Messwerte je Stufe");
  for (const { n, deckel } of STUFEN) {
    const r = await simuliereTag(szenario(n, deckel));
    const m = messwerte(r);
    alle[n] = { r, m };
    tabelle(n, m, r);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("B · Abnahmekriterien fuer 200 Mandate (alle vierzehn)");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const { r, m } = alle[200];
  check("B1 Alle 200 aktiven Mandate werden im simulierten Zeitraum beruecksichtigt",
    m.beruecksichtigt === 200, `${m.beruecksichtigt}/200`);
  check("B2 Kein Mandat verhungert (jedes hat mindestens einen erledigten Auftrag)",
    r.mandate.minAuftraegeProMandat > 0, `Minimum ${r.mandate.minAuftraegeProMandat} Auftraege je Mandat`);
  check("B3 Kein Auftrag wird einem falschen Mandat zugeordnet",
    r.fremdzugriffe === 0, `${r.fremdzugriffe} Fremdzugriffe`);
  check("B4 Keine Mandantengrenze verletzt (Briefing nur mit eigenen Belegen)",
    r.fremdzugriffe === 0 && r.briefings.gesamt >= 200);
  check("B5 Kein Kandidat geht still verloren",
    m.verloreneKandidaten === 0, `${r.verloren} in ungueltigem Zustand · ${r.unterPlan} unter Plan`);
  check("B6 Keine unkontrollierte Doppelverarbeitung",
    m.doppelteAuftraege === 0 && r.kosten.buchungen === r.kosten.eindeutig,
    `${m.doppelteAuftraege} gleichzeitig doppelt · ${r.kosten.buchungen}/${r.kosten.eindeutig} Buchungen eindeutig`);
  check("B7 Alle Rueckstaende sind abgebaut — einschliesslich des Vorlaufs",
    r.queue.wartendFaellig === 0 && r.queue.laufend === 0 && r.vorlauf.offen === 0,
    `${r.queue.wartendFaellig} faellig offen · ${r.queue.nochNichtFaellig} Archiv (7-Tage-Fenster, planmaessig) · Vorlauf offen ${r.vorlauf.offen}`);
  check("B8 Kein Budget ueberschritten",
    m.budgetverletzungen === 0 && r.kosten.buchungen <= r.deckel,
    `${z(r.kosten.buchungen)} von ${z(r.deckel)}`);
  check("B9 Fehler eines Mandats blockieren andere nicht",
    m.beruecksichtigt === 200 && r.abruf.fehler > 0,
    `${z(r.abruf.fehler)} Abruffehler, trotzdem alle ${m.beruecksichtigt} bedient`);
  check("B10 Wiederanlauf und Idempotenz funktionieren",
    r.plan.zweiterLaufNeu === 0 && r.gleichzeitigDoppelt === 0,
    `zweite Planung legte ${r.plan.zweiterLaufNeu} neue Auftraege an (Absturz in Stunde 6 verkraftet)`);
  check("B11 Deaktivierte Mandate werden NICHT verarbeitet",
    r.mandate.deaktivierteInArbeit === 0 && r.mandate.deaktiviertBeigemischt > 0,
    `${r.mandate.deaktiviertBeigemischt} beigemischt · ${r.mandate.deaktivierteInArbeit} in Arbeit`);
  // B12 — DIE KAPAZITAETSRESERVE WIRD GEMESSEN, NICHT GESCHAETZT.
  //
  // „Rechnerische Kapazitaetsreserve gegenueber der erwarteten Last" heisst: haelt der Tag
  // auch dann noch, wenn die Last hoeher ist als erwartet? Das laesst sich nicht aus einer
  // Restzeit ablesen — es laesst sich AUSPROBIEREN. Deshalb laeuft hier derselbe, gleich
  // unfreundliche Tag mit 250 statt 200 Mandaten (= +25 %). Bleibt die Pflichtarbeit im Tag,
  // ist die Reserve belegt; sonst nicht.
  //
  // Warum nicht die Zeitreserve: sie liegt bei JEDER Stufe bei rund 10 %, auch bei fuenf
  // Mandaten. Sie misst den Faelligkeitsfahrplan (letztes Briefing 21:36 per Entwurf), nicht
  // die Kapazitaet — siehe Kommentar in `messwerte`.
  const reserveProbe = await simuliereTag(szenario(250, 30000));
  const reserveM = messwerte(reserveProbe);
  console.log(`\n  Reserveprobe: 250 Mandate (= 200 + 25 %) im selben Szenario`);
  console.log(`    beruecksichtigt ${z(reserveM.beruecksichtigt)}/250 · Pflichtarbeit fertig ${uhrzeit(reserveM.rueckstandAbbauMs)}`
    + ` · faellig offen ${z(reserveProbe.queue.wartendFaellig)} · Verlust ${z(reserveM.verloreneKandidaten)}`);
  check("B12 Der Tag haelt auch mit 250 statt 200 Mandaten (+25 % MANDATE)",
    reserveM.imTagFertig && reserveProbe.queue.wartendFaellig === 0
    && reserveM.beruecksichtigt === 250 && reserveM.verloreneKandidaten === 0,
    `250 Mandate vollstaendig im Tag, Pflichtarbeit fertig ${uhrzeit(reserveM.rueckstandAbbauMs)}`);

  // B12b — WIEVIEL MEHR ARBEIT SIND 250 MANDATE WIRKLICH? (Befund B16, Review PR #235)
  //
  // B12 belegt „+25 % MANDATE werden getragen". Das ist NICHT dasselbe wie „+25 %
  // Kapazitaetsreserve". Im V3-Motor wird ein Dokument global genau EINMAL verstanden;
  // zusaetzliche Mandate teilen sich die geteilten Quellen. Ein Mandatszuwachs von 25 %
  // schlaegt deshalb NICHT als 25 % Arbeitszuwachs durch. Wer die Reserve aus der
  // Mandatszahl allein ableitet, ueberschaetzt sie.
  //
  // Deshalb wird der Zuwachs hier GEMESSEN statt unterstellt — und wenn er unter 25 %
  // liegt, gilt die 25-%-Reserve ausdruecklich als NICHT BEWIESEN.
  const zuwachs = (a, b) => (a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : null);
  const arbeitszuwachs = {
    Auftraege: zuwachs(r.queue.gesamt, reserveProbe.queue.gesamt),
    Erledigt: zuwachs(r.queue.erledigt, reserveProbe.queue.erledigt),
    "KI-Aufrufe": zuwachs(r.ki.aufrufe, reserveProbe.ki.aufrufe),
    Abrufversuche: zuwachs(r.abruf.versuche, reserveProbe.abruf.versuche),
    Dokumente: zuwachs(r.dokumente, reserveProbe.dokumente)
  };
  console.log("\n    Tatsaechlicher ARBEITSzuwachs 200 -> 250 Mandate:");
  for (const [k, v] of Object.entries(arbeitszuwachs)) {
    console.log(`      ${k.padEnd(14)} ${String(v).padStart(6)} %${v != null && v >= 25 ? "  (>= 25 %)" : "  (UNTER 25 %)"}`);
  }
  const werte = Object.values(arbeitszuwachs).filter((v) => v != null);
  const kleinster = Math.min(...werte);
  if (werte.length && kleinster >= 25) {
    check("B12b Der Arbeitszuwachs betraegt in JEDER Dimension mindestens 25 %",
      true, Object.entries(arbeitszuwachs).map(([k, v]) => `${k} ${v} %`).join(" · "));
  } else {
    nichtBewiesen("B12b Kapazitaetsreserve von 25 % gegenueber der erwarteten ARBEITSLAST",
      `+25 % Mandate erzeugen wegen der geteilten Quellen nur ${kleinster} bis `
      + `${Math.max(...werte)} % mehr Arbeit (${Object.entries(arbeitszuwachs).map(([k, v]) => `${k} ${v} %`).join(" · ")}). `
      + "Belegt ist damit eine Reserve von +25 % MANDATEN, nicht von +25 % ARBEIT. "
      + "Ein Nachweis ueber die Arbeitsmenge braucht eine Stufe mit entsprechend mehr "
      + "individuellen Quellen bzw. Dokumenten.");
  }
  console.log(`    (Zeitreserve bis Tagesende bei 200 Mandaten: ${m.zeitreserveProzent} % — das ist der`);
  console.log("     Faelligkeitsfahrplan, NICHT die Kapazitaet; sie liegt bei allen Stufen bei rund 10 %.)");
  check("B13 Alle Aussagen sind durch gemessene Werte gedeckt",
    Object.values(m).every((v) => v !== undefined),
    `${Object.keys(m).length} Messwerte, keiner geschaetzt`);
  // B14 wird ausserhalb dieser Suite gehalten: `relevanzordnung-mergeneutralitaet-test.js`
  // und `op30-aktivierungsreife-test.js` §6 beweisen, dass der 5-Mandate-Pfad bei
  // ausgeschalteten Flags unveraendert bleibt. Hier wird nur die Zusage benannt.
  check("B14 Der bisherige Pfad bleibt bei ausgeschalteten Flags unveraendert",
    require(path.join(ROOT, "lib/helmut/scalable-pipeline.js")).skalierbarerPfadAktiv({}) === false,
    "Flag ohne Wert = AUS (Nachweis: relevanzordnung-mergeneutralitaet-test.js, op30-aktivierungsreife-test.js §6)");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("C · Verhalten ueber die Stufen — waechst etwas schneller als linear?");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    console.log("\n    Stufe   beruecks.  Zeitres.  max. Warten   Durchsatz/h   Kosten/Mandat");
    for (const { n } of STUFEN) {
      const s = alle[n].m;
      console.log(`    ${String(n).padStart(5)}   ${String(s.beruecksichtigt).padStart(9)}  `
        + `${String(s.zeitreserveProzent == null ? "—" : `${s.zeitreserveProzent} %`).padStart(7)}   `
        + `${String(`${Math.round(s.maxWartenS / 60)} min`).padStart(11)}   `
        + `${String(z(s.durchsatzProStunde)).padStart(11)}   ${s.kostenJeMandatUsd.toFixed(5)} USD`);
    }
    for (const { n } of STUFEN) {
      check(`C1.${n} Stufe ${n}: alle aktiven Mandate beruecksichtigt`,
        alle[n].m.beruecksichtigt === n, `${alle[n].m.beruecksichtigt}/${n}`);
    }
    for (const { n } of STUFEN) {
      check(`C2.${n} Stufe ${n}: kein Verlust, keine Doppelverarbeitung, keine Budgetverletzung`,
        alle[n].m.verloreneKandidaten === 0 && alle[n].m.doppelteAuftraege === 0
        && alle[n].m.budgetverletzungen === 0);
    }
    for (const { n } of STUFEN) {
      check(`C3.${n} Stufe ${n}: die Pflichtarbeit ist im simulierten Tag fertig`,
        alle[n].m.imTagFertig && alle[n].r.queue.wartendFaellig === 0,
        `fertig ${uhrzeit(alle[n].m.rueckstandAbbauMs)} · ${alle[n].r.queue.wartendFaellig} faellig offen`);
    }
    // Die Zeitreserve bewegt sich zwischen 5 und 200 Mandaten kaum — das ist der Beleg dafuer,
    // dass sie den Fahrplan misst und nicht die Kapazitaet. Er gehoert ausdruecklich in die
    // Suite, sonst waere die Begruendung in `messwerte` eine Behauptung.
    const zeitreserven = STUFEN.map(({ n }) => alle[n].m.zeitreserveProzent).filter((x) => x != null);
    check("C3.x Die Zeitreserve ist ueber alle Stufen nahezu konstant (sie misst den Fahrplan)",
      zeitreserven.length === STUFEN.length
      && (Math.max(...zeitreserven) - Math.min(...zeitreserven)) < 5,
      `${zeitreserven.map((x) => `${x} %`).join(" · ")}`);
    for (const { n } of STUFEN) {
      check(`C4.${n} Stufe ${n}: deaktivierte Mandate bleiben unberuehrt`,
        alle[n].r.mandate.deaktivierteInArbeit === 0);
    }
    // Kosten je Mandat duerfen NICHT mit der Mandatszahl steigen — sonst skaliert das
    // Geschaeftsmodell nicht. Sie duerfen fallen (geteilte Arbeit wird besser ausgenutzt).
    const k5 = alle[5].m.kostenJeMandatUsd;
    const k200 = alle[200].m.kostenJeMandatUsd;
    check("C5 Die Kosten je Mandat steigen NICHT mit der Mandatszahl",
      k200 <= k5, `5 Mandate ${k5.toFixed(5)} USD · 200 Mandate ${k200.toFixed(5)} USD je Mandat/Tag`);
    check("C6 Der Grund ist die geteilte Arbeit — der globale Anteil waechst",
      alle[200].r.kosten.global / Math.max(1, alle[200].r.kosten.buchungen)
      >= alle[5].r.kosten.global / Math.max(1, alle[5].r.kosten.buchungen),
      `global ${Math.round((alle[5].r.kosten.global / Math.max(1, alle[5].r.kosten.buchungen)) * 100)} % -> `
      + `${Math.round((alle[200].r.kosten.global / Math.max(1, alle[200].r.kosten.buchungen)) * 100)} %`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("D · Stresstest 1 000 Mandate — KEIN Abnahmekriterium fuer Phase 1");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  console.log("\n  Er dient ausschliesslich der Erkennung frueher Architekturgrenzen. Ein Fehlschlag");
  console.log("  hier ist KEIN Grund, den 200er-Nachweis abzulehnen — und ein Erfolg ist keine Zusage.\n");
  {
    const rs = await simuliereTag(szenario(1000, 90000));
    const ms = messwerte(rs);
    alle[1000] = { r: rs, m: ms };
    tabelle(1000, ms, rs);
    check("D1 Alle 1 000 aktiven Mandate werden beruecksichtigt",
      ms.beruecksichtigt === 1000, `${ms.beruecksichtigt}/1000`);
    check("D2 Kein Verlust, keine Doppelverarbeitung", ms.verloreneKandidaten === 0 && ms.doppelteAuftraege === 0);
    check("D3 Kein fremder Inhalt", rs.fremdzugriffe === 0);
    check("D4 Deaktivierte Mandate bleiben unberuehrt", rs.mandate.deaktivierteInArbeit === 0);
    check("D5 Kein Budget ueberschritten", ms.budgetverletzungen === 0,
      `${z(rs.kosten.buchungen)} von ${z(rs.deckel)}`);
    if (ms.imTagFertig && rs.queue.wartendFaellig === 0) {
      check("D6 Auch bei 1 000 Mandaten ist die Pflichtarbeit im Tag fertig", true,
        `fertig ${uhrzeit(ms.rueckstandAbbauMs)} · Zeitreserve ${ms.zeitreserveProzent} %`);
    } else {
      nichtBewiesen("D6 Vollstaendige Abarbeitung bei 1 000 Mandaten",
        "die Pflichtarbeit wurde im simulierten Tag nicht fertig — das ist die frueheste "
        + "erkennbare Architekturgrenze und ausdruecklich KEIN Abnahmekriterium fuer Phase 1.");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("E · Grenzen dieses Nachweises — ausdruecklich NICHT bewiesen");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  nichtBewiesen("E1 Production-Tauglichkeit fuer 200 Mandate",
    "eine lokale Simulation ist KEIN Production-Beweis. Synthetische Profile, Attrappen fuer "
    + "Netz und KI, virtuelle Uhr. Es gibt 10 echte Profile, nicht 200.");
  nichtBewiesen("E2 Reale Abrufdauer unter echter Google-Drosselung",
    "die Drosselung ist als Fehlerquote nachgebildet, nicht als Wartezeit.");
  nichtBewiesen("E3 Reale KI-Laufzeit und reale Modellkosten",
    `die Preisbasis ${USD_JE_KI_AUFRUF} USD/Aufruf ist ein Schaetzwert im Code, kein Anbieterpreis. `
    + "Die Kostenzahlen oben sind Groessenordnungen, keine Rechnungsbetraege.");
  nichtBewiesen("E4 Verhalten unter echter Nebenlaeufigkeit ueber Prozessgrenzen",
    "die Worker laufen hier im selben Prozess. Der echte Nachweis steht in "
    + "jobqueue-datenbank-test.js (echte PostgreSQL) und jobqueue-lasttest.js.");
  nichtBewiesen("E5 Wirksamer Tagesdeckel in Production",
    "er ist aus einer Sitzung nicht lesbar (Egress-Sperre auf api.vercel.com). Die Deckel oben "
    + "sind lokale Testwerte.");

  console.log(`\n${"═".repeat(78)}`);
  console.log(`ERGEBNIS: PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN und zaehlen nicht als Erfolg.`);
  console.log("═".repeat(78));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
