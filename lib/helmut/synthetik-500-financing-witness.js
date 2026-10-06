"use strict";
// Read-only numeric financing and genuine JS hashes. Auth never leaves storage.
const C = require("./synthetik-500-production-command");
const K = require("./testkosten-budget");
const R = require("./provider-runtime-attestation");
const MODUS = "synthetik500-finanzbindung";
const OPERATION_AUTH = Object.freeze({
  operationNonce: "24906dc6-c147-4180-8c19-813c3ce3b0fa",
  bearerSha256: "e0f8011a9cf0d47e886e3063c7e3fadd3c1a93b29172742d28e8c0daa7cbe436",
  expiresAtUTC: "2026-10-06T12:00:00.000Z"
});
const host = x => typeof x === "string" && x.length <= 253
  && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+vercel\.app$/.test(x) ? x : null;
const sha = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const micros = usd => {
  const value = Math.round(usd * 1e6);
  C.requireThat(typeof usd === "number" && Number.isSafeInteger(value) && value >= 0 && value / 1e6 === usd, "numeric-cost-unbound");
  return value;
};
async function handleRequest(request, response, url, { jsonHeaders, env = process.env, now = () => new Date() }) {
  const reply = (status, result, extra = {}) => {
    if (response.destroyed || response.writableEnded) return;
    try { response.writeHead(status, jsonHeaders(extra)); response.end(JSON.stringify(result)); } catch (_) { /* No retry. */ }
  };
  const stop = (status, reason, extra) => reply(status, { ok: false, reason }, extra);
  if (request.method !== "GET") return stop(405, "only-get", { Allow: "GET" });
  const h = request.headers;
  if (url.pathname !== "/api/cron/testnachweis-status" || url.search !== "?modus=" + MODUS
    || h["transfer-encoding"] !== undefined || h["content-length"] !== undefined && h["content-length"] !== "0")
    return stop(400, "closed-bodyless-request-required");
  const begin = now(), beginMs = begin.getTime(), commit = env.VERCEL_GIT_COMMIT_SHA, deploymentHost = host(env.VERCEL_URL);
  const admitted = C.utc(h["x-helmut-root-admitted-at"]) ? Date.parse(h["x-helmut-root-admitted-at"]) : NaN;
  const deadline = C.utc(h["x-helmut-root-deadline-at"]) ? Date.parse(h["x-helmut-root-deadline-at"]) : NaN;
  const day = Number.isFinite(beginMs) ? begin.toISOString().slice(0, 10) : null;
  const bound = () => {
    const observed = now(), ms = observed.getTime();
    return env.VERCEL_ENV === "production" && K.aktiv(env) && typeof commit === "string" && /^[a-f0-9]{40}$/.test(commit)
      && deploymentHost !== null && env.VERCEL_GIT_COMMIT_SHA === commit && host(env.VERCEL_URL) === deploymentHost
      && h["x-helmut-production-commit"] === commit && h["x-helmut-deployment-host"] === deploymentHost
      && Number.isFinite(ms) && ms >= beginMs && ms - beginMs <= 60000 && observed.toISOString().slice(0, 10) === day
      && deadline - admitted === 1200000 && ms >= admitted && ms < deadline
      && R.verifyOperationBearer(h.authorization, h["x-helmut-root-nonce"], ms, OPERATION_AUTH)
      && !request.aborted && !response.destroyed && !response.writableEnded;
  };
  if (!bound()) return stop(403, "operation-runtime-window-unbound");
  try {
    const storage = require("./storage"); storage.synthetik500ProductionBackend();
    const before = await storage.readAuthStore({ strict: true }); C.requireThat(bound(), "read-window-drift");
    const beforeBooks = C.booksHash(before), beforeControl = C.controlHash(before);
    const counter = await storage.leseLlmTageszaehler(begin.toISOString()); C.requireThat(bound(), "read-window-drift");
    const auth = await storage.readAuthStore({ strict: true }); C.requireThat(bound(), "read-window-drift");
    const booksHash = C.booksHash(auth), controlHash = C.controlHash(auth);
    C.requireThat(booksHash === beforeBooks && controlHash === beforeControl && sha(booksHash) && sha(controlHash)
      && counter.tag === day, "read-state-drift");
    const daily = K.pruefeStart(auth, day, counter), order = K.auftragsStand(auth, day);
    C.requireThat(auth.testKostenAuftrag.version === 4 && order.limitMicroUsd === 20000000
      && daily.startklar === true && daily.tagesbuchVorhanden === true && daily.limitUsd === 6
      && daily.offeneReservierungen === 0 && Number.isSafeInteger(order.gebundenMicroUsd) && order.gebundenMicroUsd >= 0,
      "financial-start-unbound");
    const completed = now(); C.requireThat(bound(), "read-window-drift");
    const result = { ok: true, version: "helmut-synthetik500-financing-witness/1", reinLesend: true, production: true,
      commit, deploymentHost, rootNonce: h["x-helmut-root-nonce"], rootAdmittedAtUTC: h["x-helmut-root-admitted-at"],
      rootDeadlineAtUTC: h["x-helmut-root-deadline-at"], observedAtUTC: begin.toISOString(), completedAtUTC: completed.toISOString(),
      day, booksHash, controlHash, orderBoundMicroUsd: order.gebundenMicroUsd, orderLimitMicroUsd: order.limitMicroUsd,
      dayBoundMicroUsd: micros(daily.gebundenUsd), dayLimitMicroUsd: micros(daily.limitUsd), todayOpenReservations: 0,
      startklar: true, providerInvoiceProven: false, actual500Ready: false };
    C.requireThat(Buffer.byteLength(JSON.stringify(result), "utf8") <= 4096, "bounded-result-required");
    return reply(200, result);
  } catch (_) { return stop(409, "financing-binding-unavailable"); }
}
module.exports = { MODUS, handleRequest };
