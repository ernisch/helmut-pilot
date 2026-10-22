"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { failure } = require("./runtime-failure-receipt");
const sha = s => crypto.createHash("sha256").update(s,"utf8").digest("hex");
const old = e => ({name:e?.name||null,code:e?.code||null,message:String(e?.message||"unknown").slice(0,240)});
function t(name, fn){ try { fn(); } catch (e) { e.message = name + ": " + e.message; throw e; } }

t("normal Error old fields unchanged", () => {
  const e = new Error("plain");
  e.code = "P0001";
  const r = failure(e);
  assert.deepStrictEqual({name:r.name,code:r.code,message:r.message}, old(e));
});

t("admitted original deadline cause retained", () => {
  const c = new Error("synthetik500-dispatch-EU-unit-deadline");
  c.code = "P0001";
  const e = new Error("outer");
  e.cause = c;
  assert.deepStrictEqual(failure(e).cause[0], {
    name:"Error", code:"P0001", message:"synthetik500-dispatch-EU-unit-deadline",
    messageSHA256:sha("synthetik500-dispatch-EU-unit-deadline")
  });
});

t("unknown secret cause not plaintext", () => {
  const secret = "https://evil.example/?api_key=sk-live-SECRET";
  const c = new Error(secret);
  c.code = "sk-live-SECRET";
  const e = new Error("outer");
  e.cause = c;
  const r = failure(e);
  const json = JSON.stringify(r);
  assert.ok(!json.includes(secret) && !json.includes("sk-live-SECRET") && !json.includes("https://"));
  assert.deepStrictEqual({...r.cause[0],messageSHA256:"x"}, {name:"Error",code:null,message:null,messageSHA256:"x"});
  assert.strictEqual(r.cause[0].messageSHA256, sha(secret));
});

t("cause getter not invoked", () => {
  let hits = 0;
  const e = new Error("outer");
  Object.defineProperty(e,"cause",{get(){ hits++; throw new Error("must-not-run"); }});
  const r = failure(e);
  assert.strictEqual(hits, 0);
  assert.strictEqual(r.cause.length, 0);
  assert.strictEqual(r.causeTruncated, true);
});

t("cause field getters not invoked", () => {
  let hits = 0;
  const c = Object.create(null);
  for (const k of ["name","code","message","cause"]) Object.defineProperty(c,k,{get(){ hits++; throw new Error("must-not-run"); }});
  const e = new Error("outer");
  e.cause = c;
  const r = failure(e);
  assert.strictEqual(hits, 0);
  assert.deepStrictEqual(r.cause[0], {name:null,code:null,message:null,messageSHA256:null});
  assert.strictEqual(r.causeTruncated, true);
});

t("cycle bounded", () => {
  const a = new Error("a"), b = new Error("b");
  a.cause = b; b.cause = a;
  const r = failure(a);
  assert.strictEqual(r.cause.length, 1);
  assert.strictEqual(r.causeTruncated, true);
});

t("max four causes", () => {
  const root = new Error("root"); let cur = root;
  for (let i = 1; i <= 5; i++) { const n = new Error("n" + i); cur.cause = n; cur = n; }
  const r = failure(root);
  assert.strictEqual(r.cause.length, 4);
  assert.strictEqual(r.causeTruncated, true);
});

t("primitive cause safe", () => {
  const e = new Error("outer");
  e.cause = "https://secret.example/?token=sk-PRIM";
  const r = failure(e);
  assert.deepStrictEqual(r.cause[0], {name:null,code:null,message:null,messageSHA256:null});
  assert.ok(!JSON.stringify(r).includes("sk-PRIM"));
});

t("unusual prototype traversal is bounded", () => {
  let reads = 0;
  const p = new Proxy({}, { getPrototypeOf() { reads++; return p; }, getOwnPropertyDescriptor() { return undefined; } });
  const result = failure(new Error("outer", { cause: p }));
  assert.ok(reads <= 9);
  assert.strictEqual(result.cause[0].name, null);
});

t("original identity and fields unchanged", () => {
  const orig = new Error("outer");
  orig.code = "P0001";
  const c = new Error("cause");
  orig.cause = c;
  const snapshot = {name:orig.name,code:orig.code,message:orig.message};
  failure(orig);
  assert.strictEqual(orig.name, snapshot.name);
  assert.strictEqual(orig.code, snapshot.code);
  assert.strictEqual(orig.message, snapshot.message);
  assert.strictEqual(orig.cause, c);
});

console.log("runtime-failure-receipt-test ok");
