"use strict";

// Helmut — zentrale Redaction + Fehlerklassifikation (DSGVO / Secret-Hygiene).
// ============================================================================
// Ein Ort fuer zwei verbindliche Abnahmekriterien:
//   (#2/#9) systemErrors & Alarmkanaele duerfen NIE Secrets/Zugangsdaten oder
//           personenbezogene Kontaktdaten enthalten.
//   (P0-3)  Pipeline-Fehler werden zu einem INHALTSFREIEN Fehlertyp verdichtet —
//           der rohe Fehlertext (der URLs, Tokens, E-Mail, Volltext-Fragmente
//           enthalten koennte) wird NICHT gespeichert.
//
// Reines Modul (keine I/O, keine weiteren lib-Abhaengigkeiten) — voll testbar.

// Namen von Umgebungsvariablen, deren WERTE niemals in Logs/Fehlern/Alarmen
// auftauchen duerfen. Wird zur Laufzeit gegen die tatsaechlichen Werte geprueft
// (falls ein Fehlertext versehentlich einen Secret-Wert einbettet).
const SECRET_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY",
  "SUPABASE_JWT_SECRET", "SUPABASE_ANON_KEY", "PILOT_SECRET", "HELMUT_PILOT_SECRET",
  "HELMUT_ADMIN_SECRET", "CRON_SECRET", "HELMUT_CRON_SECRET",
  "OPENAI_API_KEY", "AZURE_OPENAI_KEY", "DIP_API_KEY",
  "VAPID_PRIVATE_KEY", "CALLMEBOT_APIKEY", "HELMUT_MONITORING_WEBHOOK_URL",
  "HELMUT_RESEND_API_KEY",
  // Haertung 2026-09-01 (Audit §16.8b): der Azure-ENDPUNKT fehlte hier als
  // einziger Azure-Wert. HELMUT_MONITORING_WEBHOOK_URL steht seit jeher in
  // dieser Liste — eine URL gilt hier also grundsaetzlich als schuetzenswert,
  // der Azure-Endpunkt war die Ausnahme. Er nennt die Azure-Ressource des
  // Mandanten und gehoert weder in systemErrors noch in eine Admin-Anzeige.
  "AZURE_OPENAI_ENDPOINT"
];

// Der Endpunkt leckt in der Praxis meist NICHT als vollstaendige URL, sondern
// als blosser Hostname in einer Netzfehlermeldung ("getaddrinfo ENOTFOUND
// <ressource>.openai.azure.com"). Der Wertabgleich oben trifft das nicht.
// Deshalb zusaetzlich eine Musterregel ueber die Azure-KI-Hostfamilien — sie
// wirkt auch dann, wenn die Umgebung nicht lesbar ist oder der Hostname aus
// einer ganz anderen Quelle stammt.
const AZURE_KI_HOST = /\b[a-z0-9][a-z0-9-]*\.(?:openai\.azure\.com|services\.ai\.azure\.com|cognitiveservices\.azure\.com)\b/gi;

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Entfernt Secrets/Tokens/PII aus einem freien Text. Idempotent, fail-safe:
// gibt bei jedem Eingang einen String zurueck. Reihenfolge: erst konkrete
// Env-Secret-Werte (praezise), dann generische Muster.
function redactSensitive(input, env = process.env) {
  let text = input == null ? "" : String(input);

  // 1) Konkrete Secret-WERTE aus der Umgebung (praeziseste Redaction zuerst).
  try {
    for (const name of SECRET_ENV_NAMES) {
      const val = env && env[name];
      if (typeof val === "string" && val.length >= 6) {
        text = text.split(val).join("[secret-redacted]");
      }
    }
  } catch (_) { /* env unlesbar -> generische Muster reichen */ }

  // 1b) Azure-KI-Hostnamen (auch ohne Schema/Pfad) — siehe AZURE_KI_HOST.
  text = text.replace(AZURE_KI_HOST, "[azure-endpoint-redacted]");

  // 2) Generische Muster.
  text = text
    // JWTs (eyJ… .… .…)
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[jwt-redacted]")
    // Authorization: Bearer <token>
    .replace(/bearer\s+[A-Za-z0-9._\-]{8,}/gi, "Bearer [redacted]")
    // sk-/pk-/key=/token=/secret= <blob>
    .replace(/\b(sk|pk|api[_-]?key|key|token|secret|apikey)[-_]?\s*[=:]\s*[A-Za-z0-9._\-]{8,}/gi, "$1=[redacted]")
    .replace(/\bsk-[A-Za-z0-9]{16,}\b/g, "[key-redacted]")
    // E-Mail
    .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, "[email-redacted]")
    // Telefonnummern (konservativ: internationales +.. oder deutsches 0..-Format)
    .replace(/\+\d[\d\s\-()]{7,}\d/g, "[phone-redacted]")
    .replace(/\b0\d{2,4}[\s\-/]\d{4,}\b/g, "[phone-redacted]")
    // lange Hex-/Base64-Blobs (Keys/Hashes) — NACH den spezifischen Mustern
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, "[hex-redacted]");

  return text;
}

// Klassifiziert einen rohen Pipeline-/Crawl-/KI-/DB-Fehler zu einem stabilen,
// INHALTSFREIEN Fehlertyp. Der rohe Text wird bewusst NICHT zurueckgegeben.
function classifyPipelineError(errorOrMessage) {
  const raw = errorOrMessage && errorOrMessage.message ? errorOrMessage.message : errorOrMessage;
  const m = String(raw || "").toLowerCase();
  if (!m) return "unknown";
  // KI / Provider
  if (m.includes("deploymentnotfound") || m.includes("azure") || m.includes("openai") || m.includes("gpt-")) return "llm-provider";
  if (m.includes("rate limit") || m.includes("429")) return "rate-limit";
  // Datenbank / Storage (starke, spezifische Signale ZUERST — vor der generischen
  // Schema-Heuristik, sonst faengt ein Domainname wie "example.invalid" faelschlich
  // die Schema-Klasse ab).
  if (m.includes("timed out") || m.includes("timeout") || m.includes("aborterror") || m.includes("aborted")) return "timeout";
  if (m.includes("supabase") || m.includes("postgrest") || m.includes("row-level") || m.includes("rls") || m.includes("constraint") || m.includes("duplicate key")) return "db";
  // Schema / Validierung (spezifische Formulierungen, NICHT das blosse Wort "valid").
  if (m.includes("schema") || m.includes("validation") || m.includes("failed validation") || m.includes("not valid") || m.includes("invalid json") || m.includes("invalid response")) return "schema-invalid";
  // Netz
  if (m.includes("enotfound") || m.includes("getaddrinfo") || m.includes("dns")) return "dns";
  if (m.includes("econnrefused") || m.includes("econnreset") || m.includes("socket") || m.includes("network")) return "connection";
  if (m.includes("certificate") || m.includes("tls") || m.includes("ssl")) return "tls";
  // Crawl
  if (m.includes("empty feed")) return "empty-feed";
  if (/\b5\d\d\b/.test(m)) return "http-5xx";
  if (/\b4\d\d\b/.test(m)) return "http-4xx";
  if (m.includes("parse")) return "parse";
  return "unknown";
}

// Stabiler, inhaltsfreier Fingerabdruck fuer die Dedup identischer Fehler
// (gleicher Prozess + Fehlertyp + Quelle). KEINE Rohdaten im Fingerprint.
function pipelineErrorFingerprint(process, errorType, sourceId) {
  return [String(process || "pipeline"), String(errorType || "unknown"), String(sourceId || "")].join("|").slice(0, 160);
}

module.exports = {
  SECRET_ENV_NAMES,
  redactSensitive,
  classifyPipelineError,
  pipelineErrorFingerprint
};
