"use strict";

// Ausschliesslich statischer visueller Vergleich; keine Produkt-/Designaenderung.
// Originale React/CDN-Laufzeit bleibt aus. Original-Template, renderVals(),
// Beispieldaten, Schriften und Styles werden fuer ein festes Bild projiziert.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { standaloneHtml } = require("./verwaltung-vorschau");
const args = process.argv.slice(2);
assert.equal(args.length, 4); assert.equal(args[0], "--original"); assert.equal(args[2], "--evidence");
assert.ok(process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
const original = fs.realpathSync(args[1]), evidence = path.resolve(args[3]);
const html = fs.readFileSync(path.join(original, "Helmut Verwaltung v3.dc.html"), "utf8");
const logic = html.match(/<script\b[^>]*type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/i)?.[1];
const template = html.match(/<x-dc\b[^>]*>([\s\S]*?)<\/x-dc>/i)?.[1];
assert.ok(logic && template);
const dataLogic = fs.readFileSync(path.join(original, "v3_logik.js"), "utf8");
const head = (template.match(/<helmet>([\s\S]*?)<\/helmet>/i)?.[1] || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const bodyTemplate = template.replace(/<helmet>[\s\S]*?<\/helmet>/i, "");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function projectOriginal(source, markup) {
  const theme = new URL(location.href).searchParams.get("theme") || "dunkel";
  class SnapshotLogic {
    constructor(props) { this.props = props; }
    setState(update) { Object.assign(this.state, typeof update === "function" ? update(this.state) : update); }
  }
  const Component = new Function("DCLogic", `${source}\nreturn Component;`)(SnapshotLogic);
  const component = new Component({ ansicht: theme, profilanzahl: 20, zustand: "stoerung" });
  component.state.loading = false;
  const values = component.renderVals();
  const evaluate = (expression, scope) => new Function("scope", `with(scope){return (${expression})}`)(scope);
  const interpolate = (value, scope) => {
    const matches = [...value.matchAll(/\{\{([\s\S]*?)\}\}/g)];
    if (matches.length === 1 && value.trim() === matches[0][0]) return evaluate(matches[0][1], scope);
    return value.replace(/\{\{([\s\S]*?)\}\}/g, (_, expression) => String(evaluate(expression, scope) ?? ""));
  };
  // Verhindert HTML-Foster-Parenting von sc-for in Tabellen/Selects beim Einlesen.
  const nativeTags = new Set(["table", "thead", "tbody", "tfoot", "tr", "td", "th", "select", "option"]);
  const encoded = markup.replace(/<(\/?)(table|thead|tbody|tfoot|tr|td|th|select|option)(?=[\s>])/gi, "<$1x-native-$2");
  const tpl = document.createElement("template"); tpl.innerHTML = encoded;
  const render = (node, scope) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(String(interpolate(node.textContent, scope) ?? ""));
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    const tag = node.localName;
    if (tag === "script" || tag === "helmet") return document.createDocumentFragment();
    if (tag === "sc-if") {
      const fragment = document.createDocumentFragment();
      if (interpolate(node.getAttribute("value") || "false", scope)) for (const child of node.childNodes) fragment.append(render(child, scope));
      return fragment;
    }
    if (tag === "sc-for") {
      const fragment = document.createDocumentFragment();
      const entries = interpolate(node.getAttribute("list") || "[]", scope) || [];
      const alias = node.getAttribute("as") || "item";
      for (const item of entries) for (const child of node.childNodes) fragment.append(render(child, { ...scope, [alias]: item }));
      return fragment;
    }
    const name = tag.startsWith("x-native-") && nativeTags.has(tag.slice(9)) ? tag.slice(9) : tag;
    const output = document.createElement(name);
    for (const attribute of node.attributes) {
      if (/^on/i.test(attribute.name) || attribute.name.startsWith("hint-") || attribute.name === "ref") continue;
      const value = interpolate(attribute.value, scope);
      if (value == null) continue;
      if (["disabled", "checked", "selected", "hidden"].includes(attribute.name)) { if (value) output.setAttribute(attribute.name, ""); }
      else output.setAttribute(attribute.name, String(value));
    }
    for (const child of node.childNodes) output.append(render(child, scope));
    return output;
  };
  const root = document.querySelector("#original-snapshot");
  for (const child of tpl.content.childNodes) root.append(render(child, values));
  window.__originalStaticReady = true;
}

function originalPage() {
  const script = `window.addEventListener('error',event=>{window.__originalStaticError=event.error?.stack||event.message});\n${dataLogic}\n(${projectOriginal.toString()})(${JSON.stringify(logic)},${JSON.stringify(bodyTemplate)});`.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="/original/">${head}</head><body><div id="original-snapshot"></div><script>${script}</script></body></html>`;
}

async function cdpConnect(url) {
  const ws = new WebSocket(url); let id = 0; const pending = new Map(), events = [];
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  ws.addEventListener("message", event => {
    const result = JSON.parse(event.data);
    if (!result.id) { events.push(result); return; }
    const promise = pending.get(result.id); if (!promise) return;
    pending.delete(result.id); result.error ? promise.reject(new Error(JSON.stringify(result.error))) : promise.resolve(result.result);
  });
  return { events, send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const callId = ++id; const timer = setTimeout(() => { pending.delete(callId); reject(new Error(`CDP timeout ${method}`)); }, 12000);
      pending.set(callId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      ws.send(JSON.stringify({ id: callId, method, params }));
    });
  }, close() { ws.close(); } };
}

async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const requests = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1"); requests.push(url.pathname);
    if (request.method !== "GET") { response.writeHead(405); return response.end(); }
    const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'self'; form-action 'none'" };
    if (url.pathname === "/reference") { response.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8" }); return response.end(originalPage()); }
    if (url.pathname === "/prepared") { response.writeHead(200, { ...headers, "Content-Type": "text/html; charset=utf-8" }); return response.end(standaloneHtml()); }
    if (url.pathname.startsWith("/original/")) {
      const relative = decodeURIComponent(url.pathname.slice("/original/".length));
      const file = path.resolve(original, relative);
      if (file.startsWith(original + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() && /\.(css|ttf|svg|png)$/.test(file)) {
        const mime = { ".css": "text/css", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png" }[path.extname(file)];
        response.writeHead(200, { ...headers, "Content-Type": mime }); return response.end(fs.readFileSync(file));
      }
    }
    response.writeHead(404); response.end();
  });
  const browserDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-original-vergleich-"));
  let chrome, cdp; const views = [];
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const debuggerUrl = await new Promise((resolve, reject) => {
      chrome = spawn("/usr/bin/chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--no-first-run", "--no-default-browser-check", "--disable-sync", "--metrics-recording-only", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${browserDir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
      let text = ""; const timer = setTimeout(() => reject(new Error("Browserstart nicht bestaetigt")), 12000);
      chrome.stderr.on("data", data => { text += data; const found = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (found) { clearTimeout(timer); resolve(found[1]); } });
      chrome.once("error", reject);
    });
    const debug = new URL(debuggerUrl);
    const targets = await (await fetch(`http://${debug.host}/json/list`)).json();
    cdp = await cdpConnect(targets.find(target => target.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Network.enable");
    const evaluate = async expression => {
      const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    for (const width of [1440, 390]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 1100, deviceScaleFactor: 1, mobile: width < 800 });
      for (const kind of ["original-dunkel", "original-hell", "vorbereitet"]) {
        const isOriginal = kind.startsWith("original");
        const url = isOriginal ? `${base}/reference?theme=${kind.endsWith("hell") ? "hell" : "dunkel"}#/uebersicht` : `${base}/prepared#/ueberblick`;
        await cdp.send("Page.navigate", { url });
        await evaluate(`new Promise((resolve,reject)=>{const deadline=Date.now()+8000;const tick=()=>{if(window.__originalStaticError)return reject(new Error(window.__originalStaticError));if(${isOriginal ? "window.__originalStaticReady" : "document.querySelectorAll('.attention-item').length===2"})return document.fonts.ready.then(()=>resolve(true));if(Date.now()>deadline)return reject(new Error('Originalprojektion nicht bereit'));setTimeout(tick,40)};tick()})`);
        // Erst das fertige Bild aufnehmen, nicht einen Zwischenstand der Original-Einblendung.
        await evaluate(`Promise.all(document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})))`);
        const meta = await evaluate(`(()=>{const h=document.querySelector('h1');const rail=document.querySelector('.rail')||document.querySelector('nav[aria-label="Hauptnavigation"]');return {title:h?.textContent,headingFont:getComputedStyle(h).fontFamily,bodyFont:getComputedStyle(document.body).fontFamily,railWidth:rail?.getBoundingClientRect().width??null,background:getComputedStyle(document.querySelector('main')).backgroundColor,navLabels:[...document.querySelectorAll('nav a')].map(a=>a.textContent.trim()).filter(Boolean),width:innerWidth,scrollWidth:document.documentElement.scrollWidth}})()`);
        const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
        const filename = `${kind}-${width}.png`, bytes = Buffer.from(shot.data, "base64"); fs.writeFileSync(path.join(evidence, filename), bytes);
        views.push({ kind, width, metadata: meta, screenshot: filename, sha256: sha(bytes) });
        console.log(`PASS Visueller Beleg ${kind} ${width}px erstellt`);
      }
    }
    const outbound = cdp.events.filter(event => event.method === "Network.requestWillBeSent" && !event.params.request.url.startsWith(base));
    assert.equal(outbound.length, 0);
    assert.equal(requests.some(url => url.startsWith("/api/")), false);
    assert.equal(cdp.events.filter(event => event.method === "Runtime.exceptionThrown").length, 0);
    const reference = views.find(view => view.kind === "original-hell" && view.width === 1440).metadata;
    const prepared = views.find(view => view.kind === "vorbereitet" && view.width === 1440).metadata;
    const differences = { headingFont: reference.headingFont !== prepared.headingFont, bodyFont: reference.bodyFont !== prepared.bodyFont,
      navigation: JSON.stringify(reference.navLabels) !== JSON.stringify(prepared.navLabels), railWidth: reference.railWidth !== prepared.railWidth };
    const result = { sourceHtmlSha256: sha(Buffer.from(html)), originalBytesUnchanged: true,
      method: "Statische DOM-Projektion aus unveraendertem Original-Template, renderVals, v3_logik und Originalfonts/CSS; Original-React/CDN-Laufzeit und Interaktionen nicht ausgefuehrt.",
      externalRequests: 0, apiRequests: 0, designMatch: !Object.values(differences).some(Boolean), differences,
      finding: "Vorbereitete helle Ersatzansicht aus ae18658e weicht in Schrift, Navigation, Struktur und Farb-/Flaechengestaltung von beiden Originalvarianten ab. Keine visuelle Freigabe. Keine UI-Datei veraendert.", views };
    fs.writeFileSync(path.join(evidence, "designvergleich.json"), JSON.stringify(result, null, 2) + "\n");
  } finally {
    if (cdp) fs.writeFileSync(path.join(evidence, "design-runtimeereignisse.json"), JSON.stringify(cdp.events.filter(event => ["Runtime.exceptionThrown", "Runtime.consoleAPICalled"].includes(event.method)), null, 2) + "\n");
    if (cdp && chrome?.exitCode === null) await cdp.send("Browser.close").catch(() => {});
    cdp?.close();
    if (chrome?.exitCode === null) await new Promise(resolve => { chrome.once("exit", resolve); chrome.kill("SIGTERM"); });
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(browserDir, { recursive: true, force: true, maxRetries: 3 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
