"use strict";

// Offline-Test der Erstkonfiguration (Onboarding-Flow in client.js). Lädt client.js
// in einer vm-Sandbox (KEIN echtes DOM, KEIN Netz) — dieselbe Technik wie
// onboarding-tenant-test.js — und prüft:
//  - Gate shouldRunOnboarding() (Status/Rolle/Vorschau)
//  - Vollbild-Container .onboarding-handoff (gescoptes Design-System)
//  - Copy & Zustände je Screen (Begrüßung/Identität/Bestätigen/…): „Du"-Ansprache,
//    Lade-/Fehler-/Mehrdeutig-/Landtag-/Consent-Zustände
//  - Feld -> internes camelCase-Profil (onbDraftToProfilePayload) mit den am
//    Mapper verifizierten Namen (reportingTopics/opportunityTopics/privacyConfirmedAt)
//  - Adaptivität (onbStepVisible) je Kontotyp

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");
let codeVm = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");

const noop = () => {};
const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
  addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
  setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
  contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
  textContent: "", value: "", offsetParent: null });

// App-Knoten, der die zuletzt gesetzte innerHTML festhält (für Markup-Prüfungen).
const appNode = Object.assign(fakeNode(), { _html: "" });
Object.defineProperty(appNode, "innerHTML", { get() { return this._html; }, set(v) { this._html = String(v); } });

const storageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
const sandbox = {
  console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
  document: { querySelector: (sel) => (sel === "#app" ? appNode : fakeNode()), querySelectorAll: () => [],
    getElementById: () => fakeNode(), createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop, cookie: "",
    visibilityState: "visible", hidden: false },
  navigator: { userAgent: "node-test", language: "de-DE", onLine: true, sendBeacon: noop },
  localStorage: storageStub, sessionStorage: storageStub,
  location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost", reload: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  fetch: () => Promise.reject(new Error("no-net-in-test")),
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  performance: { now: () => 0 },
  atob: (s) => Buffer.from(s, "base64").toString("binary"), btoa: (s) => Buffer.from(s, "binary").toString("base64")
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;

// Test-Brücke: Zugriff auf die internen Flow-Funktionen/-State ohne Prod-Hooks.
codeVm += `\n;globalThis.__onb = {
  gate: () => shouldRunOnboarding(),
  setAuth: (a, u) => { authState = a; currentUser = u; },
  setProfile: (p) => { profile = p; },
  setPreview: (v) => { previewMode = v; },
  setPid: (v) => { activePoliticianId = v; },
  setDraft: (d) => { onboardingDraft = d; },
  setUi: (u) => { onboardingUi = u; },
  seed: () => { onbSeedDraftFromProfile(); },
  draft: () => onboardingDraft,
  payload: () => onbDraftToProfilePayload(),
  renderStep: (n) => { onboardingActive = true; onboardingStep = n; renderOnboardingFlow(); return document.querySelector("#app").innerHTML; },
  stepBody: (n) => { const s = onbRenderStep(n); return (s.full || "") + (s.body || "") + (s.action || ""); },
  stepVisible: (n) => onbStepVisible(n),
  parliament: () => onbParliament()
};`;

vm.createContext(sandbox);
vm.runInContext(codeVm, sandbox, { filename: "client.js" });
const onb = sandbox.__onb;

// Standard-Setup: Account-Modus, Abgeordneter.
onb.setAuth({ authenticated: true }, { role: "abgeordneter" });
onb.setPid("mandat-test");

// ── 1) Gate ───────────────────────────────────────────────────────────────
onb.setProfile({ id: "x", onboardingStatus: "neu" });
onb.setPreview(false);
check("Gate: Status 'neu' -> Onboarding fällig", onb.gate() === true);
onb.setProfile({ id: "x", onboardingStatus: "in_bearbeitung" });
check("Gate: Status 'in_bearbeitung' -> fällig (Wiederaufnahme)", onb.gate() === true);
onb.setProfile({ id: "x", onboardingStatus: "abgeschlossen" });
check("Gate: Status 'abgeschlossen' -> NICHT fällig", onb.gate() === false);
onb.setProfile({ id: "x", onboardingStatus: "neu" });
onb.setPreview(true);
check("Gate: Vorschau-Modus -> nie Onboarding", onb.gate() === false);
onb.setPreview(false);
onb.setAuth({ authenticated: true }, { role: "admin" });
check("Gate: Admin-Rolle -> kein Onboarding", onb.gate() === false);
onb.setAuth(null, null);
check("Gate: Legacy/Pilot (kein Account-Modus) -> kein Onboarding", onb.gate() === false);
onb.setAuth({ authenticated: true }, { role: "abgeordneter" });

// ── 2) Vollbild-Container + Begrüßung/Identität ──────────────────────────────
onb.setProfile({ id: "x", onboardingStatus: "neu", fullName: "" });
onb.seed();
const welcome = onb.renderStep(0);
check("Container: gescoptes .onboarding-handoff", welcome.includes("onboarding-handoff") && welcome.includes('id="onbRoot"'));
check("S0 Begruessung: Hallo + Ich-Form", welcome.includes(">Hallo.<") && welcome.includes("Ich bin Helmut"));
const identity = onb.renderStep(1);
check("S1 Identitaet: Wie heisst du + leeres Namensfeld", identity.includes("Wie heißt du?") && identity.includes('data-onb-input="fullName"'));
check("S1: Du-Ansprache (Sag mir deinen Namen)", identity.includes("Sag mir deinen Namen"));

// ── 3) Scan (Lade-Zustand) ───────────────────────────────────────────────────
onb.setUi({ scanPhase: 2, lookup: { status: "loading", candidates: [], warnings: [] }, saving: false, editMandate: false, error: "" });
const scan = onb.stepBody(2);
check("S2 Erkennung: Spinner + Quell-Checkliste (Abgeordnetenwatch)", scan.includes("ho-scan") && scan.includes("Abgeordnetenwatch") && scan.includes("Ausschuss-Zuordnung"));

// ── 4) Bestätigen: gefunden / mehrdeutig / Quelle down / Landtag ─────────────
onb.setUi({ scanPhase: 3, lookup: { status: "found", candidates: [], warnings: [] }, saving: false, editMandate: false, error: "" });
onb.setDraft(Object.assign(onb.draft(), { fullName: "Beispiel Person", party: "SPD", parliamentType: "Bundestag", constituency: "Musterkreis", committees: ["Gesundheit"] }));
const confirm = onb.stepBody(3);
check("S3 gefunden: Bist du das + Quellenhinweis", confirm.includes("Bist du das?") && confirm.includes("Abgeordnetenwatch"));
check("S3 gefunden: Ja-das-bin-ich + Etwas-stimmt-nicht", confirm.includes("Ja, das bin ich") && confirm.includes("Etwas stimmt nicht"));

onb.setUi({ scanPhase: 3, lookup: { status: "ambiguous", candidates: [{ id: "1", name: "A Person", party: "SPD" }, { id: "2", name: "B Person", party: "CDU/CSU" }], warnings: [] }, saving: false, editMandate: false, error: "" });
const ambiguous = onb.stepBody(3);
check("S3 mehrdeutig: Auswahlliste (Welche/r bist du?)", ambiguous.includes("Welche/r bist du?") && ambiguous.includes('data-onb-pick="1"'));

onb.setUi({ scanPhase: 3, lookup: { status: "source_down", candidates: [], warnings: [] }, saving: false, editMandate: false, error: "" });
const down = onb.stepBody(3);
check("S3 Quelle down: Retry + manueller Pfad", down.includes("nicht erreichbar") && down.includes("Erneut versuchen"));

onb.setUi({ scanPhase: 3, lookup: { status: "found", candidates: [], warnings: ["landtag-quellen-im-aufbau"] }, saving: false, editMandate: false, error: "" });
onb.setDraft(Object.assign(onb.draft(), { parliamentType: "Landtag", state: "Niedersachsen" }));
const landtag = onb.stepBody(3);
check("S3 Landtag: transparenter Vorbehalt (Quellen im Aufbau)", /Landtag erkannt/.test(landtag) && /baue ich gerade aus|im Aufbau/.test(landtag));

// ── 5) Datenschutz-Consent-Gate (S10) ────────────────────────────────────────
onb.setDraft(Object.assign(onb.draft(), { consent: false }));
const privacyOff = onb.stepBody(10);
check("S10 Datenschutz: Weiter-Button gesperrt ohne Zustimmung", privacyOff.includes("is-disabled") && privacyOff.includes("Zustimmen &amp; weiter"));
onb.setDraft(Object.assign(onb.draft(), { consent: true }));
const privacyOn = onb.stepBody(10);
check("S10: Zustimmung an -> Weiter-Button frei", !/ho-btn is-disabled/.test(privacyOn) && privacyOn.includes("is-on"));

// ── 6) Feld -> internes camelCase-Profil (verifizierte Namen) ────────────────
onb.setProfile({ id: "mandat-test", onboardingStatus: "neu" });
onb.seed();
onb.setDraft(Object.assign(onb.draft(), {
  fullName: "Test Abgeordnete", party: "Die Linke", faction: "Die Linke", parliamentType: "Bundestag",
  constituency: "Salzgitter", state: "Niedersachsen", location: "Salzgitter",
  committees: ["Arbeit und Soziales"], deputyCommittees: ["Gesundheit"], reportingTopics: ["Sprecher/in der Fraktion"],
  focusTopics: ["Rente & Alterssicherung"], currentCampaigns: ["Rentenpaket"], regionalInterests: ["Stahlwerk"],
  relevantMinistries: ["BMAS — Arbeit & Soziales"], monitoringTargets: ["DGB"], localMedia: ["Lokalzeitung"],
  communicationStyle: "Nahbar & klar", communicationDirectness: "Ausgewogen", communicationLength: "Mittel",
  preferredChannels: ["Pressemitteilung"], noGoTopics: ["Migration"]
}));
const pl = onb.payload();
check("Mapping: fullName", pl.fullName === "Test Abgeordnete");
check("Mapping: party/faction", pl.party === "Die Linke" && pl.faction === "Die Linke");
check("Mapping: parliamentType -> politicalLevel Bund", pl.parliamentType === "Bundestag" && pl.politicalLevel === "Bund");
check("Mapping: committees[] + deputyCommittees[]", pl.committees.includes("Arbeit und Soziales") && pl.deputyCommittees.includes("Gesundheit"));
check("Mapping: reportingTopics (NICHT rapporteurTopics)", Array.isArray(pl.reportingTopics) && pl.reportingTopics.includes("Sprecher/in der Fraktion") && !("rapporteurTopics" in pl));
check("Mapping: focusTopics[]", pl.focusTopics.includes("Rente & Alterssicherung"));
check("Mapping: currentCampaigns[]", pl.currentCampaigns.includes("Rentenpaket"));
check("Mapping: constituency/state/location", pl.constituency === "Salzgitter" && pl.state === "Niedersachsen" && pl.location === "Salzgitter");
check("Mapping: relevantMinistries/monitoringTargets/localMedia", pl.relevantMinistries.length === 1 && pl.monitoringTargets.includes("DGB") && pl.localMedia.includes("Lokalzeitung"));
check("Mapping: communicationStyle + preferredChannels + noGoTopics", pl.communicationStyle === "Nahbar & klar" && pl.preferredChannels.includes("Pressemitteilung") && pl.noGoTopics.includes("Migration"));
check("Mapping: KEIN chanceTopics-Feld (heißt opportunityTopics)", !("chanceTopics" in pl));

// ── 7) Adaptivität je Kontotyp ───────────────────────────────────────────────
onb.setDraft(Object.assign(onb.draft(), { accountType: "abgeordneter" }));
check("Adaptiv: Abgeordneter sieht Mandat/Ausschuss/Region", onb.stepVisible(3) && onb.stepVisible(4) && onb.stepVisible(6));
onb.setDraft(Object.assign(onb.draft(), { accountType: "ministerium" }));
check("Adaptiv: Ministerium blendet Mandat/Ausschuss/Region aus", !onb.stepVisible(3) && !onb.stepVisible(4) && !onb.stepVisible(6) && onb.stepVisible(5));

console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Onboarding-Flow-Assertions`);
process.exit(fail > 0 ? 1 : 0);
