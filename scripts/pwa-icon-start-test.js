"use strict";

// Service-Worker-Startgrenzen: echte Handler, synthetische Transporte, keine Konten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../sw.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({ fetch: transport, cacheError = false, cached = null } = {}) {
  const handlers = {}, timers = new Map(), calls = [], writes = [];
  let counter = 0;
  const cache = {
    match: async () => cached, keys: async () => [],
    put: async (req, res) => writes.push({ url: req.url, text: await res.text() })
  };
  vm.runInNewContext(source, {
    self: { location: { origin: "https://pwa.test" }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    URL, Response, AbortController,
    caches: { open: async () => { if (cacheError) throw Error("synthetic-cache-unavailable"); return cache; } },
    fetch: (req, opts) => { calls.push({ req, opts }); return transport(req, opts); },
    setTimeout: (fn, ms) => { assert.equal(ms, 8000); timers.set(++counter, fn); return counter; },
    clearTimeout: id => timers.delete(id)
  });
  function request(path = "/", mode = "navigate", destination = "", method = "GET") {
    let response;
    const work = [];
    handlers.fetch({ request: { url: new URL(path, "https://pwa.test").href, mode, destination, method },
      respondWith: promise => { response = promise; }, waitUntil: promise => work.push(promise) });
    return { response, work };
  }
  return { request, timers, calls, writes, timeout: () => { for (const fn of [...timers.values()]) fn(); } };
}
async function unit() {
  let count = 0;
  const test = async (label, run) => { await run(); count++; console.log("PASS " + label); };
  await test("Erfolgreiche Navigation unveraendert, Timer geloescht, kein HTML-Cache", async () => {
    const f = fixture({ fetch: async () => new Response("ready") });
    assert.equal(await (await f.request().response).text(), "ready");
    assert.equal(f.timers.size, 0); assert.deepEqual(f.writes, []);
  });
  await test("Haengende Navigation endet auch ohne funktionierendes Abort mit Wiederholungsansicht", async () => {
    const f = fixture({ fetch: () => new Promise(() => {}) }), r = f.request();
    f.timeout(); const res = await r.response;
    assert.equal(res.status, 200); assert.match(await res.text(), /Nochmal versuchen/);
    assert.equal(f.calls[0].opts.signal.aborted, true); assert.equal(f.timers.size, 0);
    assert.deepEqual(f.writes, []);
  });
  await test("Header allein beenden die Startfrist nicht; haengender HTML-Body fuehrt zur Wiederholungsansicht", async () => {
    let body;
    const f = fixture({ fetch: async (_req, opts) => new Response(new ReadableStream({
      start(controller) {
        body = controller;
        controller.enqueue(new TextEncoder().encode("<!doctype html><head>"));
        opts.signal.addEventListener("abort", () => controller.error(Error("body-aborted")), { once: true });
      }
    })) });
    const r = f.request();
    await tick();
    assert(body); assert.equal(f.timers.size, 1);
    f.timeout();
    assert.match(await (await r.response).text(), /Nochmal versuchen/);
    assert.equal(f.calls[0].opts.signal.aborted, true);
    assert.equal(f.timers.size, 0); assert.deepEqual(f.writes, []);
  });
  await test("Vollstaendige Antwort behaelt Status, Header und lesbaren Body", async () => {
    const f = fixture({ fetch: async () => new Response("complete-body", {
      status: 201, headers: { "Content-Type": "text/plain", "X-Start-Test": "preserved" }
    }) });
    const res = await f.request().response;
    assert.equal(res.status, 201); assert.equal(res.headers.get("X-Start-Test"), "preserved");
    assert.equal(await res.text(), "complete-body"); assert.equal(f.timers.size, 0);
  });
  await test("Netzfehler liefert Offlineansicht; spaeter Fehler nach Timeout bleibt beobachtet", async () => {
    const f = fixture({ fetch: async () => { throw Error("offline"); } });
    assert.match(await (await f.request().response).text(), /keine Verbindung/);
    let reject;
    const late = fixture({ fetch: () => new Promise((_, no) => { reject = no; }) });
    const r = late.request(); late.timeout(); await r.response;
    reject(Error("late rejection")); await tick();
    assert.equal(late.timers.size, 0);
  });
  await test("Bekannte Startdatei sofort aus Cache; Hintergrundabruf begrenzt und beobachtet", async () => {
    const f = fixture({ cached: new Response("cached-script"), fetch: () => new Promise(() => {}) });
    const r = f.request("/client.js?v=one", "cors", "script");
    assert.equal(await (await r.response).text(), "cached-script");
    f.timeout(); await Promise.all(r.work); assert.equal(f.timers.size, 0);
  });
  await test("Unbekannte haengende Startdatei endet mit 504 statt endlosem Renderblock", async () => {
    const f = fixture({ fetch: () => new Promise(() => {}) });
    const r = f.request("/styles.css?v=two", "cors", "style");
    await tick(); f.timeout(); assert.equal((await r.response).status, 504); await Promise.all(r.work);
  });
  await test("Unvollstaendige Startdatei wird nicht gecacht; bekannter Cache bleibt sofort nutzbar", async () => {
    for (const cached of [null, new Response("known-complete-script")]) {
      const f = fixture({ cached, fetch: async (_req, opts) => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("incomplete-script"));
          opts.signal.addEventListener("abort", () => controller.error(Error("body-aborted")), { once: true });
        }
      })) });
      const r = f.request("/client.js?v=partial", "cors", "script");
      if (cached) assert.equal(await (await r.response).text(), "known-complete-script");
      await tick(); assert.equal(f.timers.size, 1); f.timeout();
      if (!cached) assert.equal((await r.response).status, 504);
      await Promise.all(r.work); assert.deepEqual(f.writes, []); assert.equal(f.timers.size, 0);
    }
  });
  await test("Cacheausfall verhindert Netzdatei nicht; frische Assets werden gespeichert", async () => {
    for (const cacheError of [true, false]) {
      const f = fixture({ cacheError, fetch: async () => new Response("fresh-script") });
      const r = f.request("/client.js?v=three", "cors", "script");
      assert.equal(await (await r.response).text(), "fresh-script"); await Promise.all(r.work);
      assert.equal(f.writes.length, cacheError ? 0 : 1);
    }
  });
  await test("Private API/POST/Fremdhost unberuehrt, Verwaltung weiterhin ausschliesslich Netz", async () => {
    const f = fixture({ fetch: async () => new Response("server-protected") });
    for (const args of [["/api/app/start", "cors"], ["/api/auth/session", "cors"], ["/", "cors", "", "POST"], ["https://outside.test/", "navigate"]])
      assert.equal(f.request(...args).response, undefined);
    assert.equal(f.calls.length, 0);
    for (const path of ["/verwaltung", "/verwaltung/", "/verwaltung/runtime.js"]) {
      assert.equal(await (await f.request(path).response).text(), "server-protected");
      assert.deepEqual(f.calls.at(-1).opts.cache, "no-store");
    }
    assert.equal(f.timers.size, 0); assert.deepEqual(f.writes, []);
  });
  console.log(`${count}/${count} Service-Worker-Startgruppen bestanden.`);
}

// Aus dem verpflichtenden Browser-Smoke aufrufen: echter Worker, nicht blockiert.
// Das reproduziert die Netzhaengerklasse, keinen Android-/Brave-WebAPK-Start.
async function verifyInBrowser(browser) {
  const http = require("node:http");
  let hang = "";
  const held = new Set();
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/sw.js") { res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }); return res.end(source); }
    if (pathname.startsWith("/assets/")) { res.writeHead(200, { "Content-Type": "image/png" }); return res.end("synthetic-precache"); }
    if (hang && pathname === "/") {
      // Body-Fall: Header und erster HTML-Teil sind bereits angekommen,
      // aber noch keine bedienbare Seite und kein Seiten-Watchdog.
      if (hang === "body") {
        res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
        res.write('<!doctype html><html><head><title>Unvollstaendiger Start</title>');
      }
      held.add(res); res.on("close", () => held.delete(res)); return;
    }
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    res.end('<!doctype html><meta charset="utf-8"><title>SW Fixture</title><main>Startantwort bereit</main>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const context = await browser.newContext({ serviceWorkers: "allow", isMobile: true, hasTouch: true,
    viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    for (const phase of ["headers", "body"]) {
      hang = phase;
      const started = Date.now();
      const res = await page.reload({ waitUntil: "domcontentloaded", timeout: 13000 });
      assert(res.fromServiceWorker()); assert(Date.now() - started >= 7500 && Date.now() - started < 13000);
      assert.match(await page.locator("body").innerText(), /Nochmal versuchen/);
      hang = "";
      await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.getByRole("button", { name: "Nochmal versuchen" }).click()]);
      assert.equal(await page.locator("main").innerText(), "Startantwort bereit");
      console.log(`PASS Echter Service Worker: haengende Navigation (${phase}) endet nach 8s; erneuter Start funktioniert.`);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    for (const res of held) res.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
module.exports = { verifyInBrowser };
if (require.main === module) unit().catch(error => { console.error(error); process.exitCode = 1; });
