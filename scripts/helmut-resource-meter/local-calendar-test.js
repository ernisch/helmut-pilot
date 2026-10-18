"use strict";
// Isolated pure calendar tests. Fake Date.now exists ONLY in this test process;
// no service, activation, database, resource GO or 500er workload is started.
const assert = require("node:assert/strict"), { createHash } = require("node:crypto");
const https = require("node:https");
const Cal = require("../../lib/helmut/synthetik-500-local-calendar");
const originalNow = Date.now, originalRequest = https.request;
const savedEnv = { ...process.env };
const sha = x => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const input = () => ({ briefingDatum: "2026-10-18T08:00:00.000Z",
  briefingEingabe: { version: 1, eingabe: { tag: "2026-10-18", eingabeHash: "a".repeat(64) } } });
const command = () => ({ mode: "D-R-500", native: null,
  slot: { plan: { operationId: "synthetik500-resources18-123456789abc",
    startsAtUTC: "2026-10-18T21:00:00.000Z", endsAtUTC: "2026-10-18T23:59:59.999Z" } },
  units: Array.from({ length: 500 }, () => ({ kind: "DR" })),
  drafts: Array.from({ length: 500 }, input) });
const policy = () => ({ version: Cal.VERSION, operationId: "synthetik500-resources18-123456789abc",
  sourceDay: "2026-10-18", sourceViewAtUTC: "2026-10-18T08:00:00.000Z",
  sourceInputsHash: sha(Array(500).fill("a".repeat(64))), executionDayUTC: "2026-10-18",
  startsAtUTC: "2026-10-18T20:00:00.000Z", endsAtUTC: "2026-10-18T23:59:59.999Z" });
function configure(p = policy()) {
  delete process.env.VERCEL;
  process.env.HELMUT_LLM_USAGE_STORAGE = "relational-atomic-v1";
  process.env.SUPABASE_URL = "http://172.16.245.3:3000";
  process.env[Cal.ENV] = JSON.stringify(p);
  Date.now = () => Date.parse("2026-10-18T22:30:00.000Z");
  https.request = function localMockOnly() { throw Error("no requests in this test"); };
  Cal.registerLocalMockTransport(https.request);
}
let cases = 0;
function check(name, work) { work(); cases++; }
function reject(name, change) {
  check(name, () => { configure(); const c = command(); change(c); assert.throws(() => Cal.withCommand(c, () => true)); });
}
(async () => {
 try {
  delete process.env[Cal.ENV];
  check("default remains real Berlin", () => {
    assert.equal(Cal.outputDay(new Date("2026-10-18T22:30:00.000Z")), "2026-10-19");
    assert.equal(Cal.withCommand({}, () => 7), 7);
  });
  check("cross Berlin midnight with real generation timestamp", () => {
    configure(); const c = command();
    Cal.withCommand(c, () => {
      assert.equal(Cal.outputDay(), "2026-10-18");
      assert(Cal.acceptsInput(c, c.drafts[0]));
      const args = { userId: "synthetic-test", runId: "nachlauf500-12345678", phase: "entwurf",
        antwort: { paragraphs: [] }, quellen: [], profile: { id: "synthetic-test" },
        now: new Date("2026-10-18T22:30:00.000Z") };
      const row = require("../../lib/helmut/lage-entwurfsbeleg").baue(args);
      assert.equal(row.payload.tag, "2026-10-18");
      assert.equal(row.generated_at, "2026-10-18T22:30:00.000Z");
    });
    assert.equal(Cal.outputDay(new Date("2026-10-18T22:30:00.000Z")), "2026-10-19");
  });
  configure();
  check("semantic R date stays bound across Berlin midnight, clocks stay real", () => {
    const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
    const file = path.resolve(__dirname, "../../lib/helmut/lage-textqualitaet.js");
    const NativeDate = Date;
    class BoundaryDate extends NativeDate { constructor(...args) { super(...(args.length ? args : ["2026-10-18T22:30:00.000Z"])); } }
    const sandbox = { module: { exports: {} }, require: require("node:module").createRequire(file), Date: BoundaryDate };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox);const Q = sandbox.module.exports;
    assert(Q.prompt([], [], {}).includes("Briefingdatum (Europe/Berlin): 2026-10-19"));
    Cal.withCommand(command(), () => {
      assert(Q.prompt([], [], {}).includes("Briefingdatum (Europe/Berlin): 2026-10-18"));
      assert(Q.tagesbezugGebunden("heute", { veroeffentlichtAm: "2026-10-18T07:00:00.000Z" }));
      assert.equal(Cal.sourceViewDate().toISOString(), "2026-10-18T08:00:00.000Z");
    });
    assert(!Q.tagesbezugGebunden("heute", { veroeffentlichtAm: "2026-10-18T07:00:00.000Z" }));
  });
  configure();
  await Cal.withCommand(command(), async () => {
    const D = require("../../lib/helmut/lage-entwurfsbeleg");
    const args = { userId: "synthetic-test", runId: "nachlauf500-12345678", phase: "entwurf",
      antwort: { paragraphs: [] }, quellen: [], profile: { id: "synthetic-test" },
      now: new Date("2026-10-18T22:30:00.000Z") };
    const row = D.baue(args);
    const read = entry => ({ getLageEntwurfsbeleg: async (_owner, id) => id.endsWith("-entwurf") ? entry : null });
    assert.equal((await D.leseFortsetzung(args, read(row))).id, row.id); cases++;
    for (const mutate of [r => { r.generated_at = "2026-10-17T22:30:00.000Z"; },
      r => { r.generated_at = "2026-10-18T22:31:00.000Z"; },
      r => { r.user_id = "other-owner"; }, r => { r.payload.antwort = { altered: true }; }]) {
      const bad = structuredClone(row); mutate(bad);
      await assert.rejects(() => D.leseFortsetzung(args, read(bad))); cases++;
    }
  });
  reject("Vercel denied", () => { process.env.VERCEL = "1"; });
  reject("public database denied", () => { process.env.SUPABASE_URL = "https://example.supabase.co"; });
  reject("credentials in URL denied", () => { process.env.SUPABASE_URL = "http://u:p@127.0.0.1:3000"; });
  reject("non-local relational mode denied", () => { delete process.env.HELMUT_LLM_USAGE_STORAGE; });
  reject("restored real transport denied", () => { https.request = originalRequest; });
  reject("unknown command", c => { c.slot.plan.operationId += "0"; });
  reject("wrong source hash", c => { c.drafts[1].briefingEingabe.eingabe.eingabeHash = "b".repeat(64); });
  reject("wrong snapshot time", c => { c.drafts[1].briefingDatum = "2026-10-18T09:00:00.000Z"; });
  reject("wrong source day", c => { c.drafts[1].briefingEingabe.eingabe.tag = "2026-10-19"; });
  reject("historical B2 not forged", c => { c.drafts[1].briefingEingabe.version = 2; });
  reject("499 inputs denied", c => { c.drafts.pop(); });
  reject("U execution denied", c => { c.units[0].kind = "U"; });
  reject("unknown command mode", c => { c.mode = "U-prestage"; });
  reject("UTC crossing denied", c => { c.slot.plan.endsAtUTC = "2026-10-19T00:01:00.000Z"; });
  reject("expiry preserved", () => { Date.now = () => Date.parse("2026-10-19T00:00:00.000Z"); });
  reject("before start preserved", () => { Date.now = () => Date.parse("2026-10-18T19:59:59.999Z"); });
  reject("inverted actual plan denied", c => { c.slot.plan.startsAtUTC = "2026-10-18T23:59:59.999Z"; });
  reject("actual plan expiry before policy expiry", c => { c.slot.plan.endsAtUTC = "2026-10-18T22:29:59.999Z"; });
  reject("actual plan has not started", c => { c.slot.plan.startsAtUTC = "2026-10-18T22:31:00.000Z"; });
  for (const mutation of [p => { p.extra = true; }, p => { p.version = "other"; },
    p => { p.executionDayUTC = "2026-10-19"; }, p => { p.sourceViewAtUTC = "2026-10-18T08:00:00Z"; }]) {
    check("policy shape/date guard", () => { const p = policy(); mutation(p); assert.throws(() => configure(p)); });
  }
  check("policy changes fail inside context", () => {
    configure(); Cal.withCommand(command(), () => { process.env[Cal.ENV] += " "; assert.throws(() => Cal.outputDay()); });
  });
  check("policy removal fails inside context", () => {
    configure(); const c = command(); Cal.withCommand(c, () => { delete process.env[Cal.ENV]; assert.throws(() => Cal.acceptsInput(c,c.drafts[0])); });
  });
  check("target changes fail inside context", () => {
    configure(); Cal.withCommand(command(), () => { process.env.SUPABASE_URL = "http://127.0.0.1:3000"; assert.throws(() => Cal.outputDay()); });
  });
  check("exception does not leak output day", () => {
    configure(); assert.throws(() => Cal.withCommand(command(), () => { throw Error("controlled"); }));
    assert.equal(Cal.outputDay(new Date("2026-10-18T22:30:00.000Z")), "2026-10-19");
  });
  configure();
  await Promise.all([
    Cal.withCommand(command(), async () => { await new Promise(r => setImmediate(r)); assert.equal(Cal.outputDay(), "2026-10-18"); }),
    (async () => { await new Promise(r => setImmediate(r)); assert.equal(Cal.outputDay(new Date("2026-10-18T22:30:00.000Z")), "2026-10-19"); })()
  ]); cases++;
  console.log(JSON.stringify({ pass: true, cases, isolatedCalendarSimulationOnly: true,
    databaseWrites: 0, activations: 0, fullResourceRuns: 0, realExecutionClockImplementationChanged: false }));
 } finally {
  Date.now = originalNow; https.request = originalRequest;
  for (const k of Object.keys(process.env)) if (!Object.hasOwn(savedEnv,k)) delete process.env[k];
  Object.assign(process.env,savedEnv);
 }
})().catch(e => { console.error(e); process.exitCode = 1; });
