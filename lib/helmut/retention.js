"use strict";

// Datenschutz — Aufbewahrung & Löschung (Retention) für raw_documents/knowledge_objects.
// ============================================================================
// Der Audit (R11) belegt: raw_documents und knowledge_objects werden HEUTE
// UNBEGRENZT gespeichert (kein Archiv/Purge). Dieses Modul liefert die technische
// Grundlage für eine DSGVO-konforme Aufbewahrung: eine reine, testbare
// Retention-PLANUNG + einen gated Executor (Default TROCKENLAUF, freigabepflichtig).
//
// REFERENZIELLE INTEGRITÄT (kritisch): ko_document_links referenziert
// raw_documents ON DELETE CASCADE. Ein raw_document zu löschen, das noch an ein
// BEHALTENES knowledge_object gebunden ist, würde die Provenienz dieses KOs still
// verwaisen. Deshalb enforced die PLANUNG (App-Ebene): ein raw_document ist nur
// löschbar, wenn es überaltert ist UND an KEIN behaltenes KO gebunden ist.
//
// DSGVO: politische Analyse (knowledge_objects) ist nach Art. 9 besonders
// schutzbedürftig — die Aufbewahrungsempfehlung ist bewusst konservativ und
// juristisch freizugeben (siehe docs/recht/datenschutz-folgenabschaetzung-vorpruefung.md).

// Datenklassen-Matrix (maschinenlesbar; die menschenlesbare Fassung + Begründung
// steht in docs/betrieb/aufbewahrung-loeschung.md). retentionDays = EMPFEHLUNG
// (Gründer-/Rechtsfreigabe erforderlich), null = keine automatische Löschung.
const DATA_CLASSES = {
  raw_documents:        { klasse: "quellen-inhalt-minimiert", art9: false, retentionDays: 180, loeschung: "purge-wenn-nicht-referenziert" },
  knowledge_objects:    { klasse: "politische-analyse", art9: true, retentionDays: 365, loeschung: "purge-kaskade" },
  ko_document_links:    { klasse: "provenienz-ableitung", art9: false, retentionDays: null, loeschung: "kaskade-mit-parent" },
  document_findings:    { klasse: "provenienz-ableitung", art9: false, retentionDays: null, loeschung: "kaskade-mit-parent" },
  source_crawl_telemetry: { klasse: "technische-telemetrie", art9: false, retentionDays: 90, loeschung: "purge-nach-alter" },
  gate_shadow_events:   { klasse: "technische-telemetrie", art9: false, retentionDays: 90, loeschung: "purge-nach-alter" },
  crawl_runs:           { klasse: "technische-telemetrie", art9: false, retentionDays: 180, loeschung: "purge-nach-alter" },
  systemErrors:         { klasse: "technische-fehler-metadaten", art9: false, retentionDays: 90, loeschung: "ring-gedeckelt" },
  processRuns:          { klasse: "technische-telemetrie", art9: false, retentionDays: 90, loeschung: "ring-gedeckelt" },
  llmUsage:             { klasse: "kosten-audit", art9: false, retentionDays: 365, loeschung: "ring-gedeckelt" },
  briefings:            { klasse: "nutzer-ausgabe", art9: true, retentionDays: 90, loeschung: "nutzergebunden-loeschbar" }
};

function ageDays(iso, nowMs) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 86400000;
}

// Reine Retention-Planung. Eingaben sind bereits geladene, MINIMIERTE Metadaten
// (id/created_at + Verknüpfungen) — KEIN Volltext nötig. Liefert den Löschplan +
// den Bericht über betroffene Datensätze + eine Integritätszusicherung.
function planRetention(input = {}) {
  const nowMs = Number(input.nowMs) || Date.parse(input.now || "") || 0;
  const rawRetentionDays = Number.isFinite(input.rawRetentionDays) ? input.rawRetentionDays : DATA_CLASSES.raw_documents.retentionDays;
  const koRetentionDays = Number.isFinite(input.koRetentionDays) ? input.koRetentionDays : DATA_CLASSES.knowledge_objects.retentionDays;

  const rawDocuments = Array.isArray(input.rawDocuments) ? input.rawDocuments : [];
  const knowledgeObjects = Array.isArray(input.knowledgeObjects) ? input.knowledgeObjects : [];
  // Verknüpfung raw_document_id -> [knowledge_object_id]
  const links = Array.isArray(input.koDocumentLinks) ? input.koDocumentLinks : [];

  // 1) KOs, die überaltert sind -> löschbar (Kaskade räumt Links/Findings ab).
  const koDeleteSet = new Set(
    knowledgeObjects
      .filter((k) => { const a = ageDays(k.created_at, nowMs); return a != null && a > koRetentionDays; })
      .map((k) => k.id)
  );
  const koKeepSet = new Set(knowledgeObjects.filter((k) => !koDeleteSet.has(k.id)).map((k) => k.id));

  // raw_document_id -> Set der verknüpften KO-IDs
  const linkedKosByRaw = new Map();
  for (const l of links) {
    const rid = l.raw_document_id, kid = l.knowledge_object_id;
    if (!rid) continue;
    if (!linkedKosByRaw.has(rid)) linkedKosByRaw.set(rid, new Set());
    if (kid) linkedKosByRaw.get(rid).add(kid);
  }

  // 2) raw_documents: überaltert UND an KEIN BEHALTENES KO gebunden.
  const rawToDelete = [];
  const rawBlockedByKeepReference = [];
  for (const d of rawDocuments) {
    const a = ageDays(d.created_at, nowMs);
    if (a == null || a <= rawRetentionDays) continue;
    const linkedKos = linkedKosByRaw.get(d.id) || new Set();
    const referencedByKept = [...linkedKos].some((kid) => koKeepSet.has(kid));
    if (referencedByKept) { rawBlockedByKeepReference.push(d.id); continue; } // Integritäts-Schutz
    rawToDelete.push(d.id);
  }

  const koToDelete = [...koDeleteSet];

  return {
    rawRetentionDays, koRetentionDays,
    rawToDelete, koToDelete,
    rawBlockedByKeepReference,
    // Bericht über betroffene Datensätze:
    report: {
      rawDocumentsTotal: rawDocuments.length,
      knowledgeObjectsTotal: knowledgeObjects.length,
      rawToDelete: rawToDelete.length,
      koToDelete: koToDelete.length,
      rawBlockedByKeepReference: rawBlockedByKeepReference.length
    },
    // Integritätszusicherung: KEIN zu löschendes raw_document ist an ein behaltenes KO gebunden.
    integrityOk: rawToDelete.every((rid) => {
      const linkedKos = linkedKosByRaw.get(rid) || new Set();
      return ![...linkedKos].some((kid) => koKeepSet.has(kid));
    })
  };
}

function retentionExecuteEnabled(env = process.env) {
  const v = String((env && env.HELMUT_RETENTION_EXECUTE) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

module.exports = { DATA_CLASSES, ageDays, planRetention, retentionExecuteEnabled };
