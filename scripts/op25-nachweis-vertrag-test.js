"use strict";

// OP-25 — Vertragstests des Production-Nachweises (E3-Fassung, 2026-08-04).
// =============================================================================================
// Prueft den Bewertungskern `lib/helmut/op25-nachweis.js` gegen die 24 verbindlichen
// Fallfamilien des Sprintauftrags plus Zusatzfaelle (Vorrang, Fensterlogik, Parsing).
//
// UNABHAENGIGE ERWARTUNGEN: jede Erwartung (Ausgang, Befundgrund, Slot-Zahl) ist HART
// KODIERT und NICHT aus derselben Fixture abgeleitet, die geprueft wird. Die Fixtures
// bauen Laufdatensaetze in der Form, die `compactCrawlRunForStore` persistiert; die
// Soll-Ausgaenge stammen aus dem dokumentierten Vertrag (docs/betrieb/vorgangskontext.md
// §7.7 nach diesem Sprint), nicht aus dem Code.
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

function detailAbgeschlossen() {
  return {
    budgetMs: 221000,
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

function baueGlobal(slot, { status = "abgeschlossen", detail = null, ...overrides } = {}) {
  const laufkennung = `cron-${slot.cronName}-${slot.stamp}-${slot.kuerzel}`;
  return {
    mode: "global",
    politicianId: null,
    globalphase: true,
    runId: `${laufkennung}-global`,
    createdAt: new Date(Date.parse(slot.slotIso) + 200000).toISOString(),
    durationMs: 190000,
    savedItems: 2000,
    newRawDocuments: 800,
    checkedSources: 181,
    successfulSources: 181,
    failedSources: 0,
    runState: "gesund",
    errorCodes: null,
    quellenVereinigung: { gesamt: 181, gemeinsam: 140, mandatseigen: 41, doppelteAbrufwege: 3, fehlerhafteProfile: [], mandate: 5 },
    datenstandDetail: detail || detailAbgeschlossen(),
    _status: status,
    ...overrides
  };
}

function baueMandat(slot, politicianId, { status = "abgeschlossen", ...overrides } = {}) {
  const laufkennung = `cron-${slot.cronName}-${slot.stamp}-${slot.kuerzel}`;
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
      kontexte: 10
    },
    ...overrides
  };
}

function baueLaeufe({ status = "abgeschlossen", detail = null } = {}) {
  const laeufe = [];
  for (const slot of SLOTS) {
    laeufe.push(baueGlobal(slot, { status, detail: detail ? JSON.parse(JSON.stringify(detail)) : (status === "teilweise" ? detailTeilweiseDauerhaft() : null) }));
    for (const m of MANDATE) laeufe.push(baueMandat(slot, m, { status }));
  }
  return laeufe;
}

function baueEingaben(overrides = {}) {
  return {
    jetztMs: JETZT_MS,
    fenster: { ...FENSTER },
    aktivierungAtMs: AKTIVIERUNG_MS,
    crons: CRONS,
    laeufe: baueLaeufe(),
    aktiveMandate: [...MANDATE],
    erwarteteMandatszahl: 5,
    kosten: { fensterUsd: 1.2, rahmenUsd: 5 },
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
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
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
    b.ausgang === "bestanden" && b.ausgeschlossen.some((a) => a.runId.includes("20260809") && a.grund === "ausserhalb-des-fensters"));
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
  const laeufe = baueLaeufe().filter((r) => r.mode !== "global").map((r) => r);
  for (const slot of SLOTS) {
    laeufe.push({ mode: "full", politicianId: "mandat-a", runId: `cron-${slot.cronName}-${slot.stamp}-${slot.kuerzel}`, createdAt: new Date(Date.parse(slot.slotIso) + 100000).toISOString() });
  }
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("14.1 Nur Altpfad-Laeufe => nicht_bestanden (fehlende globale Laeufe)",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "fehlender-lauf"));
}

console.log("\n== 15 · Aenderung der Mandatsmenge macht das Fenster ungueltig (Fall 15) ==");
{
  const laeufe = baueLaeufe();
  const einer = laeufe.find((r) => r.mode === "global" && r.runId.includes("20260811040004"));
  einer.quellenVereinigung = { ...einer.quellenVereinigung, mandate: 6 };
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("15.1 Lauf mit anderer Mandatszahl => blockiert (fenster-ungueltig)",
    b.ausgang === "blockiert" && hatBefund(b, "fenster-ungueltig-mandatsmenge-veraendert"));
  const laeufe2 = baueLaeufe();
  laeufe2.push(baueMandat(SLOTS[0], "mandat-neu"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe2 }));
  check("15.2 Unerwartetes Mandat im Lauf => blockiert (fenster-ungueltig)",
    b2.ausgang === "blockiert" && hatBefund(b2, "fenster-ungueltig-mandatsmenge-veraendert"));
}

console.log("\n== 16 · Budgetueberziehung faellt durch (Fall 16) ==");
{
  const b = V.bewerteNachweisfenster(baueEingaben({
    laeufe: mitGlobalPatch((r) => { r.durationMs = 267122; })
  }));
  check("16.1 Globale Phase ueber Budget => nicht_bestanden",
    b.ausgang === "nicht_bestanden" && hatBefund(b, "globalphase-budget-ueberzogen"));
  const laeufe = baueLaeufe().map((r) => (r.mode === "mandat" && r.runId.includes("20260810160003") && r.politicianId === "mandat-e"
    ? { ...r, createdAt: "2026-08-10T16:09:00.000Z" }
    : r));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
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
    const g = baueGlobal(slot);
    g.quellenVereinigung.mandate = 3;
    // Aufgreifschwelle bei n=3 ist 2n+1=7 — die Fixture bleibt darunter (4+3+0=7).
    g.datenstandDetail.kontext = { kontexte: 7, geteilt: 4, mandatseigen: 3, unbekannt: 0, dokumente: 2000, ohneSichtbarkeit: 0 };
    laeufe.push(g);
    for (const m of andereMandate) laeufe.push(baueMandat(slot, m));
  }
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe, aktiveMandate: andereMandate, erwarteteMandatszahl: 3 }));
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
  const b2 = V.bewerteNachweisfenster(baueEingaben({ laeufe: [] }));
  check("23.2 Leere Laufdaten => nicht_bestanden (fehlende Laeufe)", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "fehlender-lauf"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({ aktiveMandate: [] }));
  check("23.3 Leere Mandatsmenge => blockiert", b3.ausgang === "blockiert" && hatBefund(b3, "aktive-mandatsmenge-nicht-ermittelbar"));
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
    aktivierungAtMs: Date.parse("2026-08-10T13:00:00Z")
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

console.log("\n== 26 · Status- und Kostenregeln (Zusatzfaelle) ==");
{
  const laeufe = baueLaeufe({ status: "fehlgeschlagen" });
  const b = V.bewerteNachweisfenster(baueEingaben({ laeufe }));
  check("26.1 datenstand=fehlgeschlagen => nicht_bestanden", b.ausgang === "nicht_bestanden" && hatBefund(b, "datenstand-fehlgeschlagen"));
  const b2 = V.bewerteNachweisfenster(baueEingaben({ kosten: { fensterUsd: 9.5, rahmenUsd: 5 } }));
  check("26.2 LLM-Kosten ueber Rahmen => nicht_bestanden", b2.ausgang === "nicht_bestanden" && hatBefund(b2, "llm-kosten-ueber-rahmen"));
  const b3 = V.bewerteNachweisfenster(baueEingaben({ kosten: null }));
  check("26.3 Kosten nicht belegbar => blockiert", b3.ausgang === "blockiert" && hatBefund(b3, "kostenrahmen-nicht-belegbar"));
  const laeufe4 = baueLaeufe().map((r) => (r.mode === "mandat" && r.politicianId === "mandat-a" && r.runId.includes("20260810160003")
    ? { ...r, datenstand: { ...r.datenstand, laufId: "cron-pipeline-20260809160002-fremd-global" } }
    : r));
  const b4 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe4 }));
  check("26.4 Mandatslauf auf FREMDEM Datenstand => nicht_bestanden",
    b4.ausgang === "nicht_bestanden" && hatBefund(b4, "mandatslauf-fremder-datenstand"));
  const laeufe5 = baueLaeufe().map((r) => (r.mode === "mandat" && r.runId.includes("20260810160003") && r.politicianId === "mandat-a"
    ? { ...r, datenstand: { ...r.datenstand, status: "teilweise" } }
    : r));
  const b5 = V.bewerteNachweisfenster(baueEingaben({ laeufe: laeufe5 }));
  check("26.5 Uneinheitlicher Status im selben Lauf => nicht_bestanden",
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

console.log(`\n${passed + failed} Pruefpunkte · ${passed} PASS · ${failed} FAIL`);
process.exit(failed ? 1 : 0);
