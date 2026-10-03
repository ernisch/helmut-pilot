"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
// Every transport below is fictitious. No runtime env mutation or genuine bearer.
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("offline-network-forbidden"); };
const witness = require("../lib/helmut/postgrest-actor-runtime-witness");
const storage = require("../lib/helmut/storage");
const NONCE = "11111111-2222-4333-8444-555555555555";
const BEARER = "fictitious-actor-bearer-000000000000000000000000";
const START = Date.parse("2026-10-03T20:00:00.000Z");
const AUTH = Object.freeze({ operationNonce: NONCE,
  bearerSha256: crypto.createHash("sha256").update(BEARER).digest("hex"), expiresAtUTC: "2026-10-04T01:00:00.000Z" });
const ORIGIN = "https://ddckuvvpcytqbyfmbvie.supabase.co";
const ACTOR = Object.freeze({ version: "helmut-postgrest-identity-probe/1", nonce: NONCE,
  session_user: "authenticator", current_user: "service_role", role_setting: "service_role",
  jwt_role: "service_role", jwt_role_matches_invoker: true, database: "postgres" });
const PASS_NAMES = [];
function fixture() {
  const f = { time: START, readers: 0, calls: [], env: { VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_URL: "actor-fixture-111-nohut.vercel.app",
    VERCEL_DEPLOYMENT_ID: "dpl_actorFixture", HELMUT_STORAGE_BACKEND: "supabase", SUPABASE_URL: ORIGIN,
    SUPABASE_SERVICE_ROLE_KEY: "fictitious-primary-key", SUPABASE_SERVICE_KEY: "fictitious-secondary-key",
    SUPABASE_SECRET_KEY: "fictitious-third-key" } };
  f.request = { method: "GET", headers: { authorization: "Bearer " + BEARER, "x-helmut-root-nonce": NONCE,
    "x-helmut-root-admitted-at": new Date(START).toISOString(), "x-helmut-root-deadline-at": new Date(START + 1200000).toISOString(),
    "x-helmut-production-commit": f.env.VERCEL_GIT_COMMIT_SHA, "x-helmut-deployment-host": f.env.VERCEL_URL,
    "x-helmut-deployment-id": f.env.VERCEL_DEPLOYMENT_ID } };
  f.raw = () => { f.request.rawHeaders = Object.entries(f.request.headers).flat(); };
  f.raw();
  return f;
}
function response(f, { bytes = Buffer.from(JSON.stringify(ACTOR)), status = 200, headers = {},
  chunks = [bytes], afterRead, cancel = async () => {} } = {}) {
  const h = new Map(Object.entries({ "content-type": "application/json", ...headers }));
  let i = 0;
  return { status, headers: { get: key => h.has(key) ? h.get(key) : null }, body: { getReader: () => ({
    read: async () => {
      const value = i < chunks.length ? { done: false, value: chunks[i++] } : { done: true };
      if (afterRead) afterRead(f, value);
      return value;
    }, cancel, releaseLock: () => {}
  }) } };
}
function handler(f, { fetchImpl, readerFactory, operationAuth = AUTH, transportOptions = {} } = {}) {
  return witness.createHandler({ operationAuth, env: () => f.env, now: () => f.time,
    jsonHeaders: extra => ({ "Content-Type": "application/json", ...extra }),
    createReader: options => {
      f.readers++;
      if (readerFactory) return readerFactory(options);
      const fetch = async (url, init) => {
        f.calls.push({ url, init });
        return fetchImpl ? fetchImpl(url, init) : response(f);
      };
      return storage.createPostgrestActorMetadataReader({ ...options, now: () => f.time, fetchImpl: fetch,
        ...transportOptions }, f.env);
    } });
}
async function invoke(f, options = {}, search = "?modus=postgrest-actor-metadata") {
  const out = { status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
  await handler(f, options)(f.request, out, new URL(witness.PATH + search, "https://verified-public-fixture.vercel.app"));
  return out;
}
function generic(out) {
  assert.notEqual(out.status, 200);
  assert.deepEqual(JSON.parse(out.body), { ok: false, reason: "postgrest-actor-metadata-unavailable" });
  assert.equal(out.headers["Cache-Control"], "no-store, private");
}
async function group(name, test) { await test(); PASS_NAMES.push(name); console.log("PASS " + name); }

async function main() {
  await group("request-scope-before-reader", async () => {
    for (const change of [f => { f.request.method = "POST"; }, f => { f.request.body = "payload"; },
      f => { f.request.headers["content-length"] = "1"; f.raw(); },
      f => { f.request.headers["transfer-encoding"] = "chunked"; f.raw(); }]) {
      const f = fixture(); change(f); generic(await invoke(f)); assert.equal(f.readers, 0);
    }
    for (const search of ["?modus=postgrest-actor-metadata&x=1", "?modus=postgrest-actor-metadata&modus=postgrest-actor-metadata",
      "?modus=postgrest%2Dactor%2Dmetadata", "?modus=other", ""]) {
      const f = fixture(); generic(await invoke(f, {}, search)); assert.equal(f.readers, 0);
    }
  });
  await group("duplicate-and-mistyped-headers-before-reader", async () => {
    for (const name of Object.keys(fixture().request.headers)) {
      const f = fixture(); f.request.rawHeaders.push(name.toUpperCase(), f.request.headers[name]);
      generic(await invoke(f)); assert.equal(f.readers, 0);
      const g = fixture(); g.request.headers[name] = [g.request.headers[name]];
      generic(await invoke(g)); assert.equal(g.readers, 0);
    }
  });
  await group("new-auth-scope-and-production-entry-no-override", async () => {
    for (const change of [f => { f.request.headers.authorization = "Bearer wrong"; },
      f => { f.request.headers["x-helmut-root-nonce"] = "22222222-3333-4444-8555-666666666666"; }]) {
      const f = fixture(); change(f); f.raw(); generic(await invoke(f)); assert.equal(f.readers, 0);
    }
    const f = fixture(), out = { writeHead(status) { this.status = status; }, end(body) { this.body = body; } };
    await witness.handleRequest(f.request, out, new URL(witness.PATH + "?modus=" + witness.MODUS, "https://fixture.vercel.app"), {
      operationAuth: AUTH, env: f.env, jsonHeaders: () => ({}), storage: { createPostgrestActorMetadataReader() { throw new Error("must-not-read"); } }
    });
    assert.equal(out.status, 403); // Actual production auth cannot be overridden with test auth.
  });
  await group("runtime-and-window-before-reader", async () => {
    for (const change of [f => { f.env.VERCEL_ENV = "preview"; }, f => { f.env.VERCEL_DEPLOYMENT_ID = "dpl_wrong"; },
      f => { f.env.VERCEL_GIT_COMMIT_SHA = "b".repeat(40); }, f => { f.env.VERCEL_URL = "wrong.vercel.app"; },
      f => { f.request.headers["x-helmut-root-deadline-at"] = new Date(START + 1).toISOString(); f.raw(); },
      f => { f.request.headers["x-helmut-root-admitted-at"] = "2026-02-30T20:00:00.000Z"; f.raw(); },
      f => { f.time = START - 1; }]) {
      const f = fixture(); change(f); generic(await invoke(f)); assert.equal(f.readers, 0);
    }
    const f = fixture(); generic(await invoke(f, { operationAuth: { ...AUTH, expiresAtUTC: new Date(START).toISOString() } }));
    assert.equal(f.readers, 0);
  });
  await group("selected-production-key-and-exact-eight-fields", async () => {
    for (const which of [0, 1, 2]) {
      const f = fixture(); if (which > 0) f.env.SUPABASE_SERVICE_ROLE_KEY = "";
      if (which > 1) f.env.SUPABASE_SERVICE_KEY = "";
      const out = await invoke(f); assert.equal(out.status, 200); assert.deepEqual(JSON.parse(out.body), ACTOR);
      assert.equal(Object.keys(JSON.parse(out.body)).length, 8); assert.equal(f.calls.length, 1);
      const sent = f.calls[0], expected = ["fictitious-primary-key", "fictitious-secondary-key", "fictitious-third-key"][which];
      assert.equal(sent.init.headers.apikey, expected); assert.equal(sent.init.headers.Authorization, "Bearer " + expected);
      assert.equal(sent.init.method, "GET"); assert.equal(sent.init.redirect, "error"); assert.equal(sent.init.cache, "no-store");
      assert.equal(sent.url, ORIGIN + "/rest/v1/rpc/helmut_postgrest_identity_probe_v1?nonce=" + NONCE);
      assert.equal(out.headers["Cache-Control"], "no-store, private");
    }
  });
  await group("snapshot-frozen-before-await", async () => {
    const f = fixture();
    const reader = storage.createPostgrestActorMetadataReader({ nonce: NONCE, deadlineMs: START + 20000,
      checkCurrent() {}, now: () => f.time, fetchImpl: async (url, init) => { f.calls.push({ url, init }); return response(f); } }, f.env);
    f.env.SUPABASE_URL = "https://foreign.invalid"; f.env.SUPABASE_SERVICE_ROLE_KEY = "different-fictitious-key";
    f.env.HELMUT_STORAGE_BACKEND = "local";
    assert.deepEqual(await reader.read(), ACTOR); assert.equal(f.calls[0].init.headers.apikey, "fictitious-primary-key");
    assert.equal(new URL(f.calls[0].url).origin, ORIGIN);
  });
  await group("safe-url-normalization-and-foreign-url-stop", async () => {
    for (const url of [ORIGIN, ORIGIN + "/", ORIGIN + "///"]) {
      const f = fixture(); f.env.SUPABASE_URL = url; assert.equal((await invoke(f)).status, 200);
      assert.equal(new URL(f.calls[0].url).origin, ORIGIN);
    }
    for (const url of ["http://ddckuvvpcytqbyfmbvie.supabase.co", "https://foreign.supabase.co", ORIGIN + "/business",
      ORIGIN + "?secret=value", ORIGIN + "#fragment", "https://user@ddckuvvpcytqbyfmbvie.supabase.co", ORIGIN + ":444"]) {
      const f = fixture(); f.env.SUPABASE_URL = url; generic(await invoke(f)); assert.equal(f.calls.length, 0);
    }
  });
  await group("credential-format-cap-no-fallback", async () => {
    for (const value of ["has space", "has\nnewline", "x".repeat(8193)]) {
      const f = fixture(); f.env.SUPABASE_SERVICE_ROLE_KEY = value;
      generic(await invoke(f)); assert.equal(f.calls.length, 0); // A valid second key must not rescue invalid selected first key.
    }
    const f = fixture(); f.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(8192); assert.equal((await invoke(f)).status, 200);
    const g = fixture(); g.env.SUPABASE_SERVICE_ROLE_KEY = g.env.SUPABASE_SERVICE_KEY = g.env.SUPABASE_SECRET_KEY = "";
    generic(await invoke(g)); assert.equal(g.calls.length, 0);
  });
  await group("single-fetch-once-on-success-and-failure", async () => {
    for (const succeeds of [true, false]) {
      const f = fixture(), reader = storage.createPostgrestActorMetadataReader({ nonce: NONCE, deadlineMs: START + 20000,
        checkCurrent() {}, now: () => f.time, fetchImpl: async (url, init) => {
          f.calls.push({ url, init }); if (!succeeds) throw new Error("fictitious-error"); return response(f);
        } }, f.env);
      const outcomes = await Promise.allSettled([reader.read(), reader.read()]);
      assert.equal(outcomes.filter(v => v.status === "fulfilled").length, succeeds ? 1 : 0);
      assert.equal(f.calls.length, 1); await assert.rejects(reader.read()); assert.equal(f.calls.length, 1);
    }
  });
  await group("transport-status-headers-and-byte-caps", async () => {
    for (const options of [{ status: 302 }, { status: 500 }, { headers: { "content-type": "text/html" } },
      { headers: { "content-encoding": "gzip" } }, { headers: { "content-length": "16385" } },
      { headers: { "content-length": "1e3" } }, { headers: { "content-length": "0" } },
      { bytes: Buffer.alloc(0) }, { chunks: [Buffer.alloc(16384), Buffer.from("x")] }]) {
      const f = fixture(); generic(await invoke(f, { fetchImpl: async () => response(f, options) })); assert.equal(f.calls.length, 1);
    }
  });
  await group("fatal-utf8-invalid-json-and-incomplete-body", async () => {
    for (const bytes of [Buffer.from([0xff]), Buffer.from("{"), Buffer.from(JSON.stringify(ACTOR).slice(0, -1))]) {
      const f = fixture(); generic(await invoke(f, { fetchImpl: async () => response(f, { bytes }) })); assert.equal(f.calls.length, 1);
    }
  });
  await group("strict-primitive-eight-field-codec", async () => {
    const bad = [null, [], { ...ACTOR, extra: "opaque" }, { ...ACTOR, jwt_role_matches_invoker: 1 },
      { ...ACTOR, jwt_role_matches_invoker: false }, { ...ACTOR, nonce: 0 }, { ...ACTOR, session_user: "postgres" },
      { ...ACTOR, current_user: "authenticated" }, { ...ACTOR, jwt_role: { role: "service_role" } }];
    const missing = { ...ACTOR }; delete missing.database; bad.push(missing);
    for (const value of bad) {
      const f = fixture(); generic(await invoke(f, { fetchImpl: async () => response(f, { bytes: Buffer.from(JSON.stringify(value)) }) }));
      assert.equal(f.calls.length, 1);
    }
  });
  await group("runtime-tuple-rechecked-after-each-await", async () => {
    for (const stage of ["fetch", "chunk", "eof", "cancel"]) {
      const f = fixture(); generic(await invoke(f, { fetchImpl: async () => {
        if (stage === "fetch") f.env.VERCEL_DEPLOYMENT_ID = "dpl_drift";
        return response(f, { afterRead: (_, next) => {
          if ((stage === "chunk" && !next.done) || (stage === "eof" && next.done)) f.env.VERCEL_GIT_COMMIT_SHA = "b".repeat(40);
        }, cancel: async () => { if (stage === "cancel") f.env.VERCEL_URL = "drift.vercel.app"; } });
      } })); assert.equal(f.calls.length, 1);
    }
  });
  await group("deadline-expiry-and-backward-clock-stop", async () => {
    for (const next of [START - 1, START + 15000, START + 1200000]) {
      const f = fixture(); generic(await invoke(f, { fetchImpl: async () => { f.time = next; return response(f); } }));
      assert.equal(f.calls.length, 1);
    }
    const f = fixture(); generic(await invoke(f, {
      operationAuth: { ...AUTH, expiresAtUTC: new Date(START + 5000).toISOString() },
      readerFactory: () => ({ read: async () => { f.time += 5000; return ACTOR; } })
    }));
  });
  await group("fetch-and-cleanup-share-finite-abort", async () => {
    for (const where of ["fetch", "cancel"]) {
      const f = fixture(); let fire, cleared = 0, aborted;
      const out = await invoke(f, { transportOptions: {
        setTimer: (callback, ms) => { assert.equal(ms, 15000); fire = callback; return 1; },
        clearTimer: id => { assert.equal(id, 1); cleared++; }
      }, fetchImpl: async (_, init) => {
        aborted = init.signal;
        if (where === "fetch") { queueMicrotask(fire); return new Promise(() => {}); }
        return response(f, { cancel: () => { queueMicrotask(fire); return new Promise(() => {}); } });
      } });
      generic(out); assert.equal(f.calls.length, 1); assert.equal(cleared, 1); assert.equal(aborted.aborted, true);
    }
  });
  await group("upstream-error-and-reader-output-never-reflected", async () => {
    const f = fixture(), secretMarker = "fictitious-private-value-do-not-return";
    const out = await invoke(f, { fetchImpl: async () => { throw new Error(secretMarker); } });
    generic(out); assert.equal(out.body.includes(secretMarker), false); assert.equal(out.body.includes(f.env.SUPABASE_SERVICE_ROLE_KEY), false);
    const g = fixture(); generic(await invoke(g, { readerFactory: () => ({ read: async () => ({ ...ACTOR, claims: secretMarker }) }) }));
  });
  await group("early-server-branch-and-mandatory-suite-registration", async () => {
    const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
    const early = server.indexOf('url.searchParams.get("modus") === "postgrest-actor-metadata"');
    assert.ok(early > 0); assert.ok(early < server.indexOf('if (url.pathname === "/api/cron/testnachweis-status") {'));
    const runner = require("./run-offline-tests");
    assert.equal(runner.STANDARD.has("postgrest-actor-runtime-witness-test.js"), true);
  });
  console.log("PASS postgrest-actor-runtime-witness " + PASS_NAMES.length + " groups; all transport fictitious, no actual actor/finance/W proof");
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => { globalThis.fetch = previousFetch; });
