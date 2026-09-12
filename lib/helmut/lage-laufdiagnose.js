"use strict";

const crypto = require("node:crypto");
const { sichereDiagnose } = require("./lage-textqualitaet");

// Nur feste Rueckgabeklassen des Lagepfads, niemals Exception-/Modellfreitext.
const GRUENDE = new Set([
  "no-profile", "v3-disabled", "store-error", "no-vorgaenge", "no-current-sources",
  "existing-result", "generating", "budget", "ai-unavailable", "error", "profil-fehler",
  "ai-cost-receipt-missing", "ai-response-incomplete", "ai-response-invalid-json",
  "ai-provider-unavailable", "ai-text-paragraph-count", "ai-text-empty-or-type",
  "ai-text-source-reference", "ai-text-profile-reference", "ai-text-visible-id",
  "ai-text-word-limit", "ai-text-quality-incomplete", "ai-text-source-support",
  "ai-text-evidence-quote", "ai-text-repetition"
]);

function mandatsErgebnis(userId, result = {}) {
  if (typeof userId !== "string" || !userId) return null;
  const lageGespeichert = result.available === true && result.demo !== true && result.pendingNarrative !== true;
  const grund = result.demo === true ? "demo"
    : result.pendingNarrative === true ? "narrativ-ausstehend"
    : lageGespeichert ? (result.fromCache === true ? "cache-vorhanden" : "gespeichert")
    : GRUENDE.has(result.reason) || /^ai-provider-http-[45][0-9]{2}$/.test(result.reason || "")
      ? result.reason : "unbekannter-grund";
  const diagnose = sichereDiagnose(result.diagnose);
  return {
    // Gleiche kanonische Kennungsbindung wie beim manuellen Textnachlauf.
    mandatHash: crypto.createHash("sha256").update(JSON.stringify(userId)).digest("hex"),
    gestartet: true, lageGespeichert, briefingGespeichert: false, grund,
    ...(diagnose ? { diagnose } : {})
  };
}

module.exports = { mandatsErgebnis, sichereDiagnose };
