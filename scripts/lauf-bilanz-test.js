"use strict";

// Helmut — Vertragstest KANONISCHE LAUFBILANZ (Korrektursprint 2026-08-31).
// Offline, reine Funktionen und Attrappen — kein Netz, keine Datenbank, kein Modellaufruf.
// =============================================================================================
// BELEGTER ANLASS — natuerlicher Understanding-Lauf 2026-08-30, 21:30:04–21:33:45 UTC,
// Production-Commit afc807e0. Die relationale Laufquittung meldete:
//     status = success · saved_count = 0 · skipped_count = 0 · failed_count = 0
// obwohl die Fachtelemetrie DESSELBEN Laufs auswies:
//     ergebnisse { saved: 18, skipped-error: 1 } · gruppen { verarbeitet 18, erneut 32,
//     fehlgeschlagen 1 } · cluster 51
// Zwei getrennte Ursachen, beide hier festgenagelt:
//   (a) der Gesamtstatus wurde allein aus `result.skipped` abgeleitet — ein Teilerfolg MIT
//       Fehlerfall hatte gar keine Ausdrucksform;
//   (b) die skalaren Zaehler wurden nie uebergeben und in der relationalen Projektion aus
//       `null` zu einer harten `0` gemacht (`Number(null) === 0`).
//
//   §1  Der echte Production-Lauf ergibt NICHT MEHR `success` (Pflichtpruefung 1)
//   §2  Hauptzaehler == kanonische Fachtelemetrie, rechnerisch geschlossen (Pflicht 2, 6)
//   §3  Null Fehler bleibt `success` (Pflicht 3)
//   §4  Ordnungsgemaesser Leerlauf ergibt `blocked` (Pflicht 4)
//   §5  Vollstaendig gescheiterter Lauf ergibt `failed` (Pflicht 5)
//   §6  Vertagte Arbeit allein erzeugt keinen Fehler (Pflicht 6/„vertagt bleibt sichtbar")
//   §7  Unbekannte Ergebnisarten fuehren nicht zu falschem Gruen (Pflicht 7)
//   §8  `num(null)` ist nicht 0 — unbekannt bleibt unbekannt (Ursache b)
//   §9  Der Gesundheitsbericht bewertet den korrigierten Lauf korrekt (Pflicht 8)
//   §10 Quelltextvertrag: beide Verstehens-Einstiegspunkte nutzen die EINE Ableitung
//   §11 Restzeitwache: vertagte Arbeit landet in `vertagt`, nie in `fehlgeschlagen` (Pflicht 10)
//   §12 U+0000 aus dem Modelltext erreicht die Ablage nicht mehr (Production 30.08. 20:02 UTC)
//   §13 Der Parservertrag aus PR #274 bleibt unveraendert streng (Pflicht 9)
//   §14 REVIEW-BEFUND 31.08.: eine nicht stimmige Bilanz ergibt NIE `success`, und eine
//       nicht abrechenbare Bilanz speichert `processed_count` als null statt als 0

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const { laufBilanz, EIMER, GRUPPEN_ALLE, STATUS } = require(path.join(ROOT, "lib/helmut/lauf-bilanz"));
const { ERGEBNISGRUPPEN, buildOutcomeTelemetry } = require(path.join(ROOT, "lib/helmut/understanding"));
const { processRunToRelationalRow, relationalRowToProcessRun } = require(path.join(ROOT, "lib/helmut/blob-relational"));
const { sanitizeProcessRun } = require(path.join(ROOT, "lib/helmut/storage"));
const motorHealth = require(path.join(ROOT, "lib/helmut/motor-health"));
const ai = require(path.join(ROOT, "lib/helmut/ai"));
const { assembleKnowledgeObject } = require(path.join(ROOT, "lib/helmut/understanding"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const NUL = String.fromCharCode(0);

// Baut ein Lauf-Ergebnisobjekt in der Form, die `runPendingUnderstandingShadow` liefert —
// die Fachtelemetrie entsteht dabei durch die ECHTE `buildOutcomeTelemetry`, nicht von Hand.
function lauf(results, deferred = 0, extra = {}) {
  return {
    pending: results.length + deferred,
    deferred,
    counts: results.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {}),
    results,
    telemetrie: buildOutcomeTelemetry({ clusterCount: results.length + deferred, results, deferred }),
    ...extra
  };
}
const n = (status, anzahl) => Array.from({ length: anzahl }, () => ({ status, documents: 1 }));

async function main() {
  // ── §1 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§1 Der Production-Lauf vom 30.08. 21:30 UTC ergibt nicht mehr `success`");
  // Exakt die Zusammensetzung der Production-Zeile: 18 gespeichert, 1 skipped-error,
  // 32 vertagt. Der erneut freigegebene Vorgang war der eine Fehlerfall.
  const echt = lauf([...n("saved", 18), { status: "skipped-error", documents: 1 }], 32);
  const b1 = laufBilanz(echt);
  check("Gesamtstatus ist NICHT success", b1.status !== "success", `status=${b1.status}`);
  check("Gesamtstatus ist partial (Arbeit fertig, ein echter Fehlerfall)",
    b1.status === STATUS.PARTIAL, `status=${b1.status}`);
  check("gespeichert = 18", b1.gespeichert === 18, String(b1.gespeichert));
  check("fehlgeschlagen = 1", b1.fehlgeschlagen === 1, String(b1.fehlgeschlagen));
  check("vertagt = 32", b1.vertagt === 32, String(b1.vertagt));
  check("uebersprungen = 0", b1.uebersprungen === 0, String(b1.uebersprungen));
  check("klassifizierte Fehlerangabe ohne Rohtext", b1.fehlerklasse === "skipped-error", String(b1.fehlerklasse));
  check("Fehlerangabe traegt keine Kennung und keinen Freitext",
    /^[a-z0-9:-]+$/.test(String(b1.fehlerklasse)), String(b1.fehlerklasse));

  // ── §2 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§2 Hauptzaehler stimmen rechnerisch mit der Fachtelemetrie ueberein");
  check("Summe der vier Hauptzaehler = cluster der Fachtelemetrie",
    b1.gespeichert + b1.uebersprungen + b1.fehlgeschlagen + b1.vertagt === b1.cluster,
    `${b1.gesamt} vs ${b1.cluster}`);
  check("stimmig meldet die Uebereinstimmung", b1.stimmig === true);
  check("gespeichert == telemetrie.gruppen.verarbeitet",
    b1.gespeichert === echt.telemetrie.gruppen.verarbeitet);
  check("fehlgeschlagen == gruppen.fehlgeschlagen + gruppen.unbekannt",
    b1.fehlgeschlagen === echt.telemetrie.gruppen.fehlgeschlagen + echt.telemetrie.gruppen.unbekannt);
  check("vertagt == gruppen.erneut", b1.vertagt === echt.telemetrie.gruppen.erneut);
  // Vollstaendigkeit: JEDE Gruppe aus buildOutcomeTelemetry liegt in genau EINEM Eimer.
  const gruppenDerTelemetrie = Object.keys(echt.telemetrie.gruppen);
  const fehlend = gruppenDerTelemetrie.filter((g) => !GRUPPEN_ALLE.includes(g));
  check("jede Ergebnisgruppe ist genau einem Hauptzaehler zugeordnet",
    fehlend.length === 0, `nicht zugeordnet: ${fehlend.join(", ")}`);
  const doppelt = GRUPPEN_ALLE.filter((g, i) => GRUPPEN_ALLE.indexOf(g) !== i);
  check("keine Gruppe liegt in zwei Eimern", doppelt.length === 0, doppelt.join(", "));
  // Und die Zeile, die wirklich in der Datenbank landet.
  const zeile = processRunToRelationalRow(sanitizeProcessRun({
    process: "understanding-cron", runId: "t-1", zielmenge: 500,
    processed: b1.gespeichert, gespeichert: b1.gespeichert, uebersprungen: b1.uebersprungen,
    fehlgeschlagen: b1.fehlgeschlagen, deferred: b1.vertagt, status: b1.status,
    fehlerklasse: b1.fehlerklasse, telemetrie: echt.telemetrie
  }));
  check("relationale Zeile: status=partial", zeile.status === "partial", zeile.status);
  check("relationale Zeile: saved_count=18", zeile.saved_count === 18, String(zeile.saved_count));
  check("relationale Zeile: failed_count=1", zeile.failed_count === 1, String(zeile.failed_count));
  check("relationale Zeile: deferred_count=32", zeile.deferred_count === 32, String(zeile.deferred_count));
  check("relationale Zeile: error_class gesetzt", zeile.error_class === "skipped-error", String(zeile.error_class));
  const zurueck = relationalRowToProcessRun(zeile);
  check("Rueckabbildung erhaelt die Hauptzaehler",
    zurueck.gespeichert === 18 && zurueck.fehlgeschlagen === 1 && zurueck.uebersprungen === 0);

  // ── §3 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§3 Null Fehler ergibt weiterhin success");
  const sauber = laufBilanz(lauf(n("saved", 20), 30));
  check("status = success", sauber.status === STATUS.SUCCESS, sauber.status);
  check("keine Fehlerangabe", sauber.fehlerklasse === null, String(sauber.fehlerklasse));
  check("fehlgeschlagen = 0", sauber.fehlgeschlagen === 0);
  // Gegenprobe an der Production-Zeile des 05:30-Laufs desselben Tages (20 saved, 30 vertagt).
  check("30.08. 05:30 UTC bleibt success", sauber.status === "success" && sauber.gespeichert === 20);

  // ── §4 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§4 Ordnungsgemaesser Leerlauf ergibt blocked");
  for (const grund of ["no-pending", "understanding-locked", "ai-disabled", "v3-store-disabled"]) {
    const b = laufBilanz({ skipped: true, reason: grund });
    check(`skipped:${grund} -> blocked`, b.status === STATUS.BLOCKED, b.status);
    check(`skipped:${grund} -> Zaehler bleiben unbekannt (null), nicht 0`,
      b.gespeichert === null && b.fehlgeschlagen === null && b.vertagt === null,
      JSON.stringify({ g: b.gespeichert, f: b.fehlgeschlagen, v: b.vertagt }));
  }
  const leerlauf = laufBilanz(lauf([], 0));
  check("Arbeitsliste vorhanden, aber null Zeilen -> blocked", leerlauf.status === STATUS.BLOCKED, leerlauf.status);

  // ── §5 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§5 Vollstaendig gescheiterter Lauf ergibt failed");
  const kaputt = laufBilanz(lauf(n("cluster-error", 7), 0));
  check("nur Fehler, nichts gespeichert -> failed", kaputt.status === STATUS.FAILED, kaputt.status);
  check("fehlgeschlagen = 7", kaputt.fehlgeschlagen === 7);
  check("Fehlerangabe = cluster-error", kaputt.fehlerklasse === "cluster-error", String(kaputt.fehlerklasse));
  const kaputtMitRest = laufBilanz(lauf(n("skipped-error", 3), 9));
  check("Fehler + Vertagungen, nichts gespeichert -> failed",
    kaputtMitRest.status === STATUS.FAILED, kaputtMitRest.status);
  const ohneTelemetrie = laufBilanz({ pending: 4, results: [] });
  check("nicht skipped, aber keine Fachtelemetrie -> failed (fail closed)",
    ohneTelemetrie.status === STATUS.FAILED, ohneTelemetrie.status);
  check("… und ausdruecklich als telemetrie-fehlt benannt",
    ohneTelemetrie.fehlerklasse === "telemetrie-fehlt", String(ohneTelemetrie.fehlerklasse));
  check("… Zaehler bleiben null statt 0", ohneTelemetrie.gespeichert === null);

  // ── §6 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§6 Vertagte Arbeit allein erzeugt keinen falschen Fehler");
  const nurVertagt = laufBilanz(lauf([], 41));
  check("41 vertagt, 0 verarbeitet -> success", nurVertagt.status === STATUS.SUCCESS, nurVertagt.status);
  check("fehlgeschlagen bleibt 0", nurVertagt.fehlgeschlagen === 0);
  check("vertagt = 41 und getrennt sichtbar", nurVertagt.vertagt === 41);
  // Auch die Zeit-/Budget-Ausgaenge selbst duerfen nie als Fehler zaehlen.
  for (const status of ["skipped-zeitbudget", "skipped-budget", "skipped-store",
    "skipped-modellstart-unklar", "skipped-cluster-belegt", "skipped-no-cluster"]) {
    const b = laufBilanz(lauf(n(status, 3), 0));
    check(`${status} zaehlt als vertagt, nicht als Fehler`,
      b.vertagt === 3 && b.fehlgeschlagen === 0 && b.status === STATUS.SUCCESS,
      `${b.status} v=${b.vertagt} f=${b.fehlgeschlagen}`);
  }

  // ── §7 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§7 Unbekannte Ergebnisarten fuehren nicht zu falschem Gruen");
  const unbekannt = lauf([...n("saved", 5), { status: "voellig-neue-ergebnisart", documents: 1 }], 2);
  check("Vorbedingung: die Ergebnisart ist der Gruppenkarte unbekannt",
    ERGEBNISGRUPPEN["voellig-neue-ergebnisart"] === undefined);
  check("Vorbedingung: sie landet in gruppen.unbekannt",
    unbekannt.telemetrie.gruppen.unbekannt === 1);
  const bu = laufBilanz(unbekannt);
  check("Lauf mit unbekannter Ergebnisart ist nicht success", bu.status !== "success", bu.status);
  check("… sondern partial (5 gespeichert)", bu.status === STATUS.PARTIAL, bu.status);
  check("… und wird als Fehler gezaehlt", bu.fehlgeschlagen === 1);
  check("… die Fehlerangabe benennt die unbekannte Art",
    String(bu.fehlerklasse).startsWith("ergebnisart-unbekannt:"), String(bu.fehlerklasse));
  const nurUnbekannt = laufBilanz(lauf(n("noch-eine-neue-art", 4), 0));
  check("nur unbekannte Ergebnisarten -> failed", nurUnbekannt.status === STATUS.FAILED, nurUnbekannt.status);

  // ── §8 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§8 Ein nicht uebergebener Zaehler wird nicht zu einer harten 0");
  const ohneZaehler = processRunToRelationalRow(sanitizeProcessRun({
    process: "briefing-morning", runId: "t-2", processed: 5, zielmenge: 5, status: "success"
  }));
  check("saved_count bleibt null statt 0", ohneZaehler.saved_count === null, String(ohneZaehler.saved_count));
  check("skipped_count bleibt null statt 0", ohneZaehler.skipped_count === null, String(ohneZaehler.skipped_count));
  check("failed_count bleibt null statt 0", ohneZaehler.failed_count === null, String(ohneZaehler.failed_count));
  check("ein WIRKLICH gemessener Nullwert bleibt 0", processRunToRelationalRow(
    sanitizeProcessRun({ process: "p", runId: "t-3", fehlgeschlagen: 0 })).failed_count === 0);
  check("processed bleibt unveraendert erhalten", ohneZaehler.processed_count === 5);
  check("Quelltextvertrag: blob-relational unterscheidet null von 0",
    /if \(v === null \|\| v === undefined \|\| v === ""\) return null;/.test(src("lib/helmut/blob-relational.js")));

  // ── §9 ─────────────────────────────────────────────────────────────────────────────────
  abschnitt("§9 Der Gesundheitsbericht bewertet den korrigierten Lauf korrekt");
  const t0 = Date.parse("2026-08-30T21:30:04Z");
  const quittung = (process_, status, tMs) => ({
    process: process_, status, startedAt: new Date(tMs).toISOString(), createdAt: new Date(tMs).toISOString()
  });
  // `partial` darf NIE als „Slot fehlt" gelten (Watchdog-Korrektur 26.08.).
  // Die Slottoleranz betraegt 3 h; erst danach gilt ein Slot als faellig. 12 h spaeter ist
  // der 21:30-Slot des 30.08. bewertbar. Geprueft wird ausschliesslich DIESER Slot.
  const mitPartial = motorHealth.pruefeSlotQuittungen({
    quittungen: [quittung("understanding-cron", "partial", t0)],
    nowMs: t0 + 12 * 3600e3
  });
  check("partial-Quittung erzeugt kein slot-fehlt fuer denselben Slot",
    !(mitPartial.fehlendeSlots || []).includes("understanding-cron@21:30Z"),
    JSON.stringify(mitPartial.fehlendeSlots));
  check("partial wird als Stoerung erfasst statt verschwiegen",
    (mitPartial.teilweiseSlots || []).length > 0, JSON.stringify(mitPartial.teilweiseSlots));
  // Ein spaeterer erfolgreicher Lauf DESSELBEN Prozesses beweist die Erholung.
  const mitErholung = motorHealth.pruefeSlotQuittungen({
    quittungen: [
      quittung("understanding-cron", "partial", t0),
      quittung("understanding-cron", "success", t0 + 8 * 3600e3)
    ],
    nowMs: t0 + 12 * 3600e3
  });
  check("nach spaeterem Erfolg gilt die Stoerung als erholt",
    (mitErholung.teilweiseSlots || []).every((s) => s && s.erholt !== false),
    JSON.stringify(mitErholung.teilweiseSlots));
  // Die Abrechnung der Quittung: `fehlgeschlagen` ist jetzt belegt statt unbekannt.
  const abr = motorHealth.abrechnungWarteschlangenQuittung(zurueck);
  check("Gesundheitsbericht liest 1 endgueltig fehlgeschlagen", abr.endgueltig === 1, String(abr.endgueltig));
  check("Gesundheitsbericht liest 32 zurueckgestellt", abr.zurueckgestellt === 32, String(abr.zurueckgestellt));
  check("kein Widerspruch in der Abrechnung", abr.widerspruch === false);

  // ── §10 ────────────────────────────────────────────────────────────────────────────────
  abschnitt("§10 Quelltextvertrag: EINE Ableitung an beiden Verstehens-Einstiegspunkten");
  const serverSrc = src("server.js");
  const schedulerSrc = src("lib/helmut/scheduler.js");
  // Der Block reicht vom Routeneinstieg bis zur naechsten Route — nicht nach Zeichenzahl
  // geraten, sonst prueft der Vertrag stillschweigend nur einen Teil des Blocks.
  const cronStart = serverSrc.indexOf('url.pathname === "/api/cron/understanding"');
  const cronEnde = serverSrc.indexOf('url.pathname === "/api/tasks"', cronStart);
  check("Routenblock des Understanding-Crons ist eindeutig abgegrenzt",
    cronStart > 0 && cronEnde > cronStart, `${cronStart}/${cronEnde}`);
  const cronBlock = serverSrc.slice(cronStart, cronEnde);
  check("understanding-Cron ruft laufBilanz", /const bilanz = laufBilanz\(result\)/.test(cronBlock));
  check("understanding-Cron leitet den Status NICHT mehr aus result.skipped ab",
    !/status: result && result\.skipped \? "blocked" : "success"/.test(cronBlock));
  for (const feld of ["gespeichert: bilanz.gespeichert", "uebersprungen: bilanz.uebersprungen",
    "fehlgeschlagen: bilanz.fehlgeschlagen", "deferred: bilanz.vertagt",
    "status: bilanz.status", "fehlerklasse: bilanz.fehlerklasse"]) {
    check(`understanding-Cron uebergibt ${feld.split(":")[0]}`, cronBlock.includes(feld));
  }
  check("lage-check nutzt dieselbe Ableitung", /const lageBilanz = laufBilanz\(understanding\)/.test(schedulerSrc));
  check("lage-check leitet den Status NICHT mehr aus skipped ab",
    !/status: understanding && understanding\.skipped \? "blocked" : "success"/.test(schedulerSrc));
  check("es gibt keine zweite Zaehlung ueber results im Cron",
    !/results\.filter\(\(r\) => r && \(r\.status === "saved" \|\| r\.status === "updated"\)\)/.test(cronBlock));
  check("alle erzeugten Zustaende stehen im CHECK-Constraint der Tabelle",
    Object.values(STATUS).every((s) =>
      new RegExp(`'${s}'`).test(src("supabase/migrations/20260727_process_runs_relational.sql"))));

  // ── §11 ────────────────────────────────────────────────────────────────────────────────
  abschnitt("§11 Restzeitwache: vertagte Arbeit bleibt vertagt, ohne Modellaufruf");
  // Die Wache selbst ist in verstehen-restzeit-test.js belegt (50 PASS). Hier wird nur
  // festgehalten, dass ihr Ausgang in der Laufbilanz NIE als Fehler erscheint.
  const restzeitLauf = lauf([...n("saved", 4), ...n("skipped-zeitbudget", 6)], 12);
  const br = laufBilanz(restzeitLauf);
  check("skipped-zeitbudget + Loop-Vertagungen ergeben vertagt = 18", br.vertagt === 18, String(br.vertagt));
  check("Status bleibt success (kein erfundener Fehler)", br.status === STATUS.SUCCESS, br.status);
  check("fehlgeschlagen bleibt 0", br.fehlgeschlagen === 0);
  check("Bilanz bleibt rechnerisch geschlossen", br.stimmig === true);
  check("Quelltextvertrag: die Wache steht unveraendert vor jedem Cluster",
    /if \(restzeitWeg\(\)\) \{ budgetHit = true; deferred \+= 1; continue; \}/
      .test(src("lib/helmut/understanding.js")));
  check("Quelltextvertrag: der Cron uebergibt die absolute 280-s-Deadline",
    /deadlineMs: understandingStartMs \+ 280000/.test(serverSrc));

  // ── §12 ────────────────────────────────────────────────────────────────────────────────
  abschnitt("§12 U+0000 aus dem Modelltext erreicht die Ablage nicht mehr");
  // VOLLSTAENDIG SYNTHETISCH — keine Production-Antwort, kein Netz.
  const modellText = '{"was_ist_passiert":"Teil A' + NUL + 'Teil B","headline":"Titel",'
    + '"parteien":["Alpha' + NUL + 'Beta"],"handlungsempfehlung":"Kurz' + NUL + 'Text"}';
  const umschlag = '{"status":"completed","output_text":"' + modellText.replace(/"/g, '\\"') + '"}';
  let roh = false;
  try { JSON.parse(umschlag); } catch (_) { roh = true; }
  check("Vorbedingung: der Umschlag ist ohne Rettung ungueltiges JSON", roh === true);
  const umschlagJson = ai.parseProviderResponseJson(umschlag);
  check("die Rettung aus PR #274 greift weiterhin", umschlagJson && umschlagJson.status === "completed");
  const modell = ai.parseModelJsonText(umschlagJson.output_text);
  check("Vorbedingung: der geparste Modelltext traegt wirklich ein U+0000",
    String(modell.was_ist_passiert).indexOf(NUL) !== -1);
  const ko = assembleKnowledgeObject(modell, {
    documents: [{ id: "d1", title: "T", url: "https://example.invalid/a", source_id: "s1",
      published_at: new Date().toISOString() }]
  }, "vg-synthetisch-1");
  const felder = [ko.was_ist_passiert, ko.headline, ko.handlungsempfehlung, ...(ko.parteien || [])];
  check("kein Prosafeld des Wissensobjekts traegt U+0000",
    felder.every((f) => String(f).indexOf(NUL) === -1));
  check("die Nutzlast an PostgREST enthaelt kein \\u0000 (kein 22P05 mehr)",
    JSON.stringify(ko).indexOf("\\u0000") === -1);
  check("Woerter verkleben nicht (Steuerzeichen wird zu einem Leerzeichen)",
    ko.was_ist_passiert === "Teil A Teil B", ko.was_ist_passiert);
  check("gueltiger Text bleibt unveraendert",
    assembleKnowledgeObject({ headline: "Ganz normale Zeile" }, { documents: [] }, "vg-x").headline
      === "Ganz normale Zeile");
  check("Quelltextvertrag: die Engstelle nimmt C0-Steuerzeichen mit",
    /\/\[\\s\\u0000-\\u001F\\u007F\]\+\/g/.test(src("lib/helmut/understanding.js")));

  // ── §13 ────────────────────────────────────────────────────────────────────────────────
  abschnitt("§13 Der Parservertrag aus PR #274 bleibt unveraendert streng");
  const abgelehnt = (fn) => { try { fn(); return false; } catch (_) { return true; } };
  check("unvollstaendige Anbieterantwort bleibt abgelehnt",
    abgelehnt(() => ai.requireCompletedProviderResponse({ status: "incomplete", output_text: "{}" })));
  check("fehlender Status bleibt abgelehnt",
    abgelehnt(() => ai.requireCompletedProviderResponse({ output_text: "{}" })));
  check("status=completed bleibt zugelassen",
    ai.requireCompletedProviderResponse({ status: "completed" }).status === "completed");
  check("fuehrende Prosa vor dem Umschlag bleibt verboten",
    abgelehnt(() => ai.parseProviderResponseJson('Hier das Ergebnis: {"status":"completed"}')));
  check("strukturell kaputtes JSON bleibt verboten",
    abgelehnt(() => ai.parseProviderResponseJson('{"status":"completed",')));
  check("gueltiger Umschlag bleibt gueltig",
    ai.parseProviderResponseJson('{"status":"completed","output_text":"{}"}').status === "completed");
  check("ungueltiges Modell-JSON verlaesst die Engstelle als feste Fehlerkategorie",
    (() => { try { ai.parseModelJsonText("kein json"); return false; }
      catch (e) { return e.code === "AI_RESPONSE_INVALID_JSON"; } })());
  check("die Rettung ist fuer gueltiges JSON ein No-op",
    ai.escapeControlCharsInJsonStrings('{"a":"b"}') === '{"a":"b"}');

  // ── §14 ────────────────────────────────────────────────────────────────────────────────
  abschnitt("§14 Nicht stimmige Bilanz ergibt nie success · unbekannt bleibt unbekannt");
  // BELEGTER ANLASS (unabhaengige Pruefung 31.08.): `stimmig` wurde berechnet, aber der
  // Status entschied sich allein an `fehlgeschlagen > 0`. Eine Bilanz, deren vier Zaehler
  // die Arbeitsliste NICHT abdecken — oder bei der die Arbeitsliste ganz fehlte — konnte
  // deshalb `success` werden; `server.js` protokollierte den Widerspruch nur und speicherte
  // den berechneten Status trotzdem. Zusaetzlich machte `bilanz.gespeichert ?? 0` aus einem
  // unbekannten Wert wieder eine gemessene Null.
  const G = (o) => ({ verarbeitet: 0, zusammengefuehrt: 0, duplikate: 0, ausgeschlossen: 0,
    fehlgeschlagen: 0, erneut: 0, unbekannt: 0, ...o });
  const tele = (gruppen, cluster, ergebnisse = {}) => ({ telemetrie: { cluster, gruppen, ergebnisse } });

  // (1) Zaehlersumme ungleich Cluster, MIT gespeicherten Ergebnissen -> partial
  const w1 = laufBilanz(tele(G({ verarbeitet: 5, erneut: 2 }), 99));
  check("(1) Summe != cluster mit gespeicherten ist NICHT success", w1.status !== "success", w1.status);
  check("(1) … sondern partial", w1.status === STATUS.PARTIAL, w1.status);
  check("(1) … Fehlerklasse zaehlerwiderspruch", w1.fehlerklasse === "zaehlerwiderspruch", String(w1.fehlerklasse));
  check("(1) … stimmig meldet false", w1.stimmig === false, String(w1.stimmig));
  check("(1) … die Zaehler selbst bleiben erhalten", w1.gespeichert === 5 && w1.vertagt === 2);

  // (2) Zaehlersumme ungleich Cluster, OHNE gespeicherte Ergebnisse -> failed
  const w2 = laufBilanz(tele(G({ erneut: 5 }), 99));
  check("(2) Summe != cluster ohne gespeicherte ist NICHT success", w2.status !== "success", w2.status);
  check("(2) … sondern failed", w2.status === STATUS.FAILED, w2.status);
  check("(2) … Fehlerklasse zaehlerwiderspruch", w2.fehlerklasse === "zaehlerwiderspruch", String(w2.fehlerklasse));

  // (3) Fehlendes bzw. unbrauchbares Cluster -> nie success
  for (const [name, c] of [["null", null], ["undefined", undefined], ["Text", "viele"], ["negativ", -1]]) {
    const b = laufBilanz(tele(G({ verarbeitet: 5 }), c));
    check(`(3) cluster=${name} ergibt nicht success`, b.status !== "success", b.status);
    check(`(3) cluster=${name} -> telemetrie-unvollstaendig`,
      b.fehlerklasse === "telemetrie-unvollstaendig", String(b.fehlerklasse));
    check(`(3) cluster=${name} -> stimmig ist nicht pruefbar (null)`, b.stimmig === null, String(b.stimmig));
  }
  check("(3) fehlendes cluster ohne gespeicherte Ergebnisse -> failed",
    laufBilanz(tele(G({ erneut: 5 }), null)).status === STATUS.FAILED);

  // (4) Ungueltiger Zaehlerwert -> nicht abrechenbar, fail closed
  for (const [name, wert] of [["Text", "viele"], ["NaN", NaN], ["negativ", -3]]) {
    const b = laufBilanz(tele(G({ verarbeitet: wert }), 5));
    check(`(4) Zaehlerwert ${name} ergibt failed`, b.status === STATUS.FAILED, b.status);
    check(`(4) Zaehlerwert ${name} -> telemetrie-unvollstaendig`,
      b.fehlerklasse === "telemetrie-unvollstaendig", String(b.fehlerklasse));
    check(`(4) Zaehlerwert ${name} -> nicht zaehlbar, alle Zaehler null`,
      b.zaehlbar === false && b.gespeichert === null && b.vertagt === null);
  }
  check("(4) ein FEHLENDER Gruppenwert bleibt zulaessig (keine Mitglieder)",
    laufBilanz(tele({ verarbeitet: 3, erneut: 2 }, 5)).status === STATUS.SUCCESS);

  // (5) Nicht zaehlbare Bilanz -> processed_count bleibt null, nie 0
  const nichtZaehlbar = laufBilanz({ pending: 4, results: [] });
  check("(5) Vorbedingung: Bilanz ist nicht zaehlbar", nichtZaehlbar.zaehlbar === false);
  const zeileUnbekannt = processRunToRelationalRow(sanitizeProcessRun({
    process: "understanding-cron", runId: "t-4", zielmenge: 500,
    processed: nichtZaehlbar.gespeichert,
    gespeichert: nichtZaehlbar.gespeichert, uebersprungen: nichtZaehlbar.uebersprungen,
    fehlgeschlagen: nichtZaehlbar.fehlgeschlagen, deferred: nichtZaehlbar.vertagt,
    status: nichtZaehlbar.status, fehlerklasse: nichtZaehlbar.fehlerklasse
  }));
  check("(5) processed_count bleibt null statt 0", zeileUnbekannt.processed_count === null,
    String(zeileUnbekannt.processed_count));
  check("(5) saved_count bleibt null statt 0", zeileUnbekannt.saved_count === null,
    String(zeileUnbekannt.saved_count));
  check("(5) der Status ist trotzdem gesetzt", zeileUnbekannt.status === "failed", zeileUnbekannt.status);
  check("(5) sanitizeProcessRun macht aus null keine 0",
    sanitizeProcessRun({ process: "p", runId: "t-5", processed: null }).processed === null);
  check("(5) ein WIRKLICH gemessener Nullwert bleibt 0",
    sanitizeProcessRun({ process: "p", runId: "t-6", processed: 0 }).processed === 0);
  check("(5) Quelltextvertrag: der Cron ersetzt unbekannt nicht durch 0",
    !/const processed = bilanz\.gespeichert \?\? 0;/.test(src("server.js"))
    && /const processed = bilanz\.gespeichert;/.test(src("server.js")));

  // (6)(7)(8) Die bisher festgelegte Semantik bleibt unveraendert
  check("(6) korrekte Bilanz ohne Fehler bleibt success",
    laufBilanz(tele(G({ verarbeitet: 20, erneut: 30 }), 50)).status === STATUS.SUCCESS);
  check("(6) korrekte Bilanz MIT Fehler bleibt partial und behaelt ihre Ergebnisklasse",
    (() => { const b = laufBilanz(tele(G({ verarbeitet: 18, fehlgeschlagen: 1, erneut: 32 }), 51),
      { gruppenKarte: ERGEBNISGRUPPEN });
      return b.status === STATUS.PARTIAL; })());
  check("(7) reine Vertagung bleibt success",
    laufBilanz(tele(G({ erneut: 41 }), 41)).status === STATUS.SUCCESS);
  check("(7) … und erzeugt keine Fehlerklasse",
    laufBilanz(tele(G({ erneut: 41 }), 41)).fehlerklasse === null);
  check("(8) ordnungsgemaesser Leerlauf (cluster 0, Summe 0) bleibt blocked",
    laufBilanz(tele(G({}), 0)).status === STATUS.BLOCKED);
  check("(8) skipped bleibt blocked",
    laufBilanz({ skipped: true, reason: "no-pending" }).status === STATUS.BLOCKED);
  // Und die Production-Zeile vom 30.08. bleibt unveraendert partial.
  check("(8) der echte 21:30-Lauf bleibt partial/skipped-error",
    b1.status === STATUS.PARTIAL && b1.fehlerklasse === "skipped-error");

  console.log(`\nErgebnis: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Testlauf abgebrochen:", error && error.stack);
  process.exitCode = 1;
});
