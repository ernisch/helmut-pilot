"use strict";

// ============================================================================
// Understanding-Recovery-AUSFUEHRUNG — DEFAULT DEAKTIVIERT (freigabepflichtig).
// ============================================================================
// Eng begrenzt auf die 6 bestaetigten Allowlist-Vorgaenge. Doppelt gesperrt:
//   (1) Flag HELMUT_RECOVERY_EXECUTE (Default AUS) UND
//   (2) exaktes Bestaetigungstoken (HELMUT_RECOVERY_CONFIRM oder --confirm=...).
// Ohne BEIDES: reiner Plan-Ausdruck (read-only), KEIN Write, KEIN KI-Call.
//
// SICHERHEIT (Stand dieser Vorbereitung): Selbst MIT Flag+Token schreibt dieses
// Skript NICHTS, weil der schreibende/KI-Schritt (understandAndSave) BEWUSST NICHT
// verdrahtet ist — recoverOne meldet dann "write-pfad-nicht-verdrahtet-
// freigabepflichtig". Das Verdrahten dieses Schrittes (Deploy + KI + Prod-Write)
// ist genau der Punkt, der Gruender-Freigabe braucht. Dieses Skript wurde NICHT
// ausgefuehrt.

const storage = require("../lib/helmut/storage");
const recovery = require("../lib/helmut/understanding-recovery");

function readConfirm() {
  if (process.env.HELMUT_RECOVERY_CONFIRM) return process.env.HELMUT_RECOVERY_CONFIRM;
  const arg = process.argv.find((a) => a.startsWith("--confirm="));
  return arg ? arg.split("=").slice(1).join("=") : "";
}

async function main() {
  const enabled = recovery.recoveryExecuteEnabled();
  const confirmed = recovery.recoveryConfirmed(readConfirm());

  if (!storage.v3StoreReady || !storage.v3StoreReady()) {
    console.log(JSON.stringify({ ok: false, executed: false, reason: "V3-Store nicht bereit (SUPABASE_* fehlen)." }));
    return;
  }

  // Read-only: Kandidaten + breiter Rohdok-Pool + complete-KOs -> Plan.
  const pending = await storage.listPendingKnowledgeObjects({ limit: 500 }).catch(() => []);
  const failed = await storage.listFailedKnowledgeObjects({ limit: 200 }).catch(() => []);
  const candidates = [...pending, ...failed];
  const rawDocs = await storage.listRawDocuments({ limit: 8000, days: 120 }).catch(() => []);
  const completeKos = typeof storage.listKnowledgeObjects === "function"
    ? await storage.listKnowledgeObjects({ status: "neu", limit: 2000 }).catch(() => [])
    : [];
  const completeTopicSet = recovery.completeTopicSet(candidates, completeKos);
  const plan = recovery.planRecovery(candidates, rawDocs, { completeTopicSet });

  const header = { ok: true, allowlist: recovery.RECOVERY_ALLOWLIST,
    enabled, confirmed, geschaetzteKiCalls: plan.kiCalls };

  if (!enabled || !confirmed) {
    console.log(JSON.stringify({ ...header, executed: false,
      grund: !enabled ? "HELMUT_RECOVERY_EXECUTE nicht gesetzt (Default AUS) -> kein Write/KI"
                      : "Bestaetigungstoken fehlt/falsch -> kein Write/KI",
      plan: { execute: plan.execute, skip: plan.skip } }, null, 2));
    return;
  }

  // Freigeschaltet+bestaetigt: pro Fall recoverOne. deps.understandAndSave ist
  // ABSICHTLICH NICHT gesetzt -> recoverOne schreibt nichts, sondern meldet
  // "freigabepflichtig". (Nach Freigabe: hier die echten understand+save-Deps
  // verdrahten — dann erst entstehen KI-Calls + Prod-Writes.)
  const deps = { getExisting: (vid) => storage.getKnowledgeObjectByVorgang(vid) };
  const results = [];
  for (const item of plan.execute) {
    results.push(await recovery.recoverOne(item, deps));
  }
  const wrote = results.filter((r) => r.wrote).length;
  console.log(JSON.stringify({ ...header, executed: wrote > 0, geschriebene: wrote,
    ki_calls_tatsaechlich: results.reduce((n, r) => n + (r.aiCalls || 0), 0),
    ergebnisse: results, plan: { skip: plan.skip } }, null, 2));
}

main().catch((e) => { console.error("Recovery-Ausfuehrung-Fehler (kein Write):", e && e.message); process.exit(1); });
