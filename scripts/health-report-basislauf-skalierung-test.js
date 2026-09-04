"use strict";

// N1 — Regressionstest: Health-Report-Basislauf bei vielen Mandaten
// (adversarialer Merge-Review des Incident-2026-07-25-Fixes, Fund P2-1).
// ============================================================================
// BEFUND: server.js waehlte den Health-Report-Basislauf ueber
//   listCrawlRuns(10).find(r => !isReducedRun(r))
// aus einem GLOBALEN, mandantenuebergreifenden crawlRuns-Array (neuestes zuerst).
// Pro Cron-Durchlauf ist GENAU EIN Lauf nicht reduziert — das zuerst verarbeitete
// Mandat (sein sharedFetchLedger ist noch leer) — und das ist zugleich der
// AELTESTE Lauf des Batches. Ab MEHR ALS 10 aktiven Mandaten in einem Durchlauf
// fiel dieser einzige gesunde Lauf aus dem 10er-Fenster: find() lieferte
// undefined, der Report fiel auf einen reduzierten Lauf zurueck (successfulSources
// weit unter dem Watchdog-Minimum) und meldete faelschlich "Teilweise gestoert" —
// exakt der Fehlalarm, den der Incident-Fix beseitigen sollte.
//
// FIX (N1, minimal):
//   - server.js: listCrawlRuns(10) -> listCrawlRuns(20), angeglichen an die drei
//     anderen bestehenden Aufrufstellen (scheduler.js, server.js an zwei weiteren
//     Stellen) und an die crawlRuns-Aufbewahrung (storage.js).
//   - storage.js (saveCrawlRun): der Retention-Schnitt war hart auf 20 kodiert und
//     lief damit dem bereits existierenden, dokumentierten Schalter
//     HELMUT_CRAWL_RUN_RETENTION vollstaendig zuvor (das Environment-Feld war
//     wirkungslos jenseits von 20). Jetzt an die Aufbewahrung angeglichen.
//
// Diese Suite belegt beides direkt gegen den ECHTEN lokalen Dateispeicher
// (kein Netz, keine Supabase, kein Mock der Storage-Funktionen selbst).

process.env.HELMUT_STORAGE_BACKEND = "local";
delete process.env.SUPABASE_URL;
// AKTUALISIERT 04.09.2026 (SR §38): Frueher war die Aufbewahrung eine Modulkonstante
// in storage.js und MUSSTE deshalb vor dem ersten require stehen. Seit dem
// crawlRuns-Vorfall wird sie pro Aufruf aus der Umgebung gelesen
// (lib/helmut/speicherpfad-vorflug.js); die Setzung hier bleibt trotzdem an dieser
// Stelle, weil sie fuer den ganzen Prozess gelten soll. Sie muss >= dem Lesefenster
// (20) liegen, sonst gilt sie als ungueltig und wird nirgends angewendet.
process.env.HELMUT_CRAWL_RUN_RETENTION = "30";

const fs = require("fs");
const path = require("path");

const storage = require("../lib/helmut/storage");
const { saveCrawlRun, listCrawlRuns } = storage;
const { isReducedRun } = require("../lib/helmut/rolling-health");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// Bestehenden Store sichern und am Ende byte-genau wiederherstellen (Konvention
// aus compact-store-roundtrip-test.js), damit uebrige Offline-Suiten unberuehrt
// bleiben.
const dataDir = path.join(__dirname, "..", ".helmut-data");
const storeFile = path.join(dataDir, "store.json");
const backup = fs.existsSync(storeFile) ? fs.readFileSync(storeFile, "utf8") : null;

// Sauberer Ausgangszustand: kein Store -> readLocalStore liefert defaultStore()
// mit crawlRuns=[] (storage.js:10-16). So ist die Einfuegereihenfolge unten exakt
// vorhersagbar, unabhaengig von Alt-Daten aus fruehreren lokalen Laeufen.
if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);

// Ein Mandat-Lauf: das ERSTE verarbeitete Mandat eines Cron-Durchlaufs holt alle
// geteilten Wege selbst (sharedSkippedSources=0, NICHT reduziert). Alle
// Folge-Mandate ueberspringen die geteilten Wege (sharedSkippedSources=138,
// reduziert) — exakt das Muster aus dem Incident-Fix.
const nonReducedRun = (runId) => ({ runId, mode: "full", checkedSources: 144, successfulSources: 145, failedSources: 0, sharedSkippedSources: 0 });
const reducedRun = (runId) => ({ runId, mode: "full", checkedSources: 144, successfulSources: 6, failedSources: 0, sharedSkippedSources: 138 });

(async () => {
  try {
    // ── Regression 1 (server.js-Haelfte von N1): 15-Mandaten-Cron-Durchlauf ────
    // Mandat 1 (nicht reduziert) wird ZUERST gespeichert -> landet nach 15
    // Speicherungen (Prepend-Reihenfolge) am ENDE des Batches, Index 14.
    await saveCrawlRun(nonReducedRun("mandat-1-gesund"));
    for (let i = 2; i <= 15; i += 1) {
      await saveCrawlRun(reducedRun(`mandat-${i}-reduziert`));
    }

    const oldWindow = await listCrawlRuns(10);   // der ALTE, fehlerhafte Aufruf
    const newWindow = await listCrawlRuns(20);   // der NEUE, in server.js verwendete Aufruf

    check("15-Mandaten-Batch: alle 15 Laeufe wurden gespeichert (kein vorzeitiger Cut)",
      newWindow.length >= 15, `newWindow.length=${newWindow.length}`);

    const foundInOldWindow = oldWindow.find((r) => !isReducedRun(r));
    check("Regressions-Beleg: mit dem ALTEN 10er-Fenster faellt der gesunde Lauf HERAUS (Bug reproduziert)",
      foundInOldWindow === undefined, JSON.stringify(foundInOldWindow));

    const foundInNewWindow = newWindow.find((r) => !isReducedRun(r));
    check("Fix wirkt: mit dem NEUEN 20er-Fenster wird der gesunde Basislauf gefunden",
      foundInNewWindow && foundInNewWindow.runId === "mandat-1-gesund", JSON.stringify(foundInNewWindow));

    // ── Regression 2 (storage.js-Haelfte von N1): HELMUT_CRAWL_RUN_RETENTION ───
    // wirkt jetzt tatsaechlich ueber den vorher hart kodierten 20er-Schnitt hinaus.
    // Batch ist mit 15 Laeufen bereits gefuellt; weitere 15 fuellen auf > 20 auf.
    for (let i = 16; i <= 30; i += 1) {
      await saveCrawlRun(reducedRun(`mandat-${i}-reduziert`));
    }
    const afterThirty = await listCrawlRuns(30);
    check("HELMUT_CRAWL_RUN_RETENTION=30 wird von saveCrawlRun jetzt tatsaechlich eingehalten (>20 Laeufe erhalten)",
      afterThirty.length === 30, `afterThirty.length=${afterThirty.length}`);
    const stillFound = afterThirty.find((r) => !isReducedRun(r));
    check("gesunder Basislauf bleibt auch nach Auffuellen auf die volle Retention auffindbar",
      stillFound && stillFound.runId === "mandat-1-gesund", JSON.stringify(stillFound));
  } finally {
    if (backup != null) fs.writeFileSync(storeFile, backup);
    else if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
  }

  console.log(`\n${passed}/${passed + failed} Health-Report-Basislauf-Skalierungs-Assertions erfolgreich.`);
  if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
})().catch((error) => {
  console.error(error);
  if (backup != null) fs.writeFileSync(storeFile, backup);
  else if (fs.existsSync(storeFile)) fs.unlinkSync(storeFile);
  process.exit(1);
});
