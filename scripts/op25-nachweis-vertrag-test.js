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
const SLOTS = [
  { cronName: "pipeline", stamp: "20260810160003", slotIso: "2026-08-10T16:00:00Z", kuerzel: "aaaaa" },
  { cronName: "crawl", stamp: "20260810200002", slotIso: "2026-08-10T20:00:00Z", kuerzel: "bbbbb" },
  { cronName: "crawl", stamp: "20260811040004", slotIso: "2026-08-11T04:00:00Z", kuerzel: "ccccc" }
];
// Die VERSIEGELTEN Werte der globalen Phase (Vermerk), bewusst verschieden vom
// Laufdatensatz-Feld `durationMs` — genau daran haengt Haertung 3.
const VERSIEGELT_DAUER_MS = 190000;
const VERSIEGELT_BUDGET_MS = 221000;

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
    runId: laufkennung,
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

function baueProzessZeile(slot, { durationMs = VERSIEGELT_DAUER_MS, status = "success" } = {}) {
  return {
    runId: `${laufkennungVon(slot)}-global`,
    process: "globalphase",
    status,
    durationMs,
    createdAt: new Date(Date.parse(slot.slotIso) + 210000).toISOString(),
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

function baueStartbaseline(mandate = MANDATE, extra = {}) {
  const sig = V.mandatsSignatur(mandate);
  return {
    erhobenAtMs: FENSTER.vonMs - 60000,
    erhobenAt: new Date(FENSTER.vonMs - 60000).toISOString(),
    aktivierungAtMs: AKTIVIERUNG_MS,
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
    laufRetention: 20,
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

console.log("\n== 18/19 · Auffaellige Kontextzahl: unerklaert faellt durch, erklaert besteht ==");
{
  const auffaellig = (r) => {
    r.datenstandDetail.kontext = { kontexte: 40, geteilt: 34, mandatseigen: 6, unbekannt: 0, dokumente: 2000, ohneSichtbarkeit: 0 };
  };
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe: mitGlobalPatch(auffaellig) }));
  check("18.1 kontexte=40 (> 2n+1=11) ohne Erklaerung => nicht_bestanden",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "auffaellige-kontextzahl-ohne-erklaerung"));
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

  // (b) Aufbewahrungsvertrag, reproduzierbar: 3 Laeufe x (1 global + 5 Mandate) = 18.
  const bKnapp = V.bewerteNachweisfenster(baueEingaben());
  check("30.3 Benoetigte Datensaetze werden ausgewiesen (3 x (1+5) = 18)",
    bKnapp.benoetigteDatensaetze === 18, String(bKnapp.benoetigteDatensaetze));
  check("30.4 Retention 20 bei Bedarf 18 => Warnung 'Aufbewahrung knapp'",
    bKnapp.warnungen.some((w) => w.includes("Aufbewahrung knapp")));
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

  // (i) Fehlt die dauerhafte Zeile ganz, wird die schwaechere Belegbasis BENANNT.
  const bOhneDauerhaft = V.bewerteNachweisfenster(baueEingaben({ prozessLaeufe: [] }));
  check("30.13 Ohne dauerhafte Zeile: besteht, aber mit ausdruecklicher Warnung",
    bOhneDauerhaft.ausgang === "bestanden"
    && bOhneDauerhaft.warnungen.some((w) => w.includes("keine dauerhafte Laufzeile")));
}

console.log(`\n${passed + failed} Pruefpunkte · ${passed} PASS · ${failed} FAIL`);
process.exit(failed ? 1 : 0);
