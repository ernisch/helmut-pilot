"use strict";

// Internal capability for one explicitly admitted isolated Mock500 snapshot.
// Only the mock harness supplies a locally defined verifier that authenticates
// private owner approval and original files. JSON/HTTP/env values are never a
// verifier. This is not a signature, profile activation or sender authority.
const P = require("./synthetik-500-profile");
const { berlinTagKey } = require("./briefing-frische");
const CONTRACT = "helmut-w15-mock-historical-qualified-source-replay/1";
const GRANT_SCHEMA = "helmut-w15-mock-source-replay-grant/1";
const AUTH_SCHEMA = "helmut-w15-isolated-mock-source-authorization/1";
const BRANCH = "refs/heads/codex/w15-github-end500-preparation-20261028";
const PINS = Object.freeze({
  reportSHA256: "d2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d",
  rowsSHA256: "22d4f73337178ec260c6d963f5539044f15e07d952aafc83e258cfdc4d267359",
  fixturesSHA256: "548a5bd3e268be76a85ba8088c6993c0860b4f90659b47da1c76526cf486d9d1",
  policySHA256: "274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04"
});
const grants = new WeakMap(), attached = new WeakMap();
const fail = code => { throw Error("synthetik500-mock-source-replay-" + code); };
const need = (value, code) => { if (!value) fail(code); };
const exact = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const sha = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const iso = value => typeof value === "string" && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const same = (a, b) => P.hash(a) === P.hash(b);

function current(record) {
  const now = new Date(), w = record.window;
  need(Date.parse(w.startsAtUTC) <= now.getTime() && now.getTime() < Date.parse(w.endsAtUTC), "window");
  need(now.toISOString().slice(0, 10) === record.executionISO.slice(0, 10)
    && berlinTagKey(now) === berlinTagKey(new Date(record.executionISO)), "execution-day");
}
function validate(value) {
  need(exact(value, ["schema", "contract", "purpose", "authorization", "sourceAsOfISO", "executionISO",
    "window", "qualificationPins", "operationId", "commandHash", "bindings"]), "shape");
  need(value.schema === GRANT_SCHEMA && value.contract === CONTRACT
    && ["PREPARATION", "EXECUTION"].includes(value.purpose), "contract");
  const a = value.authorization;
  need(exact(a, ["schema", "contract", "branch", "exactCommit", "runId", "runAttempt", "nonce",
    "approvalSHA256", "sourceQualificationSHA256", "productionAllowed", "paidModelsAllowed"]), "authorization");
  need(a.schema === AUTH_SCHEMA && a.contract === CONTRACT && a.branch === BRANCH
    && typeof a.exactCommit === "string" && /^[a-f0-9]{40}$/.test(a.exactCommit)
    && typeof a.runId === "string" && /^[1-9][0-9]{4,19}$/.test(a.runId) && a.runAttempt === 1
    && typeof a.nonce === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(a.nonce)
    && sha(a.approvalSHA256) && sha(a.sourceQualificationSHA256)
    && a.productionAllowed === false && a.paidModelsAllowed === false, "authorization");
  need(iso(value.sourceAsOfISO) && iso(value.executionISO)
    && value.sourceAsOfISO <= value.executionISO, "source-time");
  need(exact(value.qualificationPins, Object.keys(PINS)) && same(value.qualificationPins, PINS), "original-pins");
  const w = value.window;
  need(exact(w, ["startsAtUTC", "endsAtUTC", "completionDeadlineUTC"])
    && Object.values(w).every(iso), "window");
  need(Date.parse(w.endsAtUTC) - Date.parse(w.startsAtUTC) === 10800000 - 1
    && Date.parse(w.completionDeadlineUTC) - Date.parse(w.startsAtUTC) === 12600000 - 1
    && Object.values(w).every(x => x.slice(0, 10) === value.executionISO.slice(0, 10)
      && berlinTagKey(new Date(x)) === berlinTagKey(new Date(value.executionISO))), "window");
  need(Date.parse(w.startsAtUTC) <= Date.parse(value.executionISO)
    && Date.parse(value.executionISO) < Date.parse(w.endsAtUTC), "execution-time");
  const execution = value.purpose === "EXECUTION";
  need(execution ? typeof value.operationId === "string" && /^synthetik500-[A-Za-z0-9_-]{8,100}$/.test(value.operationId)
    && sha(value.commandHash) : value.operationId === null && value.commandHash === null, "selector");
  need(Array.isArray(value.bindings) && value.bindings.length === 500, "all500");
  const owners = new Set();
  value.bindings.forEach((b, index) => {
    need(exact(b, ["index", "owner", "profileHash", "briefingEingabeHash", "briefingDatum", "sourceProjectionSHA256",
      "requestBodySHA256", "reviewRequestBodySHA256"]), "binding");
    need(b.index === index && typeof b.owner === "string" && b.owner.length > 0
      && !owners.has(b.owner) && sha(b.profileHash) && sha(b.briefingEingabeHash)
      && sha(b.sourceProjectionSHA256) && b.briefingDatum === value.executionISO, "binding");
    owners.add(b.owner);
    need(execution ? sha(b.requestBodySHA256) && sha(b.reviewRequestBodySHA256)
      : b.requestBodySHA256 === null && b.reviewRequestBodySHA256 === null, "request-bindings");
  });
  current(value);
  return structuredClone(value);
}

function createIssuer(verify) {
  // The function must be defined by trusted mock code after authenticating its
  // private descriptor/approval/assets. No JSON marker can replace that call.
  need(typeof verify === "function", "trusted-verifier");
  const issuer = Object.freeze({}); let issued = false;
  return Object.freeze({
    issue() {
      need(!issued, "issuer-reused");
      const record = validate(verify()); issued = true;
      const grant = Object.freeze({});
      grants.set(grant, { issuer, record, revoked: false, used: new Map() });
      return grant;
    },
    revoke(grant) {
      const entry = grants.get(grant); need(entry?.issuer === issuer, "issuer"); entry.revoked = true;
    }
  });
}
function active(grant) {
  const entry = grant && grants.get(grant);
  need(entry && !entry.revoked, "grant"); current(entry.record); return entry;
}
function subject(record, d, selection) {
  need(exact(selection, ["index", "runId", "runAttempt", "nonce", "exactCommit", "operationId", "commandHash"]), "selection");
  need(Number.isInteger(selection.index) && selection.index >= 0 && selection.index < 500, "index");
  for (const key of ["runId", "runAttempt", "nonce", "exactCommit"])
    need(selection[key] === record.authorization[key], "run-binding");
  need(selection.operationId === record.operationId && selection.commandHash === record.commandHash, "selector");
  const b = record.bindings[selection.index];
  need(d?.briefingEingabe?.version === 1 && d.profile?.id === b.owner
    && P.hash(d.profile) === b.profileHash && P.hash(d.briefingEingabe) === b.briefingEingabeHash
    && d.briefingDatum === b.briefingDatum, "input-binding");
  return b;
}
function bindFinite(grant, token, d, selection) {
  const entry = active(grant), b = subject(entry.record, d, selection);
  need(token && typeof token === "object" && !attached.has(token), "token-reused");
  if (entry.record.purpose === "EXECUTION") {
    need(!entry.used.has(b.index), "unit-replayed"); entry.used.set(b.index, token);
  }
  attached.set(token, { grant, selection: structuredClone(selection) });
}
function readFinite(token, d, profile, { preparation = false } = {}) {
  const attachment = attached.get(token); if (!attachment) return null;
  const entry = active(attachment.grant), r = entry.record;
  need(preparation || r.purpose === "EXECUTION", "preparation-not-execution");
  const b = subject(r, d, attachment.selection);
  need(P.hash(profile) === b.profileHash, "profile-binding");
  return { contract: CONTRACT, purpose: r.purpose, historical: true, currentSourceAcceptance: false,
    sourceAsOfISO: r.sourceAsOfISO, executionISO: r.executionISO,
    qualificationReportSHA256: r.qualificationPins.reportSHA256,
    authorization: structuredClone(r.authorization), operationId: r.operationId, commandHash: r.commandHash,
    index: b.index, profileHash: b.profileHash, briefingEingabeHash: b.briefingEingabeHash,
    sourceProjectionSHA256: b.sourceProjectionSHA256,
    requestBodySHA256: b.requestBodySHA256, reviewRequestBodySHA256: b.reviewRequestBodySHA256 };
}

module.exports = { CONTRACT, GRANT_SCHEMA, AUTH_SCHEMA, PINS, createIssuer, bindFinite, readFinite };
