"use strict";

// Dormante Vertragsnaht. Kein Planinstallierer, Schreiber, Flag oder Anbieter.
// R-Quittungsbindung/Executor/Embedding bleiben offen: keine Vollabnahme.
const P = require("./synthetik-500-profile");
const KEY = "synthetik500KostenAdmission";
const VERSION = "helmut-synthetik500-kosten-admission/1";
const PLAN_VERSION = "helmut-synthetik500-kosten-admission-plan/1";
const MAX_INTENTS = 5000; // Formatgrenze, keine Aufruffreigabe.
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const hash40 = x => typeof x === "string" && /^[a-f0-9]{40}$/.test(x);
const id = x => typeof x === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(x);
const run = x => typeof x === "string" && /^nachlauf500-[0-9]{5,20}$/.test(x);
const op = x => typeof x === "string" && /^synthetik500-[a-z0-9-]{8,80}$/.test(x);
const exakt = (x, keys) => x !== null && typeof x === "object" && !Array.isArray(x)
  && [Object.prototype, null].includes(Object.getPrototypeOf(x))
  && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
function fehler(reason) {
  const e = new Error("synthetik500-admission-" + reason);
  e.reason = e.message; e.code = "LLM_BUDGET_EXHAUSTED"; e.kiNichtGesendet = true;
  return e;
}
const fordere = (ok, reason) => { if (!ok) throw fehler(reason); };
function zeit(x) {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(x)
    && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
}
const synthetischeIds = new Set(P.erzeuge().profile.map(x => x.mandatsId));
function intentHash(runId, intent) {
  const { id: ignored, ...descriptor } = intent;
  return P.hash({ runId, ...descriptor });
}
function pruefeSlot(slot) {
  fordere(exakt(slot, ["version", "plan", "planHash", "consumed"])
    && slot.version === VERSION && sha(slot.planHash), "slot-format");
  const p = slot.plan;
  fordere(exakt(p, ["version", "operationId", "runId", "productionCommit", "runtimeManifestHash",
    "startsAtUTC", "endsAtUTC", "intents"])
    && p.version === PLAN_VERSION && op(p.operationId) && run(p.runId)
    && hash40(p.productionCommit) && sha(p.runtimeManifestHash)
    && zeit(p.startsAtUTC) && zeit(p.endsAtUTC)
    && Date.parse(p.endsAtUTC) > Date.parse(p.startsAtUTC)
    && Date.parse(p.endsAtUTC) - Date.parse(p.startsAtUTC) <= 4 * 3600000
    && p.startsAtUTC.slice(0, 10) === p.endsAtUTC.slice(0, 10)
    && Array.isArray(p.intents) && p.intents.length > 0 && p.intents.length <= MAX_INTENTS
    && P.hash(p) === slot.planHash, "plan-bindung");
  const byId = new Map(), subjects = new Set();
  for (const x of p.intents) {
    const common = x?.model === "gpt-5-mini" && x.attemptLimit === 1 && sha(x.id)
      && x.id === intentHash(p.runId, x) && !byId.has(x.id);
    let subject;
    if (x?.phase === "D") {
      fordere(common && exakt(x, ["id", "phase", "owner", "inputVersionHash", "actualRequestHash", "model", "maxOutputTokens", "attemptLimit"])
        && typeof x.owner === "string" && synthetischeIds.has(x.owner)
        && sha(x.inputVersionHash) && sha(x.actualRequestHash) && x.maxOutputTokens === 3000, "d-intent");
      subject = "D|" + x.owner;
    } else if (x?.phase === "U") {
      fordere(common && exakt(x, ["id", "phase", "vorgangId", "contractInputHash", "actualRequestHash", "model", "maxOutputTokens", "attemptLimit"])
        && id(x.vorgangId) && hash40(x.contractInputHash) && sha(x.actualRequestHash)
        && x.maxOutputTokens === 3000, "u-intent");
      subject = "U|" + x.vorgangId;
    } else {
      fordere(common && exakt(x, ["id", "phase", "owner", "inputVersionHash", "actualRequestHash", "dependsOn", "contextVersionHash", "model", "maxOutputTokens", "attemptLimit"])
        && x.phase === "R" && typeof x.owner === "string" && synthetischeIds.has(x.owner)
        && x.inputVersionHash === null && x.actualRequestHash === null && sha(x.dependsOn)
        && sha(x.contextVersionHash) && [3000, 6000].includes(x.maxOutputTokens), "r-pending-intent");
      subject = "R|" + x.owner;
    }
    fordere(!subjects.has(subject), "duplicate-subject");
    subjects.add(subject); byId.set(x.id, x);
  }
  for (const x of byId.values()) if (x.phase === "R") {
    const d = byId.get(x.dependsOn);
    fordere(d?.phase === "D" && d.owner === x.owner && d.inputVersionHash === x.contextVersionHash, "r-parent");
  }
  fordere(slot.consumed !== null && typeof slot.consumed === "object" && !Array.isArray(slot.consumed)
    && [Object.prototype, null].includes(Object.getPrototypeOf(slot.consumed))
    && Object.keys(slot.consumed).length <= p.intents.length, "consumption-format");
  for (const [key, c] of Object.entries(slot.consumed)) {
    const x = byId.get(key);
    fordere(x && x.phase !== "R" && exakt(c, ["ticketId", "day", "consumedAtUTC", "actualRequestHash", "reserved"])
      && id(c.ticketId) && zeit(c.consumedAtUTC) && c.day === c.consumedAtUTC.slice(0, 10)
      && Date.parse(c.consumedAtUTC) >= Date.parse(p.startsAtUTC) && Date.parse(c.consumedAtUTC) < Date.parse(p.endsAtUTC)
      && c.actualRequestHash === x.actualRequestHash && c.reserved === 200000 + 4 * x.maxOutputTokens, "consumption-binding");
  }
  return { p, byId };
}
function pruefeInaktiv(auth, admission = null) {
  fordere(auth && typeof auth === "object" && !Array.isArray(auth), "auth-unreadable");
  fordere(!Object.hasOwn(auth, KEY) && admission === null, "cost-guard-inactive-or-plan-present");
}
function pruefeLedger(auth, slot) {
  const seen = new Set();
  for (const [day, book] of Object.entries(auth.testKostenTage || {})) {
    for (const [ticketId, c] of Object.entries(book?.calls || {})) {
      if (c?.admission?.planHash !== slot.planHash) continue;
      const a = c.admission, consumed = slot.consumed[a.intentId];
      fordere(exakt(a, ["version", "planHash", "operationId", "runId", "intentId", "actualRequestHash",
        "startsAtUTC", "endsAtUTC", "productionCommit"])
        && a.version === VERSION && a.operationId === slot.plan.operationId && a.runId === slot.plan.runId
        && a.startsAtUTC === slot.plan.startsAtUTC && a.endsAtUTC === slot.plan.endsAtUTC
        && a.productionCommit === slot.plan.productionCommit && consumed
        && consumed.ticketId === ticketId && consumed.day === day && consumed.reserved === c.reserved
        && consumed.actualRequestHash === a.actualRequestHash && !seen.has(a.intentId), "consumption-ledger-drift");
      seen.add(a.intentId);
    }
  }
  fordere(seen.size === Object.keys(slot.consumed).length, "consumption-ledger-drift");
}
function pruefe(auth, request, now, productionCommit) {
  if (!Object.hasOwn(auth, KEY)) {
    fordere(request.admission === null, "plan-missing");
    return null;
  }
  const slot = auth[KEY], { p } = pruefeSlot(slot);
  pruefeLedger(auth, slot);
  fordere(zeit(now) && Date.parse(now) >= Date.parse(p.startsAtUTC) && Date.parse(now) < Date.parse(p.endsAtUTC), "window-closed");
  fordere(typeof productionCommit === "string" && productionCommit === p.productionCommit, "deployment-drift");
  fordere(exakt(request.admission, ["operationId", "planHash"])
    && request.admission.operationId === p.operationId && request.admission.planHash === slot.planHash
    && typeof request.runId === "string" && request.runId === p.runId, "foreign-run-or-plan");
  const phase = request.phase === "entwurf" ? "D" : request.phase === "pruefung" ? "R"
    : request.phase === null && id(request.vorgangId) && hash40(request.contractInputHash) ? "U" : null;
  // Noch kein sicherer R-Quittungsadapter vorhanden. Ein Caller kann das
  // nicht durch einen frei behaupteten Receipt-/Reviewhash freischalten.
  fordere(phase !== "R", "review-receipt-unimplemented");
  const matches = p.intents.filter(x => x.phase === phase && (phase === "D" ? x.owner === request.politicianId : x.vorgangId === request.vorgangId));
  fordere(matches.length === 1, "intent-missing");
  const x = matches[0];
  fordere(request.model === x.model && request.maxOutputTokens === x.maxOutputTokens
    && sha(request.actualRequestHash) && request.actualRequestHash === x.actualRequestHash
    && (phase === "D" ? sha(request.inputVersionHash) && request.inputVersionHash === x.inputVersionHash
      : hash40(request.contractInputHash) && request.contractInputHash === x.contractInputHash), "input-drift");
  fordere(!Object.hasOwn(slot.consumed, x.id), "intent-consumed");
  return { version: VERSION, planHash: slot.planHash, operationId: p.operationId, runId: p.runId,
    intentId: x.id, actualRequestHash: x.actualRequestHash, startsAtUTC: p.startsAtUTC,
    endsAtUTC: p.endsAtUTC, productionCommit: p.productionCommit };
}
function verbrauche(auth, admission, ticket, now) {
  if (!admission) return;
  const slot = auth[KEY];
  fordere(slot.planHash === admission.planHash && !Object.hasOwn(slot.consumed, admission.intentId), "intent-consumed");
  fordere(zeit(now) && ticket.day === now.slice(0, 10)
    && Date.parse(now) >= Date.parse(admission.startsAtUTC) && Date.parse(now) < Date.parse(admission.endsAtUTC), "window-closed");
  slot.consumed[admission.intentId] = { ticketId: ticket.id, day: ticket.day,
    consumedAtUTC: now, actualRequestHash: admission.actualRequestHash, reserved: ticket.reserved };
}
function requestHash(body) {
  return P.hash(JSON.parse(body)); // Kanonischer exakter Providerpayload, kein Tokenraten.
}
function pruefeSendung(ticket, actualRequestHash, now, productionCommit) {
  if (!ticket?.admission) return;
  const a = ticket.admission;
  fordere(sha(actualRequestHash) && a.actualRequestHash === actualRequestHash, "sender-input-drift");
  fordere(zeit(now) && Date.parse(now) >= Date.parse(a.startsAtUTC) && Date.parse(now) < Date.parse(a.endsAtUTC), "window-closed");
  fordere(typeof productionCommit === "string" && productionCommit === a.productionCommit, "deployment-drift");
}
module.exports = { KEY, VERSION, PLAN_VERSION, MAX_INTENTS, intentHash, pruefeSlot, pruefeInaktiv,
  pruefe, verbrauche, requestHash, pruefeSendung, fehler,
  status: () => ({ activationAvailable: false, wholeEnforcement: false, reviewAdmission: false }) };
