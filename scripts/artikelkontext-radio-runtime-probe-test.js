"use strict";
const A = require("node:assert/strict"), crypto = require("node:crypto");
const P = require("../lib/helmut/radio-original-runtime-probe");
const entry = require("../lib/helmut/provider-runtime-single-probe");
const tests = [];
const test = (name, run) => tests.push([name, run]);
function fixture() {
  let clock = Date.parse("2026-11-08T20:00:00.000Z"), claims = 0, sends = 0;
  const token = "synthetic-operation-token-".repeat(2);
  const env = { VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "a".repeat(40), VERCEL_URL: "fixture.vercel.app", VERCEL_DEPLOYMENT_ID: "dpl_fixture" };
  const auth = { ...P.AUTH, bearerSha256: crypto.createHash("sha256").update(token).digest("hex") };
  const headers = { authorization: "Bearer " + token, "content-length": "0", "x-helmut-root-nonce": P.AUTH.operationNonce,
    "x-helmut-production-commit": env.VERCEL_GIT_COMMIT_SHA, "x-helmut-deployment-id": env.VERCEL_DEPLOYMENT_ID,
    "x-helmut-deployment-host": env.VERCEL_URL, "x-helmut-root-admitted-at": new Date(clock).toISOString(),
    "x-helmut-root-deadline-at": new Date(clock + P.MAX_MS).toISOString() };
  const authStore = { unrelated: { preserved: true } };
  const deps = { env, now: () => clock, operationAuth: auth,
    storage: { getStorageStatus: () => ({ backend: "supabase", supabaseConfigured: true }),
      mutateAuthStore: async change => { claims++; return change(authStore); } },
    requestText: () => { throw new Error("MODEL PATH REACHED"); },
    readRuntimeConfiguration: () => { throw new Error("MODEL CONFIG REACHED"); },
    fetchUrl: async (url, redirects, options) => {
      sends++;
      A.equal(url, P.URL); A.equal(redirects, 0); A.equal(options.artikelkontext, true);
      A.equal(options.allowedHost, "radio-hannover.de"); A.equal(options.env.HELMUT_ANBIETER_STEUERUNG, "on");
      A.equal(env.HELMUT_ANBIETER_STEUERUNG, undefined);
      A.equal(options.abbruchSignal.aborted, false);
      options.artikelTransportBeleg("request", null);
      options.artikelTransportBeleg("dns", { address: "93.184.215.14", family: 4 });
      options.artikelTransportBeleg("tls", { authorized: true, remoteAddress: "93.184.215.14", servername: "www.radio-hannover.de", protocol: "TLSv1.3" });
      options.artikelTransportBeleg("response", { status: 200, contentType: "text/html;charset=UTF-8" });
      return { body: "<html><title>Nur eine Überschrift</title></html>", finalUrl: P.URL, status: 200 };
    } };
  const invoke = async (overrides = {}) => {
    let status, body;
    await entry.handleRequest({ method: "POST", headers, ...overrides }, {
      writeHead(s, h) { status = s; A.equal(h["Cache-Control"], "no-store"); },
      end(value) { body = JSON.parse(value); }
    }, new URL(P.PATH + P.SEARCH, "https://fixture.vercel.app"), deps);
    return { status, body };
  };
  return { deps, env, headers, authStore, invoke, counts: () => ({ claims, sends }), advance: ms => { clock += ms; } };
}
test("bestehender Einstieg: ein Abruf, kein Modellpfad; Titel-HTML ist kein Artikelbeweis", async () => {
  const f = fixture(), r = await f.invoke();
  A.equal(r.status, 200); A.equal(r.body.transportSuccessful, true);
  A.equal(r.body.articleText, "ungeprueft"); A.equal(r.body.articleIdentity, "ungeprueft");
  A.equal(r.body.paidModelCalls, 0); A.equal(r.body.fachinhaltWrites, 0);
  A.equal(crypto.createHash("sha256").update(Buffer.from(r.body.bodyBase64, "base64")).digest("hex"), r.body.responseSha256);
  A.deepEqual(f.counts(), { claims: 1, sends: 1 }); A.deepEqual(f.authStore.unrelated, { preserved: true });
});
test("wiederholte und konkurrierende Zustellung startet global nur einen Abruf", async () => {
  const f = fixture(), results = await Promise.all([f.invoke(), f.invoke()]);
  A.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  A.equal((await f.invoke()).body.reason, "radio-probe-already-consumed"); A.equal(f.counts().sends, 1);
});
test("falsches Token, Commit, Deployment, Body und Fenster bleiben vor CAS und Netz", async () => {
  for (const change of [f => { f.headers.authorization = "Bearer " + "x".repeat(64); },
    f => { f.headers["x-helmut-production-commit"] = "b".repeat(40); },
    f => { f.headers["x-helmut-deployment-id"] = "dpl_other"; },
    f => { f.headers["content-length"] = "1"; },
    f => { f.headers["x-helmut-root-deadline-at"] = "2026-13-08T20:00:20.000Z"; },
    f => { f.advance(P.MAX_MS); }]) {
    const f = fixture(); change(f); A.notEqual((await f.invoke()).status, 200);
    A.deepEqual(f.counts(), { claims: 0, sends: 0 });
  }
});
test("Proxy oder abgeschaltete TLS-Pruefung wird abgewiesen, nicht umkonfiguriert", async () => {
  for (const [key, value] of [["HTTPS_PROXY", "http://synthetic:9"], ["NODE_USE_ENV_PROXY", "1"], ["NODE_TLS_REJECT_UNAUTHORIZED", "0"]]) {
    const f = fixture(); f.env[key] = value;
    A.equal((await f.invoke()).body.reason, "direct-verified-transport-unbound"); A.equal(f.env[key], value);
    A.deepEqual(f.counts(), { claims: 0, sends: 0 });
  }
});
test("unbestaetigter oder verlorener CAS-Ausgang startet keinen Abruf", async () => {
  for (const mutate of [async () => ({}), async change => { change({}); throw new Error("lost ack"); }]) {
    const f = fixture(); f.deps.storage.mutateAuthStore = mutate;
    const r = await f.invoke(); A.equal(r.status, 409); A.equal(r.body.consumed, null); A.equal(f.counts().sends, 0);
  }
});
test("nach aufgebrauchtem Zeitfenster startet auch mit bestaetigtem Claim kein Abruf", async () => {
  const f = fixture(), mutate = f.deps.storage.mutateAuthStore;
  f.deps.storage.mutateAuthStore = async change => { const r = await mutate(change); f.advance(P.MAX_MS); return r; };
  A.equal((await f.invoke()).body.reason, "radio-probe-deadline"); A.equal(f.counts().sends, 0);
});
test("Verbindungsfehler und Redirect bleiben Luecken; keine Wiederholung", async () => {
  for (const fail of [async () => { throw Object.assign(new Error("private data"), { code: "ECONNREFUSED" }); },
    async () => ({ body: "fremder Inhalt", finalUrl: "https://other.invalid/a", status: 200 })]) {
    const f = fixture(); f.deps.fetchUrl = fail;
    const r = await f.invoke(); A.equal(r.status, 409); A.equal(r.body.consumed, true);
    A.equal(r.body.articleIdentity, "ungeprueft"); A.equal(r.body.bodyBase64, undefined); A.equal(r.body.retry, false);
    A.equal(JSON.stringify(r).includes("private data"), false);
  }
});
test("zu grosse Antwort oder abweichender Peer erzeugt keinen falschen Transportbeleg", async () => {
  const f = fixture(); f.deps.fetchUrl = async () => ({ body: "x".repeat(P.MAX_BYTES + 1), finalUrl: P.URL, status: 200 });
  A.equal((await f.invoke()).body.reason, "radio-probe-response-unbound");
  const g = fixture(), fetch = g.deps.fetchUrl;
  g.deps.fetchUrl = async (...args) => { const r = await fetch(...args);
    args[2].artikelTransportBeleg("tls", { authorized: true, remoteAddress: "93.184.215.15", servername: "www.radio-hannover.de" }); return r; };
  A.equal((await g.invoke()).body.transportSuccessful, false);
});
(async () => { for (const [name, run] of tests) { await run(); console.log("OK " + name); }
  console.log(`${tests.length}/${tests.length} isolierte Radio-Auftragsgruppen; 0 Original-/Modellaufrufe`);
})().catch(error => { console.error(error); process.exitCode = 1; });
