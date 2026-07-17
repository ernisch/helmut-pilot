"use strict";

// Test der Betriebs-Metadaten-Leser des Admin (Cron-Zeitplan + Watchdog-Zustand).
// Kernpunkt: EHRLICHE Degradation, wenn vercel.json bzw. eine Workflow-Datei in
// Production nicht lesbar/nicht gebundelt ist — Rueckgabe null bzw. { verfuegbar:false },
// niemals ein Absturz und niemals erfundene Werte. KEIN Netz, KEINE KI.
//
// Hintergrund: vercel.json wird per statischem require geladen (von @vercel/nft
// deterministisch ins Bundle getragen); die Workflow-YMLs per fs-Read mit
// includeFiles-Bundling. Beide haben einen ehrlichen Fallback.

const fs = require("fs");
const os = require("os");
const path = require("path");
const root = path.join(__dirname, "..");

process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const handler = require("../server.js");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

check("Test-Hooks exportiert", typeof handler.__readVercelCronSchedule === "function" && typeof handler.__readWorkflowWatchdog === "function");

// --- 1) Cron-Zeitplan: Normalfall (vercel.json via require gebundelt) ---------
const crons = handler.__readVercelCronSchedule();
check("Cron: reale vercel.json-Zeiten geladen (Array mit crawl-Eintrag)",
  Array.isArray(crons) && crons.some((c) => c.path === "/api/cron/crawl" && /\d/.test(c.schedule)));
check("Cron: Felder gekappt/sauber (path<=80, schedule<=40)",
  crons.every((c) => typeof c.path === "string" && c.path.length <= 80 && typeof c.schedule === "string" && c.schedule.length <= 40));

// --- 2) Cron-Zeitplan: Degradation (Datei/Config nicht lesbar) ----------------
check("Cron: config=null (vercel.json nicht lesbar) -> null, kein Absturz", handler.__readVercelCronSchedule(null) === null);
check("Cron: config ohne crons-Array -> null (keine erfundenen Zeiten)", handler.__readVercelCronSchedule({}) === null);
check("Cron: config.crons kein Array -> null", handler.__readVercelCronSchedule({ crons: "kaputt" }) === null);

// --- 3) Watchdog: Normalfall (Workflow-Dateien vorhanden) ---------------------
const briefing = handler.__readWorkflowWatchdog(".github/workflows/briefing-watchdog.yml");
check("Watchdog: briefing-watchdog wird als verfuegbar + aktiv gelesen (echter cron)",
  briefing.verfuegbar === true && briefing.aktiv === true && /\d/.test(String(briefing.zeitplanUtc || "")));
const health = handler.__readWorkflowWatchdog(".github/workflows/health-watch.yml");
check("Watchdog: health-watch ehrlich inaktiv (Zeitplan auskommentiert)",
  health.verfuegbar === true && health.aktiv === false && health.zeitplanUtc === null);

// --- 4) Watchdog: Degradation (Datei nicht lesbar/nicht gebundelt) ------------
const missing = handler.__readWorkflowWatchdog(".github/workflows/gibt-es-nicht.yml");
check("Watchdog: fehlende Datei -> { verfuegbar:false, aktiv:null }, kein Absturz",
  missing.verfuegbar === false && missing.aktiv === null && missing.zeitplanUtc === null);

// --- 5) Robustheit: leere/kommentar-nur Datei -> aktiv:false, kein Wurf -------
const tmp = path.join(os.tmpdir(), `helmut-wd-${process.pid}.yml`);
try {
  fs.writeFileSync(tmp, "# nur ein Kommentar\n# cron: '0 0 * * *'\nname: test\n");
  const relTmp = path.relative(root, tmp);
  const commented = handler.__readWorkflowWatchdog(relTmp);
  check("Watchdog: nur auskommentierter cron -> aktiv:false (kein Fehlalarm)",
    commented.verfuegbar === true && commented.aktiv === false);
} finally {
  try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
}

// --- 6) includeFiles-Beleg: vercel.json bundelt die zwei referenzierten YMLs --
try {
  const vc = require(path.join(root, "vercel.json"));
  const inc = vc.functions && vc.functions["api/index.js"] && vc.functions["api/index.js"].includeFiles;
  check("Bundling: vercel.json deklariert includeFiles fuer die Watchdog-YMLs",
    typeof inc === "string" && inc.includes(".github/workflows/") && inc.includes("briefing-watchdog") && inc.includes("health-watch"));
} catch (e) {
  check("Bundling: vercel.json lesbar", false, String(e && e.message));
}

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Betriebsmetadaten-Assertions`);
process.exit(failed > 0 ? 1 : 0);
