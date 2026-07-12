"use strict";

// QA Final Master Release-Stabilisierung — Regressionstest fuer zwei sichere Pilot-Fixes:
//   1) /api/release/public darf den KI-Modellnamen NICHT an anonyme Aufrufer preisgeben.
//   2) client.js formatDueDate() darf NIE "Invalid Date" ausliefern (landet in
//      kopierbaren Buero-Texten/E-Mails).
// KEIN Netz, KEINE KI, KEINE Mutation.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
let pass = 0;
function check(label, cond, extra = "") {
  if (cond) { pass++; console.log("PASS ", label); }
  else { console.error("FAIL ", label, extra); process.exitCode = 1; }
}

// --- 1) /api/release/public: kein Modellname/Vendor-Detail im OpenAI-Check ----------
const server = require(path.join(root, "server.js"));
assert(typeof server.__publicReleasePayload === "function", "Test-Hook __publicReleasePayload fehlt");

// Realistischer Release-Input MIT aktivem OpenAI-Check (so wie releaseCheck ihn baut,
// wenn OpenAI aktiv ist: `Modell <model> aktiv.`).
const releaseWithModel = {
  status: "Pitchbereit",
  ready: true,
  score: 100,
  checkedAt: "2026-07-11T05:00:00.000Z",
  checks: [
    { label: "Supabase", ok: true, detail: "Persistenter Speicher aktiv." },
    { label: "OpenAI", ok: true, detail: "Modell gpt-5.5 aktiv." },
    { label: "Briefing", ok: true, detail: "2 Entscheidungen, 3 Empfehlungen." }
  ],
  // liveFlow spiegelt den echten releaseLiveFlow: der Statement-Schritt nennt nur den
  // Vendor-Status ("OpenAI aktiv."), NIE den Modellnamen. Der Modellname taucht real
  // ausschliesslich im OpenAI-Check (oben) auf — genau dort greift die Redaktion.
  liveFlow: { ready: true, summary: "7/7 Live-Schritte gruen.", steps: [
    { label: "Statement generieren", ok: true, detail: "OpenAI aktiv." }
  ] },
  blockers: [],
  warnings: []
};

const pub = server.__publicReleasePayload(releaseWithModel);
const serialized = JSON.stringify(pub);

check("Public-Payload verraet KEINEN Modellnamen (gpt-5.5)", !/gpt-5\.5/i.test(serialized), serialized.slice(0, 200));
check("Public-Payload verraet KEINEN generischen Modell-String ('Modell ... aktiv')", !/Modell\s+\S+\s+aktiv/i.test(serialized), serialized);
const openaiCheck = (pub.checks || []).find((c) => c.label === "OpenAI");
check("OpenAI-Check bleibt vorhanden (Monitoring-Nutzen erhalten)", Boolean(openaiCheck));
check("OpenAI-Check zeigt nur neutralen Aktiv-Status", openaiCheck && openaiCheck.detail === "aktiv.", openaiCheck && openaiCheck.detail);
check("OpenAI-Check behaelt ok-Flag", openaiCheck && openaiCheck.ok === true);
// Andere Checks bleiben unveraendert (keine Ueberkorrektur).
const supa = (pub.checks || []).find((c) => c.label === "Supabase");
check("Nicht-OpenAI-Check bleibt unveraendert", supa && supa.detail === "Persistenter Speicher aktiv.");

// Inaktiver Fall: darf ebenfalls keinen Modellnamen tragen und muss ehrlich 'nicht aktiv.' sein.
const releaseInactive = JSON.parse(JSON.stringify(releaseWithModel));
releaseInactive.checks[1] = { label: "OpenAI", ok: false, detail: "OpenAI ist nicht aktiv." };
const pubInactive = server.__publicReleasePayload(releaseInactive);
const openaiInactive = pubInactive.checks.find((c) => c.label === "OpenAI");
check("OpenAI inaktiv -> ehrlicher Status 'nicht aktiv.'", openaiInactive && openaiInactive.detail === "nicht aktiv." && openaiInactive.ok === false);

// --- 2) client.js formatDueDate(): nie "Invalid Date" -------------------------------
function loadFormatDueDate() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  // Auto-Start-Aufrufe am Dateiende kappen (wie in den bestehenden *-ui-tests).
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += "\n;globalThis.__qa = { formatDueDate: (v) => formatDueDate(v) };";
  // Browser-Stubs im Stil der bestehenden *-ui-tests (vollstaendiger fakeNode, damit
  // Modul-Init wie applyThemePref/watchSystemTheme nicht crasht). KEIN Netz, KEINE KI.
  const noop = () => {};
  const fakeNode = () => ({
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    matches: () => false, set innerHTML(_v) {}, get innerHTML() { return ""; },
    textContent: "", value: "", offsetParent: null
  });
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop
  };
  const mediaQuery = { matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop };
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const sandbox = {
    document: doc,
    navigator: { serviceWorker: { register() { return { then() { return { catch: noop }; }, catch: noop }; } }, userAgent: "node" },
    localStorage: storage, sessionStorage: storage,
    matchMedia: () => mediaQuery,
    location: { href: "http://localhost/", pathname: "/", search: "", hash: "", reload: noop },
    Intl, Date, JSON, Math, console, URL,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    fetch: () => Promise.reject(new Error("no-net")),
    addEventListener: noop, removeEventListener: noop
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  return sandbox.__qa.formatDueDate;
}

const formatDueDate = loadFormatDueDate();
for (const bad of [undefined, null, "", "not-a-date", "0000", NaN, {}]) {
  const out = formatDueDate(bad);
  check(`formatDueDate(${JSON.stringify(bad)}) != 'Invalid Date'`, out !== "Invalid Date" && !/invalid/i.test(String(out)), String(out));
}
// Gueltiges Datum wird weiterhin formatiert (kein Ueberkorrigieren).
const good = formatDueDate("2026-07-11T09:30:00.000Z");
check("formatDueDate(gueltig) formatiert normal (enthaelt Ziffern/Punkt)", /\d/.test(good) && good !== "zeitnah", good);

console.log(`\n${pass} QA-Stabilisierungs-Checks bestanden.`);
