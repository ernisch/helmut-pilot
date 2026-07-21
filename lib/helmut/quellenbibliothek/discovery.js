"use strict";

// Helmut — Universelle Quellenbibliothek · Discovery-Strategie (Auftrag §6).
//
// Reine, deterministische Logik + klare Schnittstellen. KEINE KI, kein Netz, kein
// Storage — die eigentlichen Fund-Quellen (Sitemaps, OParl-Register, Outlinks,
// redaktionelle Vorschläge) werden als `CandidateSource`-Provider INJIZIERT. Dieses
// Modul entscheidet nur, WIE Helmut Kandidaten prüft, dedupliziert, gegen Bestand
// bewertet und ob ein Austausch die Qualität hält.
//
// Beantwortet die Auftrags-Fragen §6:
//   - Wie findet Helmut neue Quellen?        -> intakeCandidates() (Provider-Schnittstelle)
//   - Wie erkennt Helmut veraltete Quellen?  -> findStaleSources()
//   - Wie erkennt Helmut doppelte Quellen?   -> findDuplicateClusters()
//   - Wie ersetzt Helmut defekte Quellen?    -> proposeReplacements()
//   - Wie verhindert Helmut Qualitätsverlust?-> guardQualityLoss()

const { normalizeDescriptor, validateDescriptor, canonicalKey } = require("./descriptor");

// --- Provider-Schnittstelle -------------------------------------------------
// Ein DiscoveryProvider liefert Roh-Kandidaten. Vertrag (Duck-Typing, kein Zwang zu
// Klassen): { name:string, discover(context): DiscoveryCandidate[] }. `discover` MUSS
// synchron sein und darf KEIN Netz nutzen (Netz-Provider werden außerhalb, im
// Betriebspfad, adaptiert) — so bleibt Discovery hier testbar und offline.
function isProvider(p) {
  return p && typeof p.discover === "function" && typeof p.name === "string";
}

// --- Neue Quellen finden ----------------------------------------------------
// Sammelt Kandidaten aller Provider, normalisiert + validiert sie, entfernt bereits
// in der Registry vorhandene (canonicalKey) und untereinander doppelte. Rückgabe:
// { accepted:[descriptor], rejected:[{errors}], knownDuplicates:[key], intraDuplicates:[key] }
function intakeCandidates(registry, providers = [], context = {}) {
  const accepted = [];
  const rejected = [];
  const knownDuplicates = [];
  const seen = new Set();
  const intraDuplicates = [];

  for (const provider of providers) {
    if (!isProvider(provider)) continue;
    let raw = [];
    try { raw = provider.discover(context) || []; } catch { raw = []; }
    for (const cand of raw) {
      const { ok, errors, descriptor } = validateDescriptor(cand);
      const key = descriptor.canonicalKey;
      if (!ok) { rejected.push({ candidate: cand, errors, discoveredVia: provider.name }); continue; }
      if (registry.getByKey(key)) { knownDuplicates.push(key); continue; } // schon im Bestand
      if (seen.has(key)) { intraDuplicates.push(key); continue; }          // Provider-übergreifend doppelt
      seen.add(key);
      accepted.push({ ...descriptor, meta: { ...(descriptor.meta || {}), discoveredVia: provider.name } });
    }
  }
  return { accepted, rejected, knownDuplicates, intraDuplicates };
}

// --- Veraltete Quellen erkennen ---------------------------------------------
// Veraltet = seit `staleAfterMs` kein Erfolg mehr (aber schon einmal geprüft), ODER
// dauerhaft archiviert/verboten, ODER Health `broken`. Rein aus Health + Status —
// keine statischen Listen.
function findStaleSources(registry, opts = {}) {
  const now = opts.now != null ? opts.now : null;
  const staleAfterMs = opts.staleAfterMs != null ? opts.staleAfterMs : 30 * 24 * 3600 * 1000;
  const out = [];
  for (const d of registry.all()) {
    const h = d.health || {};
    let reason = null;
    if (d.status === "archived") reason = "archiviert";
    else if (d.license === "prohibited") reason = "nutzung-verboten";
    else if (h.state === "broken") reason = "dauerhaft-defekt";
    else if (h.state === "disabled") reason = "deaktiviert";
    else if (now != null && h.lastSuccessAt != null && (now - h.lastSuccessAt) > staleAfterMs) reason = "kein-erfolg-seit-frist";
    else if (now != null && h.state && h.state !== "never_checked" && h.lastSuccessAt == null) reason = "nie-erfolgreich";
    if (reason) out.push({ id: d.id, publisher: d.publisher, reason, lastSuccessAt: h.lastSuccessAt || null });
  }
  return out;
}

// --- Doppelte Quellen erkennen ----------------------------------------------
// Cluster über den canonicalKey (physisch identisch) UND — schärfer — über
// Herausgeber+Methode (potenziell redundante Zweitwege desselben Herausgebers).
// Erste Ebene ist harte Dublette, zweite ist ein Redundanz-Hinweis.
function findDuplicateClusters(descriptors = []) {
  const list = descriptors.map((d) => (d && d.canonicalKey ? d : normalizeDescriptor(d)));
  const byKey = new Map();
  const byPublisherMethod = new Map();
  for (const d of list) {
    push(byKey, d.canonicalKey, d.id);
    push(byPublisherMethod, `${d.publisher}|${d.access.method}`, d.id);
  }
  const hardDuplicates = [...byKey.entries()].filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ key, ids: [...new Set(ids)] })).filter((c) => c.ids.length > 1);
  const redundant = [...byPublisherMethod.entries()].filter(([, ids]) => new Set(ids).size > 1)
    .map(([key, ids]) => ({ key, ids: [...new Set(ids)] }));
  return { hardDuplicates, redundant };
}

function push(map, key, val) { if (!map.has(key)) map.set(key, []); map.get(key).push(val); }

// --- Defekte Quellen ersetzen -----------------------------------------------
// Für eine (defekte) Quelle gleichwertige, GESUNDE Ersatzkandidaten aus der Registry
// finden: gleiche Zuordnungsdimensionen (überlappende Themen/Regionen/Ausschüsse/
// Parteien/Ministerien), abrufbar, nicht selbst defekt. Sortiert nach Überlappungsgüte.
const REPLACE_DIMS = ["parties", "factions", "committees", "topics", "regions", "ministries"];
function proposeReplacements(registry, brokenId, opts = {}) {
  const broken = registry.get(brokenId);
  if (!broken) return { for: brokenId, candidates: [] };
  const wantByDim = {};
  for (const dim of REPLACE_DIMS) wantByDim[dim] = new Set(broken[dim] || []);

  const candidates = [];
  for (const d of registry.all()) {
    if (d.id === brokenId) continue;
    if (!registry.isEligible(d)) continue;
    if (d.health && (d.health.state === "broken" || d.health.needsAttention)) continue; // kein kranker Ersatz
    let overlap = 0; const matchedDims = [];
    for (const dim of REPLACE_DIMS) {
      const inter = (d[dim] || []).filter((v) => wantByDim[dim].has(v));
      if (inter.length) { overlap += inter.length; matchedDims.push(dim); }
    }
    if (broken.universal && d.universal) { overlap += 1; matchedDims.push("universal"); }
    if (overlap > 0) candidates.push({ id: d.id, publisher: d.publisher, overlap, matchedDims, trust: d.trust });
  }
  candidates.sort((a, b) => (b.overlap - a.overlap) || a.id.localeCompare(b.id));
  const limit = opts.limit || candidates.length;
  return { for: brokenId, brokenPublisher: broken.publisher, candidates: candidates.slice(0, limit) };
}

// --- Qualitätsverlust verhindern --------------------------------------------
// Vor einem Austausch (alte Quelle deaktivieren, neue aufnehmen) prüfen, ob die
// abgedeckten Dimensionen ERHALTEN bleiben und der Gesamt-Qualitätsscore nicht sinkt.
// Rückgabe: { safe:boolean, lostDimensions:[], scoreDelta, reasons }.
function guardQualityLoss({ outgoing, incoming, outgoingScore = null, incomingScore = null } = {}) {
  const reasons = [];
  const out = outgoing ? (outgoing.canonicalKey ? outgoing : normalizeDescriptor(outgoing)) : null;
  const inc = incoming ? (incoming.canonicalKey ? incoming : normalizeDescriptor(incoming)) : null;
  if (!out || !inc) return { safe: false, lostDimensions: [], scoreDelta: null, reasons: ["outgoing-oder-incoming-fehlt"] };

  // Dimensionsabdeckung: keine der bisher abgedeckten Zuordnungen darf ersatzlos wegfallen.
  const lostDimensions = [];
  for (const dim of REPLACE_DIMS) {
    const lost = (out[dim] || []).filter((v) => !(inc[dim] || []).includes(v));
    if (lost.length) lostDimensions.push({ dimension: dim, lost });
  }
  if (out.universal && !inc.universal) lostDimensions.push({ dimension: "universal", lost: ["universal"] });
  if (lostDimensions.length) reasons.push("dimensionsabdeckung-sinkt");

  // Qualitätsscore darf nicht (nennenswert) sinken, wenn beide Scores vorliegen.
  let scoreDelta = null;
  if (outgoingScore != null && incomingScore != null) {
    scoreDelta = Math.round((incomingScore - outgoingScore) * 1000) / 1000;
    if (scoreDelta < -0.05) reasons.push("qualitaetsscore-sinkt");
  }
  // Vertrauensniveau darf nicht abstürzen.
  const trustRank = { hoch: 3, mittel: 2, niedrig: 1, unbekannt: 1, blockiert: 0 };
  if ((trustRank[inc.trust] || 0) < (trustRank[out.trust] || 0)) reasons.push("vertrauen-sinkt");

  const safe = lostDimensions.length === 0 && !reasons.includes("qualitaetsscore-sinkt") && !reasons.includes("vertrauen-sinkt");
  return { safe, lostDimensions, scoreDelta, reasons };
}

module.exports = {
  isProvider,
  intakeCandidates,
  findStaleSources,
  findDuplicateClusters,
  proposeReplacements,
  guardQualityLoss
};
