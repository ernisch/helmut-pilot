"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const S = require("../lib/helmut/artikelkontext-abrufschutz");
const filename = require.resolve("../lib/helmut/crawler");
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const target = "https://example.org/politik/konferenz";
function netz(options = {}) {
  const calls = [], reservations = [], reports = [], timers = [];
  let started;
  const start = new Promise(resolve => { started = resolve; });
  const fakeHttps = { get(url, requestOptions, callback) {
    const req = new EventEmitter();
    req.destroyed = false;
    req.destroy = error => { req.destroyed = true; if (error) req.emit("error", error); req.emit("close"); };
    const response = new EventEmitter();
    response.statusCode = options.status || 200;
    response.headers = { "content-type": "text/html;charset=UTF-8", ...options.headers };
    response.complete = options.complete !== false;
    response.destroy = () => { response.destroyed = true; req.destroy(); };
    response.resume = () => {};
    response.setEncoding = () => {};
    calls.push({ url, requestOptions, req, response });
    queueMicrotask(() => {
      callback(response); started();
      if (response.destroyed || options.haengt) return;
      for (const chunk of options.chunks || [Buffer.from("<html>vollstaendig</html>")]) {
        if (response.destroyed) return;
        response.emit("data", chunk);
      }
      if (!response.destroyed) { response.emit(options.event || "end", options.event === "error" ? new Error("ECONNRESET") : undefined); req.emit("close"); }
    });
    return req;
  } };
  const m = new Module(filename, module); m.filename = filename; m.paths = Module._nodeModulePaths(require("node:path").dirname(filename));
  const originalRequire = m.require.bind(m);
  m.require = name => name === "https" ? fakeHttps : originalRequire(name);
  m.testSetTimeout = (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; };
  m.testClearTimeout = t => { t.cleared = true; };
  m._compile("const setTimeout = module.testSetTimeout; const clearTimeout = module.testClearTimeout;\n" + fs.readFileSync(filename, "utf8"), filename);
  const deps = { artikelkontext: true, allowedHost: "example.org", env: { HELMUT_ANBIETER_STEUERUNG: "on" },
    reserviere: async r => { reservations.push(r); return { verfuegbar: true, erlaubt: !options.gesperrt }; },
    melde: async r => { reports.push(r); return { verfuegbar: true }; } };
  return { calls, reservations, reports, timers, start, deps, fetch: m.exports.fetchUrl };
}
test("HTTPS Artikelziel verbietet Zugangsdaten, IP Literale und interne Namen", () => {
  assert.equal(S.artikelHost(target), "example.org");
  for (const url of ["http://example.org/a", "https://127.0.0.1/a", "https://[::1]/a", "https://2130706433/a",
    "https://name:secret@example.org/a", "https://example.org:8443/a", "https://localhost/a", "https://host.internal/a",
    "https://example.org/a#teil", "https://example.org/", "https://example.org/a\nb"]) assert.throws(() => S.artikelHost(url));
});
const lookup = (addresses, options = {}) => new Promise((resolve, reject) => {
  const resolver = S.artikelLookup("example.org", (host, opts, cb) => {
    assert.equal(host, "example.org"); assert.deepEqual(opts, { family: 4, all: true }); cb(null, addresses);
  });
  resolver(options.host || "example.org", { all: !!options.all }, (error, result, family) => error ? reject(error) : resolve({ result, family }));
});
test("DNS Antwort wird vor dem Socket geprueft, einschliesslich gemischter Antworten", async () => {
  const publicIp = { address: "93.184.215.14", family: 4 };
  assert.deepEqual(await lookup([publicIp]), { result: publicIp.address, family: 4 });
  assert.deepEqual(await lookup([publicIp], { all: true }), { result: [publicIp], family: undefined });
  for (const address of ["0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.9", "192.0.2.2", "192.88.99.2", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::1", "falsch"]) {
    await assert.rejects(lookup([publicIp, { address, family: 4 }]), /dns-ziel-gesperrt/);
  }
  for (const addresses of [[], null, [publicIp, { address: "2001:4860::1", family: 6 }], Array(65).fill(publicIp)]) await assert.rejects(lookup(addresses));
  await assert.rejects(lookup([publicIp], { host: "fremd.org" }), /dns-hostwechsel/);
  const fail = S.artikelLookup("example.org", (_, __, cb) => cb(new Error("ENOTFOUND")));
  await assert.rejects(new Promise((resolve, reject) => fail("example.org", {}, e => e ? reject(e) : resolve())), /dns-nicht-erreichbar/);
});
test("Genau eine Anbieterreservierung und ein vorhandener HTTPS Netzpfad", async () => {
  const n = netz(), result = await n.fetch(target, 0, n.deps);
  assert.deepEqual(result, { body: "<html>vollstaendig</html>", finalUrl: target });
  assert.equal(n.calls.length, 1); assert.equal(n.reservations.length, 1); assert.equal(n.reports.length, 1);
  const o = n.calls[0].requestOptions;
  assert.equal(typeof o.lookup, "function"); assert.equal(o.agent, false); assert.equal(o.family, 4);
  assert.equal(o.autoSelectFamily, false); assert.equal(o.headers["accept-encoding"], "identity");
  assert.notEqual(o.rejectUnauthorized, false); assert(o.signal instanceof AbortSignal);
  assert.equal(n.timers[0].ms, 20000); assert(n.timers[0].cleared);
});
test("Ohne Anbieterfreigabe kein Netz und keine Umgehung durch Redirect Tiefe", async () => {
  for (const off of [true, false]) {
    const n = netz({ gesperrt: !off }); if (off) n.deps.env = {};
    await assert.rejects(n.fetch(target, 0, n.deps)); assert.equal(n.calls.length, 0);
  }
  const n = netz(); await assert.rejects(n.fetch(target, 1, n.deps)); assert.equal(n.reservations.length, 0);
});
test("Redirects, fremder Inhaltstyp und Komprimierung werden vor dem Antworttext gestoppt", async () => {
  for (const options of [{ status: 302, headers: { location: "https://127.0.0.1/a" } }, { status: 206 },
    { headers: { "content-type": "application/json" } }, { headers: { "content-type": "text/html;charset=ISO-8859-1" } },
    { headers: { "content-encoding": "gzip" } }, { headers: { "content-length": String(S.MAX_ANTWORT_BYTES + 1) } },
    { headers: { "content-length": "falsch" } }]) {
    const n = netz(options); await assert.rejects(n.fetch(target, 0, n.deps)); assert.equal(n.calls.length, 1); assert(n.calls[0].response.destroyed);
  }
});
test("HTTP 429 und 503 bleiben Anbieterfehler statt einer gesunden Quellenluecke", async () => {
  for (const status of [429, 503]) {
    const n = netz({ status }); await assert.rejects(n.fetch(target, 0, n.deps));
    assert.equal(n.reports[0].ok, false);
  }
});
test("Die Byte Grenze greift waehrend des Streams ohne Kuerzung", async () => {
  const n = netz({ chunks: [Buffer.alloc(S.MAX_ANTWORT_BYTES, 65)] });
  assert.equal((await n.fetch(target, 0, n.deps)).body.length, S.MAX_ANTWORT_BYTES);
  for (const chunks of [[Buffer.alloc(S.MAX_ANTWORT_BYTES, 65), Buffer.from("x")], [Buffer.from("ä".repeat(S.MAX_ANTWORT_BYTES / 2 + 1))]]) {
    const x = netz({ chunks }); await assert.rejects(x.fetch(target, 0, x.deps), /antwort-zu-gross/); assert(x.calls[0].response.destroyed);
  }
});
test("Unvollstaendige und ungueltig kodierte Antworten sind keine Belege", async () => {
  const bom = netz({ chunks: [Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("<html>vollstaendig</html>")] });
  assert.equal((await bom.fetch(target, 0, bom.deps)).body, "\ufeff<html>vollstaendig</html>");
  for (const options of [{ complete: false }, { event: "aborted" }, { event: "error" }, { chunks: [Buffer.from([0xc3, 0x28])] }]) {
    const n = netz(options); await assert.rejects(n.fetch(target, 0, n.deps));
  }
});
test("Gesamtfrist zerstoert auch eine haengende Anfrage trotz Aktivitaet", async () => {
  const n = netz({ haengt: true }), result = n.fetch(target, 0, n.deps);
  await n.start; n.calls[0].response.emit("data", Buffer.from("Anfang"));
  n.timers[0].fn(); await assert.rejects(result); assert(n.calls[0].req.destroyed); assert(n.timers[0].cleared);
});
test("Externes Abbruchsignal zerstoert die laufende Anfrage", async () => {
  const n = netz({ haengt: true }), controller = new AbortController();
  n.deps.abbruchSignal = controller.signal;
  const result = n.fetch(target, 0, n.deps); await n.start; controller.abort();
  await assert.rejects(result); assert(n.calls[0].req.destroyed);
});
test("Verlorene Klassen Lease beendet den Artikelabruf und bleibt benannt", async () => {
  const n = netz({ haengt: true }); let tick, stopped = false;
  Object.assign(n.deps, { klassen: { erneuere: async () => ({ erneuert: false }) }, klassenSlot: { id: "isoliert" },
    setInterval: fn => { tick = fn; return { unref() {} }; }, clearInterval: () => { stopped = true; } });
  const result = n.fetch(target, 0, n.deps); await n.start; await tick();
  await assert.rejects(result, e => e.anbieterVertagung?.grund === "klassen-lease-verloren");
  assert(n.calls[0].req.destroyed); assert(stopped);
});
test("Gewoehnlicher Crawleraufruf behaelt seinen bisherigen Antwortvertrag", async () => {
  const n = netz({ chunks: ["alter Inhalt"], headers: { "content-type": "application/xml" } });
  const result = await n.fetch(target, 0, { env: {} });
  assert.deepEqual(result, { body: "alter Inhalt", finalUrl: target });
  assert.equal(n.reservations.length, 0); assert.equal(n.calls[0].requestOptions.lookup, undefined); assert.equal(n.timers.length, 0);
});
(async () => { for (const [name, fn] of tests) { await fn(); console.log("PASS " + name); }
  console.log(`PASS ${tests.length} Gruppen zum begrenzten Artikelabruf`);
})().catch(e => { console.error(e); process.exitCode = 1; });
