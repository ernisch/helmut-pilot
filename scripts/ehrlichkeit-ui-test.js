"use strict";

// Echte Clienthandler im isolierten DOM/Fetch-Modell. Kein Server, Store oder Netz.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function client() {
  const noop = () => {};
  const selectors = new Map();
  const requests = [];
  let reply = async () => ({ ok: true, json: async () => ({ id: "saved-ui-entry" }) });
  const node = () => ({
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    style: {}, dataset: {}, textContent: "", innerHTML: "", value: "",
    addEventListener: noop, removeEventListener: noop, setAttribute: noop,
    removeAttribute: noop, getAttribute: () => null, querySelector: () => null,
    querySelectorAll: () => [], appendChild: noop, focus: noop, blur: noop,
    closest: () => null, contains: () => false, getBoundingClientRect: () => ({ top: 0 }),
  });
  const app = node();
  app.querySelectorAll = (s) => selectors.get(s) || [];
  const toast = node();
  const storage = { getItem: () => null, setItem: noop, removeItem: noop };
  const sandbox = {
    console: { warn: noop, error: noop, log: noop }, Intl, Date, Math, JSON,
    Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    URL, URLSearchParams, encodeURIComponent, decodeURIComponent,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    queueMicrotask: (f) => Promise.resolve().then(f),
    document: {
      querySelector: (s) => s === "#toast" ? toast : app,
      querySelectorAll: () => [], getElementById: () => node(),
      createElement: node, createDocumentFragment: node,
      documentElement: node(), body: node(), cookie: "", visibilityState: "visible",
      addEventListener: noop, removeEventListener: noop,
    },
    navigator: { userAgent: "ui-test", language: "de-DE", onLine: true },
    localStorage: storage, sessionStorage: storage,
    location: { search: "", hash: "", pathname: "/", href: "http://localhost/", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    fetch: () => { throw new Error("Netz im UI Test verboten"); },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 }, addEventListener: noop, removeEventListener: noop,
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let source = fs.readFileSync(path.join(__dirname, "..", "client.js"), "utf8");
  source = source.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  source += `
    let uiRenders = 0, uiLoads = 0;
    render = () => { uiRenders++; };
    loadBriefing = async () => { uiLoads++; };
    fetchWithTimeout = (...args) => globalThis.uiFetch(...args);
    profile = { id: "ui-profile", fullName: "UI Testprofil" };
    activePoliticianId = "ui-profile";
    const uiDecision = { id: "ui-decision", title: "UI Testvorgang", status: "open" };
    decisions = [uiDecision]; tasks = [];
    globalThis.ui = {
      bind: bindActions, finish: finishOnboarding,
      log: (decision = uiDecision) => logDecisionInteraction("marked_relevant", decision),
      learning: learningSummary,
      onboarding: (step) => { onboardingActive = true; onboardingStep = step; return renderOnboarding(); },
      state: () => ({ decision: uiDecision, tasks, profile, loads: uiLoads, renders: uiRenders }),
      preview: () => { previewMode = true; },
    };`;
  sandbox.uiFetch = async (url, options = {}) => {
    requests.push({ url, options });
    return reply(url, options);
  };
  vm.runInContext(source, sandbox, { filename: "client.js" });
  return {
    ...sandbox.ui, requests, toast,
    reply: (value) => { reply = value; },
    button: (selector, dataset = {}) => {
      const button = node(); button.dataset = dataset; button.textContent = "Prüfen";
      button.addEventListener = (event, handler) => { if (event === "click") button.click = handler; };
      selectors.set(selector, [button]); sandbox.ui.bind(); return button;
    },
  };
}

const response = (ok, body) => async () => ({ ok, status: ok ? 200 : 500, json: async () => body });
const networkError = async () => { throw new Error("UI Testnetzfehler"); };
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`PASS  ${name}`); }

(async () => {
  for (const [name, reply] of [
    ["HTTP Fehler", response(false, { error: "Fehler" })],
    ["Netzfehler", networkError],
    ["fehlende Speicherbestätigung", response(true, {})],
    ["ungültiges JSON", async () => ({ ok: true, json: async () => { throw new Error("JSON"); } })],
  ]) {
    await test(`Feedback ${name}: kein Erfolg und keine lokale Statusänderung`, async () => {
      const ui = client(); ui.reply(reply);
      await ui.button("[data-feedback]", { feedback: "ignored", feedbackId: "ui-decision" }).click();
      assert.equal(ui.toast.textContent, "Rückmeldung nicht gespeichert");
      assert.equal(ui.state().decision.status, "open");
      assert.equal(ui.state().decision.feedback, undefined);
    });
  }
  for (const [value, status, message] of [
    ["ignored", "ignored", "Als nicht relevant gespeichert"],
    ["later", "snoozed", "Für später vermerkt"],
    ["done", "done", "Als erledigt gespeichert"],
    ["relevant", "relevant", "Als relevant gespeichert"],
  ]) {
    await test(`Feedback ${value}: bestätigter Erfolg`, async () => {
      const ui = client();
      await ui.button("[data-feedback]", { feedback: value, feedbackId: "ui-decision" }).click();
      assert.equal(ui.toast.textContent, message);
      assert.equal(ui.state().decision.status, status);
      assert.equal(ui.requests.length, 1);
    });
  }
  await test("Feedback bleibt bis zur Serverbestätigung unverändert", async () => {
    const ui = client(); let resolve;
    ui.reply(() => new Promise((r) => { resolve = r; }));
    const pending = ui.button("[data-feedback]", { feedback: "done", feedbackId: "ui-decision" }).click();
    assert.equal(ui.state().decision.status, "open");
    assert.equal(ui.toast.textContent, "");
    resolve({ ok: true, json: async () => ({ id: "confirmed" }) });
    await pending;
    assert.equal(ui.state().decision.status, "done");
  });
  await test("Fehlender Vorgang und Vorschau bestätigen keine Speicherung", async () => {
    const ui = client(); assert.equal(await ui.log(null), false);
    ui.preview(); assert.equal(await ui.log(), false); assert.equal(ui.requests.length, 0);
  });
  for (const [selector, key] of [["[data-lage-done]", "lageDone"], ["[data-lage-ignore]", "lageIgnore"]]) {
    await test(`${key}: fehlgeschlagene Rückmeldung lässt Vorgang unverändert`, async () => {
      const ui = client(); ui.reply(response(false, {}));
      await ui.button(selector, { [key]: "ui-decision" }).click();
      assert.equal(ui.state().decision.status, "open");
      assert.equal(ui.toast.textContent, "Rückmeldung nicht gespeichert");
    });
  }
  for (const [name, reply] of [["HTTP Fehler", response(false, {})], ["Netzfehler", networkError], ["leere Antwort", response(true, null)]]) {
    await test(`Onboarding ${name}: keine Erfolgsmeldung`, async () => {
      const ui = client(); ui.reply(reply); await ui.finish(false);
      assert.equal(ui.toast.textContent, "Profil konnte nicht gespeichert werden");
      assert.equal(ui.state().profile.id, "ui-profile");
    });
  }
  for (const skip of [false, true]) {
    await test(`Onboarding ${skip ? "Später" : "Fertig"}: Serverbestätigung`, async () => {
      const ui = client(); ui.reply(response(true, { id: "ui-profile", saved: true }));
      await ui.finish(skip); assert.equal(ui.state().profile.saved, true);
      assert.equal(ui.toast.textContent, skip ? "Du kannst dein Profil jederzeit in den Einstellungen ergänzen." : "Profil gespeichert");
    });
  }
  for (const [name, reply] of [["HTTP Fehler", response(false, {})], ["Netzfehler", networkError], ["fehlende ID", response(true, {})]]) {
    await test(`Delegieren ${name}: keine Task und kein Erfolgslog`, async () => {
      const ui = client(); ui.reply(reply);
      await ui.button("[data-lage-delegate]", { lageDelegate: "ui-decision" }).click();
      assert.equal(ui.state().tasks.length, 0);
      assert.equal(ui.toast.textContent, "Konnte nicht delegiert werden");
      assert.equal(ui.requests.length, 1);
    });
  }
  await test("Delegieren: gespeicherte Task bestätigt Erfolg", async () => {
    const ui = client(); await ui.button("[data-lage-delegate]", { lageDelegate: "ui-decision" }).click();
    assert.equal(ui.state().tasks[0].id, "saved-ui-entry");
    assert.equal(ui.toast.textContent, "An Büro delegiert");
    assert.equal(ui.requests.length, 2);
  });
  for (const [name, body, message, loads] of [
    ["Timeout", { ok: false, reason: "pipeline-run-timeout" }, "Prüfung nicht abgeschlossen – letzter Stand bleibt sichtbar", 0],
    ["übersprungen", { skippedReason: "gerade geprüft" }, "Letzter Lauf wird genutzt", 1],
    ["Erfolg", { ok: true }, "Helmut ist aktualisiert", 1],
  ]) {
    await test(`Quellenlauf ${name}: ehrlicher Abschluss`, async () => {
      const ui = client(); ui.reply(response(true, body)); const button = ui.button("[data-run-crawl]");
      await button.click(); assert.equal(ui.toast.textContent, message); assert.equal(ui.state().loads, loads);
      if (!loads) { assert.equal(button.disabled, false); assert.equal(button.textContent, "Prüfen"); }
    });
  }
  for (const [name, reply] of [["HTTP Fehler", response(false, {})], ["Netzfehler", networkError]]) {
    await test(`Quellenlauf ${name}: Button wieder benutzbar`, async () => {
      const ui = client(); ui.reply(reply); const button = ui.button("[data-run-crawl]");
      await button.click(); assert.equal(button.disabled, false);
      assert.equal(ui.toast.textContent, "Prüfung konnte nicht gestartet werden"); assert.equal(ui.state().loads, 0);
    });
  }
  for (const [name, reply, message, loads] of [
    ["Timeout", response(true, { ok: false }), "Prüfung nicht abgeschlossen.", 0],
    ["übersprungen", response(true, { skippedReason: "gerade geprüft" }), "Gerade erst geprüft – letzter Lauf gilt.", 1],
    ["Erfolg", response(true, {}), "Quellen geprüft.", 1],
    ["HTTP Fehler", response(false, {}), "Prüfung konnte nicht gestartet werden.", 0],
    ["Netzfehler", networkError, "Prüfung konnte nicht gestartet werden.", 0],
  ]) {
    await test(`Radar ${name}: Quellenprüfung korrekt benannt`, async () => {
      const ui = client(); ui.reply(reply); const button = ui.button("[data-radar-search]");
      await button.click(); assert.equal(button.textContent, message); assert.equal(ui.state().loads, loads);
    });
  }
  await test("Lage Check HTTP Fehler meldet keine stabile Priorität", async () => {
    const ui = client(); ui.reply(response(false, {})); await ui.button("[data-run-lage-check]").click();
    assert.equal(ui.toast.textContent, "Lage-Check konnte nicht gestartet werden");
  });
  await test("Rückmeldungsbeschreibung übernimmt keine Priorisierungsbehauptung", () => {
    const ui = client(); assert.equal(ui.learning({}), "Noch keine Rückmeldungen gespeichert.");
    const text = ui.learning({ eventCount: 7, summary: "höher priorisiert" });
    assert.match(text, /7 Rückmeldungen gespeichert/); assert.match(text, /Priorisierung ändern sie derzeit nicht/);
    assert.ok(!text.includes("höher priorisiert"));
  });
  await test("Onboardingtexte erklären Profil und angebotene Büroentwürfe", () => {
    const ui = client(); assert.match(ui.onboarding(0), /Das dauert etwa zwei Minuten/);
    assert.match(ui.onboarding(5), /Welche Entwürfe soll Helmut dir im Büro anbieten/);
    assert.match(ui.onboarding(6), /wird dein Profil gespeichert/);
  });
  console.log(`\n${passed}/${passed} UI Ehrlichkeitsfälle erfolgreich.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
