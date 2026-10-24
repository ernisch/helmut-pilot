"use strict";

// A closed local byte transport. It never imports HTTP(S), opens a socket,
// delegates to another transport or exposes a restore-to-live function.
// Original-file authenticity belongs to the fixed native proof consumer below;
// this private WeakMap additionally binds its exact selected bytes to the scope.
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const P = require("./synthetik-500-profile");
const Source = require("./local-unit-diagnostic-source");
const handles = new WeakMap();
const VERSION = "helmut-local-unit-diagnostic-transport-originals/1";
const MAX_REQUEST = 16 * 1024 * 1024, MAX_RESPONSE = 8 * 1024 * 1024;
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const exact = (x, keys) => x && typeof x === "object" && !Array.isArray(x)
  && Object.keys(x).sort().join("|") === [...keys].sort().join("|");
function need(ok, code) { if (!ok) throw Error("local-unit-diagnostic-transport-" + code); }
function utf8(bytes, cap) {
  need(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= cap
    && Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes), "original-utf8-bytes");
  return Buffer.from(bytes);
}
function pin(p) {
  need(exact(p, ["path", "bytes", "sha256"]) && typeof p.path === "string"
    && require("node:path").isAbsolute(p.path) && require("node:path").normalize(p.path) === p.path
    && Number.isSafeInteger(p.bytes) && p.bytes > 0 && /^[a-f0-9]{64}$/.test(p.sha256), "original-pin");
}
function verifyHandle(handle, command) {
  const data = handles.get(handle);
  need(data && data.commandHash === P.hash(command) && data.operationId === command.slot.plan.operationId
    && P.hash(data.requestPins) === P.hash(command.requestPins)
    && data.sourceHash === P.hash(command.source), "opaque-original-handle-required");
  return true;
}
async function prepareOriginals(selection, command) {
  need(exact(selection, ["operationId", "commandHash"]) && command?.version === "helmut-local-unit-diagnostic-command/1"
    && command.mode === "D-R-1-local-fixture" && selection.operationId === command.slot?.plan?.operationId
    && selection.commandHash === P.hash(command), "selector");
  const storage = require("./storage");
  need(typeof storage.readLocalUnitDiagnosticTransportOriginals === "function"
    && typeof storage.consumeLocalUnitDiagnosticTransportOriginals === "function", "native-original-consumer-missing");
  const proof = await storage.readLocalUnitDiagnosticTransportOriginals(selection);
  const actual = storage.consumeLocalUnitDiagnosticTransportOriginals(proof, selection, command);
  need(exact(actual, ["schema", "selection", "sourceHandle", "originalPins", "phases"])
    && actual.schema === VERSION && P.hash(actual.selection) === P.hash(selection)
    && exact(actual.originalPins, ["preparedRequests", "actualRequestBindings", "providerFixtures"])
    && exact(actual.phases, ["D", "R"]), "native-original-proof");
  Object.values(actual.originalPins).forEach(pin);
  Source.verifyCommandSource(command, actual.sourceHandle);
  const selected = Source.readSelection(actual.sourceHandle), phases = {};
  let model = null;
  for (const [index, phase] of ["D", "R"].entries()) {
    const original = actual.phases[phase];
    need(exact(original, ["sourceIntentId", "requestBytes", "responseBytes", "latencyBytes", "responseStatus", "latencyMs"])
      && original.sourceIntentId === selected.intents[index].id
      && Number.isSafeInteger(original.responseStatus) && original.responseStatus >= 100 && original.responseStatus <= 599
      && typeof original.latencyMs === "number" && Number.isFinite(original.latencyMs)
      && original.latencyMs >= 0 && original.latencyMs <= 20000, "original-phase");
    const request = utf8(original.requestBytes, MAX_REQUEST), response = utf8(original.responseBytes, MAX_RESPONSE);
    const latency = utf8(original.latencyBytes, 65536), expected = command.requestPins[phase];
    need(request.length === expected.bytes && sha(request) === expected.sha256, "original-request-pin");
    let parsed; try { parsed = JSON.parse(request.toString("utf8")); } catch { need(false, "original-request-json"); }
    need(typeof parsed.model === "string" && /^(gpt-5-mini)(?:-eu)?$/.test(parsed.model)
      && parsed.max_output_tokens === command.slot.plan.intents[index].maxOutputTokens
      && (model === null || model === parsed.model), "original-model");
    model = parsed.model;
    phases[phase] = { request, response, latency, responseStatus: original.responseStatus,
      latencyMs: original.latencyMs, requested: false, responseSHA256: sha(response), latencySHA256: sha(latency) };
  }
  const apiUrl = "local-unit-fixture://" + selection.operationId.slice(-32) + "/responses";
  const route = Object.freeze({ apiUrl, snapshot: Object.freeze({ provider: "local-fixture", responsesUrl: apiUrl,
    model, productionCommit: command.slot.plan.productionCommit, deploymentHost: null, deploymentId: null, authMode: "none" }),
    authHeader: Object.freeze({}) });
  const handle = Object.freeze({});
  handles.set(handle, { operationId: selection.operationId, commandHash: selection.commandHash,
    sourceHash: P.hash(command.source), requestPins: structuredClone(command.requestPins), phases, model, route,
    originalPins: structuredClone(actual.originalPins) });
  verifyHandle(handle, command); return handle;
}
function current() {
  const Scope = require("./local-unit-diagnostic-scope"), scope = Scope.currentVerified();
  if (scope === null) return null;
  need(scope && typeof Scope.transportHandle === "function" && typeof Scope.assertClock === "function", "scope-transport-missing");
  const handle = Scope.transportHandle(); verifyHandle(handle, scope.command);
  return { data: handles.get(handle), scope, Scope };
}
function active() { return current() !== null; }
function model() { const value = current(); need(value, "scope-required"); return value.data.model; }
function route(requestedModel) {
  const value = current(); need(value && requestedModel === value.data.model, "route-model");
  value.Scope.assertClock(); return value.data.route;
}
function assertTicket(ticket) {
  const value = current(); need(value, "scope-required"); value.Scope.assertTicket(ticket);
  need(ticket?.execution?.version === "helmut-local-unit-diagnostic-execution/1"
    && ticket.execution.operationId === value.data.operationId && ticket.execution.commandHash === value.data.commandHash
    && ["D", "R"].includes(ticket.admission?.phase), "ticket-binding");
  return value;
}
function isDraftTicket(ticket) { assertTicket(ticket); return ticket.admission.phase === "D"; }
function assertSend(ticket, body, selectedRoute) {
  const value = assertTicket(ticket), phase = value.data.phases[ticket.admission.phase];
  value.Scope.assertClock();
  need(selectedRoute === value.data.route && typeof body === "string"
    && Buffer.from(body, "utf8").equals(phase.request)
    && P.hash(JSON.parse(body)) === ticket.admission.actualRequestHash, "actual-request-bytes");
}
function request(ticket, apiUrl, options, callback) {
  const value = assertTicket(ticket), phaseName = ticket.admission.phase, phase = value.data.phases[phaseName];
  value.Scope.assertClock();
  need(apiUrl === value.data.route.apiUrl && exact(options, ["method", "headers", "timeout"])
    && options.method === "POST" && exact(options.headers, ["Content-Type", "Content-Length"])
    && options.headers["Content-Type"] === "application/json" && options.headers["Content-Length"] === phase.request.length
    && Number.isSafeInteger(options.timeout) && options.timeout > 0 && options.timeout <= 20000
    && typeof callback === "function" && !phase.requested
    && (phaseName === "D" || value.data.phases.D.requested), "closed-request-only");
  phase.requested = true; // One transport attempt even if write/end fails later.
  const req = new EventEmitter(), chunks = []; let ended = false, destroyed = false, response = null, timer = null;
  req.write = chunk => {
    need(!ended && !destroyed && (typeof chunk === "string" || Buffer.isBuffer(chunk)), "request-write");
    chunks.push(Buffer.from(chunk)); need(chunks.reduce((n, b) => n + b.length, 0) <= MAX_REQUEST, "request-cap"); return true;
  };
  req.end = () => {
    need(!ended && !destroyed, "request-end"); ended = true;
    need(Buffer.concat(chunks).equals(phase.request), "actual-request-bytes");
    timer = setTimeout(() => {
      if (destroyed) return;
      // Native AI timeout, parser, usage and private completion code consume
      // this same response stream and the unchanged original byte sequence.
      response = new PassThrough(); response.statusCode = phase.responseStatus; callback(response);
      response.end(Buffer.from(phase.response));
    }, phase.latencyMs);
    return req;
  };
  req.destroy = error => {
    if (destroyed) return req; destroyed = true; if (timer !== null) clearTimeout(timer);
    if (response) response.destroy(); if (error) queueMicrotask(() => req.emit("error", error)); return req;
  };
  return req;
}

module.exports = Object.freeze({ VERSION, prepareOriginals, verifyHandle, active, model, route,
  assertTicket, isDraftTicket, assertSend, request });
