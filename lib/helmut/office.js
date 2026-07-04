"use strict";

// Helmut Core V3 — C9: Buero-Engine.
// "Einmal verstehen (global, KI) -> viele Formate (pro Nutzer, 1 KI-Call pro Format + Cache)".
//
// Ablauf:
//   1. Flag HELMUT_V3_OFFICE muss AN sein (Default AUS).
//   2. Vorgang muss understanding_status='complete' haben (KO fertig analysiert).
//   3. Cache-Check: Gleicher User + Vorgang + Kanal -> Cache-Hit, kein KI-Call.
//   4. Rate-Gate: Max. HELMUT_OFFICE_DAILY_LIMIT (Default 10) Outputs pro User/Tag.
//   5. KI-Call (Azure gpt-5-mini, plain text): Prompt aus .j2-Template rendern.
//   6. Speichern in office_outputs (dient als Cache fuer naechste Anfrage).
//
// DSGVO: Der KI-Prompt enthaelt NUR oeffentliche KO-Analyse-Felder (keine PII,
// kein userId). Das LLM-Usage-Log traegt nur callType + vorgangId (kein Prompt,
// keine Antwort, kein userId). Ergebnis in office_outputs ist RLS-geschuetzt.

const path = require("path");

const OFFICE_CHANNELS = [
  "rede", "pressemitteilung", "linkedin", "statement",
  "newsletter", "talking_points", "twitter", "instagram",
  "facebook", "bluesky", "tiktok", "youtube_community",
  "buergerantwort", "krisenstatement", "interview_vorbereitung"
];

const TEMPLATES_DIR = path.join(__dirname, "templates", "office");

function isOfficeEnabled() {
  const v = String(process.env.HELMUT_V3_OFFICE || "").trim().toLowerCase();
  return ["1", "true", "on", "yes"].includes(v);
}

function isValidChannel(channel) {
  return OFFICE_CHANNELS.includes(String(channel || ""));
}

// Baut den Template-Kontext: NUR oeffentliche KO-Analyse-Felder, kein userId.
function buildOfficeContext(channel, ko) {
  return {
    channel: String(channel),
    vorgang: {
      headline: String(ko.headline || "").slice(0, 300),
      was_ist_passiert: String(ko.was_ist_passiert || "").slice(0, 800),
      warum_wichtig: String(ko.warum_wichtig || "").slice(0, 500),
      wer_ist_betroffen: String(ko.wer_ist_betroffen || "").slice(0, 400),
      zeitdruck: String(ko.zeitdruck || "mittel"),
      handlungsempfehlung: String(ko.handlungsempfehlung || "").slice(0, 400),
      risiken: (Array.isArray(ko.risiken) ? ko.risiken : []).slice(0, 5).map(String),
      chancen: (Array.isArray(ko.chancen) ? ko.chancen : []).slice(0, 5).map(String),
      parteien: (Array.isArray(ko.parteien) ? ko.parteien : []).slice(0, 5).map(String)
    }
  };
}

// Hauptfunktion: Office-Output generieren (oder Cache-Hit zurueckgeben).
// deps = { storage, ai, template } — injizierbar fuer Tests.
async function generateOfficeOutput(userId, vorgangId, channel, ko, deps = {}) {
  const storage = deps.storage || require("./storage");
  const ai = deps.ai || require("./ai");
  const tmpl = deps.template || require("./template");

  if (!isOfficeEnabled()) return { skipped: true, reason: "office-disabled" };
  if (!isValidChannel(channel)) return { skipped: true, reason: "invalid-channel" };
  if (!userId || !vorgangId) return { skipped: true, reason: "missing-params" };
  if (!ko || ko.understanding_status !== "complete") return { skipped: true, reason: "ko-not-ready" };

  // Cache-Check
  const cached = await storage.getOfficeOutput(userId, vorgangId, channel);
  if (cached) return { status: "cache-hit", content: cached.content, id: cached.id };

  // Kosten-Fix: zwischen Cache-Check und Speichern gab es keinen Lock — ein
  // Doppelklick oder zwei offene Tabs fuer dieselbe (Nutzer,Vorgang,Kanal)-
  // Kombination konnten beide den Cache verfehlen und je einen eigenen, doppelt
  // bezahlten KI-Call ausloesen. Gleicher kurzlebiger Lock wie beim bestehenden
  // Lage-Briefing (storage.acquirePipelineLock). Fail-open (typeof-Check), falls
  // ein Test/Caller ein storage-Mock ohne Lock-Funktionen injiziert — dann bleibt
  // das Verhalten exakt wie zuvor.
  const lockName = `office-${userId}-${vorgangId}-${channel}`;
  const hasLock = typeof storage.acquirePipelineLock === "function" && typeof storage.releasePipelineLock === "function";
  const locked = hasLock ? await storage.acquirePipelineLock(lockName, 30 * 1000) : true;
  if (!locked) return { skipped: true, reason: "in-progress" };

  try {
    // Der Lock-Halter koennte zwischenzeitlich fertig gespeichert haben.
    const cachedAfterLock = await storage.getOfficeOutput(userId, vorgangId, channel);
    if (cachedAfterLock) return { status: "cache-hit", content: cachedAfterLock.content, id: cachedAfterLock.id };

    // Rate-Gate (pro Nutzer/Tag)
    const budget = await storage.canSpendOfficeOutput(userId);
    if (!budget.allowed) return { skipped: true, reason: "budget-denied" };

    // Prompt aus Template rendern
    const templatePath = path.join(TEMPLATES_DIR, `${channel}.j2`);
    const ctx = buildOfficeContext(channel, ko);
    let prompt;
    try {
      prompt = tmpl.renderFile(templatePath, ctx);
    } catch (_) {
      return { skipped: true, reason: "template-error" };
    }

    // KI-Call — nur callType + vorgangId im meta (kein userId, kein Prompt-Inhalt)
    let content;
    try {
      content = await ai.requestText(prompt, { callType: "office-output", vorgangId });
    } catch (_) {
      return { skipped: true, reason: "ai-error" };
    }

    if (!content || typeof content !== "string" || !content.trim()) {
      return { skipped: true, reason: "empty-response" };
    }

    // Speichern (dient als Cache fuer naechste Anfrage)
    const id = storage.officeOutputId(userId, vorgangId, channel);
    const model = typeof ai.activeModelName === "function" ? ai.activeModelName() : undefined;
    const saved = await storage.saveOfficeOutput({
      id,
      user_id: userId,
      knowledge_object_id: `ko-${vorgangId}`,
      channel,
      content: content.trim(),
      model
    });
    if (saved && saved.skipped) return { status: "save-skipped", reason: saved.reason, content: content.trim() };

    return { status: "generated", content: content.trim(), id };
  } finally {
    if (hasLock) await storage.releasePipelineLock(lockName);
  }
}

module.exports = { OFFICE_CHANNELS, isOfficeEnabled, isValidChannel, generateOfficeOutput };
