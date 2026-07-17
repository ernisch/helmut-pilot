"use strict";

// Render-Test des NEUEN Admin-Bereichs (Neuaufbau 2026-07). Fuehrt die ECHTEN
// Client-Funktionen aus client.js in einem vm-Kontext (Browser-Stubs) aus und
// prueft das erzeugte HTML. KEIN Netz, KEINE KI.
//
// Geprueft:
//  - Admin-Gating ("Kein Zugriff" fuer Nicht-Admins; rein kosmetisch, Server gated echt)
//  - Sieben Bereiche in der Navigation, aktiver Bereich markiert
//  - Eiserne Regel: fehlende Werte -> "—", niemals erfundene Zahlen/Beispieldaten
//  - Zustand + Handlungsbedarf VOR Detailzahlen ("Alles ruhig. Kein Eingreifen nötig.")
//  - Waehrung: KI-Kosten ausschliesslich als USD gekennzeichnet, nie als EUR;
//    EUR nur fuer echte EUR-Felder (Kundenpreis, Budget-Cents)
//  - Escaping (kein XSS ueber Namen/Feldwerte)
//  - Kein fetch waehrend des Renderns (Sandbox-fetch wirft)
//  - Sichere Loeschbestaetigung (Mandats-ID-Tippfeld) im DSGVO-Block

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__adminTest = {
    view: () => renderAdminView(),
    setUser: (u) => { currentUser = u; },
    setSection: (s) => { admSection = s; },
    setData: (key, payload) => { admData[key] = payload; },
    setError: (key, msg) => { admErrors[key] = msg; },
    clearData: () => { admData = {}; admErrors = {}; admLoading = {}; admLoadedAt = {}; },
    setRecovery: (rec) => { adminRecovery = rec; admData.recovery = rec; },
    setPrivacyConfirm: (pid) => { admPrivacyConfirm = pid ? { politicianId: pid } : null; },
    uebersicht: () => renderAdmUebersicht(),
    pipeline: () => renderAdmPipeline(),
    kosten: () => renderAdmKosten(),
    daten: () => renderAdmDaten(),
    nutzer: () => renderAdmNutzer(),
    system: () => renderAdmSystem(),
    quellen: () => renderAdmQuellen(),
    usd: (v) => admUsd(v),
    eur: (v) => admEur(v),
    num: (v) => admNum(v),
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
check("client.js laedt im vm (Admin ohne Browser)", Boolean(api && api.view));

const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

// ── A) Gating + Shell ─────────────────────────────────────────────────────────
api.setUser({ id: "u1", role: "abgeordneter", email: "a@example.org" });
check("A1 Nicht-Admin sieht 'Kein Zugriff'", api.view().includes("Kein Zugriff"));

api.setUser({ id: "admin1", role: "admin", email: "admin@example.org" });
api.clearData();
const shell = api.view();
for (const label of ["Übersicht", "Pipeline", "KI-Kosten", "Daten &amp; Profile", "Nutzer &amp; Kunden", "System &amp; Sicherheit", "Quellen &amp; Watchdog"]) {
  check(`A2 Navigation enthaelt Bereich: ${label.replace(/&amp;/g, "&")}`, shell.includes(label));
}
check("A3 Bereichs-Buttons tragen data-adm-section", (shell.match(/data-adm-section="/g) || []).length === 7);
check("A4 Aktiver Bereich markiert (is-active)", /adm-nav-btn is-active/.test(shell));
check("A5 Aktualisieren-Knopf vorhanden (data-adm-refresh)", shell.includes("data-adm-refresh"));

// ── B) Eiserne Regel: leere Daten -> "—", nichts erfunden ────────────────────
api.clearData();
const emptyView = api.uebersicht();
check("B1 Ohne Daten: Zustand 'unbekannt', keine gruene Beschoenigung", emptyView.includes("unbekannt"));
check("B2 Ohne Daten: Werte als — (keine erfundenen Zahlen)", (emptyView.match(/—/g) || []).length >= 5);
check("B3 Ohne Daten: keine Beispieldaten (kein 'demo', keine Platzhalterzahl 8.420)", !/8\.420|Beispieldaten/i.test(emptyView));

// ── B6 Unbekannter Zustand: neutraler Text, NIE gruene Entwarnung ────────────
// Grün ("Alles ruhig. Kein Eingreifen nötig.") darf nur bei tatsächlich gesundem
// Zustand erscheinen — bei unbekanntem Zustand (Daten nicht ladbar) ein neutraler
// Hinweis. Prüfung über ALLE sieben Bereiche.
const NEUTRAL = "Der Zustand kann aktuell nicht zuverlässig bewertet werden.";
for (const sec of ["uebersicht", "pipeline", "kosten", "daten", "nutzer", "system", "quellen"]) {
  api.clearData();
  const v = api[sec]();
  check(`B6 ${sec}: unbekannter Zustand zeigt neutralen Text`, v.includes(NEUTRAL));
  check(`B6 ${sec}: unbekannter Zustand zeigt NICHT 'Alles ruhig'`, !v.includes("Alles ruhig"));
  check(`B6 ${sec}: unbekannter Zustand hat keine gruene adm-allquiet-Klasse`, !v.includes("adm-allquiet"));
}

api.clearData();
api.setData("daily", { crawl: { runs: null, checkedSources: null }, ai: {}, v3: { note: "V3-Store nicht aktiv (HELMUT_V3_STORE nicht gesetzt)" } });
const partialView = api.uebersicht();
check("B4 null-Werte werden — (nicht 0)", !/adm-tile-value">0</.test(partialView));
check("B5 V3-note wird ehrlich angezeigt statt Zahlen zu erfinden", partialView.includes("V3-Store nicht aktiv"));

// ── C) Zustand + Handlungsbedarf ─────────────────────────────────────────────
api.clearData();
api.setData("daily", { crawl: { runs: 2, checkedSources: 47, successfulSources: 47, failedSources: 0, savedArticles: 12, latestCrawlAt: minsAgo(30) }, ai: { totalCalls: 5, failedCalls: 0 }, v3: { newRawDocuments: 12, newKnowledgeObjects: 3 } });
api.setData("budget", { day: "2026-07-17", limit: 100, calls: 5, errors: 0, skips: 0, remaining: 95, estimatedCostUsd: 0.12, byTenant: {}, skipsByReason: {} });
api.setData("crawlReport", { lastCrawlAt: minsAgo(30), failedSources: 0, checkedSources: 47 });
api.setRecovery({ v3StoreAktiv: true, knowledgeObjects: { pending: 0, failed: 0, complete: 10, gesamt: 10 }, understandingLock: { aktiv: false, verdaechtig: false } });
api.setData("feedback", { offen: 0, feedback: [] });
api.setData("audit", { auditEvents: [] });
const quietView = api.uebersicht();
check("C1 Ruhiger Zustand: 'Alles ruhig. Kein Eingreifen nötig.'", quietView.includes("Alles ruhig. Kein Eingreifen nötig."));
check("C1b Nur bei gesundem Zustand: gruene adm-allquiet-Klasse + kein neutraler Unbekannt-Text", quietView.includes("adm-allquiet") && !quietView.includes(NEUTRAL));
check("C2 Zustands-Chip mit Text (nicht nur Farbe)", /adm-chip--ok/.test(quietView) && quietView.includes("System läuft"));

api.setData("crawlReport", { lastCrawlAt: minsAgo(30), failedSources: 4, checkedSources: 47, errorCount: 4 });
api.setData("budget", { day: "2026-07-17", limit: 100, calls: 100, errors: 2, skips: 9, remaining: 0, estimatedCostUsd: 0.42, byTenant: {}, skipsByReason: { "budget-erreicht": 9 } });
api.setRecovery({ v3StoreAktiv: true, knowledgeObjects: { pending: 3, failed: 2, complete: 10 }, understandingLock: { aktiv: false, verdaechtig: true } });
const busyView = api.uebersicht();
check("C3 Handlungsbedarf: fehlgeschlagene Quellen erscheinen", busyView.includes("Quellen im letzten Lauf fehlgeschlagen"));
check("C4 Handlungsbedarf: Tageslimit erreicht erscheint", busyView.includes("Tageslimit erreicht"));
check("C5 Handlungsbedarf: failed Wissensobjekte erscheinen", busyView.includes("Wissensobjekte fehlgeschlagen"));
check("C6 Handlungsbedarf: Lock-verdaechtig erscheint", busyView.includes("Understanding-Lock wirkt veraltet"));
check("C7 Handlungsbedarf verlinkt Bereiche (data-adm-goto)", busyView.includes("data-adm-goto="));
check("C8 Kein automatischer Aktions-Aufruf im Markup (keine data-recovery-action in der Übersicht)", !busyView.includes("data-recovery-action"));

// ── D) Waehrung: USD nie als EUR ─────────────────────────────────────────────
check("D1 admUsd kennzeichnet USD", api.usd(1.23).includes("USD"));
check("D2 admUsd erfindet nichts (null -> —)", api.usd(null) === "—");
check("D3 admEur formatiert EUR", api.eur(49).includes("€"));
api.clearData();
api.setData("budget", { day: "2026-07-17", limit: 100, calls: 38, errors: 2, skips: 9, remaining: 62, estimatedCostUsd: 0.42, reserveUnderstanding: 20, failClosed: false, byTenant: {}, skipsByReason: { "budget-erreicht": 6 }, monat: { seit: "2026-07-01", calls: 500, estimatedCostUsd: 6.4 } });
api.setData("costs", { periodDays: 30, totalCalls: 1180, successfulCalls: 1131, failedCalls: 49, totalCostUsd: 12.87, totalTokens: 1940000, perModel: { "gpt-5-mini": { calls: 980, estimatedCostUsd: 3.1, totalTokens: 1420000 } }, perCategory: { intelligence: { calls: 620, estimatedCostUsd: 9.4 } }, byDay: [{ day: "2026-07-17", calls: 38, estimatedCostUsd: 0.42, totalTokens: 61240 }] });
api.setData("costsPerUser", { periodDays: 30, totalCostUsd: 12.87, perUser: [{ userId: "pilot-a", name: "Pilot A", totalCostUsd: 11.1, calls: 1020 }], tenantBudgets: [{ politicianId: "pilot-a", name: "Pilot A", dailyBudgetCent: 100, monthlyBudgetCent: 2000, heuteUsd: 0.42, monatUsd: 6.4, applied: true, allowed: true, warn: false, reason: null }] });
const kostenView = api.kosten();
check("D4 KI-Kosten tragen USD-Kennzeichnung", (kostenView.match(/USD/g) || []).length >= 6);
check("D5 Waehrungshinweis vorhanden (keine stille Umrechnung)", kostenView.includes("Schätzwerte in USD") && kostenView.includes("EUR-Umrechnung"));
check("D6 Kosten-Zahlen nie mit €-Suffix (EUR nur fuer Budget-Cents)", !/0,42 €|12,87 €/.test(kostenView));
check("D7 Budget-Cents als EUR gekennzeichnet", kostenView.includes("1,00 €") && kostenView.includes("20,00 €"));
check("D8 Skip-Gruende erscheinen", kostenView.includes("budget-erreicht"));
check("D9 Monat-bis-heute erscheint", kostenView.includes("seit 2026-07-01"));

// ── E) Nutzer & Kunden ───────────────────────────────────────────────────────
api.clearData();
api.setData("overview", {
  generatedAt: minsAgo(1),
  counts: { users: 3, activeLast7d: 2 },
  users: [
    { id: "u1", name: "<script>alert(1)</script>", email: "x@example.org", role: "abgeordneter", politicianId: "pilot-a", active: true, status: "aktiv", customer: { pricePerMonth: 49, paymentStatus: "paid", startDate: "2026-07-01", trialUntil: null, nextInvoice: "2026-08-01", internalNote: "" }, notificationSettings: { briefing: true, lage: true, radar: false, crisis: true, opportunity: true, statement: true }, loginCount: 4, openCount: 9, lastLoginAt: minsAgo(60), lastSeenAt: minsAgo(10) },
    { id: "u2", name: "Referentin R", email: "r@example.org", role: "referent", politicianId: null, active: true, status: "aktiv", customer: { pricePerMonth: null, paymentStatus: "none" }, loginCount: 0, openCount: 0 },
    { id: "u3", name: "Admin", email: "admin@example.org", role: "admin", politicianId: null, active: true, status: "aktiv", customer: { pricePerMonth: null, paymentStatus: "none" }, loginCount: 1, openCount: 1 }
  ],
  assignments: [{ id: "as1", userId: "u2", politicianId: "pilot-a", createdAt: minsAgo(500) }],
  profiles: [{ id: "pilot-a", fullName: "Pilot A" }],
  mandates: [], feedback: [], system: {}
});
api.setData("customers", { counts: { kunden: 1, paid: 1, open: 0, overdue: 0, none: 0, trial: 0, gekuendigt: 0, deaktiviert: 0 }, mrrEur: 49, kunden: [{ userId: "u1", name: "Pilot A", email: "x@example.org", politicianId: "pilot-a", status: "aktiv", customer: { pricePerMonth: 49, paymentStatus: "paid", startDate: "2026-07-01", nextInvoice: "2026-08-01", internalNote: "VIP" } }], sessionsAktiv: 2 });
const nutzerView = api.nutzer();
check("E1 XSS: Nutzername wird escaped", !nutzerView.includes("<script>alert(1)</script>") && nutzerView.includes("&lt;script&gt;"));
check("E2 MRR in EUR", nutzerView.includes("49,00 €"));
check("E3 Aktive Sessions als reine Anzahl", nutzerView.includes("Aktive Sessions"));
check("E4 Keine Token/Hashes im Markup", !/tokenHash|passwordHash/.test(nutzerView));
check("E5 Referenten-Hinweis (bestehende Rollenstruktur, kein Ausbau)", nutzerView.includes("bestehende Rollenstruktur"));
check("E6 Benachrichtigungen je Mandat erscheinen", nutzerView.includes("Benachrichtigungen je Mandat"));
check("E7 Konten-Tabelle suchbar (data-adm-search)", nutzerView.includes("data-adm-search"));
check("E8 Konten-Tabelle sortierbar (data-adm-sort)", nutzerView.includes("data-adm-sort"));
check("E9 Zahlungsstatus als Text-Chip", nutzerView.includes("bezahlt"));

// ── F) System & Sicherheit ───────────────────────────────────────────────────
api.clearData();
api.setData("overview", { generatedAt: minsAgo(1), counts: {}, users: [], assignments: [], profiles: [], mandates: [{ id: "pilot-a", fullName: "Pilot A", committees: [], focusTopics: [], validierung: { zustand: "vollstaendig", zustandLabel: "Vollständig", bereit: true, nutzbar: true, deaktiviert: false, fehlendePflichtfelder: [] } }], feedback: [], recentErrors: [], auditEvents: [], system: { store: { backend: "local", rawItems: {}, briefings: {}, crawlRuns: {} }, deploy: { commit: "abc12345", environment: "development" }, storage: {}, ai: {}, push: {}, helmutConfig: [] } });
api.setData("tenantMode", { tenantJwtModeEnabled: false, effectiveTransport: "service_role" });
api.setData("setupStatus", { adminExists: true, storageBackend: "local" });
api.setRecovery({ v3StoreAktiv: true, knowledgeObjects: { pending: 0, failed: 0, complete: 5 }, understandingLock: { aktiv: false, verdaechtig: false } });
const systemView = api.system();
check("F1 Sicherheitszustand ehrlich: service_role sichtbar", systemView.includes("service_role"));
check("F2 RLS ehrlich: 'NICHT wirksam' statt Beschoenigung", systemView.includes("NICHT wirksam"));
check("F3 Tenant-JWT ehrlich: dauerhaft deaktiviert", systemView.includes("dauerhaft deaktiviert"));
check("F4 Recovery-Bereich eingebettet (bestehendes Muster)", systemView.includes("data-recovery-action"));
check("F5 Recovery-Kernaktionen vorhanden", systemView.includes("Understanding-Lauf starten") && systemView.includes("Pending Vorgänge"));
check("F6 Backfill-Ausfuehrung klar als gefaehrlich markiert", systemView.includes("adm-action-row--danger") && systemView.includes("AUSFÜHREN"));
check("F7 presentation-backfill ohne Button (nur CRON_SECRET)", systemView.includes("presentation-backfill") && systemView.includes("CRON_SECRET"));

// DSGVO: Loeschung braucht Tippbestaetigung mit Mandats-ID.
api.setPrivacyConfirm("pilot-a");
const privacyView = api.system();
check("F8 Loeschbestaetigung zeigt Mandats-ID + Tippfeld", privacyView.includes("data-privacy-confirm-input=\"pilot-a\"") && privacyView.includes("Unwiderrufliche Löschung"));
check("F9 Loeschung als eigene, klar getrennte Gefahren-Aktion", privacyView.includes("adm-danger-btn"));
check("F10 Export nutzt bestehende Privacy-Route", privacyView.includes("Auskunft exportieren"));
api.setPrivacyConfirm(null);

// ── G) Pipeline ──────────────────────────────────────────────────────────────
api.clearData();
api.setData("crawl", { periodDays: 30, totalCrawlRuns: 58, totalCheckedSources: 1364, totalSuccessfulSources: 1247, totalFailedSources: 117, totalSavedArticles: 3910, totalNewCandidateItems: 4520, recentRawItemCount: 3910, totalRawItemCount: 8421, crawlByDay: [{ day: "2026-07-17", runs: 2, checkedSources: 94, successfulSources: 86, failedSources: 8, savedItems: 128 }] });
api.setData("crawlReport", { lastCrawlAt: minsAgo(90), mode: "full", scannedArticles: 156, deduplicatedArticles: 128, checkedSources: 94, successfulSources: 86, failedSources: 8, newVorgaenge: 14, newKnowledgeObjects: 19, newRawDocuments: 128, errorCount: 8, errors: [] });
api.setData("processRuns", { processRuns: [{ process: "understanding", startedAt: minsAgo(120), durationMs: 42000, processed: 5, status: "ok" }], latestByProcess: { understanding: { process: "understanding", startedAt: minsAgo(120), durationMs: 42000, status: "ok" } }, zeitplan: [{ path: "/api/cron/crawl", schedule: "0 4 * * *" }] });
api.setRecovery({ v3StoreAktiv: true, knowledgeObjects: { pending: 2, failed: 0, complete: 100 }, understandingLock: { aktiv: false, verdaechtig: false } });
const pipelineView = api.pipeline();
check("G1 Datenfluss zeigt Stufen Quelle→Briefing", pipelineView.includes("Quellen geprüft") && pipelineView.includes("Rohdokumente gespeichert") && pipelineView.includes("Briefing"));
check("G2 Matching/Entscheidung ehrlich als — (Schattenbetrieb)", pipelineView.includes("Schattenbetrieb"));
check("G3 Prozesslaufzeiten erscheinen (42 s)", pipelineView.includes("42 s"));
check("G4 Cron-Zeitplan aus Server-Daten (UTC-Kennzeichnung)", pipelineView.includes("0 4 * * *") && pipelineView.includes("UTC"));
check("G5 Pro-Tag-Tabelle vorhanden", pipelineView.includes("2026-07-17"));
check("G6 Teurer Datenstatus nur auf Klick (data-adm-load)", pipelineView.includes("data-adm-load=\"dataStatus\""));
check("G7 Datenfluss erklärt Understanding als separaten Schritt (kein Datenverlust)", pipelineView.includes("separaten Understanding-Schritt") && pipelineView.includes("kein Datenverlust"));

// G8: 891 Rohdokumente -> 0 Wissensobjekte MIT Rückstau -> Hint nennt den Rückstau,
// damit "891 → 0" nicht als Totalausfall missverstanden wird (Production-Frage "warum 0?").
api.setData("crawlReport", { lastCrawlAt: minsAgo(90), mode: "full", scannedArticles: 1012, deduplicatedArticles: 891, checkedSources: 144, successfulSources: 144, failedSources: 0, newVorgaenge: 0, newKnowledgeObjects: 0, newRawDocuments: 891, errorCount: 0, errors: [] });
api.setRecovery({ v3StoreAktiv: true, knowledgeObjects: { pending: 49, failed: 4, complete: 100 }, understandingLock: { aktiv: false, verdaechtig: false } });
const backlogView = api.pipeline();
check("G8 0 Wissensobjekte bei Rückstau: Hint nennt Rückstau-Zahl (49) statt Rätsel", backlogView.includes("49 im Rückstau"));
check("G8b Rückstau-Hint nennt auch failed (4)", backlogView.includes("4 failed"));

// ── H) Fehlerzustaende je Endpoint ───────────────────────────────────────────
api.clearData();
api.setError("daily", "HTTP 500");
api.setData("budget", { day: "2026-07-17", calls: 1, errors: 0, skips: 0, remaining: 9, limit: 10, estimatedCostUsd: 0.01, byTenant: {}, skipsByReason: {} });
const errView = api.uebersicht();
check("H1 Endpoint-Fehler als ruhige Notiz mit Retry", errView.includes("data-adm-retry=\"daily\""));
check("H2 Uebrige Karten bleiben nutzbar (Budget sichtbar)", errView.includes("KI heute"));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Admin-Render-Assertions`);
process.exit(failed > 0 ? 1 : 0);
