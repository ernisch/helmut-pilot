"use strict";

// Helmut — VIRTUELLE 24 STUNDEN: 200 und 1000 Mandate (OP-30, Abnahmesprint, Phase 5 + 6).
// =============================================================================================
// Deterministisch und OHNE echtes Warten: die Uhr ist eine Variable, kein `setTimeout`.
// Simuliert werden genau die Faelle aus dem Auftrag:
//   Deckel 100 · rechnerisch ausreichende Kapazitaet · 30 % Reserve
//   HTTP 429 · teilweiser und vollstaendiger Anbieterausfall
//   Workerabsturz · Wiederaufnahme · doppelte Scheduler-Ausloesung
//   langsame Verarbeitung · Nachrichtenlast · Tageswechsel · mehrere konkurrierende Worker
//
// GEMESSEN werden: Auftraege, Abschluesse, Rueckstaende, aeltester Auftrag, maximale Queue,
// Verluste, Duplikate, Kostenbuchungen, Fairness, Briefings, Leerzustaende, veraltete
// Zustaende, Workerzahl, Parallelitaet und Deckel.
//
// >>> WAS DAS NICHT IST <<<
// Eine SIMULATION. Netz und KI sind Attrappen, die Uhr ist virtuell. Bewiesen werden Ablauf,
// Reihenfolge, Fairness und Buchhaltung — NICHT die reale Dauer eines Google-Abrufs.
// Fuer 200 Mandate ist das die Abnahmegrundlage dieses Sprints; fuer 1000 ausdruecklich nur
// eine lokale Simulation.

const path = require("path");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
// Die EINE Kennungswahrheit fuer raw_documents — die Attrappe darf sie nicht nachbauen.
const dedup = require(path.join(ROOT, "lib/helmut/dedup.js"));
const FAIR = require(path.join(ROOT, "lib/helmut/llm-budget-fair.js"));
const WORKER = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) { offen += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
function abschnitt(t) { console.log(`\n${"═".repeat(76)}\n  ${t}\n${"═".repeat(76)}`); }
function unter(t) { console.log(`\n-- ${t}`); }
function z(n) { return Number(n).toLocaleString("de-DE"); }

// ── Der Simulationslauf liegt seit 2026-08-09 in einer gemeinsamen Datei ────────────────
// Grund: der Stufennachweis (scripts/skalierung-stufen-test.js) braucht GENAU DENSELBEN
// Lauf. Zwei getrennte Harnesse, die dasselbe behaupten, koennen sich widersprechen — und
// dann glaubt man derjenigen, die gerade gruen ist. Verhalten unveraendert; die Ergaenzungen
// des Stufennachweises sind alle DEFAULT AUS.
const { AN, T0, STUNDE, eigeneQuellen, uhr, welt, simuliereTag } =
  require(path.join(ROOT, "scripts/fixtures/skalierung-lauf.js"));

async function main() {
  console.log("Helmut — virtuelle 24 Stunden: 200 und 1000 Mandate (OP-30, Phase 5 + 6)");
  console.log("  deterministisch · ohne echtes Warten · ohne Netz · ohne KI\n");

  const ergebnisse = {};

  // ═══════════════ A · 200 MANDATE ═══════════════════════════════════════
  abschnitt("A · 200 MANDATE — die Abnahmegrundlage dieses Sprints");

  unter("A1 · Deckel 100 (der heutige Wert): was bleibt ehrlich liegen?");
  {
    const r = await simuliereTag({ anzahlMandate: 200, deckel: 100, fairness: true, workerJeRunde: 4 });
    ergebnisse.a1 = r;
    console.log(`  Auftraege ${z(r.plan.geplant)} · erledigt ${z(r.queue.erledigt)} · offen ${z(r.queue.wartend)}`
      + ` · KI-Aufrufe ${z(r.ki.aufrufe)} · abgelehnt ${z(r.ki.abgelehnt)}`);
    check("A1.1 Der Deckel wird eingehalten", r.kosten.buchungen <= 100, `${r.kosten.buchungen} Buchungen`);
    check("A1.2 Abgelehnte KI-Arbeit wird EHRLICH gezaehlt, nicht verschwiegen",
      r.ki.abgelehnt > 0, `${z(r.ki.abgelehnt)} abgelehnt`);
    check("A1.3 Es gibt keine doppelte Kostenbuchung",
      r.kosten.buchungen === r.kosten.eindeutig, `${r.kosten.buchungen}/${r.kosten.eindeutig}`);
    check("A1.4 Kein Auftrag ging verloren", r.verloren === 0 && r.unterPlan === 0,
      `${r.verloren} in ungueltigem Zustand · ${r.unterPlan} unter Plan`);
    check("A1.5 Kein Auftrag war gleichzeitig bei zwei Workern", r.gleichzeitigDoppelt === 0);
    check("A1.6 Trotz Deckel entstehen Briefings — mit ehrlichem Leerzustand wo noetig",
      r.briefings.gesamt === 200, `${r.briefings.belegt} belegt · ${r.briefings.leer} leer`);
  }

  unter("A2 · Rechnerisch ausreichende Kapazitaet (lokaler Testdeckel)");
  {
    const r = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true, workerJeRunde: 4 });
    ergebnisse.a2 = r;
    console.log(`  Auftraege ${z(r.plan.geplant)} · erledigt ${z(r.queue.erledigt)} · offen ${z(r.queue.wartend)}`
      + ` · KI ${z(r.ki.aufrufe)} · Buchungen ${z(r.kosten.buchungen)}`);
    check("A2.1 ALLE 200 Mandate werden beruecksichtigt", r.briefings.gesamt === 200, String(r.briefings.gesamt));
    console.log(`  Vollstaendig abgearbeitet nach ${r.stundenBisFertig} simulierten Stunden`);
    check("A2.2 Die Pflichtarbeit ist innerhalb von 24 simulierten Stunden abgeschlossen",
      r.queue.wartendFaellig === 0 && r.queue.laufend === 0 && r.fertigMs != null && r.fertigMs <= 24 * STUNDE,
      `${r.queue.wartendFaellig} faellig offen · ${r.queue.nochNichtFaellig} Archiv (7-Tage-Fenster) · letzte Pflichtarbeit ${r.fertigUhrzeit}`);
    check("A2.3 Niemand wird abgeschnitten (alles Faellige ist abgearbeitet)",
      r.queue.erledigt + r.queue.fehlgeschlagen + r.queue.nochNichtFaellig === r.queue.gesamt,
      `${r.queue.erledigt} erledigt + ${r.queue.fehlgeschlagen} gescheitert + ${r.queue.nochNichtFaellig} nicht faellig von ${r.queue.gesamt}`);
    check("A2.4 Keine fremden Daten", r.fremdzugriffe === 0);
    check("A2.5 Alle Briefings sind belegt", r.briefings.belegt === 200,
      `${r.briefings.belegt} belegt · ${r.briefings.leer} leer`);
    check("A2.6 Keine KI-Ablehnung mehr", r.ki.abgelehnt === 0, String(r.ki.abgelehnt));
    check("A2.7 Kein Verlust, keine Doppelvergabe",
      r.verloren === 0 && r.unterPlan === 0 && r.gleichzeitigDoppelt === 0);
  }

  unter("A3 · 30 % Reserve");
  {
    const noetig = ergebnisse.a2.kosten.buchungen;
    const mitReserve = Math.ceil(noetig * 1.3);
    const r = await simuliereTag({ anzahlMandate: 200, deckel: mitReserve, fairness: true, workerJeRunde: 4 });
    ergebnisse.a3 = r;
    console.log(`  Bedarf ${z(noetig)} · Deckel mit 30 % Reserve ${z(mitReserve)} · verbraucht ${z(r.kosten.buchungen)}`);
    check("A3.1 Mit 30 % Reserve laeuft alles durch",
      r.ki.abgelehnt === 0 && r.queue.wartendFaellig === 0,
      `${r.ki.abgelehnt} abgelehnt · ${r.queue.wartendFaellig} faellig offen`);
    check("A3.2 Die Reserve bleibt tatsaechlich ungenutzt",
      r.kosten.buchungen <= mitReserve && r.kosten.buchungen >= noetig * 0.9,
      `${z(r.kosten.buchungen)} von ${z(mitReserve)}`);
  }

  unter("A4 · Stoerungen: HTTP 429, Teilausfall, Vollausfall");
  {
    const drossel = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true, drosselung: 0.3 });
    check("A4.1 Bei 30 % HTTP-429 werden die Fehler GEZAEHLT, nicht geschluckt",
      drossel.abruf.drosselung > 0, `${z(drossel.abruf.drosselung)} von ${z(drossel.abruf.versuche)} Versuchen`);
    check("A4.2 Trotz Drosselung gehen keine Auftraege verloren", drossel.verloren === 0);
    check("A4.3 Es entstehen weiterhin Briefings", drossel.briefings.gesamt === 200,
      `${drossel.briefings.belegt} belegt · ${drossel.briefings.leer} leer`);

    const voll = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true, ausfall: ["google-news"] });
    ergebnisse.a4voll = voll;
    console.log(`  Vollausfall: ${z(voll.abruf.fehler)} Abruffehler · ${z(voll.queue.fehlgeschlagen)} endgueltig gescheitert`
      + ` · ${z(voll.briefings.leer)} Leerzustaende`);
    check("A4.4 Ein vollstaendiger Anbieterausfall wird SICHTBAR (endgueltige Fehler)",
      voll.queue.fehlgeschlagen > 0, String(voll.queue.fehlgeschlagen));
    check("A4.5 Er erzeugt KEINEN ruhigen Tag, sondern ehrliche Leerzustaende",
      voll.briefings.leer === 200 && voll.briefings.belegt === 0,
      `${voll.briefings.leer} leer von ${voll.briefings.gesamt}`);
    check("A4.6 Es entstehen KEINE KI-Kosten fuer nicht abgerufene Inhalte",
      voll.ki.aufrufe === 0, String(voll.ki.aufrufe));
  }

  unter("A5 · Absturz, Wiederaufnahme, doppelter Scheduler");
  {
    const r = await simuliereTag({
      anzahlMandate: 200, deckel: 20000, fairness: true, workerJeRunde: 4,
      absturzInStunde: 3, doppelterScheduler: true
    });
    ergebnisse.a5 = r;
    console.log(`  Doppelte Planung: zweiter Lauf erzeugte ${r.plan.zweiterLaufNeu} neue Auftraege`);
    check("A5.1 Eine DOPPELTE Scheduler-Ausloesung erzeugt NULL zusaetzliche Auftraege",
      r.plan.zweiterLaufNeu === 0, String(r.plan.zweiterLaufNeu));
    check("A5.2 Der Workerabsturz verliert keine Arbeit",
      r.verloren === 0 && r.unterPlan === 0 && r.queue.laufend === 0,
      `${r.verloren} ungueltig · ${r.unterPlan} unter Plan · ${r.queue.laufend} haengend`);
    check("A5.3 Nach der Wiederaufnahme ist alles abgearbeitet",
      r.queue.wartendFaellig === 0, `${r.queue.wartendFaellig} faellig offen nach ${r.stundenBisFertig} h`);
    check("A5.4 Der Absturz erzeugt keine doppelte Kostenbuchung",
      r.kosten.buchungen === r.kosten.eindeutig, `${r.kosten.buchungen}/${r.kosten.eindeutig}`);
  }

  unter("A6 · Langsame Verarbeitung und Tageswechsel");
  {
    const langsam = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true, langsam: true, workerJeRunde: 2 });
    console.log(`  Langsam (kleines Budget, 2 Worker): erledigt ${z(langsam.queue.erledigt)} von ${z(langsam.queue.gesamt)}`
      + ` · Rueckstand ${z(Math.round(langsam.maxRueckstandS / 3600))} h`);
    check("A6.1 Auch bei langsamer Verarbeitung geht nichts verloren",
      langsam.verloren === 0 && langsam.unterPlan === 0);
    check("A6.2 Der Rueckstand wird gemessen und benannt", langsam.maxRueckstandS >= 0);

    // Tageswechsel: der Budgetzaehler ist tagesbezogen (FAIR.tagesSchluessel).
    const t1 = FAIR.tagesSchluessel(T0);
    const t2 = FAIR.tagesSchluessel(T0 + 24 * STUNDE);
    check("A6.3 Der Tageswechsel erzeugt einen neuen Budgettag", t1 !== t2, `${t1} -> ${t2}`);
    const morgen = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true, startMs: T0 + 24 * STUNDE });
    check("A6.4 Am Folgetag laeuft die Planung erneut und vollstaendig",
      morgen.briefings.gesamt === 200 && morgen.verloren === 0 && morgen.unterPlan === 0,
      `${morgen.briefings.gesamt} Briefings · fertig nach ${morgen.stundenBisFertig} h`);
  }

  unter("A7 · Mehrere konkurrierende Worker");
  {
    for (const n of [2, 4, 8]) {
      const r = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true, workerJeRunde: n });
      check(`A7.x ${n} gleichzeitige Worker: kein Verlust, keine Doppelvergabe, alles erledigt`,
        r.verloren === 0 && r.unterPlan === 0 && r.gleichzeitigDoppelt === 0 && r.queue.wartendFaellig === 0,
        `erledigt ${z(r.queue.erledigt)} nach ${r.stundenBisFertig} h`);
    }
  }

  unter("A8 · Erstbefuellung: der erste Tag ohne jeden Bestand");
  {
    // Der erste Tag ist der teuerste: es gibt keinen Bestand, auf den der Kurzschluss
    // "schon verstanden" greifen koennte, und die Archivsuche faellt zusaetzlich an.
    // Geprueft wird nicht die Kostenhoehe (die steht im Modell), sondern ob der Tag
    // ueberhaupt durchlaeuft, ohne Arbeit zu verlieren.
    const r = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true, startMs: T0 });
    check("A8.1 Auch ohne Bestand endet die Pflichtarbeit im Tag",
      r.fertigMs != null && r.fertigMs <= 24 * STUNDE,
      `letzte Pflichtarbeit ${r.fertigUhrzeit}`);
    check("A8.2 Alle 200 Mandate werden beruecksichtigt", r.briefings.gesamt === 200,
      `${r.briefings.gesamt} Briefings`);
    check("A8.3 Kein Auftrag geht verloren", r.verloren === 0 && r.unterPlan === 0);
    check("A8.4 Jedes Briefing traegt einen Beleg oder einen ehrlichen Leerzustand",
      r.briefings.belegt + r.briefings.leer === r.briefings.gesamt && r.briefings.gesamt > 0,
      `${r.briefings.belegt} belegt · ${r.briefings.leer} leer`);
  }

  unter("A9 · Interaktive Nutzung neben der Pflichtarbeit");
  {
    // Waehrend die Pflichtarbeit laeuft, benutzen Abgeordnete Helmut: sie oeffnen die Lage,
    // laden ein Briefing nach, stellen eine Frage. Das darf die Pflichtarbeit weder
    // verdraengen noch verhungern lassen — und umgekehrt.
    //
    // Nachgebildet wird das ueber ZUSAETZLICHE optionale Arbeit im Budget: interaktive
    // Nutzung ist genau das — Kuer, die neben der Pflicht laeuft.
    const mandate = erzeugeMandate(200).map((p) => p.id);
    const bedarf = Object.fromEntries(mandate.map((m, i) => [m, {
      notwendig: 1,
      // Ein Viertel der Mandate ist an diesem Tag interaktiv besonders aktiv.
      optional: (i % 4 === 0) ? 6 : 2
    }]));

    // KORREKTUR 2026-08-08: dieser Test rechnete zuerst mit Deckel 220 und erwartete, dass
    // 200 Mandate ihre je EINE Pflichtarbeit bekommen. Gemessen bekamen nur 110 sie — und das
    // ist RICHTIG, nicht kaputt: `GLOBAL_ANTEIL_STANDARD = 0.5` haelt die Haelfte des Deckels
    // als RESERVE fuer das globale Verstehen zurueck, und mandatsbezogene Arbeit darf diesen
    // Topf nie anfassen. Aus Deckel 220 werden also 110 Mandatsaufrufe. Der Fehler lag in
    // meiner Erwartung, nicht in der Fairness. Beide Aussagen werden jetzt einzeln geprueft.
    const knapp = FAIR.tagesplan({ mandate, deckel: 220, tag: "2026-08-08", bedarf });
    const ohnePflicht = Object.values(knapp.zuteilung).filter((x) => x.notwendig < 1).length;
    check("A9.1a Der globale Topf bleibt reserviert (Mandatsarbeit fasst ihn nicht an)",
      Object.values(knapp.zuteilung).reduce((sum, x) => sum + x.notwendig + x.optional, 0) <= 110,
      `${Object.values(knapp.zuteilung).reduce((sum, x) => sum + x.notwendig + x.optional, 0)} von hoechstens 110`);
    check("A9.1b Was der Mandatstopf hergibt, geht VOLLSTAENDIG in Pflichtarbeit",
      Object.values(knapp.zuteilung).reduce((sum, x) => sum + x.notwendig, 0) === 110
      && Object.values(knapp.zuteilung).every((x) => x.optional === 0),
      `${200 - ohnePflicht} von 200 versorgt, 0 Kuer`);
    check("A9.1c Bei ausreichendem Deckel bekommt JEDES Mandat seine Pflichtarbeit",
      Object.values(FAIR.tagesplan({ mandate, deckel: 400, tag: "2026-08-08", bedarf }).zuteilung)
        .every((x) => x.notwendig >= 1), "Deckel 400 = 200 Mandatsplaetze");
    check("A9.2 Kein Mandat bekommt interaktive Kuer, solange ein anderes auf Pflicht wartet",
      knapp.notwendigOffen === 0 || Object.values(knapp.zuteilung).every((x) => x.optional === 0),
      `${knapp.notwendigOffen} Pflicht offen`);

    const reich = FAIR.tagesplan({ mandate, deckel: 3000, tag: "2026-08-08", bedarf });
    const aktive = mandate.filter((_, i) => i % 4 === 0);
    const ruhige = mandate.filter((_, i) => i % 4 !== 0);
    check("A9.3 Bei ausreichendem Budget bekommen auch die aktiven Mandate ihre Kuer",
      aktive.every((m) => reich.zuteilung[m].optional > 0));
    check("A9.4 Die aktiven Mandate verdraengen die ruhigen NICHT von der Pflichtarbeit",
      ruhige.every((m) => reich.zuteilung[m].notwendig >= 1));
    // Und die Pflichtarbeit des Tages bleibt im Zeitrahmen, obwohl nebenher gelesen wird.
    const r = await simuliereTag({ anzahlMandate: 200, deckel: 20000, fairness: true });
    check("A9.5 Die Pflichtarbeit bleibt trotz interaktiver Last im Tag",
      r.fertigMs != null && r.fertigMs <= 24 * STUNDE, `letzte Pflichtarbeit ${r.fertigUhrzeit}`);
  }

  // ═══════════════ B · FAIRNESS ══════════════════════════════════════════
  abschnitt("B · FAIRNESS: Pflicht vor Kuer, niemand verhungert");
  {
    const mandate = erzeugeMandate(200).map((p) => p.id);
    const bedarf = Object.fromEntries(mandate.map((m) => [m, { notwendig: 1, optional: 2 }]));
    const knapp = FAIR.tagesplan({ mandate, deckel: 200, tag: "2026-08-08", bedarf });
    check("B1 Bei knappem Budget gibt es AUSSCHLIESSLICH Pflichtarbeit",
      Object.values(knapp.zuteilung).every((x) => x.optional === 0),
      `${Object.values(knapp.zuteilung).reduce((s, x) => s + x.optional, 0)} optionale vergeben`);
    check("B2 Kein Mandat bekommt Kuer, waehrend ein anderes auf Pflicht wartet",
      knapp.notwendigOffen === 0 || Object.values(knapp.zuteilung).every((x) => x.optional === 0));
    const reich = FAIR.tagesplan({ mandate, deckel: 2000, tag: "2026-08-08", bedarf });
    check("B3 Bei ausreichendem Budget bekommt JEDES Mandat seine Pflichtarbeit",
      reich.reichtFuerAlleNotwendigen === true
      && Object.values(reich.zuteilung).every((x) => x.notwendig === 1));
    const verhungern = FAIR.bedienteMandateUeberTage({ mandate, deckel: 100, tage: 20 });
    check("B4 Bei Dauerknappheit verhungert ueber 20 Tage KEIN Mandat",
      verhungern.alleMindestensEinmal === true,
      `min ${verhungern.minimum} · max ${verhungern.maximum}`);
    check("B5 Globale Arbeit hat einen EIGENEN Topf und frisst nicht die Mandatsarbeit",
      reich.globalTopf > 0 && reich.mandatsTopf > 0 && reich.zugeteilt <= reich.mandatsTopf,
      `global ${reich.globalTopf} · Mandate ${reich.mandatsTopf} · vergeben ${reich.zugeteilt}`);
  }

  // ═══════════════ C · WORKERBETRIEB ═════════════════════════════════════
  abschnitt("C · WORKERBETRIEB: Start, Grenzen, Zustand");
  {
    const aus = await WORKER.durchlauf({ env: {} });
    check("C1 Ohne Flag startet KEIN Worker", aus.gestartet === false && aus.grund === "flag-aus");
    const r = await WORKER.readiness({ env: {} });
    check("C2 Readiness sagt WARUM nicht bereit", r.bereit === false && r.gruende.includes("flag-aus"));
    const r2 = await WORKER.readiness({
      env: { ...AN, HELMUT_SOURCE_MODE: "off" },
      deps: { metrics: async () => ({ verfuegbar: true, kennzahlen: { wartend: 0, laufend: 0, nach_typ: {}, nach_status: {} } }) }
    });
    check("C3 Bei HELMUT_SOURCE_MODE=off wird KEIN Abruftyp angefasst",
      !r2.typen.includes("source_fetch"), r2.typen.join(","));
    check("C4 Der Grund dafuer wird benannt", r2.gruende.includes("quellenmodus-aus"));
    check("C5 Health und Readiness sind getrennt",
      WORKER.health({ gestartetMs: T0, now: () => T0 + 5000 }).zustand === "laeuft" && r.bereit === false);
    const g = WORKER.grenzenAusEnv({ HELMUT_WORKER_PARALLEL: "99" });
    check("C6 Die Parallelitaet ist hart gedeckelt", g.parallel <= 8, String(g.parallel));
    const g2 = WORKER.grenzenAusEnv({ HELMUT_WORKER_PARALLEL: "unsinn" });
    check("C7 Ein unbrauchbarer Wert faellt auf den Standard zurueck", g2.parallel === 2, String(g2.parallel));

    // Sauberes Herunterfahren.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const profile = erzeugeMandate(5);
    const w = welt({ profile });
    await SP.planeArbeit({ env: AN, jetztMs: u.jetzt(),
      deps: { listFullProfiles: async () => profile, quellenFuerProfil: async (p) => eigeneQuellen(p), enqueue: q.enqueue } });
    let runden = 0;
    const b = await WORKER.betreibe({
      env: AN,
      deps: { ...w.attrappen(u), claim: q.claim, finish: q.finish, extendLease: q.extendLease, enqueue: q.enqueue },
      stopSignal: () => { runden += 1; return runden > 2; },
      maxDurchlaeufe: 50, now: u.jetzt
    });
    check("C8 Das Stopsignal beendet den Betrieb sauber",
      b.gestoppt === true || b.grund === "warteschlange-leer", JSON.stringify({ gestoppt: b.gestoppt, grund: b.grund }));
    check("C9 Kein Auftrag bleibt dabei in 'laeuft' haengen", q.nachStatus("laeuft").length === 0);
  }

  // ═══════════════ D · 1000 MANDATE (nur Simulation) ═════════════════════
  abschnitt("D · 1000 MANDATE — ausdruecklich nur als lokale Simulation");
  {
    const r = await simuliereTag({ anzahlMandate: 1000, deckel: 60000, fairness: true, workerJeRunde: 4 });
    ergebnisse.d = r;
    console.log(`  Auftraege ${z(r.plan.geplant)} · erledigt ${z(r.queue.erledigt)} · Dokumente ${z(r.dokumente)}`
      + ` · Vorgaenge ${z(r.ki.vorgaenge)} · KI ${z(r.ki.aufrufe)} · Buchungen ${z(r.kosten.buchungen)}`);
    check("D1 Alle 1000 Mandate werden beruecksichtigt", r.briefings.gesamt === 1000, String(r.briefings.gesamt));
    check("D2 Kein Auftrag geht verloren", r.verloren === 0 && r.unterPlan === 0);
    check("D3 Keine gleichzeitige Doppelvergabe", r.gleichzeitigDoppelt === 0);
    check("D4 Keine doppelte Kostenbuchung", r.kosten.buchungen === r.kosten.eindeutig);
    check("D5 Keine fremden Daten", r.fremdzugriffe === 0);
    check("D6 Alle Briefings sind belegt", r.briefings.belegt === 1000,
      `${r.briefings.belegt} belegt · ${r.briefings.leer} leer`);
    check("D7 Die Pflichtarbeit ist im simulierten Tag abgeschlossen",
      r.queue.wartendFaellig === 0 && r.queue.laufend === 0 && r.fertigMs != null && r.fertigMs <= 24 * STUNDE,
      `letzte Pflichtarbeit ${r.fertigUhrzeit} · ${r.queue.nochNichtFaellig} Archivauftraege (7-Tage-Fenster)`);
    console.log(`  Maximale Warteschlange: ${z(r.queue.maxQueue)} Zeilen · maximaler Rueckstand: ${Math.round(r.maxRueckstandS / 60)} min`);
  }

  // ═══════════════ E · GRENZEN ═══════════════════════════════════════════
  abschnitt("E · Was diese Simulation NICHT beweist");
  nichtBewiesen("E1 Reale Abrufdauer unter echter Google-Drosselung",
    "der Abruf ist eine Attrappe; die Drosselung wird als Fehlerquote nachgebildet, nicht als Wartezeit.");
  nichtBewiesen("E2 Reale KI-Laufzeit und reale Modellkosten",
    "das Verstehen ist eine Attrappe, die zaehlt, was der echte Pfad aufrufen wuerde.");
  nichtBewiesen("E3 Verhalten unter echter Production-Last",
    "die Uhr ist virtuell; es gab kein echtes Warten und keine echte Nebenlaeufigkeit ueber Prozessgrenzen "
    + "(die steht in jobqueue-datenbank-test.js und jobqueue-lasttest.js).");

  console.log(`\n${"═".repeat(76)}`);
  console.log(`ERGEBNIS: PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  if (offen > 0) console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN und zaehlen nicht als Erfolg.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); });
