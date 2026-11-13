"use strict";

// Gezielte Vertrags- und Browserpruefung ausschliesslich der neuen Verwaltung.
// Keine Dependencies/Installation, kein Serverimport, keine Helmut-Datenbank.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { createPreviewServer, standaloneHtml } = require("./verwaltung-vorschau");
const root = path.join(__dirname, "..");
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
async function asyncCheck(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const imported = name => import(pathToFileURL(path.join(root, "verwaltung", name)).href);

async function connectCdp(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  const events = [];
  let id = 0;
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  ws.addEventListener("message", message => {
    const event = JSON.parse(message.data);
    if (!event.id) { events.push(event); return; }
    const promise = pending.get(event.id);
    if (promise) { pending.delete(event.id); event.error ? promise.reject(new Error(JSON.stringify(event.error))) : promise.resolve(event.result); }
  });
  return {
    events,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(idForCall); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
        const idForCall = ++id;
        pending.set(idForCall, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
        ws.send(JSON.stringify({ id: idForCall, method, params }));
      });
    },
    close() { ws.close(); }
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--contracts-only")) throw new Error("Unbekanntes Testargument.");
  const model = await imported("model.mjs");
  const { createAdminReader } = await imported("api.mjs");
  const { createPreviewReader } = await imported("beispieldaten.mjs");
  check("Fehlende Kosten bleiben offen; echte Null bleibt Null", () => {
    assert.equal(model.money(null), "—"); assert.equal(model.money(undefined), "—");
    assert.equal(model.money("2"), "—"); assert.match(model.money(0), /0,00/);
  });
  check("Fehlende Profile sind kein leerer Bestand", () => {
    assert.deepEqual(model.profileCounts(null), { total: null, active: null, attention: null });
    assert.equal(model.profileCounts({ mandates: [] }).total, 0);
    assert.equal(model.profileCounts({ mandates: [{ id: "a" }] }).active, null);
  });
  check("Unbekannte Preise erscheinen nie als null Kosten; alte Altsummen reichen nicht", () => {
    assert.equal(model.todayCost({ estimatedCostUsd: 0 }).value, "—");
    assert.equal(model.todayCost({ kostenwahrheit: { gesamt: { kostenUsd: 0, kostenUnbekannt: 2 } } }).value, "Offen");
    assert.match(model.todayCost({ kostenwahrheit: { gesamt: { kostenUsd: 1.42, kostenUnbekannt: 0 } } }).value, /1,42/);
  });
  check("Profilseiten bleiben begrenzt und verwaiste Seitennummern werden korrigiert", () => {
    const items = Array.from({ length: 41 }, (_, i) => ({ id: `fiktiv-${i}` }));
    assert.equal(model.paginateProfiles(items, 1).items.length, 20);
    assert.equal(model.paginateProfiles(items, 2).items[0].id, "fiktiv-20");
    assert.equal(model.paginateProfiles(items, 999).items[0].id, "fiktiv-40");
    assert.equal(model.paginateProfiles([], 2).first, 0);
  });
  check("Profilbereitschaft behauptet keine fachliche Brauchbarkeit", () => {
    assert.deepEqual(model.profileState({ profileActive: true, validierung: { bereit: true } }), { label: "Profil vollständig", tone: "neutral" });
    assert.equal(model.profileState({ profileActive: false, validierung: { bereit: false } }).label, "Inaktiv");
    assert.equal(model.attentionItems(null, { stoerungen: { verfuegbar: false, handlungsbedarf: [{}] } }).length, 0);
  });
  check("Bundesland wird nie als Mandatsebene geraten", () => {
    assert.equal(model.parliamentLabel({ state: "Berlin" }), "Mandatsebene nicht angegeben");
    assert.equal(model.parliamentLabel({ parliamentType: "Bundestag", state: "Berlin" }), "Bundestag");
  });
  check("Kontostatus pausiert ist keine Zugangssperre", () => {
    assert.equal(model.accessLabel({ status: "pausiert", active: true }), "Offen");
    assert.equal(model.accessLabel({ status: "aktiv", active: false }), "Gesperrt");
  });
  check("Fremde HTML-Inhalte werden als Text ausgegeben", () => {
    assert.equal(model.escapeHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  const fixture = createPreviewReader();
  check("Suche und Aktiv-/Problemfilter bleiben getrennt", () => {
    const items = [{ id: "a", fullName: "Nord", profileActive: true, validierung: { bereit: false } }, { id: "b", fullName: "Süd", profileActive: false }];
    assert.equal(model.filterProfiles(items, "NORD", "active").length, 1);
    assert.equal(model.filterProfiles(items, "", "attention").length, 1);
    assert.equal(model.filterProfiles(items, "Nicht vorhanden").length, 0);
  });
  const requests = [];
  const reader = createAdminReader({ fetcher: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ mandates: [] }) }; } });
  await reader.read("overview"); await reader.read("overview");
  check("Vorhandene Adminroute wird einmal gelesen, ohne Secret", () => {
    assert.equal(requests.length, 1); assert.equal(requests[0].url, "/api/admin/overview");
    assert.equal(requests[0].options.method, "GET"); assert.equal(requests[0].options.credentials, "same-origin");
    assert.equal(requests[0].options.redirect, "error"); assert.deepEqual(requests[0].options.headers, { Accept: "application/json" });
  });
  await asyncCheck("Schreibpfade, Datenstatus und Pfadinjektion sind nicht erreichbar", async () => {
    for (const [key, id] of [["delete"], ["data-status"], ["toString"], ["constructor"], ["__proto__"], [["overview"]], ["profile", "../../auth"], ["profile", "x?secret=x"]]) await assert.rejects(reader.read(key, id));
    assert.equal(requests.length, 1);
  });
  await asyncCheck("401/403 und Serverfehler werden weder versteckt noch mit Beispieldaten ersetzt", async () => {
    for (const status of [401, 403, 500]) {
      const broken = createAdminReader({ fetcher: async () => ({ ok: false, status }) });
      await assert.rejects(broken.read("overview"), error => error.status === status && !error.message.includes("token"));
    }
    const html = createAdminReader({ fetcher: async () => ({ ok: true, json: async () => { throw new Error("SECRET response body"); } }) });
    await assert.rejects(html.read("overview"), error => !error.message.includes("SECRET"));
  });
  await asyncCheck("Zeitueberschreitung beendet die Anfrage", async () => {
    let aborted = false;
    const slow = createAdminReader({ timeoutMs: 10, fetcher: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); })) });
    await assert.rejects(slow.read("overview")); assert.equal(aborted, true);
  });
  await asyncCheck("Aktualisieren liest frisch; beendeter Leser bleibt geschlossen", async () => {
    reader.clear(); await reader.read("overview"); assert.equal(requests.length, 2);
    reader.dispose(); await assert.rejects(reader.read("overview")); assert.equal(requests.length, 2);
  });
  await asyncCheck("Sechs verschiedene Verwaltungsleser laufen FIFO mit maximal zwei offenen Antworten", async () => {
    const keys = ["overview", "budget", "customers", "sources", "runs", "ergebnisse"];
    const calls = [], bodies = [];
    let active = 0, peak = 0;
    const bounded = createAdminReader({ fetcher: async url => {
      calls.push(url); active++; peak = Math.max(peak, active);
      return { ok: true, json: () => new Promise(resolve => {
        bodies.push(() => { active--; resolve({ url }); });
      }) };
    } });
    const reads = keys.map(key => bounded.read(key));
    assert.equal(bounded.read(keys[0]), reads[0], "identische URL teilt weiterhin dieselbe Promise");
    const all = Promise.all(reads);
    await new Promise(resolve => setImmediate(resolve));
    const started = calls.length;
    while (bodies.length) { bodies.shift()(); await new Promise(resolve => setImmediate(resolve)); }
    const results = await all;
    bounded.dispose();
    assert.equal(started, 2); assert.equal(peak, 2);
    assert.deepEqual(results.map(value => value.url), calls, "alle Ergebnisse und die FIFO-Reihenfolge bleiben erhalten");
  });
  await asyncCheck("Wartende verbrauchen dieselbe Frist und starten nach Timeout keinen Abruf", async () => {
    const finish = [], calls = [];
    const bounded = createAdminReader({ timeoutMs: 10, fetcher: url => {
      calls.push(url);
      return new Promise(resolve => finish.push(() => resolve({ ok: true, json: async () => ({ url }) })));
    } });
    const reads = ["overview", "budget", "customers"].map(key => bounded.read(key));
    const results = await Promise.allSettled(reads);
    assert.equal(results.filter(result => result.status === "rejected").length, 3);
    assert.equal(calls.length, 2, "Timeout gibt keinen noch laufenden Fetch frei");
    while (finish.length) { finish.shift()(); await new Promise(resolve => setImmediate(resolve)); }
    assert.equal(calls.length, 2, "der abgelaufene dritte Leser wird auch spaeter nicht gestartet");
    const next = bounded.read("sources");
    await new Promise(resolve => setImmediate(resolve));
    finish.shift()(); assert.equal((await next).url, "/api/admin/sources-status");
    bounded.dispose();
  });
  for (const action of ["clear", "dispose"]) {
    await asyncCheck(`${action} entfernt wartende Leser auch bei ignoriertem Abort`, async () => {
      const finish = [], calls = [];
      const bounded = createAdminReader({ fetcher: url => {
        calls.push(url);
        return new Promise(resolve => finish.push(() => resolve({ ok: true, json: async () => ({ url }) })));
      } });
      const results = Promise.allSettled(["overview", "budget", "customers", "sources"].map(key => bounded.read(key)));
      await new Promise(resolve => setImmediate(resolve));
      bounded[action]();
      assert.equal((await results).filter(result => result.status === "rejected").length, 4);
      assert.equal(calls.length, 2);
      const after = bounded.read("runs");
      // dispose muss sofort scheitern; clear liest erst nach echtem Abschluss neu.
      const checked = action === "dispose" ? assert.rejects(after) : after;
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls.length, 2);
      while (finish.length) { finish.shift()(); await new Promise(resolve => setImmediate(resolve)); }
      await checked;
      assert.equal(calls.length, action === "dispose" ? 2 : 3);
      assert.ok(!calls.includes("/api/admin/customers") && !calls.includes("/api/admin/sources-status"));
      bounded.dispose();
    });
  }
  await asyncCheck("Einfache Verwaltung verwendet fuer alle fuenf Startleser dieselbe Grenze", async () => {
    const { createSimpleApi } = await imported("einfach/api.mjs");
    const calls = [], bodies = [];
    let active = 0, peak = 0;
    const api = createSimpleApi({ fetcher: async (url, options) => {
      assert.equal(options.method, "GET"); calls.push(url); active++; peak = Math.max(peak, active);
      const payload = url === "/api/admin/customers?scope=regular" ? { kunden: [], customerScope: "regular" }
        : url === "/api/admin/overview" ? { mandates: [] } : {};
      return { ok: true, json: () => new Promise(resolve => bodies.push(() => { active--; resolve(payload); })) };
    } });
    const loading = api.load();
    await new Promise(resolve => setImmediate(resolve));
    const started = calls.length;
    while (bodies.length) { bodies.shift()(); await new Promise(resolve => setImmediate(resolve)); }
    const result = await loading;
    api.dispose();
    assert.equal(started, 2); assert.equal(peak, 2); assert.deepEqual(result.customers, []);
    assert.equal(calls.length, 5);
    assert.equal(calls[4], "/api/admin/stats/process-runs?limit=5&process=warteschlange-crawl");
  });
  if (args[0] === "--contracts-only") {
    fixture.dispose();
    console.log(`\n${checks}/${checks} gezielte Anzeige-/API-Vertraege bestanden.`);
    return;
  }

  const staticHandler = createPreviewServer().listeners("request")[0];
  let apiScenario = "ok";
  const interceptedApi = [];
  const endpoints = { "/api/admin/overview": "overview", "/api/admin/stats/budget-today": "budget",
    "/api/admin/customers": "customers", "/api/admin/sources-status": "sources", "/api/admin/stats/process-runs": "runs" };
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/integration") {
      const html = fs.readFileSync(path.join(root, "verwaltung", "index.html"), "utf8")
        .replace('<script type="module" src="./vorschau.mjs"></script>', '<script type="module">import { mountAdministration } from "/app.mjs"; import { createAdminReader } from "/api.mjs"; mountAdministration(document.querySelector("#verwaltung"), { reader: createAdminReader() });</script>');
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(html);
    }
    if (url.pathname === "/offline") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end(standaloneHtml());
    }
    if (url.pathname.startsWith("/api/")) {
      interceptedApi.push({ method: request.method, path: url.pathname });
      const status = apiScenario === "forbidden" ? 403 : apiScenario === "signed-out" ? 401
        : apiScenario === "partial" && url.pathname.endsWith("budget-today") ? 500 : 200;
      response.writeHead(status, { "Content-Type": "application/json" });
      if (status !== 200) return response.end(JSON.stringify({ error: "SECRET server details" }));
      const key = endpoints[url.pathname];
      if (!key) return response.end(JSON.stringify({}));
      const data = await fixture.read(key);
      if (apiScenario === "xss" && key === "overview") data.mandates[0].fullName = '<img src=x onerror="window.XSS=true">';
      if (apiScenario === "empty" && key === "overview") data.mandates = [];
      if (apiScenario === "unknown-costs" && key === "budget") data.kostenwahrheit.gesamt = { kostenUsd: 0, kostenUnbekannt: 2 };
      if (apiScenario === "paging" && key === "overview") data.mandates = Array.from({ length: 41 }, (_, i) => ({ ...data.mandates[0], id: `synthetik-seite-${i}`, fullName: `Fiktives Büro ${i}` }));
      return response.end(JSON.stringify(data));
    }
    return staticHandler(request, response);
  });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-verwaltung-browser-"));
  const out = process.env.HELMUT_VERWALTUNG_BELEGE || path.join(os.tmpdir(), "helmut-verwaltung-belege");
  fs.mkdirSync(out, { recursive: true });
  let chrome, cdp;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const chromeReady = new Promise((resolve, reject) => {
      chrome = spawn("/usr/bin/chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--disable-component-update", "--no-first-run", "--no-default-browser-check", "--disable-sync", "--metrics-recording-only", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profileDir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      const timer = setTimeout(() => reject(new Error("Chromium-Startfrist")), 15000);
      chrome.stderr.on("data", bytes => {
        stderr += bytes.toString();
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      chrome.once("error", error => { clearTimeout(timer); reject(error); });
      chrome.once("exit", code => { clearTimeout(timer); reject(new Error(`Chromium beendet: ${code}`)); });
    });
    const debugging = new URL(await chromeReady);
    const targets = await (await fetch(`http://${debugging.host}/json/list`)).json();
    cdp = await connectCdp(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable"); await cdp.send("Network.enable");
    const evaluate = async expression => {
      const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async expression => {
      const result = await evaluate(`new Promise((resolve, reject) => { const end=Date.now()+8000; const tick=()=>{if(${expression})return resolve(true); if(Date.now()>end)return reject(new Error('Ansicht nicht bereit')); setTimeout(tick,30)}; tick(); })`);
      assert.equal(result, true);
    };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const screenshot = async name => {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      fs.writeFileSync(path.join(out, name), Buffer.from(shot.data, "base64"));
    };
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: base });
    await waitFor("document.querySelectorAll('.attention-item').length === 2");
    assert.equal(await evaluate("document.querySelectorAll('.main-nav a').length"), 4);
    assert.equal(await evaluate("document.body.textContent.includes('Vorschau · Beispieldaten')"), true);
    assert.equal(await evaluate("document.querySelectorAll('.result-list .badge').length"), 3);
    assert.equal(await evaluate("document.querySelectorAll('.result-list .badge--neutral').length"), 3);
    checks++; console.log("PASS Desktop: vier Bereiche, sichtbare Beispieldaten und ehrliche Ergebnisqualitaet");
    await screenshot("verwaltung-desktop.png");
    await click('a[href="#/profile"]');
    await waitFor("document.querySelector('#profile-search') && document.querySelectorAll('tbody tr').length === 6");
    await evaluate("const input=document.querySelector('#profile-search');input.value='Mitte';input.dispatchEvent(new Event('input',{bubbles:true}));");
    assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 1);
    await click('a[href="#/profil/synthetik-mitte"]');
    await waitFor("document.querySelector('.detail-hero h2')?.textContent === 'Büro Mitte'");
    assert.equal(await evaluate("document.body.textContent.includes('Landtag Brandenburg')"), true);
    assert.equal(await evaluate("document.body.textContent.includes('Diese Angaben fehlen noch')"), true);
    checks++; console.log("PASS Profile: Suche, Detail, fehlende Angaben und Landtag");
    await screenshot("verwaltung-profildetail.png");
    await click('a[href="#/profile"]');
    await waitFor("document.querySelectorAll('tbody tr').length === 6");
    await click('[data-filter="active"]'); assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 5);
    await click('[data-filter="attention"]'); assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 1);
    checks++; console.log("PASS Aktiv- und Problemfilter bedienen die richtige Teilmenge");
    await click('a[href="#/kunden"]');
    await waitFor("document.querySelectorAll('tbody tr').length === 4");
    await click('a[href="#/kunde/synthetisches-konto-3"]');
    await waitFor("document.body.textContent.includes('Das Konto ist pausiert, der Zugang bleibt offen.')");
    checks++; console.log("PASS Kunden: manuelle Preise und echter Zugangsstatus getrennt");
    await click('a[href="#/betrieb/ablaeufe"]');
    await waitFor("document.querySelectorAll('.run-row').length === 3");
    await click('a[href="#/betrieb/quellen"]'); await waitFor("document.querySelectorAll('.source-row').length === 1");
    await click('a[href="#/betrieb/kosten"]'); await waitFor("document.querySelector('.cost-explainer')");
    assert.equal(await evaluate("document.body.textContent.includes('24,76')"), true);
    assert.equal(await evaluate("document.querySelectorAll('progress, [role=progressbar]').length"), 0);
    checks++; console.log("PASS Betrieb: Ablaeufe, Quellen, Kosten ohne erfundenen Budgetbalken");
    for (const width of [390, 360, 320]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: true });
      await click('a[href="#/profile"]'); await waitFor("document.querySelector('#profile-search')");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, `Profile ${width}px`);
      await click('a[href="#/ueberblick"]'); await waitFor("document.querySelectorAll('.attention-item').length === 2");
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, `Überblick ${width}px`);
      if (width === 390) await screenshot("verwaltung-mobil.png");
    }
    checks++; console.log("PASS Mobil: 390/360/320 Pixel ohne horizontalen Seitenlauf");
    await evaluate("document.querySelector('.skip-link').click()");
    assert.equal(await evaluate("document.activeElement.id"), "admin-main");
    assert.equal(await evaluate("document.querySelector('#page-title').textContent"), "Überblick");
    checks++; console.log("PASS Tastatur: Sprung zum Inhalt erhaelt die Ansicht");
    assert.equal(cdp.events.filter(event => event.method === "Runtime.exceptionThrown").length, 0);
    const apiRequests = cdp.events.filter(event => event.method === "Network.requestWillBeSent" && event.params.request.url.includes("/api/"));
    assert.equal(apiRequests.length, 0);
    checks++; console.log("PASS Vorschau: keine Browserfehler und keine API-/Motoranfragen");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: `${base}/integration#/ueberblick` });
    await waitFor("document.querySelectorAll('.attention-item').length === 2");
    assert.equal(await evaluate("document.querySelector('.preview-label')"), null);
    assert.equal(interceptedApi.length, 4);
    checks++; console.log("PASS Browser → echter neuer API-Client → lokale Vertragsantwort → Ansicht");
    apiScenario = "partial";
    await click('[data-action="refresh"]');
    await waitFor("document.querySelector('.notice--error')");
    assert.equal(await evaluate("document.querySelector('.metrics .metric:nth-child(3) strong').textContent"), "—");
    assert.equal(await evaluate("document.querySelectorAll('.attention-item').length"), 2);
    checks++; console.log("PASS Teilfehler: Kosten fehlen ehrlich, andere Bereiche bleiben nutzbar");
    apiScenario = "forbidden";
    await click('[data-action="refresh"]');
    await waitFor("document.querySelector('.empty h3')?.textContent === 'Kein Zugriff'");
    assert.equal(await evaluate("document.querySelector('.metrics')"), null);
    assert.equal(await evaluate("document.body.textContent.includes('SECRET')"), false);
    apiScenario = "signed-out";
    await click('[data-action="refresh"]');
    await waitFor("document.querySelector('.empty h3')?.textContent === 'Bitte erneut anmelden'");
    checks++; console.log("PASS HTTP 401/403: geschuetzte Inhalte entfernt, keine internen Fehlerdetails");
    apiScenario = "xss";
    await cdp.send("Page.navigate", { url: `${base}/integration?fall=xss#/profile` });
    await waitFor("document.querySelectorAll('tbody tr').length === 6");
    assert.equal(await evaluate("document.querySelectorAll('tbody img').length"), 0);
    assert.equal(await evaluate("window.XSS === true"), false);
    assert.equal(await evaluate("document.querySelector('tbody').textContent.includes('<img')"), true);
    apiScenario = "empty";
    await click('[data-action="refresh"]');
    await waitFor("document.querySelector('.empty h3')?.textContent === 'Noch keine Profile'");
    checks++; console.log("PASS API-Inhalte: XSS bleibt Text, leerer Bestand wird klar ausgewiesen");
    apiScenario = "paging";
    await click('[data-action="refresh"]');
    await waitFor("document.querySelectorAll('tbody tr').length === 20");
    await click('[aria-label="Nächste Profilseite"]');
    assert.equal(await evaluate("document.querySelector('tbody tr').textContent.includes('Büro 20')"), true);
    await click('[aria-label="Nächste Profilseite"]');
    assert.equal(await evaluate("document.querySelectorAll('tbody tr').length"), 1);
    await evaluate("const input=document.querySelector('#profile-search');input.value='Büro 2';input.dispatchEvent(new Event('input',{bubbles:true}));");
    assert.equal(await evaluate("document.querySelector('tbody tr').textContent.includes('Büro 2')"), true);
    checks++; console.log("PASS Browser-Paging: Seitenwechsel und Suchwechsel auf letzter Seite");
    apiScenario = "unknown-costs";
    await cdp.send("Page.navigate", { url: `${base}/integration?fall=kosten#/ueberblick` });
    await waitFor("document.querySelector('.metrics .metric:nth-child(3) strong')?.textContent === 'Offen'");
    checks++; console.log("PASS Unbekannte Kosten sind auch im Browser offen statt 0,00 USD");
    assert.equal(interceptedApi.every(request => request.method === "GET" && endpoints[request.path]), true);
    assert.equal(cdp.events.filter(event => event.method === "Network.requestWillBeSent")
      .every(event => event.params.request.url.startsWith(base)), true);
    assert.equal(cdp.events.filter(event => event.method === "Runtime.exceptionThrown").length, 0);
    checks++; console.log("PASS Alle Browseranfragen bleiben am isolierten Loopback-Testserver");
    await cdp.send("Page.navigate", { url: `${base}/offline#/ueberblick` });
    await waitFor("document.querySelectorAll('.attention-item').length === 2");
    checks++; console.log("PASS Einzelne Offline-HTML-Datei funktioniert ohne Module oder API");
    fs.writeFileSync(path.join(out, "verwaltung-offline.html"), standaloneHtml());
    console.log(`BELEGE ${out}`);
  } finally {
    if (cdp && chrome?.exitCode === null) await cdp.send("Browser.close").catch(() => {});
    cdp?.close();
    if (chrome && chrome.exitCode === null) {
      await new Promise(resolve => { chrome.once("exit", resolve); chrome.kill("SIGTERM"); });
    }
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
    fixture.dispose();
  }
  console.log(`\n${checks}/${checks} gezielte Verwaltungspruefungen bestanden.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
