"use strict";

// Server-side closed selector. Installation stays with Root's private pin
// checker. This endpoint never accepts a command, an activation or callbacks.
const crypto = require("node:crypto");
const C = require("./synthetik-500-production-command");
const PATH = "/api/ops/synthetik500-direkt";
const ACTIONS = Object.freeze(["start", "next", "stop", "status", "export"]);
const MAX_BODY = 1024;
function authorized(header, secret) {
  if (typeof secret !== "string" || !secret || typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7)), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], settled = false;
    const finish = (error, data) => {
      if (settled) return; settled = true; clearTimeout(timer);
      req.removeListener("data", onData); req.removeListener("end", onEnd);
      req.removeListener("error", onError); req.removeListener("aborted", onError);
      if (error) { req.pause(); req.once("error", () => {}); reject(Error("bounded-body")); } else resolve(data);
    };
    const onData = chunk => { if (!Buffer.isBuffer(chunk) || (size += chunk.length) > MAX_BODY) return finish(true); chunks.push(chunk); };
    const onEnd = () => {
      const b = Buffer.concat(chunks), s = b.toString("utf8");
      try { if (!Buffer.from(s, "utf8").equals(b)) return finish(true); finish(false, JSON.parse(s)); } catch { finish(true); }
    };
    const onError = () => finish(true), timer = setTimeout(onError, 10000);
    req.on("data", onData); req.once("end", onEnd); req.once("error", onError); req.once("aborted", onError);
  });
}
async function handleRequest(req, res, url, { jsonHeaders, env = process.env }) {
  let dispatched = false;
  const reply = (status, body, headers = {}) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, jsonHeaders({ "Cache-Control": "no-store", ...headers })); res.end(JSON.stringify(body));
  };
  if (!authorized(req.headers.authorization, env.HELMUT_ADMIN_SECRET)) return reply(404, { ok: false });
  if (req.method !== "POST") return reply(405, { ok: false }, { Allow: "POST" });
  if (url.pathname !== PATH || url.search !== "" || req.headers["content-type"] !== "application/json"
    || env.VERCEL_ENV !== "production") return reply(400, { ok: false });
  try {
    const body = await readBody(req), index = body?.action === "export" ? body.index : undefined;
    C.requireThat(C.exact(body, body?.action === "export" ? ["action", "operationId", "commandHash", "index"]
      : ["action", "operationId", "commandHash"]) && ACTIONS.includes(body.action), "direct-entry-shape");
    const args = { operationId: body.operationId, commandHash: body.commandHash };
    C.requireThat(/^synthetik500-[a-z0-9-]{8,80}$/.test(args.operationId || "")
      && /^[a-f0-9]{64}$/.test(args.commandHash || "")
      && (body.action !== "export" || index === null || Number.isSafeInteger(index) && index >= 0 && index < 500), "direct-entry-selector");
    const packet = await require("./storage").loadSynthetik500ProductionCommand(args.operationId, args.commandHash);
    const command = packet.command, plan = C.validate(command).plan;
    C.requireThat(C.isDirect(command) && plan.productionCommit === env.VERCEL_GIT_COMMIT_SHA
      && plan.routeContract.route.deploymentHost === env.VERCEL_URL
      && plan.routeContract.route.deploymentId === env.VERCEL_DEPLOYMENT_ID
      && !req.aborted && !res.destroyed, "direct-entry-runtime-drift");
    const A = require("./synthetik-500-production-adapter");
    const method = { start: "productionStart", next: "productionNext", stop: "requestStop", status: "status", export: "exportEvidence" }[body.action];
    dispatched = ["start", "next", "stop"].includes(body.action);
    let result = await A[method](args, index);
    if (body.action === "export") result = require("./synthetik-500-direct-codec").encode({
      version: "helmut-synthetik500-direct-result-export/1", ...args, result });
    return reply(200, { ok: true, action: body.action, result: result ?? null, independentFinalAcceptance: false });
  } catch { return reply(409, { ok: false, reason: "direct-rejected-or-unknown", dispatchAttempted: dispatched, retryAllowed: false }); }
}
module.exports = { PATH, ACTIONS, MAX_BODY, authorized, readBody, handleRequest };
