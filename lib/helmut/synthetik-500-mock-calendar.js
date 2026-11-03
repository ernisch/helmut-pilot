"use strict";
// Internal, task-scoped authority. Neither JSON nor ENV can enter this scope.
// The existing private Mock harness authenticates the owner GO before issuing.
const { AsyncLocalStorage } = require("node:async_hooks");
const { berlinTagKey } = require("./briefing-frische");
const VERSION = "helmut-w15-mock-simulation-calendar/1";
const SOURCE = "helmut-w15-mock-historical-qualified-source-replay/1";
const FIRST_DAY = "2026-11-01", LAST_DAY = "2026-11-07";
const DATABASE = "helmut_w15_full500_20261028b";
const HOST = "helmut-w15-full500-local.vercel.app", DEPLOYMENT = "dpl_W15Full500LocalNotProduction";
const grants = new WeakMap(), scope = new AsyncLocalStorage();
const fail = code => { throw Error("synthetik500-mock-calendar-" + code); };
const need = (ok, code) => { if (!ok) fail(code); };
const exact = (v, keys) => v && typeof v === "object" && !Array.isArray(v)
  && Object.keys(v).sort().join("|") === [...keys].sort().join("|");
const sha = v => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const iso = v => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const AUTH_KEYS = ["schema", "contract", "branch", "exactCommit", "runId", "runAttempt", "nonce",
  "approvalSHA256", "sourceQualificationSHA256", "productionAllowed", "paidModelsAllowed"];
function validateRecord(value, nowISO = new Date().toISOString()) {
  need(exact(value, ["schema", "contract", "authorization", "sourceAuthorization", "window", "selector"])
    && value.schema === "helmut-w15-mock-calendar-scope/1" && value.contract === VERSION, "shape");
  const a = value.authorization, s = value.sourceAuthorization;
  need(exact(a, [...AUTH_KEYS, "historicalPricesOnly"]) && exact(s, AUTH_KEYS)
    && a.schema === "helmut-w15-isolated-mock-calendar-authorization/1" && a.contract === VERSION
    && a.historicalPricesOnly === true && s.schema === "helmut-w15-isolated-mock-source-authorization/1"
    && s.contract === SOURCE, "authorization");
  for (const k of AUTH_KEYS.filter(k => !["schema", "contract"].includes(k))) need(a[k] === s[k], "source-go-binding");
  need(a.branch === "refs/heads/codex/w15-github-end500-preparation-20261028"
    && typeof a.exactCommit === "string" && /^[a-f0-9]{40}$/.test(a.exactCommit)
    && typeof a.runId === "string" && /^[1-9][0-9]{4,19}$/.test(a.runId) && a.runAttempt === 1
    && typeof a.nonce === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(a.nonce)
    && sha(a.approvalSHA256) && sha(a.sourceQualificationSHA256)
    && a.productionAllowed === false && a.paidModelsAllowed === false, "authorization");
  const w = value.window;
  need(exact(w, ["startsAtUTC", "endsAtUTC", "completionDeadlineUTC"])
    && Object.values(w).every(iso) && iso(nowISO), "window");
  need(Date.parse(w.endsAtUTC) - Date.parse(w.startsAtUTC) === 10800000 - 1
    && Date.parse(w.completionDeadlineUTC) - Date.parse(w.startsAtUTC) === 12600000 - 1, "duration");
  const day = w.startsAtUTC.slice(0, 10), berlin = berlinTagKey(new Date(w.startsAtUTC));
  need(FIRST_DAY <= day && day <= LAST_DAY && Object.values(w).every(v => v.slice(0, 10) === day
    && berlinTagKey(new Date(v)) === berlin), "calendar");
  need(nowISO.slice(0, 10) === day && berlinTagKey(new Date(nowISO)) === berlin
    && Date.parse(w.startsAtUTC) <= Date.parse(nowISO) && Date.parse(nowISO) < Date.parse(w.completionDeadlineUTC), "expired");
  need(value.selector === null || exact(value.selector, ["operationId", "commandHash"])
    && /^synthetik500-[A-Za-z0-9_-]{8,100}$/.test(value.selector.operationId) && sha(value.selector.commandHash), "selector");
  return structuredClone(value); // Validation returns data, never authority.
}
function createIssuer(verify) {
  need(typeof verify === "function", "trusted-verifier");
  const owner = {}; let issued = false;
  return Object.freeze({
    issue() {
      need(!issued, "issuer-reused"); const record = validateRecord(verify()); issued = true;
      const grant = Object.freeze({}); grants.set(grant, { owner, record, revoked: false }); return grant;
    },
    revoke(grant) { const g = grants.get(grant); need(g?.owner === owner, "issuer"); g.revoked = true; }
  });
}
function active() {
  const grant = scope.getStore(); if (!grant) return null;
  const g = grants.get(grant); need(g && !g.revoked, "grant");
  return validateRecord(g.record);
}
function run(grant, body) {
  need(grants.has(grant) && typeof body === "function" && !scope.getStore(), "scope");
  return scope.run(grant, () => { active(); return body(); });
}
function routeAllowed(route) {
  const r = active(); return !!r && route?.productionCommit === r.authorization.exactCommit
    && route.deploymentHost === HOST && route.deploymentId === DEPLOYMENT;
}
function requirePlan(plan) {
  const r = active(); need(r && routeAllowed(plan?.routeContract?.route), "plan-isolation");
  // Receipt/restore use the same outer budget. A freshly constructed command
  // may start later inside it, but may never extend its original deadline.
  need(iso(plan.startsAtUTC) && Date.parse(plan.startsAtUTC) >= Date.parse(r.window.startsAtUTC)
    && Date.parse(plan.startsAtUTC) < Date.parse(r.window.endsAtUTC)
    && plan.endsAtUTC === r.window.endsAtUTC
    && (r.selector === null || plan.operationId === r.selector.operationId), "plan-binding");
}
function orderDayAllowed(day) { const r = active(); return !!r && day === r.window.startsAtUTC.slice(0, 10); }
function workerSnapshot(input) {
  const r = active(); if (!r) return null;
  if (!r.selector || input.operationId !== r.selector.operationId || input.commandHash !== r.selector.commandHash) return null;
  return structuredClone(r);
}
function withWorkerSnapshot(record, input, body) {
  const { isMainThread, parentPort, workerData } = require("node:worker_threads");
  need(!isMainThread && parentPort && workerData === input, "worker-origin");
  if (record === null) { need(input.mockCalendarScope == null, "worker-origin"); return body(); }
  need(input.mockCalendarScope === record, "worker-origin");
  const issuer = createIssuer(() => record), grant = issuer.issue();
  try { return run(grant, () => {
    const r = active(); need(r.selector && input.operationId === r.selector.operationId
      && input.commandHash === r.selector.commandHash, "worker-selector"); return body();
  }); } finally { issuer.revoke(grant); }
}
function requireWorkerCommand(input, command) {
  const r = active(); if (!r) return;
  need(command?.slot?.plan?.operationId === r.selector.operationId
    && command.slot.plan.productionCommit === r.authorization.exactCommit
    && Array.isArray(command.drafts) && command.drafts.length === 500
    && command.drafts.every(d => d.briefingEingabe?.version === 1), "worker-command");
}
const LABEL = Object.freeze({ contract: VERSION, priceBasis: "HISTORICAL_OCTOBER_SIMULATION_ONLY",
  currentProviderPricesAccepted: false, productionAllowed: false, paidModelsAllowed: false });
module.exports = { VERSION, FIRST_DAY, LAST_DAY, DATABASE, HOST, DEPLOYMENT, LABEL,
  validateRecord, createIssuer, run, active, routeAllowed, requirePlan, orderDayAllowed,
  workerSnapshot, withWorkerSnapshot, requireWorkerCommand };
