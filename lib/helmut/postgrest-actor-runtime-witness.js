"use strict";

const { verifyOperationBearer } = require("./provider-runtime-attestation");
const MODUS = "postgrest-actor-metadata";
const PATH = "/api/cron/testnachweis-status";
const ORIGIN = "https://ddckuvvpcytqbyfmbvie.supabase.co";
const RPC = "helmut_postgrest_identity_probe_v1";
const WINDOW_MS = 20 * 60 * 1000;
const LIMITS = Object.freeze({ entityBytes: 16384, credentialBytes: 8192, outboundMs: 15000 });
// Enger Root-Auftrag: maximal eine Actor-Metadaten-Lesung, eigene neue Authbindung.
// Das Root-Lauffenster bleibt 20 Minuten; globaler Server-Einmalverbrauch wird
// nicht behauptet. Auth-Ablauf: 2026-10-04T11:30:41.892Z; kein privater Bearerinhalt.
const OPERATION_AUTH = Object.freeze({
  operationNonce: "9113595e-a454-4d4f-a89a-dd58335b1791",
  bearerSha256: "46ae3e44c63b800338c557bbce54d827ec45cc63cca1386ab82ccf8dc4339eb6",
  expiresAtUTC: "2026-10-04T11:30:41.892Z"
});
const HEADERS = Object.freeze(["authorization", "x-helmut-root-nonce", "x-helmut-root-admitted-at",
  "x-helmut-root-deadline-at", "x-helmut-production-commit", "x-helmut-deployment-host", "x-helmut-deployment-id"]);
const FIELDS = Object.freeze(["version", "nonce", "session_user", "current_user", "role_setting",
  "jwt_role", "jwt_role_matches_invoker", "database"]);
const closed = () => new Error("postgrest-actor-metadata-unavailable");
const uuid = v => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
function utc(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value ? n : null;
}
function identity(env) {
  const value = { production: env.VERCEL_ENV, commit: env.VERCEL_GIT_COMMIT_SHA,
    host: env.VERCEL_URL, id: env.VERCEL_DEPLOYMENT_ID };
  if (value.production !== "production" || !/^[a-f0-9]{40}$/.test(value.commit || "")
    || typeof value.host !== "string" || value.host.length > 253
    || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/.test(value.host)
    || !/^dpl_[A-Za-z0-9]{1,100}$/.test(value.id || "")) throw closed();
  return Object.freeze(value);
}
function actorPayload(value, nonce) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== FIELDS.length || Object.keys(value).some(k => !FIELDS.includes(k))) throw closed();
  const expected = { version: "helmut-postgrest-identity-probe/1", nonce, session_user: "authenticator",
    current_user: "service_role", role_setting: "service_role", jwt_role: "service_role",
    jwt_role_matches_invoker: true, database: "postgres" };
  for (const field of FIELDS) if (value[field] !== expected[field]) throw closed();
  // Exactly eight observed primitives; this projection is not native JSONB text/hash.
  return Object.fromEntries(FIELDS.map(field => [field, value[field]]));
}
function boundedRequest(request, url) {
  const h = request.headers;
  if (request.method !== "GET" || url.pathname !== PATH || url.search !== "?modus=" + MODUS
    || !h || !Array.isArray(request.rawHeaders) || request.rawHeaders.length % 2
    || (h["content-length"] !== undefined && h["content-length"] !== "0")
    || h["transfer-encoding"] !== undefined || request.body != null) return false;
  const counts = new Map();
  for (let i = 0; i < request.rawHeaders.length; i += 2) {
    if (typeof request.rawHeaders[i] !== "string" || typeof request.rawHeaders[i + 1] !== "string") return false;
    const name = request.rawHeaders[i].toLowerCase();
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return HEADERS.every(name => counts.get(name) === 1 && typeof h[name] === "string")
    && (counts.get("content-length") || 0) <= 1 && !counts.has("transfer-encoding");
}

// Pure transport factory. Storage alone supplies its synchronously captured URL/key.
// Test dependencies never enter the production handleRequest API.
function createMetadataReader({ backend, rawUrl, credential, nonce, deadlineMs, checkCurrent,
  fetchImpl = globalThis.fetch, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (String(backend || "").trim().toLowerCase() !== "supabase" || typeof rawUrl !== "string"
    || rawUrl.length > 2048 || typeof credential !== "string" || credential.length > LIMITS.credentialBytes
    || !/^[\x21-\x7e]+$/.test(credential) || !uuid(nonce) || !Number.isSafeInteger(deadlineMs)
    || typeof checkCurrent !== "function" || typeof fetchImpl !== "function") throw closed();
  let base;
  try { base = new URL(rawUrl.replace(/\/+$/, "")); } catch (_) { throw closed(); }
  if (base.origin !== ORIGIN || base.pathname !== "/" || base.username || base.password || base.search || base.hash) throw closed();
  const endpoint = new URL("/rest/v1/rpc/" + RPC, base);
  endpoint.searchParams.set("nonce", nonce);
  const frozenUrl = endpoint.href;
  const frozenHeaders = Object.freeze({ apikey: credential, Authorization: "Bearer " + credential,
    Accept: "application/json", "Accept-Encoding": "identity" });
  let consumed = false;
  return Object.freeze({ read: async () => {
    if (consumed) throw closed();
    consumed = true; // Failure never enables a second fetch or alternate credential.
    checkCurrent();
    const started = now(), until = Math.min(deadlineMs, started + LIMITS.outboundMs);
    if (!Number.isSafeInteger(started) || until <= started) throw closed();
    const abort = new AbortController();
    let timer, response, reader, result, failure;
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => { abort.abort(); reject(closed()); }, until - started);
    });
    const bounded = async promise => {
      const value = await Promise.race([timeout, promise]);
      const current = now();
      if (!Number.isSafeInteger(current) || current < started || current >= until) throw closed();
      checkCurrent();
      return value;
    };
    try {
      checkCurrent(); // Last synchronous public tuple/window gate before dispatch.
      response = await bounded(fetchImpl(frozenUrl, { method: "GET", redirect: "error", cache: "no-store",
        signal: abort.signal, headers: frozenHeaders }));
      if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")
        || ![null, "identity"].includes(response.headers.get("content-encoding"))) throw closed();
      const length = response.headers.get("content-length");
      if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || !Number.isSafeInteger(Number(length))
        || Number(length) > LIMITS.entityBytes)) throw closed();
      if (!response.body || typeof response.body.getReader !== "function") throw closed();
      reader = response.body.getReader();
      const chunks = []; let bytes = 0;
      for (;;) {
        const next = await bounded(reader.read());
        if (next.done) break;
        if (!(next.value instanceof Uint8Array)) throw closed();
        bytes += next.value.byteLength;
        if (bytes > LIMITS.entityBytes) throw closed();
        chunks.push(Buffer.from(next.value));
      }
      if (!bytes || (length !== null && Number(length) !== bytes)) throw closed();
      // Named normal PG/PostgREST boundary: this known JSONB RPC has unique keys.
      // Its eight allowed values contain no numeric tokens/arrays/opaque claims.
      result = actorPayload(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, bytes))), nonce);
    } catch (_) { failure = closed(); }
    finally {
      abort.abort();
      try {
        if (reader) await bounded(reader.cancel());
        else if (response?.body && typeof response.body.cancel === "function") await bounded(response.body.cancel());
      } catch (_) { failure = closed(); }
      if (reader) { try { reader.releaseLock(); } catch (_) { /* Abort already applied. */ } }
      clearTimer(timer); // Timer stays live through cleanup; no unbounded cancel await.
    }
    if (failure) throw failure;
    checkCurrent();
    return result;
  } });
}

// Offline factory uses fictitious auth/env/transport. Production entry below fixes auth.
function createHandler({ operationAuth, env, now, createReader, jsonHeaders }) {
  const auth = Object.freeze({ ...operationAuth });
  return async (request, response, url) => {
    const stop = (status, extra = {}) => {
      response.writeHead(status, jsonHeaders({ "Cache-Control": "no-store, private", ...extra }));
      response.end(JSON.stringify({ ok: false, reason: "postgrest-actor-metadata-unavailable" }));
    };
    if (request.method !== "GET") return stop(405, { Allow: "GET" });
    if (!boundedRequest(request, url)) return stop(403);
    const h = request.headers, nonce = h["x-helmut-root-nonce"], started = now();
    if (!verifyOperationBearer(h.authorization, nonce, started, auth)) return stop(403);
    try {
      const admitted = utc(h["x-helmut-root-admitted-at"]), deadline = utc(h["x-helmut-root-deadline-at"]);
      const expires = utc(auth.expiresAtUTC), captured = identity(env());
      if (admitted === null || deadline === null || expires === null || deadline - admitted !== WINDOW_MS
        || !Number.isSafeInteger(started) || started < admitted || started >= deadline
        || h["x-helmut-production-commit"] !== captured.commit || h["x-helmut-deployment-host"] !== captured.host
        || h["x-helmut-deployment-id"] !== captured.id) throw closed();
      const checkCurrent = () => {
        const current = identity(env()), time = now();
        if (current.commit !== captured.commit || current.host !== captured.host || current.id !== captured.id
          || !Number.isSafeInteger(time) || time < started || time >= deadline || time >= expires) throw closed();
      };
      checkCurrent();
      const reader = createReader({ nonce, deadlineMs: Math.min(deadline, expires), checkCurrent });
      if (!reader || typeof reader.read !== "function") throw closed();
      checkCurrent();
      const value = actorPayload(await reader.read(), nonce);
      checkCurrent();
      const body = JSON.stringify(value);
      if (Buffer.byteLength(body, "utf8") > LIMITS.entityBytes) throw closed();
      response.writeHead(200, jsonHeaders({ "Cache-Control": "no-store, private" }));
      response.end(body);
    } catch (_) { return stop(503); }
  };
}
function handleRequest(request, response, url, { jsonHeaders, storage }) {
  return createHandler({ operationAuth: OPERATION_AUTH, env: () => process.env, now: Date.now,
    createReader: options => storage.createPostgrestActorMetadataReader(options), jsonHeaders })(request, response, url);
}

module.exports = { MODUS, PATH, RPC, LIMITS, createMetadataReader, createHandler, handleRequest };
