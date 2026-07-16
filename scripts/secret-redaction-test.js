"use strict";

// P0-3 / Abnahmekriterien #5 (Secret Redaction) + #9 (Geheimnisse nie in Logs).
// Belegt: redactSensitive entfernt Secrets/Tokens/PII aus freiem Text, ist
// idempotent und fail-safe; classifyPipelineError liefert inhaltsfreie Codes.
// Nur SYNTHETISCHE Secrets (example.invalid / offensichtliche Dummy-Werte).

const { redactSensitive, classifyPipelineError, pipelineErrorFingerprint } = require("../lib/helmut/redact");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Konkrete Env-Secret-Werte werden praezise entfernt ─────────────────────────
const fakeEnv = {
  CRON_SECRET: "supergeheimescronsecret1234567890",
  OPENAI_API_KEY: "sk-FAKE1234567890abcdefFAKE",
  SUPABASE_SERVICE_ROLE_KEY: "servicerolekeyFAKE0987654321fake",
  HELMUT_MONITORING_WEBHOOK_URL: "https://hooks.example.invalid/T000/B000/xyzSECRET"
};
const withSecrets = `Fehler beim Aufruf: Authorization Bearer ${fakeEnv.CRON_SECRET} an ${fakeEnv.HELMUT_MONITORING_WEBHOOK_URL} mit key=${fakeEnv.OPENAI_API_KEY}`;
const red = redactSensitive(withSecrets, fakeEnv);
check("Env-Secret CRON_SECRET entfernt", !red.includes(fakeEnv.CRON_SECRET));
check("Env-Secret OPENAI_API_KEY entfernt", !red.includes(fakeEnv.OPENAI_API_KEY));
check("Env-Secret Webhook-URL entfernt", !red.includes(fakeEnv.HELMUT_MONITORING_WEBHOOK_URL));
check("Redaction-Marker vorhanden", red.includes("[secret-redacted]") || red.includes("[redacted]"));

// ── Generische Muster (auch ohne Env-Kenntnis) ────────────────────────────────
const jwt = "eyJhbGciOiJIUzI1NiI.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N";
check("JWT redigiert", !redactSensitive(`token=${jwt}`).includes(jwt));
check("E-Mail redigiert", redactSensitive("Kontakt max.mustermann@example.invalid").includes("[email-redacted]"));
check("Telefon international redigiert", redactSensitive("ruf +49 30 12345678 an").includes("[phone-redacted]"));
check("Bearer-Token redigiert", /Bearer \[redacted\]/.test(redactSensitive("Authorization: Bearer abcDEF1234567890xyz")));
check("Langer Hex-Blob redigiert", redactSensitive("hash abcdef0123456789abcdef0123456789abcd").includes("[hex-redacted]"));

// ── Idempotenz + Robustheit ───────────────────────────────────────────────────
check("Idempotent (zweifach == einfach)", redactSensitive(red, fakeEnv) === red);
check("null -> leerer String", redactSensitive(null) === "");
check("harmloser Text bleibt lesbar", redactSensitive("Crawl 145 Quellen, 0 Fehler, 48231ms") === "Crawl 145 Quellen, 0 Fehler, 48231ms");

// ── classifyPipelineError: inhaltsfreie Codes ──────────────────────────────────
check("KI-Provider", classifyPipelineError("Azure DeploymentNotFound gpt-5-mini") === "llm-provider");
check("Schema", classifyPipelineError("knowledge object schema validation failed") === "schema-invalid");
check("DB", classifyPipelineError("Supabase storage failed (409): duplicate key") === "db");
check("Timeout", classifyPipelineError("Supabase storage timed out after 10000ms") === "timeout");
check("DNS", classifyPipelineError("getaddrinfo ENOTFOUND host") === "dns");
check("Error-Objekt akzeptiert", classifyPipelineError(new Error("429 rate limit")) === "rate-limit");
check("Code enthaelt keinen Rohtext/URL", !/https?:|gpt-5-mini/.test(classifyPipelineError("Azure gpt-5-mini https://x")));

// ── Fingerprint: stabil + inhaltsfrei ─────────────────────────────────────────
const fp1 = pipelineErrorFingerprint("understanding-eager", "llm-provider", "src-bmas");
const fp2 = pipelineErrorFingerprint("understanding-eager", "llm-provider", "src-bmas");
check("Fingerprint stabil", fp1 === fp2);
check("Fingerprint unterscheidet Prozesse", fp1 !== pipelineErrorFingerprint("matching-shadow", "llm-provider", "src-bmas"));

console.log(`\n${passed}/${passed + failed} Secret-Redaction-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
