"use strict";
// Closed selector for ONE already installed U unit. No install, activation,
// client-supplied command, 500 execution, retry or paid resume.
const C = require("./synthetik-500-production-command");
const { verifyOperationBearer } = require("./provider-runtime-attestation");
const MODUS = "synthetik500-u-vorlauf";
const OPERATION_AUTH = Object.freeze({
  operationNonce: "ac5e25b2-fb9d-4f90-a8fe-b412eb11b677",
  bearerSha256: "781e1a8af335b02792739bf0fbde1135f44801ae423e41f16800a61acf5ccf46",
  expiresAtUTC: "2026-10-06T20:00:00.000Z"
});
const WINDOW_MS = 1200000, MAX_BODY = 1024;
const commit = x => typeof x === "string" && /^[a-f0-9]{40}$/.test(x);
const host = x => typeof x === "string" && /^[a-z0-9][a-z0-9.-]{0,252}\.vercel\.app$/.test(x) ? x : null;
function body(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    let bytes = 0, chunks = [], timer, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.removeListener("data", data); request.removeListener("end", end);
      request.removeListener("error", errorEvent); request.removeListener("aborted", aborted);
      chunks = [];
      if (error) { request.pause(); request.once("error", () => {}); reject(Error("bounded-body-unavailable")); }
      else resolve(value);
    };
    const data = chunk => {
      if (!Buffer.isBuffer(chunk)) return finish(true);
      bytes += chunk.length;
      if (bytes > MAX_BODY) return finish(true);
      chunks.push(chunk);
    };
    const end = () => {
      const buffer = Buffer.concat(chunks), text = buffer.toString("utf8");
      if (!Buffer.from(text, "utf8").equals(buffer)) return finish(true);
      try { finish(false, JSON.parse(text)); } catch (_) { finish(true); }
    };
    const errorEvent = () => finish(true), aborted = () => finish(true);
    timer = setTimeout(() => finish(true), timeoutMs);
    request.on("data", data); request.once("end", end);
    request.once("error", errorEvent); request.once("aborted", aborted);
  });
}
async function handleRequest(request, response, url, { jsonHeaders, env = process.env, now = () => new Date() }) {
  let dispatched = false;
  const reply = (status, result, extra = {}) => {
    if (response.destroyed || response.writableEnded) return;
    try { response.writeHead(status, jsonHeaders(extra)); response.end(JSON.stringify(result)); }
    catch (_) { /* Never retry a dispatch after a disconnected response. */ }
  };
  const stop = (status, reason, extra) => reply(status, { ok: false, reason, dispatchAttempted: dispatched }, extra);
  if (request.method !== "POST") return stop(405, "only-post", { Allow: "POST" });
  if (url.pathname !== "/api/cron/testnachweis-status" || url.search !== "?modus=" + MODUS
    || request.headers["content-type"] !== "application/json") return stop(400, "closed-request-required");
  const h = request.headers, admitted = C.utc(h["x-helmut-root-admitted-at"]) ? Date.parse(h["x-helmut-root-admitted-at"]) : NaN;
  const deadline = C.utc(h["x-helmut-root-deadline-at"]) ? Date.parse(h["x-helmut-root-deadline-at"]) : NaN;
  const runtimeCommit = env.VERCEL_GIT_COMMIT_SHA, runtimeHost = host(env.VERCEL_URL);
  const bound = () => {
    const ms = now().getTime();
    return env.VERCEL_ENV === "production" && commit(runtimeCommit) && runtimeHost !== null
      && env.VERCEL_GIT_COMMIT_SHA === runtimeCommit && host(env.VERCEL_URL) === runtimeHost
      && h["x-helmut-production-commit"] === runtimeCommit && h["x-helmut-deployment-host"] === runtimeHost
      && deadline - admitted === WINDOW_MS && Number.isFinite(ms) && ms >= admitted && ms < deadline
      && verifyOperationBearer(h.authorization, h["x-helmut-root-nonce"], ms, OPERATION_AUTH)
      && !request.aborted && !response.destroyed && !response.writableEnded;
  };
  if (!bound()) return stop(403, "operation-runtime-window-unbound");
  const length = h["content-length"];
  if (length !== undefined && (typeof length !== "string" || !/^[0-9]{1,4}$/.test(length)
    || Number(length) < 1 || Number(length) > MAX_BODY)) return stop(400, "bounded-body-required");
  try {
    const args = await body(request, Math.max(1, Math.min(10000, deadline - now().getTime())));
    C.requireThat(bound(), "entry-window-expired");
    C.requireThat(C.exact(args, ["operationId", "commandHash"])
      && typeof args.operationId === "string" && /^synthetik500-[a-z0-9-]{8,80}$/.test(args.operationId)
      && typeof args.commandHash === "string" && /^[a-f0-9]{64}$/.test(args.commandHash), "closed-selector-only");
    const packet = await require("./storage").loadSynthetik500ProductionCommand(args.operationId, args.commandHash);
    C.requireThat(bound(), "entry-window-expired");
    const { commandHash, plan } = C.validate(packet.command), command = packet.command;
    C.requireThat(commandHash === args.commandHash && plan.operationId === args.operationId
      && command.mode === "U-prestage" && command.units.length === 1 && command.units[0].kind === "U"
      && command.understanding.length === 1 && plan.intents.length === 1 && plan.intents[0].phase === "U"
      && command.drafts.length === 0 && command.package === null && command.executor === null && command.native === null
      && plan.productionCommit === runtimeCommit && C.utc(plan.startsAtUTC) && C.utc(plan.endsAtUTC)
      && Date.parse(plan.startsAtUTC) >= admitted && Date.parse(plan.endsAtUTC) <= deadline, "one-u-preparation-only");
    C.admission(command, packet.admission, now().toISOString(), true);
    const sendMs = now().getTime();
    C.requireThat(sendMs >= Date.parse(plan.startsAtUTC) && sendMs < Date.parse(plan.endsAtUTC), "entry-plan-window-unbound");
    C.requireThat(bound(), "entry-window-expired");
    dispatched = true;
    const result = await require("./synthetik-500-production-adapter").productionStart(args);
    C.requireThat(result?.state === "closed" && result.operationId === args.operationId && result.units === 1
      && result.expectedPositions === 0 && result.profilesActivated === false, "one-u-result-unconfirmed");
    return reply(200, { ok: true, mode: MODUS, units: 1, state: "closed", profilesActivated: false,
      independentFinalAcceptance: false, serverGlobalOneUseProven: false });
  } catch (_) { return stop(409, "u-preparation-rejected-or-unknown"); }
}
module.exports = { MODUS, handleRequest };
