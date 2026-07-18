"use strict";

// ============================================================================
// OP-06 — Terminales Aussortieren des Alt-Rückstands: AUSFÜHRUNG (Default AUS).
// ============================================================================
// Eng begrenzt auf die 34 bestätigten Allowlist-Fälle (27 Rauschen + 7 belegte
// Themen-Duplikate; lib/helmut/pending-terminal.js). Doppelt gesperrt:
//   (1) Flag HELMUT_PENDING_TERMINAL_EXECUTE (Default AUS) UND
//   (2) exaktes Token (HELMUT_PENDING_TERMINAL_CONFIRM oder --confirm=...).
// Ohne BEIDES: reiner Plan- + Snapshot-Ausdruck (read-only), KEIN Write.
// IMMER: 0 KI-Aufrufe, kein Delete. Jeder Write ist ein konditionales PATCH
// auf den Vorstatus mit Rollback-Kennung `aussortiert:<runId>:<vorstatus>`.
//
// Nutzung:
//   node scripts/pending-terminal-aussortieren.js                  # Plan (read-only)
//   HELMUT_PENDING_TERMINAL_EXECUTE=1 node ... --confirm=<TOKEN>   # echter Lauf (freigabepflichtig)

const storage = require("../lib/helmut/storage");
const terminal = require("../lib/helmut/pending-terminal");

const RUNID = String(process.env.HELMUT_PENDING_TERMINAL_RUNID || "").trim()
  || `aus-${new Date().toISOString().slice(0, 10)}`;

function readConfirm() {
  if (process.env.HELMUT_PENDING_TERMINAL_CONFIRM) return process.env.HELMUT_PENDING_TERMINAL_CONFIRM;
  const arg = process.argv.find((a) => a.startsWith("--confirm="));
  return arg ? arg.split("=").slice(1).join("=") : "";
}

async function main() {
  const enabled = terminal.terminalExecuteEnabled();
  const confirmed = terminal.terminalConfirmed(readConfirm());

  if (!storage.v3StoreReady || !storage.v3StoreReady()) {
    console.log(JSON.stringify({ ok: false, executed: false, reason: "V3-Store nicht bereit (SUPABASE_* fehlen)." }));
    return;
  }

  // Read-only: alle status='pending'-KOs (deckt pending UND failed Understanding-
  // Zustaende ab — failed-Faelle behalten status='pending') -> Plan gegen Allowlist.
  const candidates = await storage.listKnowledgeObjects({ status: "pending", limit: 500 }).catch(() => []);
  const plan = terminal.planTerminal(candidates, {});

  // Pre-Snapshot der Zielfaelle (Rollback-Grundlage; nur skalare Metadaten, kein Volltext/PII).
  const byVid = new Map(candidates.map((c) => [c.vorgang_id, c]));
  const snapshot = plan.execute.map((e) => {
    const c = byVid.get(e.vorgangId) || {};
    return { vorgang_id: e.vorgangId, understanding_status: c.understanding_status, status: c.status,
      created_at: c.created_at, grund: e.grund };
  });

  const header = { ok: true, runId: RUNID,
    allowlistGroesse: Object.keys(terminal.TERMINAL_ALLOWLIST).length,
    enabled, confirmed, kiCalls: 0,
    plan: terminal.redactPlan(plan), snapshot };

  if (!enabled || !confirmed) {
    console.log(JSON.stringify({ ...header, executed: false,
      grund: !enabled ? "HELMUT_PENDING_TERMINAL_EXECUTE nicht gesetzt (Default AUS) -> kein Write"
                      : "Bestaetigungstoken fehlt/falsch -> kein Write" }, null, 2));
    return;
  }

  // Freigeschaltet+bestaetigt: je Fall terminalOne mit Laufzeit-Re-Checks.
  const deps = {
    runId: RUNID,
    getExisting: (vid) => storage.getKnowledgeObjectByVorgang(vid),
    markTerminal: (vid, patch) => storage.markPendingUnderstandingTerminal(vid, patch)
  };
  const results = [];
  for (const item of plan.execute) results.push(await terminal.terminalOne(item, deps));
  const wrote = results.filter((r) => r.wrote).length;
  console.log(JSON.stringify({ ...header, executed: wrote > 0, geschriebene: wrote,
    ergebnisse: results }, null, 2));
}

main().catch((e) => { console.error("Aussortieren-Fehler:", e && e.message); process.exit(1); });
