"use strict";

// Nur neue Admissionnaht: echter Geld-CAS-Code mit isolierter Speicherfixture,
// echter AI-Einstieg mit HTTPS-Stub. Keine DB, Anbieter oder alten Testsuiten.
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const P = require("../lib/helmut/synthetik-500-profile");
const A = require("../lib/helmut/synthetik-500-kosten-admission");
const B = require("../lib/helmut/testkosten-budget");
const V = require("../lib/helmut/verstehen-vertrag");
const START = "2026-10-02T12:00:00.000Z", END = "2026-10-02T13:00:00.000Z", DAY = START.slice(0, 10);
const COMMIT = "c".repeat(40), RUN = "nachlauf500-1790935200000", OP = "synthetik500-admission-offline-20261002";
const OWNER = "test-kohorte-synthetik-bt-001", INPUT = P.hash("fictional-draft-input");
const PROMPT = "Ausschliesslich fiktive lokale Admissionpruefung.", SCHEMA = { type: "object" };
const BODY = JSON.stringify({ model: "gpt-5-mini", input: PROMPT, max_output_tokens: 3000,
  reasoning: { effort: "minimal" }, text: { format: { type: "json_schema", name: "knowledge_object", schema: SCHEMA, strict: false } } });
const REQUEST_HASH = A.requestHash(BODY);
const ENV = { VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt",
  AZURE_OPENAI_KEY: "offline-fixture-key", AZURE_OPENAI_ENDPOINT: "https://offline.openai.azure.com",
  AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini", HELMUT_PRODUCTION_COMMIT: COMMIT };
const RECEIPT = { id: "fictional-usage-receipt", model: "gpt-5-mini", promptTokens: 100, completionTokens: 20, _ablage: { blob: true } };
const clone = x => structuredClone(x);
function makeIntent(fields) {
  const x = { ...fields, model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 };
  return { id: A.intentHash(RUN, x), ...x };
}
const draft = () => makeIntent({ phase: "D", owner: OWNER, inputVersionHash: INPUT, actualRequestHash: REQUEST_HASH });
function fixture(intents = [draft()], absent = false) {
  const plan = { version: A.PLAN_VERSION, operationId: OP, runId: RUN, productionCommit: COMMIT,
    runtimeManifestHash: "f".repeat(64), startsAtUTC: START, endsAtUTC: END, intents };
  let state = { llmUsage: [], users: [{ id: "unchanged-offline-user" }],
    [B.AUFTRAG_KEY]: { version: 3, id: "offline-order", abTag: DAY, limit: 7000000, externGebunden: 0 },
    ...(!absent ? { [A.KEY]: { version: A.VERSION, plan, planHash: P.hash(plan), consumed: {} } } : {}) };
  let queue = Promise.resolve(), serial = 0, clock = Date.parse(START), mutations = 0;
  const h = { unknownCommit: false, failBeforeCommit: false, failRead: false,
    read: () => clone(state), mutate: fn => fn(state), advance: ms => { clock += ms; }, mutations: () => mutations };
  h.storage = {
    readAuthStore: async () => { if (h.failRead) throw Error("read-unknown"); return h.read(); },
    leseLlmTageszaehler: async () => ({ ok: true, used: 0 }),
    mutateAuthStore: fn => {
      const pending = queue.then(async () => {
        if (h.failBeforeCommit) throw Error("write-not-confirmed");
        const working = h.read(), result = await fn(working);
        state = working; mutations++;
        if (h.unknownCommit) throw Error("committed-but-response-lost");
        return result;
      });
      queue = pending.catch(() => {}); return pending;
    }
  };
  h.deps = { storage: h.storage, env: ENV, now: () => new Date(clock), id: () => "ticket-" + (++serial) };
  h.args = { model: "gpt-5-mini", maxOutputTokens: 3000, runId: RUN, politicianId: OWNER, phase: "entwurf",
    admission: absent ? null : { operationId: OP, planHash: P.hash(plan) }, inputVersionHash: INPUT,
    actualRequestHash: REQUEST_HASH };
  h.meta = { callType: "lageBriefing", runId: RUN, politicianId: OWNER, testKostenPhase: "entwurf",
    costAdmission: h.args.admission, costInputVersionHash: INPUT };
  return h;
}
async function sender(h, fn, active = true, realAuthRead = false) {
  const https = require("node:https"), storage = require("../lib/helmut/storage"), ai = require("../lib/helmut/ai");
  const provider = require("../lib/helmut/anbieter-steuerung");
  const oldEnv = { ...process.env }, oldRequest = https.request, oldProvider = provider.steuerungAktiv;
  const names = ["mutateAuthStore", "readAuthStore", "leseLlmTageszaehler", "reserveLlmCall", "recordLlmUsage"];
  const old = Object.fromEntries(names.map(k => [k, storage[k]]));
  let requests = 0;
  try {
    Object.assign(process.env, ENV, { HELMUT_TESTLAUF_KOMMUNIKATION: active ? "gesperrt" : "off" });
    for (const k of ["mutateAuthStore", "readAuthStore", "leseLlmTageszaehler"]) {
      if (realAuthRead && k === "readAuthStore") continue;
      storage[k] = h.storage[k];
    }
    storage.reserveLlmCall = async () => ({ allowed: true });
    storage.recordLlmUsage = async () => RECEIPT;
    provider.steuerungAktiv = () => false;
    https.request = (_url, _opts, cb) => {
      requests++;
      const req = new EventEmitter(); req.destroy = () => {};
      req.write = body => {
        assert.equal(A.requestHash(body), REQUEST_HASH, "Hash des tatsaechlich gesendeten Payloads");
        if (h.read()[A.KEY]) assert.equal(Object.keys(h.read()[A.KEY].consumed).length, 1, "Verbrauch vor HTTPS-Stub");
      };
      req.end = () => setImmediate(() => {
        const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {}; res.destroy = () => {};
        cb(res); res.emit("data", JSON.stringify({ status: "completed", usage: { input_tokens: 100, output_tokens: 20 },
          output: [{ content: [{ type: "output_text", text: '{"ok":true}' }] }] })); res.emit("end");
      }); return req;
    };
    await fn({ send: meta => ai.requestStructuredJson(PROMPT, SCHEMA, meta ?? h.meta, "gpt-5-mini"), count: () => requests, storage });
  } finally {
    https.request = oldRequest; provider.steuerungAktiv = oldProvider;
    for (const k of names) storage[k] = old[k];
    for (const k of Object.keys(process.env)) if (!(k in oldEnv)) delete process.env[k];
    Object.assign(process.env, oldEnv);
  }
}
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log("PASS " + name); }
async function strictReadTests() {
  const fs = require("node:fs"), path = require("node:path"), storage = require("../lib/helmut/storage");
  const dir = path.join(__dirname, "..", ".helmut-data"), file = path.join(dir, "auth.json");
  assert.equal(fs.existsSync(dir), false, "Strict-read test owns its new isolated worktree-local fixture directory");
  fs.mkdirSync(dir);
  try {
    await test("Echter Strict-Authleser: beschaedigte oder primitive lokale JSON stoppen ohne Provider", async () => {
      for (const raw of ["{broken-json", "null", "[]", '"not-a-store"']) {
        fs.writeFileSync(file, raw);
        const h = fixture([], true);
        await sender(h, async s => {
          process.env.HELMUT_STORAGE_BACKEND = "local";
          await assert.rejects(s.send(), { reason: "synthetik500-admission-auth-unreadable" });
          assert.equal(s.count(), 0);
        }, false, true);
        assert.equal(h.mutations(), 0); assert.equal(fs.readFileSync(file, "utf8"), raw);
      }
    });
    fs.unlinkSync(file);
    await test("Echter Strict-Authleser: unlesbarer lokaler Dateipfad ist keine Planabwesenheit", async () => {
      fs.mkdirSync(file); // readFileSync liefert EISDIR, auch unter privilegierten Testnutzern.
      const h = fixture([], true);
      await sender(h, async s => {
        process.env.HELMUT_STORAGE_BACKEND = "local";
        await assert.rejects(s.send(), { reason: "synthetik500-admission-auth-unreadable" }); assert.equal(s.count(), 0);
      }, false, true);
      assert.equal(h.mutations(), 0); assert.equal(fs.statSync(file).isDirectory(), true);
      fs.rmdirSync(file);
    });
    await test("Echter Strict-Authleser: konfigurierte Supabase ohne URL oder Servicerecht erlaubt keinen Localfallback", async () => {
      fs.writeFileSync(file, JSON.stringify({ users: [{ id: "local-must-not-authorize-supabase" }] }));
      for (const missing of ["url", "service"]) {
        const h = fixture([], true);
        await sender(h, async s => {
          process.env.HELMUT_STORAGE_BACKEND = "supabase";
          for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"]) delete process.env[key];
          if (missing === "url") process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-fixture-only";
          else process.env.SUPABASE_URL = "https://offline.supabase.invalid";
          await assert.rejects(s.send(), { reason: "synthetik500-admission-auth-unreadable" }); assert.equal(s.count(), 0);
        }, false, true);
        assert.equal(h.mutations(), 0);
      }
    });
    await test("Echter Strict-Authleser: gesunder oder nachweislich fehlender lokaler Store erhaelt den bisherigen Pfad", async () => {
      for (const absent of [false, true]) {
        if (absent) fs.unlinkSync(file);
        else fs.writeFileSync(file, JSON.stringify({ users: [{ id: "local-confirmed-store" }] }));
        const h = fixture([], true);
        await sender(h, async s => {
          process.env.HELMUT_STORAGE_BACKEND = "local";
          assert.deepEqual(await s.send(), { ok: true }); assert.equal(s.count(), 1);
          const read = await storage.readAuthStore({ strict: true });
          assert.deepEqual(read.users, absent ? [] : [{ id: "local-confirmed-store" }]);
        }, false, true);
        assert.equal(h.mutations(), 0);
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function main({ strictReadOnly = false } = {}) {
  const RealDate = Date, originalFetch = global.fetch;
  global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [START])); } static now() { return RealDate.parse(START); } };
  global.fetch = () => { throw Error("No external network in admission tests"); };
  try {
    if (strictReadOnly) { await strictReadTests(); return; }
    await test("Doppelte parallele Aufnahme erreicht genau einen HTTPS-Stub und eine Reserve", async () => {
      const h = fixture();
      await sender(h, async s => {
        const r = await Promise.allSettled([s.send(), s.send()]);
        assert.equal(r.filter(x => x.status === "fulfilled").length, 1);
        assert.match(r.find(x => x.status === "rejected").reason.reason, /intent-consumed/);
        assert.equal(s.count(), 1);
        assert.equal(Object.keys(h.read()[A.KEY].consumed).length, 1);
        const calls = h.read()[B.KEY][DAY].calls;
        assert.equal(Object.keys(calls).length, 1); assert.equal(Object.values(calls)[0].reserved, 212000);
        assert.equal(h.read()[B.KEY][DAY].limit, 6000000); assert.equal(h.read()[B.AUFTRAG_KEY].limit, 7000000);
      });
    });
    await test("Fremder Lauf/Operation/Planhash und fehlende Identitaet stoppen ohne Mutation/HTTP", async () => {
      for (const change of [m => { m.runId = "nachlauf500-999999999"; }, m => { m.costAdmission.operationId += "-foreign"; },
        m => { m.costAdmission.planHash = "a".repeat(64); }, m => { m.costAdmission = null; }, m => { m.politicianId = "foreign"; }]) {
        const h = fixture(), before = h.read(), meta = clone(h.meta); change(meta);
        await sender(h, async s => { await assert.rejects(s.send(meta)); assert.equal(s.count(), 0); });
        assert.deepEqual(h.read(), before);
      }
    });
    await test("Versions- oder echter Requestdrift stoppt vor Verbrauch", async () => {
      for (const patch of [{ inputVersionHash: "a".repeat(64) }, { actualRequestHash: "b".repeat(64) },
        { maxOutputTokens: 6000 }, { runId: [RUN] }, { inputVersionHash: [INPUT] }]) {
        const h = fixture(), before = h.read();
        await assert.rejects(B.reserviere({ ...h.args, ...patch }, h.deps)); assert.deepEqual(h.read(), before);
      }
      const h = fixture(), before = h.read(); h.meta.costInputVersionHash = "d".repeat(64);
      await sender(h, async s => { await assert.rejects(s.send()); assert.equal(s.count(), 0); });
      assert.deepEqual(h.read(), before);
    });
    await test("Tages- und Auftragsablehnung verbrauchen keinen Intent", async () => {
      const order = fixture(); order.mutate(x => { x[B.AUFTRAG_KEY].externGebunden = 6788001; });
      const before = order.read(); await assert.rejects(B.reserviere(order.args, order.deps)); assert.deepEqual(order.read(), before);
      const day = fixture(); day.mutate(x => { x[B.KEY] = { [DAY]: { version: 2, day: DAY,
        tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 6000000, spent: 5788001, baseline: 5788001,
        baselineCalls: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null } }; });
      await assert.rejects(B.reserviere(day.args, day.deps), { reason: "test-usd-grenze-erreicht" });
      assert.deepEqual(day.read()[A.KEY].consumed, {}); assert.deepEqual(day.read()[B.KEY][DAY].calls, {});
    });
    await test("Unklarer CAS nach Commit erzeugt keinen HTTP-Aufruf und keinen erneuten Versuch", async () => {
      const h = fixture(); h.unknownCommit = true;
      await sender(h, async s => { await assert.rejects(s.send(), { reason: "test-usd-reservierung-nicht-bestaetigt" }); assert.equal(s.count(), 0); });
      assert.equal(Object.keys(h.read()[A.KEY].consumed).length, 1);
      assert.equal(B.belegt(h.read()[B.KEY][DAY]), 212000);
      h.unknownCommit = false;
      await sender(h, async s => { await assert.rejects(s.send(), { reason: "synthetik500-admission-intent-consumed" }); assert.equal(s.count(), 0); });
    });
    await test("Nicht-Sendebeleg gibt keinen bereits verbrauchten Intent erneut frei", async () => {
      const h = fixture(), ticket = await B.reserviere(h.args, h.deps);
      await B.nichtGesendet(ticket, { kiNichtGesendet: true }, h.deps);
      assert.equal(B.belegt(h.read()[B.KEY][DAY]), 0); assert.equal(Object.keys(h.read()[A.KEY].consumed).length, 1);
      await assert.rejects(B.reserviere(h.args, h.deps), { reason: "synthetik500-admission-intent-consumed" });
    });
    await test("Planslot bei inaktivem Kostenriegel und unbekannter Lesestand stoppen vor HTTP", async () => {
      for (const unreadable of [false, true]) {
        const h = fixture(); h.failRead = unreadable;
        await sender(h, async s => { await assert.rejects(s.send()); assert.equal(s.count(), 0); }, false);
        assert.equal(h.mutations(), 0);
      }
    });
    await test("Abwesender Planslot erhaelt bisherige aktive und inaktive Callpfade", async () => {
      for (const active of [false, true]) {
        const h = fixture([], true);
        await sender(h, async s => { assert.deepEqual(await s.send(), { ok: true }); assert.equal(s.count(), 1); }, active);
        assert.equal(Object.hasOwn(h.read(), A.KEY), false); assert.deepEqual(h.read().users, [{ id: "unchanged-offline-user" }]);
      }
    });
    await test("Ausgeloeschter Consumptionmarker kann ein vorhandenes Ticket nicht wieder scharf machen", async () => {
      const h = fixture(); await B.reserviere(h.args, h.deps);
      h.mutate(x => { x[A.KEY].consumed = {}; });
      await assert.rejects(B.reserviere(h.args, h.deps), { reason: "synthetik500-admission-consumption-ledger-drift" });
    });
    await test("R bleibt trotz korrekter endlicher Abhaengigkeit und behauptetem Callerreceipt gesperrt", async () => {
      const d = draft(), r = makeIntent({ phase: "R", owner: OWNER, inputVersionHash: null, actualRequestHash: null,
        dependsOn: d.id, contextVersionHash: INPUT });
      const h = fixture([d, r]);
      await assert.rejects(B.reserviere({ ...h.args, phase: "pruefung" }, h.deps), { reason: "synthetik500-admission-review-receipt-unimplemented" });
      assert.equal(h.mutations(), 0);
      await sender(h, async s => { await assert.rejects(s.send({ ...h.meta, testKostenPhase: "pruefung", draftReceipt: "caller-claim" })); assert.equal(s.count(), 0); });
      assert.equal(A.status().wholeEnforcement, false); assert.equal(A.status().reviewAdmission, false);
    });
    await test("U bindet originalen40er Vertragshash getrennt vom64er Requesthash", async () => {
      const original = V.eingabeHash({ vorgangId: "fictional-vorgang", dokumente: [{ id: "fictional-doc" }] });
      const u = makeIntent({ phase: "U", vorgangId: "fictional-vorgang", contractInputHash: original, actualRequestHash: REQUEST_HASH });
      const h = fixture([u]), args = { ...h.args, phase: null, politicianId: null, inputVersionHash: null,
        vorgangId: "fictional-vorgang", contractInputHash: original };
      const ticket = await B.reserviere(args, h.deps);
      assert.equal(original.length, 40); assert.equal(ticket.admission.actualRequestHash.length, 64);
      const bad = fixture([u]);
      await assert.rejects(B.reserviere({ ...bad.args, ...args, contractInputHash: original.padEnd(64, "0") }, bad.deps));
      assert.equal(bad.mutations(), 0);
    });
    await test("Abgelaufenes Fenster, Deploymentdrift und unendliche/duplizierte Planinputs stoppen", async () => {
      const expired = fixture(); expired.advance(3600000);
      await assert.rejects(B.reserviere(expired.args, expired.deps), { reason: "synthetik500-admission-window-closed" });
      const changed = fixture();
      await assert.rejects(B.reserviere(changed.args, { ...changed.deps, env: { ...ENV, HELMUT_PRODUCTION_COMMIT: "a".repeat(40) } }), { reason: "synthetik500-admission-deployment-drift" });
      for (const mutate of [p => { p.runId = [p.runId]; }, p => { p.intents.push(p.intents[0]); },
        p => { p.endsAtUTC = "2026-10-03T01:00:00.000Z"; }, p => { p.intents[0].attemptLimit = 2; }]) {
        const h = fixture(); h.mutate(x => { mutate(x[A.KEY].plan); x[A.KEY].planHash = P.hash(x[A.KEY].plan); });
        await assert.rejects(B.reserviere(h.args, h.deps)); assert.equal(h.mutations(), 0);
      }
    });
    await test("Sender prueft Payload, Fenster und Commit erneut nach vorgelagerten Reservierungen", async () => {
      const h = fixture(), ticket = await B.reserviere(h.args, h.deps);
      assert.throws(() => A.pruefeSendung(ticket, "a".repeat(64), START, COMMIT), /sender-input-drift/);
      assert.throws(() => A.pruefeSendung(ticket, REQUEST_HASH, END, COMMIT), /window-closed/);
      assert.throws(() => A.pruefeSendung(ticket, REQUEST_HASH, START, "a".repeat(40)), /deployment-drift/);
      A.pruefeSendung(ticket, REQUEST_HASH, START, COMMIT);
    });
    await test("Understandingdefault leitet Vorgang/40erHash und Plankontext unveraendert weiter", async () => {
      const U = require("../lib/helmut/understanding"), ai = require("../lib/helmut/ai"), old = ai.requestStructuredJson;
      let captured;
      try {
        ai.requestStructuredJson = async (_prompt, _schema, meta) => { captured = meta; return {}; };
        const costAdmission = { operationId: OP, planHash: "a".repeat(64) };
        await U.defaultDeps({ runId: RUN, costAdmission }).requestUnderstanding(PROMPT,
          { vorgangId: "fictional-vorgang", contractInputHash: "b".repeat(40) });
        assert.equal(captured.vorgangId, "fictional-vorgang"); assert.equal(captured.understandingInputHash, "b".repeat(40));
        assert.deepEqual(captured.costAdmission, costAdmission); assert.equal(captured.politicianId, null);
      } finally { ai.requestStructuredJson = old; }
    });
    await test("Erst- und Updatepfad geben die jeweils echte originale U-Eingabeidentitaet weiter", async () => {
      const U = require("../lib/helmut/understanding");
      const doc = { id: "fictional-doc", title: "Fiktive lokale Beratung", summary: "Eine lokale Fixture beraet.",
        url: "https://example.invalid/fictional", source_name: "Offlinefixture", published_at: START };
      for (const update of [false, true]) {
        let captured;
        const contract = { reserviere: async () => ({ erlaubt: true, fencing: 1 }), modellstart: async () => ({ erlaubt: true }),
          freigabeOhneAufruf: async () => ({ ok: true }), freigabe: async () => ({ ok: true }),
          vormerkungLese: async () => ({ verfuegbar: true, vorhanden: false, fehlversuche: 0 }),
          vormerkungErhoehe: async () => {}, vormerkungLoese: async () => {} };
        const deps = { canSpend: async () => ({ allowed: true }), gateMode: () => "off", modelName: () => "offline",
          requestUnderstanding: async (_prompt, input) => { captured = input; throw A.fehler("offline-intent-block"); },
          listVorgangDocuments: async () => [], saveSources: async () => {}, logSkip: () => {} };
        const vorgangId = "fictional-vorgang", cluster = { documents: [doc] };
        if (update) await U.understandUpdate(cluster, deps, { vorgangId, existing: { id: "ko-offline", ko_version: 3 },
          neueDocs: [doc], alleDocs: [doc], neueAnker: [], spur: {}, vertrag: contract });
        else await U.understandOneCluster(cluster, deps, { vorgangId, existing: null, vertrag: contract });
        assert.deepEqual(captured, { vorgangId, contractInputHash: V.eingabeHash({ vorgangId, dokumente: [doc],
          modus: update ? "update" : "erst", koVersion: update ? 4 : null }) });
      }
    });
    await strictReadTests();
  } finally { global.Date = RealDate; global.fetch = originalFetch; }
  console.log(`${passed}/${passed} neue Admissionpruefungen gruen; nur Speicherfixture/HTTPS-Stub, wholeEnforcement=false.`);
}
if (require.main === module) main({ strictReadOnly: process.argv.includes("--strict-read-only") }).catch(error => { console.error("FAIL " + error.message); process.exitCode = 1; });
module.exports = { main };
