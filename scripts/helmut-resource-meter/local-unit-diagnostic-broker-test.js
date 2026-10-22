"use strict";
// Offline transport simulation. No real socket, process, provider or database.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const assert = require("node:assert/strict"), { EventEmitter } = require("node:events");
const filename = path.join(__dirname, "local-unit-diagnostic-broker.js"), source = fs.readFileSync(filename, "utf8");
const key = crypto.randomBytes(32), nonce = crypto.randomBytes(32).toString("hex"), bytes = Buffer.from('{"closed":"offline"}');
let checks = 0;
function transport({ mode = "valid", finishDelay = 0, connectDelay = 0 } = {}) {
  const socket = new EventEmitter(), state = { connections: 0, writes: 0, destroyed: false, endCalled: false, closed: false };
  socket.destroy = () => { state.destroyed = true; };
  socket.end = () => { state.endCalled = true; throw Error("request-half-close-forbidden"); };
  socket.write = frame => {
    state.writes++;
    assert.ok(frame.at(-1) === 10 && frame.indexOf(10) === frame.length - 1);
    const m = JSON.parse(frame.subarray(0, -1));
    assert.ok(Object.keys(m).join("|") === "version|nonce|atUTC|bodyBase64|hmacSHA256");
    const unsigned = { version: m.version, nonce: m.nonce, atUTC: m.atUTC, bodyBase64: m.bodyBase64 };
    const actual = crypto.createHmac("sha256", key).update(JSON.stringify(unsigned)).digest();
    assert.ok(m.version === "helmut-local-original-owner-request/1" && m.nonce === nonce
      && Buffer.from(m.bodyBase64, "base64").equals(bytes) && Math.abs(Date.now() - Date.parse(m.atUTC)) < 1000);
    assert.ok(crypto.timingSafeEqual(actual, Buffer.from(m.hmacSHA256, "hex")));
    queueMicrotask(() => {
      if (mode === "silent") return;
      if (mode === "error") { socket.emit("error", Error("offline")); return; }
      if (mode === "close-only") { socket.emit("close", false); return; }
      const r = { schema: "helmut-local-original-owner-response/1", nonce: mode === "nonce" ? "0".repeat(64) : nonce,
        status: mode === "failure" ? 500 : 200, bodyBase64: bytes.toString("base64") };
      const hmacSHA256 = crypto.createHmac("sha256", mode === "hmac" ? crypto.randomBytes(32) : key).update(JSON.stringify(r)).digest("hex");
      let response = Buffer.from(JSON.stringify({ ...r, hmacSHA256 }) + (mode === "no-newline" ? "" : "\n"));
      if (mode === "trailing") response = Buffer.concat([response, Buffer.from("x")]);
      if (mode === "two-frames") response = Buffer.concat([response, response]);
      if (mode === "duplicate-key") response = Buffer.from(response.toString().replace('{"schema":', '{"nonce":"discarded","schema":'));
      if (mode === "invalid-base64") {
        const bad = { ...r, bodyBase64: "%%%" };
        response = Buffer.from(JSON.stringify({ ...bad, hmacSHA256: crypto.createHmac("sha256", key).update(JSON.stringify(bad)).digest("hex") }) + "\n");
      }
      socket.emit("data", response.subarray(0, 15)); socket.emit("data", response.subarray(15));
      if (mode !== "no-eof") socket.emit("end");
      setTimeout(() => { state.closed = true; socket.emit("close", mode === "error-close"); }, finishDelay);
    });
    return true;
  };
  const mod = { exports: {} }, sandbox = { Buffer, URL, structuredClone, setTimeout, clearTimeout, module: mod, __filename: filename,
    process: { env: {}, getuid: () => 0, hrtime: process.hrtime },
    require(name) {
      if (name === "node:net") return { createConnection(options) {
        assert.ok(Object.keys(options).length === 1 && options.path === "/ram/helmut-original-write-bridge.sock");
        state.connections++;
        if (connectDelay) setTimeout(() => socket.emit("connect"), connectDelay); else queueMicrotask(() => socket.emit("connect"));
        return socket;
      } };
      if (["node:http", "node:fs"].includes(name)) return new Proxy({}, { get() { throw Error("offline-native-access-forbidden"); } });
      return require(name);
    } };
  vm.runInNewContext(source + "\nmodule.exports={originalUpstream};", sandbox);
  return { state, run: (remaining = 1000) => mod.exports.originalUpstream({ nonce }, bytes, key, remaining) };
}
(async () => {
  const good = transport({ finishDelay: 10 }); let accepted = false;
  const pending = good.run().then(r => { accepted = true; return r; });
  await new Promise(resolve => setTimeout(resolve, 1)); assert.ok(!accepted && !good.state.closed); checks++;
  const result = await pending;
  assert.ok(result.status === 200 && result.bytes.equals(bytes) && good.state.closed && !good.state.endCalled
    && good.state.connections === 1 && good.state.writes === 1); checks++;
  for (const mode of ["silent", "error", "close-only", "nonce", "failure", "hmac", "no-newline", "trailing", "two-frames",
    "duplicate-key", "invalid-base64", "no-eof", "error-close"]) {
    const f = transport({ mode });
    await assert.rejects(f.run(mode === "silent" ? 5 : 1000), /^Error: local-unit-broker-[a-z0-9-]+$/);
    assert.ok(f.state.connections === 1 && f.state.writes === 1 && f.state.destroyed && !f.state.endCalled); checks++;
  }
  for (const remaining of [0, -1, 28001, NaN]) {
    const f = transport(); await assert.rejects(f.run(remaining)); assert.ok(f.state.connections === 0); checks++;
  }
  const late = transport({ connectDelay: 15 }); await assert.rejects(late.run(5));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(late.state.destroyed && late.state.connections === 1 && late.state.writes === 0); checks++;
  console.log("local-unit-diagnostic-broker offline: " + checks + " checks passed; native sockets=0; database=0");
})().catch(() => { console.error("local-unit-diagnostic-broker offline transport failed"); process.exitCode = 1; });
