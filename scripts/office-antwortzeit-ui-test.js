"use strict";

// Echte Clientfunktionen, ausschliesslich synthetische Fetch-Antworten und eine
// virtuelle Uhr. Kein Browser, Server, Datenbankzugriff oder bezahlter Modellcall.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../client.js"), "utf8");
function clientFunction(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert(start >= 0, `Echte Clientfunktion fehlt: ${name}`);
  const end = source.indexOf("\n}", start);
  assert(end > start, `Funktionsende fehlt: ${name}`);
  return source.slice(start, end + 2);
}
const functions = ["privateAccessContext", "privateAccessIsCurrent", "privateAccessChanged",
  "isPrivateApi", "assertPrivateMutationAllowed", "bindPrivateResponseBody", "guardPrivateResponse",
  "fetchWithTimeout", "prepareRequestOptions", "needsCsrfToken", "getCsrfToken",
  "decisionEntityId", "isValidDraft", "generateStatementWithBackend", "officeDraftCacheKey",
  "officeDraftKey", "officeDraftBinding", "officeDraftEntry", "loadOfficeDraftCache",
  "uiOfficeSelection", "draftProvenanceLabel", "officeCardStatus", "officeDraftFailure", "renderOfficeDraftDetail",
  "generateSelectedOfficeDraft", "shareOfficeDraft"];
const currentCode = functions.map(clientFunction).join("\n");
const officeTimeout = /},\s*options\.office\s*===\s*true\s*\?\s*60000\s*:\s*12000\s*\);/;
assert(officeTimeout.test(clientFunction("generateStatementWithBackend")), "Buero erwartet ausdruecklich 60s, andere Kommunikation weiterhin 12s");
// Negativkontrolle: Nur im VM-Quelltext zur alten 12s-Standardeinstellung
// zurueckkehren. Die Produktdatei wird weder geaendert noch neu geschrieben.
const baselineCode = currentCode.replace(officeTimeout, "});");
const flush = () => new Promise(resolve => setImmediate(resolve));
const TEXT = "Synthetischer quellengebundener Bueroauftrag, nur fuer diese Offlinepruefung.";

function fixture(latencyMs, baseline = false) {
  const origin = Date.parse("2026-11-11T08:00:00.000Z");
  let elapsed = 0, timerId = 0, timers = [], completed = 0;
  const requests = [], saved = [], shared = [], copied = [], views = [];
  const decision = { id: "rec-offline", vorgangId: "vorgang-offline", knowledgeObjectId: "ko-offline",
    title: "Synthetischer Anlass", decision: "Beobachten",
    sources: [{ url: "https://example.test/original", summary: "Synthetischer Originalauszug fuer diesen Anlass." }] };
  const format = { id: "intern", label: "Bueroauftrag", channel: "internal_line" };
  const schedule = (callback, delay) => {
    const id = ++timerId; timers.push({ id, at: elapsed + Number(delay), callback }); return id;
  };
  class VirtualDate extends Date {
    constructor(...args) { super(...(args.length ? args : [origin + elapsed])); }
    static now() { return origin + elapsed; }
  }
  const response = payload => ({ ok: true, status: 200, json: async () => structuredClone(payload), clone() { return response(payload); } });
  const s = { URL, Headers, Intl, Date: VirtualDate, Promise, Error, Proxy, Reflect, Set, Map,
    JSON, String, Number, Boolean, Array, Object, console,
    privateAccess: true, privateAccessGeneration: 1, mandateSwitchPending: false,
    activePoliticianId: "tenant-offline", profile: { id: "tenant-offline", communicationStyle: "sachlich" },
    briefing: { generatedAt: "2026-11-11T06:00:00.000Z" }, authState: { authenticated: true },
    selectedCommunicationChannel: "press", csrfTokenPromise: null, csrfTokenGeneration: -1,
    previewMode: false, currentView: "office-detail", decisions: [decision],
    selectedOfficeDraft: { decision, format, text: "" }, officeDrafts: {}, officeDraftErrors: {},
    officeDraftsGenerating: false, officeDraftGeneratingKey: "", officeShareFallbackKey: "",
    window: { location: { href: "https://app.example.test/" }, setTimeout: schedule,
      clearTimeout: id => { timers = timers.filter(timer => timer.id !== id); } },
    localStorage: { getItem: () => null, setItem: (key, value) => saved.push({ key, value }) },
    navigator: { share: async value => { shared.push(value); } },
    copyText: async text => copied.push(text), showToast: () => {},
    apiScopeQuery: () => `politicianId=${s.activePoliticianId}`,
    officeDecisions: () => s.decisions, activeOfficeFormats: () => [format],
    recommendedOfficeFormat: () => ({ format, reason: "Synthetischer Pruefauftrag" }),
    officeDraftSources: d => d.sources || [], renderOfficeDraftSources: () => "",
    uiIcon: () => "", escapeHtml: value => String(value), escapeAttribute: value => String(value),
    fetch: (url, options = {}) => {
      const pathname = new URL(url, s.window.location.href).pathname;
      const method = options.method || "GET"; requests.push({ pathname, method });
      if (pathname === "/api/security/csrf" && method === "GET") return Promise.resolve(response({ token: "offline-csrf" }));
      assert.equal(pathname, "/api/communication/generate", "Kein ungemockter Netzwerkweg");
      assert.equal(method, "POST");
      assert.equal(options.headers.get("X-CSRF-Token"), "offline-csrf");
      return new Promise(resolve => schedule(() => { ++completed;
        resolve(response({ aiEnabled: true, degraded: false, text: TEXT, channel: format.channel }));
      }, latencyMs));
    }
  };
  // Nur der Renderadapter ist reduziert: dieselbe echte Cacheauswahl und echte
  // Detailfunktion zeigen den vom asynchronen Generator erreichten Zustand.
  s.render = () => {
    if (s.selectedOfficeDraft) s.selectedOfficeDraft = s.uiOfficeSelection(s.selectedOfficeDraft.decision, s.selectedOfficeDraft.format);
    views.push(s.renderOfficeDraftDetail());
  };
  vm.createContext(s); vm.runInContext(baseline ? baselineCode : currentCode, s, { filename: "client.js:office-antwortzeit" });
  return { s, decision, format, requests, saved, shared, copied, views,
    postCount: () => requests.filter(r => r.method === "POST").length,
    completed: () => completed,
    async start() { const pending = s.generateSelectedOfficeDraft(); await flush(); return { pending }; },
    async advance(to) {
      assert(to >= elapsed, "Virtuelle Zeit laeuft nur vorwaerts");
      await flush();
      while (timers.some(timer => timer.at <= to)) {
        timers.sort((a, b) => a.at - b.at || a.id - b.id);
        const timer = timers.shift(); elapsed = timer.at; timer.callback(); await flush();
      }
      elapsed = to; await flush();
    }
  };
}
function noPublishedDraft(f) {
  assert.equal(Object.keys(f.s.officeDrafts).length, 0);
  assert.equal(f.saved.length, 0);
  assert(!f.views.some(html => html.includes("data-office-share") || html.includes("KI-Entwurf · Prüfen")));
  assert.equal(f.shared.length, 0); assert.equal(f.copied.length, 0);
}
let passed = 0;
async function test(name, body) { await body(); ++passed; console.log(`PASS ${name}`); }
(async () => {
  await test("Negativkontrolle: Alter 12s-Client verwirft die erfolgreiche 15s-Antwort", async () => {
    const f = fixture(15000, true), { pending } = await f.start();
    await f.advance(12001); await pending;
    assert.equal(f.s.officeDraftErrors[f.s.officeDraftKey(f.decision, f.format)], "ki-fehler");
    await f.advance(15001);
    assert.equal(f.completed(), 1); assert.equal(f.postCount(), 1); noPublishedDraft(f);
  });
  for (const latency of [3000, 15000, 59999]) await test(`Bueroerfolg nach ${latency}ms wird genau einmal angezeigt und gespeichert`, async () => {
    const f = fixture(latency), { pending } = await f.start();
    const during = Math.min(12001, latency - 1); await f.advance(during);
    assert.equal(f.postCount(), 1); assert.equal(f.s.officeDraftsGenerating, true);
    assert.equal(f.s.officeCardStatus(f.decision, f.format), "Wird vorbereitet");
    await f.s.generateSelectedOfficeDraft(); await f.s.generateSelectedOfficeDraft();
    assert.equal(f.postCount(), 1, "Weitere Klicks starten waehrend der Wartezeit keinen zweiten kostenpflichtigen Auftrag");
    await f.advance(latency + 1); await pending;
    assert.equal(f.completed(), 1); assert.equal(f.postCount(), 1);
    assert.equal(f.s.officeDraftEntry(f.decision, f.format).text, TEXT); assert.equal(f.saved.length, 1);
    assert.equal(f.s.officeCardStatus(f.decision, f.format), "Entwurf bereit");
    assert(f.views.at(-1).includes("data-office-share"));
    await f.s.shareOfficeDraft(); assert.equal(f.shared.length, 1); assert.equal(f.shared[0].text, TEXT);
  });
  await test("Nach 60s ehrlicher Fehler; spaeterer Erfolg erzeugt weder Fertigmeldung noch automatischen Retry", async () => {
    const f = fixture(61000), { pending } = await f.start();
    await f.advance(60001); await pending;
    assert.equal(f.postCount(), 1); assert.equal(f.s.officeDraftsGenerating, false);
    assert.equal(f.s.officeCardStatus(f.decision, f.format), "Erstellung fehlgeschlagen");
    assert(f.views.at(-1).includes("Der Entwurf konnte nicht belastbar erstellt werden"));
    assert(f.views.at(-1).includes("data-office-generate"));
    await f.s.shareOfficeDraft(); noPublishedDraft(f);
    await f.advance(120000);
    assert.equal(f.completed(), 1); assert.equal(f.postCount(), 1); noPublishedDraft(f);
  });
  const changes = [
    ["Profilinhalt", f => { f.s.profile = { ...f.s.profile, communicationStyle: "anderer synthetischer Stil" }; }],
    ["Mandant", f => { ++f.s.privateAccessGeneration; f.s.activePoliticianId = "tenant-other";
      f.s.profile = { id: "tenant-other" }; f.s.selectedOfficeDraft = null; f.s.decisions = []; }],
    ["Sitzung", f => { ++f.s.privateAccessGeneration; f.s.privateAccess = false; f.s.selectedOfficeDraft = null; }],
    ["Anlassinhalt", f => { f.s.decisions = [{ ...f.decision, title: "Geaenderter synthetischer Sachstand" }];
      f.s.selectedOfficeDraft = { decision: f.s.decisions[0], format: f.format, text: "" }; }],
    ["Anlass entfaellt", f => { f.s.decisions = []; f.s.selectedOfficeDraft = null; }]
  ];
  for (const [name, change] of changes) await test(`${name} wechselt waehrend 15s-Wartezeit: kein alter oder fremder Text`, async () => {
    const f = fixture(15000), { pending } = await f.start();
    await f.advance(13000); change(f); await f.advance(15001); await pending;
    assert.equal(f.completed(), 1); assert.equal(f.postCount(), 1);
    assert.equal(Object.keys(f.s.officeDraftErrors).length, 0);
    await f.s.shareOfficeDraft(); noPublishedDraft(f);
  });
  await test("Andere Kommunikation behaelt 12s und startet bei Timeout keinen zweiten Auftrag", async () => {
    const f = fixture(15000);
    const pending = f.s.generateStatementWithBackend("Synthetischer Prompt", f.decision, "press", { office: false });
    const outcome = pending.then(() => ({ ok: true }), error => ({ error }));
    await f.advance(12001);
    assert.match((await outcome).error.message, /Zeitüberschreitung/);
    await f.advance(15001); assert.equal(f.completed(), 1); assert.equal(f.postCount(), 1); noPublishedDraft(f);
  });
  console.log(`${passed}/${passed} Buero-Antwortzeit-UI-Gruppen bestanden. Nur virtuelle Zeit, kein externes Netz.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
