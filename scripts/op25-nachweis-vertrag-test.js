"use strict";

// OP-25 — Vertragstests des Production-Nachweises (E3-Fassung, 2026-08-04).
// =============================================================================================
// Prueft den Bewertungskern `lib/helmut/op25-nachweis.js` gegen die 24 verbindlichen
// Fallfamilien des Sprintauftrags, die Zusatzfaelle (Vorrang, Fensterlogik, Parsing) UND die
// drei Haertungen aus der Review zu PR #222:
//   28  Kostenvertrag fail closed (NaN/Infinity/negativ, fehlende Nutzungsliste,
//       unbepreiste Eintraege, verdraengtes Kostenfenster)
//   29  identitaetsgenau eingefrorene Mandatsmenge (Austausch bei gleicher Anzahl, Aenderung
//       zwischen zwei Laeufen, spaetere Rueckkehr zur Ursprungsmenge, Baseline-Integritaet)
//   30  dauerhafte Belegquelle + Aufbewahrungsvertrag + VERSIEGELTE Laufzeit
//
// UNABHAENGIGE ERWARTUNGEN: jede Erwartung (Ausgang, Befundgrund, Slot-Zahl) ist HART
// KODIERT und NICHT aus derselben Fixture abgeleitet, die geprueft wird. Die Fixtures
// bauen Laufdatensaetze in der Form, die `compactCrawlRunForStore` persistiert; die
// Soll-Ausgaenge stammen aus dem dokumentierten Vertrag (docs/betrieb/vorgangskontext.md
// §7.7), nicht aus dem Code.
//
// Deterministisch und offline: feste Zeitstempel, kein Netz, keine KI, keine Production-Daten.

const path = require("path");
const fs = require("fs");
const V = require(path.join(__dirname, "..", "lib", "helmut", "op25-nachweis.js"));

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function hatBefund(bewertung, grund) {
  return (bewertung.befunde || []).some((b) => b.grund === grund);
}

// --- Kanonisches Szenario --------------------------------------------------------------------
// Fenster: 2026-08-10 12:00 UTC -> 2026-08-11 12:00 UTC (24 h, vollstaendig vergangen).
// Kadenz (wie vercel.json): crawl 04:00 + 20:00, pipeline 16:00 UTC.
// HART KODIERTE Erwartung: GENAU DREI schwere Laeufe im Fenster —
//   pipeline 2026-08-10T16:00 · crawl 2026-08-10T20:00 · crawl 2026-08-11T04:00.

const JETZT_MS = Date.parse("2026-08-12T13:00:00Z");
const AKTIVIERUNG_MS = Date.parse("2026-08-10T11:00:00Z");
const FENSTER = { vonMs: Date.parse("2026-08-10T12:00:00Z"), bisMs: Date.parse("2026-08-11T12:00:00Z") };
const CRONS = [
  { path: "/api/cron/crawl", schedule: "0 4 * * *" },
  { path: "/api/cron/morning-briefing", schedule: "0 5 * * *" },
  { path: "/api/cron/pipeline", schedule: "0 16 * * *" },
  { path: "/api/cron/crawl", schedule: "0 20 * * *" }
];
const MANDATE = ["mandat-a", "mandat-b", "mandat-c", "mandat-d", "mandat-e"];
// K3: die Watchdog-Kadenz (briefing-watchdog.yml, taeglich 05:30 UTC) — ein moeglicher
// vierter schwerer Lauf je Tag, der in den Aufbewahrungsbedarf gehoert.
const WATCHDOG_CRONS = ["30 5 * * *"];
const SLOTS = [
  { cronName: "pipeline", stamp: "20260810160003", slotIso: "2026-08-10T16:00:00Z", kuerzel: "aaaaa" },
  { cronName: "crawl", stamp: "20260810200002", slotIso: "2026-08-10T20:00:00Z", kuerzel: "bbbbb" },
  { cronName: "crawl", stamp: "20260811040004", slotIso: "2026-08-11T04:00:00Z", kuerzel: "ccccc" }
];
// Die VERSIEGELTEN Werte der globalen Phase (Vermerk), bewusst verschieden vom
// Laufdatensatz-Feld `durationMs` — genau daran haengt Haertung 3.
const VERSIEGELT_DAUER_MS = 190000;
const VERSIEGELT_BUDGET_MS = 221000;
// Der erwartete Deployment-Commit des Nachweisfensters (volle SHA) und ein gueltiger,
// aber FREMDER Commit — beides Fixture-Werte, keine Production-Stande.
const ERWARTETER_COMMIT = "89427c5b5aac4b362d2040c7b71bde8d52c1085d";
const ANDERER_COMMIT = "1f3a9d7e2c4b6a8f0e5d3c1b9a7f5e3d1c9b7a5f";

function detailAbgeschlossen() {
  return {
    budgetMs: VERSIEGELT_BUDGET_MS,
    nichtAbgerufen: 0,
    fehlerSchritte: [],
    fehlerhafteProfile: [],
    persistenz: { ergebnis: "ok", anfragen: 10, einzelnNachgezogen: 0, zaehlerVerfehlt: 0, bestandsTreffer: 100 },
    lazy: { cluster: 40, verarbeitet: 40, uebersprungeneStapel: 0, uebersprungeneDokumente: 0 },
    eager: { stapel: 10, verarbeitet: 40, zurueckgestellt: 0, vorgemerkt: 0, nichtVorgemerkt: 0, uebersprungeneStapel: 0, uebersprungeneDokumente: 0, andereSkips: 0 },
    kontext: { kontexte: 10, geteilt: 4, mandatseigen: 6, unbekannt: 0, dokumente: 2000, ohneSichtbarkeit: 0 },
    buendelung: "kontext"
  };
}

// Das realistische ehrliche `teilweise`: die Vormerkphase (lazy) schafft nicht alle
// Cluster im Budget, aber der Eager-Pfad hat JEDEN Stapel erreicht und JEDEN
// zurueckgestellten Cluster als pending-KO vorgemerkt (nichtVorgemerkt = 0).
function detailTeilweiseDauerhaft() {
  const d = detailAbgeschlossen();
  d.lazy = { cluster: 1242, verarbeitet: 60, uebersprungeneStapel: 0, uebersprungeneDokumente: 0 };
  d.eager = { stapel: 14, verarbeitet: 30, zurueckgestellt: 1212, vorgemerkt: 1212, nichtVorgemerkt: 0, uebersprungeneStapel: 0, uebersprungeneDokumente: 0, andereSkips: 0 };
  return d;
}

function laufkennungVon(slot) {
  return `cron-${slot.cronName}-${slot.stamp}-${slot.kuerzel}`;
}

function baueGlobal(slot, { status = "abgeschlossen", detail = null, mandate = MANDATE, ...overrides } = {}) {
  const laufkennung = laufkennungVon(slot);
  return {
    mode: "global",
    politicianId: null,
    globalphase: true,
    runId: `${laufkennung}-global`,
    createdAt: new Date(Date.parse(slot.slotIso) + 200000).toISOString(),
    // BEWUSST IRREFUEHREND: dieser Wert wird VOR dem Versiegeln gebildet und darf den
    // Budgetvertrag NICHT belegen (Review-Haertung 3). Er liegt hier unter der Wahrheit.
    durationMs: 120000,
    savedItems: 2000,
    newRawDocuments: 800,
    checkedSources: 181,
    successfulSources: 181,
    failedSources: 0,
    runState: "gesund",
    errorCodes: null,
    quellenVereinigung: {
      gesamt: 181, gemeinsam: 140, mandatseigen: 41, doppelteAbrufwege: 3,
      fehlerhafteProfile: [], mandate: mandate.length, mandateIds: [...mandate]
    },
    datenstandDetail: detail || detailAbgeschlossen(),
    _status: status,
    ...overrides
  };
}

function baueMandat(slot, politicianId, { status = "abgeschlossen", dauerMs = VERSIEGELT_DAUER_MS, budgetMs = VERSIEGELT_BUDGET_MS, ...overrides } = {}) {
  const laufkennung = laufkennungVon(slot);
  return {
    mode: "mandat",
    politicianId,
    // K1: die ECHTE Scheduler-Konvention (Falschbefund `mandatslauf-fehlt` des Nachweises
    // 2026-08-05). `runMandatsProjektion` vergibt eine EIGENE Kennung (`projektion-…`,
    // makeRunId) und bindet ueber das persistierte `globalLaufId` — die fruehere Fixture
    // (`runId: laufkennung`) kodierte eine Konvention, die es in Produktion nie gab, und
    // hielt damit genau den falschen Join des Bewertungskerns gruen.
    runId: `projektion-${slot.stamp}-${slot.kuerzel}${politicianId.slice(-2)}`,
    createdAt: new Date(Date.parse(slot.slotIso) + 230000).toISOString(),
    durationMs: 8000,
    matching: { candidates: 12, saved: 3 },
    decisions: { count: 5 },
    globalLaufId: `${laufkennung}-global`,
    datenstandFrisch: status === "abgeschlossen",
    datenstand: {
      laufId: `${laufkennung}-global`,
      status,
      versiegelt: true,
      frisch: status === "abgeschlossen",
      quellen: 181,
      rohdokumente: 2000,
      verstanden: status === "abgeschlossen" ? 40 : 30,
      budgetErschoepft: status !== "abgeschlossen",
      fehler: 0,
      buendelung: "kontext",
      kontexte: 10,
      dauerMs,
      budgetMs
    },
    ...overrides
  };
}

function baueProzessZeile(slot, { durationMs = VERSIEGELT_DAUER_MS, status = "success", commit = ERWARTETER_COMMIT } = {}) {
  return {
    runId: `${laufkennungVon(slot)}-global`,
    process: "globalphase",
    status,
    durationMs,
    createdAt: new Date(Date.parse(slot.slotIso) + 210000).toISOString(),
    commit,
    quelle: "relational"
  };
}

function baueLaeufe({ status = "abgeschlossen", detail = null, mandate = MANDATE } = {}) {
  const laeufe = [];
  for (const slot of SLOTS) {
    laeufe.push(baueGlobal(slot, {
      status, mandate,
      detail: detail ? JSON.parse(JSON.stringify(detail)) : (status === "teilweise" ? detailTeilweiseDauerhaft() : null)
    }));
    for (const m of mandate) laeufe.push(baueMandat(slot, m, { status }));
  }
  return laeufe;
}

// Die Baseline wird UNMITTELBAR NACH der Aktivierung erhoben (Vertrag: innerhalb
// BASELINE_TOLERANZ_MS = 15 min). Eine Minute danach ist der Regelfall.
const BASELINE_ERHOBEN_MS = AKTIVIERUNG_MS + 60000;

function baueStartbaseline(mandate = MANDATE, extra = {}) {
  const sig = V.mandatsSignatur(mandate);
  return {
    erhobenAtMs: BASELINE_ERHOBEN_MS,
    erhobenAt: new Date(BASELINE_ERHOBEN_MS).toISOString(),
    aktivierungAtMs: AKTIVIERUNG_MS,
    erwarteterDeploymentCommit: ERWARTETER_COMMIT,
    anzahl: sig.anzahl,
    mandate: sig.mandate,
    signatur: sig.signatur,
    ...extra
  };
}

function baueKosten(extra = {}) {
  return { fensterUsd: 1.2, rahmenUsd: 5, vollstaendig: true, unbepreisteEintraege: 0, ...extra };
}

function baueEingaben(overrides = {}) {
  return {
    jetztMs: JETZT_MS,
    fenster: { ...FENSTER },
    aktivierungAtMs: AKTIVIERUNG_MS,
    startbaseline: baueStartbaseline(),
    crons: CRONS,
    laeufe: baueLaeufe(),
    prozessLaeufe: SLOTS.map((s) => baueProzessZeile(s)),
    // K3: der Mindestbedarf rechnet jetzt (3 Regel-Slots + 1 Watchdog-Slot) x (1+5) +
    // Puffer 6 = 30; 40 liegt sauber oberhalb der Knapp-Zone (< 36 wuerde warnen).
    laufRetention: 40,
    watchdogCrons: [...WATCHDOG_CRONS],
    aktiveMandate: [...MANDATE],
    erwarteteMandatszahl: 5,
    kosten: baueKosten(),
    kontextErklaerungen: {},
    fairnessLaeufe: null,
    ...overrides
  };
}

// Hilfsfunktion: veraendere die globalen Laeufe ALLER Slots.
function mitGlobalPatch(patchFn) {
  const laeufe = baueLaeufe();
  for (const r of laeufe) if (r.mode === "global") patchFn(r);
  return laeufe;
}

console.log("== 0 · Kadenz und Kennungs-Parsing (harte Erwartungen) ==");
{
  const slots = V.erwarteteLaeufe({ vonMs: FENSTER.vonMs, bisMs: FENSTER.bisMs, crons: CRONS });
  check("0.1 GENAU drei erwartete schwere Laeufe im 24h-Fenster", slots && slots.length === 3, `ist ${slots && slots.length}`);
  check("0.2 Reihenfolge: pipeline 16:00 · crawl 20:00 · crawl 04:00",
    slots && slots[0].cronName === "pipeline" && slots[1].cronName === "crawl" && slots[2].cronName === "crawl"
    && new Date(slots[0].geplantMs).toISOString() === "2026-08-10T16:00:00.000Z"
    && new Date(slots[2].geplantMs).toISOString() === "2026-08-11T04:00:00.000Z");
  const parsed = V.laufStartAusRunId("cron-pipeline-20260810160003-aaaaa-global");
  check("0.3 Laufkennung traegt Startzeit + Cron + global-Suffix",
    parsed && parsed.cronName === "pipeline" && parsed.global === true
    && new Date(parsed.startMs).toISOString() === "2026-08-10T16:00:03.000Z");
  check("0.4 Fremde Kennungen (manuell/debug) werden NICHT als Cron-Lauf gelesen",
    V.laufStartAusRunId("manuell-20260810160003-aaaaa") === null
    && V.laufStartAusRunId("cron-lage-check-20260810160003-aaaaa") === null);
  check("0.5 Nicht-taegliche Cron-Plaene sind nicht auswertbar (kein Raten)",
    V.parseTagesplan("*/30 * * * *") === null && V.parseTagesplan("0 4 * * 1") === null);
}

console.log("\n== 1 · Vollstaendiger Lauf besteht (Vertragsfall 1) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben());
  check("1.1 Ausgang bestanden, Exit 0", b.ausgang === "bestanden" && b.exitCode === 0,
    JSON.stringify(b.befunde.slice(0, 3)));
  check("1.2 Keine Befunde", b.befunde.length === 0);
  check("1.3 Drei Laeufe bewertet, alle vollstaendig",
    b.laeufe.length === 3 && b.laeufe.every((l) => l.einstufung === "vollstaendig"));
}

console.log("\n== 2 · Ehrliches teilweise NUR wegen dauerhafter Verschiebung besteht mit Warnung (Fall 2) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe: baueLaeufe({ status: "teilweise" }) }));
  check("2.1 Ausgang bestanden", b.ausgang === "bestanden", JSON.stringify(b.befunde.slice(0, 3)));
  check("2.2 Warnung benennt Rueckstand + OP-14, kein stilles Gruen",
    b.warnungen.some((w) => w.includes("teilweise") && w.includes("OP-14") && w.includes("NICHT als geloest")));
}

console.log("\n== 3 · Nicht dauerhafte Verschiebung faellt durch (Fall 3) ==");
{
  const d = detailTeilweiseDauerhaft();
  d.eager.nichtVorgemerkt = 5;
  d.eager.vorgemerkt = 1207;
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe: baueLaeufe({ status: "teilweise", detail: d }) }));
  check("3.1 nichtVorgemerkt > 0 => nicht_bestanden", b.ausgang === "nicht_bestanden" && hatBefund(b, "rueckstand-nicht-dauerhaft"));
  const d2 = detailTeilweiseDauerhaft();
  d2.eager.uebersprungeneStapel = 2;
  d2.eager.uebersprungeneDokumente = 300;
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: baueLaeufe({ status: "teilweise", detail: d2 }) }));
  check("3.2 uebersprungener Eager-Stapel => nicht_bestanden", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "rueckstand-nicht-dauerhaft"));
  const d3 = detailTeilweiseDauerhaft();
  d3.eager.nichtVorgemerkt = null;
  const b3 = V.bewerteNachweisfenster(baueEingaben({ laeufe: baueLaeufe({ status: "teilweise", detail: d3 }) }));
  check("3.3 fehlende Zaehlung => blockiert (nicht bestanden, nicht geraten)",
    b3.ausgang === "blockiert" && hatBefund(b3, "rueckstand-nicht-vollstaendig-gezaehlt"));
}

console.log("\n== 4 · Quellenfehler faellt durch (Fall 4) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.nichtAbgerufen = 3; })
  }));
  check("4.1 nicht abgerufene Wege => nicht_bestanden", b.ausgang === "nicht_bestanden" && hatBefund(b, "quellenabruf-unvollstaendig"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.fehlerSchritte = [{ schritt: "abruf", fatal: false }]; })
  }));
  check("4.2 Abruf-Fehlerschritt => nicht_bestanden", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "fehler-abruf"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.failedSources = 12; r.errorCodes = null; })
  }));
  check("4.3 Quellenfehler ohne Klassifikation => nicht_bestanden",
    b3.ausgang === "nicht_bestanden" && hatBefund(b3, "quellenfehler-unklassifiziert"));
  const b4 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.failedSources = 2; r.errorCodes = { timeout: 2 }; })
  }));
  check("4.4 Klassifizierte, zulaessige Abweichung besteht mit Warnung",
    b4.ausgang === "bestanden" && b4.warnungen.some((w) => w.includes("klassifiziert")));
  const b5 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.runState = "stark-degradiert"; })
  }));
  check("4.5 Stark degradierter Abruf => nicht_bestanden", b5.ausgang === "nicht_bestanden" && hatBefund(b5, "abruf-degradiert"));
}

console.log("\n== 5 · Persistenzfehler faellt durch (Fall 5) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.persistenz = { ergebnis: "fehlend" }; })
  }));
  check("5.1 Persistenz fehlend => nicht_bestanden", b.ausgang === "nicht_bestanden" && hatBefund(b, "persistenz-nicht-belegt"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.newRawDocuments = null; })
  }));
  check("5.2 newRawDocuments=null => nicht_bestanden", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "persistenz-ergebnis-unbekannt"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.persistenz.zaehlerVerfehlt = 4; })
  }));
  check("5.3 Unaufgeloeste CAS-Kollision => nicht_bestanden", b3.ausgang === "nicht_bestanden" && hatBefund(b3, "persistenz-kollision-unaufgeloest"));
  const b4 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.fehlerSchritte = [{ schritt: "persistenz", fatal: false }]; })
  }));
  check("5.4 Persistenz-Fehlerschritt => nicht_bestanden", b4.ausgang === "nicht_bestanden" && hatBefund(b4, "fehler-persistenz"));
}

console.log("\n== 6 · Kontextvertragsfehler faellt durch (Fall 6) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.fehlerSchritte = [{ schritt: "kontextvertrag", fatal: true }]; })
  }));
  check("6.1 kontextvertrag-Fehlerschritt => nicht_bestanden", b.ausgang === "nicht_bestanden" && hatBefund(b, "fehler-kontextvertrag"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.kontext.kontexte = 9; })
  }));
  check("6.2 Verletzte Telemetriegleichung => nicht_bestanden", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "kontextgleichung-verletzt"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.buendelung = "global"; })
  }));
  check("6.3 K1-Buendelung statt Kontextpfad => nicht_bestanden", b3.ausgang === "nicht_bestanden" && hatBefund(b3, "globaler-pfad-nicht-verwendet"));
}

console.log("\n== 7 · Unbekannter Kontext ohne vollstaendige Ausweisung faellt durch (Fall 7) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => {
      r.datenstandDetail.kontext = { kontexte: 12, geteilt: 4, mandatseigen: 6, unbekannt: 2, dokumente: 2000, ohneSichtbarkeit: 3 };
    })
  }));
  check("7.1 Unbekannte Kontexte ohne Erklaerung => nicht_bestanden",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "unbekannte-kontexte-ohne-erklaerung"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail.kontext = null; })
  }));
  check("7.2 Fehlende Kontexttelemetrie => nicht_bestanden", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "kontexttelemetrie-fehlt"));
}

console.log("\n== 8 · Fehlender Mandatslauf faellt durch (Fall 8) ==");
{
  const laeufe = baueLaeufe().filter((r) => !(r.mode === "mandat" && r.politicianId === "mandat-e" && r.runId.includes("20260810200002")));
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("8.1 Ein fehlender Mandatslauf => nicht_bestanden mit Kennung",
    b.ausgang === "nicht_bestanden"
    && b.befunde.some((x) => x.grund === "mandatslauf-fehlt" && x.detail.includes("mandat-e")));
}

console.log("\n== 9 · Unvollstaendiger Mandatslauf faellt durch (Fall 9) ==");
{
  const laeufe = baueLaeufe().map((r) => (r.mode === "mandat" && r.politicianId === "mandat-b" && r.runId.includes("20260810160003")
    ? { ...r, matching: null }
    : r));
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("9.1 Verschlucktes Matching => nicht_bestanden",
    b.ausgang === "nicht_bestanden" && b.befunde.some((x) => x.grund === "mandatslauf-unvollstaendig" && x.detail.includes("mandat-b")));
  const laeufe2 = baueLaeufe().map((r) => (r.mode === "mandat" && r.politicianId === "mandat-c"
    ? { ...r, datenstand: { ...r.datenstand, versiegelt: false } }
    : r));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe2 }));
  check("9.2 Projektion auf unversiegeltem Datenstand => nicht_bestanden",
    b2.ausgang === "nicht_bestanden" && hatBefund(b2, "mandatslauf-auf-unversiegeltem-datenstand"));
}

console.log("\n== 10 · Sperrverweigerung zaehlt nicht als Erfolg (Fall 10) ==");
{
  // Sperre verweigert = runMandatsProjektion liefert skip, es entsteht KEIN Datensatz.
  const laeufe = baueLaeufe().filter((r) => !(r.mode === "mandat" && r.politicianId === "mandat-d" && r.runId.includes("20260811040004")));
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("10.1 Sperrverweigertes Mandat (kein Datensatz) => nicht_bestanden, nie Erfolg",
    b.ausgang === "nicht_bestanden" && b.befunde.some((x) => x.grund === "mandatslauf-fehlt" && x.detail.includes("mandat-d")));
}

console.log("\n== 11 · Manueller Lauf ist kein regulaerer Beleg (Fall 11) ==");
{
  // Der Slot crawl 20:00 hat KEINEN Cron-Lauf; stattdessen existiert ein manueller Lauf
  // 40 Minuten daneben. Er darf den Slot nicht fuellen und wird mit Grund gezaehlt.
  const laeufe = baueLaeufe().filter((r) => !r.runId.includes("20260810200002"));
  laeufe.push(baueGlobal({ cronName: "crawl", stamp: "20260810204500", slotIso: "2026-08-10T20:45:00Z", kuerzel: "manue" }));
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe,
    // Auch die dauerhafte Zeile fehlt fuer diesen Termin — sonst waere es eine Belegluecke.
    prozessLaeufe: [baueProzessZeile(SLOTS[0]), baueProzessZeile(SLOTS[2])]
  }));
  check("11.1 Slot bleibt unbelegt => nicht_bestanden (fehlender-lauf)",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "fehlender-lauf"));
  check("11.2 Ausserplanmaessiger Lauf wird MIT GRUND ausgeschlossen",
    b.ausgeschlossen.some((a) => a.grund.includes("kein-regulaerer-cron-termin")));
}

console.log("\n== 12 · Altes/falsches Zeitfenster wird ausgeschlossen (Fall 12) ==");
{
  const laeufe = baueLaeufe();
  laeufe.push(baueGlobal({ cronName: "pipeline", stamp: "20260809160002", slotIso: "2026-08-09T16:00:00Z", kuerzel: "altla" }));
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("12.1 Lauf ausserhalb des Fensters wird mit Grund gezaehlt und ignoriert",
    b.ausgang === "bestanden" && b.ausgeschlossen.some((a) => a.runId.includes("20260809") && a.grund === "ausserhalb-des-fensters"),
    JSON.stringify(b.befunde.slice(0, 2)));
}

console.log("\n== 13 · Fenster unter 24 h ergibt noch_nicht_auswertbar (Faelle 13 + 20) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({
    fenster: { vonMs: FENSTER.vonMs, bisMs: FENSTER.vonMs + 23 * 3600 * 1000 }
  }));
  check("13.1 23h-Fenster => noch_nicht_auswertbar, Exit 3",
    b.ausgang === "noch_nicht_auswertbar" && b.exitCode === 3 && hatBefund(b, "fenster-unter-24h"));
  // Auch mit PERFEKTEN Laufdaten wird ein kurzes Fenster nie gruen (Vertragspunkt 20).
  check("13.2 Kurzes Fenster wird NIE gruen, auch mit vollstaendigen Laeufen",
    b.ausgang !== "bestanden");
}

console.log("\n== 14 · Globaler Abruf deaktiviert ergibt keinen Erfolg (Fall 14) ==");
{
  // Deaktivierter globaler Abruf = die schweren Crons laufen im ALTPFAD (mode "full").
  const laeufe = baueLaeufe().filter((r) => r.mode !== "global");
  for (const slot of SLOTS) {
    laeufe.push({ mode: "full", politicianId: "mandat-a", runId: laufkennungVon(slot), createdAt: new Date(Date.parse(slot.slotIso) + 100000).toISOString() });
  }
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe, prozessLaeufe: [] }));
  check("14.1 Nur Altpfad-Laeufe => nicht_bestanden (fehlende globale Laeufe)",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "fehlender-lauf"));
}

console.log("\n== 15 · Aenderung der Mandatsmenge macht das Fenster ungueltig (Fall 15) ==");
{
  const laeufe = baueLaeufe();
  const einer = laeufe.find((r) => r.mode === "global" && r.runId.includes("20260811040004"));
  einer.quellenVereinigung = { ...einer.quellenVereinigung, mandate: 6, mandateIds: [...MANDATE, "mandat-f"] };
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("15.1 Lauf mit anderer Mandatsmenge => blockiert (fenster-ungueltig)",
    b.ausgang === "blockiert" && hatBefund(b, "fenster-ungueltig-mandatsmenge-veraendert"));
  const laeufe2 = baueLaeufe();
  laeufe2.push(baueMandat(SLOTS[0], "mandat-neu"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe2 }));
  check("15.2 Unerwartetes Mandat im Lauf => blockiert (fenster-ungueltig)",
    b2.ausgang === "blockiert" && hatBefund(b2, "fenster-ungueltig-mandatsmenge-veraendert"));
}

console.log("\n== 16 · Budgetueberziehung faellt durch (Fall 16) ==");
{
  // VERSIEGELTE Dauer ueber Budget — der Laufdatensatz-Wert `durationMs` bleibt unauffaellig.
  const laeufe = baueLaeufe().map((r) => (r.mode === "mandat"
    ? { ...r, datenstand: { ...r.datenstand, dauerMs: 267122 } }
    : r));
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe, prozessLaeufe: SLOTS.map((s) => baueProzessZeile(s, { durationMs: 267122 }))
  }));
  check("16.1 Versiegelte Dauer ueber Budget => nicht_bestanden",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "globalphase-budget-ueberzogen"));
  const laeufe2 = baueLaeufe().map((r) => (r.mode === "mandat" && r.runId.includes("20260810160003") && r.politicianId === "mandat-e"
    ? { ...r, createdAt: "2026-08-10T16:09:00.000Z" }
    : r));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe2 }));
  check("16.2 Aeusseres Zeitlimit ueberzogen => nicht_bestanden",
    b2.ausgang === "nicht_bestanden" && hatBefund(b2, "aeusseres-zeitlimit-ueberzogen"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({
    fairnessLaeufe: { pipeline: { laufId: "cron-pipeline-20260810160003-aaaaa", status: "abgebrochen" } }
  }));
  check("16.3 Abbruch-/Timeout-Vermerk im Fairness-Laufdatensatz => nicht_bestanden",
    b3.ausgang === "nicht_bestanden" && hatBefund(b3, "lauf-abgebrochen"));
}

console.log("\n== 17 · Neue Fehlerklasse faellt durch (Fall 17) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.failedSources = 1; r.errorCodes = { "unknown": 1 }; })
  }));
  check("17.1 errorCode 'unknown' = unbekannte Klasse => nicht_bestanden",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "neue-fehlerklasse"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.failedSources = 1; r.errorCodes = { "voellig-neu": 1 }; })
  }));
  check("17.2 Unbekanntes Codewort => nicht_bestanden",
    b2.ausgang === "nicht_bestanden" && hatBefund(b2, "neue-fehlerklasse"));
}

console.log("\n== 18/19 · Auffaellige Kontextzahl (K5): unbelegt = Diagnosebedarf, erklaert/zusammengesetzt besteht ==");
{
  const auffaellig = (r) => {
    r.datenstandDetail.kontext = { kontexte: 40, geteilt: 34, mandatseigen: 6, unbekannt: 0, dokumente: 2000, ohneSichtbarkeit: 0 };
  };
  // K5 (Produktentscheidung 9): eine dokumentgetriebene Kontextzahl wird NICHT mehr per
  // blinder `2n+1`-Formel als fachlicher Fehler bewertet. Ohne belegbare Zusammensetzung
  // ist sie DIAGNOSEBEDARF (blockiert) — kein bewiesener Vertragsbruch, aber auch nie gruen.
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe: mitGlobalPatch(auffaellig) }));
  check("18.1 kontexte=40 (> 2n+1=11) ohne Zusammensetzung/Erklaerung => blockiert (Diagnosebedarf, kein Fehlurteil)",
    b.ausgang === "blockiert" && hatBefund(b, "kontextzahl-diagnosebedarf")
    && !hatBefund(b, "auffaellige-kontextzahl-ohne-erklaerung"),
    JSON.stringify(b.befunde.slice(0, 2)));
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch(auffaellig),
    kontextErklaerungen: { "*": "Viele echte Teilmengen durch neue Regionalquellen — geprueft, Partition und Grenzen halten." }
  }));
  check("19.1 Dieselbe Zahl MIT dokumentierter Erklaerung => bestanden mit Warnung",
    b2.ausgang === "bestanden" && b2.warnungen.some((w) => w.includes("Aufgreifschwelle")));
}

console.log("\n== 20/21 · Fuenf Mandate dynamisch, keine alte Sechs-Erwartung, keine Namen ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({ erwarteteMandatszahl: 6 }));
  check("20.1 Alte Sechs-Mandate-Erwartung passt nicht mehr => blockiert",
    b.ausgang === "blockiert" && hatBefund(b, "mandatszahl-weicht-von-erwartung-ab"));
  const cliQuelle = fs.readFileSync(path.join(__dirname, "op25-production-nachweis.js"), "utf8");
  check("20.2 CLI-Gegenprobe dokumentiert FUENF Mandate", /DOKUMENTIERTE_ERWARTETE_MANDATE = 5/.test(cliQuelle));
  const kernQuelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "op25-nachweis.js"), "utf8");
  const produktionsSlugs = ["cem-ince", "annika-klose", "helmut-kleebank", "ottilie", "ruppert-st-we", "max-mustermann", "angela-merkel", "james-brown"];
  check("21.1 KEINE hartkodierten Mandats-IDs im Kern oder CLI (dynamische Ermittlung)",
    produktionsSlugs.every((s) => !kernQuelle.includes(s) && !cliQuelle.includes(s)));
  // Dynamik-Beweis: dieselbe Bewertung funktioniert mit einer VOELLIG anderen Menge.
  const andereMandate = ["x-1", "x-2", "x-3"];
  const laeufe = [];
  for (const slot of SLOTS) {
    const g = baueGlobal(slot, { mandate: andereMandate });
    // Aufgreifschwelle bei n=3 ist 2n+1=7 — die Fixture bleibt darunter (4+3+0=7).
    g.datenstandDetail.kontext = { kontexte: 7, geteilt: 4, mandatseigen: 3, unbekannt: 0, dokumente: 2000, ohneSichtbarkeit: 0 };
    laeufe.push(g);
    for (const m of andereMandate) laeufe.push(baueMandat(slot, m));
  }
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    laeufe, aktiveMandate: andereMandate, erwarteteMandatszahl: 3,
    startbaseline: baueStartbaseline(andereMandate)
  }));
  check("21.2 Beliebige dynamische Mandatsmenge wird korrekt bewertet", b2.ausgang === "bestanden", JSON.stringify(b2.befunde.slice(0, 3)));
}

console.log("\n== 22 · Der gescheiterte Lauf vom 03.08.2026 kann KEIN Fenster gruen machen ==");
{
  check("22.1 Harte Untergrenze ist der 2026-08-04 00:00 UTC",
    new Date(V.FRUEHESTER_FENSTERSTART_MS).toISOString() === "2026-08-04T00:00:00.000Z");
  const b = V.bewerteNachweisfenster(baueEingaben({
    aktivierungAtMs: Date.parse("2026-08-03T13:15:11Z"),
    fenster: { vonMs: Date.parse("2026-08-03T13:15:11Z"), bisMs: Date.parse("2026-08-04T14:00:00Z") }
  }));
  check("22.2 Fenster ab 2026-08-03 => blockiert (fenster-vor-neustart), nie gruen",
    b.ausgang === "blockiert" && hatBefund(b, "fenster-vor-neustart"));
}

console.log("\n== 23 · Leerer oder fehlerhaft gelesener Datenbestand ist NIE ein Erfolg ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe: null }));
  check("23.1 Nicht lesbare Laufdaten => blockiert", b.ausgang === "blockiert" && hatBefund(b, "laufdaten-nicht-lesbar"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: [], prozessLaeufe: [] }));
  check("23.2 Leere Laufdaten => nicht_bestanden (fehlende Laeufe)", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "fehlender-lauf"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({ aktiveMandate: [] }));
  check("23.3 Leerer Endzustand => blockiert", b3.ausgang === "blockiert" && hatBefund(b3, "aktive-mandatsmenge-nicht-ermittelbar"));
  const b4 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.savedItems = 0; })
  }));
  check("23.4 Lauf ohne ein einziges Rohitem => nicht_bestanden (leerer-datenbestand)",
    b4.ausgang === "nicht_bestanden" && hatBefund(b4, "leerer-datenbestand"));
}

console.log("\n== 24 · Keine Secrets/PII im Kern; Bericht traegt nur Kennungen und Zaehler ==");
{
  const kernQuelle = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "op25-nachweis.js"), "utf8");
  check("24.1 Kern liest keinerlei Profilinhalte (fullName/committees/email tauchen nicht auf)",
    !/fullName|committees|email|passwort|password/i.test(kernQuelle));
  const b = V.bewerteNachweisfenster(baueEingaben());
  const ausgabe = JSON.stringify(b);
  check("24.2 Bewertung enthaelt keine Env-Werte/Secrets",
    !ausgabe.includes("SUPABASE") && !ausgabe.includes("SERVICE_ROLE"));
}

console.log("\n== 25 · Fenster- und Vorrangregeln (Zusatzfaelle) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({ aktivierungAtMs: null }));
  check("25.1 Ohne Aktivierungszeitpunkt => noch_nicht_auswertbar (Dry-Run-Zustand heute)",
    b.ausgang === "noch_nicht_auswertbar" && hatBefund(b, "aktivierungszeitpunkt-unbekannt"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ fenster: null }));
  check("25.2 Ohne Fenster => noch_nicht_auswertbar", b2.ausgang === "noch_nicht_auswertbar" && hatBefund(b2, "kein-beobachtungsfenster"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({
    fenster: { vonMs: Date.parse("2026-08-12T00:00:00Z"), bisMs: Date.parse("2026-08-13T00:00:00Z") }
  }));
  check("25.3 Fensterende in der Zukunft => noch_nicht_auswertbar",
    b3.ausgang === "noch_nicht_auswertbar" && hatBefund(b3, "fenster-noch-nicht-vergangen"));
  const b4 = V.bewerteNachweisfenster(baueEingaben({
    aktivierungAtMs: Date.parse("2026-08-10T13:00:00Z"),
    startbaseline: baueStartbaseline(MANDATE, { aktivierungAtMs: Date.parse("2026-08-10T13:00:00Z") })
  }));
  check("25.4 Fenster beginnt vor der Aktivierung => blockiert",
    b4.ausgang === "blockiert" && hatBefund(b4, "fenster-vor-aktivierung"));
  // Vorrang: eine BEWIESENE Verletzung dominiert eine gleichzeitige Belegluecke.
  const laeufe = baueLaeufe();
  const erster = laeufe.find((r) => r.mode === "global" && r.runId.includes("20260810160003"));
  erster.datenstandDetail = null; // Belegluecke am ersten Lauf
  const zweiter = laeufe.find((r) => r.mode === "global" && r.runId.includes("20260810200002"));
  zweiter.datenstandDetail.nichtAbgerufen = 9; // bewiesene Verletzung am zweiten
  const b5 = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("25.5 Vorrang: nicht_bestanden schlaegt blockiert",
    b5.ausgang === "nicht_bestanden" && hatBefund(b5, "quellenabruf-unvollstaendig") && hatBefund(b5, "laufdatensatz-ohne-ursachenzerlegung"));
  const b6 = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.datenstandDetail = null; })
  }));
  check("25.6 Laufdatensatz ohne Ursachenzerlegung => blockiert (kein Bestehen ohne Beleg)",
    b6.ausgang === "blockiert" && hatBefund(b6, "laufdatensatz-ohne-ursachenzerlegung"));
}

console.log("\n== 26 · Statusregeln (Zusatzfaelle) ==");
{
  const laeufe = baueLaeufe({ status: "fehlgeschlagen" });
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("26.1 datenstand=fehlgeschlagen => nicht_bestanden", b.ausgang === "nicht_bestanden" && hatBefund(b, "datenstand-fehlgeschlagen"));
  const laeufe4 = baueLaeufe().map((r) => (r.mode === "mandat" && r.politicianId === "mandat-a" && r.runId.includes("20260810160003")
    ? { ...r, datenstand: { ...r.datenstand, laufId: "cron-pipeline-20260809160002-fremd-global" } }
    : r));
  const b4 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe4 }));
  check("26.2 Mandatslauf auf FREMDEM Datenstand => nicht_bestanden",
    b4.ausgang === "nicht_bestanden" && hatBefund(b4, "mandatslauf-fremder-datenstand"));
  const laeufe5 = baueLaeufe().map((r) => (r.mode === "mandat" && r.runId.includes("20260810160003") && r.politicianId === "mandat-a"
    ? { ...r, datenstand: { ...r.datenstand, status: "teilweise" } }
    : r));
  const b5 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe5 }));
  check("26.3 Uneinheitlicher Status im selben Lauf => nicht_bestanden",
    b5.ausgang === "nicht_bestanden" && hatBefund(b5, "datenstand-status-uneinheitlich"));
}

console.log("\n== 27 · Rueckstand zaehlt unabhaengig vom Statuswort (kein falsches Gruen) ==");
{
  // Der Bestand KANN `abgeschlossen` versiegeln, obwohl Eager-Arbeit zurueckgestellt
  // wurde (Eager-Rueckstand fliesst nicht in budgetErschoepft ein). Der Vertrag prueft
  // die Dauerhaftigkeit deshalb am RUECKSTAND, nicht am Statuswort.
  const d = detailAbgeschlossen();
  d.eager = { stapel: 10, verarbeitet: 20, zurueckgestellt: 20, vorgemerkt: 10, nichtVorgemerkt: 10, uebersprungeneStapel: 0, uebersprungeneDokumente: 0, andereSkips: 0 };
  d.lazy = { cluster: 40, verarbeitet: 30, uebersprungeneStapel: 0, uebersprungeneDokumente: 0 };
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe: baueLaeufe({ status: "abgeschlossen", detail: d }) }));
  check("27.1 status=abgeschlossen MIT nicht-dauerhaftem Rueckstand => nicht_bestanden",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "rueckstand-nicht-dauerhaft"));
  const d2 = detailAbgeschlossen();
  d2.eager = { stapel: 10, verarbeitet: 20, zurueckgestellt: 20, vorgemerkt: 20, nichtVorgemerkt: 0, uebersprungeneStapel: 0, uebersprungeneDokumente: 0, andereSkips: 0 };
  d2.lazy = { cluster: 40, verarbeitet: 30, uebersprungeneStapel: 0, uebersprungeneDokumente: 0 };
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: baueLaeufe({ status: "abgeschlossen", detail: d2 }) }));
  check("27.2 status=abgeschlossen mit DAUERHAFTEM Rueckstand => bestanden mit Warnung",
    b2.ausgang === "bestanden" && b2.warnungen.some((w) => w.includes("OP-14")));
}

// =============================================================================================
console.log("\n== 28 · REVIEW-HAERTUNG 1: Kostenvertrag ist fail closed ==");
// =============================================================================================
{
  // Reine Wertpruefung — unabhaengig von der Fensterbewertung.
  check("28.1 Nur endliche, nicht negative ZAHLEN sind brauchbar",
    V.istBrauchbareKostenzahl(0) === true
    && V.istBrauchbareKostenzahl(1.5) === true
    && V.istBrauchbareKostenzahl(NaN) === false
    && V.istBrauchbareKostenzahl(Infinity) === false
    && V.istBrauchbareKostenzahl(-Infinity) === false
    && V.istBrauchbareKostenzahl(-0.01) === false
    && V.istBrauchbareKostenzahl("1.5") === false
    && V.istBrauchbareKostenzahl(true) === false
    && V.istBrauchbareKostenzahl(null) === false);

  // Die GEMEINSAME Wurzel des Befunds: `Number(null) === 0` und `Number.isFinite(0)` ist
  // wahr — jedes fehlende Feld waere sonst eine belegte Null. `alsZahl` trennt das strikt.
  check("28.1b alsZahl: null/undefined/leer sind NICHT 0, sondern 'nicht vorhanden'",
    V.alsZahl(null) === null && V.alsZahl(undefined) === null && V.alsZahl("") === null
    && V.alsZahl(NaN) === null && V.alsZahl(Infinity) === null
    && V.alsZahl(0) === 0 && V.alsZahl("12") === 12 && V.alsZahl(-5) === -5);

  // DER KERN DES BEFUNDS: `NaN > rahmen` ist immer false — ohne Validierung waere ein
  // kaputter Kostenwert ein BESTANDENER Vertrag gewesen.
  const bNaN = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ fensterUsd: NaN }) }));
  check("28.2 fensterUsd = NaN => blockiert (frueher waere es bestanden gewesen)",
    bNaN.ausgang === "blockiert" && hatBefund(bNaN, "kostenwert-unbrauchbar"));
  const bInf = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ fensterUsd: Infinity }) }));
  check("28.3 fensterUsd = Infinity => blockiert", bInf.ausgang === "blockiert" && hatBefund(bInf, "kostenwert-unbrauchbar"));
  const bNeg = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ fensterUsd: -3 }) }));
  check("28.4 negative Fensterkosten => blockiert", bNeg.ausgang === "blockiert" && hatBefund(bNeg, "kostenwert-unbrauchbar"));
  const bStr = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ fensterUsd: "1.20" }) }));
  check("28.5 Zeichenkette statt Zahl => blockiert", bStr.ausgang === "blockiert" && hatBefund(bStr, "kostenwert-unbrauchbar"));
  const bRahmen = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ rahmenUsd: NaN }) }));
  check("28.6 Unbrauchbarer Kostenrahmen => blockiert", bRahmen.ausgang === "blockiert" && hatBefund(bRahmen, "kostenrahmen-unbrauchbar"));

  // Vollstaendigkeit: eine fehlende Nutzungsliste sieht wie 0,00 USD aus.
  const bLeer = V.bewerteNachweisfenster(baueEingaben({
    kosten: { fensterUsd: 0, rahmenUsd: 5, vollstaendig: false, unbepreisteEintraege: 0, grund: "llmUsage fehlt im Auth-Store" }
  }));
  check("28.7 Fehlende Nutzungsliste (0 USD, aber unvollstaendig) => blockiert, NIE bestanden",
    bLeer.ausgang === "blockiert" && hatBefund(bLeer, "kostendaten-unvollstaendig"));
  const bOhneFlag = V.bewerteNachweisfenster(baueEingaben({
    kosten: { fensterUsd: 1.2, rahmenUsd: 5, unbepreisteEintraege: 0 }
  }));
  check("28.8 Fehlende Vollstaendigkeitszusage => blockiert (kein implizites Vertrauen)",
    bOhneFlag.ausgang === "blockiert" && hatBefund(bOhneFlag, "kostendaten-unvollstaendig"));
  const bUnbepreist = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ unbepreisteEintraege: 7 }) }));
  check("28.9 Teilweise unbepreiste Nutzung => blockiert (Summe waere zu klein)",
    bUnbepreist.ausgang === "blockiert" && hatBefund(bUnbepreist, "kosten-nicht-bepreisbar"));
  const bUnbekannt = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ unbepreisteEintraege: null }) }));
  check("28.10 Unbelegte Zahl unbepreisbarer Eintraege => blockiert",
    bUnbekannt.ausgang === "blockiert" && hatBefund(bUnbekannt, "kostendaten-unvollstaendig"));
  const bFehlt = V.bewerteNachweisfenster(baueEingaben({ kosten: null }));
  check("28.11 Kostenblock fehlt ganz => blockiert", bFehlt.ausgang === "blockiert" && hatBefund(bFehlt, "kostenrahmen-nicht-belegbar"));
  const bUeber = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ fensterUsd: 9.5 }) }));
  check("28.12 Vollstaendige Daten ueber dem Rahmen => nicht_bestanden (nicht blockiert)",
    bUeber.ausgang === "nicht_bestanden" && hatBefund(bUeber, "llm-kosten-ueber-rahmen"));
  const bGrenze = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ fensterUsd: 5, rahmenUsd: 5 }) }));
  check("28.13 Exakt am Rahmen => besteht (die Grenze selbst ist zulaessig)", bGrenze.ausgang === "bestanden");
  const bNull = V.bewerteNachweisfenster(baueEingaben({ kosten: baueKosten({ fensterUsd: 0 }) }));
  check("28.14 BELEGTE 0,00 USD bestehen (kein Pauschalverdacht gegen null Kosten)", bNull.ausgang === "bestanden");
}

// =============================================================================================
console.log("\n== 29 · REVIEW-HAERTUNG 2: Mandatsmenge identitaetsgenau eingefroren ==");
// =============================================================================================
{
  // Signatur: Reihenfolge und Duplikate sind egal, die MENGE zaehlt.
  const s1 = V.mandatsSignatur(["b", "a", "c"]);
  const s2 = V.mandatsSignatur(["c", "c", "a", "b"]);
  check("29.1 Signatur ist reihenfolge- und duplikatunabhaengig",
    s1.signatur === s2.signatur && s1.anzahl === 3);
  const s3 = V.mandatsSignatur(["a", "b", "d"]);
  check("29.2 GLEICHE Anzahl, andere Identitaeten => ANDERE Signatur (der Kern des Befunds)",
    s1.anzahl === s3.anzahl && s1.signatur !== s3.signatur, `${s1.signatur} vs ${s3.signatur}`);

  // (a) AUSTAUSCH BEI GLEICHER ANZAHL — frueher unsichtbar, weil nur die Zahl gespeichert war.
  const getauscht = ["mandat-a", "mandat-b", "mandat-c", "mandat-d", "mandat-X"];
  const laeufeTausch = baueLaeufe();
  for (const r of laeufeTausch) {
    if (r.mode === "global") r.quellenVereinigung = { ...r.quellenVereinigung, mandateIds: [...getauscht] };
  }
  const bTausch = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufeTausch }));
  check("29.3 Austausch bei GLEICHER Anzahl (5 -> 5) => blockiert, Fenster ungueltig",
    bTausch.ausgang === "blockiert" && hatBefund(bTausch, "fenster-ungueltig-mandatsmenge-veraendert"));

  // (b) AENDERUNG ZWISCHEN ZWEI LAEUFEN — nur der mittlere Lauf weicht ab.
  const laeufeMitte = baueLaeufe();
  const mittlerer = laeufeMitte.find((r) => r.mode === "global" && r.runId.includes("20260810200002"));
  mittlerer.quellenVereinigung = { ...mittlerer.quellenVereinigung, mandateIds: [...getauscht] };
  const bMitte = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufeMitte }));
  check("29.4 Aenderung zwischen zwei Laeufen => blockiert, GENAU der mittlere Termin benannt",
    bMitte.ausgang === "blockiert"
    && bMitte.befunde.filter((x) => x.grund === "fenster-ungueltig-mandatsmenge-veraendert").length === 1
    && bMitte.befunde.some((x) => x.grund === "fenster-ungueltig-mandatsmenge-veraendert"
      && x.detail.startsWith("crawl@2026-08-10T20:00:00.000Z")),
    JSON.stringify(bMitte.befunde.slice(0, 2)));

  // (c) SPAETERE RUECKKEHR ZUR URSPRUNGSMENGE heilt das Fenster NICHT: der Endzustand
  //     stimmt wieder, der mittlere Lauf bleibt aber ein Beleg fuer die Veraenderung.
  check("29.5 Rueckkehr zur Ursprungsmenge heilt das Fenster NICHT (Endzustand stimmt, Lauf nicht)",
    bMitte.ausgang === "blockiert" && V.mandatsSignatur(MANDATE).signatur === V.mandatsSignatur([...MANDATE]).signatur);

  // (d) ENDZUSTAND weicht ab — der Bestand wurde nach dem Fenster veraendert.
  const bEnde = V.bewerteNachweisfenster(baueEingaben({ aktiveMandate: getauscht }));
  check("29.6 Endzustand weicht von der eingefrorenen Menge ab => blockiert",
    bEnde.ausgang === "blockiert"
    && bEnde.befunde.some((x) => x.grund === "fenster-ungueltig-mandatsmenge-veraendert" && x.detail.includes("Endzustand")));

  // (e) OHNE Startbaseline gibt es keinen Beleg fuer den Zustand am Fensterstart.
  const bOhne = V.bewerteNachweisfenster(baueEingaben({ startbaseline: null }));
  check("29.7 Fehlende Startbaseline => blockiert (kein Ersatz aus dem AKTUELLEN Bestand)",
    bOhne.ausgang === "blockiert" && hatBefund(bOhne, "startbaseline-fehlt"));

  // (f) Manipulierte Baseline: Liste und Signatur passen nicht zusammen.
  const bManipuliert = V.bewerteNachweisfenster(baueEingaben({
    startbaseline: baueStartbaseline(MANDATE, { mandate: getauscht })
  }));
  check("29.8 Nachtraeglich veraenderte Baseline (Signatur passt nicht) => blockiert",
    bManipuliert.ausgang === "blockiert" && hatBefund(bManipuliert, "startbaseline-signatur-passt-nicht"));

  // (g) Baseline einer FREMDEN Aktivierung.
  const bFremd = V.bewerteNachweisfenster(baueEingaben({
    startbaseline: baueStartbaseline(MANDATE, { aktivierungAtMs: Date.parse("2026-08-05T09:00:00Z") })
  }));
  check("29.9 Baseline gehoert zu einer anderen Aktivierung => blockiert",
    bFremd.ausgang === "blockiert" && hatBefund(bFremd, "startbaseline-fremde-aktivierung"));

  // (h) Baseline erst NACH dem Fensterstart erhoben — sie belegt den Startzustand nicht.
  const bSpaet = V.bewerteNachweisfenster(baueEingaben({
    startbaseline: baueStartbaseline(MANDATE, { erhobenAtMs: FENSTER.bisMs - 1000 })
  }));
  check("29.10 Zu spaet erhobene Baseline => blockiert",
    bSpaet.ausgang === "blockiert" && hatBefund(bSpaet, "startbaseline-zu-spaet-erhoben"));

  // (i) Ein Lauf, der GAR KEINE Identitaeten traegt (Altdatensatz), ist nicht pruefbar.
  const laeufeOhneIds = baueLaeufe();
  for (const r of laeufeOhneIds) {
    if (r.mode === "global") r.quellenVereinigung = { ...r.quellenVereinigung, mandateIds: undefined };
  }
  const bOhneIds = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufeOhneIds }));
  check("29.11 Lauf ohne Mandatskennungen (nur Anzahl) => blockiert, nie bestanden",
    bOhneIds.ausgang === "blockiert" && hatBefund(bOhneIds, "mandatsidentitaeten-nicht-belegt"));
}

// =============================================================================================
console.log("\n== 30 · REVIEW-HAERTUNG 3: dauerhafte Belegquelle, Aufbewahrung, versiegelte Dauer ==");
// =============================================================================================
{
  // (a) Der entscheidende Unterschied: VERDRAENGT (Lauf fand statt) vs. NIE GELAUFEN.
  const ohneMittleren = baueLaeufe().filter((r) => !r.runId.includes("20260810200002"));
  const bVerdraengt = V.bewerteNachweisfenster(baueEingaben({
    laeufe: ohneMittleren,
    prozessLaeufe: SLOTS.map((s) => baueProzessZeile(s)) // dauerhafte Zeile IST vorhanden
  }));
  check("30.1 Laufdatensatz fehlt, dauerhafte Zeile vorhanden => blockiert (verdraengt), NICHT nicht_bestanden",
    bVerdraengt.ausgang === "blockiert" && hatBefund(bVerdraengt, "laufbeleg-verdraengt"));
  const bNieGelaufen = V.bewerteNachweisfenster(baueEingaben({
    laeufe: ohneMittleren,
    prozessLaeufe: [baueProzessZeile(SLOTS[0]), baueProzessZeile(SLOTS[2])] // auch dauerhaft nichts
  }));
  check("30.2 Beide Belege fehlen => nicht_bestanden (fehlender-lauf)",
    bNieGelaufen.ausgang === "nicht_bestanden" && hatBefund(bNieGelaufen, "fehlender-lauf"));

  // (b) K3-Aufbewahrungsvertrag, reproduzierbar: (3 Regel-Slots + 1 Watchdog-Slot)
  //     x (1 global + 5 Mandate) + Puffer 6 = 30 — nicht mehr die alte 18er-Formel.
  const bStandard = V.bewerteNachweisfenster(baueEingaben());
  check("30.3 Benoetigte Datensaetze werden ausgewiesen ((3+1) x (1+5) + 6 = 30)",
    bStandard.benoetigteDatensaetze === 30, String(bStandard.benoetigteDatensaetze));
  const bKnapp = V.bewerteNachweisfenster(baueEingaben({ laufRetention: 32 }));
  check("30.4 Retention 32 bei Mindestbedarf 30 => besteht, aber Warnung 'Aufbewahrung knapp'",
    bKnapp.ausgang === "bestanden" && bKnapp.warnungen.some((w) => w.includes("Aufbewahrung knapp")),
    JSON.stringify(bKnapp.befunde.slice(0, 2)));
  const bZuKlein = V.bewerteNachweisfenster(baueEingaben({ laufRetention: 12 }));
  check("30.5 Retention kleiner als der Bedarf => blockiert (Aufbewahrungsvertrag verletzt)",
    bZuKlein.ausgang === "blockiert" && hatBefund(bZuKlein, "aufbewahrung-reicht-nicht"));

  // (c) Tatsaechliche Verdraengung: Ablage an der Grenze, aeltester Datensatz nach Fensterstart.
  const nurLetzterSlot = baueLaeufe().filter((r) => r.runId.includes("20260811040004"));
  const bHorizont = V.bewerteNachweisfenster(baueEingaben({
    laeufe: nurLetzterSlot,
    laufRetention: nurLetzterSlot.length,       // Ablage sitzt an ihrer Grenze
    prozessLaeufe: []                           // keine dauerhafte Zeile
  }));
  check("30.6 Ablage an der Grenze + Termin vor dem Horizont => blockiert (verdraengt), nie stiller Erfolg",
    bHorizont.ausgang === "blockiert" && hatBefund(bHorizont, "laufbeleg-verdraengt"));

  // (d) VERSIEGELTE Dauer: `globalerLauf.durationMs` darf den Budgetvertrag NICHT belegen.
  //     Entscheidendes Paar — dieselbe Fixture, nur die versiegelte Zahl wechselt die Seite.
  const laufDauerLuegtNachUnten = baueLaeufe().map((r) => (r.mode === "mandat"
    ? { ...r, datenstand: { ...r.datenstand, dauerMs: 267122 } }   // versiegelt: ueber Budget
    : { ...r, durationMs: 1000 }));                                 // Laufdatensatz: harmlos
  const bLuegt = V.bewerteNachweisfenster(baueEingaben({
    laeufe: laufDauerLuegtNachUnten,
    prozessLaeufe: SLOTS.map((s) => baueProzessZeile(s, { durationMs: 267122 }))
  }));
  check("30.7 Versiegelt ueber Budget, durationMs harmlos => nicht_bestanden (durationMs zaehlt nicht)",
    bLuegt.ausgang === "nicht_bestanden" && hatBefund(bLuegt, "globalphase-budget-ueberzogen"));
  const laufDauerLuegtNachOben = baueLaeufe().map((r) => (r.mode === "global"
    ? { ...r, durationMs: 999999 }   // Laufdatensatz weit ueber Budget …
    : r));                            // … versiegelt bleibt 190 000 ms
  const bLuegt2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laufDauerLuegtNachOben }));
  check("30.8 durationMs weit ueber Budget, versiegelt darunter => besteht (Gegenprobe)",
    bLuegt2.ausgang === "bestanden", JSON.stringify(bLuegt2.befunde.slice(0, 2)));

  // (e) Ohne jede versiegelte Zeitangabe ist die Budgetgrenze nicht pruefbar.
  const ohneZeit = baueLaeufe().map((r) => (r.mode === "mandat"
    ? { ...r, datenstand: { ...r.datenstand, dauerMs: null, budgetMs: null } }
    : r));
  for (const r of ohneZeit) if (r.mode === "global") r.datenstandDetail.budgetMs = null;
  const bOhneZeit = V.bewerteNachweisfenster(baueEingaben({ laeufe: ohneZeit, prozessLaeufe: [] }));
  check("30.9 Weder Vermerk noch dauerhafte Zeile tragen die Laufzeit => blockiert",
    bOhneZeit.ausgang === "blockiert" && hatBefund(bOhneZeit, "versiegelte-laufzeit-nicht-belegt"));

  // (f) Die dauerhafte Zeile ist Rueckfallebene, wenn der Vermerk keine Dauer traegt.
  const ohneVermerkDauer = baueLaeufe().map((r) => (r.mode === "mandat"
    ? { ...r, datenstand: { ...r.datenstand, dauerMs: null } }
    : r));
  const bRueckfall = V.bewerteNachweisfenster(baueEingaben({ laeufe: ohneVermerkDauer }));
  check("30.10 Dauer aus der dauerhaften Zeile, Budget aus dem Laufdetail => besteht",
    bRueckfall.ausgang === "bestanden", JSON.stringify(bRueckfall.befunde.slice(0, 2)));

  // (g) Widersprechen sich die Belege, wird das benannt statt einer Quelle blind geglaubt.
  const bWiderspruch = V.bewerteNachweisfenster(baueEingaben({
    prozessLaeufe: SLOTS.map((s) => baueProzessZeile(s, { durationMs: 210000 }))
  }));
  check("30.11 Dauerhafte Zeile widerspricht dem Vermerk => nicht_bestanden",
    bWiderspruch.ausgang === "nicht_bestanden" && hatBefund(bWiderspruch, "belege-widersprechen-sich"));

  // (h) Ein dauerhaft als `failed` vermerkter Lauf ist nie ein Beleg fuer Erfolg.
  const bFailed = V.bewerteNachweisfenster(baueEingaben({
    prozessLaeufe: SLOTS.map((s) => baueProzessZeile(s, { status: "failed" }))
  }));
  check("30.12 Dauerhafte Zeile meldet failed => nicht_bestanden",
    bFailed.ausgang === "nicht_bestanden" && hatBefund(bFailed, "dauerhafter-beleg-fehlgeschlagen"));

  // (i) NACHTRAGSKORREKTUR 2026-08-04/5: die dauerhafte Zeile traegt den EINZIGEN
  //     Commit-Beleg eines Fensterlaufs. Fehlt sie, ist der Deployment-Stand des Laufs
  //     nicht belegbar — frueher nur eine Warnung, jetzt fail closed `blockiert`.
  const bOhneDauerhaft = V.bewerteNachweisfenster(baueEingaben({ prozessLaeufe: [] }));
  check("30.13 Ohne dauerhafte Zeile: blockiert (fehlender Commit-Beleg), kein Warn-Gruen mehr",
    bOhneDauerhaft.ausgang === "blockiert" && hatBefund(bOhneDauerhaft, "commit-beleg-fehlt"),
    JSON.stringify(bOhneDauerhaft.befunde.slice(0, 2)));
}

// =============================================================================================
console.log("\n== 31 · REVIEW 2 · Punkt 1: der ECHTE Kostenleser ist strikt ==");
// =============================================================================================
{
  // Direkte Tests des Lesers selbst — nicht nur des bereits aggregierten Kostenblocks.
  const von = FENSTER.vonMs;
  const bis = FENSTER.bisMs;
  const imFenster = new Date(von + 3600000).toISOString();
  const lies = (llmUsage, extra = {}) => V.kostenAusNutzung({
    authStore: { llmUsage }, vonMs: von, bisMs: bis, rahmenUsd: 5, ...extra
  });

  check("31.1 Auth-Store nicht lesbar => unvollstaendig, KEINE 0-USD-Summe",
    (() => { const k = V.kostenAusNutzung({ authStore: null, vonMs: von, bisMs: bis, rahmenUsd: 5 });
      return k.vollstaendig === false && k.fensterUsd === null; })());
  check("31.2 llmUsage fehlt => unvollstaendig, KEINE 0-USD-Summe",
    (() => { const k = V.kostenAusNutzung({ authStore: {}, vonMs: von, bisMs: bis, rahmenUsd: 5 });
      return k.vollstaendig === false && k.fensterUsd === null && /llmUsage/.test(k.grund); })());

  // DER KERN VON REVIEW-2-PUNKT-1: rohe Nicht-Zahlen wurden bisher umgedeutet.
  const umdeutbar = [
    { createdAt: imFenster, estimatedCost: "1.20" },
    { createdAt: imFenster, estimatedCost: true },
    { createdAt: imFenster, estimatedCost: false },
    { createdAt: imFenster, estimatedCost: null },
    { createdAt: imFenster, estimatedCost: "" }
  ];
  const kUmdeutbar = lies(umdeutbar);
  check("31.3 \"1.20\"/true/false/null/\"\" sind UNBEPREIST, werden nicht zu Zahlen umgedeutet",
    kUmdeutbar.unbepreisteEintraege === 5 && kUmdeutbar.fensterUsd === 0,
    JSON.stringify(kUmdeutbar));
  check("31.4 Der Vertrag blockiert diesen Fall (Summe waere zu klein)",
    V.pruefeKosten(kUmdeutbar).some((b) => b.grund === "kosten-nicht-bepreisbar"));
  check("31.5 Gegenprobe: \"1.20\" wurde NICHT als 1.20 gezaehlt", kUmdeutbar.fensterUsd !== 1.2);

  const kEchte = lies([
    { createdAt: imFenster, estimatedCost: 0.5 },
    { createdAt: imFenster, estimatedCost: 0.25 }
  ]);
  check("31.6 Echte Zahlen werden summiert und gelten als vollstaendig",
    kEchte.fensterUsd === 0.75 && kEchte.vollstaendig === true && kEchte.unbepreisteEintraege === 0);
  check("31.7 NaN/Infinity/negativ im Rohwert sind unbepreist",
    (() => { const k = lies([
      { createdAt: imFenster, estimatedCost: NaN },
      { createdAt: imFenster, estimatedCost: Infinity },
      { createdAt: imFenster, estimatedCost: -1 }
    ]); return k.unbepreisteEintraege === 3 && k.fensterUsd === 0; })());

  // ZEITLICHE ZUORDENBARKEIT: fehlende/kaputte Zeitstempel duerfen keine Vollstaendigkeit.
  for (const [name, stempel] of [["fehlt", undefined], ["null", null], ["leer", "   "], ["unparsbar", "kein-datum"], ["Zahl", 12345]]) {
    const k = lies([{ createdAt: stempel, estimatedCost: 0.5 }, { createdAt: imFenster, estimatedCost: 0.5 }]);
    check(`31.8 createdAt ${name} => zeitlich nicht zuordenbar, vollstaendig=false`,
      k.vollstaendig === false && k.zeitlichNichtZuordenbar === 1 && /Zeitstempel/.test(k.grund || ""),
      JSON.stringify(k));
  }
  check("31.9 Der Vertrag blockiert einen zeitlich nicht zuordenbaren Bestand",
    V.pruefeKosten(lies([{ createdAt: null, estimatedCost: 0.5 }]))
      .some((b) => b.grund === "kostendaten-unvollstaendig"));

  // Fensterzuschnitt: nur Eintraege IM Fenster zaehlen.
  check("31.10 Eintraege ausserhalb des Fensters zaehlen nicht in die Summe",
    (() => { const k = lies([
      { createdAt: new Date(von - 3600000).toISOString(), estimatedCost: 99 },
      { createdAt: new Date(bis + 3600000).toISOString(), estimatedCost: 99 },
      { createdAt: imFenster, estimatedCost: 1 }
    ]); return k.fensterUsd === 1 && k.eintraegeImFenster === 1 && k.vollstaendig === true; })());
  check("31.11 Fenstergrenzen: Start zaehlt, Ende zaehlt NICHT (halboffen)",
    (() => { const k = lies([
      { createdAt: new Date(von).toISOString(), estimatedCost: 2 },
      { createdAt: new Date(bis).toISOString(), estimatedCost: 40 }
    ]); return k.fensterUsd === 2; })());

  // VERDRAENGUNG der Nutzungsliste.
  const vieleNachStart = Array.from({ length: 10 }, () => ({ createdAt: imFenster, estimatedCost: 0.1 }));
  const kVerdraengt = lies(vieleNachStart, { retention: 10 });
  check("31.12 Nutzungsliste an der Aufbewahrungsgrenze, aeltester Eintrag nach Fensterstart => unvollstaendig",
    kVerdraengt.vollstaendig === false && /Aufbewahrungsgrenze/.test(kVerdraengt.grund || ""),
    JSON.stringify(kVerdraengt));
  check("31.13 Dieselbe Liste mit einem Eintrag VOR dem Fensterstart ist vollstaendig",
    lies([{ createdAt: new Date(von - 1000).toISOString(), estimatedCost: 0 }, ...vieleNachStart], { retention: 11 })
      .vollstaendig === true);
  check("31.14 Leere, aber lesbare Nutzungsliste ist vollstaendig mit 0,00 USD (belegte Null)",
    (() => { const k = lies([]); return k.vollstaendig === true && k.fensterUsd === 0; })());

  // Das CLI benutzt GENAU diesen Leser — keine zweite, laxere Fassung mehr. Geprueft wird der
  // FUNKTIONSRUMPF ohne Kommentare (der Kommentar zitiert die alte Fassung absichtlich).
  const cliQuelle = fs.readFileSync(path.join(__dirname, "op25-production-nachweis.js"), "utf8");
  const rumpf = (cliQuelle.split("function kostenImFenster(")[1] || "").split("\n}")[0]
    .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");
  check("31.15 Der CLI-Kostenleser ist reine Weitergabe an den Kern — keine eigene Umdeutung, keine eigene Schleife",
    /vertrag\.kostenAusNutzung/.test(rumpf) && !/Number\(/.test(rumpf) && !/for\s*\(/.test(rumpf),
    JSON.stringify(rumpf.slice(0, 200)));
}

// =============================================================================================
console.log("\n== 32 · REVIEW 2 · Punkt 2: Startbaseline vollstaendig fail closed ==");
// =============================================================================================
{
  const vollstaendig = () => ({
    erhobenAtMs: BASELINE_ERHOBEN_MS,
    erhobenAt: new Date(BASELINE_ERHOBEN_MS).toISOString(),
    aktivierungAtMs: AKTIVIERUNG_MS,
    aktivierungAt: new Date(AKTIVIERUNG_MS).toISOString(),
    erwarteterDeploymentCommit: ERWARTETER_COMMIT,
    anzahl: 5,
    mandate: [...MANDATE],
    signatur: V.mandatsSignatur(MANDATE).signatur
  });
  const pruefe = (roh) => V.pruefeStartbaseline({
    roh, aktivierungAtMs: AKTIVIERUNG_MS, jetztMs: JETZT_MS
  });
  check("32.1 Vollstaendige, stimmige Baseline besteht",
    pruefe(vollstaendig()).befunde.length === 0 && pruefe(vollstaendig()).frozen.anzahl === 5);

  // JEDES Pflichtfeld einzeln: fehlend, null, leer, ungueltig.
  const pflichtfelder = [
    ["mandate", "startbaseline-mandate-fehlen"],
    ["anzahl", "startbaseline-anzahl-fehlt"],
    ["signatur", "startbaseline-signatur-fehlt"],
    ["aktivierungAtMs", "startbaseline-aktivierung-fehlt"],
    ["erhobenAtMs", "startbaseline-erhebung-fehlt"],
    ["erwarteterDeploymentCommit", "startbaseline-erwarteter-commit-fehlt"]
  ];
  for (const [feld, grund] of pflichtfelder) {
    // Die ISO-Zwillinge muessen mit weg, sonst greift der zulaessige Zweitweg.
    const ohne = vollstaendig();
    delete ohne[feld];
    if (feld === "aktivierungAtMs") delete ohne.aktivierungAt;
    if (feld === "erhobenAtMs") delete ohne.erhobenAt;
    const b1 = pruefe(ohne);
    const mitNull = vollstaendig();
    mitNull[feld] = null;
    if (feld === "aktivierungAtMs") mitNull.aktivierungAt = null;
    if (feld === "erhobenAtMs") mitNull.erhobenAt = null;
    const b2 = pruefe(mitNull);
    check(`32.2 Pflichtfeld '${feld}' fehlt => blockiert (${grund})`,
      b1.befunde.length === 1 && b1.befunde[0].schwere === "blockiert" && b1.befunde[0].grund === grund,
      JSON.stringify(b1.befunde));
    check(`32.3 Pflichtfeld '${feld}' ist null => blockiert (kein Number(null) => 0)`,
      b2.befunde.length === 1 && b2.befunde[0].schwere === "blockiert" && b2.befunde[0].grund === grund,
      JSON.stringify(b2.befunde));
  }
  check("32.4 Leere Mandatsliste => blockiert",
    pruefe({ ...vollstaendig(), mandate: [] }).befunde[0].grund === "startbaseline-mandate-fehlen");
  check("32.5 Mandatsliste mit Nicht-Zeichenketten/leeren Eintraegen => blockiert",
    pruefe({ ...vollstaendig(), mandate: ["a", "", "c"] }).befunde[0].grund === "startbaseline-mandate-ungueltig"
    && pruefe({ ...vollstaendig(), mandate: ["a", 7, "c"] }).befunde[0].grund === "startbaseline-mandate-ungueltig");
  check("32.6 Duplikate in der Mandatsliste => blockiert (Menge nicht eindeutig)",
    pruefe({ ...vollstaendig(), mandate: ["a", "a", "b"], anzahl: 3, signatur: V.mandatsSignatur(["a", "b"]).signatur })
      .befunde[0].grund === "startbaseline-mandate-ungueltig");
  check("32.7 anzahl widerspricht der Liste => blockiert",
    pruefe({ ...vollstaendig(), anzahl: 4 }).befunde[0].grund === "startbaseline-anzahl-widerspruch");
  check("32.8 Leere/ungueltige Signatur => blockiert",
    pruefe({ ...vollstaendig(), signatur: "   " }).befunde[0].grund === "startbaseline-signatur-fehlt"
    && pruefe({ ...vollstaendig(), signatur: 42 }).befunde[0].grund === "startbaseline-signatur-fehlt");
  check("32.9 Falsche Signatur => blockiert (nachtraeglich veraendert)",
    pruefe({ ...vollstaendig(), signatur: "m5-deadbeefdeadbeef" }).befunde[0].grund === "startbaseline-signatur-passt-nicht");
  check("32.10 Unparsbarer Aktivierungs-/Erhebungszeitpunkt => blockiert",
    pruefe({ ...vollstaendig(), aktivierungAtMs: "gestern", aktivierungAt: "gestern" }).befunde[0].grund === "startbaseline-aktivierung-fehlt"
    && pruefe({ ...vollstaendig(), erhobenAtMs: "irgendwann", erhobenAt: "irgendwann" }).befunde[0].grund === "startbaseline-erhebung-fehlt");
  check("32.11 ISO-Zwilling allein genuegt (aktivierungAt/erhobenAt ohne …Ms)",
    (() => { const b = vollstaendig(); delete b.aktivierungAtMs; delete b.erhobenAtMs;
      return pruefe(b).befunde.length === 0; })());
  check("32.12 Baseline zu einer FREMDEN Aktivierung => blockiert",
    pruefe({ ...vollstaendig(), aktivierungAtMs: AKTIVIERUNG_MS + 3600000, aktivierungAt: new Date(AKTIVIERUNG_MS + 3600000).toISOString() })
      .befunde[0].grund === "startbaseline-fremde-aktivierung");
  check("32.13 Bewertete Aktivierung unbekannt => blockiert (nicht stillschweigend akzeptiert)",
    V.pruefeStartbaseline({ roh: vollstaendig(), aktivierungAtMs: null, jetztMs: JETZT_MS })
      .befunde[0].grund === "startbaseline-fremde-aktivierung");
  check("32.14 Zu spaet erhobene Baseline => blockiert",
    pruefe({ ...vollstaendig(), erhobenAtMs: FENSTER.bisMs, erhobenAt: new Date(FENSTER.bisMs).toISOString() })
      .befunde[0].grund === "startbaseline-zu-spaet-erhoben");
  check("32.15 Nicht-Objekt/fehlende Baseline => blockiert",
    pruefe(null).befunde[0].grund === "startbaseline-fehlt"
    && pruefe("baseline").befunde[0].grund === "startbaseline-fehlt");

  // Die Gesamtbewertung reicht jeden dieser Befunde durch.
  for (const [feld, grund] of pflichtfelder) {
    const kaputt = vollstaendig();
    kaputt[feld] = null;
    if (feld === "aktivierungAtMs") kaputt.aktivierungAt = null;
    if (feld === "erhobenAtMs") kaputt.erhobenAt = null;
    const b = V.bewerteNachweisfenster(baueEingaben({ startbaseline: kaputt }));
    check(`32.16 Gesamtbewertung blockiert bei fehlendem '${feld}'`,
      b.ausgang === "blockiert" && hatBefund(b, grund), JSON.stringify(b.befunde.slice(0, 1)));
  }

  // CLI: kein Schreiben ohne gueltige Aktivierung, kein Number(null) beim Lesen,
  // deploymentCommit wird nicht mehr aus einer Laufkennung erfunden.
  const cliQuelle = fs.readFileSync(path.join(__dirname, "op25-production-nachweis.js"), "utf8");
  check("32.17 CLI verweigert --startbaseline-schreiben ohne gueltige --aktivierung",
    /--startbaseline-schreiben verlangt einen gueltigen/.test(cliQuelle)
    && /if \(!Number\.isFinite\(aktivierungAtMs\)\)/.test(cliQuelle));
  check("32.18 CLI liest die Belegdatei ROH (kein Number(null)-Fallback mehr)",
    !/Number\.isFinite\(Number\(roh\.aktivierungAtMs\)\)/.test(cliQuelle)
    && !/roh\.aktivierungAt \? Date\.parse/.test(cliQuelle));
  check("32.19 Commit-Beleg stammt aus commit_ref, nicht aus einer Laufkennung",
    /commit_ref/.test(cliQuelle) && !/deploymentCommit: commitZeile \? commitZeile\.runId : null/.test(cliQuelle));
}

// =============================================================================================
console.log("\n== 33 · REVIEW 3 · Punkt 1: die Baseline gilt NUR unmittelbar nach der Aktivierung ==");
// =============================================================================================
{
  const basis = () => ({
    erhobenAtMs: BASELINE_ERHOBEN_MS,
    erhobenAt: new Date(BASELINE_ERHOBEN_MS).toISOString(),
    aktivierungAtMs: AKTIVIERUNG_MS,
    aktivierungAt: new Date(AKTIVIERUNG_MS).toISOString(),
    erwarteterDeploymentCommit: ERWARTETER_COMMIT,
    anzahl: 5, mandate: [...MANDATE], signatur: V.mandatsSignatur(MANDATE).signatur
  });
  const pruefe = (roh, jetzt = JETZT_MS) => V.pruefeStartbaseline({
    roh, aktivierungAtMs: roh.aktivierungAtMs, jetztMs: jetzt
  });
  const mitErhebung = (ms) => ({ ...basis(), erhobenAtMs: ms, erhobenAt: new Date(ms).toISOString() });
  const mitAktivierung = (ms) => ({ ...basis(), aktivierungAtMs: ms, aktivierungAt: new Date(ms).toISOString() });

  check("33.1 Die dokumentierte Toleranz ist 15 min", V.BASELINE_TOLERANZ_MS === 15 * 60 * 1000);

  // FALL A — Baseline VOR der Aktivierung.
  check("33.2 Erhebung 1 ms vor der Aktivierung => blockiert (startbaseline-vor-aktivierung)",
    pruefe(mitErhebung(AKTIVIERUNG_MS - 1)).befunde[0].grund === "startbaseline-vor-aktivierung");
  check("33.3 Erhebung eine Stunde vor der Aktivierung => blockiert",
    pruefe(mitErhebung(AKTIVIERUNG_MS - 3600000)).befunde[0].grund === "startbaseline-vor-aktivierung");
  check("33.4 Erhebung GENAU zur Aktivierung ist zulaessig (untere Grenze inklusiv)",
    pruefe(mitErhebung(AKTIVIERUNG_MS)).befunde.length === 0);

  // FALL B — Aktivierung in der ZUKUNFT.
  const zukunft = JETZT_MS + 3600000;
  check("33.5 Aktivierung in der Zukunft => blockiert (startbaseline-aktivierung-in-zukunft)",
    (() => { const b = mitAktivierung(zukunft);
      b.erhobenAtMs = zukunft + 60000; b.erhobenAt = new Date(zukunft + 60000).toISOString();
      return pruefe(b).befunde[0].grund === "startbaseline-aktivierung-in-zukunft"; })());
  check("33.6 Gesamtbewertung: zukuenftige Aktivierung => blockiert VOR jeder Fensterpruefung",
    (() => { const b = V.bewerteNachweisfenster(baueEingaben({
      aktivierungAtMs: zukunft,
      startbaseline: baueStartbaseline(),
      fenster: { vonMs: zukunft, bisMs: zukunft + V.MIN_FENSTER_MS }
    }));
      return b.ausgang === "blockiert" && hatBefund(b, "aktivierung-in-zukunft"); })());

  // FALL C — zu spaete Erhebung.
  check("33.7 Erhebung genau an der Toleranzgrenze (+15 min) ist zulaessig",
    pruefe(mitErhebung(AKTIVIERUNG_MS + V.BASELINE_TOLERANZ_MS)).befunde.length === 0);
  check("33.8 Erhebung 1 ms nach der Toleranzgrenze => blockiert (zu spaet)",
    pruefe(mitErhebung(AKTIVIERUNG_MS + V.BASELINE_TOLERANZ_MS + 1)).befunde[0].grund === "startbaseline-zu-spaet-erhoben");
  check("33.9 Erhebung eine Stunde nach der Aktivierung => blockiert",
    pruefe(mitErhebung(AKTIVIERUNG_MS + 3600000)).befunde[0].grund === "startbaseline-zu-spaet-erhoben");
  check("33.10 Die Toleranz haengt an der AKTIVIERUNG, nicht am Fensterstart",
    // Fensterstart ist 12:00, Aktivierung 11:00. Eine Erhebung um 11:59 laege am Fensterstart
    // knapp davor — gegen die Aktivierung ist sie aber 59 min zu spaet.
    pruefe(mitErhebung(FENSTER.vonMs - 60000)).befunde[0].grund === "startbaseline-zu-spaet-erhoben");

  // Durchreichen in die Gesamtbewertung.
  for (const [name, roh, grund] of [
    ["vor der Aktivierung", mitErhebung(AKTIVIERUNG_MS - 60000), "startbaseline-vor-aktivierung"],
    ["zu spaet erhoben", mitErhebung(AKTIVIERUNG_MS + 3600000), "startbaseline-zu-spaet-erhoben"]
  ]) {
    const b = V.bewerteNachweisfenster(baueEingaben({ startbaseline: roh }));
    check(`33.11 Gesamtbewertung blockiert bei Baseline ${name}`,
      b.ausgang === "blockiert" && hatBefund(b, grund), JSON.stringify(b.befunde.slice(0, 1)));
  }

  // CLI-Schreibseite: Zukunft und zu spaet werden gar nicht erst geschrieben.
  const cliQuelle = fs.readFileSync(path.join(__dirname, "op25-production-nachweis.js"), "utf8");
  check("33.12 CLI verweigert das Schreiben bei zukuenftiger Aktivierung (aktivierungAtMs <= now)",
    /if \(aktivierungAtMs > jetztMs\) \{[\s\S]{0,400}?throw new Error/.test(cliQuelle));
  check("33.13 CLI verweigert das Schreiben ausserhalb der Toleranz",
    /jetztMs > aktivierungAtMs \+ vertrag\.BASELINE_TOLERANZ_MS/.test(cliQuelle));
}

// =============================================================================================
console.log("\n== 34 · NACHTRAGSKORREKTUR · Deploymentgebundene Baseline + verbindlicher Commitnachweis ==");
// =============================================================================================
{
  // VERHALTENSPRUEFUNGEN der Nachtragskorrektur (2026-08-04/5): der erwartete Merge-Commit
  // ist Pflichtinhalt der Startbaseline (volle SHA), wird beim Schreiben NICHT gegen alte
  // Prozesslaeufe geprueft und in der Auswertung gegen die `commit_ref`-Werte ALLER
  // Fensterlaeufe durchgesetzt. Quelltextsuchen stehen nur ergaenzend am Ende.
  const SHA = ERWARTETER_COMMIT;   // 40 Hexziffern
  const SHA2 = ANDERER_COMMIT;     // andere gueltige volle SHA

  // --- (A) Werkzeugfunktionen: VERHALTEN, nicht Quelltextsuche ----------------------------
  check("34.1 Grenzen: 7..40 Hexziffern, volle Laenge ist 40",
    V.COMMIT_MIN_LAENGE === 7 && V.COMMIT_MAX_LAENGE === 40 && V.COMMIT_VOLL_LAENGE === 40);
  check("34.2 normalisiereVollenCommit akzeptiert NUR die volle SHA",
    V.normalisiereVollenCommit(SHA) === SHA
    && V.normalisiereVollenCommit(` ${SHA.toUpperCase()} `) === SHA
    && [SHA.slice(0, 7), SHA.slice(0, 39), SHA + "a", SHA + "-UNSINN", "", null, undefined, 42, true, "g".repeat(40)]
      .every((v) => V.normalisiereVollenCommit(v) === null));
  check("34.3 normalisiereCommit bleibt strikt (Nicht-Hex, zu kurz, zu lang => null)",
    ["nichthex", "89427g5", "0x89427c5", SHA + "a", SHA.slice(0, 6), "", "   ", "89427c 5", "89427c5-"]
      .every((v) => V.normalisiereCommit(v) === null)
    && V.normalisiereCommit(SHA.slice(0, 7)) === SHA.slice(0, 7)
    && V.normalisiereCommit(` ${SHA.toUpperCase()}\n`) === SHA);
  check("34.4 istEchtesPraefix ist STRIKT (gleich lang ist kein Praefix)",
    V.istEchtesPraefix(SHA.slice(0, 7), SHA) === true
    && V.istEchtesPraefix(SHA, SHA) === false
    && V.istEchtesPraefix(SHA, SHA.slice(0, 7)) === false);

  const fl = (beobachtet, erwartet = SHA) => V.pruefeFensterlaufCommit(erwartet, beobachtet);
  check("34.5 Fensterlauf: identische volle SHA => bestaetigt (auch nach Normalisierung)",
    fl(SHA).ergebnis === "bestaetigt" && fl(` ${SHA.toUpperCase()} `).ergebnis === "bestaetigt");
  check("34.6 Fensterlauf: fehlender/ungueltiger commit_ref => fehlt (nie bestaetigt)",
    [null, undefined, "", "kaputt", SHA.slice(0, 6), SHA + "zz", SHA + "-VOELLIGER-UNSINN", 42, true]
      .every((v) => fl(v).ergebnis === "fehlt"));
  check("34.7 Fensterlauf: echtes Praefix => unvollstaendig (nie bestaetigt, nie abweichend)",
    Array.from({ length: 33 }, (_, i) => i + 7).every((n) => fl(SHA.slice(0, n)).ergebnis === "unvollstaendig"));
  check("34.8 Fensterlauf: gueltiger, anderer Commit => abweichend (voll und Kurzform)",
    fl(SHA2).ergebnis === "abweichend" && fl(SHA2.slice(0, 12)).ergebnis === "abweichend");
  check("34.9 Fensterlauf: Unterschied an JEDER Position wird erkannt (40 Varianten)",
    Array.from({ length: 40 }, (_, i) => {
      const anders = SHA.slice(0, i) + (SHA[i] === "a" ? "b" : "a") + SHA.slice(i + 1);
      return fl(anders).ergebnis === "abweichend";
    }).every(Boolean));
  check("34.10 Fensterlauf: erwarteter Commit fehlt/ungueltig/verkuerzt => fehlt (kein Raten)",
    fl(SHA, null).ergebnis === "fehlt" && fl(SHA, SHA.slice(0, 7)).ergebnis === "fehlt"
    && fl(SHA, SHA + "a").ergebnis === "fehlt");

  // --- (B) Baseline: fehlender / ungueltiger / verkuerzter Commit (Familien 1+2) ----------
  const pruefeB = (roh, extra = {}) => V.pruefeStartbaseline({
    roh, aktivierungAtMs: AKTIVIERUNG_MS, jetztMs: JETZT_MS, ...extra
  });
  check("34.11 Baseline OHNE erwarteten Commit => blockiert (fehlt), auch in der Gesamtbewertung",
    (() => {
      const ohne = baueStartbaseline();
      delete ohne.erwarteterDeploymentCommit;
      const direkt = pruefeB(ohne);
      const gesamt = V.bewerteNachweisfenster(baueEingaben({ startbaseline: ohne }));
      return direkt.befunde[0].grund === "startbaseline-erwarteter-commit-fehlt"
        && direkt.erwarteterCommit === null
        && gesamt.ausgang === "blockiert" && hatBefund(gesamt, "startbaseline-erwarteter-commit-fehlt");
    })());
  check("34.12 VERKUERZTER erwarteter Commit (7/12/39 Zeichen) => blockiert (ungueltig)",
    [SHA.slice(0, 7), SHA.slice(0, 12), SHA.slice(0, 39)].every((kurz) =>
      pruefeB(baueStartbaseline(MANDATE, { erwarteterDeploymentCommit: kurz }))
        .befunde[0].grund === "startbaseline-erwarteter-commit-ungueltig"));
  check("34.13 UNGUELTIGER erwarteter Commit (Nicht-Hex, 41, Anhang, Nicht-Zeichenkette) => blockiert",
    ["nichthex".repeat(5), SHA + "a", SHA + "-VOELLIGER-UNSINN", SHA + SHA, 42, true, {}]
      .every((v) => pruefeB(baueStartbaseline(MANDATE, { erwarteterDeploymentCommit: v }))
        .befunde[0].grund === "startbaseline-erwarteter-commit-ungueltig"));
  check("34.14 Grossschreibung + Randleerzeichen der vollen SHA bestehen (derselbe Commit)",
    (() => {
      const b = pruefeB(baueStartbaseline(MANDATE, { erwarteterDeploymentCommit: `  ${SHA.toUpperCase()}\n` }));
      return b.befunde.length === 0 && b.erwarteterCommit === SHA;
    })());
  check("34.15 Vorab-Bestaetigung (deploymentCommitBestaetigt) wird fail closed abgewiesen",
    pruefeB(baueStartbaseline(MANDATE, { deploymentCommitBestaetigt: true }))
      .befunde[0].grund === "startbaseline-commit-vorab-bestaetigt"
    && pruefeB(baueStartbaseline(MANDATE, { deploymentCommitBestaetigt: "true" }))
      .befunde[0].grund === "startbaseline-commit-vorab-bestaetigt");
  check("34.16 Gegenprobe: passend (voll/Kurzform) besteht, abweichend/ungueltig blockiert",
    (() => {
      const ok1 = pruefeB(baueStartbaseline(), { commitGegenprobe: SHA });
      const ok2 = pruefeB(baueStartbaseline(), { commitGegenprobe: SHA.slice(0, 8).toUpperCase() });
      const falsch = pruefeB(baueStartbaseline(), { commitGegenprobe: SHA2 });
      const kaputt = pruefeB(baueStartbaseline(), { commitGegenprobe: "nicht-hex" });
      return ok1.befunde.length === 0 && ok1.erwarteterCommit === SHA
        && ok2.befunde.length === 0
        && falsch.befunde[0].grund === "startbaseline-fremder-commit"
        && kaputt.befunde[0].grund === "startbaseline-fremder-commit";
    })());
  check("34.17 Gesamtbewertung: abweichende Gegenprobe => blockiert (falsche Belegdatei)",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({ commitGegenprobe: SHA2 }));
      return b.ausgang === "blockiert" && hatBefund(b, "startbaseline-fremder-commit");
    })());

  // --- (C) Fensterlaeufe in der Gesamtbewertung (Familien 3-7) ----------------------------
  check("34.18 Korrekter Commit in ALLEN Fensterlaeufen => bestanden, erwarteterCommit ausgewiesen",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben());
      return b.ausgang === "bestanden" && b.erwarteterCommit === SHA;
    })());
  check("34.19 FEHLENDER commit_ref in EINEM Fensterlauf => blockiert (commit-beleg-fehlt)",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [baueProzessZeile(SLOTS[0]), baueProzessZeile(SLOTS[1], { commit: null }), baueProzessZeile(SLOTS[2])]
      }));
      return b.ausgang === "blockiert"
        && b.befunde.some((x) => x.grund === "commit-beleg-fehlt" && x.detail.includes("20260810200002"));
    })());
  check("34.20 UNGUELTIGER commit_ref (kein SHA-Wert) => blockiert, nie bestaetigt",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [baueProzessZeile(SLOTS[0], { commit: "deploy-123" }), baueProzessZeile(SLOTS[1]), baueProzessZeile(SLOTS[2])]
      }));
      return b.ausgang === "blockiert" && hatBefund(b, "commit-beleg-fehlt");
    })());
  check("34.21 ABWEICHENDER commit_ref in EINEM Fensterlauf => nicht_bestanden (fremder-deployment-commit)",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [baueProzessZeile(SLOTS[0]), baueProzessZeile(SLOTS[1], { commit: SHA2 }), baueProzessZeile(SLOTS[2])]
      }));
      return b.ausgang === "nicht_bestanden"
        && b.befunde.filter((x) => x.grund === "fremder-deployment-commit").length === 1
        && b.befunde.some((x) => x.grund === "fremder-deployment-commit" && x.detail.includes("20260810200002"));
    })());
  check("34.22 GEMISCHTE Commits im Fenster => nicht_bestanden (Verletzung schlaegt Belegluecke)",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [baueProzessZeile(SLOTS[0]), baueProzessZeile(SLOTS[1], { commit: SHA2 }), baueProzessZeile(SLOTS[2], { commit: null })]
      }));
      return b.ausgang === "nicht_bestanden"
        && hatBefund(b, "fremder-deployment-commit") && hatBefund(b, "commit-beleg-fehlt");
    })());
  check("34.23 commit_ref als ECHTES Praefix => blockiert (unvollstaendig), NICHT abweichend",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [baueProzessZeile(SLOTS[0], { commit: SHA.slice(0, 8) }), baueProzessZeile(SLOTS[1]), baueProzessZeile(SLOTS[2])]
      }));
      return b.ausgang === "blockiert" && hatBefund(b, "commit-beleg-unvollstaendig")
        && !hatBefund(b, "fremder-deployment-commit");
    })());
  // Familie 3: ein ALTER Prozesslauf vor der Aktivierung darf weder blockieren noch bestaetigen.
  check("34.24 ALTER Prozesslauf VOR der Aktivierung (fremder Commit) blockiert nicht und bestaetigt nicht",
    (() => {
      const alt = {
        runId: "cron-pipeline-20260808160002-altpf-global", process: "globalphase",
        status: "success", durationMs: 190000, createdAt: "2026-08-08T16:03:30.000Z",
        commit: SHA2, quelle: "relational"
      };
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [...SLOTS.map((s) => baueProzessZeile(s)), alt]
      }));
      return b.ausgang === "bestanden"
        && !hatBefund(b, "fremder-deployment-commit") && !hatBefund(b, "commit-beleg-fehlt");
    })());
  check("34.25 Alter Lauf OHNE commit_ref vor der Aktivierung blockiert ebenfalls nicht",
    (() => {
      const alt = {
        runId: "cron-crawl-20260808040002-altpf-global", process: "globalphase",
        status: "success", durationMs: 190000, createdAt: "2026-08-08T04:03:30.000Z",
        commit: null, quelle: "blob"
      };
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [...SLOTS.map((s) => baueProzessZeile(s)), alt]
      }));
      return b.ausgang === "bestanden";
    })());
  check("34.26 AUSSERPLANMAESSIGER globalphase-Lauf IM Fenster mit fremdem Commit => nicht_bestanden",
    (() => {
      const extra = {
        runId: "cron-crawl-20260810120002-xtra1-global", process: "globalphase",
        status: "success", durationMs: 190000, createdAt: "2026-08-10T12:03:30.000Z",
        commit: SHA2, quelle: "relational"
      };
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [...SLOTS.map((s) => baueProzessZeile(s)), extra]
      }));
      return b.ausgang === "nicht_bestanden" && hatBefund(b, "fremder-deployment-commit");
    })());
  // Familie 8: die 15-Minuten-Grenze der Baseline-Erhebung bleibt unveraendert streng (§33).
  check("34.27 Die 15-Minuten-Grenze bleibt verbindlich (Toleranz unveraendert, 1 ms drueber blockiert)",
    V.BASELINE_TOLERANZ_MS === 15 * 60 * 1000
    && pruefeB(baueStartbaseline(MANDATE, {
      erhobenAtMs: AKTIVIERUNG_MS + V.BASELINE_TOLERANZ_MS + 1,
      erhobenAt: new Date(AKTIVIERUNG_MS + V.BASELINE_TOLERANZ_MS + 1).toISOString()
    })).befunde[0].grund === "startbaseline-zu-spaet-erhoben");

  // --- (D) Ergaenzend (NICHT der einzige Beleg): Quelltextzusagen des CLI -----------------
  const cliQuelle = fs.readFileSync(path.join(__dirname, "op25-production-nachweis.js"), "utf8");
  check("34.28 Schreibseite verlangt den VOLLEN erwarteten Commit (doppeltes Gate: CLI + Funktion)",
    /normalisiereVollenCommit\(args\["erwarteter-commit"\]\) === null/.test(cliQuelle)
    && /normalisiereVollenCommit\(erwarteterCommit\)/.test(cliQuelle));
  check("34.29 Beim Schreiben KEIN Abgleich mit dem juengsten alten Prozesslauf (Gate entfernt)",
    !/pruefeErwartetenCommit/.test(cliQuelle)
    && !/pruefeCommitBeleg/.test(cliQuelle)
    && !/commitPruefung\.uebergeben/.test(cliQuelle));
  check("34.30 Keine Vorab-Bestaetigung mehr: `deploymentCommitBestaetigt` existiert im CLI nicht",
    !/deploymentCommitBestaetigt/.test(cliQuelle)
    && /erwarteterDeploymentCommit: vollerCommit/.test(cliQuelle));
  check("34.31 Auswertung reicht --erwarteter-commit als Gegenprobe an den Kern durch",
    /commitGegenprobe: args\["erwarteter-commit"\]/.test(cliQuelle));
  check("34.32 Der beobachtete Wert bleibt ehrlich benannt (kein Deployment-Beleg, kein deploymentCommit-Feld)",
    /zuletztBeobachteterProzessCommit/.test(cliQuelle)
    && /leseZuletztBeobachtetenProzessCommit/.test(cliQuelle)
    && /hinweisProzessCommit/.test(cliQuelle)
    && /kein Deployment-Beleg/.test(cliQuelle)
    && !/deploymentCommit:/.test(cliQuelle));
}

// =============================================================================================
console.log("\n== 35 · REVIEW PR #223 · Exakte runId-Bindung der dauerhaften Zeile ==");
// =============================================================================================
{
  // BEFUND: der Slot-Sucher fuer die dauerhafte Zeile verlangte nur denselben Cronnamen und
  // die 15-min-Toleranz — NICHT die exakte runId des vorhandenen globalen Laufs. scheduler.js
  // schreibt Blob-Lauf und globalphase-Zeile aber mit DERSELBEN laufId; wenn der globale
  // Lauf vorhanden ist, darf ausschliesslich die Zeile mit exakt identischer runId seinen
  // Status, seine Dauer und seinen Commit belegen. Eine ANDERE Zeile desselben Termins darf
  // den fehlenden Beleg niemals ersetzen.
  const ersatzZeile = (commit) => ({
    // 4 min 53 s nach dem crawl@20:00-Slot, ANDERE Kennung als der echte Lauf (…200002-bbbbb):
    runId: "cron-crawl-20260810200455-fremd-global",
    process: "globalphase", status: "success", durationMs: VERSIEGELT_DAUER_MS,
    createdAt: "2026-08-10T20:08:00.000Z", commit, quelle: "relational"
  });
  check("35.1 TAEUSCHUNG: Ersatzzeile (andere runId, korrekter Commit) ersetzt den fehlenden exakten Beleg NICHT => blockiert (commit-beleg-fehlt)",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [baueProzessZeile(SLOTS[0]), ersatzZeile(ERWARTETER_COMMIT), baueProzessZeile(SLOTS[2])]
      }));
      return b.ausgang === "blockiert"
        && b.befunde.some((x) => x.grund === "commit-beleg-fehlt" && x.detail.includes("crawl@2026-08-10T20:00:00.000Z"));
    })());
  check("35.2 Ersatzzeile mit FREMDEM Commit verdeckt den fehlenden Beleg nicht: commit-beleg-fehlt UND fremder-deployment-commit, Vorrang nicht_bestanden",
    (() => {
      const b = V.bewerteNachweisfenster(baueEingaben({
        prozessLaeufe: [baueProzessZeile(SLOTS[0]), ersatzZeile(ANDERER_COMMIT), baueProzessZeile(SLOTS[2])]
      }));
      return b.ausgang === "nicht_bestanden"
        && hatBefund(b, "commit-beleg-fehlt") && hatBefund(b, "fremder-deployment-commit");
    })());
  check("35.3 Exakt identische runId mit korrektem Commit besteht unveraendert",
    V.bewerteNachweisfenster(baueEingaben()).ausgang === "bestanden");
  check("35.4 Retentionsfall OHNE globalen Blob-Lauf: slotbezogene Zeile (auch mit anderem Zeitstempel/Kuerzel) klassifiziert weiterhin ehrlich als verdraengt",
    (() => {
      const ohneMittleren = baueLaeufe().filter((r) => !r.runId.includes("20260810200002"));
      // Der Blob-Lauf ist verdraengt — seine exakte Kennung ist damit unbekannt. Die
      // dauerhafte Zeile des Termins traegt hier bewusst eine ANDERE Sekunden-/Kuerzel-
      // Kennung; die Slot-Zuordnung bleibt fuer diese ehrliche Klassifikation zulaessig.
      const zeileAnderesKuerzel = { ...baueProzessZeile(SLOTS[1]), runId: "cron-crawl-20260810200019-real1-global" };
      const b = V.bewerteNachweisfenster(baueEingaben({
        laeufe: ohneMittleren,
        prozessLaeufe: [baueProzessZeile(SLOTS[0]), zeileAnderesKuerzel, baueProzessZeile(SLOTS[2])]
      }));
      return b.ausgang === "blockiert" && hatBefund(b, "laufbeleg-verdraengt");
    })());
}

// =============================================================================================
console.log("\n== 36 · CLI-Schreibpfad: VERHALTEN der Pflicht-Gates (ohne Netz, ohne Production) ==");
// =============================================================================================
{
  // Die Pflicht-Gates des Schreibpfads liegen VOR jedem Production-Lesezugriff und sind
  // damit ohne Netz verhaltenstestbar. Die Zugangsdaten werden hier AUSDRUECKLICH entfernt:
  // kein Test beruehrt Production; ein Aufruf, der die Gates passiert, scheitert danach
  // ehrlich am fehlenden Zugang (Exit 2, keine Datei).
  const { execFileSync } = require("child_process");
  const os = require("os");
  const CLI = path.join(__dirname, "op25-production-nachweis.js");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "op25-cli-gate-"));
  const umgebung = { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
  delete umgebung.HELMUT_OP25_AKTIVIERUNG_AT;
  const lauf = (argv) => {
    try {
      const stdout = execFileSync(process.execPath, [CLI, ...argv], { env: umgebung, stdio: "pipe", timeout: 30000 });
      return { code: 0, out: String(stdout), err: "" };
    } catch (f) {
      return { code: f.status, out: String(f.stdout || ""), err: String(f.stderr || "") };
    }
  };
  const aktIso = new Date(JETZT_MS).toISOString(); // fester Zeitpunkt — die Gates feuern vor jeder Zeitfensterpruefung
  const datei = (name) => path.join(tmp, name);

  const ohneCommit = lauf(["--aktivierung", aktIso, "--startbaseline-schreiben", datei("a.json")]);
  check("36.1 Schreiben OHNE --erwarteter-commit => Exit 2 am Arg-Gate (vor jedem Zugriff), keine Datei",
    ohneCommit.code === 2 && /VOLLSTAENDIGEN erwarteten Merge-Commit/.test(ohneCommit.err)
    && /Kurzformen genuegen nicht/.test(ohneCommit.err)
    && !fs.existsSync(datei("a.json")) && !/SUPABASE_URL/.test(ohneCommit.err),
    JSON.stringify({ code: ohneCommit.code, err: ohneCommit.err.slice(0, 160) }));
  const kurz = lauf(["--aktivierung", aktIso, "--erwarteter-commit", ERWARTETER_COMMIT.slice(0, 7), "--startbaseline-schreiben", datei("b.json")]);
  check("36.2 Kurzform (7 Zeichen) => Exit 2, keine Datei",
    kurz.code === 2 && /Kurzformen genuegen nicht/.test(kurz.err) && !fs.existsSync(datei("b.json")));
  const anhang = lauf(["--aktivierung", aktIso, "--erwarteter-commit", `${ERWARTETER_COMMIT}-VOELLIGER-UNSINN`, "--startbaseline-schreiben", datei("c.json")]);
  check("36.3 Volle SHA mit angehaengtem Unsinn => Exit 2, keine Datei",
    anhang.code === 2 && /VOLLSTAENDIGEN/.test(anhang.err) && !fs.existsSync(datei("c.json")));
  const ohneAkt = lauf(["--erwarteter-commit", ERWARTETER_COMMIT, "--startbaseline-schreiben", datei("d.json")]);
  check("36.4 Ohne --aktivierung => Exit 2 mit READY-Gate-Meldung, keine Datei",
    ohneAkt.code === 2 && /READY-Zeitpunkt des neuen Production-Deployments/.test(ohneAkt.err)
    && !fs.existsSync(datei("d.json")),
    JSON.stringify({ code: ohneAkt.code, err: ohneAkt.err.slice(0, 160) }));
  const gueltig = lauf(["--aktivierung", aktIso, "--erwarteter-commit", ERWARTETER_COMMIT, "--startbaseline-schreiben", datei("e.json")]);
  check("36.5 Gueltige Pflichtargumente passieren die Gates und scheitern DANACH ehrlich am fehlenden Zugang (Exit 2, keine Datei)",
    gueltig.code === 2 && /SUPABASE_URL/.test(gueltig.err) && !fs.existsSync(datei("e.json")),
    JSON.stringify({ code: gueltig.code, err: gueltig.err.slice(0, 160) }));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// =============================================================================================
console.log("\n== 37 · Fenster-Sweep: Zuordenbarkeit fail closed + kanonische Belegquelle ==");
// =============================================================================================
{
  // (a) Eine zeitlich NICHT platzierbare globalphase-Zeile (weder Laufkennung noch createdAt
  //     lesbar) kann weder dem Fenster zugeordnet noch als Alt-Bestand ausgeschlossen werden.
  //     Sie darf die Commitpruefung nicht still umgehen (frueher: nur Warnung => Fail-open).
  const unplatzierbar = (commit) => ({
    runId: "manual-globalphase", process: "globalphase", status: "success",
    durationMs: VERSIEGELT_DAUER_MS, createdAt: null, commit, quelle: "blob"
  });
  const b1 = V.bewerteNachweisfenster(baueEingaben({
    prozessLaeufe: [...SLOTS.map((s) => baueProzessZeile(s)), unplatzierbar(ANDERER_COMMIT)]
  }));
  check("37.1 Unplatzierbare Zeile mit FREMDEM Commit => blockiert (prozesszeile-nicht-zuordenbar), nie bestanden",
    b1.ausgang === "blockiert" && hatBefund(b1, "prozesszeile-nicht-zuordenbar"),
    JSON.stringify(b1.befunde.slice(0, 2)));
  const b2 = V.bewerteNachweisfenster(baueEingaben({
    prozessLaeufe: [...SLOTS.map((s) => baueProzessZeile(s)), unplatzierbar(null)]
  }));
  check("37.2 Unplatzierbare Zeile OHNE Commit => ebenfalls blockiert",
    b2.ausgang === "blockiert" && hatBefund(b2, "prozesszeile-nicht-zuordenbar"));

  // (b) createdAt-Rueckfallebene festgenagelt: unparsbare Kennung, aber createdAt IM Fenster.
  const b3 = V.bewerteNachweisfenster(baueEingaben({
    prozessLaeufe: [...SLOTS.map((s) => baueProzessZeile(s)), {
      runId: "understanding-recovery-global", process: "globalphase", status: "success",
      durationMs: VERSIEGELT_DAUER_MS, createdAt: "2026-08-10T18:00:00.000Z",
      commit: ANDERER_COMMIT, quelle: "blob"
    }]
  }));
  check("37.3 Unparsbare Kennung, createdAt IM Fenster, fremder Commit => nicht_bestanden (createdAt-Rueckfallebene wirkt)",
    b3.ausgang === "nicht_bestanden" && hatBefund(b3, "fremder-deployment-commit"),
    JSON.stringify(b3.befunde.slice(0, 2)));

  // (c) Slot-Zuordnungsklausel festgenagelt: Lauf 14 min VOR dem Fensterstart (Jitter),
  //     dem ersten erwarteten Termin zugeordnet — er gehoert zum Nachweis.
  const b4 = V.bewerteNachweisfenster(baueEingaben({
    fenster: { vonMs: Date.parse("2026-08-10T16:00:00Z"), bisMs: Date.parse("2026-08-11T16:30:00Z") },
    prozessLaeufe: [...SLOTS.map((s) => baueProzessZeile(s)), {
      runId: "cron-pipeline-20260810154600-jitr1-global", process: "globalphase", status: "success",
      durationMs: VERSIEGELT_DAUER_MS, createdAt: "2026-08-10T15:49:00.000Z",
      commit: ANDERER_COMMIT, quelle: "relational"
    }]
  }));
  check("37.4 Slot-zugeordneter Lauf knapp VOR Fensterstart mit fremdem Commit => fremder-deployment-commit (Slot-Klausel wirkt)",
    b4.ausgang === "nicht_bestanden" && hatBefund(b4, "fremder-deployment-commit"),
    JSON.stringify(b4.befunde.slice(0, 2)));

  // (d) Kanonische Belegquelle: ein Lesefehler der relationalen process_runs ist eine
  //     Beleg-Luecke und darf nie in einem stillen `bestanden` untergehen.
  const b5 = V.bewerteNachweisfenster(baueEingaben({ prozessLaeufeLesefehler: "HTTP 500: kaputt" }));
  check("37.5 Lesefehler der relationalen process_runs => blockiert (prozesszeilen-quelle-nicht-lesbar)",
    b5.ausgang === "blockiert" && hatBefund(b5, "prozesszeilen-quelle-nicht-lesbar"),
    JSON.stringify(b5.befunde.slice(0, 2)));
  const b6 = V.bewerteNachweisfenster(baueEingaben({
    prozessLaeufeLesefehler: "HTTP 500: kaputt",
    kosten: baueKosten({ fensterUsd: 9.5 })
  }));
  check("37.6 Vorrang bleibt: Lesefehler + BEWIESENE Verletzung => nicht_bestanden (kein frueher Abbruch)",
    b6.ausgang === "nicht_bestanden" && hatBefund(b6, "prozesszeilen-quelle-nicht-lesbar")
    && hatBefund(b6, "llm-kosten-ueber-rahmen"));
}

// =============================================================================================
console.log("\n== 38 · K1: Bindung AUSSCHLIESSLICH ueber globalLaufId — fail closed ==");
// =============================================================================================
{
  // (a) Die ALTE Konvention (runId == Laufkennung, kein globalLaufId) bindet NICHT mehr:
  //     genau sie hielt den Falschbefund `mandatslauf-fehlt` des Nachweises 2026-08-05 gruen.
  const alteKonvention = baueLaeufe().map((r) => (r.mode === "mandat"
    ? { ...r, runId: r.globalLaufId.replace(/-global$/, ""), globalLaufId: undefined }
    : r));
  const b1 = V.bewerteNachweisfenster(baueEingaben({ laeufe: alteKonvention }));
  check("38.1 Alte runId-Konvention OHNE globalLaufId => mandatslauf-fehlt UND mandatslauf-ohne-bindung",
    b1.ausgang === "nicht_bestanden" && hatBefund(b1, "mandatslauf-fehlt") && hatBefund(b1, "mandatslauf-ohne-bindung"),
    JSON.stringify(b1.befunde.slice(0, 3)));
  // (b) MEHRDEUTIGKEIT: zwei Datensaetze desselben Mandats am selben globalen Lauf.
  const laeufeDoppelt = baueLaeufe();
  const erster = laeufeDoppelt.find((r) => r.mode === "mandat");
  laeufeDoppelt.push({ ...erster, runId: `${erster.runId}-doppel` });
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufeDoppelt }));
  check("38.2 Doppelte Bindung desselben Mandats => blockiert (mandatslauf-mehrdeutig)",
    hatBefund(b2, "mandatslauf-mehrdeutig"), JSON.stringify(b2.befunde.slice(0, 3)));
  // (c) FREMDES globalLaufId: der Datensatz gehoert zu einem anderen Lauf => er fehlt hier.
  const fremdeBindung = baueLaeufe().map((r) => (r.mode === "mandat" && r.politicianId === "mandat-a"
    ? { ...r, globalLaufId: "cron-pipeline-20260701160000-fremd-global" }
    : r));
  const b3 = V.bewerteNachweisfenster(baueEingaben({ laeufe: fremdeBindung }));
  check("38.3 Fremdes globalLaufId => Mandat gilt als fehlend (keine unscharfe zeitliche Zuordnung)",
    b3.ausgang === "nicht_bestanden" && hatBefund(b3, "mandatslauf-fehlt"),
    JSON.stringify(b3.befunde.slice(0, 3)));
  // (d) Die EIGENE runId der Projektion ist irrelevant fuer die Bindung (nur globalLaufId zaehlt).
  const andereRunIds = baueLaeufe().map((r) => (r.mode === "mandat"
    ? { ...r, runId: `projektion-voellig-anders-${Math.abs(r.politicianId.length)}-${r.politicianId}` }
    : r));
  const b4 = V.bewerteNachweisfenster(baueEingaben({ laeufe: andereRunIds }));
  check("38.4 Beliebige eigene runId mit korrektem globalLaufId bindet weiterhin (bestanden)",
    b4.ausgang === "bestanden", JSON.stringify(b4.befunde.slice(0, 3)));
}

// =============================================================================================
console.log("\n== 39 · K2: EINE Mandatswahrheit — Widerspruch blockiert, Blob verkleinert nie ==");
// =============================================================================================
{
  const SECHS = [...MANDATE, "mandat-f"];
  // (a) Der REALE Widerspruch des gescheiterten Nachweises: relational 6, Blob 5.
  const w1 = V.pruefeMandatsWahrheit({ kanonisch: SECHS, blob: MANDATE });
  check("39.1 Relational 6 vs. Blob 5 => blockiert (mandatswahrheiten-widerspruechlich)",
    w1.befunde.some((b) => b.grund === "mandatswahrheiten-widerspruechlich" && b.schwere === "blockiert"),
    JSON.stringify(w1.befunde));
  check("39.2 Kanonische Menge nicht lesbar => blockiert, KEIN Rueckfall auf den Blob",
    V.pruefeMandatsWahrheit({ kanonisch: null, blob: MANDATE }).befunde
      .some((b) => b.grund === "mandatswahrheit-nicht-lesbar"));
  check("39.3 Laufzeitplanung widerspricht der kanonischen Menge => blockiert",
    V.pruefeMandatsWahrheit({ kanonisch: SECHS, laufzeitPlanung: MANDATE, laufzeitLaufId: "cron-crawl-x" })
      .befunde.some((b) => b.grund === "laufzeitplanung-widerspricht-mandatswahrheit"));
  const w4 = V.pruefeMandatsWahrheit({ kanonisch: SECHS, blob: [...SECHS], laufzeitPlanung: [...SECHS] });
  check("39.4 Widerspruchsfreie Sichten => keine Befunde, Signatur der kanonischen Menge",
    w4.befunde.length === 0 && w4.signatur && w4.signatur.anzahl === 6);
  // (b) In der GESAMTBEWERTUNG: der Blob kann die Menge nicht mehr auf fuenf verkleinern —
  //     bewertet wird die kanonische 6er-Menge; sein Widerspruch wird BENANNT (blockiert).
  const bWiderspruch = V.bewerteNachweisfenster(baueEingaben({
    startbaseline: baueStartbaseline(SECHS),
    laeufe: baueLaeufe({ mandate: SECHS }),
    aktiveMandate: [...SECHS],
    erwarteteMandatszahl: 6,
    laufRetention: 60,
    mandatsWahrheit: { kanonisch: SECHS, blob: MANDATE, laufzeitPlanung: [...SECHS], laufzeitLaufId: null }
  }));
  check("39.5 Gesamtbewertung: 6er-Menge bleibt massgeblich (Signatur n=6), Blob-Widerspruch blockiert benannt",
    bWiderspruch.ausgang === "blockiert" && hatBefund(bWiderspruch, "mandatswahrheiten-widerspruechlich")
    && bWiderspruch.mandatsmenge && bWiderspruch.mandatsmenge.anzahl === 6,
    JSON.stringify({ ausgang: bWiderspruch.ausgang, menge: bWiderspruch.mandatsmenge && bWiderspruch.mandatsmenge.anzahl }));
  const bKonsistent = V.bewerteNachweisfenster(baueEingaben({
    mandatsWahrheit: { kanonisch: [...MANDATE], blob: [...MANDATE], laufzeitPlanung: [...MANDATE], laufzeitLaufId: null }
  }));
  check("39.6 Widerspruchsfreie Sichten in der Gesamtbewertung => bestanden",
    bKonsistent.ausgang === "bestanden", JSON.stringify(bKonsistent.befunde.slice(0, 2)));
  // (c) Ergaenzende Quelltextpruefung (Verhalten ist oben belegt): das CLI liest die
  //     kanonische Menge relational und faellt fuer sie NIE auf den Blob zurueck.
  const cliQuelle = fs.readFileSync(path.join(__dirname, "op25-production-nachweis.js"), "utf8");
  check("39.7 CLI: kanonische Menge aus leseAktiveMandateRelational, kein Blob-Fallback",
    /const aktiveMandate = relational\.aktive;/.test(cliQuelle)
    && /listActiveTenantIds/.test(cliQuelle)
    && /relationalesProfilLebenszyklus/.test(cliQuelle));
  check("39.8 CLI verdrahtet die Wahrheitspruefung: Start-Gate UND Auswertung erhalten mandatsWahrheit",
    /vertrag\.pruefeMandatsWahrheit\(mandatsWahrheit\)/.test(cliQuelle)
    && /watchdogCrons: leseWatchdogCrons\(\),\s*\n\s*mandatsWahrheit/.test(cliQuelle));
}

// =============================================================================================
console.log("\n== 40 · K3: Aufbewahrungs-Grenztests — exakt, -1, +Mandat, +Watchdog ==");
// =============================================================================================
{
  check("40.1 Bedarfsformel: (3 Regel + 1 Watchdog) x (1+5) + Puffer 6 = 30",
    V.aufbewahrungsBedarf({ regelSlots: 3, watchdogSlots: 1, mandatszahl: 5 }).mindest === 30);
  const bExakt = V.bewerteNachweisfenster(baueEingaben({ laufRetention: 30 }));
  check("40.2 GENAU ausreichend (30) => kein Aufbewahrungs-Blocker (Warnung 'knapp' erlaubt)",
    bExakt.ausgang === "bestanden" && !hatBefund(bExakt, "aufbewahrung-reicht-nicht"),
    JSON.stringify(bExakt.befunde.slice(0, 2)));
  const bZuKlein = V.bewerteNachweisfenster(baueEingaben({ laufRetention: 29 }));
  const meldung = bZuKlein.befunde.find((b) => b.grund === "aufbewahrung-reicht-nicht");
  check("40.3 EIN Datensatz zu wenig (29) => harte Blockade", bZuKlein.ausgang === "blockiert" && Boolean(meldung));
  check("40.4 Die Meldung nennt Ist, Mindest, Mandatszahl, Laufslots UND Betreiberaktion",
    meldung && /Ist 29/.test(meldung.detail) && /Mindestbedarf 30/.test(meldung.detail)
    && /5 Mandate/.test(meldung.detail) && /3 Regel-Slots/.test(meldung.detail)
    && /1 Watchdog-Slots/.test(meldung.detail) && /HELMUT_CRAWL_RUN_RETENTION auf >= 30/.test(meldung.detail),
    meldung && meldung.detail);
  // Zusaetzliches Mandat: n=6 => (3+1) x 7 + 7 = 35. KEINE eingefrorene Mandatszahl.
  const SECHS = [...MANDATE, "mandat-f"];
  const sechsEingaben = (retention) => baueEingaben({
    startbaseline: baueStartbaseline(SECHS),
    laeufe: baueLaeufe({ mandate: SECHS }),
    aktiveMandate: [...SECHS],
    erwarteteMandatszahl: 6,
    laufRetention: retention
  });
  check("40.5 Zusaetzliches Mandat hebt den Bedarf auf 35 — Retention 34 blockiert",
    V.bewerteNachweisfenster(sechsEingaben(34)).befunde.some((b) => b.grund === "aufbewahrung-reicht-nicht"));
  check("40.6 Retention 35 traegt die 6er-Menge (kein Aufbewahrungs-Blocker)",
    !V.bewerteNachweisfenster(sechsEingaben(35)).befunde.some((b) => b.grund === "aufbewahrung-reicht-nicht"));
  // Zusaetzlicher Watchdog-Slot: 2 Plaene => (3+2) x 6 + 6 = 36.
  const bZweiWatchdogs = V.bewerteNachweisfenster(baueEingaben({
    watchdogCrons: ["30 5 * * *", "0 9 * * *"], laufRetention: 35
  }));
  check("40.7 Zweiter Watchdog-Slot hebt den Bedarf auf 36 — Retention 35 blockiert",
    hatBefund(bZweiWatchdogs, "aufbewahrung-reicht-nicht"),
    JSON.stringify(bZweiWatchdogs.befunde.slice(0, 2)));
  check("40.8 Watchdog-Kadenz nicht ermittelbar => blockiert (nichts wird geraten)",
    V.bewerteNachweisfenster(baueEingaben({ watchdogCrons: null })).befunde
      .some((b) => b.grund === "watchdog-kadenz-nicht-ermittelbar"));
  check("40.9 Aufbewahrung selbst nicht belegt => blockiert (aufbewahrung-nicht-belegt)",
    V.bewerteNachweisfenster(baueEingaben({ laufRetention: null })).befunde
      .some((b) => b.grund === "aufbewahrung-nicht-belegt"));
}

// =============================================================================================
console.log("\n== 41 · K5: erklaerbare Kontextzahl — Zusammensetzung statt blinder Formel ==");
// =============================================================================================
{
  const mitZusammensetzung = (kontext) => mitGlobalPatch((r) => { r.datenstandDetail.kontext = kontext; });
  // Der REALE Fall des Nachweises: 15 Kontexte bei Schwelle 2n+1=11 — statisch nur 7,
  // der Rest dokumentgetrieben (Mehrfachherkunft/DIP). Mit persistierter Zusammensetzung
  // ist die Zahl ERKLAERT und besteht.
  const fall15 = {
    kontexte: 15, geteilt: 9, mandatseigen: 6, unbekannt: 0, dokumente: 2100, ohneSichtbarkeit: 0,
    zusammensetzung: {
      statisch: 7, dokumentgetrieben: 8, unbekannt: 0, statischMoeglich: 7,
      dipDokumente: 40, mehrfachHerkunft: 12, groessen: { "1": 6, "3": 4, "5": 5 }
    }
  };
  const b1 = V.bewerteNachweisfenster(baueEingaben({ laeufe: mitZusammensetzung(fall15) }));
  check("41.1 kontexte=15 > Schwelle 11, Zusammensetzung geht auf => bestanden mit erklaerter Warnung",
    b1.ausgang === "bestanden" && b1.warnungen.some((w) => w.includes("statisch=7") && w.includes("dokumentgetrieben=8")),
    JSON.stringify({ ausgang: b1.ausgang, befunde: b1.befunde.slice(0, 2) }));
  const inkonsistent = JSON.parse(JSON.stringify(fall15));
  inkonsistent.zusammensetzung.dokumentgetrieben = 5; // 7+5+0 != 15
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: mitZusammensetzung(inkonsistent) }));
  check("41.2 Zusammensetzung geht NICHT auf => nicht_bestanden (kontextzusammensetzung-inkonsistent)",
    b2.ausgang === "nicht_bestanden" && hatBefund(b2, "kontextzusammensetzung-inkonsistent"));
  const unplausibel = JSON.parse(JSON.stringify(fall15));
  unplausibel.zusammensetzung.statisch = 9;           // > statischMoeglich 7
  unplausibel.zusammensetzung.dokumentgetrieben = 6;  // Summe stimmt weiterhin (9+6=15)
  const b3 = V.bewerteNachweisfenster(baueEingaben({ laeufe: mitZusammensetzung(unplausibel) }));
  check("41.3 Mehr 'statische' Kontexte als der Plan hergibt => nicht_bestanden (unplausibel)",
    b3.ausgang === "nicht_bestanden" && hatBefund(b3, "kontextzusammensetzung-unplausibel"));
  const unvollstaendig = JSON.parse(JSON.stringify(fall15));
  delete unvollstaendig.zusammensetzung.statisch;
  const b4 = V.bewerteNachweisfenster(baueEingaben({ laeufe: mitZusammensetzung(unvollstaendig) }));
  check("41.4 Unvollstaendige Zusammensetzung => blockiert (Diagnosebedarf, kein Fehlurteil)",
    b4.ausgang === "blockiert" && hatBefund(b4, "kontextzusammensetzung-unvollstaendig"));
  // Sechs Mandate (Schwelle 13): dieselbe Mechanik, KEINE eingefrorene Mandatszahl.
  const SECHS = [...MANDATE, "mandat-f"];
  const b5 = V.bewerteNachweisfenster(baueEingaben({
    startbaseline: baueStartbaseline(SECHS),
    laeufe: baueLaeufe({ mandate: SECHS }).map((r) => (r.mode === "global"
      ? { ...r, datenstandDetail: { ...r.datenstandDetail, kontext: JSON.parse(JSON.stringify(fall15)) } }
      : r)),
    aktiveMandate: [...SECHS],
    erwarteteMandatszahl: 6,
    laufRetention: 60
  }));
  check("41.5 Sechs Mandate (Schwelle 13), kontexte=15 mit Zusammensetzung => bestanden",
    b5.ausgang === "bestanden", JSON.stringify(b5.befunde.slice(0, 2)));
  // Unterhalb der Schwelle stoert eine konsistente Zusammensetzung nichts.
  const klein = {
    kontexte: 10, geteilt: 4, mandatseigen: 6, unbekannt: 0, dokumente: 2000, ohneSichtbarkeit: 0,
    zusammensetzung: { statisch: 10, dokumentgetrieben: 0, unbekannt: 0, statischMoeglich: 11, dipDokumente: 0, mehrfachHerkunft: 0, groessen: { "1": 6, "5": 4 } }
  };
  check("41.6 Konsistente Zusammensetzung unterhalb der Schwelle => bestanden ohne Kontextwarnung",
    V.bewerteNachweisfenster(baueEingaben({ laeufe: mitZusammensetzung(klein) })).ausgang === "bestanden");
}

// =============================================================================================
console.log("\n== 42 · K8: Versiegelungstoleranz — Messartefakt ja, struktureller Ueberzug nie ==");
// =============================================================================================
{
  const mitVersiegelterDauer = (dauerMs) => baueEingaben({
    laeufe: baueLaeufe().map((r) => (r.mode === "mandat"
      ? { ...r, datenstand: { ...r.datenstand, dauerMs } }
      : r)),
    prozessLaeufe: SLOTS.map((s) => baueProzessZeile(s, { durationMs: dauerMs }))
  });
  const budget = VERSIEGELT_BUDGET_MS;
  const b313 = V.bewerteNachweisfenster(mitVersiegelterDauer(budget + 313));
  check("42.1 Der BEKANNTE Wert +313 ms => bestanden, als Messartefakt benannt (Warnung)",
    b313.ausgang === "bestanden" && !hatBefund(b313, "globalphase-budget-ueberzogen")
    && b313.warnungen.some((w) => w.includes("Versiegelungstoleranz")),
    JSON.stringify({ ausgang: b313.ausgang, befunde: b313.befunde.slice(0, 2) }));
  check("42.2 Direkt UNTERHALB der Toleranzgrenze (+999 ms) => bestanden",
    V.bewerteNachweisfenster(mitVersiegelterDauer(budget + V.VERSIEGELUNGS_TOLERANZ_MS - 1)).ausgang === "bestanden");
  check("42.3 GENAU an der Toleranzgrenze (+1000 ms) => bestanden (inklusiv)",
    V.bewerteNachweisfenster(mitVersiegelterDauer(budget + V.VERSIEGELUNGS_TOLERANZ_MS)).ausgang === "bestanden");
  const bDrueber = V.bewerteNachweisfenster(mitVersiegelterDauer(budget + V.VERSIEGELUNGS_TOLERANZ_MS + 1));
  check("42.4 EIN Millisekunde darueber => nicht_bestanden (globalphase-budget-ueberzogen)",
    bDrueber.ausgang === "nicht_bestanden" && hatBefund(bDrueber, "globalphase-budget-ueberzogen"),
    JSON.stringify(bDrueber.befunde.slice(0, 2)));
  const bStrukturell = V.bewerteNachweisfenster(mitVersiegelterDauer(budget + 267000));
  check("42.5 Struktureller Ueberzug (+267 s, der 03.08.-Fall) bleibt eine bewiesene Verletzung",
    bStrukturell.ausgang === "nicht_bestanden" && hatBefund(bStrukturell, "globalphase-budget-ueberzogen"));
  check("42.6 Die Toleranz ist KLEIN und technisch begruendet (1 s, nie still vergroesserbar)",
    V.VERSIEGELUNGS_TOLERANZ_MS === 1000, String(V.VERSIEGELUNGS_TOLERANZ_MS));
}

// =============================================================================================
console.log("\n== 43 · K4: die GESAMT-Vormerkbilanz im Vertrag — Bilanz geht auf oder faellt ==");
// =============================================================================================
{
  const detailMitVormerkung = () => {
    const d = detailAbgeschlossen();
    d.lazy = { cluster: 1242, verarbeitet: 60, uebersprungeneStapel: 2, uebersprungeneDokumente: 300 };
    d.eager = { stapel: 14, verarbeitet: 30, zurueckgestellt: 100, vorgemerkt: 100, bereitsVorhanden: 0, vormerkFehlgeschlagen: 0, nichtVorgemerkt: 0, uebersprungeneStapel: 1, uebersprungeneDokumente: 120, andereSkips: 0 };
    d.vormerkung = {
      lazyRestCluster: 1182, lazyRestKandidaten: 1182,
      // ROH = lazy 300 + eager 120 (dieselbe Zaehlbasis wie die Stapel-Zaehler);
      // dedupliziert bleiben 390 Zeilen — Mehrfachherkunft ist kein Vertragsbruch.
      uebersprungeneDokumenteRoh: 420, uebersprungeneDokumente: 390, clusterAusUebersprungenen: 290,
      kandidaten: 1472, vorgemerkt: 1400, bereitsVorhanden: 72, fehlgeschlagen: 0,
      nichtVorgemerkt: 0, anfragen: 16, dauerMs: 12000
    };
    return d;
  };
  const mitVormerkung = (patch) => {
    const d = detailMitVormerkung();
    if (patch) patch(d);
    return baueEingaben({ laeufe: baueLaeufe({ status: "teilweise", detail: d }) });
  };
  const b1 = V.bewerteNachweisfenster(mitVormerkung());
  check("43.1 Lazy-Rest (1182) + uebersprungene Stapel VOLLSTAENDIG vorgemerkt => bestanden (vorher unmoeglich)",
    b1.ausgang === "bestanden" && b1.warnungen.some((w) => w.includes("dauerhaft vorgemerkt") && w.includes("lazyRest=1182")),
    JSON.stringify(b1.befunde.slice(0, 3)));
  const b2 = V.bewerteNachweisfenster(mitVormerkung((d) => {
    d.vormerkung.fehlgeschlagen = 5; d.vormerkung.vorgemerkt = 1395;
  }));
  check("43.2 Speicherfehler der Abschlussphase => nicht_bestanden (rueckstand-nicht-dauerhaft)",
    b2.ausgang === "nicht_bestanden" && hatBefund(b2, "rueckstand-nicht-dauerhaft"));
  const b3 = V.bewerteNachweisfenster(mitVormerkung((d) => {
    d.vormerkung.nichtVorgemerkt = 3; d.vormerkung.vorgemerkt = 1397;
  }));
  check("43.3 nichtVorgemerkt > 0 bei regulaerem Laufende => nicht_bestanden",
    b3.ausgang === "nicht_bestanden" && hatBefund(b3, "rueckstand-nicht-dauerhaft"));
  const b4 = V.bewerteNachweisfenster(mitVormerkung((d) => { d.eager.vormerkFehlgeschlagen = 2; }));
  check("43.4 Speicherfehler in der VERSTEHENSPHASE => ebenfalls nicht_bestanden",
    b4.ausgang === "nicht_bestanden" && hatBefund(b4, "rueckstand-nicht-dauerhaft"));
  const b5 = V.bewerteNachweisfenster(mitVormerkung((d) => { d.vormerkung.kandidaten = 1500; }));
  check("43.5 Bilanz geht nicht auf (kandidaten != Summe) => blockiert (vormerkbilanz-inkonsistent)",
    b5.ausgang === "blockiert" && hatBefund(b5, "vormerkbilanz-inkonsistent"));
  const b6 = V.bewerteNachweisfenster(mitVormerkung((d) => { d.vormerkung.lazyRestCluster = 1000; }));
  check("43.6 Vormerkbilanz widerspricht der Lazy-Zaehlung => blockiert",
    b6.ausgang === "blockiert" && hatBefund(b6, "vormerkbilanz-widerspricht-lazyzaehlung"));
  const b7 = V.bewerteNachweisfenster(mitVormerkung((d) => {
    // Abschlussphase deckt den Lazy-Rest NICHT ab (gemessene Abdeckung 0, Bilanz in sich stimmig).
    d.vormerkung.lazyRestKandidaten = 0;
    d.vormerkung.kandidaten = 290; d.vormerkung.vorgemerkt = 290; d.vormerkung.bereitsVorhanden = 0;
  }));
  check("43.7 Lazy-Rest ohne Abdeckung in der Kandidatenmenge => blockiert (fehlender Lazy-Pfad faellt auf)",
    b7.ausgang === "blockiert" && hatBefund(b7, "vormerkbilanz-inkonsistent"),
    JSON.stringify(b7.befunde.slice(0, 2)));
  // Dedup-Gegenprobe (Review-Befund): weniger KANDIDATEN als rohe Rest-Cluster sind KEIN
  // Fehler, solange die gemessene Abdeckung stimmt — zwei Rest-Cluster desselben Vorgangs
  // sind ein Kandidat. Ein ehrlicher Lauf darf daran nicht scheitern.
  const b7b = V.bewerteNachweisfenster(mitVormerkung((d) => {
    d.vormerkung.lazyRestKandidaten = 1180;   // 2 Rest-Cluster teilen sich je einen Vorgang
    d.vormerkung.kandidaten = 1470; d.vormerkung.vorgemerkt = 1398;
  }));
  check("43.7b vorgangId-Dedup im Lazy-Rest (Kandidaten < Cluster) besteht weiterhin",
    b7b.ausgang === "bestanden", JSON.stringify(b7b.befunde.slice(0, 2)));
  const b8 = V.bewerteNachweisfenster(mitVormerkung((d) => { d.vormerkung.uebersprungeneDokumenteRoh = 100; }));
  check("43.8 Rohe Dokumentzaehlung der Abschlussphase widerspricht den Stapel-Zaehlern => blockiert",
    b8.ausgang === "blockiert" && hatBefund(b8, "vormerkbilanz-widerspricht-stapelzaehlung"),
    JSON.stringify(b8.befunde.slice(0, 2)));
  // Dedup an den DOKUMENTEN ist dagegen zulaessig: dedupliziert (390) < roh (420) besteht —
  // gefordert wird die rohe Gleichung, nicht die deduplizierte (Review-Befund).
  const b8b = V.bewerteNachweisfenster(mitVormerkung((d) => { d.vormerkung.uebersprungeneDokumente = 300; }));
  check("43.8b deduplizierte Dokumentzahl < roher Zaehlung ist KEIN Vertragsbruch",
    b8b.ausgang === "bestanden", JSON.stringify(b8b.befunde.slice(0, 2)));
  const b8c = V.bewerteNachweisfenster(mitVormerkung((d) => {
    // Uebersprungene Dokumente, aber die Abschlussphase hat nie geclustert (Deadline vorab
    // verbraucht): 0 Kandidaten aus den Stapeln => nachweislich nicht dauerhaft.
    d.vormerkung.clusterAusUebersprungenen = 0;
    d.vormerkung.kandidaten = 1182; d.vormerkung.vorgemerkt = 1110;
  }));
  check("43.8c uebersprungene Dokumente ohne einen einzigen Abschluss-Cluster => blockiert",
    b8c.ausgang === "blockiert" && hatBefund(b8c, "vormerkbilanz-widerspricht-stapelzaehlung"),
    JSON.stringify(b8c.befunde.slice(0, 2)));
  const b9 = V.bewerteNachweisfenster(mitVormerkung((d) => { delete d.vormerkung.vorgemerkt; }));
  check("43.9 Unvollstaendige Vormerkbilanz => blockiert (vormerkbilanz-unvollstaendig)",
    b9.ausgang === "blockiert" && hatBefund(b9, "vormerkbilanz-unvollstaendig"));
  const b10 = V.bewerteNachweisfenster(mitVormerkung((d) => {
    d.lazy.uebersprungeneStapel = 3; d.lazy.uebersprungeneDokumente = 0;
  }));
  check("43.10 uebersprungene Stapel mit 0 Dokumenten (unmoegliche Zaehlung) => blockiert",
    b10.ausgang === "blockiert" && hatBefund(b10, "rueckstand-nicht-vollstaendig-gezaehlt"),
    JSON.stringify(b10.befunde.slice(0, 2)));
}

console.log(`\n${passed + failed} Pruefpunkte · ${passed} PASS · ${failed} FAIL`);
process.exit(failed ? 1 : 0);
