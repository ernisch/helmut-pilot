"use strict";

// Reiner Laufzeitbeleg. Kein Account, Speicher, Anbieterabruf oder Aktivierung.
const azureEndpunkt = require("./azure-endpunkt");
const kosten = require("./testkosten-budget");
const crypto = require("node:crypto");
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const VERSION = "helmut-provider-runtime-attestation/1";
const MODUS = "provider-konfiguration";
const WINDOW_MS = 20 * 60 * 1000;
const MAX_RESPONSE_BYTES = 32768;
// Ausschliesslich der Root-vorbereitete Verifier, niemals der private Bearer.
// Neue begrenzte Root-Bindung fuer die rein lesende Providerkonfiguration
// zur aktuellen Route vor dem500er Test am06.10.2026. Bearer bleibt ausserhalb Git.
// Anfragefenster weiterhin exakt20 Minuten; kein Modell- oder Datenaufruf.
const OPERATION_AUTH = Object.freeze({
  operationNonce: "592daf3e-8b6a-45c6-a722-0ea4061cb26c",
  bearerSha256: "614068203bd0b30d3387cb4aad464b40b86a187c9781af074349da52a5c3170c",
  expiresAtUTC: "2026-10-06T20:00:00.000Z"
});
const ALLOW = Object.freeze([
  "AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_DEPLOYMENT", "HELMUT_TEXT_MODEL", "OPENAI_MODEL",
  "HELMUT_UNDERSTANDING_MODEL", "HELMUT_EMBEDDING_API_BASE", "HELMUT_EMBEDDING_DEPLOYMENT",
  "HELMUT_EMBEDDING_MODEL", "HELMUT_EMBEDDING_DIM", "HELMUT_EMBEDDING_PREIS_PRO_MTOK",
  "HELMUT_Z3B_AZURE_MODELL", "HELMUT_Z3B_AZURE_DEPLOYMENTART", "HELMUT_Z3B_AZURE_REGION",
  "HELMUT_Z3B_AZURE_PREIS_INPUT_USD_MIO", "HELMUT_Z3B_AZURE_PREIS_OUTPUT_USD_MIO",
  "HELMUT_Z3B_AZURE_PREISQUELLE", "HELMUT_Z3B_AZURE_PREISDATUM_UTC"
]);
const LOOPBACK_KEY = "HELMUT_KI_LOOPBACK_ERLAUBT";
const SECRET_NAMES = Object.freeze([
  "AZURE_OPENAI_KEY", "AZURE_OPENAI_API_KEY", "OPENAI_API_KEY", "HELMUT_EMBEDDING_API_KEY"
]);
const safeText = value => typeof value === "string" && Buffer.byteLength(value, "utf8") <= 512
  && !/[\u0000-\u0020\u007f-\u009f]/.test(value);
const modelId = value => safeText(value) && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,95}$/.test(value);

// Dieselbe Modellauswahl fuer den Sender und den Beleg; Alt-Defaults bleiben.
// Rohwerte verlassen diesen internen Resolver nur durch die Typpruefung unten.
function resolveModels(env) {
  const azure = Boolean(env.AZURE_OPENAI_KEY && env.AZURE_OPENAI_ENDPOINT);
  const activeModel = azure ? env.AZURE_OPENAI_DEPLOYMENT || "gpt-5-mini"
    : env.HELMUT_TEXT_MODEL || env.OPENAI_MODEL || DEFAULT_MODEL;
  return {
    azure, activeModel,
    activeModelSource: azure ? (env.AZURE_OPENAI_DEPLOYMENT ? "AZURE_OPENAI_DEPLOYMENT" : "code-default")
      : env.HELMUT_TEXT_MODEL ? "HELMUT_TEXT_MODEL" : env.OPENAI_MODEL ? "OPENAI_MODEL" : "code-default",
    understandingModel: azure ? activeModel : env.HELMUT_UNDERSTANDING_MODEL || "gpt-5-mini",
    understandingModelSource: azure ? (env.AZURE_OPENAI_DEPLOYMENT ? "AZURE_OPENAI_DEPLOYMENT" : "code-default")
      : env.HELMUT_UNDERSTANDING_MODEL ? "HELMUT_UNDERSTANDING_MODEL" : "code-default"
  };
}

function validateValue(key, value, loopback) {
  if (!safeText(value)) return null;
  if (key === "AZURE_OPENAI_ENDPOINT") {
    const endpoint = azureEndpunkt.pruefeEndpunkt(value, { erlaubeLoopback: loopback });
    return endpoint.gueltig ? endpoint.basis : null;
  }
  if (key === "HELMUT_EMBEDDING_API_BASE" || key === "HELMUT_Z3B_AZURE_PREISQUELLE") {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || !u.hostname || u.username || u.password || u.search || u.hash
        || (u.port && u.port !== "443")) return null;
      if (key === "HELMUT_EMBEDDING_API_BASE"
        && !["/", "/v1", "/v1/", "/openai/v1", "/openai/v1/"].includes(u.pathname)) return null;
      return u.href;
    } catch (_) { return null; }
  }
  if (key.endsWith("DEPLOYMENT")) return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value) ? value : null;
  if (key.endsWith("DEPLOYMENTART")) return ["global", "data-zone", "regional"].includes(value) ? value : null;
  if (key.endsWith("REGION")) return /^[a-z][a-z0-9]{1,31}$/.test(value) ? value : null;
  if (key.endsWith("PREISDATUM_UTC")) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const n = Date.parse(value + "T00:00:00.000Z");
    return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value ? value : null;
  }
  if (key.endsWith("DIM")) return /^[1-9][0-9]{0,5}$/.test(value) && Number(value) <= 65536 ? value : null;
  if (key.includes("PREIS_")) return /^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,12})?$/.test(value)
    && Number(value) <= 1000000 ? value : null; // Ausgabe bleibt exakte Dezimalzeichenfolge.
  return modelId(value) ? value : null;
}

function readConfiguration(env, engine) {
  const models = resolveModels(env), loopback = env[LOOPBACK_KEY] === "1";
  const selected = ALLOW.map(key => {
    if (env[key] === undefined) return { key, status: "ABSENT", defaultProvenByAbsence: false };
    const value = validateValue(key, env[key], loopback);
    return value === null ? { key, status: "INVALID_VALUE_DISCARDED" }
      : { key, status: "VALIDATED_CURRENT_RUNTIME_CONFIG", value };
  });
  const resolvedModel = (value, source) => modelId(value)
    ? { status: "VALIDATED_RESOLVED_MODEL_NAME", value, source, configuredRuntimeValue: source !== "code-default" }
    : { status: "INVALID_MODEL_NAME_DISCARDED", source };
  const endpoint = selected.find(x => x.key === "AZURE_OPENAI_ENDPOINT");
  const intendedAzure = Boolean(env.AZURE_OPENAI_KEY || env.AZURE_OPENAI_ENDPOINT);
  const sendEnabled = engine.enabled === true;
  return {
    selected,
    loopback: { namePresent: Object.hasOwn(env, LOOPBACK_KEY), exactOne: loopback },
    // Namensexistenz ist keine Aussage ueber Gueltigkeit oder Nutzbarkeit.
    // Insbesondere werden weder Secretwerte noch deren truthy-Status ausgegeben.
    secretNamePresence: Object.fromEntries(SECRET_NAMES.map(key => [key, Object.hasOwn(env, key)])),
    resolved: {
      sendEnabled, intendedProvider: intendedAzure ? "azure" : sendEnabled ? "openai" : "none",
      providerForSend: sendEnabled ? (models.azure ? "azure" : "openai") : null,
      responsesURL: sendEnabled ? (models.azure && endpoint.value
        ? endpoint.value + "/openai/v1/responses" : models.azure ? null : OPENAI_API_URL) : null,
      activeModel: resolvedModel(models.activeModel, models.activeModelSource),
      understandingModel: resolvedModel(models.understandingModel, models.understandingModelSource),
      loopbackExactOne: loopback,
      azureConfigurationUsable: intendedAzure ? engine.azureConfigurationUsable === true : null
    },
    conservativeTextReservationPolicy: kosten.konfiguration(env),
    sourcePreparation: readSourcePreparationConfiguration(env),
    configuredZ3bMetadataIsNotRuntimeTariffBinding: true,
    actualAzureDeploymentSkuProven: false, currentAccountTariffProven: false,
    paidModelCalls: 0, nativeCalls: 0, productionCostGo: false
  };
}

// Non-secret preparation gates only. No key values, database reads or activation.
function readSourcePreparationConfiguration(env) {
  const { flagInfo } = require("./flags");
  const flags = ["HELMUT_STORAGE_BACKEND", "HELMUT_V3_STORE", "HELMUT_PROFILE_DB_MODE",
    "HELMUT_PROFILE_DB_EXCLUSIVE", "HELMUT_TESTKOHORTE_QUELLEN", "HELMUT_SOURCE_MODE", "HELMUT_LANDESMODULE"].map(key => {
    const info = ["HELMUT_SOURCE_MODE", "HELMUT_LANDESMODULE"].includes(key) ? flagInfo(key, env)
      : { wert: Object.hasOwn(env, key) ? env[key] : null, quelle: Object.hasOwn(env, key) ? "env" : "default" };
    if (info.wert === null || info.wert === undefined) return { key, status: "ABSENT", defaultProvenByAbsence: false, source: info.quelle };
    const value = typeof info.wert === "string" && info.wert.trim().toLowerCase();
    const allowed = key === "HELMUT_STORAGE_BACKEND" ? ["supabase", "local"]
      : key === "HELMUT_TESTKOHORTE_QUELLEN" ? ["aktiv", "off"]
        : key === "HELMUT_SOURCE_MODE" ? ["on", "off", "shadow", "live", "active"]
          : ["on", "off", "1", "0", "true", "false", "yes", "no"];
    const valid = key === "HELMUT_LANDESMODULE" ? typeof value === "string" && value.length <= 256
      && value.split(/[,;\s]+/).filter(Boolean).every(v => ["berlin", "brandenburg"].includes(v))
      : allowed.includes(value);
    return valid ? { key, status: "VALIDATED_CURRENT_RUNTIME_CONFIG", value, source: info.quelle }
      : { key, status: "INVALID_VALUE_DISCARDED", source: info.quelle };
  });
  return { version: "helmut-source-preparation-runtime-gates/1", flags,
    credentialNamePresence: Object.fromEntries(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
      "SUPABASE_SECRET_KEY", "DIP_API_KEY"].map(key => [key, Object.hasOwn(env, key)])),
    credentialUsabilityProven: false, paidModelCalls: 0, nativeCalls: 0, profileActivation: false };
}

const uuid = value => typeof value === "string"
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const commit = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
function utc(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value ? n : null;
}
function deploymentHost(value) {
  return typeof value === "string" && value.length <= 253
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/.test(value) ? value : null;
}

function verifyOperationBearer(authorization, nonce, observedMs, expected) {
  const expiresMs = expected && utc(expected.expiresAtUTC);
  if (typeof authorization !== "string" || !/^Bearer [\x21-\x7e]{32,256}$/.test(authorization)
    || !expected || !uuid(expected.operationNonce) || nonce !== expected.operationNonce
    || !Number.isFinite(observedMs) || expiresMs === null || observedMs >= expiresMs
    || !/^[a-f0-9]{64}$/.test(expected.bearerSha256)) return false;
  try {
    const actual = crypto.createHash("sha256").update(authorization.slice(7), "utf8").digest();
    return actual.length === 32 && crypto.timingSafeEqual(actual, Buffer.from(expected.bearerSha256, "hex"));
  } catch (_) { return false; }
}

// Dieser Modus wird VOR Account-/Mandatsaufloesung vom bestehenden Cronpfad gerufen.
// Der normale Cronpfad behaelt seine bisherige Auth. Nur dieser neue Modus hat
// den einmaligen Root-Verifier; ein globaler Einmalverbrauch wird NICHT behauptet.
function handleRequest(request, response, url, { jsonHeaders, readRuntimeConfiguration,
  env = process.env, now = () => new Date() }) {
  const stop = (status, reason, extra = {}) => {
    response.writeHead(status, jsonHeaders(extra));
    response.end(JSON.stringify({ ok: false, reason }));
  };
  if (request.method !== "GET") return stop(405, "only-get", { Allow: "GET" });
  // Keine Query-Credentials und kein oeffentlicher oder anderer Auth-Fallback.
  if (url.search !== "?modus=" + MODUS || typeof request.headers.authorization !== "string"
    || !request.headers.authorization.startsWith("Bearer ")) return stop(403, "bounded-bearer-request-required");
  const h = request.headers, nonce = h["x-helmut-root-nonce"];
  const admitted = utc(h["x-helmut-root-admitted-at"]), deadline = utc(h["x-helmut-root-deadline-at"]);
  const observed = now(), observedMs = observed.getTime();
  if (env.VERCEL_ENV !== "production"
    || !verifyOperationBearer(h.authorization, nonce, observedMs, OPERATION_AUTH))
    return stop(403, "operation-auth-unbound");
  if (!uuid(nonce) || admitted === null || deadline === null || deadline - admitted !== WINDOW_MS
    || !Number.isFinite(observedMs) || observedMs < admitted || observedMs >= deadline)
    return stop(400, "root-window-or-nonce-unbound");
  const runtimeCommit = env.VERCEL_GIT_COMMIT_SHA, runtimeHost = deploymentHost(env.VERCEL_URL);
  if (env.VERCEL_ENV !== "production" || !commit(runtimeCommit) || runtimeHost === null)
    return stop(503, "runtime-deployment-identity-unbound");
  if (!commit(h["x-helmut-production-commit"]) || h["x-helmut-production-commit"] !== runtimeCommit
    || h["x-helmut-deployment-host"] !== runtimeHost) return stop(409, "runtime-deployment-drift");
  try {
    const configuration = readRuntimeConfiguration();
    const completed = now(), completedMs = completed.getTime();
    if (!Number.isFinite(completedMs) || completedMs < observedMs || completedMs >= deadline
      || completedMs >= Date.parse(OPERATION_AUTH.expiresAtUTC))
      return stop(400, "root-window-or-nonce-unbound");
    const result = { ok: true, version: VERSION, reinLesend: true, rootNonce: nonce,
      rootAdmittedAtUTC: h["x-helmut-root-admitted-at"], rootDeadlineAtUTC: h["x-helmut-root-deadline-at"],
      observedAtUTC: observed.toISOString(), completedAtUTC: completed.toISOString(), production: true, commit: runtimeCommit,
      deploymentHost: runtimeHost,
      deploymentId: typeof env.VERCEL_DEPLOYMENT_ID === "string" && /^dpl_[A-Za-z0-9]{1,100}$/.test(env.VERCEL_DEPLOYMENT_ID)
        ? env.VERCEL_DEPLOYMENT_ID : null,
      runtimeIdentityMatchesRequest: true,
      serverGlobalOneUseProven: false,
      externalDeploymentRuntimeAcceptance: false, actualAzureDeploymentSkuProven: false,
      currentAccountTariffProven: false, productionCostGo: false, configuration };
    const body = JSON.stringify(result);
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) return stop(500, "bounded-runtime-result-unavailable");
    response.writeHead(200, jsonHeaders()); response.end(body);
  } catch (_) { return stop(500, "bounded-runtime-result-unavailable"); }
}

module.exports = { VERSION, MODUS, ALLOW, LOOPBACK_KEY, SECRET_NAMES, OPENAI_API_URL,
  resolveModels, readConfiguration, verifyOperationBearer, handleRequest };
