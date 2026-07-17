"use strict";

// ============================================================================
// EINZEL-DOKUMENT-Recovery-Ausführung — DEFAULT DEAKTIVIERT (freigabepflichtig).
// ============================================================================
// Rekonstruiert vg-sozialwohnungen aus GENAU EINEM, per exakter raw_document_id
// geladenen Seed-Dokument. KEINE Anker-/Teilstring-/Themen-/Cluster-Suche.
//
// Ohne Flag+Token: reine, read-only Plan-Vorschau (kein KI, kein Write).
// Mit Flag+Token: genau 1 KI-Call, genau 1 Write (+ zugehörige Links), fail-closed
// bei jeder Vorbedingungsverletzung, Rollback-Kennung im Feld understanding_model.

const storage = require("../lib/helmut/storage");
const understanding = require("../lib/helmut/understanding");
const ai = require("../lib/helmut/ai");
const single = require("../lib/helmut/single-doc-recovery");

const RUNID = String(process.env.HELMUT_SINGLEDOC_RECOVERY_RUNID || "").trim() || `singledoc-${new Date().toISOString().slice(0, 10)}`;

function readConfirm() {
  if (process.env.HELMUT_SINGLEDOC_RECOVERY_CONFIRM) return process.env.HELMUT_SINGLEDOC_RECOVERY_CONFIRM;
  const arg = process.argv.find((a) => a.startsWith("--confirm="));
  return arg ? arg.split("=").slice(1).join("=") : "";
}

// Understand-Deps = produktive Default-Deps, NUR modelName um die Rollback-Kennung
// erweitert (rein additive Metadaten).
function recoveryUnderstandingDeps() {
  const base = understanding.defaultDeps();
  const baseModel = (base && typeof base.modelName === "function" && base.modelName()) || ai.understandingModelName();
  return { ...base, modelName: () => `${baseModel} | recovery:${RUNID}` };
}

function interpret(res) {
  const status = (res && res.status) || "unknown";
  const wrote = status === "saved";
  const aiCalled = ["saved", "skipped-invalid", "skipped-error", "skipped-store"].includes(status);
  return { wrote, aiCalls: aiCalled ? 1 : 0, status, koId: (res && res.id) || null };
}

async function main() {
  const enabled = single.singleDocRecoveryEnabled();
  const confirmed = single.singleDocRecoveryConfirmed(readConfirm());

  if (!storage.v3StoreReady || !storage.v3StoreReady()) {
    console.log(JSON.stringify({ ok: false, executed: false, reason: "V3-Store nicht bereit (SUPABASE_* fehlen)." }));
    return;
  }

  // Genau EIN Vorgang in der Allowlist.
  const vorgangIds = Object.keys(single.SINGLE_DOC_ALLOWLIST);
  if (vorgangIds.length !== 1) {
    console.log(JSON.stringify({ ok: false, executed: false, reason: `Allowlist muss GENAU 1 Vorgang haben (ist ${vorgangIds.length}).` }));
    return;
  }
  const vorgangId = vorgangIds[0];
  const docId = single.allowedDocFor(vorgangId);

  // Rein lesend, EXAKT per id — keine unscharfe Suche.
  const doc = await storage.getRawDocumentById(docId);
  const docs = doc ? [doc] : [];
  const existingKo = await storage.getKnowledgeObjectByVorgang(vorgangId).catch(() => null);
  const docLinks = await storage.listKnowledgeObjectLinksForDoc(docId).catch(() => []);

  const plan = single.planSingleDocRecovery({ vorgangId, docs, existingKo, docLinks });

  const header = {
    ok: true, runId: RUNID, allowlist: single.SINGLE_DOC_ALLOWLIST, enabled, confirmed,
    plan: single.redactPlan(plan),
    snapshot: {
      vorgangId,
      existing_understanding_status: existingKo ? existingKo.understanding_status : null,
      existing_status: existingKo ? existingKo.status : null,
      existing_source_document_count: existingKo ? existingKo.source_document_count : null,
      seed_doc_vorhanden: !!doc,
      seed_doc_fremdlinks: docLinks.filter((l) => l && l.knowledge_object_id !== `ko-${vorgangId}`).length
    }
  };

  if (!enabled || !confirmed || !plan.ok) {
    console.log(JSON.stringify({ ...header, executed: false,
      grund: !plan.ok ? `Plan nicht recoverbar: ${plan.grund}`
                      : !enabled ? "HELMUT_SINGLEDOC_RECOVERY_EXECUTE nicht gesetzt (Default AUS) -> kein Write/KI"
                                 : "Bestätigungstoken fehlt/falsch -> kein Write/KI" }, null, 2));
    return;
  }

  // HARTE Sicherheitsschranke (Defense-in-Depth): genau der Allowlist-Vorgang + exakte Doc-Id.
  if (vorgangId !== "vg-sozialwohnungen" || plan.rawDocId !== docId || plan.docCount !== 1) {
    console.log(JSON.stringify({ ...header, executed: false, grund: "Sicherheitsabbruch: Plan-Invarianten verletzt -> kein Write/KI" }, null, 2));
    return;
  }

  // Freigeschaltet+bestätigt+recoverbar: genau 1 understand+save aus dem EINEN Cluster.
  const uDeps = recoveryUnderstandingDeps();
  const deps = {
    getExisting: (vid) => storage.getKnowledgeObjectByVorgang(vid),
    understandAndSave: async (p) => {
      const res = await understanding.understandOneCluster(p.cluster, uDeps, { vorgangId: p.vorgangId, existing: existingKo });
      return interpret(res);
    }
  };
  const result = await single.recoverSingleDoc(plan, deps);
  console.log(JSON.stringify({ ...header, executed: !!result.wrote, geschriebene: result.wrote ? 1 : 0,
    ki_calls_tatsaechlich: result.aiCalls || 0, ergebnis: result }, null, 2));
}

main().catch((e) => { console.error("Einzel-Dokument-Recovery-Fehler:", e && e.message); process.exit(1); });
