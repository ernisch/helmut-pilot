"use strict";

// Statische Bildprojektion des Originaltemplates mit den echten neuen View-Werten.
// Kein Ersatzrenderer im Produkt, keine Behauptung einer React-/Interaktionsabnahme.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const http = require("node:http");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const { originalAdministrationPackage } = require("./original-verwaltung-paket");
const root = path.join(__dirname, "..");
const evidence = process.env.HELMUT_ORIGINAL_EVIDENCE;
assert.ok(evidence && process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

// Nur im Browser-Test: projiziert Template-Text/Attribute ohne Ereignisbehandlung.
function project(markup, values) {
  const expr = (value, scope) => new Function("scope", `with(scope){return (${value})}`)(scope);
  const interpolate = (value, scope) => {
    const matches = [...value.matchAll(/\{\{([\s\S]*?)\}\}/g)];
    if (matches.length === 1 && value.trim() === matches[0][0]) return expr(matches[0][1], scope);
    return value.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(expr(e, scope) ?? ""));
  };
  const tpl = document.createElement("template");
  tpl.innerHTML = markup.replace(/<(\/?)(table|thead|tbody|tfoot|tr|td|th|select|option)(?=[\s>])/gi, "<$1x-native-$2");
  function render(node, scope) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(String(interpolate(node.textContent, scope) ?? ""));
    const fragment = document.createDocumentFragment();
    if (node.nodeType !== Node.ELEMENT_NODE || ["script", "helmet"].includes(node.localName)) return fragment;
    if (node.localName === "sc-if") {
      if (interpolate(node.getAttribute("value") || "false", scope)) for (const child of node.childNodes) fragment.append(render(child, scope));
      return fragment;
    }
    if (node.localName === "sc-for") {
      for (const item of interpolate(node.getAttribute("list") || "[]", scope) || []) for (const child of node.childNodes) fragment.append(render(child, { ...scope, [node.getAttribute("as") || "item"]: item }));
      return fragment;
    }
    const output = document.createElement(node.localName.replace(/^x-native-/, ""));
    for (const a of node.attributes) {
      if (/^on/i.test(a.name) || a.name.startsWith("hint-") || a.name === "ref") continue;
      const value = interpolate(a.value, scope);
      if (value == null) continue;
      if (["disabled", "checked", "selected", "hidden"].includes(a.name)) { if (value) output.setAttribute(a.name, ""); }
      else output.setAttribute(a.name, String(value));
    }
    for (const child of node.childNodes) output.append(render(child, scope));
    return output;
  }
  for (const child of tpl.content.childNodes) document.querySelector("#snapshot").append(render(child, values));
  window.__snapshotReady = true;
}

async function main() {
  const { attachOriginalBackend } = await import(pathToFileURL(path.join(root, "verwaltung/original-controller.mjs")));
  const { originalHelpers } = await import(pathToFileURL(path.join(root, "verwaltung/original-adapter.mjs")));
  const raw = fs.readFileSync(path.join(root, "verwaltung/claude-original/Helmut Verwaltung v3.dc.html"), "utf8");
  const logic = raw.match(/<script\b[^>]*type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/i)[1];
  const pkg = originalAdministrationPackage();
  const template = pkg.html.match(/<x-dc\b[^>]*>([\s\S]*?)<\/x-dc>/i)[1];
  const head = template.match(/<helmet>([\s\S]*?)<\/helmet>/i)[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const markup = template.replace(/<helmet>[\s\S]*?<\/helmet>/i, "");
  const sample = {
    overview: { generatedAt: "2026-11-04T08:00:00Z", mandates: [{ id: "synthetic-alpha", fullName: "Fiktives Mandat Alpha", profileActive: false, validierung: { bereit: false } }], system: { ai: { enabled: false } } },
    budget: { limit: 50, calls: 0, kostenwahrheit: { gesamt: { kostenUsd: 0, kostenUnbekannt: 0 } } },
    customers: { kunden: [{ userId: "synthetic-account", name: "Fiktives Konto Alpha", email: "alpha@synthetic.invalid", role: "abgeordneter", active: true, status: "aktiv", politicianId: "synthetic-alpha", customer: { pricePerMonth: 49, paymentStatus: "open" } }] },
    sources: { stoerungen: { verfuegbar: false, gestoerte: [] } }, runs: { processRuns: [] }
  };
  async function values(kind, width, theme) {
    const host = { innerWidth: width, HV3: originalHelpers, scrollTo() {}, addEventListener() {}, removeEventListener() {} };
    class DCLogic { constructor(props) { this.props = props; } setState(patch) { Object.assign(this.state, typeof patch === "function" ? patch(this.state) : patch); } }
    const Original = vm.runInNewContext(`${logic}; Component`, { DCLogic, window: host, location: { hash: "#/uebersicht" }, setTimeout, clearTimeout });
    const Component = attachOriginalBackend(Original, { host, readerFactory: () => ({ read: async key => sample[key], clear() {}, dispose() {} }) });
    const c = new Component({}); await c.refresh();
    c.setState({ theme, route: kind === "kosten" ? { page: "betrieb", tab: "kosten" } : kind === "abrechnung" ? { page: "kunden", tab: "abrechnung" } : { page: "uebersicht" } });
    const result = JSON.parse(JSON.stringify(c.renderVals())); c.componentWillUnmount(); return result;
  }
  const views = [
    { kind: "uebersicht", width: 1440, theme: "dunkel" }, { kind: "uebersicht", width: 1440, theme: "hell" },
    { kind: "uebersicht", width: 390, theme: "dunkel" }, { kind: "uebersicht", width: 390, theme: "hell" },
    { kind: "kosten", width: 1440, theme: "dunkel" }, { kind: "abrechnung", width: 1440, theme: "dunkel" }
  ];
  const htmlByPath = new Map();
  for (const view of views) {
    const key = `/${view.kind}-${view.theme}-${view.width}`;
    const script = `(${project.toString()})(${JSON.stringify(markup)},${JSON.stringify(await values(view.kind, view.width, view.theme))});`.replace(/<\/script/gi, "<\\/script");
    htmlByPath.set(key, `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/assets/">${head}</head><body><div id="snapshot"></div><script>${script}</script></body></html>`);
    view.url = key;
  }
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const headers = { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'", "X-Content-Type-Options": "nosniff" };
    if (request.method === "GET" && htmlByPath.has(pathname)) {
      response.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8" }); return response.end(htmlByPath.get(pathname));
    }
    const key = decodeURIComponent(pathname.replace(/^\/assets\//, ""));
    const bytes = pkg.assets.get(key);
    const types = { ".css": "text/css", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png" };
    const mime = types[path.extname(key)];
    if (request.method === "GET" && bytes && mime) { response.writeHead(200, { ...headers, "Content-Type": mime }); return response.end(bytes); }
    response.writeHead(404); response.end();
  });
  let browser;
  const browserErrors = [], blockedRequests = [];
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    // Vorhandene Werkzeuginstallation nur lesen; keine Projektabhängigkeit hinzufügen.
    const { chromium } = require("/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core");
    browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    await context.route("**/*", route => route.request().url().startsWith(base + "/") ? route.continue() : (blockedRequests.push(route.request().url()), route.abort()));
    const page = await context.newPage(); page.on("pageerror", error => browserErrors.push(String(error)));
    for (const view of views) {
      await page.setViewportSize({ width: view.width, height: 1100 });
      await page.goto(base + view.url); await page.waitForFunction(() => window.__snapshotReady);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))); });
      const meta = await page.evaluate(() => {
        const h = document.querySelector("h1"), nav = document.querySelector('nav[aria-label="Hauptnavigation"]');
        return { headingFont: getComputedStyle(h).fontFamily, bodyFont: getComputedStyle(document.body).fontFamily,
          railWidth: nav?.getBoundingClientRect().width ?? null, scrollWidth: document.documentElement.scrollWidth, innerWidth,
          text: document.querySelector("main").innerText };
      });
      assert.match(meta.headingFont, /Spectral/); assert.match(meta.bodyFont, /Hanken Grotesk/);
      if (view.width === 1440) assert.equal(meta.railWidth, 212);
      assert.ok(meta.scrollWidth <= meta.innerWidth);
      assert.doesNotMatch(meta.text, /Lexware Office verbunden|Kein Profil fällt auf|Helmut läuft gesund|Simulierte Aktion/);
      if (view.kind === "abrechnung") assert.match(meta.text, /Keine Rechnungsanbindung/);
      const file = `original-angeschlossen-${view.kind}-${view.theme}-${view.width}.png`;
      const bytes = await page.screenshot({ path: path.join(evidence, file), fullPage: true });
      delete meta.text;
      Object.assign(view, { screenshot: file, sha256: sha(bytes), metadata: meta }); console.log(`PASS ${file}`);
    }
    assert.deepEqual(browserErrors, []); assert.deepEqual(blockedRequests, []);
    fs.writeFileSync(path.join(evidence, "original-verwaltung-bildbeleg.json"), JSON.stringify({ method: "Statische DOM-Bildprojektion des Originaltemplates mit neuen Controller-View-Werten; keine React-/Interaktionsabnahme", views, browserErrors, blockedRequests, externalRequests: 0, apiRequests: 0 }, null, 2) + "\n");
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
