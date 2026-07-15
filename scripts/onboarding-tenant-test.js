"use strict";

// Sprint 6 (Audit-Fix 2026-07): Tenant-Härtung + Onboarding-Freigabe + Doku-Wahrheit.
// KEIN Netz, KEINE echte DB (lokaler Datei-Store mit Snapshot/Restore).
// FRÜHERE FEHLER:
//   1. Weiche Blob-Filter ('!politicianId ||') gaben ohne Mandanten-Kontext ALLE
//      Zeilen zurück — potenzielles Cross-Tenant-Leak (RLS ist inert).
//   2. docs/jwt-aktivierung-runbook.md behauptete, HELMUT_TENANT_JWT_MODE=1
//      schalte RLS scharf — der Schalter ist seit 2026-07-13 tot.
//   3. Profil-Speichern ignorierte fehlende Pflichtangaben still; Mandatsebene
//      war in keinem Formular setzbar; kein Freigabestatus sichtbar.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// Hermetik: beruehrte Store-Dateien sichern/wiederherstellen.
const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["auth.json", "store.json", "p-tenant-a.json", "p-tenant-b.json"];
const snapshots = new Map();
for (const name of GUARDED) {
  const file = path.join(dataDir, name);
  snapshots.set(name, fs.existsSync(file) ? fs.readFileSync(file) : null);
}
process.on("exit", () => {
  for (const [name, content] of snapshots.entries()) {
    const file = path.join(dataDir, name);
    try {
      if (content === null) { if (fs.existsSync(file)) fs.rmSync(file); }
      else fs.writeFileSync(file, content);
    } catch (_) { /* Hygiene */ }
  }
});

const storage = require("../lib/helmut/storage");
const { validateProfile } = require("../lib/helmut/profile-validation");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

(async () => {
  // ── 1) Tenant-Härtung der vier Blob-Leser ───────────────────────────────────
  await storage.saveTask({ id: "task-a", title: "A", politicianId: "tenant-a", status: "open" });
  await storage.saveTask({ id: "task-b", title: "B", politicianId: "tenant-b", status: "open" });
  await storage.saveUserNote({ id: "note-a", text: "A", user_id: "tenant-a" });
  await storage.saveInteraction({ id: "int-a", type: "x", politicianId: "tenant-a" });

  for (const fn of ["getTasks", "getUserNotes", "getInteractions", "getLageChecks"]) {
    let threw = false;
    try { await storage[fn](null); } catch (e) { threw = e && e.name === "TenantContextError" || /tenant/i.test(String(e)); }
    check(`${fn}(null) wirft harten Tenant-Fehler statt ALLE Zeilen zu liefern`, threw);
    let threwEmpty = false;
    try { await storage[fn](""); } catch (e) { threwEmpty = true; }
    check(`${fn}("") wirft ebenfalls (kein leerer Kontext)`, threwEmpty);
  }
  const tasksA = await storage.getTasks("tenant-a");
  check("getTasks liefert NUR eigene Zeilen (tenant-a sieht task-b nicht)",
    tasksA.some((t) => t.id === "task-a") && !tasksA.some((t) => t.id === "task-b"));
  const notesA = await storage.getUserNotes("tenant-a");
  check("getUserNotes gescopt", notesA.length === 1 && notesA[0].id === "note-a");

  // ── 2) Doku-Wahrheit ────────────────────────────────────────────────────────
  const runbook = fs.readFileSync(path.join(root, "docs/jwt-aktivierung-runbook.md"), "utf8");
  check("jwt-aktivierung-runbook trägt ÜBERHOLT-Banner mit Code-Beleg",
    runbook.includes("ÜBERHOLT") && runbook.includes("tenantJwtModeEnabled") && runbook.includes("NICHT BEFOLGEN"));
  const arch = fs.readFileSync(path.join(root, "docs/mandantentrennung-architektur.md"), "utf8");
  check("Architektur-Doku bewertet MEHRERE Wege (nicht nur GoTrue)",
    arch.includes("App-Guard-only") && arch.includes("GoTrue") && arch.includes("PRO Mandant") && arch.includes("Freigabepunkt"));
  const code = fs.readFileSync(path.join(root, "lib/helmut/storage.js"), "utf8");
  check("Code-Beleg: tenantJwtModeEnabled ist hart false",
    /function tenantJwtModeEnabled\(\) \{\s*\n\s*return false;/.test(code));

  // ── 3) Onboarding-Freigabe: Server liefert Validierung ──────────────────────
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  check("PATCH /api/profile/current liefert profilValidierung zurück",
    /saveProfile\(await normalizeProfile\(body, politicianId\)\);\s*\n\s*return \{ \.\.\.saved, profilValidierung: validateProfile\(saved\) \};/.test(serverSource));
  check("app/start-Profil trägt profilValidierung",
    serverSource.includes("profile: { ...profile, profilValidierung: validateProfile(profile) }"));

  // Review-Fix N1: das abgeleitete Feld profilValidierung wird beim Speichern
  // gestrippt, damit ein Client-Round-Trip es nicht dauerhaft im Blob persistiert.
  check("normalizeProfile strippt profilValidierung (kein Persistieren des Anzeigefelds)",
    /"profilValidierung" in profile\)[\s\S]{0,140}delete profile\.profilValidierung/.test(serverSource));

  // Echte Validierungslogik: Landtag ohne Bundesland => bundesland fehlt.
  const mdl = validateProfile({ id: "x", fullName: "Test MdL", party: "SPD", parliamentType: "Landtag", constituency: "Mitte", committees: ["Hauptausschuss"] });
  check("validateProfile: Landtag ohne Bundesland meldet 'bundesland'",
    mdl.missingRequired.includes("bundesland") && mdl.parliamentType === "Landtag");
  const mdb = validateProfile({ id: "x", fullName: "Test MdB", party: "SPD", parliamentType: "Bundestag", state: "Berlin", constituency: "Mitte", committees: ["Hauptausschuss"] });
  check("validateProfile: vollständiges Bundestagsprofil ist 'vollstaendig'", mdb.state === "vollstaendig", mdb.reason);

  // ── 4) Client: Formularfeld + Banner + ehrliches Feedback (vm) ──────────────
  const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");
  check("Formular sendet parliamentType", clientSource.includes('parliamentType: data.get("parliamentType")'));
  check("Speicher-Feedback nennt fehlende Pflichtangaben",
    clientSource.includes("noch offen: ") && clientSource.includes("vollständig und einsatzbereit"));

  let codeVm = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  codeVm += `\n;globalThis.__ot = {
    setProfile: (p) => { profile = p; },
    renderSettings: () => renderProfileSettingsView(),
    level: () => profileParliamentType(),
    banner: () => renderProfileReleaseStatus()
  };`;
  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
    contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    textContent: "", value: "", offsetParent: null });
  const storageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: { querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
      createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(),
      addEventListener: noop, removeEventListener: noop, cookie: "", visibilityState: "visible", hidden: false },
    navigator: { userAgent: "node-test", language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storageStub, sessionStorage: storageStub,
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    fetch: () => Promise.reject(new Error("no-net-in-test")),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64")
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(codeVm, sandbox, { filename: "client.js" });
  const ot = sandbox.__ot;

  ot.setProfile({ fullName: "T", parliamentType: "", politicalLevel: "Bund", profilValidierung: { state: "teilweise", missingRequiredLabels: ["Bundesland", "Region oder Wahlkreis"] } });
  check("Mandatsebene wird abgeleitet (legacy politicalLevel 'Bund' -> Bundestag)", ot.level() === "Bundestag");
  ot.setProfile({ fullName: "T", parliamentType: "Landtag" });
  check("Explizites parliamentType 'Landtag' gewinnt", ot.level() === "Landtag");

  ot.setProfile({ fullName: "T", parliamentType: "Bundestag", profilValidierung: { state: "teilweise", missingRequiredLabels: ["Bundesland"] } });
  const banner = ot.banner();
  check("Freigabestatus-Banner zeigt 'noch nicht freigegeben' + fehlende Felder",
    banner.includes("noch nicht freigegeben") && banner.includes("Bundesland"));
  ot.setProfile({ fullName: "T", parliamentType: "Bundestag", profilValidierung: { state: "vollstaendig", missingRequiredLabels: [] } });
  check("Freigabestatus-Banner zeigt 'einsatzbereit' bei vollständigem Profil",
    ot.banner().includes("einsatzbereit"));
  const settingsHtml = ot.renderSettings();
  check("Einstellungs-Formular enthält Mandatsebene-Auswahl (Bundestag/Landtag)",
    settingsHtml.includes('name="parliamentType"') && settingsHtml.includes(">Landtag<"));

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
