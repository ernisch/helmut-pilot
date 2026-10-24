"use strict";

// Opt-in LOCAL MOCK resource fixture only. This never changes Date, timers,
// publication dates, UTC accounting days, admission, or a Production calendar.
// The complete policy text is included in the signed content source binding.
const { AsyncLocalStorage } = require("node:async_hooks");
const { createHash } = require("node:crypto");
const https = require("node:https");
const nativeRequest = https.request;
const context = new AsyncLocalStorage();
const DiagnosticScope = require("./local-unit-diagnostic-scope");
const ENV = "HELMUT_LOCAL_RESOURCE_CALENDAR_JSON";
const VERSION = "helmut-local-mock-utc-fixture-calendar/1";
const keys = ["version", "operationId", "sourceDay", "sourceViewAtUTC", "sourceInputsHash",
  "executionDayUTC", "startsAtUTC", "endsAtUTC"];
let mockRequest = null;
const sha = text => createHash("sha256").update(text).digest("hex");
function fail() { throw Error("local-resource-calendar-not-admitted"); }
function need(ok) { if (!ok) fail(); }
function instant(value) {
  need(typeof value === "string" && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value);
  return Date.parse(value);
}
function privateTarget(env) {
  let u; try { u = new URL(env.SUPABASE_URL); } catch { fail(); }
  need(!env.VERCEL && env.HELMUT_LLM_USAGE_STORAGE === "relational-atomic-v1"
    && u.protocol === "http:" && !u.username && !u.password && !u.search && !u.hash
    && (/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(u.hostname)
      || /^10\.\d+\.\d+\.\d+$/.test(u.hostname)
      || /^192\.168\.\d+\.\d+$/.test(u.hostname)
      || /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(u.hostname)));
  return u.origin;
}
function validatePolicyData(p) {
  need(p && typeof p === "object" && !Array.isArray(p)
    && Object.keys(p).length === keys.length && keys.every(k => Object.hasOwn(p, k))
    && p.version === VERSION && /^synthetik500-resources\d{2}-[a-f0-9]{12}$/.test(p.operationId)
    && /^\d{4}-\d{2}-\d{2}$/.test(p.sourceDay)
    && p.executionDayUTC === p.sourceDay && /^[a-f0-9]{64}$/.test(p.sourceInputsHash));
  const source = instant(p.sourceViewAtUTC), start = instant(p.startsAtUTC), end = instant(p.endsAtUTC);
  need(require("./briefing-frische").berlinTagKey(new Date(source)) === p.sourceDay
    && p.sourceViewAtUTC.slice(0, 10) === p.executionDayUTC
    && start < end && end - start <= 9 * 3600000
    && p.startsAtUTC.slice(0, 10) === p.executionDayUTC
    && p.endsAtUTC.slice(0, 10) === p.executionDayUTC);
  return Object.freeze({ ...p });
}
function policy(env = process.env) {
  const raw = env[ENV];
  if (raw === undefined || raw === "") return null;
  need(typeof raw === "string" && raw.length <= 4096);
  let parsed; try { parsed = JSON.parse(raw); } catch { fail(); }
  const p = validatePolicyData(parsed);
  return Object.freeze({ ...p, fingerprint: sha(raw), target: privateTarget(env) });
}
function registerLocalMockTransport(request) {
  need(policy() && typeof request === "function" && request === https.request && request !== nativeRequest);
  mockRequest = request;
}
function current(p) {
  const actual = policy();
  need(actual && actual.fingerprint === p.fingerprint && actual.target === p.target
    && https.request === mockRequest && mockRequest !== null);
  const now = Date.now();
  need(now >= Date.parse(p.actualStartsAtUTC || p.startsAtUTC)
    && now < Date.parse(p.actualEndsAtUTC || p.endsAtUTC)
    && Date.parse(p.sourceViewAtUTC) <= now
    && new Date(now).toISOString().slice(0, 10) === p.executionDayUTC);
}
function commandPolicy(command) {
  const p = policy();
  if (!p) { need(!context.getStore()); return null; }
  current(p);
  const plan = command?.slot?.plan;
  need(command.mode === "D-R-500" && command.native === null
    && plan?.operationId === p.operationId && Array.isArray(command.drafts) && command.drafts.length === 500
    && Array.isArray(command.units) && command.units.length === 500 && command.units.every(u => u.kind === "DR")
    && instant(plan.startsAtUTC) >= Date.parse(p.startsAtUTC)
    && instant(plan.endsAtUTC) <= Date.parse(p.endsAtUTC)
    && Date.parse(plan.startsAtUTC) < Date.parse(plan.endsAtUTC)
    && plan.startsAtUTC.slice(0, 10) === p.executionDayUTC
    && plan.endsAtUTC.slice(0, 10) === p.executionDayUTC);
  const hashes = command.drafts.map(d => {
    need(d.briefingDatum === p.sourceViewAtUTC && d.briefingEingabe?.version === 1
      && d.briefingEingabe.acceptedSnapshot === undefined && d.briefingEingabe.eingabe?.tag === p.sourceDay
      && /^[a-f0-9]{64}$/.test(d.briefingEingabe.eingabe.eingabeHash));
    return d.briefingEingabe.eingabe.eingabeHash;
  });
  need(sha(JSON.stringify(hashes)) === p.sourceInputsHash);
  const bound = Object.freeze({ ...p, actualStartsAtUTC: plan.startsAtUTC, actualEndsAtUTC: plan.endsAtUTC });
  current(bound);
  return bound;
}
// This separate branch can only exist inside the new native one-attempt
// capability. Its historical source clock never replaces a real timer, UTC
// accounting day or generation timestamp, and it cannot admit a full500 run.
function diagnosticCalendar(command = null, input = null) {
  const active = DiagnosticScope.currentVerified();
  if (active === null) return null;
  need(active && active.command?.version === "helmut-local-unit-diagnostic-command/1"
    && active.command.mode === "D-R-1-local-fixture" && active.selection
    && (!command || command === active.command) && !process.env.VERCEL);
  const c = active.command, p = c.calendar, plan = c.slot?.plan;
  need(p && p.sourceDay === "2026-10-21" && p.sourceDay === c.source?.sourceDay
    && p.sourceViewAtUTC === c.drafts?.[0]?.briefingDatum
    && c.drafts.length === 1 && c.units?.length === 1 && c.units[0].kind === "DR"
    && (!input || input === c.drafts[0]) && p.startsAtUTC === plan?.startsAtUTC
    && p.endsAtUTC === plan.endsAtUTC && plan.operationId === active.selection.operationId
    && /^localUnitDiagnostic-[a-f0-9]{32}$/.test(plan.operationId)
    && p.sourceViewAtUTC.slice(0, 10) === p.sourceDay
    && instant(p.sourceViewAtUTC) <= Date.now()
    && instant(p.startsAtUTC) <= Date.now() && Date.now() < instant(p.endsAtUTC)
    && p.startsAtUTC.slice(0, 10) === p.executionDayUTC
    && p.endsAtUTC.slice(0, 10) === p.executionDayUTC
    && new Date().toISOString().slice(0, 10) === p.executionDayUTC);
  return p;
}
function acceptsInput(command, input) {
  if (diagnosticCalendar(command, input)) return true;
  const p = commandPolicy(command);
  if (!p) return false;
  need(command.drafts.includes(input));
  return true;
}
function withCommand(command, work) {
  if (diagnosticCalendar(command)) return work();
  const p = commandPolicy(command);
  if (!p) return work();
  return context.run(p, work);
}
function outputDay(now = new Date()) {
  const diagnostic = diagnosticCalendar();
  if (diagnostic) return diagnostic.executionDayUTC;
  const p = context.getStore();
  if (!p) return require("./briefing-frische").berlinTagKey(now);
  current(p);
  return p.executionDayUTC;
}
function generatedDay(now) {
  const diagnostic = diagnosticCalendar();
  if (diagnostic) {
    need(now instanceof Date && Number.isFinite(now.getTime()));
    return now.toISOString().slice(0, 10);
  }
  const p = context.getStore();
  if (!p) return require("./briefing-frische").berlinTagKey(now);
  current(p);
  return new Date(now).toISOString().slice(0, 10);
}
// Semantic review context only; real generation/expiry clocks never call this.
function sourceViewDate(now = new Date()) {
  const diagnostic = diagnosticCalendar();
  if (diagnostic) return new Date(diagnostic.sourceViewAtUTC);
  const p = context.getStore();
  if (!p) return now;
  current(p);
  return new Date(p.sourceViewAtUTC);
}
function commandOutputDay(command) {
  const diagnostic = diagnosticCalendar(command);
  if (diagnostic) return diagnostic.executionDayUTC;
  const p = commandPolicy(command);
  return p ? p.executionDayUTC : null;
}
module.exports = { ENV, VERSION, validatePolicyData, policy, registerLocalMockTransport, acceptsInput,
  withCommand, outputDay, generatedDay, sourceViewDate, commandOutputDay };
