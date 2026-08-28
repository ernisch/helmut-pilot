"use strict";

// Datenschutz — Aufbewahrung & Löschung (Retention) für raw_documents/knowledge_objects.
// ============================================================================
// Der Audit (R11) belegt: raw_documents und knowledge_objects werden HEUTE
// UNBEGRENZT gespeichert (kein Archiv/Purge). Dieses Modul liefert die technische
// Grundlage für eine DSGVO-konforme Aufbewahrung: eine reine, testbare
// Retention-PLANUNG + einen bis zu einem atomaren DB-Vertrag konstruktiv
// gesperrten Executor (ausschliesslich TROCKENLAUF).
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
  // W-2 Werkzeug-Haertung: relationales Ziel des processRuns-Rings (Migration
  // 20260727, freigabepflichtig). Gleiche Klasse wie crawl_runs — nur technische
  // Skalare/Zaehler/Fehlerklassen, keine Inhalte, keine PII.
  process_runs:         { klasse: "technische-telemetrie", art9: false, retentionDays: 90, loeschung: "purge-nach-alter" },
  llmUsage:             { klasse: "kosten-audit", art9: false, retentionDays: 365, loeschung: "ring-gedeckelt" },
  briefings:            { klasse: "nutzer-ausgabe", art9: true, retentionDays: 90, loeschung: "nutzergebunden-loeschbar" },

  // Seit Juli/August 2026 hinzugekommene relationale Datenklassen. Diese
  // Eintraege sind eine Sicherheits- und Freigabematrix, KEINE Aktivierung:
  // deleteRetention() hat derzeit bewusst GAR KEINEN aktiven Loeschpfad; die
  // vorbereitete Planung betrifft nur raw_documents/knowledge_objects. Jede
  // weitere Klasse braucht Rechts- UND
  // Betreiberfreigabe sowie einen eigenen, getesteten Vollstaendigkeitsbeleg.
  ko_relations:                    { klasse: "politische-analyse-ableitung", art9: true, retentionDays: null, loeschung: "mit-ko-lebenszyklus; nicht-aktiviert" },
  knowledge_object_embeddings:    { klasse: "politische-analyse-ableitung", art9: true, retentionDays: null, loeschung: "mit-ko-lebenszyklus; nicht-aktiviert" },
  matching_results:               { klasse: "mandantenbezogene-politische-analyse", art9: true, retentionDays: null, loeschung: "nutzergebunden; nicht-aktiviert" },
  matching_runs:                  { klasse: "mandantenbezogenes-matching-audit", art9: true, retentionDays: null, loeschung: "rechts-und-betreiberfreigabe-offen" },
  decisions:                      { klasse: "mandantenbezogene-politische-entscheidung", art9: true, retentionDays: null, loeschung: "nutzergebunden; nicht-aktiviert" },
  llm_usage:                      { klasse: "kosten-audit-relational", art9: false, retentionDays: 365, loeschung: "empfehlung; nicht-aktiviert" },
  llm_reservations:               { klasse: "kosten-und-parallelitaetssteuerung", art9: false, retentionDays: 30, loeschung: "bestehende-db-funktion; nicht-automatisiert" },
  llm_budget_counters:            { klasse: "kostensteuerungs-aktueller-zustand", art9: false, retentionDays: null, loeschung: "rechts-und-betreiberfreigabe-offen" },
  pipeline_locks:                 { klasse: "technischer-lease-zustand", art9: false, retentionDays: null, loeschung: "lease-selbstheilung; kein-alterspurge" },
  helmut_jobs:                    { klasse: "mandantenbezogene-auftragsmetadaten", art9: true, retentionDays: 14, loeschung: "nur-terminale-auftraege; bestehender-getrennter-pfad; nicht-automatisiert" },
  helmut_job_outbox:              { klasse: "mandantenbezogene-ausgangsmetadaten", art9: true, retentionDays: 30, loeschung: "nur-terminale-ausgaenge; bestehender-getrennter-pfad; nicht-automatisiert" },
  helmut_klassen_anker:           { klasse: "technische-parallelitaetskonfiguration", art9: false, retentionDays: null, loeschung: "aktueller-zustand; kein-alterspurge" },
  helmut_klassen_slots:           { klasse: "technischer-lease-zustand", art9: false, retentionDays: null, loeschung: "lease-selbstheilung; kein-alterspurge" },
  helmut_anbieter_fenster:        { klasse: "technische-anbieterzaehler", art9: false, retentionDays: 2, loeschung: "bestehende-db-funktion; nicht-automatisiert" },
  helmut_anbieter_schutzschalter: { klasse: "technischer-schutzschalterzustand", art9: false, retentionDays: null, loeschung: "aktueller-zustand; kein-alterspurge" },
  helmut_verstehen_reservierungen:{ klasse: "politische-analyse-leasemetadaten", art9: true, retentionDays: null, loeschung: "cas-fencing-zustand; kein-alterspurge" },
  helmut_verstehen_vormerkungen:  { klasse: "politische-analyse-arbeitszustand", art9: true, retentionDays: null, loeschung: "nie-blind-nach-alter; fachfreigabe-offen" }
};

const RETENTION_METADATA_CONTRACT = "retention-metadata/v2";
const RETENTION_PLAN_CONTRACT = "retention-plan/v2";
const RETENTION_PAGINATION_PROOF = "offset-until-terminal-page";
const RETENTION_REST_CONSISTENCY = "sequenziell-rest-nicht-transaktional";
const RETENTION_COLLECTIONS = ["rawDocuments", "knowledgeObjects", "koDocumentLinks"];
const RETENTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);

function ageDays(iso, nowMs) {
  if (typeof iso !== "string" || !iso.trim() || typeof nowMs !== "number" || !Number.isFinite(nowMs)) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 86400000;
}

function validateRetentionMetadata(input = {}) {
  const errors = [];
  const collections = {};

  if (input.metadataComplete !== true) errors.push("metadataComplete-ist-nicht-true");
  if (input.metadataContract !== RETENTION_METADATA_CONTRACT) errors.push("metadataContract-ungueltig");
  if (input.konsistenz !== RETENTION_REST_CONSISTENCY) errors.push("konsistenzbeleg-ungueltig");

  const proof = input.metadataCompleteness;
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    errors.push("metadataCompleteness-fehlt");
  }

  for (const name of RETENTION_COLLECTIONS) {
    if (!hasOwn(input, name) || !Array.isArray(input[name])) {
      errors.push(`${name}-fehlt-oder-ist-kein-array`);
      collections[name] = [];
      continue;
    }
    collections[name] = input[name];

    const item = proof && proof[name];
    const validProof = item
      && item.complete === true
      && item.terminalPage === true
      && item.truncated === false
      && item.pagination === RETENTION_PAGINATION_PROOF
      && Number.isSafeInteger(item.rows)
      && item.rows === input[name].length
      && Number.isSafeInteger(item.pages)
      && item.pages >= 1
      && Number.isSafeInteger(item.pageSize)
      && item.pageSize >= 1
      && Number.isSafeInteger(item.terminalPageRows)
      && item.terminalPageRows >= 0
      && item.terminalPageRows < item.pageSize;
    if (!validProof) errors.push(`${name}-vollstaendigkeitsbeleg-ungueltig`);
  }

  const rawIds = new Set();
  for (const [index, row] of (collections.rawDocuments || []).entries()) {
    const id = row && row.id;
    if (typeof id !== "string" || !RETENTION_ID_PATTERN.test(id)) errors.push(`rawDocuments[${index}]-id-ungueltig`);
    else if (rawIds.has(id)) errors.push(`rawDocuments[${index}]-id-doppelt`);
    else rawIds.add(id);
    if (!row || ageDays(row.created_at, 0) == null) errors.push(`rawDocuments[${index}]-created_at-ungueltig`);
  }

  const koIds = new Set();
  for (const [index, row] of (collections.knowledgeObjects || []).entries()) {
    const id = row && row.id;
    if (typeof id !== "string" || !RETENTION_ID_PATTERN.test(id)) errors.push(`knowledgeObjects[${index}]-id-ungueltig`);
    else if (koIds.has(id)) errors.push(`knowledgeObjects[${index}]-id-doppelt`);
    else koIds.add(id);
    if (!row || ageDays(row.created_at, 0) == null) errors.push(`knowledgeObjects[${index}]-created_at-ungueltig`);
  }

  const linkIds = new Set();
  for (const [index, row] of (collections.koDocumentLinks || []).entries()) {
    const rawId = row && row.raw_document_id;
    const koId = row && row.knowledge_object_id;
    if (typeof rawId !== "string" || !RETENTION_ID_PATTERN.test(rawId)) errors.push(`koDocumentLinks[${index}]-raw_document_id-ungueltig`);
    if (typeof koId !== "string" || !RETENTION_ID_PATTERN.test(koId)) errors.push(`koDocumentLinks[${index}]-knowledge_object_id-ungueltig`);
    if (typeof rawId === "string" && RETENTION_ID_PATTERN.test(rawId) && !rawIds.has(rawId)) errors.push(`koDocumentLinks[${index}]-raw_document-fehlt`);
    if (typeof koId === "string" && RETENTION_ID_PATTERN.test(koId) && !koIds.has(koId)) errors.push(`koDocumentLinks[${index}]-knowledge_object-fehlt`);
    const linkId = `${koId}\u0000${rawId}`;
    if (linkIds.has(linkId)) errors.push(`koDocumentLinks[${index}]-doppelt`);
    else linkIds.add(linkId);
  }

  return { ok: errors.length === 0, errors };
}

function strictRetentionDays(input, key, fallback, errors) {
  if (!hasOwn(input, key)) return fallback;
  const value = input[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    errors.push(`${key}-ungueltig`);
    return null;
  }
  return value;
}

function strictNowMs(input, errors) {
  if (hasOwn(input, "nowMs")) {
    if (typeof input.nowMs === "number" && Number.isFinite(input.nowMs) && input.nowMs > 0) return input.nowMs;
    errors.push("nowMs-ungueltig");
    return null;
  }
  if (hasOwn(input, "now") && typeof input.now === "string" && input.now.trim()) {
    const parsed = Date.parse(input.now);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  errors.push("zeitbezug-fehlt-oder-ist-ungueltig");
  return null;
}

function blockedPlan(input, errors, rawRetentionDays, koRetentionDays) {
  const rawTotal = Array.isArray(input.rawDocuments) ? input.rawDocuments.length : null;
  const koTotal = Array.isArray(input.knowledgeObjects) ? input.knowledgeObjects.length : null;
  return {
    contract: RETENTION_PLAN_CONTRACT,
    konsistenz: input.konsistenz || null,
    metadataComplete: false,
    dryRunOnly: true,
    executable: false,
    rawRetentionDays,
    koRetentionDays,
    rawToDelete: [],
    koToDelete: [],
    rawBlockedByKeepReference: [],
    report: {
      rawDocumentsTotal: rawTotal,
      knowledgeObjectsTotal: koTotal,
      rawToDelete: 0,
      koToDelete: 0,
      rawBlockedByKeepReference: 0
    },
    integrityOk: false,
    integrityScope: "keine-plausibilitaet-bei-ungueltigem-oder-unvollstaendigem-abzug",
    executionBlockReason: "metadaten-oder-planparameter-ungueltig",
    errors: [...new Set(errors)]
  };
}

// Reine Retention-Planung. Eingaben sind bereits geladene, MINIMIERTE Metadaten
// (id/created_at + Verknüpfungen) — KEIN Volltext nötig. Liefert den Löschplan +
// den Bericht über betroffene Datensätze + eine interne Plausibilitätsprüfung.
function planRetention(input = {}) {
  const errors = [];
  const nowMs = strictNowMs(input, errors);
  const rawRetentionDays = strictRetentionDays(input, "rawRetentionDays", DATA_CLASSES.raw_documents.retentionDays, errors);
  const koRetentionDays = strictRetentionDays(input, "koRetentionDays", DATA_CLASSES.knowledge_objects.retentionDays, errors);
  const metadata = validateRetentionMetadata(input);
  errors.push(...metadata.errors);
  if (errors.length > 0) return blockedPlan(input, errors, rawRetentionDays, koRetentionDays);

  const rawDocuments = input.rawDocuments;
  const knowledgeObjects = input.knowledgeObjects;
  // Verknüpfung raw_document_id -> [knowledge_object_id]. Diese Menge ist hier
  // relativ zu den gelesenen Seiten vollstaendig; ein fehlendes Array wird
  // oberhalb NICHT als leer interpretiert. Eine transaktionale Snapshot-Garantie
  // folgt daraus ausdrücklich nicht.
  const links = input.koDocumentLinks;

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
  const integrityOk = rawToDelete.every((rid) => {
    const linkedKos = linkedKosByRaw.get(rid) || new Set();
    return ![...linkedKos].some((kid) => koKeepSet.has(kid));
  });

  return {
    contract: RETENTION_PLAN_CONTRACT,
    konsistenz: input.konsistenz,
    metadataComplete: true,
    // WICHTIG: Die drei vollständig paginierten REST-Lesungen sind trotzdem
    // KEIN transaktionaler Snapshot. Offset-Seiten koennen sich bei parallelen
    // Inserts/Deletes verschieben; zwischen Plan und DELETE kann ein neuer Link
    // entstehen. integrityOk bezeichnet deshalb nur die interne Plausibilitaet
    // der gelesenen Zeilen und ist niemals eine Ausfuehrungsfreigabe.
    dryRunOnly: true,
    executable: false,
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
    // Interne Plausibilitaet: Im gelesenen, nicht-transaktionalen REST-Abzug ist
    // kein Löschkandidat an ein darin enthaltenes, behaltenes KO gebunden.
    integrityOk,
    integrityScope: "interne-plausibilitaet-des-rest-abzugs-kein-ausfuehrungsbeleg",
    executionBlockReason: "rest-page-shift-und-plan-delete-toctou-nicht-ausgeschlossen",
    errors: []
  };
}

function retentionExecuteEnabled(env = process.env) {
  const v = String((env && env.HELMUT_RETENTION_EXECUTE) || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

module.exports = {
  DATA_CLASSES,
  RETENTION_METADATA_CONTRACT,
  RETENTION_PLAN_CONTRACT,
  RETENTION_PAGINATION_PROOF,
  RETENTION_REST_CONSISTENCY,
  ageDays,
  validateRetentionMetadata,
  planRetention,
  retentionExecuteEnabled
};
