"use strict";
// Only child/HTTPS stubs; no Vercel identity, auth mutation or Production call.
const assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const cp = require("node:child_process"), https = require("node:https");
const CLI = require("./synthetik-500-direct"), C = require("../lib/helmut/synthetik-500-production-command");
const oldSpawn = cp.spawn, oldHttps = https.request, oldTimeout = global.setTimeout, oldValidate = C.validate;
const keys = ["VERCEL_TOKEN", "HELMUT_ADMIN_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "AZURE_OPENAI_KEY"], env = { ...process.env };
let requests = [], kills = 0, mode = "ok", deadline, networks = 0, loopbackUrl;
https.request = () => { networks++; throw Error("offline forbids HTTPS fallback"); };
global.setTimeout = (fn, ms) => { assert.equal(ms, 180000); deadline = fn; return oldTimeout(fn, 5000); };
cp.spawn = (file, argv, options) => {
  if (mode === "curl-config") {
    // Real native curl parser, exclusively loopback. The Vercel-auth boundary
    // stays stubbed; no management/API/protection state is contacted.
    const child = oldSpawn("curl", ["--url", loopbackUrl, ...argv.slice(3)], { ...options,
      env: { ...options.env, HTTPS_PROXY: "", HTTP_PROXY: "", ALL_PROXY: "", NO_PROXY: "*" } });
    const record = { file, argv, options }; requests.push(record);
    const end = child.stdin.end.bind(child.stdin);
    child.stdin.end = config => { record.config = config; return end(config); };
    return child;
  }
  const child = new EventEmitter(); child.stdin = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kill = () => { kills++; }; const record = { file, argv, options }; requests.push(record);
  child.stdin.end = config => {
    record.config = config;
    setImmediate(() => {
      child.stderr.emit("data", Buffer.from("FICTIONAL SENSITIVE LOGIN ERROR MUST NEVER BE RELAYED"));
      if (mode === "deadline") return deadline();
      if (mode === "spawn-error") return child.emit("error", Error("FICTIONAL secret"));
      const bytes = mode === "oversize" ? Buffer.alloc(16 * 1024 * 1024 + 1)
        : mode === "utf8" ? Buffer.from([0xff]) : Buffer.from(mode === "html" ? "SSO login" : JSON.stringify({ ok: true, result: { state: "installed" } }));
      child.stdout.emit("data", bytes); child.emit("close", mode === "exit-error" ? 22 : 0);
    });
  };
  return child;
};
const V = require("./synthetik-500-direct-vercel"), url = "https://helmut-fixture.vercel.app/api/ops/synthetik500-direkt";
let groups = 0;
const test = async (name, fn) => { await fn(); groups++; console.log("PASS " + name); };
async function main() {
  try {
    process.env.VERCEL_TOKEN = "fictional-vercel-auth"; process.env.HELMUT_ADMIN_SECRET = "fictional-admin";
    delete process.env.VERCEL_ORG_ID;
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.AZURE_OPENAI_KEY = "must-not-pass-to-child";
    await test("explicit remote mode only; preparation installation and duplicate switches reject", () => {
      assert.equal(CLI.args(["status", "--command", "/tmp/c", "--out", "/tmp/o", "--vercel-curl"]).vercelCurl, true);
      for (const argv of [["prepare", "--input", "/tmp/i", "--out", "/tmp/o", "--vercel-curl"],
        ["install", "--command", "/tmp/c", "--admission", "/tmp/a", "--scharf", "--vercel-curl"],
        ["status", "--command", "/tmp/c", "--out", "/tmp/o", "--vercel-curl", "--vercel-curl"]]) assert.throws(() => CLI.args(argv));
    });
    await test("one fixed POST through existing Vercel auth with secret on stdin, finite limits and no linking", async () => {
      const value = await V.request(url, '{"action":"status"}', process.env.HELMUT_ADMIN_SECRET);
      assert.equal(value.result.state, "installed"); const r = requests.at(-1);
      assert.equal(r.file, "vercel"); assert.deepEqual(r.argv.slice(0, 3), ["curl", url, "--"]);
      assert(r.argv.includes("--no-location")); assert(r.argv.includes("--fail-with-body"));
      assert.equal(r.argv[r.argv.indexOf("--retry") + 1], "0"); assert.equal(r.argv[r.argv.indexOf("--max-time") + 1], "170");
      assert.equal(r.options.shell, false); assert.equal(r.options.env.VERCEL_TOKEN, "fictional-vercel-auth");
      for (const key of keys.slice(1)) assert.equal(r.options.env[key], undefined);
      assert(!JSON.stringify(r.argv).includes(process.env.HELMUT_ADMIN_SECRET)); assert(r.config.includes("request = \"POST\""));
      assert(r.config.includes("Authorization: Bearer fictional-admin")); assert(r.config.includes('data-binary = "{\\"action\\":\\"status\\"}"'));
      process.env.VERCEL_ORG_ID = "team_fixture";
      await V.request(url, "{}", "admin"); assert.deepEqual(requests.at(-1).argv.slice(0, 5), ["--scope", "team_fixture", "curl", url, "--"]);
      delete process.env.VERCEL_ORG_ID;
    });
    await test("missing auth foreign URL/header injection or oversized selectors reject before spawn", () => {
      const n = requests.length;
      for (const target of [url + "?secret=x", url.replace("https:", "http:"), url.replace("helmut-fixture.vercel.app", "example.org"), url.replace("/api/ops/", "/api/debug/")])
        assert.throws(() => V.request(target, "{}", "admin"));
      assert.throws(() => V.request(url, "{}", "admin\nrequest = DELETE")); assert.throws(() => V.request(url, "a".repeat(1025), "admin"));
      process.env.VERCEL_ORG_ID = "foreign arbitrary flags"; assert.throws(() => V.request(url, "{}", "admin")); delete process.env.VERCEL_ORG_ID;
      delete process.env.VERCEL_TOKEN; assert.throws(() => V.request(url, "{}", "admin")); process.env.VERCEL_TOKEN = "fictional-vercel-auth";
      assert.equal(requests.length, n);
    });
    await test("login error invalid UTF8 overflow child error and whole-request deadline never retry or fallback", async () => {
      for (const failure of ["html", "exit-error", "utf8", "oversize", "spawn-error", "deadline"]) {
        mode = failure; const n = requests.length;
        await assert.rejects(V.request(url, "{}", "admin"), /rejected-or-unknown-no-retry/); assert.equal(requests.length, n + 1);
      }
      assert(kills >= 3); assert.equal(networks, 0); mode = "ok";
    });
    await test("real CLI remote keeps command selector and immutable URL while choosing the explicit transport", async () => {
      C.validate = () => {}; // data contract independently covered by direct suite's real500 fixture.
      const command = { version: C.DIRECT_VERSION, mode: "D-R-500", slot: { plan: { operationId: "synthetik500-fictional-transport",
        routeContract: { route: { deploymentHost: "helmut-fixture.vercel.app" } } } } };
      const n = requests.length, result = await CLI.remote(command, "status", undefined, { vercelCurl: true });
      assert.equal(result.ok, true); assert.equal(requests.length, n + 1);
      assert.equal(requests.at(-1).argv[1], url); assert(requests.at(-1).config.includes("commandHash")); assert.equal(networks, 0);
    });
    await test("native curl receives literal escaped stdin credentials and selector JSON on loopback only", async () => {
      const body = '{"action":"status","operationId":"fictional"}', admin = 'fictional-quote"-slash\\-end';
      let observed;
      const server = require("node:http").createServer((req, res) => {
        const chunks = []; req.on("data", chunk => chunks.push(chunk)); req.once("end", () => {
          observed = { method: req.method, authorization: req.headers.authorization, type: req.headers["content-type"],
            body: Buffer.concat(chunks).toString("utf8") };
          res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true,"result":{}}');
        });
      });
      await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
      loopbackUrl = "http://127.0.0.1:" + server.address().port; mode = "curl-config";
      try {
        assert.equal((await V.request(url, body, admin)).ok, true);
        assert.deepEqual(observed, { method: "POST", authorization: "Bearer " + admin, type: "application/json", body });
        assert(!JSON.stringify(requests.at(-1).argv).includes(admin));
      } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); mode = "ok"; }
    });
    console.log(JSON.stringify({ groups, externalNetwork: false, modelCalls: 0, protectionChanged: false }));
  } finally {
    cp.spawn = oldSpawn; https.request = oldHttps; global.setTimeout = oldTimeout; C.validate = oldValidate;
    for (const k of Object.keys(process.env)) if (!Object.hasOwn(env, k)) delete process.env[k]; Object.assign(process.env, env);
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
