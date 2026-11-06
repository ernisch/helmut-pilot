"use strict";

// Echte Client-Renderer, synthetische beleggebundene DTOs. Keine API/DB/Modelle.
// --browser prüft dieselben Quellenelemente im Original-Chromium und echten CSS;
// vor Browserstart wird ein eigenes, routenloses Netzwerk-Namespace belegt.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { spawn, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

if (process.argv.includes("--browser-inside")) {
  const [, htmlFile, screenshot, parentNamespace] = process.argv.slice(2);
  assert.notEqual(fs.readlinkSync("/proc/self/ns/net"), parentNamespace);
  assert.equal(fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").length, 1);
  const ipv6 = fs.readFileSync("/proc/net/ipv6_route", "utf8").trim().split("\n").filter(Boolean).map(s => s.trim().split(/\s+/));
  assert(ipv6.every(r => r.at(-1) === "lo" && (parseInt(r.at(-2), 16) & 0x200)));
  const browserHome = fs.mkdtempSync(path.join(path.dirname(htmlFile), "chromium-"));
  // Vorhandenen CDP-Transport des Originalbrowser-Tests wiederverwenden; keine
  // App starten und keine HTTP-/Modellantworten laden. dump-dom ist hier unzuverlässig.
  const runner = fs.readFileSync(path.join(__dirname, "ui-preview-browser-check.js"), "utf8");
  const start = runner.indexOf("class CDP {");
  const end = runner.indexOf("\nasync function main()", start);
  assert(start >= 0 && end > start);
  const CDP = vm.runInNewContext(runner.slice(start, end) + "\nCDP", { setTimeout, clearTimeout });
  return (async () => {
    const args = ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-pipe",
      "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run",
      "--no-proxy-server", "--disable-features=Translate,MediaRouter,OptimizationHints", "--renderer-process-limit=1",
      "--user-data-dir=" + browserHome];
    const chrome = spawn("/usr/bin/chromium", args, { env: { PATH: process.env.PATH, HOME: browserHome }, stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
    let log = "";
    chrome.stderr.on("data", chunk => { log = (log + chunk.toString()).slice(-12000); });
    const cdp = new CDP(chrome);
    try {
      const target = await cdp.send("Target.createTarget", { url: "about:blank" });
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
      await cdp.send("Page.enable", {}, sessionId);
      await cdp.send("Runtime.enable", {}, sessionId);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
      const { frameTree } = await cdp.send("Page.getFrameTree", {}, sessionId);
      await cdp.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html: fs.readFileSync(htmlFile, "utf8") }, sessionId);
      const state = await cdp.evaluate(sessionId, "({result:document.body.dataset.result,text:document.body.innerText.slice(-200)})");
      assert.equal(state.result, "pass", JSON.stringify(state));
      const capture = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
      fs.writeFileSync(screenshot, Buffer.from(capture.data, "base64"));
      console.log("PASS Original-Chromium: sichtbare Attribution, getrennte sichere Links, mobile Breite; Netzwerk isoliert.");
      console.log("Screenshot: " + screenshot);
    } finally {
      await cdp.send("Browser.close").catch(() => {});
      chrome.kill("SIGTERM");
      fs.writeFileSync(path.join(path.dirname(htmlFile), "chromium.log"), log);
      fs.rmSync(browserHome, { recursive: true, force: true });
    }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

const { PARLAMENTSDATEN_QUELLEN } = require("../lib/helmut/quellenarchitektur/seeds/parlamentsdaten-quellen");
const { baueParlamentsdatenHerkunft, parlamentsdatenQuellenhinweis } = require("../lib/helmut/parlamentsdaten-herkunft");

function loadClient() {
  const noop = () => {};
  const node = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [],
    appendChild: noop, setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop,
    blur: noop, click: noop, closest: () => null, contains: () => false, insertAdjacentHTML: noop,
    scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }), innerHTML: "", textContent: "", value: "", offsetParent: null });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const context = { console, Intl, Date, URL, URLSearchParams, setTimeout: () => 0, clearTimeout: noop,
    setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    document: { querySelector: node, querySelectorAll: () => [], getElementById: node, createElement: node,
      createDocumentFragment: node, body: node(), documentElement: node(), addEventListener: noop,
      removeEventListener: noop, cookie: "", visibilityState: "visible", hidden: false },
    navigator: { userAgent: "offline-ui", language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storage, sessionStorage: storage,
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    fetch: () => { throw Error("Kein Netz im Render-Test"); }, getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 }, addEventListener: noop, removeEventListener: noop, scrollTo: noop };
  context.window = context; context.self = context; context.globalThis = context;
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  assert.match(code, /^\s*loadBriefing\(\)/m);
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__sourceUi = { renderSourceNotice, withSourceNotice, lageSourceRow, vsheetSourceRow,
    sourceLink, renderSourceBasis, renderOfficeDraftSources, renderTopicSourceLinks,
    renderRadarMentionCard, renderRadarEnvRow, renderRadarDynamicCard, renderRadarArticleRow, renderHstandPrimary };`;
  vm.runInNewContext(code, context, { filename: "client.js" });
  return context.__sourceUi;
}

const api = loadClient();
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
function dto(source, url, title, truncated = false) {
  const raw = { sourceId: source.id, title, url };
  raw.parlamentsdatenHerkunft = baueParlamentsdatenHerkunft(source, url, title, truncated);
  const sourceNotice = parlamentsdatenQuellenhinweis(raw);
  assert(sourceNotice);
  return { ...raw, sourceNotice, name: source.name, sourceName: source.name, sourceUrl: source.url, itemUrl: url, href: url,
    linkType: "direct", publishedAt: null, confidence: "low", relationTypes: ["official"], qualityStatus: "partial" };
}
const bundespuls = dto(PARLAMENTSDATEN_QUELLEN.find(s => s.id === "bundespuls-vorgaenge-rss"),
  "https://bundespuls.de/vorgang/341273", "Synthetischer parlamentarischer Vorgang", true);
const eurlex = dto(PARLAMENTSDATEN_QUELLEN.find(s => s.id === "eurlex-amtsblatt-l-rss"),
  "https://eur-lex.europa.eu/legal-content/AUTO/?uri=CELEX:32026R2409", "Synthetischer Rechtsakt");
const other = { ...bundespuls, sourceNotice: undefined, name: "Andere Quelle", sourceName: "Andere Quelle",
  url: "https://news.example.org/bericht", itemUrl: "https://news.example.org/bericht", href: "https://news.example.org/bericht", sourceUrl: "https://news.example.org/feed" };
const renderers = {
  Lage: s => api.lageSourceRow(s), Vorgangsdetail: s => api.vsheetSourceRow(s),
  Briefinglink: s => api.sourceLink(s), Quellenbasis: s => api.renderSourceBasis({ sources: [s] }),
  Büro: s => api.renderOfficeDraftSources([s]), Themen: s => api.renderTopicSourceLinks({ sources: [s, other] }),
  RadarErwähnung: s => api.renderRadarMentionCard({ ...s, sourceUrl: s.url }), RadarUmfeld: s => api.renderRadarEnvRow({ ...s, sourceUrl: s.url }),
  RadarDynamik: s => api.renderRadarDynamicCard({ ...s, sourceUrl: s.url }), RadarArtikel: s => api.renderRadarArticleRow({ ...s, sourceUrl: s.url }),
  Helmut: s => api.renderHstandPrimary({ primaryItem: { ...s, sourceUrl: s.url } })
};

test("Alle vorhandenen Quellenansichten zeigen DIP-Ursprung, Aufbereitung, kostenlosen Link und Änderung", () => {
  for (const [name, render] of Object.entries(renderers)) {
    const html = render(bundespuls);
    assert(html.includes("Deutscher Bundestag/Bundesrat – DIP"), name);
    assert(html.includes("Aufbereitung: Bundespuls"), name);
    assert(html.includes('href="https://dip.bundestag.de/"'), name);
    assert(html.includes("Originaldaten kostenlos bei DIP"), name);
    assert(html.includes("Nur Titelmetadaten übernommen; Titel gekürzt"), name);
  }
});
test("EUR-Lex nennt vorhandene CELEX-Kennung und eigene Quelle ohne DIP-Umdeutung", () => {
  const html = api.vsheetSourceRow(eurlex);
  assert(html.includes("CELEX 32026R2409")); assert(html.includes("Original kostenlos bei EUR-Lex"));
  assert(!html.includes("Bundespuls")); assert(!html.includes("Titel gekürzt"));
});
test("Andere Quellen bleiben ohne Zusatzmarkup und ohne erfundene Attribution", () => {
  assert.equal(api.renderSourceNotice(other), "");
  assert.equal(api.withSourceNotice("<a>unverändert</a>", other), "<a>unverändert</a>");
  for (const render of Object.values(renderers)) assert(!render(other).includes("source-notice"));
});
test("Herkunft bleibt an Artikel und bekannte Quellenkennung gebunden", () => {
  for (const source of [
    { ...bundespuls, sourceId: "fremde-quelle" },
    { ...bundespuls, itemUrl: "https://bundespuls.de/vorgang/999" },
    { ...bundespuls, sourceNotice: { ...bundespuls.sourceNotice, sourceId: "fremde-quelle" } },
    { ...bundespuls, sourceNotice: { ...bundespuls.sourceNotice, articleUrl: "https://example.org/vorgang/341273" } }
  ]) assert.equal(api.renderSourceNotice(source), "");
});
test("Widersprüchliche DTO-URLs können den sichtbaren Artikel nicht umetikettieren", () => {
  const foreign = "https://bundespuls.de/vorgang/999";
  assert(!api.lageSourceRow({ ...bundespuls, url: foreign }).includes("source-notice"));
  assert(!api.vsheetSourceRow({ ...bundespuls, url: foreign }).includes("source-notice"));
  assert(!api.renderOfficeDraftSources([{ ...bundespuls, href: foreign }]).includes("source-notice"));
  assert(!api.renderRadarArticleRow({ ...bundespuls, sourceUrl: foreign }).includes("source-notice"));
  assert(!api.renderHstandPrimary({ primaryItem: { ...bundespuls, sourceUrl: foreign } }).includes("source-notice"));
  assert(!api.sourceLink({ ...bundespuls, sourceId: "fremde-quelle" }).includes("source-notice"));
});
test("HTML-Inhalte werden als Text escaped, unsichere Original- und Lizenzlinks entfallen", () => {
  const attack = '<img src=x onerror="alert(1)">';
  const html = api.renderSourceNotice({ ...bundespuls, sourceNotice: { ...bundespuls.sourceNotice,
    text: attack, changes: attack, originalLabel: attack, originalUrl: "javascript:alert(1)", licenseUrl: "https://dip.bundestag.de.example.org/" } });
  assert(!html.includes("<img")); assert(html.includes("&lt;img")); assert(!html.includes("href="));
  for (const url of ["http://dip.bundestag.de", "https://name@dip.bundestag.de", "https://dip.bundestag.de:444/", "data:text/html,test"])
    assert(!api.renderSourceNotice({ ...bundespuls, sourceNotice: { ...bundespuls.sourceNotice, originalUrl: url, licenseUrl: null } }).includes("href="));
});
test("Qualitäts- und Relationslabels bleiben außerhalb des Herkunftshinweises unverändert", () => {
  const html = api.renderHstandPrimary({ primaryItem: bundespuls });
  assert(html.includes("Qualität"));
  assert(!api.renderSourceNotice(bundespuls).includes("Sicherheit"));
});
test("Heutiger Bundespuls-Abruf bleibt von unbekannter Veröffentlichung getrennt", () => {
  const retrievedAt = new Date().toISOString();
  const undated = { ...bundespuls, publishedAt: null, retrievedAt, dateLabel: "heute" };
  for (const [name, render] of Object.entries(renderers)) {
    const html = render(undated);
    assert(html.includes("Veröffentlichungsdatum unbekannt"), name);
    if (name === "Quellenbasis") assert(html.includes("Abgerufen heute"), name);
    else assert(!html.includes("heute"), name);
  }
  const ordinary = api.renderSourceBasis({ sources: [{ ...other, publishedAt: null, retrievedAt }] });
  assert(ordinary.includes("heute")); assert(!ordinary.includes("Abgerufen"));
  assert(!ordinary.includes("Veröffentlichungsdatum unbekannt"));
  const dated = { ...bundespuls, publishedAt: "2026-11-01T10:00:00Z", retrievedAt };
  assert(!api.sourceLink(dated).includes("Veröffentlichungsdatum unbekannt"));
  assert(!api.renderSourceBasis({ sources: [dated] }).includes("Abgerufen"));
  assert(!api.renderSourceNotice(eurlex).includes("Veröffentlichungsdatum unbekannt"));
});

console.log(`\n${passed}/${passed} UI-Prüfgruppen bestanden; kein Netz, keine DB, kein Modell.`);
if (process.argv.includes("--browser")) {
  const output = path.join(root, "tmp/parlamentsdaten-quellen-ui");
  fs.mkdirSync(output, { recursive: true });
  const htmlFile = path.join(output, "quellen.html");
  const markup = Object.entries(renderers).map(([name, render]) => `<section><h2>${name}</h2>${render(bundespuls)}</section>`).join("");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  fs.writeFileSync(htmlFile, `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><style>${css}</style><style>body{display:block;padding:16px;width:auto;min-width:0}section{margin-bottom:20px;min-width:0}h2{font-size:16px}</style></head><body>${markup}<script>
    try {
      const notices = [...document.querySelectorAll('.source-notice')];
      if (notices.length !== ${Object.keys(renderers).length}) throw Error('Quellenhinweis fehlt');
      for (const notice of notices) {
        if (notice.closest('a')) throw Error('Verschachtelter Anker');
        if (!notice.textContent.includes('Originaldaten kostenlos bei DIP')) throw Error('Originaldaten fehlen');
        if (!notice.getBoundingClientRect().height) throw Error('Hinweis unsichtbar');
        for (const a of notice.querySelectorAll('a')) {
          if (a.protocol !== 'https:' || a.target !== '_blank' || !a.relList.contains('noopener') || !a.relList.contains('noreferrer')) throw Error('Linkschutz fehlt');
        }
      }
      if (document.documentElement.scrollWidth > innerWidth + 1) throw Error('Mobile Breite überschritten');
      document.body.dataset.result='pass';
    } catch (error) { document.body.dataset.result='fail'; document.body.append(error.message); }
  </script></body></html>`);
  const result = spawnSync("unshare", ["--user", "--map-root-user", "--net", process.execPath, __filename,
    "--browser-inside", htmlFile, path.join(output, "quellen-mobile.png"), fs.readlinkSync("/proc/self/ns/net")],
  { cwd: root, encoding: "utf8", timeout: 45000, env: { PATH: process.env.PATH } });
  process.stdout.write(result.stdout || "");
  assert.equal(result.status, 0, result.stderr || String(result.error));
}
