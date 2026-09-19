"use strict";

// Einmaliger, ausdruecklich freigegebener Fachversuch. Kein App-/KO-Schreibpfad.
// Fester Prompt und bestehendes Schema, Budget und Anbietersteuerung unveraendert.
const C = require("node:crypto"), Z = require("node:zlib");
const { isDeepStrictEqual } = require("node:util");
const T = require("./privater-nachweis-transport");
const { KNOWLEDGE_OBJECT_SCHEMA: SCHEMA } = require("../lib/helmut/understanding-schema");
const PREFIX = "GIPFEL_EINMAL:";
const BRANCH = "codex/gipfel-einzelversuch-20260918";
const MAIN = "2d1eb705e00ea5f5ff8f351997e429cc16d195c1";
const PROMPT = "3f286a3cddfcf05b30d540790c7825446f5b9cafb75490511c47eaf71f86d5b2";
const SCHEMA_HASH = "bec2e28d8cc968739dd89e79d3d2119b000940be43cc350460231fbd8689202c";
const KEY = "gipfelEinzelversuch20260918";
const sha = value => C.createHash("sha256").update(value).digest("hex");
function fordere(ok, grund) { if (!ok) { const e = new Error(grund); e.code = grund; throw e; } }
function eingabe(text) {
  fordere(typeof text === "string" && text.startsWith(PREFIX) && text.length <= 30000, "GIPFEL_EINGABE");
  const encoded = text.slice(PREFIX.length), bytes = Buffer.from(encoded, "base64");
  fordere(bytes.toString("base64") === encoded, "GIPFEL_EINGABE");
  const a = JSON.parse(Z.gunzipSync(bytes, { maxOutputLength: 40000 }).toString("utf8"));
  fordere(a && Object.keys(a).sort().join(",") === "commit,prompt,publicKey"
    && /^[a-f0-9]{40}$/.test(a.commit) && typeof a.prompt === "string"
    && sha(a.prompt) === PROMPT && sha(JSON.stringify(SCHEMA)) === SCHEMA_HASH, "GIPFEL_BINDUNG");
  T.publicKey(a.publicKey);
  return a;
}
function konfiguration(a, env, now) {
  fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot"
    && env.GITHUB_REF === `refs/heads/${BRANCH}` && env.GITHUB_EVENT_NAME === "workflow_dispatch"
    && env.GITHUB_RUN_ATTEMPT === "1" && env.GITHUB_SHA === a.commit
    && /^\d{5,20}$/.test(env.GITHUB_RUN_ID || ""), "GIPFEL_AUSFUEHRUNG");
  fordere(now.toISOString().slice(0, 10) === "2026-09-18"
    && now.getUTCHours() < 23, "GIPFEL_ZEITFENSTER");
  const erwartet = {
    HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", VERCEL_ENV: "production",
    HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_AZURE_MINUTE: "20",
    HELMUT_ANBIETER_AZURE_TAG: "0", AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini"
  };
  fordere(Object.entries(erwartet).every(([k, v]) => env[k] === v)
    && env.SUPABASE_URL === "https://ddckuvvpcytqbyfmbvie.supabase.co"
    && env.SUPABASE_SERVICE_ROLE_KEY && env.AZURE_OPENAI_KEY && env.HELMUT_CRON_SECRET,
  "GIPFEL_KONFIGURATION");
  fordere(!env.OPENAI_API_KEY && !env.HELMUT_ARTIKELKONTEXT && !env.HELMUT_LLM_USAGE_RELATIONAL
    && !env.NODE_TLS_REJECT_UNAUTHORIZED && !env.NODE_EXTRA_CA_CERTS && !env.NODE_OPTIONS,
  "GIPFEL_FREMDE_KONFIGURATION");
  fordere(require("../lib/helmut/azure-endpunkt").pruefeEndpunkt(env.AZURE_OPENAI_ENDPOINT).gueltig,
    "GIPFEL_AZURE_ZIEL");
}
async function vorflug(env, storage, fetchFn, now) {
  const response = await fetchFn(require("./github-laufzeitpruefung").STATUS_URL, {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" }
  });
  fordere(response.status === 200, "GIPFEL_LAUFZEIT");
  const r = await response.json();
  fordere(r.ok === true && r.reinLesend === true && r.schemaVersion === 1
    && r.production === true && r.commit === MAIN && r.storageSupabase === true
    && r.kommunikationGesperrt === true && r.kohortenQuellenGesperrt === true
    && r.tagesdeckel === 2416 && r.understandingReserve === 702 && r.vorrangreserveReal === 200
    && r.testKosten?.version === 2 && r.testKosten.aktiv === true && r.testKosten.limitUsd === 4,
  "GIPFEL_LAUFZEIT");
  const zeit = encodeURIComponent(now.toISOString());
  for (const path of ["mandate_profiles?select=user_id&aktiv=eq.true&limit=1",
    `pipeline_locks?select=job_name&expires_at=gt.${zeit}&limit=1`,
    `helmut_jobs?select=id&lease_expires_at=gt.${zeit}&limit=1`,
    "process_runs?select=run_id&finished_at=is.null&started_at=gt."
      + encodeURIComponent(new Date(now.getTime() - 20 * 60 * 1000).toISOString()) + "&limit=1"]) {
    // storage exportiert keinen allgemeinen Supabase Zugriff. Diese vier festen
    // Betreiberabfragen sind ausschliesslich begrenzte GETs vor jeder Mutation.
    let rows;
    try {
      const response = await fetchFn(env.SUPABASE_URL + "/rest/v1/" + path, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" }
      });
      fordere(response.status === 200, "GIPFEL_BETRIEBSLESUNG");
      rows = await response.json();
      fordere(Array.isArray(rows), "GIPFEL_BETRIEBSLESUNG");
    } catch (_) {
      // Keine Zugangsdaten, Antwortinhalte oder fremden Fehlertexte ins Log.
      fordere(false, "GIPFEL_BETRIEBSLESUNG");
    }
    fordere(rows.length === 0, "GIPFEL_AKTIVER_BETRIEB");
  }
  const counter = await storage.leseLlmTageszaehler(now.toISOString());
  fordere(counter.ok === true && Number.isSafeInteger(counter.used) && counter.used >= 0
    && counter.limit === 2416, "GIPFEL_ZAEHLER");
  return { commit: r.commit, counter };
}
// Diese CAS Quittung wird nie geloescht/zurueckgesetzt. Auch ein unbekannter
// Ausgang und ein anderer Actions Run bleiben fuer diesen EINEN Auftrag gesperrt.
async function beanspruche(storage, record) {
  await storage.mutateAuthStore(auth => {
    fordere(!Object.hasOwn(auth, KEY), "GIPFEL_BEREITS_BEGONNEN");
    for (const [key, max] of Object.entries({ sessions: 2000, auditEvents: 1000,
      systemErrors: 500, dailyInputs: 2000, llmUsage: 5000, processRuns: 300 })) {
      fordere(Array.isArray(auth[key]) && auth[key].length <= max, "GIPFEL_SPEICHERSTAND");
    }
    auth[KEY] = record;
  });
  const saved = (await storage.readAuthStore())[KEY];
  fordere(isDeepStrictEqual(saved, record), "GIPFEL_START_UNBESTAETIGT");
}
async function ausfuehren({ env = process.env, now = () => new Date(), fetchFn = global.fetch,
  storage = require("../lib/helmut/storage"), request = require("../lib/helmut/ai").requestStructuredJson,
  emit = r => console.log(JSON.stringify(r)), leseEingabe = eingabe } = {}) {
  // Vor jeder Datenbankmutation und jedem Modellaufruf komplett binden.
  const a = leseEingabe(env.CONFIRM_TEXT), start = now();
  konfiguration(a, env, start);
  const context = { runId: env.GITHUB_RUN_ID, commit: a.commit, tag: start.toISOString().slice(0, 10),
    abPosition: 1, anzahl: 1 }; // Ein Eingabeauftrag, KEINE 500er Profilposition.
  const runtime = await vorflug(env, storage, fetchFn, start);
  const before = await storage.readAuthStore();
  const runId = `gipfel-einzel-${env.GITHUB_RUN_ID}`;
  const claim = { version: 1, status: "begonnen", runId, commit: a.commit,
    promptHash: PROMPT, schemaHash: SCHEMA_HASH, begonnenAm: start.toISOString() };
  await beanspruche(storage, claim);
  konfiguration(a, env, now());
  let answer = null, errorCode = null;
  try {
    // Keine internen Reservierungsflags, kein Bypass, kein Fallback/Retry.
    answer = await request(a.prompt, SCHEMA,
      { callType: "understanding", pipelineStep: "gipfel-einzelversuch", politicianId: null, runId },
      "gpt-5-mini", { strict: false, reasoningEffort: "minimal" });
  } catch (e) {
    // Keine fremden Fehlertexte oder Antwortausschnitte im oeffentlichen Log.
    errorCode = /^[A-Z_]{3,60}$/.test(e?.code || "") ? e.code : "GIPFEL_MODELL_FEHLER";
  }
  // Ausgabe SOFORT isoliert sichern, selbst wenn nachfolgende Ablage ausfaellt.
  emit({ typ: "gipfel-antwort", envelope: T.verschluesseln({ version: 1, runId,
    promptHash: PROMPT, schemaHash: SCHEMA_HASH, answer, errorCode, runtime,
    fachlichBestanden: false, inProductionImportiert: false }, a.publicKey, context) });
  const after = await storage.readAuthStore();
  const usage = (after.llmUsage || []).filter(u => u.runId === runId);
  const day = context.tag, oldCalls = before.testKostenTage?.[day]?.calls || {};
  const newCalls = Object.entries(after.testKostenTage?.[day]?.calls || {}).filter(([id]) => !oldCalls[id]);
  const counter = await storage.leseLlmTageszaehler(start.toISOString());
  const kostenBestaetigt = !errorCode && usage.length === 1 && usage[0].success === true
    && usage[0].model === "gpt-5-mini" && newCalls.length === 1
    && newCalls[0][1].status === "abgerechnet" && newCalls[0][1].reserved === 212000
    && newCalls[0][1].cost === require("../lib/helmut/testkosten-budget")
      .tokenKosten(usage[0].promptTokens, usage[0].completionTokens)
    && counter.ok === true && counter.used === runtime.counter.used + 1;
  const result = { version: 1, runId, errorCode, kostenBestaetigt, counter, usage, newCalls,
    fachlichBestanden: false, inProductionImportiert: false };
  emit({ typ: "gipfel-kosten", envelope: T.verschluesseln(result, a.publicKey, context) });
  await storage.mutateAuthStore(auth => {
    fordere(auth[KEY]?.runId === runId && auth[KEY]?.status === "begonnen", "GIPFEL_ABSCHLUSS");
    auth[KEY] = { ...claim, status: kostenBestaetigt ? "antwort-und-kosten-bestaetigt" : "ausgang-offen",
      beendetAm: now().toISOString(), antwortHash: answer === null ? null : sha(JSON.stringify(answer)),
      kostenBestaetigt, errorCode };
  });
  const saved = (await storage.readAuthStore())[KEY];
  fordere(saved?.runId === runId && saved.status !== "begonnen"
    && saved.kostenBestaetigt === kostenBestaetigt, "GIPFEL_ABSCHLUSS_UNBESTAETIGT");
  return { ok: kostenBestaetigt, runId, kostenBestaetigt, fachlichBestanden: false };
}
if (require.main === module) ausfuehren().then(r => {
  console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1;
}).catch(e => {
  const grund = /^GIPFEL_[A-Z_]+$/.test(e?.code || "") ? e.code : "GIPFEL_UNBESTAETIGT";
  console.error(JSON.stringify({ ok: false, grund, automatischeWiederholung: false })); process.exitCode = 1;
});
module.exports = { eingabe, konfiguration, vorflug, beanspruche, ausfuehren, PREFIX, BRANCH, MAIN, PROMPT, SCHEMA_HASH, KEY };
