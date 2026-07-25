"use strict";

// Offline-Tests fuer das terminale Aussortieren des Alt-Rueckstands (OP-06):
// Allowlist-Integritaet, doppelte Sperre, Plan-/Ausfuehrungslogik, Idempotenz,
// "nie wieder"-Garantie (failed-final) im Pending-Filter und in
// understandOneCluster, Rollback-Kennung, Datenschutz der Berichte. KEIN Netz.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const terminal = require("../lib/helmut/pending-terminal");
const understanding = require("../lib/helmut/understanding");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── 1 · Terminal-Praedikat ───────────────────────────────────────────────────
check("failed-final ist terminal", terminal.isTerminalUnderstandingStatus("failed-final"));
for (const s of ["failed", "pending", "complete", "", null, undefined]) {
  check(`'${s}' ist NICHT terminal`, !terminal.isTerminalUnderstandingStatus(s));
}

// ── 2 · Allowlist-Integritaet (exakt die 34 bestaetigten Faelle) ─────────────
const ids = Object.keys(terminal.TERMINAL_ALLOWLIST);
check("Allowlist hat exakt 34 Faelle", ids.length === 34, `ist ${ids.length}`);
check("Allowlist: 27x rauschen", ids.filter((i) => terminal.TERMINAL_ALLOWLIST[i].grund === "rauschen").length === 27);
check("Allowlist: 7x duplikat", ids.filter((i) => terminal.TERMINAL_ALLOWLIST[i].grund === "duplikat").length === 7);
check("Allowlist: alle ids mit vg-Praefix", ids.every((i) => i.startsWith("vg-")));
check("Allowlist ist eingefroren", Object.isFrozen(terminal.TERMINAL_ALLOWLIST));
// Die Recovery-Kandidaten und manuellen/frischen Faelle duerfen NIE enthalten sein.
for (const geschuetzt of ["vg-arbeitsverträge", "vg-medikamenten", "vg-steuerstrafrecht", "vg-umstellungen",
  "vg-krankschreibung", "vg-privatsieren", "vg-sozialwohnungen", "vg-wissenschafts",
  "vg-unterhaltsvorschuss", "vg-45975d00f663a2ec163778de"]) {
  check(`Allowlist enthaelt NICHT ${geschuetzt}`, !(geschuetzt in terminal.TERMINAL_ALLOWLIST));
}
for (const erwartet of ["vg-psychotherapie", "vg-gesetzentwurf", "vg-forschung",
  "vg-b2e2e8f9490af875f9f4c4aa", "vg-0fb6ee1e45ecdc3163012b9e", "vg-achtelfinale"]) {
  check(`Allowlist enthaelt ${erwartet}`, erwartet in terminal.TERMINAL_ALLOWLIST);
}

// ── 3 · Doppelte Sperre ──────────────────────────────────────────────────────
check("Flag Default AUS", !terminal.terminalExecuteEnabled({}));
check("Flag leer/0/off bleibt AUS", ["", "0", "off", "no"].every((v) => !terminal.terminalExecuteEnabled({ HELMUT_PENDING_TERMINAL_EXECUTE: v })));
check("Flag 1/true/on schaltet ein", ["1", "true", "on"].every((v) => terminal.terminalExecuteEnabled({ HELMUT_PENDING_TERMINAL_EXECUTE: v })));
check("Token: nur exakter Wert", terminal.terminalConfirmed("AUSSORTIEREN_34_BESTAETIGT")
  && !terminal.terminalConfirmed("aussortieren_34_bestaetigt")
  && !terminal.terminalConfirmed("AUSSORTIEREN_34_BESTAETIGT ")
  && !terminal.terminalConfirmed(""));

// ── 4 · planTerminal ─────────────────────────────────────────────────────────
const kandidaten = [
  { vorgang_id: "vg-achtelfinale", understanding_status: "pending", status: "pending" },
  { vorgang_id: "vg-gesetzentwurf", understanding_status: "failed", status: "pending" },
  { vorgang_id: "vg-psychotherapie", understanding_status: "complete", status: "neu" },      // inzwischen complete -> NIE anfassen
  { vorgang_id: "vg-forschung", understanding_status: "failed-final", status: "pending" },    // bereits terminal -> idempotent skip
  { vorgang_id: "vg-arbeitsverträge", understanding_status: "pending", status: "pending" }    // NICHT in Allowlist -> ignorieren
];
const plan = terminal.planTerminal(kandidaten, {});
check("Plan: pending-Rauschen wird ausgefuehrt", plan.execute.some((e) => e.vorgangId === "vg-achtelfinale" && e.vorherigerStatus === "pending"));
check("Plan: failed-Duplikat wird ausgefuehrt", plan.execute.some((e) => e.vorgangId === "vg-gesetzentwurf" && e.vorherigerStatus === "failed"));
check("Plan: complete wird uebersprungen (nicht-mehr-offen)", plan.skip.some((s) => s.vorgangId === "vg-psychotherapie" && s.grund === "nicht-mehr-offen"));
check("Plan: terminal wird uebersprungen (idempotent)", plan.skip.some((s) => s.vorgangId === "vg-forschung" && s.grund === "bereits-terminal-idempotent"));
check("Plan: fehlende Allowlist-Faelle als nicht-gefunden", plan.skip.filter((s) => s.grund === "nicht-gefunden").length === 34 - 4);
check("Plan: Nicht-Allowlist-Kandidat taucht nirgends auf",
  !plan.execute.some((e) => e.vorgangId === "vg-arbeitsverträge") && !plan.skip.some((s) => s.vorgangId === "vg-arbeitsverträge"));
check("Plan: 0 KI-Calls", plan.kiCalls === 0);
check("Plan mutiert Kandidaten nicht", kandidaten[0].understanding_status === "pending" && !("grund" in kandidaten[0]));

// ── 5 · Rollback-Kennung ─────────────────────────────────────────────────────
check("Marker traegt runId und Vorstatus", terminal.terminalMarker("aus-123", "failed") === "aussortiert:aus-123:failed");
check("Marker-Default: pending", terminal.terminalMarker("aus-123", "irgendwas") === "aussortiert:aus-123:pending");
const langesModell = "m".repeat(200);
const modelWert = terminal.terminalModelValue(langesModell, terminal.terminalMarker("aus-999", "pending"));
check("understanding_model max 120 Zeichen", modelWert.length <= 120, `ist ${modelWert.length}`);
check("Marker bleibt trotz Kappung vollstaendig", modelWert.endsWith("aussortiert:aus-999:pending"));
check("Modellname bleibt als Praefix erhalten", terminal.terminalModelValue("gpt-5-mini", "aussortiert:aus-1:pending") === "gpt-5-mini | aussortiert:aus-1:pending");

// ── 6 · terminalOne (Deps injiziert, Re-Checks) ──────────────────────────────
(async () => {
  let writes = [];
  const mkDeps = (existing) => ({
    runId: "aus-t",
    getExisting: async () => existing,
    markTerminal: async (vid, patch) => { writes.push({ vid, patch }); return { ok: true, updated: 1 }; }
  });

  // complete -> NIE schreiben
  writes = [];
  let r = await terminal.terminalOne({ vorgangId: "vg-x", vorherigerStatus: "pending" },
    mkDeps({ vorgang_id: "vg-x", understanding_status: "complete" }));
  check("terminalOne: complete wird nie geschrieben", r.skipped && !writes.length && r.grund === "status-veraendert-seit-planung");

  // bereits terminal -> idempotenter Skip, kein Write
  writes = [];
  r = await terminal.terminalOne({ vorgangId: "vg-x", vorherigerStatus: "pending" },
    mkDeps({ vorgang_id: "vg-x", understanding_status: "failed-final" }));
  check("terminalOne: bereits terminal = idempotent, kein Write", r.skipped && r.done && !writes.length);

  // Fall verschwunden -> Skip
  r = await terminal.terminalOne({ vorgangId: "vg-x", vorherigerStatus: "pending" }, mkDeps(null));
  check("terminalOne: nicht-gefunden wird uebersprungen", r.skipped && r.grund === "nicht-gefunden");

  // Happy Path pending: konditionaler Write mit Marker
  writes = [];
  r = await terminal.terminalOne({ vorgangId: "vg-achtelfinale", vorherigerStatus: "pending" },
    mkDeps({ vorgang_id: "vg-achtelfinale", understanding_status: "pending", understanding_model: "gpt-5-mini" }));
  check("terminalOne: pending wird geschrieben", r.wrote && writes.length === 1);
  check("terminalOne: Write ist auf Vorstatus konditioniert", writes[0] && writes[0].patch.vonStatus === "pending");
  check("terminalOne: Marker im understanding_model", writes[0] && /\| aussortiert:aus-t:pending$/.test(writes[0].patch.understanding_model));

  // Happy Path failed
  writes = [];
  r = await terminal.terminalOne({ vorgangId: "vg-gesetzentwurf", vorherigerStatus: "failed" },
    mkDeps({ vorgang_id: "vg-gesetzentwurf", understanding_status: "failed", understanding_model: "gpt-5-mini" }));
  check("terminalOne: failed wird geschrieben (Vorstatus failed)", r.wrote && writes[0].patch.vonStatus === "failed"
    && /aussortiert:aus-t:failed$/.test(writes[0].patch.understanding_model));

  // Write-Pfad nicht verdrahtet -> kein Fehler, kein Write
  r = await terminal.terminalOne({ vorgangId: "vg-x", vorherigerStatus: "pending" },
    { getExisting: async () => ({ understanding_status: "pending" }) });
  check("terminalOne: ohne markTerminal kein Write", r.skipped && r.grund === "write-pfad-nicht-verdrahtet");

  // 0 betroffene Zeilen (Race) -> ehrlich als wirkungslos gemeldet
  r = await terminal.terminalOne({ vorgangId: "vg-x", vorherigerStatus: "pending" },
    { runId: "aus-t", getExisting: async () => ({ understanding_status: "pending" }), markTerminal: async () => ({ ok: true, updated: 0 }) });
  check("terminalOne: 0 Zeilen = kein wrote", !r.wrote && r.grund === "write-wirkungslos");

  // ── 7 · "nie wieder"-Garantie in understandOneCluster ──────────────────────
  const boom = () => { throw new Error("darf-nicht-aufgerufen-werden"); };
  const res = await understanding.understandOneCluster(
    { documents: [{ id: "d1", title: "Test" }] },
    { canSpend: boom, requestUnderstanding: boom, getExisting: boom, modelName: () => "m", logSkip: () => {} },
    { vorgangId: "vg-forschung", existing: { status: "pending", understanding_status: "failed-final" } }
  );
  check("understandOneCluster: failed-final -> skipped-terminal ohne KI/Budget", res && res.status === "skipped-terminal");

  // ── 8 · Verdrahtung (Quelltext-Zusicherungen) ──────────────────────────────
  const storageSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
  check("storage: Pending-Filter schliesst Terminal-Status aus",
    /listPendingKnowledgeObjects[\s\S]{0,400}isTerminalUnderstandingStatus/.test(storageSrc));
  check("storage: markPendingUnderstandingTerminal exportiert",
    /markPendingUnderstandingTerminal/.test(storageSrc) && /understanding_status=eq\.\$\{prev\}/.test(storageSrc));
  const scriptSrc = fs.readFileSync(path.join(__dirname, "pending-terminal-aussortieren.js"), "utf8");
  check("Skript: doppelt gesperrt (Flag UND Token)", /terminalExecuteEnabled\(\)/.test(scriptSrc) && /terminalConfirmed\(/.test(scriptSrc)
    && /!enabled \|\| !confirmed/.test(scriptSrc));
  const wfPath = path.join(__dirname, "..", ".github", "workflows", "pending-terminal-aussortieren.yml");
  const wfSrc = fs.readFileSync(wfPath, "utf8");
  check("Workflow: nur workflow_dispatch", /workflow_dispatch:/.test(wfSrc) && !/\n\s*schedule:/.test(wfSrc) && !/\n\s*push:/.test(wfSrc));
  check("Workflow: Schritt B nur mit exaktem Token", /confirm_text == 'AUSSORTIEREN_34_BESTAETIGT'/.test(wfSrc));

  // ── 9 · Skript-Default-Sperre (echter Prozess, ohne Store-Env inert) ───────
  const run = spawnSync(process.execPath, [path.join(__dirname, "pending-terminal-aussortieren.js")], {
    env: { ...process.env, HELMUT_V3_STORE: "", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
      HELMUT_PENDING_TERMINAL_EXECUTE: "", HELMUT_PENDING_TERMINAL_CONFIRM: "" },
    encoding: "utf8", timeout: 30000
  });
  check("Skript ohne Store-Env: inert, kein Crash", run.status === 0 && /V3-Store nicht bereit/.test(run.stdout || ""));

  // ── 10 · Datenschutz der Berichte ──────────────────────────────────────────
  const redacted = terminal.redactPlan(plan);
  const serial = JSON.stringify(redacted);
  check("Bericht: nur Slugs/Zahlen/Klassen (kein beleg/headline)", !/beleg|headline|title/i.test(serial));
  check("Bericht: execute-Felder minimal", redacted.execute.every((e) => Object.keys(e).sort().join(",") === "grund,vorgangId,vorherigerStatus"));

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed) process.exit(1);
})().catch((e) => { console.error("Testfehler:", e); process.exit(1); });
