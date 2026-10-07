"use strict";

// Default: local preparation only. Mutations require --scharf AND the stored
// separate GO. No activation, loops, automatic retry or automatic next unit.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const C = require("../lib/helmut/synthetik-500-production-command");
const E = require("../lib/helmut/synthetik-500-executor");
const P = require("../lib/helmut/synthetik-500-profile");
const Codec = require("../lib/helmut/synthetik-500-direct-codec");
const { schreibePrivat } = require("./realkohorte-500-start-sql");
const { lesePrivat } = require("./synthetik-500-executor");
const ACTIONS = ["prepare", "install", "start", "next", "stop", "status", "export"];
function args(argv) {
  const [action, ...rest] = argv, a = { action, sharp: false };
  C.requireThat(ACTIONS.includes(action), "direct-cli-action");
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--scharf") { C.requireThat(!a.sharp, "direct-cli-duplicate"); a.sharp = true; continue; }
    const key = { "--input": "input", "--out": "out", "--command": "command", "--admission": "admission", "--index": "index" }[rest[i]];
    C.requireThat(key && !Object.hasOwn(a, key) && typeof rest[i + 1] === "string", "direct-cli-argument");
    const value = rest[++i];
    if (key === "index") {
      C.requireThat(value === "manifest" || /^(0|[1-9][0-9]{0,2})$/.test(value) && Number(value) < 500, "direct-cli-index");
      a.index = value === "manifest" ? null : Number(value);
    } else { C.requireThat(path.isAbsolute(value), "direct-cli-private-path"); a[key] = value; }
  }
  const keys = action === "prepare" ? ["input", "out"] : action === "install" ? ["command", "admission"]
    : action === "export" ? ["command", "out", "index"] : ["command", "out"];
  C.requireThat(C.exact(a, ["action", "sharp", ...keys]), "direct-cli-scope");
  C.requireThat(!["install", "start", "next", "stop"].includes(action) || a.sharp, "direct-cli-sharp-required");
  C.requireThat(!["prepare", "status", "export"].includes(action) || !a.sharp, "direct-cli-no-sharp-read");
  return a;
}
function pin(file) {
  const s = fs.lstatSync(file);
  C.requireThat(s.isFile() && (s.mode & 0o777) === 0o600 && s.size > 0 && s.size <= 16 * 1024 * 1024, "direct-cli-private-file");
  return { path: file, bytes: s.size, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") };
}
function prepare(input) {
  C.requireThat(C.exact(input, ["package", "executorInputs", "drafts", "predecessors"])
    && input.executorInputs.version === E.DIRECT_INPUT_VERSION, "direct-cli-input");
  const executor = E.vorbereite(input.package, input.executorInputs);
  const command = { version: C.DIRECT_VERSION, mode: "D-R-500", package: input.package, executor,
    slot: input.executorInputs.kostenSlot, understanding: [], drafts: input.drafts, predecessors: input.predecessors, native: null,
    units: input.drafts.map(d => ({ kind: "DR", subject: d.profile.id,
      intentIds: [d.intentId, input.executorInputs.kostenSlot.plan.intents.find(x => x.phase === "R" && x.owner === d.profile.id)?.id] })) };
  C.validate(command); return command;
}
async function remote(command, action, index) {
  C.validate(command); C.requireThat(C.isDirect(command), "direct-cli-command");
  const r = command.slot.plan.routeContract.route, token = process.env.HELMUT_ADMIN_SECRET;
  C.requireThat(typeof token === "string" && token.length > 0, "direct-cli-admin-bearer-required");
  const body = JSON.stringify({ action, operationId: command.slot.plan.operationId, commandHash: P.hash(command),
    ...(action === "export" ? { index } : {}) });
  const result = await new Promise((resolve, reject) => {
    let finished = false, response, bytes = 0, chunks = [];
    const finish = (error, value) => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (error) { response?.destroy(); req.destroy(); reject(Error("synthetik500-production-direct-remote-rejected-or-unknown")); }
      else resolve(value);
    };
    const req = require("node:https").request("https://" + r.deploymentHost + require("../lib/helmut/synthetik-500-direct-entry").PATH,
      { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, res => {
        response = res;
        res.on("data", chunk => { if ((bytes += chunk.length) > 16 * 1024 * 1024) return finish(true); chunks.push(chunk); });
        res.once("error", () => finish(true)); res.once("aborted", () => finish(true));
        res.once("end", () => {
          try { const b = Buffer.concat(chunks), text = b.toString("utf8"), value = JSON.parse(text);
            if (res.statusCode !== 200 || value.ok !== true || !Buffer.from(text, "utf8").equals(b)) return finish(true);
            finish(false, value); } catch { finish(true); }
        });
      });
    const timer = setTimeout(() => finish(true), 180000);
    req.once("error", () => finish(true)); req.end(body);
  });
  if (action === "export") result.result = Codec.decode(result.result);
  return result;
}
async function main(argv) {
  const a = args(argv);
  let result;
  if (a.action === "prepare") result = Codec.encode(prepare(lesePrivat(a.input)));
  else if (a.action === "install") {
    // Root validates every gate and all its original private bytes before the
    // existing server-selected installation. This step sends no model request.
    const commandPin = pin(a.command), admissionPin = pin(a.admission);
    C.requireThat(C.isDirect(Codec.decode(JSON.parse(C.readPin(commandPin)))), "direct-cli-command");
    result = await require("../lib/helmut/synthetik-500-production-adapter").install(commandPin, admissionPin);
  } else result = await remote(Codec.decode(lesePrivat(a.command)), a.action, a.index);
  if (a.out) schreibePrivat(a.out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ action: a.action, privateOutput: Boolean(a.out),
    prepared: a.action === "prepare", independentFinalAcceptance: false, profilesActivated: false }));
  return result;
}
if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error("synthetik500-production-direct-cli-rejected-or-unknown-no-retry"); process.exitCode = 1;
});
module.exports = { args, pin, prepare, remote, main };
