"use strict";

// Render-Test des Admin-Betreiber-Kontrollzentrums. Fuehrt die ECHTEN Client-Funktionen
// aus client.js in einem vm-Kontext (Browser-Stubs) aus und prueft das erzeugte HTML.
// KEIN Netz, KEINE KI. Geprueft: sechs Kacheln (Betrieb), Handlungsbedarf mit echten
// Hinweisen + ruhigem Leerzustand, verdichtete Profile-Liste, Kosten admin-only,
// Secrets nur als Status, klare Abschnittsueberschriften, Admin-Gating, keine
// automatische Recovery-/Pipeline-Aktion, keine Kosten/Secrets/Demo im Betrieb.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__adminTest = {
    overview: (data, ds, rec) => renderAdminOperatorOverview(data, ds, rec),
    actionCenter: (ds, rec) => renderAdminActionCenter(ds, rec),
    view: () => renderAdminView(),
    setUser: (u) => { currentUser = u; },
    setAdmin: (d, ds, rec, period) => { adminData = d; adminDataStatus = ds; adminRecovery = rec; if (period) adminPeriod = period; },
    relAge: (iso) => adminRelAge(iso),
    esc: (s) => escapeHtml(s)
  };`;
  const noop = () => {};
  const fakeNode = () => ({
    classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
    style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop,
    querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop,
    focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false,
    insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null
  });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop,
    cookie: "", visibilityState: "visible", hidden: false
  };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: doc,
    navigator: { userAgent: "node-test", serviceWorker: undefined, language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storage, sessionStorage: storage,
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    fetch: () => { throw new Error("fetch-should-not-be-called-during-render"); },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64")
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  if (!sandbox.__adminTest) throw new Error("Admin-Test-Hook nicht gesetzt");
  return sandbox.__adminTest;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const api = loadClient();
check("client.js laedt im vm (Admin-Boot ohne Browser)", Boolean(api && api.overview));

const nowIso = new Date().toISOString();
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

// ── Fixtures (echte Feld-Shapes von server buildAdminOverview/-DataStatus/-Recovery) ──
const dsHealthy = {
  v3StoreAktiv: true,
  global: {
    ampel: "gruen", letzterLauf: minsAgo(18), modus: "full",
    quellen: { geprueft: 21, erfolgreich: 21, fehlgeschlagen: 0 },
    kiAnalyseFehler: false, morgenstatus0730: { ok: true, note: null }, letzterFehler: null,
    profile: { accountsGesamt: 1, ausgewertet: 1, personalisierungEingeschraenkt: 0 },
    briefing: { punkteGesamt: 5, sichtbarBeiAccounts: 1, accountsOhneBriefing: 0 },
    kiStatus: { available: true, anbieter: "azure", azureKeyGesetzt: true, azureEndpointGesetzt: true }
  },
  perAccount: [{
    politicianId: "max-mandat", name: "Max Mandat",
    profilVollstaendigkeit: { level: "full", complete: true, fehlendePflichtfelder: [] },
    personalisierungEingeschraenkt: false, briefingSichtbar: true, briefingPunkte: 5,
    radarChancen: 2, radarRisiken: 1, kiKosten: { estimatedUsd: "0.05", calls: 10 }, kontoTyp: "Pilot", ampel: "gruen"
  }]
};
const recHealthy = {
  knowledgeObjects: { available: true, pending: 0, failed: 0, complete: 42 },
  understandingLock: { aktiv: false, verdaechtig: false }, letzterUnderstandingLauf: minsAgo(18)
};
const adminDataFull = {
  generatedAt: nowIso, counts: { users: 3 },
  users: [
    { id: "u-admin", name: "Admin Root", email: "admin@bt.de", role: "admin", active: true, status: "aktiv", lastSeenAt: minsAgo(5), openCount: 10, loginCount: 5, customer: {} },
    { id: "u-ref", name: "Rita Referent", email: "rita@bt.de", role: "referent", active: true, status: "aktiv", lastSeenAt: minsAgo(60), openCount: 3, loginCount: 2, customer: {} },
    { id: "u-mdb", name: "Max Mandat", email: "max@bt.de", role: "abgeordneter", politicianId: "max-mandat", active: true, status: "aktiv", lastSeenAt: minsAgo(200), paidUntil: new Date(Date.now() + 30 * 86400000).toISOString(), openCount: 20, loginCount: 8, customer: {} }
  ],
  assignments: [{ userId: "u-ref", politicianId: "max-mandat" }],
  feedback: [], mandates: [], profiles: [{ id: "max-mandat", fullName: "Max Mandat" }],
  stats: {
    today: { articles: 120, kos: 8, briefings: 2, totalCostUsd: 0.234, totalCalls: 42, perUser: [{ userId: "max-mandat", name: "Max Mandat", totalCostUsd: 0.2 }], perCategory: { intelligence: { calls: 20, estimatedCostUsd: 0.1 }, briefing: { calls: 15, estimatedCostUsd: 0.08 }, office: { calls: 7, estimatedCostUsd: 0.05 } } },
    days30: { articles: 3000, kos: 200, briefings: 40, totalCostUsd: 5.6, totalCalls: 900, perUser: [], perCategory: {} }
  },
  crawlReport: { lastCrawlAt: minsAgo(18), mode: "full", scannedArticles: 500, deduplicatedArticles: 60, newVorgaenge: 12, newKnowledgeObjects: 8, checkedSources: 21, failedSources: 0, errorCount: 0, durationSec: 42 },
  system: { storage: { backend: "supabase", supabaseConfigured: true }, store: { briefings: { total: 12 } }, ai: { enabled: true, model: "gpt-4o" }, push: { enabled: false }, authMode: true, deploy: { version: "abc12345", commit: "abc123456789", branch: "main", environment: "production" } },
  recentErrors: [], auditEvents: [{ createdAt: nowIso, action: "admin.user.update", actorEmail: "admin@bt.de" }]
};

// ── 1) Betrieb: sechs Kacheln, gesund = 6x gruen, KEINE Warnungen mehr in der Kachelzeile.
const htmlOk = api.overview({ generatedAt: minsAgo(2) }, dsHealthy, recHealthy);
const labels = ["System", "Datenstand", "Pipeline", "Quellen", "Understanding", "Watchdog"];
check("Betrieb: genau 6 Statuskacheln", (htmlOk.match(/class="op-tile /g) || []).length === 6);
labels.forEach((l) => check(`Betrieb: Kachel [${l}]`, htmlOk.includes(`>${l}<`)));
check("Betrieb: gesund => 6 gruene Kacheln", (htmlOk.match(/op-tile--ok/g) || []).length === 6);
check("Betrieb: keine Warn-/Hinweiszeilen mehr in der Kachelzeile", !htmlOk.includes("op-warnings"));
check("Betrieb: echte Zaehler (21 von 21 ok)", htmlOk.includes("21 von 21 ok"));

// ── 2) Handlungsbedarf: gesund => ruhiger Leerzustand.
const acOk = api.actionCenter(dsHealthy, recHealthy);
check("Handlungsbedarf: Ueberschrift vorhanden", acOk.includes("Handlungsbedarf"));
check("Handlungsbedarf: gesund => 'Alles ruhig. Kein Eingreifen noetig.'", acOk.includes("Alles ruhig. Kein Eingreifen nötig."));
check("Handlungsbedarf: gesund => keine ac-items", !/ac-item /.test(acOk));

// ── 3) Handlungsbedarf: degradiert => echte Hinweise.
const dsBad = {
  v3StoreAktiv: true,
  global: {
    ampel: "rot", letzterLauf: new Date(Date.now() - 30 * 3600000).toISOString(), modus: "full",
    quellen: { geprueft: 21, erfolgreich: 18, fehlgeschlagen: 3 },
    kiAnalyseFehler: true, morgenstatus0730: { ok: false, note: "Kein erfolgreicher Tageslauf bis 7:30" },
    letzterFehler: { headline: "Crawl-Timeout", reason: "Quelle X nicht erreichbar", when: nowIso, scope: "pipeline" }
  },
  perAccount: []
};
const recBad = {
  knowledgeObjects: { available: true, pending: 4, failed: 2, complete: 10 },
  understandingLock: { aktiv: false, verdaechtig: true }, letzterUnderstandingLauf: minsAgo(120)
};
const acBad = api.actionCenter(dsBad, recBad);
check("Handlungsbedarf: 2 Vorgaenge fehlgeschlagen", acBad.includes("2 Understanding-Vorgänge fehlgeschlagen"));
check("Handlungsbedarf: Lock veraltet", acBad.includes("Understanding-Lock wirkt veraltet"));
check("Handlungsbedarf: 4 warten", acBad.includes("4 Understanding-Vorgänge warten"));
check("Handlungsbedarf: 3 von 21 Quellen mit Fehlern", acBad.includes("3 von 21 Quellen mit Fehlern"));
check("Handlungsbedarf: letzter Fehler mit Headline", acBad.includes("Letzter Fehler: Crawl-Timeout"));
check("Handlungsbedarf: KI-Analyse-Fehler", acBad.includes("KI-Analyse heute mit Fehlern"));
check("Handlungsbedarf: KEINE Aktions-Buttons hier (Recovery bleibt geschuetzt)", !/data-recovery-action/.test(acBad));

// ── 4) Leere Daten -> Betrieb grau, Handlungsbedarf ruhig, nichts erfunden.
const htmlEmpty = api.overview({}, null, null);
check("Leer: Betrieb nur grau (unknown)", !/op-tile--ok|op-tile--warn|op-tile--bad/.test(htmlEmpty));
check("Leer: neutrales 'Keine Daten'/'Unbekannt'", /Keine Daten|Unbekannt/.test(htmlEmpty));
check("Leer: Handlungsbedarf ruhig", api.actionCenter(null, null).includes("Alles ruhig"));

// ── 5) Vollstaendige Ansicht (Admin): sechs Bereiche, Verdichtung, Details eingeklappt.
api.setUser({ role: "admin", name: "Admin Root" });
api.setAdmin(adminDataFull, dsHealthy, recHealthy, "today");
const view = api.view();
check("Full: Ueberschrift Betrieb (eyebrow)", view.includes(">Betrieb<"));
["Handlungsbedarf", "Datenmotor", "Profile", "Kosten intern", "System und Sicherheit"].forEach((h) =>
  check(`Full: Abschnitts-Ueberschrift [${h}]`, view.includes(`admin-sec-title">${h}`)));
check("Full: Betreiber-Uebersicht (op-overview) oben", view.includes("op-overview"));
check("Full: Datenmotor-Kompaktkopf (dm-summary)", view.includes("dm-summary"));
check("Full: einklappbare Details vorhanden", view.includes("admin-details"));
check("Full: verdichtete Profil-Liste (admin-table--compact)", view.includes("admin-table--compact") && view.includes("Max Mandat"));
check("Full: Recovery klar als intern markiert", view.includes("admin-recovery-flag"));
check("Full: Recovery-Buttons existieren (im DOM, eingeklappt)", view.includes("data-recovery-action"));

// ── 6) Kosten intern: nur im Admin, verdichteter Kopf + Details.
check("Kosten: 'Kosten heute' im verdichteten Kopf", view.includes("Kosten heute"));
check("Kosten: Tageswert sichtbar ($0.234)", view.includes("$0.234"));
check("Kosten: Engine-/Nutzer-Details eingeklappt", view.includes("Kosten pro Engine"));

// ── 7) System und Sicherheit: Version + Secrets-STATUS (kein Wert) + Admin-Zugriff.
check("System: Commit sichtbar", view.includes("abc123456789"));
check("System: Admin-Zugriff rollen-geschuetzt", view.includes("Rollen-geschützt"));
check("System: Secrets nur als Status (KI-Schluessel)", view.includes("KI-Schlüssel"));
check("System: Hinweis 'nur als Status ... nie im Klartext'", view.includes("nie im Klartext"));

// ── 8) Sicherheit: keine Secret-Werte, keine Demo-Texte in der ganzen Ansicht.
// Passwort-Eingabefelder sind erlaubt (Nutzerverwaltung), duerfen aber NIE einen Wert
// tragen; und es duerfen keine Klartext-Secret-Muster (Keys/Tokens) im Markup stehen.
check("Secrets: Passwort-Felder tragen keinen Wert", !/type="password"[^>]*\svalue="[^"]/.test(view) && !/\svalue="[^"]*"[^>]*type="password"/.test(view));
check("Secrets: keine Klartext-Secret-Muster (bearer/sk-/service_role/apikey=)", !/bearer\s|sk-[a-z0-9]{12}|service_role|apikey=/i.test(view));
check("Keine Demo-/Platzhalter-Texte", !/lorem|dummy|beispieltext|coming soon|demnaechst|\bTODO\b|\bFIXME\b/i.test(view));

// ── 9) Admin-Gating: Nicht-Admin sieht nichts, keine Kosten.
api.setUser({ role: "referent" });
const viewRef = api.view();
check("Nicht-Admin (referent): 'Kein Zugriff'", viewRef.includes("Kein Zugriff"));
check("Nicht-Admin: keine Kacheln/Bereiche", !viewRef.includes("op-tile") && !viewRef.includes("admin-sec-title"));
check("Nicht-Admin: keine Kostenwerte", !viewRef.includes("$0.234") && !viewRef.includes("Kosten heute"));
api.setUser({ role: "abgeordneter" });
check("Nicht-Admin (abgeordneter): 'Kein Zugriff'", api.view().includes("Kein Zugriff"));

// ── 10) relAge-Sanity.
check("relAge: null bei fehlendem Wert", api.relAge(null) === null && api.relAge("nonsense") === null);
check("relAge: frisch -> 'gerade eben'", api.relAge(minsAgo(0.5)) === "gerade eben");
check("relAge: Minuten korrekt", api.relAge(minsAgo(12)) === "vor 12 Min.");

console.log(`\n${passed}/${passed + failed} Admin-Kontrollzentrum-Checks bestanden.`);
if (failed > 0) process.exit(1);
