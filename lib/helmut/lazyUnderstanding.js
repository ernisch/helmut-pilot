"use strict";

// Helmut Core V3 — C7c: Understanding-Trigger (Lazy Loading, KEINE KI).
// Spart den teuren KI-Call: ein Vorgang wird nur dann fuer die (spaetere)
// Intelligence Engine (C8) vorgemerkt, wenn er noch NICHT verstanden ist UND
// mindestens ein Nutzer ueberhaupt interessiert ist.
//
// Ablauf:
//   1. Ist der Vorgang schon analysiert (knowledge_objects, status != pending)? -> nichts tun.
//   2. Sonst: Ist ein Nutzer interessiert? (deterministisches Matching, 0 KI)
//   3. Wenn ja: als status='pending' vormerken. HIER wird KEIN KI-Call gemacht —
//      C8 (echtes Understanding) verarbeitet die pending-Vorgaenge spaeter.
//
// Diese Datei importiert bewusst KEIN ai-Modul und ruft NIE ein Modell. Alles
// deterministisch; der teure KI-Call bleibt allein C8 vorbehalten.

const { matchProfileToKnowledgeObjects } = require("./matching");

// Provisorisches, KO-artiges Objekt aus einem Roh-Cluster (nur oeffentliche
// Merkmale) — reicht dem deterministischen Matching fuer den Interesse-Check.
function provisionalKnowledgeObject(vorgangId, cluster = {}) {
  return {
    id: `ko-${vorgangId}`,
    vorgang_id: vorgangId,
    status: "provisional", // NICHT 'pending' -> Matching schliesst nur echte pending-KOs aus
    headline: cluster.headline || cluster.title || "",
    was_ist_passiert: cluster.summary || cluster.text || "",
    warum_wichtig: "",
    tags: Array.isArray(cluster.tags) ? cluster.tags : [],
    policy_field: Array.isArray(cluster.policy_field) ? cluster.policy_field : [],
    parteien: Array.isArray(cluster.parteien) ? cluster.parteien : [],
    ausschuesse: Array.isArray(cluster.ausschuesse) ? cluster.ausschuesse : [],
    mentioned_parties: [], mentioned_committees: [], mentioned_locations: []
  };
}

function profileId(profile = {}) {
  return profile.id || profile.userId || profile.politicianId || null;
}

// Deterministischer Interesse-Check: welche Profile matchen den Vorgang?
//
// NUR AKTIVE PROFILE (ergänzt 03.09., Reviewbefund am 500er-Funktionstest):
// `scheduler.js` reicht hier `listFullProfiles()` durch — also AUCH deaktivierte
// (`profileActive === false`) und soft-gelöschte Profile. Ein deaktiviertes
// Profil hätte damit weiterhin Verstehensarbeit vorgemerkt (pending → spätere
// Modellaufrufe), obwohl es weder Briefing noch Radar bekommt und der
// Arbeitsplaner (`scalable-pipeline.planeArbeit`) es längst ausschließt.
// Verbindlich ist dasselbe Prädikat wie dort (`profile-validation.isDisabled`,
// kein zweiter Wahrheitsbegriff). Gemessen: ein inaktives Kohortenprofil zählte
// mit Ähnlichkeit 0,92 als „interessiert". Für die 495 INAKTIV angelegten
// Profile des 500er-Funktionstests wäre „inaktiv = keine Last" sonst falsch.
function interestedProfiles(cluster, profiles, opts = {}) {
  const threshold = opts.threshold != null ? Number(opts.threshold) : 0.12;
  const { isDisabled } = require("./profile-validation");
  const ko = provisionalKnowledgeObject(cluster.vorgang_id, cluster);
  const out = [];
  for (const profile of profiles || []) {
    if (!profile || isDisabled(profile)) continue;
    const top = matchProfileToKnowledgeObjects(profile, [ko], { threshold: 0, limit: 1 })[0];
    if (!top) continue;
    const interested = top.similarity >= threshold || (top.matched_features && top.matched_features.length > 0);
    if (interested) {
      out.push({ userId: profileId(profile), similarity: top.similarity, matched_features: top.matched_features });
    }
  }
  return out;
}

// Reine Entscheidungslogik (P1-testbar, ohne Storage/Netz).
function decideLazyUnderstanding(input = {}) {
  const vorgangId = input.vorgangId || (input.cluster && input.cluster.vorgang_id);
  if (!vorgangId) return { action: "skip-no-vorgang" };

  if (input.existingKo) {
    if (input.existingKo.status && input.existingKo.status !== "pending") {
      return { action: "skip-exists", vorgangId, status: input.existingKo.status };
    }
    return { action: "skip-already-pending", vorgangId, status: "pending" };
  }

  const cluster = { ...(input.cluster || {}), vorgang_id: vorgangId };
  const interested = interestedProfiles(cluster, input.profiles || [], { threshold: input.threshold });
  if (!interested.length) return { action: "skip-no-interest", vorgangId, interestedCount: 0 };

  return {
    action: "trigger-pending",
    vorgangId,
    interestedCount: interested.length,
    interested,
    headline: cluster.headline || cluster.title || ""
  };
}

// Robuste Dokumentzahl eines Roh-Clusters. FIX (2026-07): die fruehere Inline-
// Lesung cluster.documentCount traf ins Leere — clusterRawDocuments (understanding.js)
// liefert {documents:[...], anchors:[...]} OHNE Skalar documentCount, weshalb
// source_document_count beim Vormerken FAELSCHLICH immer 0 war. Diese Helferin nimmt
// zuerst documents.length und faellt nur ersatzweise auf einen evtl. mitgelieferten
// Skalar documentCount zurueck.
function clusterDocCount(cluster = {}) {
  if (cluster && Array.isArray(cluster.documents)) return cluster.documents.length;
  return Number(cluster && cluster.documentCount) || 0;
}

// --- Shadow-Runner (Produktion): pending vormerken, hinter Flag --------------
function defaultDeps() {
  const storage = require("./storage");
  return {
    enabled: () => storage.v3LazyUnderstandingEnabled(),
    getExisting: (vorgangId) => storage.getKnowledgeObjectByVorgang(vorgangId),
    listProfiles: () => (storage.listFullProfiles ? storage.listFullProfiles() : storage.listProfiles()),
    savePending: (vorgangId, meta) => storage.savePendingKnowledgeObject(vorgangId, meta)
  };
}

async function runLazyUnderstandingShadow(input = {}, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "lazy-understanding-disabled" };

  const vorgangId = input.vorgangId || (input.cluster && input.cluster.vorgang_id);
  if (!vorgangId) return { skipped: true, reason: "no-vorgang" };

  const existingKo = input.existingKo !== undefined ? input.existingKo : await deps.getExisting(vorgangId);
  const profiles = input.profiles || await deps.listProfiles();

  const decision = decideLazyUnderstanding({ vorgangId, cluster: input.cluster, profiles, existingKo, threshold: input.threshold });
  if (decision.action !== "trigger-pending") {
    return { vorgangId, action: decision.action, interestedCount: decision.interestedCount || 0, triggered: false };
  }

  // KEIN KI-Call. Nur als 'pending' vormerken; C8 holt die Analyse spaeter.
  const saved = await deps.savePending(vorgangId, {
    headline: decision.headline,
    source_document_count: clusterDocCount(input.cluster)
  });
  return { vorgangId, action: "trigger-pending", interestedCount: decision.interestedCount, triggered: true, storeResult: saved };
}

module.exports = {
  provisionalKnowledgeObject,
  interestedProfiles,
  decideLazyUnderstanding,
  clusterDocCount,
  runLazyUnderstandingShadow,
  defaultDeps
};
