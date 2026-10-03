"use strict";

// Separater Root-Zweck: genau ein enger Konfigurationsbeleg, keine Daten/Anbieter.
const frische = require("./briefing-frische");
const { verifyOperationBearer } = require("./provider-runtime-attestation");
const VERSION = "helmut-relevanz-tage-runtime-witness/1";
const MODUS = "relevanz-tage";
const KEY = "HELMUT_BRIEFING_RELEVANZ_TAGE";
const WINDOW_MS = 20 * 60 * 1000;
const MAX_RESPONSE_BYTES = 4096;
// Root proposed-auth-contract.json SHAb416cdb162b19cf9efafc4c525a80eed0507ad54709acd2f32e8426141d983bb.
// Vom verbrauchten Provider-Zweck getrennt; kein Secret oder Auth-Override.
const OPERATION_AUTH = Object.freeze({
  operationNonce: "0e8809b7-7fb3-433a-944c-7c3213d1153f",
  bearerSha256: "b582584d1990b774a0f4355da2f5c8d8b81d9acaf4c34f4130d7fb9a7881d18b",
  expiresAtUTC: "2026-10-04T00:46:33.000Z"
});

function readConfiguration(env = process.env) {
  // Ein synchroner Wert-Snapshot; derselbe produktive Resolver, keine strengere
  // erfundene Zahlensyntax. Ungueltige/fehlende Werte behalten seinen Fallback.
  const raw = env[KEY], n = Number(raw), configured = Number.isFinite(n) && n > 0;
  const value = frische.relevanzTage({ [KEY]: raw });
  return { key: KEY, value, source: configured ? KEY : "code-default",
    namePresent: Object.hasOwn(env, KEY), configuredRuntimeValueValidated: configured,
    resolvedValueValidated: Number.isFinite(value) && value > 0,
    status: configured ? "VALIDATED_CURRENT_RUNTIME_CONFIG"
      : Object.hasOwn(env, KEY) ? "INVALID_VALUE_DEFAULT_FALLBACK" : "ABSENT_DEFAULT_FALLBACK",
    defaultFallbackUsed: !configured, defaultValue: frische.relevanzTage({}) };
}

const uuid = value => typeof value === "string"
  && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const commit = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const deploymentId = value => typeof value === "string" && /^dpl_[A-Za-z0-9]{1,100}$/.test(value);
function utc(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}
function deploymentHost(value) {
  return typeof value === "string" && value.length <= 253
    && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/.test(value) ? value : null;
}

// Vor dem Account-Vorlauf; kein globaler Server-Einmalverbrauch wird behauptet.
// Root muss seinen neuen Zweck physisch und im Caller einmalig reservieren.
function handleRequest(request, response, url, { jsonHeaders,
  env = process.env, now = () => new Date() }) {
  const stop = (status, reason, extra = {}) => {
    response.writeHead(status, jsonHeaders(extra)); response.end(JSON.stringify({ ok: false, reason }));
  };
  if (request.method !== "GET") return stop(405, "only-get", { Allow: "GET" });
  if (url.search !== "?modus=" + MODUS || typeof request.headers.authorization !== "string"
    || !request.headers.authorization.startsWith("Bearer ")) return stop(403, "bounded-bearer-request-required");
  const h = request.headers, nonce = h["x-helmut-root-nonce"], observed = now(), observedMs = observed.getTime();
  if (env.VERCEL_ENV !== "production"
    || !verifyOperationBearer(h.authorization, nonce, observedMs, OPERATION_AUTH)) return stop(403, "operation-auth-unbound");
  const admitted = utc(h["x-helmut-root-admitted-at"]), deadline = utc(h["x-helmut-root-deadline-at"]);
  if (!uuid(nonce) || admitted === null || deadline === null || deadline - admitted !== WINDOW_MS
    || !Number.isFinite(observedMs) || observedMs < admitted || observedMs >= deadline) return stop(400, "root-window-or-nonce-unbound");
  const runtimeCommit = env.VERCEL_GIT_COMMIT_SHA, runtimeHost = deploymentHost(env.VERCEL_URL), runtimeId = env.VERCEL_DEPLOYMENT_ID;
  if (!commit(runtimeCommit) || runtimeHost === null || !deploymentId(runtimeId)) return stop(503, "runtime-deployment-identity-unbound");
  if (h["x-helmut-production-commit"] !== runtimeCommit || h["x-helmut-deployment-host"] !== runtimeHost
    || h["x-helmut-deployment-id"] !== runtimeId) return stop(409, "runtime-deployment-drift");
  try {
    const configuration = readConfiguration(env), completed = now(), completedMs = completed.getTime();
    if (!configuration.resolvedValueValidated || !Number.isFinite(completedMs)
      || completedMs < observedMs || completedMs >= deadline || completedMs >= Date.parse(OPERATION_AUTH.expiresAtUTC))
      return stop(400, "bounded-runtime-result-unavailable");
    const result = { ok: true, version: VERSION, reinLesend: true, operationNonce: nonce,
      rootAdmittedAtUTC: h["x-helmut-root-admitted-at"], rootDeadlineAtUTC: h["x-helmut-root-deadline-at"],
      observedAtUTC: observed.toISOString(), completedAtUTC: completed.toISOString(), production: true,
      productionCommit: runtimeCommit, deploymentHost: runtimeHost, deploymentId: runtimeId,
      runtimeIdentityMatchesRequest: true, serverGlobalOneUseProven: false, configuration,
      paidModelCalls: 0, nativeCalls: 0, mutationCalls: 0, source23WindowAcceptance: false,
      externalRuntimeAcceptance: false, productionCostGo: false };
    const body = JSON.stringify(result);
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) return stop(500, "bounded-runtime-result-unavailable");
    response.writeHead(200, jsonHeaders()); response.end(body);
  } catch (_) { return stop(500, "bounded-runtime-result-unavailable"); }
}

module.exports = { VERSION, MODUS, KEY, readConfiguration, handleRequest };
