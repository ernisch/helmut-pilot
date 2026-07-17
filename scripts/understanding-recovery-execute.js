"use strict";

// ============================================================================
// Understanding-Recovery-AUSFUEHRUNG — DEFAULT DEAKTIVIERT (freigabepflichtig).
// ============================================================================
// Eng begrenzt auf die 6 bestaetigten Allowlist-Vorgaenge. Doppelt gesperrt:
//   (1) Flag HELMUT_RECOVERY_EXECUTE (Default AUS) UND
//   (2) exaktes Bestaetigungstoken (HELMUT_RECOVERY_CONFIRM oder --confirm=...).
// Ohne BEIDES: reiner Plan- + Snapshot-Ausdruck (read-only), KEIN Write, KEIN KI-Call.
//
// MIT Flag+Token: fuehrt fuer die geplanten Faelle den EXAKT bestehenden, taeglich
// erprobten Understand+Save-Pfad aus (understanding.understandOneCluster) — mit
// (a) breitem Rohdok-Fenster, damit die Seed-Dokumente vom 02./03.07. gefunden werden,
// (b) Rollback-Kennung im Metadatenfeld understanding_model ("... | recovery:<RUNID>"),
// (c) Idempotenz (bereits complete -> skip), (d) hartem Allowlist-Scope.
// Kosten: 1 KI-Call pro Fall (Budget wird pro Fall via canSpend geprueft).

const storage = require("../lib/helmut/storage");
const understanding = require("../lib/helmut/understanding");
const ai = require("../lib/helmut/ai");
const recovery = require("../lib/helmut/understanding-recovery");

const RUNID = String(process.env.HELMUT_RECOVERY_RUNID || "").trim() || `rec-${new Date().toISOString().slice(0, 10)}`;

function readConfirm() {
  if (process.env.HELMUT_RECOVERY_CONFIRM) return process.env.HELMUT_RECOVERY_CONFIRM;
  const arg = process.argv.find((a) => a.startsWith("--confirm="));
  return arg ? arg.split("=").slice(1).join("=") : "";
}

// Understand-Deps = die produktiven Default-Deps, NUR modelName um die Rollback-
// Kennung erweitert (rein additive Metadaten; understanding_model wird nirgends
// strikt geparst, nur gespeichert/angezeigt).
function recoveryUnderstandingDeps() {
  const base = understanding.defaultDeps();
  const baseModel = (base && typeof base.modelName === "function" && base.modelName()) || ai.understandingModelName();
  return { ...base, modelName: () => `${baseModel} | recovery:${RUNID}` };
}

// Normalisiert das understandOneCluster-Ergebnis auf {wrote, aiCalls, status, koId}.
function interpret(res) {
  const status = (res && res.status) || "unknown";
  const wrote = status === "saved";
  const aiCalled = ["saved", "skipped-invalid", "skipped-error", "skipped-store"].includes(status);
  return { wrote, aiCalls: aiCalled ? 1 : 0, status, koId: (res && res.id) || null };
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

  const candByVid = new Map(candidates.map((c) => [c.vorgang_id, c]));
  // Read-only Snapshot der geplanten Zielfaelle (Pre-State fuer Rollback; nur skalare
  // Metadaten, kein Volltext/PII).
  const snapshot = plan.execute.map((e) => {
    const c = candByVid.get(e.vorgangId) || {};
    return { vorgang_id: e.vorgangId, understanding_status: c.understanding_status, status: c.status,
      source_document_count: c.source_document_count, created_at: c.created_at, docCount: e.docCount };
  });

  const header = { ok: true, runId: RUNID, allowlist: recovery.RECOVERY_ALLOWLIST,
    enabled, confirmed, geschaetzteKiCalls: plan.kiCalls,
    plan: { execute: plan.execute.map((e) => ({ vorgangId: e.vorgangId, klasse: e.klasse, docCount: e.docCount })), skip: plan.skip },
    snapshot };

  if (!enabled || !confirmed) {
    console.log(JSON.stringify({ ...header, executed: false,
      grund: !enabled ? "HELMUT_RECOVERY_EXECUTE nicht gesetzt (Default AUS) -> kein Write/KI"
                      : "Bestaetigungstoken fehlt/falsch -> kein Write/KI" }, null, 2));
    return;
  }

  // Freigeschaltet+bestaetigt: pro Fall recoverOne mit dem echten Understand+Save-Pfad.
  const uDeps = recoveryUnderstandingDeps();
  const deps = {
    getExisting: (vid) => storage.getKnowledgeObjectByVorgang(vid),
    understandAndSave: async (planItem) => {
      const cand = candByVid.get(planItem.vorgangId);
      const cluster = recovery.reconstructCluster(cand, rawDocs);
      if (!cluster) return { wrote: false, aiCalls: 0, status: "no-cluster", koId: null };
      const res = await understanding.understandOneCluster(cluster, uDeps, { vorgangId: planItem.vorgangId, existing: cand });
      return interpret(res);
    }
  };

  const results = [];
  for (const item of plan.execute) results.push(await recovery.recoverOne(item, deps));
  const wrote = results.filter((r) => r.wrote).length;
  const aiCalls = results.reduce((n, r) => n + (r.aiCalls || 0), 0);
  console.log(JSON.stringify({ ...header, executed: wrote > 0, geschriebene: wrote,
    ki_calls_tatsaechlich: aiCalls, ergebnisse: results }, null, 2));
}

main().catch((e) => { console.error("Recovery-Ausfuehrung-Fehler:", e && e.message); process.exit(1); });
