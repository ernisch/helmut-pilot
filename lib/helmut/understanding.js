"use strict";

// Helmut Core V3 — C7: Erster echter Understanding-Call, im SCHATTEN.
// "Einmal verstehen (global, KI) -> mehrfach bewerten (pro Nutzer, 0 KI)".
//
// Ablauf (global, mandantenlos):
//   raw_documents -> deterministisches Vorgangs-Clustering (KEINE KI)
//     -> pro NEUEM Vorgang: globaler Lock + Budget-Gate -> 1 KI-Call (Azure gpt-5-mini,
//        strukturierte JSON-Ausgabe) -> Validierung gegen understanding-schema
//     -> gueltig: knowledge_objects speichern; ungueltig: sauber skippen + loggen.
//
// Es wird NIE pro Nutzer verstanden: keine politicianId im Pfad (Budget global mit
// null), Idempotenz pro vorgang_id (existiert ein KO -> kein KI-Call). Kein Frontend.
//
// DSGVO: Der KI-Input sind ausschliesslich MINIMIERTE raw_documents (Schlagzeile +
// gekuerzter Kontext, kein Volltext). Das gespeicherte KO wird aus einer WHITELIST
// gebaut (kein Modell-Freitextfeld landet in der DB); mentioned_* werden auf kurze
// oeffentliche Labels reduziert; PII/E-Mail wird gefiltert bzw. fuehrt zum Skip.

const { toRawDocumentRow, dedupeRawDocuments } = require("./dedup");
const { KNOWLEDGE_OBJECT_SCHEMA, validateKnowledgeObject, ZEITDRUCK_ENUM, MENTION_FIELDS } = require("./understanding-schema");

// --- Deterministisches Vorgangs-Clustering (keine KI) -----------------------
// Anker = lange Titel-/Kontext-Tokens (>=8 Zeichen). Deutsche Themenwoerter sind
// typischerweise lange Komposita ("Rentenpaket", "Tariftreuegesetz"). Zwei Dokumente
// gehoeren zum selben Vorgang, wenn sie einen Anker teilen (inkl. Komposit-Enthalten:
// "Bundestariftreuegesetz" ~ "Tariftreuegesetz").
function anchorTokens(text) {
  return [...new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").split(/\s+/).filter((t) => t.length >= 8)
  )];
}

function anchorsMatch(a, b) {
  return a === b || a.includes(b) || b.includes(a);
}

function docsShareAnchor(aList, bList) {
  return aList.some((a) => bList.some((b) => anchorsMatch(a, b)));
}

function clusterRawDocuments(rawDocuments = []) {
  const clusters = [];
  for (const doc of rawDocuments) {
    if (!doc) continue;
    const anchors = anchorTokens(`${doc.title || ""} ${doc.summary || ""}`);
    const target = clusters.find((c) => anchors.length && docsShareAnchor(anchors, c.anchors));
    if (target) {
      target.documents.push(doc);
      target.anchors = [...new Set([...target.anchors, ...anchors])];
    } else {
      clusters.push({ documents: [doc], anchors });
    }
  }
  return clusters.map((c) => ({ documents: c.documents, anchors: c.anchors }));
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Stabile vorgang_id: der TOPIC-Anker = die Anker-Wurzel mit der hoechsten
// Dokument-Frequenz im Cluster (das gemeinsame Thema, nicht ein Verb wie
// "vorgelegt"). Komposita werden auf ihre Wurzel normalisiert (Bundestariftreue-
// gesetz -> tariftreuegesetz). Tie-Break: laengere Wurzel, dann alphabetisch.
function deriveVorgangId(cluster = {}) {
  const docs = cluster.documents || [];
  const perDoc = docs.map((d) => anchorTokens(`${d.title || ""} ${d.summary || ""}`));
  const allAnchors = [...new Set(perDoc.flat())];
  if (!allAnchors.length) {
    const first = docs[0] || {};
    const key = first.content_hash || first.id || first.title || "unbekannt";
    return `vg-${slug(String(key)).slice(0, 24)}`;
  }
  const rootOf = (anchor) => {
    let root = anchor;
    for (const other of allAnchors) if (anchorsMatch(anchor, other) && other.length < root.length) root = other;
    return root;
  };
  const roots = [...new Set(allAnchors.map(rootOf))];
  const docFreq = (root) => perDoc.filter((anchors) => anchors.some((a) => anchorsMatch(a, root))).length;
  const best = roots
    .map((root) => ({ root, df: docFreq(root) }))
    .sort((x, y) => (y.df - x.df) || (y.root.length - x.root.length) || (x.root < y.root ? -1 : 1))[0];
  return `vg-${slug(best.root)}`;
}

// --- Prompt (DSGVO-Regeln fest eingebaut) -----------------------------------
function buildUnderstandingPrompt(cluster = {}) {
  const docs = (cluster.documents || []).slice(0, 12).map((d, i) =>
    `${i + 1}. ${d.title || "(ohne Titel)"}${d.summary ? ` — ${d.summary}` : ""} [${d.source_name || d.source_id || "Quelle"}${d.published_at ? `, ${String(d.published_at).slice(0, 10)}` : ""}]`
  ).join("\n");
  const felder = (KNOWLEDGE_OBJECT_SCHEMA.required || []).join(", ");
  return [
    "Du bist ein sachlicher politischer Analyst. Analysiere den folgenden politischen VORGANG",
    "ausschliesslich anhand der unten genannten oeffentlichen Schlagzeilen/Kurzzusammenfassungen mehrerer Quellen.",
    "Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklaerung).",
    "",
    "Pflichtfelder (alle ausgeben, Listen ggf. leer []):",
    felder + ".",
    `zeitdruck muss einer von {${ZEITDRUCK_ENUM.join(", ")}} sein. confidence_score ist 0-100.`,
    "",
    "DSGVO-REGELN (zwingend einhalten):",
    "- mentioned_people und mentioned_mps NUR fuer oeffentlich handelnde politische Akteure in ihrer AMTLICHEN Rolle.",
    "- NIEMALS Privatpersonen, keine Kontaktdaten, keine Adressen/E-Mails/Telefonnummern, keine privaten Personenprofile.",
    "- Leite KEINE privaten personenbezogenen Daten ab. Nutze nur, was in den Quellen oeffentlich steht.",
    "- Kurze Labels bei Erwaehnungen (z. B. 'Name (MdB)', 'SPD', 'BMAS'), keine Dossiers.",
    "",
    "Quellen:",
    docs
  ].join("\n");
}

// --- Sanitisierung / DSGVO-Whitelist ----------------------------------------
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LIST_FIELDS = ["parteien", "ausschuesse", "ministerien", "risiken", "chancen"];
const PROSE_FIELDS = ["was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "handlungsempfehlung", "headline"];

function cleanEntry(value, maxLen) {
  const v = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

function cleanList(value, maxLen) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const el of value) {
    const s = cleanEntry(el, maxLen);
    if (!s) continue;
    if (EMAIL_RE.test(s)) continue;        // DSGVO: keine Kontaktdaten in Listen
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Baut das zu speichernde knowledge_object AUS EINER WHITELIST — kein Modell-Feld
// ausserhalb des Schemas landet in der DB. Identitaet setzen WIR deterministisch.
// opts (C8): understanding_status (Lifecycle, Default 'complete') + understanding_model
// werden hier gesetzt — NICHT aus der KI-Antwort uebernommen (Kostenlog/DSGVO: nur
// nicht-inhaltliche Metadaten). status bleibt die schema-gueltige Analyse-Klasse.
function assembleKnowledgeObject(aiResult = {}, cluster = {}, vorgangId, opts = {}) {
  const ko = {
    id: `ko-${vorgangId}`,
    vorgang_id: vorgangId,
    ko_version: 1,
    status: "neu",
    understanding_status: opts.understanding_status || "complete",
    source_document_count: (cluster.documents || []).length,
    confidence_score: clampInt(aiResult.confidence_score, 0, 100, 60)
  };
  if (opts.model) ko.understanding_model = String(opts.model).slice(0, 120);
  for (const f of PROSE_FIELDS) ko[f] = cleanEntry(aiResult[f], 800);
  for (const f of LIST_FIELDS) ko[f] = cleanList(aiResult[f], 200);
  for (const f of MENTION_FIELDS) ko[f] = cleanList(aiResult[f], 120); // kurze oeffentliche Labels
  const z = cleanEntry(aiResult.zeitdruck, 20).toLowerCase();
  ko.zeitdruck = ZEITDRUCK_ENUM.includes(z) ? z : "mittel";
  return ko;
}

// --- Orchestrierung (Dependencies injizierbar -> offline testbar) -----------
function defaultDeps() {
  const storage = require("./storage");
  const ai = require("./ai");
  return {
    enabled: () => storage.v3StoreEnabled(),
    aiEnabled: () => ai.isAiEnabled(),
    acquireLock: () => storage.acquireGlobalUnderstandingLock(),
    releaseLock: () => storage.releaseGlobalUnderstandingLock(),
    getExisting: (vorgangId) => storage.getKnowledgeObjectByVorgang(vorgangId),
    // C8: die von C7c vorgemerkten (status='pending') Vorgaenge holen.
    listPending: (limit) => storage.listPendingKnowledgeObjects({ limit }),
    canSpend: () => storage.canSpendLlm(null), // GLOBAL: null, niemals pro Nutzer
    requestUnderstanding: (prompt) =>
      ai.requestStructuredJson(prompt, KNOWLEDGE_OBJECT_SCHEMA, { callType: "understanding", politicianId: null }, ai.understandingModelName()),
    save: (ko) => storage.saveKnowledgeObject(ko),
    // C8: Vorgang als KI-Fehlschlag parken (status bleibt 'pending' -> nie gematcht).
    markFailed: (vorgangId, meta) => storage.markUnderstandingFailed(vorgangId, meta),
    // Modellname NUR fuer das Metadatenfeld understanding_model (kein Inhalt).
    modelName: () => ai.understandingModelName(),
    // Skip-Log OHNE Prompt-/Antwortinhalt (nur callType/Modell) — DSGVO + Kostenlog-Regel.
    logSkip: (callType) => {
      try { storage.recordLlmUsage({ callType, model: "none", politicianId: null, success: false }); }
      catch (e) { try { console.error("[understanding] logSkip fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
    }
  };
}

// Versteht EINEN Vorgang (Cluster) global per KI. opts erlaubt dem C8-Pending-Pfad,
// vorgang_id + das bereits geladene KO durchzureichen (kein erneutes Fetch/Ableiten).
// Zustandslogik (status = Analyse-Klasse, understanding_status = Lifecycle):
//   - existiert ein VERSTANDENES KO (status != 'pending') -> skipped-exists (einmal pro Vorgang)
//   - existiert ein GEPARKTES KO (understanding_status='failed') -> skipped-failed (kein Retry)
//   - existiert ein PENDING KO -> vervollstaendigen (KI-Call, complete/failed)
//   - kein KO -> direkt verstehen (eager Pfad; bei Fehler NUR loggen, kein Karteileichen-KO)
async function understandOneCluster(cluster, deps, opts = {}) {
  const vorgangId = opts.vorgangId || deriveVorgangId(cluster);
  const existing = opts.existing !== undefined ? opts.existing : await deps.getExisting(vorgangId);
  if (existing) {
    // Alles ausser einem echten 'pending'-KO gilt als bereits verstanden -> nicht erneut.
    if (existing.status !== "pending") return { vorgangId, status: "skipped-exists" };
    if (existing.understanding_status === "failed") return { vorgangId, status: "skipped-failed" };
  }
  const model = typeof deps.modelName === "function" ? deps.modelName() : null;
  const headline = (cluster.documents && cluster.documents[0] && cluster.documents[0].title) || cluster.headline || "";
  const failMeta = { headline, understanding_model: model };
  // Fehlschlag IMMER parken (status bleibt 'pending', understanding_status='failed'):
  // verhindert Endlos-Retry — auch fuer neu entdeckte Vorgaenge im eager-Pfad. Der
  // Vorgang wird nie ausgeliefert/gematcht; ein Operator kann understanding_status
  // zuruecksetzen, um erneut zu versuchen. Selbst fail-safe (schluckt Storage-Fehler).
  const markFailed = async () => {
    if (typeof deps.markFailed !== "function") return;
    try { await deps.markFailed(vorgangId, failMeta); }
    catch (e) { try { console.error("[understanding] markFailed fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
  };

  const budget = await deps.canSpend();
  if (!budget || !budget.allowed) {
    deps.logSkip("skipped-understanding-budget");
    return { vorgangId, status: "skipped-budget", reason: budget && budget.reason };
  }

  let aiResult;
  try {
    aiResult = await deps.requestUnderstanding(buildUnderstandingPrompt(cluster));
  } catch (error) {
    await markFailed();
    deps.logSkip("skipped-understanding-error"); // KEIN Fehlertext/Antwortinhalt geloggt
    return { vorgangId, status: "skipped-error" };
  }

  const ko = assembleKnowledgeObject(aiResult, cluster, vorgangId, { understanding_status: "complete", model });
  const validation = validateKnowledgeObject(ko);
  if (!validation.valid) {
    await markFailed();
    deps.logSkip("skipped-understanding-invalid");
    return { vorgangId, status: "skipped-invalid", errors: validation.errors.slice(0, 5) };
  }

  const saved = await deps.save(ko);
  return {
    vorgangId,
    status: saved && saved.saved ? "saved" : "skipped-store",
    id: ko.id,
    documents: ko.source_document_count
  };
}

// Schatten-Lauf ueber alle Cluster. Global gelockt; ohne Flag/KI/Lock -> No-Op.
// rawDocsOrItems: rohe rawItems ODER bereits minimierte raw_document-Zeilen.
async function runUnderstandingShadow(rawDocsOrItems = [], overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "v3-store-disabled" };
  if (!deps.aiEnabled()) return { skipped: true, reason: "ai-disabled" };
  if (!Array.isArray(rawDocsOrItems) || !rawDocsOrItems.length) return { skipped: true, reason: "no-input" };

  const lock = await deps.acquireLock();
  if (!lock || !lock.granted) return { skipped: true, reason: "understanding-locked" };
  try {
    // Nur minimierte raw_documents ins Understanding geben (DSGVO: kein Volltext).
    const rows = dedupeRawDocuments(rawDocsOrItems.map(toRawDocumentRow).filter((r) => r && r.id));
    const clusters = clusterRawDocuments(rows);
    const results = [];
    for (const cluster of clusters) {
      // Fail-safe: ein einzelner geworfener Cluster darf den Batch nie abbrechen.
      try {
        results.push(await understandOneCluster(cluster, deps)); // seriell: schont Budget/Rate-Limit
      } catch (error) {
        results.push({ status: "cluster-error" });
      }
    }
    const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return { clusters: clusters.length, counts, results };
  } finally {
    await deps.releaseLock();
  }
}

// --- C8-Entry: die von C7c vorgemerkten (status='pending') Vorgaenge verstehen ---
// Holt die pending-KOs, clustert die (minimierten, DSGVO-sparsamen) Rohdokumente
// und verbindet jeden pending-Vorgang mit SEINEM Cluster (ueber die stabile
// vorgang_id). Nur Vorgaenge MIT vorhandenen Quell-Dokumenten werden verstanden —
// ohne Quellen KEIN KI-Call (Kosten + Qualitaet). Global gelockt; ohne Flag/KI/
// Lock/Pending -> No-Op. rawDocsOrItems: rohe rawItems ODER minimierte raw_document-Zeilen.
async function runPendingUnderstandingShadow(rawDocsOrItems = [], overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "v3-store-disabled" };
  if (!deps.aiEnabled()) return { skipped: true, reason: "ai-disabled" };

  const pending = (await deps.listPending()) || [];
  if (!Array.isArray(pending) || !pending.length) return { skipped: true, reason: "no-pending" };

  const lock = await deps.acquireLock();
  if (!lock || !lock.granted) return { skipped: true, reason: "understanding-locked" };
  try {
    const rows = dedupeRawDocuments((rawDocsOrItems || []).map(toRawDocumentRow).filter((r) => r && r.id));
    const clusters = clusterRawDocuments(rows);
    const byVorgang = new Map(clusters.map((c) => [deriveVorgangId(c), c]));
    const results = [];
    for (const ko of pending) {
      if (!ko || !ko.vorgang_id) { results.push({ status: "skipped-no-vorgang" }); continue; }
      const cluster = byVorgang.get(ko.vorgang_id);
      if (!cluster || !(cluster.documents || []).length) {
        // Keine Quell-Dokumente fuer diesen Vorgang in diesem Lauf -> KEIN KI-Call.
        results.push({ vorgangId: ko.vorgang_id, status: "skipped-no-cluster" });
        continue;
      }
      // Fail-safe: ein einzelner geworfener Vorgang darf den Batch nie abbrechen.
      try {
        results.push(await understandOneCluster(cluster, deps, { vorgangId: ko.vorgang_id, existing: ko }));
      } catch (error) {
        results.push({ vorgangId: ko.vorgang_id, status: "cluster-error" });
      }
    }
    const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return { pending: pending.length, counts, results };
  } finally {
    await deps.releaseLock();
  }
}

// --- Goldset-Evaluation (Qualitaetssicherung, KEIN Netzwerk noetig) ----------
// Fuehrt EINEN Goldset-Fall durch die echte C8-Pipeline (Clustering -> Prompt ->
// Assemble -> Validierung). requestUnderstanding(prompt, caseObj) liefert die
// (echte oder simulierte) KI-Antwort. Prueft: Prompt traegt die DSGVO-Regeln und
// echte Quellen, das assemblierte KO ist schema-valide und DSGVO-sauber.
async function evaluateUnderstandingCase(caseObj = {}, requestUnderstanding) {
  const name = caseObj.name || "(unbenannt)";
  const docs = Array.isArray(caseObj.raw_documents) ? caseObj.raw_documents : [];
  const clusters = clusterRawDocuments(docs);
  // Alle Rohdoks eines Falls gehoeren zum selben Vorgang -> groesstes Cluster nehmen.
  const cluster = clusters.sort((a, b) => (b.documents || []).length - (a.documents || []).length)[0] || { documents: docs };
  const vorgangId = deriveVorgangId(cluster);
  const prompt = buildUnderstandingPrompt(cluster);
  const promptOk = /oeffentlich handelnde politische Akteure/i.test(prompt)
    && /mentioned_people/.test(prompt)
    && (cluster.documents || []).length > 0;

  let aiResult;
  try {
    aiResult = await requestUnderstanding(prompt, caseObj);
  } catch (error) {
    return { name, valid: false, vorgangId, promptOk, errors: ["ki-fehler: " + String(error && error.message).slice(0, 120)] };
  }
  const ko = assembleKnowledgeObject(aiResult, cluster, vorgangId, { understanding_status: "complete" });
  const validation = validateKnowledgeObject(ko);
  return { name, valid: validation.valid && promptOk, vorgangId, promptOk, errors: validation.errors.slice(0, 5), ko };
}

// Fuehrt das gesamte Goldset durch die C8-Pipeline. requestUnderstanding ist
// injizierbar: im Test die (perfekte) erwartete Analyse ODER eine bewusst schlechte
// Antwort; produktiv der echte KI-Call. Rueckgabe: Aggregat + Fehlerliste.
async function evaluateUnderstandingGoldset(goldset = {}, requestUnderstanding) {
  const cases = Array.isArray(goldset.cases) ? goldset.cases : [];
  const results = [];
  for (const c of cases) results.push(await evaluateUnderstandingCase(c, requestUnderstanding)); // seriell: schont Budget/Rate-Limit
  const valid = results.filter((r) => r.valid).length;
  return { total: results.length, valid, failures: results.filter((r) => !r.valid), results };
}

module.exports = {
  clusterRawDocuments,
  deriveVorgangId,
  buildUnderstandingPrompt,
  assembleKnowledgeObject,
  runUnderstandingShadow,
  runPendingUnderstandingShadow,
  understandOneCluster,
  evaluateUnderstandingCase,
  evaluateUnderstandingGoldset,
  defaultDeps
};
