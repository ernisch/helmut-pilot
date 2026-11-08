"use strict";

// Vorbereiteter Einzelauftrag, keine allgemeine Artikelversorgung. Der vorhandene
// Einzelproben-Einstieg delegiert nur diese Nonce, vor jedem Modell-/Accountpfad.
const crypto = require("node:crypto");
const fs = require("node:fs");
const { isDeepStrictEqual } = require("node:util");
const verifier = require("./provider-runtime-attestation");
const AUTH = Object.freeze({ operationNonce: "9bb8e647-b0cf-4774-9828-8f236eeeb59c",
  expiresAtUTC: "2026-11-10T00:00:00.000Z",
  bearerSha256: "29cc84428a21c538f783cbfbc77aec34be81d8c604a6a9d5a750a95d6f9c15d1" });
const URL = "https://www.radio-hannover.de/hannover-news/sozialverband-warnt-vor-altersarmut-in-niedersachsen";
const PATH = "/api/cron/testnachweis-status";
const SEARCH = "?modus=provider-einzelprobe";
// Ein technischer INSERT im vorhandenen Store, kein Auth-Blob-Write mit dessen
// Normalisierung/Listenkuerzung. PK(id) verbraucht die Nonce global genau einmal.
const CLAIM_ID = "main-operator-radio-original-9bb8e647-b0cf-4774-9828-8f236eeeb59c";
const MAX_MS = 20000, MAX_BYTES = 1048576;
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const PROXY_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NODE_USE_ENV_PROXY"];
const codeHash = file => sha(fs.readFileSync(require.resolve(file)));
const utc = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value ? Date.parse(value) : NaN;

async function handleRequest(request, response, url, deps = {}) {
  const env = deps.env || process.env, now = deps.now || Date.now;
  const auth = deps.operationAuth || AUTH, h = request.headers || {};
  const began = now(), trace = { requests: 0, dns: null, tls: null, response: null };
  let consumed = false, authorized = false, timer;
  const result = extra => ({ version: "radio-original-runtime-probe/1", url: URL,
    commit: env.VERCEL_GIT_COMMIT_SHA, deploymentId: env.VERCEL_DEPLOYMENT_ID,
    immutableHost: env.VERCEL_URL, region: env.VERCEL_REGION || null,
    node: process.version, executionPlace: "vercel-function", transport: "node-https-direct-pinned-ipv4",
    startedAtUTC: new Date(began).toISOString(), elapsedMs: Math.max(0, now() - began),
    consumed, retry: false, trace, articleText: "ungeprueft", articleIdentity: "ungeprueft",
    transportSuccessful: trace.tls?.authorized === true && trace.dns?.address === trace.tls?.remoteAddress
      && trace.tls?.servername === "www.radio-hannover.de" && Number.isInteger(trace.response?.status),
    paidModelCalls: 0, fachinhaltWrites: 0, ...extra });
  const send = (status, body) => {
    response.writeHead(status, { ...(deps.jsonHeaders ? deps.jsonHeaders() : { "Content-Type": "application/json" }),
      "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  };
  const stop = (status, reason) => send(status, authorized ? result({ ok: false, reason }) : { ok: false, reason, retry: false });
  if (request.method !== "POST" || url.pathname !== PATH || url.search !== SEARCH
    || h["transfer-encoding"] !== undefined || h["content-length"] !== "0") return stop(400, "fixed-empty-post-only");
  if (env.VERCEL_ENV !== "production" || !verifier.verifyOperationBearer(h.authorization,
    h["x-helmut-root-nonce"], now(), auth)) return stop(403, "operation-auth-unbound");
  authorized = true;
  if (!/^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA || "") || h["x-helmut-production-commit"] !== env.VERCEL_GIT_COMMIT_SHA
    || !/^dpl_[A-Za-z0-9]+$/.test(env.VERCEL_DEPLOYMENT_ID || "") || h["x-helmut-deployment-id"] !== env.VERCEL_DEPLOYMENT_ID
    || !/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL || "") || h["x-helmut-deployment-host"] !== env.VERCEL_URL)
    return stop(409, "runtime-identity-unbound");
  const start = utc(h["x-helmut-root-admitted-at"]), deadline = utc(h["x-helmut-root-deadline-at"]);
  const inWindow = () => Number.isFinite(start) && Number.isFinite(deadline) && deadline - start === MAX_MS
    && now() >= start && now() < deadline && now() < Date.parse(auth.expiresAtUTC);
  if (!inWindow()) return stop(400, "twenty-second-window-unbound");
  if (PROXY_KEYS.some(key => Boolean(env[key])) || /--use-env-proxy/.test(String(env.NODE_OPTIONS || "") + " " + process.execArgv.join(" "))
    || env.NODE_TLS_REJECT_UNAUTHORIZED === "0") return stop(409, "direct-verified-transport-unbound");
  const storage = deps.storage || require("./storage");
  if (storage.getStorageStatus().backend !== "supabase" || storage.getStorageStatus().supabaseConfigured !== true
    || storage.getStorageStatus().storeId !== "main")
    return stop(409, "existing-cas-storage-unbound");
  const abort = new AbortController();
  const expired = new Error("radio-probe-deadline");
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(expired); }, deadline - now()); });
  const work = async () => {
    consumed = null; // unbekannter INSERT-Ausgang berechtigt niemals zum Wiederholen
    if (!inWindow() || abort.signal.aborted) throw expired;
    const claim = { version: 1, kind: "radio-original-transport", url: URL, operationNonce: auth.operationNonce,
      claimedAtUTC: new Date(now()).toISOString(), commit: env.VERCEL_GIT_COMMIT_SHA,
      deploymentId: env.VERCEL_DEPLOYMENT_ID, maxMs: MAX_MS, maxBytes: MAX_BYTES, paidModelCalls: 0 };
    const rows = await storage.supabaseRequest("/rest/v1/helmut_store?on_conflict=id&select=id,data", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ id: CLAIM_ID, data: claim }) });
    if (Array.isArray(rows) && rows.length === 0) throw new Error("radio-probe-already-consumed");
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== CLAIM_ID || !isDeepStrictEqual(rows[0].data, claim))
      throw new Error("radio-probe-claim-unconfirmed");
    consumed = true;
    if (!inWindow() || abort.signal.aborted) throw expired;
    // Nur fuer diesen Aufruf wird der bestehende Anbieter-Schutz angefordert.
    // Keine process.env-/Vercel-/Feature-Flag-Aenderung; keine Ersatz-Reservierung.
    const scopedEnv = { ...env, HELMUT_ANBIETER_STEUERUNG: "on" };
    const fetchUrl = deps.fetchUrl || require("./crawler").fetchUrl;
    const observed = await fetchUrl(URL, 0, { artikelkontext: true, allowedHost: "radio-hannover.de",
      meldeStatus: true, env: scopedEnv, abbruchSignal: abort.signal,
      artikelTransportBeleg(event, value) {
        if (event === "request") trace.requests++;
        if (["dns", "tls", "response"].includes(event)) trace[event] = value;
      } });
    if (!inWindow() || abort.signal.aborted) throw expired;
    if (observed?.finalUrl !== URL || observed.status !== 200 || typeof observed.body !== "string"
      || Buffer.byteLength(observed.body, "utf8") > MAX_BYTES) throw new Error("radio-probe-response-unbound");
    const bytes = Buffer.from(observed.body, "utf8");
    return result({ ok: true,
      finalUrl: observed.finalUrl, responseBytes: bytes.length, responseSha256: sha(bytes),
      bodyBase64: bytes.toString("base64"),
      code: { crawler: codeHash("./crawler"), abrufschutz: codeHash("./artikelkontext-abrufschutz") } });
  };
  try { send(200, await Promise.race([work(), timeout])); }
  catch (error) {
    if (error.message === "radio-probe-already-consumed") consumed = true;
    const reason = /^radio-probe-[a-z-]+$/.test(error.message || "") ? error.message
      : /^[A-Z][A-Z_0-9]{1,60}$/.test(error.code || "") ? error.code
      : error.anbieterVertagung ? "provider-admission-denied" : "guard-or-transport-failed";
    stop(409, reason);
  } finally { clearTimeout(timer); }
}
module.exports = { AUTH, URL, PATH, SEARCH, CLAIM_ID, MAX_MS, MAX_BYTES, handleRequest };
