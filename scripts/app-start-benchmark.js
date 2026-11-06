"use strict";

// Reproducible mobile startup comparison with the real shell/client/styles and
// synthetic API responses. Run through scripts/lokal.js. No production data,
// login, provider calls or persistent profile writes. Timings are LAB results.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");
assert.equal(process.env.HELMUT_LOKALER_SCHUTZ, "aktiv", "Run with node scripts/lokal.js -- node scripts/app-start-benchmark.js");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const { payload } = require("./fixtures/ui-preview");
const shell = require("../server").__indexHtml();
const runs = Number(process.env.HELMUT_BENCHMARK_RUNS || 5);
assert(Number.isInteger(runs) && runs >= 1 && runs <= 10);
const authMs = Number(process.env.HELMUT_BENCHMARK_AUTH_MS || 120);
const dataMs = Number(process.env.HELMUT_BENCHMARK_DATA_MS || 300);
assert([authMs, dataMs].every(ms => Number.isFinite(ms) && ms >= 0 && ms <= 10000));
const results = [], requests = [], files = new Map();
const session = { mode: "accounts", authenticated: true,
  user: { id: "startup-test", name: "UI Testprofil", role: "abgeordneter", politicianId: payload.profile.id },
  profiles: [{ id: payload.profile.id, name: payload.profile.fullName }] };
const types = { ".js": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  requests.push({ method: req.method, path: pathname });
  if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
  const send = (body, type, cache = "no-store") => {
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cache, "Content-Encoding": "gzip" });
    res.end(zlib.gzipSync(body));
  };
  if (pathname === "/") return send(shell, "text/html; charset=utf-8");
  if (pathname.startsWith("/api/")) {
    const data = pathname === "/api/auth/session" ? session
      : pathname === "/api/app/start" ? payload : {};
    // Controlled service latency; actual production DB latency is NOT simulated.
    const delay = pathname === "/api/auth/session" ? authMs : pathname === "/api/app/start" ? dataMs : 0;
    setTimeout(() => send(JSON.stringify(data), "application/json"), delay);
    return;
  }
  if (!/^\/(client\.js|styles\.css|site\.webmanifest|assets\/[\w/.-]+)$/.test(pathname)
      || pathname.split("/").includes("..")) { res.writeHead(404); res.end(); return; }
  const file = pathname === "/client.js" && process.env.HELMUT_BENCHMARK_CLIENT
    ? process.env.HELMUT_BENCHMARK_CLIENT : path.join(root, pathname);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  if (!files.has(file)) files.set(file, fs.readFileSync(file));
  send(files.get(file), types[path.extname(file)] || "application/octet-stream", "public, max-age=31536000, immutable");
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    ...(process.env.HELMUT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.HELMUT_CHROMIUM_EXECUTABLE } : {}),
    headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"]
  });
  try {
    for (let run = 1; run <= runs; run++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
      await context.addInitScript(() => {
        window.__startup = {};
        function frame() {
          const app = document.getElementById("app"), splash = document.getElementById("appSplash");
          if (app && app.querySelector("[data-view], [data-start-view]") && !window.__startup.renderedMs) window.__startup.renderedMs = performance.now();
          if (splash && window.__startup.renderedMs && !window.__startup.visibleMs) {
            const style = getComputedStyle(splash);
            if (style.visibility === "hidden" || style.display === "none") window.__startup.visibleMs = performance.now();
          }
          if (app && app.querySelector("[data-view]") && !app.querySelector("[data-startup-shell]") && !window.__startup.dataReadyMs)
            window.__startup.dataReadyMs = performance.now();
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
      const page = await context.newPage(), errors = [], failedResources = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("response", response => {
        if (!response.ok()) failedResources.push({ path: new URL(response.url()).pathname, status: response.status() });
      });
      // DNS is denied for everything except this fixture server. No route()
      // interception: browser HTTP caching remains enabled for the warm run.
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 100, downloadThroughput: 200000, uploadThroughput: 93750 });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      for (const kind of ["cold", "warm"]) {
        await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForFunction(() => window.__startup.visibleMs > 0, null, { timeout: 15000 });
        await page.waitForFunction(() => window.__startup.dataReadyMs > 0, null, { timeout: 25000 });
        await page.evaluate(() => document.fonts.ready);
        const measured = await page.evaluate(() => ({
          ...window.__startup,
          firstContentfulPaintMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime,
          fontsReadyMs: performance.now(),
          resources: performance.getEntriesByType("resource").map(r => ({ path: new URL(r.name).pathname, startMs: r.startTime, durationMs: r.duration, transferredBytes: r.transferSize, encodedBytes: r.encodedBodySize }))
        }));
        assert.equal(errors.length, 0, errors.join("\n"));
        assert.equal(failedResources.length, 0, JSON.stringify(failedResources));
        assert(await page.locator('[data-view="radar"]').count() > 0, "Real navigation must render");
        // Only require the body font used in every view. Other weights load on
        // demand; a public loading frame need not request all private-view fonts.
        await page.waitForFunction(() => document.fonts.check('400 16px "Hanken Grotesk"'));
        if (run === runs && kind === "warm" && process.env.HELMUT_BENCHMARK_SCREENSHOT) {
          await page.screenshot({ path: process.env.HELMUT_BENCHMARK_SCREENSHOT });
        }
        results.push({ run, kind, ...measured, errors });
        console.log(JSON.stringify({ run, kind, visibleMs: Math.round(measured.visibleMs), renderedMs: Math.round(measured.renderedMs), dataReadyMs: Math.round(measured.dataReadyMs), fontsReadyMs: Math.round(measured.fontsReadyMs), transferredBytes: measured.resources.reduce((sum, r) => sum + r.transferredBytes, 0) }));
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
  assert(requests.every(req => req.method === "GET"), "No write requests allowed");
  const output = { measuredAt: new Date().toISOString(), browser: browser.version(), conditions: { viewport: "390x844", cpuSlowdown: 4, latencyMs: 100, downloadBytesPerSecond: 200000, authServiceMs: authMs, startServiceMs: dataMs, serviceWorker: "blocked", synthetic: true, gzip: true }, results };
  if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(output, null, 2) + "\n");
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
