"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const storage = require("../lib/helmut/storage");
const serverPath = path.join(__dirname, "../server.js");
const source = fs.readFileSync(serverPath, "utf8");
const start = source.indexOf('  if (url.pathname === "/api/cron/lage-briefing") {');
const end = source.indexOf('  // ═══ ZWEITER MORGENSLOT', start);
assert(start > 0 && end > start, "Regulaerer Lagehandler muss vorhanden sein");
const wrapperStart = source.indexOf("async function runCronForTenants(");
assert(wrapperStart > 0, "Echter Mandantenwrapper muss vorhanden sein");
const wrapperEnd = source.indexOf("\n}\n", wrapperStart) + 3;
const script = new vm.Script(source.slice(wrapperStart, wrapperEnd) + "\n(async () => {\n" + source.slice(start, end) + "\n})()");
const clean = value => JSON.parse(JSON.stringify(value));
const successful = { available: true, fromCache: false, demo: false, vorgaenge: [] };

async function run(profiles, options = {}) {
  let now = options.nowMs ?? Date.parse("2026-09-12T05:45:00Z");
  const saved = options.saved || { state: {}, writes: 0 };
  const F = require("../lib/helmut/cron-fairness");
  const tenants = require("../lib/helmut/tenant-context");
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const auth = { processRuns: [] }, rows = [], calls = [];
  const context = vm.createContext({
    require: createRequire(serverPath), crypto, Date: Clock,
    console: { log() {}, warn() {}, error() {} },
    accounts: { recordSystemError: async () => {} },
    tenantContext: { resolveCronTenants: () => tenants.resolveCronTenants({ listProfiles: async () => {
      if (options.listError) throw new Error("offline-list-error");
      return profiles;
    } }) },
    cronFairness: { ...F, fairnessEnabled: () => options.fairness !== false,
      runTenantsFairly: args => F.runTenantsFairly({ ...args, now: () => now }) },
    readCronFairnessState: async () => ({ ok: !options.readError, state: clean(saved.state) }),
    saveCronFairnessState: async (patch, opts) => {
      saved.writes++;
      if (options.writeError || (options.claimError && opts.pruefen)) return { ok: false };
      saved.state = F.mergeState(saved.state, clean(patch), { nowMs: now });
      if (options.noEcho) return { ok: true };
      if (options.onSave) await options.onSave(saved, patch, opts, now);
      return { ok: true, state: clean(saved.state) };
    },
    url: { pathname: "/api/cron/lage-briefing" }, request: {}, response: {},
    authorizeCron: () => options.authorized !== false,
    handleAsync: (_res, fn) => fn(),
    helmutRunId: () => options.runId || "briefing-lage-local-diagnose", helmutExecLocation: () => "local",
    scalablePipeline: { narrativUeberWarteschlange: () => options.queue === true },
    narrativSlotLauf: async () => ({ pfad: "warteschlange" }),
    mandatsklasse: require("../lib/helmut/mandatsklasse"),
    listProfiles: async () => { if (options.listError) throw new Error("offline-list-error"); return profiles; },
    activeProfile: async id => {
      if (options.profileErrors?.[id]) throw options.profileErrors[id];
      return options.currentProfiles?.[id] || profiles.find(p => p?.id === id);
    },
    validateProfile: p => ({ disabled: !tenants.isActiveMandate(p) }),
    buildLageBriefing: async p => {
      calls.push(p.id);
      if (options.advanceMs) now += options.advanceMs;
      if (options.buildErrors?.[p.id]) throw options.buildErrors[p.id];
      return options.results?.[p.id] || successful;
    },
    recordProcessRun: async entry => {
      const result = await storage.recordProcessRun(entry, {
        relationalAktiv: true, readAuth: async () => auth, writeAuth: async () => {},
        insertRelational: async row => { rows.push(clean(row)); }
      });
      return options.telemetryFailure ? { ...result, ok: false, vollstaendig: false, fehler: [{ backend: "relational" }] } : result;
    }
  });
  const response = clean(await script.runInContext(context) ?? null);
  return { response, rows, blob: clean(auth.processRuns[0] ?? null), calls, saved, now, profiles };
}

module.exports = { run };
