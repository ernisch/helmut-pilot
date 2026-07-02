"use strict";

// Helmut Core V3 — C7b: Briefing Engine (Jinja2-Templates, KEINE KI).
// Rendert pro Nutzer ein Briefing aus:
//   - Vorgang     (knowledge_object: headline, vorgang_id, Struktur)
//   - intelligence (die globale KI-Analyse — NUR falls vorhanden/verstanden)
//   - Nutzerprofil (Rolle, Partei, Ausschuss, Name)
// Deterministisch, ohne KI: die KI-Analyse wurde bereits GLOBAL in C8 erzeugt;
// hier wird nur formatiert. Template-Auswahl nach Rolle (MdB/Fraktion/Mitarbeiter).
//
// DSGVO: Es fliesst nur das EIGENE Profil des Nutzers ein (RLS-geschuetzt ueber
// user_id) plus mandantenlose, oeffentliche Vorgangsdaten. Keine fremden PII.

const path = require("path");
const { renderFile } = require("./template");
const { matchProfileToKnowledgeObjects, slug } = require("./matching");

const TEMPLATE_DIR = path.join(__dirname, "templates");
const ROLE_TEMPLATES = { mdb: "mdb.j2", fraktion: "fraktion.j2", mitarbeiter: "mitarbeiter.j2" };

// Account-Rollen (abgeordneter/referent/demo/admin) und optionale Profil-Hints
// auf die drei Briefing-Rollen abbilden. Default: MdB.
function resolveBriefingRole(input) {
  const raw = slug(typeof input === "string"
    ? input
    : (input && (input.briefingRole || input.role || input.rolle || input.type)) || "");
  if (/mdb|abgeordnet|mandat/.test(raw)) return "mdb";
  if (/fraktion|caucus/.test(raw)) return "fraktion";
  if (/mitarbeit|referent|staff|buero|buro|assist/.test(raw)) return "mitarbeiter";
  return "mdb";
}

function templatePathForRole(role) {
  return path.join(TEMPLATE_DIR, ROLE_TEMPLATES[role] || ROLE_TEMPLATES.mdb);
}

// "verstanden" = kein pending-KO und mind. ein Analyse-Feld vorhanden.
function hasIntelligence(ko) {
  return Boolean(
    ko && ko.status !== "pending" &&
    (ko.was_ist_passiert || ko.warum_wichtig || ko.handlungsempfehlung)
  );
}

function toItem(ko, match) {
  const understood = hasIntelligence(ko);
  return {
    headline: ko.headline
      || (ko.was_ist_passiert ? String(ko.was_ist_passiert).slice(0, 120) : "")
      || ko.vorgang_id || "Ohne Titel",
    vorgang_id: ko.vorgang_id || null,
    similarity: match && match.similarity != null ? match.similarity : null,
    matched_features: (match && Array.isArray(match.matched_features)) ? match.matched_features : [],
    hasIntelligence: understood,
    intelligence: understood ? {
      was_ist_passiert: ko.was_ist_passiert || "",
      warum_wichtig: ko.warum_wichtig || "",
      wer_ist_betroffen: ko.wer_ist_betroffen || "",
      zeitdruck: ko.zeitdruck || "mittel",
      handlungsempfehlung: ko.handlungsempfehlung || "",
      risiken: Array.isArray(ko.risiken) ? ko.risiken : [],
      chancen: Array.isArray(ko.chancen) ? ko.chancen : []
    } : null,
    parteien: Array.isArray(ko.parteien) ? ko.parteien : [],
    ausschuesse: Array.isArray(ko.ausschuesse) ? ko.ausschuesse : []
  };
}

// Baut den Render-Kontext. Nutzt vorhandene Matches (C7a) oder berechnet sie
// deterministisch nach (0 KI).
function buildBriefingContext(input = {}) {
  const profile = input.profile || {};
  const kos = Array.isArray(input.knowledgeObjects) ? input.knowledgeObjects : [];
  const byId = new Map(kos.map((k) => [k.id, k]));

  let matches = input.matches;
  if (!Array.isArray(matches)) {
    matches = matchProfileToKnowledgeObjects(profile, kos, { limit: input.limit || 10, filters: input.filters || null });
  }

  const items = [];
  for (const m of matches) {
    const ko = byId.get(m.knowledge_object_id);
    if (!ko) continue;
    items.push(toItem(ko, m));
  }

  return {
    profile,
    slot: input.slot || "Tagesbriefing",
    generatedAt: input.generatedAt || new Date().toISOString().slice(0, 16).replace("T", " "),
    role: resolveBriefingRole(profile),
    items
  };
}

// Reines Rendering (P1-testbar, ohne Storage/Netz).
function renderBriefing(input = {}) {
  const context = buildBriefingContext(input);
  const role = input.role ? resolveBriefingRole(input.role) : context.role;
  const text = renderFile(templatePathForRole(role), context);
  return { role, slot: context.slot, text, itemCount: context.items.length, context };
}

// --- Shadow-Runner (Produktion): rendern + in V3-briefings speichern --------
function defaultDeps() {
  const storage = require("./storage");
  return {
    enabled: () => storage.v3BriefingEnabled(),
    getProfile: (userId) => storage.getProfile(userId),
    listKnowledgeObjects: (o) => storage.listKnowledgeObjects(o),
    listMatchingResults: (o) => storage.listMatchingResults(o),
    saveBriefing: (e) => storage.saveRenderedBriefingV3(e)
  };
}

async function runBriefingShadow(input = {}, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "briefing-disabled" };

  const profile = input.profile || (input.userId ? await deps.getProfile(input.userId) : null);
  const userId = input.userId || (profile && (profile.id || profile.userId || profile.politicianId));
  if (!profile || !userId) return { skipped: true, reason: "no-profile" };

  const kos = Array.isArray(input.knowledgeObjects)
    ? input.knowledgeObjects
    : await deps.listKnowledgeObjects({ limit: 200 });

  let matches = input.matches;
  if (!Array.isArray(matches)) {
    const stored = await deps.listMatchingResults({ userId, limit: input.limit || 10 });
    if (Array.isArray(stored) && stored.length) {
      matches = stored.map((s) => ({
        knowledge_object_id: s.knowledge_object_id,
        vorgang_id: s.vorgang_id,
        similarity: s.similarity,
        matched_features: s.matched_features || []
      }));
    }
  }

  const rendered = renderBriefing({
    profile, knowledgeObjects: kos, matches,
    slot: input.slot, generatedAt: input.generatedAt, limit: input.limit
  });

  const slot = input.slot || "tagesbriefing";
  const day = (input.generatedAt || new Date().toISOString()).slice(0, 10);
  const saved = await deps.saveBriefing({
    id: `bf-${userId}-${slot}-${day}`,
    user_id: userId,
    slot,
    generated_at: input.generatedAt || new Date().toISOString(),
    payload: { role: rendered.role, text: rendered.text, itemCount: rendered.itemCount }
  });

  return {
    userId,
    role: rendered.role,
    itemCount: rendered.itemCount,
    saved: Boolean(saved && saved.saved),
    storeResult: saved
  };
}

module.exports = {
  ROLE_TEMPLATES,
  resolveBriefingRole,
  templatePathForRole,
  hasIntelligence,
  buildBriefingContext,
  renderBriefing,
  runBriefingShadow,
  defaultDeps
};
