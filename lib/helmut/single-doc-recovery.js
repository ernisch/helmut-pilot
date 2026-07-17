"use strict";

// ============================================================================
// EINZEL-DOKUMENT-Recovery — DEFAULT DEAKTIVIERT (freigabepflichtig).
// ============================================================================
// Rekonstruiert GENAU EIN Wissensobjekt aus GENAU EINEM, per exakter
// raw_document_id fest verdrahteten Seed-Dokument. Bewusst OHNE jede unscharfe
// Zuordnung: KEINE Anker-Token-, Teilstring-, Titel-, Quelldomain- oder
// Themen-Suche, KEIN automatisches Clustering über einen Rohdok-Pool. Das
// Dokument wird ausschließlich per exakter id geladen (storage.getRawDocumentById).
//
// Hintergrund: Der anker­basierte Recovery-Pfad hat für vg-sozialwohnungen über den
// Teilstring „wohnungen" zwei themenfremde Zusatzdokumente eingezogen (3-Themen-
// Digest). Dieser Pfad verhindert das strukturell.
//
// Doppelt gesperrt: (1) Flag HELMUT_SINGLEDOC_RECOVERY_EXECUTE (Default AUS) und
// (2) exaktes Bestätigungstoken. Jede Vorbedingungsverletzung -> fail-closed Abbruch,
// KEIN KI-Call, KEIN Write. Die pure Plan-Logik ist netz-/DB-/KI-frei und testbar.

const understanding = require("./understanding");

// Harte Allowlist: GENAU EIN Vorgang -> GENAU EINE raw_document_id.
const SINGLE_DOC_ALLOWLIST = Object.freeze({
  "vg-sozialwohnungen": "rd-e229f73873e0640fdcf34e65d382b0e10ffb78974fe7eb328048468c94edb48f"
});
const SINGLE_DOC_CONFIRM_TOKEN = "RECOVER_SOZIALWOHNUNGEN_SINGLEDOC";

function singleDocRecoveryEnabled(env = process.env) {
  const v = String((env && env.HELMUT_SINGLEDOC_RECOVERY_EXECUTE) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}
function singleDocRecoveryConfirmed(value) {
  return String(value == null ? "" : value) === SINGLE_DOC_CONFIRM_TOKEN;
}
function allowedDocFor(vorgangId, allowlist = SINGLE_DOC_ALLOWLIST) {
  return Object.prototype.hasOwnProperty.call(allowlist, vorgangId) ? allowlist[vorgangId] : null;
}

// Reine, fail-closed Plan-/Guard-Logik. Erwartet die BEREITS per exakter id geladenen
// Dokumente (Array), das evtl. bestehende KO des Vorgangs und die Links des Seed-Docs.
// Gibt { ok, grund, vorgangId, rawDocId, docCount, cluster } zurück; mutiert nichts.
function planSingleDocRecovery(input = {}, opts = {}) {
  const allowlist = opts.allowlist || SINGLE_DOC_ALLOWLIST;
  const derive = opts.deriveVorgangId || understanding.deriveVorgangId;
  const cluster = opts.clusterRawDocuments || understanding.clusterRawDocuments;
  const vorgangId = input.vorgangId;
  const docs = Array.isArray(input.docs) ? input.docs : [];
  const existingKo = input.existingKo || null;
  const docLinks = Array.isArray(input.docLinks) ? input.docLinks : [];

  const fail = (grund) => ({ ok: false, grund, vorgangId, rawDocId: allowedDocFor(vorgangId, allowlist), docCount: docs.length, cluster: null });

  // (1) Vorgang in der harten Allowlist?
  const expectedDocId = allowedDocFor(vorgangId, allowlist);
  if (!expectedDocId) return fail("vorgang-nicht-in-allowlist");

  // (2) GENAU EIN Dokument (weniger/mehr -> Abbruch).
  if (docs.length !== 1) return fail(docs.length === 0 ? "kein-dokument" : "mehr-als-ein-dokument");

  // (3) Exakte raw_document_id-Prüfung (keine unscharfe Zuordnung).
  const doc = docs[0];
  if (!doc || doc.id !== expectedDocId) return fail("falsche-raw-document-id");

  // (4) Deterministische Zuordnung: das Dokument allein muss GENAU den Vorgang ergeben.
  const clusters = cluster([doc]) || [];
  if (clusters.length !== 1) return fail("zuordnung-nicht-eindeutig");
  if (derive(clusters[0]) !== vorgangId) return fail("abgeleitete-vorgang-id-weicht-ab");

  // (5) Kein bestehendes VOLLSTÄNDIGES KO für denselben Vorgang (Idempotenz/Dedup).
  if (existingKo && existingKo.understanding_status && existingKo.understanding_status !== "pending" && existingKo.understanding_status !== "failed") {
    return fail("complete-ko-existiert");
  }

  // (6) Dokument nicht bereits (unter DIESEM oder einem ANDEREN Vorgang) verarbeitet:
  // exakt id-basiert — jede Verknüpfung zu einem anderen KO als dem Pending-Stub des
  // Vorgangs gilt als bereits-verarbeitet / semantisches Duplikat unter anderer vorgang_id.
  const expectedKoId = `ko-${vorgangId}`;
  const fremdLink = docLinks.find((l) => l && l.knowledge_object_id && l.knowledge_object_id !== expectedKoId);
  if (fremdLink) return fail("dokument-bereits-anderweitig-verknuepft");

  return { ok: true, grund: "recoverbar", vorgangId, rawDocId: expectedDocId, docCount: 1, cluster: clusters[0] };
}

// Datenschutz: Ausgabe enthält NUR ids/Slugs/Zahlen/Klassen — nie Titel/Volltext/PII.
function redactPlan(plan = {}) {
  return { ok: !!plan.ok, grund: plan.grund || null, vorgangId: plan.vorgangId || null,
    rawDocId: plan.rawDocId || null, docCount: Number(plan.docCount) || 0,
    clusterDocs: plan.cluster && Array.isArray(plan.cluster.documents) ? plan.cluster.documents.length : 0 };
}

// Reine Ausführungs-KONTROLLE (Deps injiziert). Laufzeit-Re-Checks (Idempotenz) und
// Delegation des EINZIGEN KI-/Schreibschritts an deps.understandAndSave, der im
// Default-Skript NICHT verdrahtet ist (freigabepflichtig). Schreibt selbst nichts.
async function recoverSingleDoc(plan, deps = {}) {
  if (!plan || !plan.ok) {
    return { vorgangId: plan && plan.vorgangId, wrote: false, aiCalls: 0, skipped: true, grund: (plan && plan.grund) || "kein-plan" };
  }
  const vid = plan.vorgangId;
  const getExisting = deps.getExisting || (async () => null);
  // (Re-Check) Idempotenz unmittelbar vor KI/Write: noch pending/failed?
  const existing = await getExisting(vid);
  if (existing && existing.understanding_status && existing.understanding_status !== "pending" && existing.understanding_status !== "failed") {
    return { vorgangId: vid, wrote: false, aiCalls: 0, skipped: true, grund: "bereits-complete-idempotent" };
  }
  if (typeof deps.understandAndSave !== "function") {
    return { vorgangId: vid, wrote: false, aiCalls: 0, skipped: true, grund: "write-pfad-nicht-verdrahtet-freigabepflichtig" };
  }
  const res = (await deps.understandAndSave(plan)) || {};
  return { vorgangId: vid, wrote: !!res.wrote, aiCalls: Number(res.aiCalls) || 0, skipped: !res.wrote,
    status: res.status || null, koId: res.koId || null, grund: res.wrote ? "geschrieben" : (res.status || "kein-write") };
}

module.exports = {
  SINGLE_DOC_ALLOWLIST, SINGLE_DOC_CONFIRM_TOKEN,
  singleDocRecoveryEnabled, singleDocRecoveryConfirmed, allowedDocFor,
  planSingleDocRecovery, redactPlan, recoverSingleDoc
};
