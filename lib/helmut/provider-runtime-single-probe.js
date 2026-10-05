"use strict";

// Ein fester synthetischer Anbieterbeleg, kein 500er Lauf. Die verbrauchte
// Root-Kennung bleibt auch bei Fehler/unklarem CAS oder Anbieterergebnis stehen.
const verifier = require("./provider-runtime-attestation");
const AUTH = Object.freeze({ operationNonce: "6a1ab729-243d-45c7-8922-bb2bd95efd80",
  expiresAtUTC: "2026-10-05T07:44:47.172Z", runId: "nachlauf500-20261005044447",
  bearerSha256: "5c0dd87f2232cc9981a5d7614796797710cb8baf2269c695acd23f3830250162" });
const KEY = "helmutPreparatoryProviderProbeV1";
const MODUS = "provider-einzelprobe";
const PROMPT = "Reply with exactly OK.";
const MODEL = "gpt-5-mini";
const MAX_OUTPUT = 16;
const WINDOW = 20 * 60 * 1000;
const RESERVED_USD = 0.200064;
const COMMIT = /^[a-f0-9]{40}$/;
const utc = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value ? Date.parse(value) : NaN;

async function handleRequest(request, response, url, deps = {}) {
  const env = deps.env || process.env, now = deps.now || (() => new Date());
  const authPin = deps.operationAuth || AUTH;
  const kosten = deps.kosten || require("./testkosten-budget");
  const storage = deps.storage || require("./storage");
  const config = deps.readRuntimeConfiguration || (() => require("./ai").runtimeProviderConfiguration());
  const call = deps.requestText || ((...args) => require("./ai").requestText(...args));
  const send = (status, value) => {
    const text = JSON.stringify(value);
    const body = Buffer.byteLength(text) <= 32768 ? text : JSON.stringify({ ok: false, reason: "probe-result-cap" });
    response.writeHead(status, { ...(deps.jsonHeaders ? deps.jsonHeaders() : { "Content-Type": "application/json" }), "Cache-Control": "no-store" });
    response.end(body);
  };
  const stop = (status, reason, consumed = false) => send(status, { ok: false, reason, consumed,
    actual500Test: false, profileChanges: false, retry: false });
  const h = request.headers || {};
  if (request.method !== "POST") return stop(405, "only-post");
  if (url.search !== "?modus=" + MODUS || h["transfer-encoding"] !== undefined
    || (h["content-length"] !== undefined && h["content-length"] !== "0")) return stop(400, "fixed-empty-request-required");
  const start = utc(h["x-helmut-root-admitted-at"]), end = utc(h["x-helmut-root-deadline-at"]);
  const time = () => {
    const at = now().getTime();
    return Number.isFinite(at) && Number.isFinite(start) && Number.isFinite(end) && end - start === WINDOW
      && at >= start && at < end && at < utc(authPin.expiresAtUTC);
  };
  if (env.VERCEL_ENV !== "production" || !verifier.verifyOperationBearer(h.authorization,
    h["x-helmut-root-nonce"], now().getTime(), authPin)) return stop(403, "operation-auth-unbound");
  if (!time()) return stop(400, "root-window-unbound");
  if (!COMMIT.test(env.VERCEL_GIT_COMMIT_SHA || "") || h["x-helmut-production-commit"] !== env.VERCEL_GIT_COMMIT_SHA
    || !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL || "")
    || h["x-helmut-deployment-host"] !== env.VERCEL_URL) return stop(409, "runtime-identity-unbound");
  const runtimeOK = () => {
    const c = config(), p = c.conservativeTextReservationPolicy, r = c.resolved;
    const s = storage.getStorageStatus();
    return s.backend === "supabase" && s.supabaseConfigured === true && kosten.aktiv(env) && r?.sendEnabled === true && r.intendedProvider === "azure" && r.providerForSend === "azure"
      && r.responsesURL === "https://helmut-resource.openai.azure.com/openai/v1/responses"
      && r.activeModel?.value === MODEL && r.understandingModel?.value === MODEL && r.loopbackExactOne === false
      && c.secretNamePresence?.AZURE_OPENAI_KEY === true && p?.aktiv === true
      && p.tarif === "azure-gpt5-mini-obergrenze-20260909" && p.eingabeUsdJeMillion === 0.5
      && p.ausgabeUsdJeMillion === 4 && kosten.reservierungHoeheUsd(MAX_OUTPUT) === RESERVED_USD;
  };
  const bookOK = auth => auth && !Object.hasOwn(auth, "synthetik500KostenAdmission")
    && auth[kosten.AUFTRAG_KEY]?.version === 3 && auth[kosten.AUFTRAG_KEY]?.limit === 7000000;
  let claimAttempted = false;
  try {
    if (!runtimeOK()) return stop(409, "bounded-azure-cost-policy-unbound");
    const auth = await storage.readAuthStore({ strict: true });
    if (!bookOK(auth)) return stop(409, "historical-cost-or-slot-unbound");
    const iso = now().toISOString(), counter = await storage.leseLlmTageszaehler(iso);
    kosten.pruefeStart(auth, iso.slice(0, 10), counter);
    if (!time() || !runtimeOK()) return stop(400, "preclaim-window-or-config-drift");
    claimAttempted = true;
    const claim = await storage.mutateAuthStore(current => {
      if (!time() || !runtimeOK() || !bookOK(current)) throw new Error("preclaim-unbound");
      const claims = Object.hasOwn(current, KEY) ? current[KEY] : {};
      if (!claims || typeof claims !== "object" || Array.isArray(claims) || Object.keys(claims).length >= 32)
        throw new Error("claim-book-invalid");
      if (Object.hasOwn(claims, authPin.operationNonce)) {
        const error = new Error("operation-already-consumed");
        error.code = "PROVIDER_PROBE_CONSUMED";
        throw error; // Kein unnoetiger CAS-Schreibversuch fuer einen Wiederaufruf.
      }
      claims[authPin.operationNonce] = { version: 1, claimedAtUTC: now().toISOString(), runId: authPin.runId,
        productionCommit: env.VERCEL_GIT_COMMIT_SHA, immutableHost: env.VERCEL_URL,
        maxOutputTokens: MAX_OUTPUT, maxReserveUsd: RESERVED_USD };
      current[KEY] = claims;
      return { claimed: true };
    });
    if (claim?.claimed !== true) return stop(503, "claim-outcome-unknown", null);
  } catch (error) {
    if (error?.code === "PROVIDER_PROBE_CONSUMED") return stop(409, "operation-already-consumed", true);
    return stop(503, "preflight-or-claim-unconfirmed", claimAttempted ? null : false);
  }

  // Die bestaetigte CAS-Kennung wird ab hier NIE geloescht. Die bestehende
  // AI-Engstelle bucht Geld/Zaehler vor HTTPS und erhaelt unbekannte Reserven.
  let returned = false;
  try {
    if (!time() || !runtimeOK()) return stop(400, "presend-window-or-config-drift", true);
    await call(PROMPT, { callType: "pre500-provider-probe", runId: authPin.runId, politicianId: null },
      { model: MODEL, maxOutputTokens: MAX_OUTPUT });
    returned = true;
  } catch (_) { /* Fehlerbody/Modellinhalt nicht ausgeben; Kosten bleiben gebunden. */ }
  let rows = [], bound = null, accounting = false;
  try {
    const auth = await storage.readAuthStore({ strict: true });
    if (!Array.isArray(auth.llmUsage)) throw new Error("usage-missing");
    rows = auth.llmUsage.filter(x => x?.runId === authPin.runId && x.callType === "pre500-provider-probe");
    if (rows.length > 1) throw new Error("usage-not-one");
    const result = await kosten.laufGebundenUsd(authPin.runId);
    if (!Number.isFinite(result) || result < 0 || result > RESERVED_USD) throw new Error("cost-unbound");
    bound = result;
    const r = rows[0];
    accounting = rows.length === 1 && r.model === MODEL && r.success === true && r.keinAufruf !== true
      && [r.promptTokens, r.completionTokens, r.totalTokens].every(x => Number.isSafeInteger(x) && x >= 0)
      && r.promptTokens <= 400000 && r.completionTokens <= MAX_OUTPUT
      && r.promptTokens + r.completionTokens === r.totalTokens && Number.isFinite(r.estimatedCost)
      && r.estimatedCost >= 0 && r.estimatedCost <= RESERVED_USD
      && bound === kosten.tokenKosten(r.promptTokens, r.completionTokens) / 1e6;
  } catch (_) { accounting = false; }
  const r = rows.length === 1 ? rows[0] : null;
  const safeUsage = r && r.model === MODEL && typeof r.success === "boolean"
    && [r.promptTokens, r.completionTokens, r.totalTokens].every(x => x === null || (Number.isSafeInteger(x) && x >= 0 && x <= 400016))
    && typeof r.id === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(r.id) && Number.isFinite(utc(r.createdAt))
    && (r.durationMs === null || (Number.isFinite(r.durationMs) && r.durationMs >= 0 && r.durationMs <= 60000))
    && (r.estimatedCost === null || (Number.isFinite(r.estimatedCost) && r.estimatedCost >= 0 && r.estimatedCost <= RESERVED_USD));
  if (!safeUsage) accounting = false;
  const usage = safeUsage ? Object.fromEntries(["id", "model", "promptTokens", "completionTokens", "totalTokens",
    "success", "durationMs", "estimatedCost", "createdAt"].map(k => [k, r[k]])) : null;
  const ok = returned && accounting && time();
  send(ok ? 200 : 502, { ok, version: "helmut-provider-runtime-single-probe/1", consumed: true,
    rootNonce: authPin.operationNonce, runId: authPin.runId, commit: env.VERCEL_GIT_COMMIT_SHA,
    deploymentHost: env.VERCEL_URL, provider: "azure", model: MODEL, maxOutputTokens: MAX_OUTPUT,
    reservedUpperUsd: RESERVED_USD, boundUsd: bound, usage, accountingConfirmed: accounting,
    providerCompletionProven: returned && accounting, retry: false, syntheticInputOnly: true,
    profiles: 0, profileChanges: false, actual500Test: false, currentAccountTariffProven: false });
}

module.exports = { AUTH, KEY, MODUS, handleRequest };
