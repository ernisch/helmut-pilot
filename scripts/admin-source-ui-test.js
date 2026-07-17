"use strict";

// Render-Test des Admin-Bereichs "Quellen & Watchdog" (Neuaufbau 2026-07).
// Fuehrt renderAdmQuellen aus client.js im vm aus (Browser-Stubs, kein Netz).
//
// Geprueft:
//  - Ehrlichkeit: ohne relationale Tabellen (verfuegbar:false) KEINE erfundenen
//    Kennzahlen, sondern der Hinweis des Servers
//  - Statuszaehler mit verstaendlichen Text-Labels (gesund/defekt/... nicht nur Farbe)
//  - Problematische Abrufwege: Herausgeber, Methode, Fehlerserie, letzter Erfolg,
//    konkrete Handlungsempfehlung
//  - Klumpenrisiko (Google-News-Anteil) inkl. Quelle der Zahl
//  - Watchdog-Zustand aus den Workflow-Dateien (aktiv vs. nur manuell)
//  - Fehlende Messwerte je Abrufweg als — (Telemetrie hat noch keinen Lesepfad)

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__srcTest = {
    render: () => renderAdmQuellen(),
    setUser: (u) => { currentUser = u; },
    setData: (key, payload) => { admData[key] = payload; },
    clearData: () => { admData = {}; admErrors = {}; }
  };`;
  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null, focus: noop, closest: () => null, set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "" });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    document: { querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(), createElement: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop, cookie: "", visibilityState: "visible" },
    navigator: { userAgent: "node-test", language: "de-DE" },
    localStorage: storage, sessionStorage: storage,
    location: { search: "", href: "http://localhost/", pathname: "/", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    fetch: () => { throw new Error("fetch-should-not-be-called-during-render"); }
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  return sandbox.__srcTest;
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

const api = loadClient();
check("client.js laedt im vm", Boolean(api && api.render));
api.setUser({ id: "admin1", role: "admin" });

// A) Nicht verfuegbar (lokales Backend): Hinweis statt erfundener Zahlen.
api.clearData();
api.setData("sources", { generatedAt: new Date().toISOString(), verfuegbar: false, hinweis: "Relationale Quellen-Tabellen nicht erreichbar (Supabase-Backend erforderlich) — keine erfundenen Kennzahlen.", statusCounts: null, zaehler: null, problematischeWege: null, herausgeber: null, googleNews: null, letzterShadowLauf: null, watchdog: { briefingWatchdog: { verfuegbar: true, aktiv: true, zeitplanUtc: "30 5 * * *", quelle: ".github/workflows/briefing-watchdog.yml" }, healthWatch: { verfuegbar: true, aktiv: false, zeitplanUtc: null, quelle: ".github/workflows/health-watch.yml" } } });
const offView = api.render();
check("A1 Ohne relationale Tabellen: Server-Hinweis sichtbar", offView.includes("keine erfundenen Kennzahlen"));
check("A2 Keine erfundenen Statuszahlen", !/adm-tile-value">\d/.test(offView));
check("A3 Zustand 'unbekannt' statt gruen", offView.includes("unbekannt"));

// B) Voll verfuegbar.
const minsAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
api.clearData();
api.setData("sources", {
  generatedAt: new Date().toISOString(),
  verfuegbar: true,
  hinweis: null,
  statusCounts: { healthy: 64, degraded: 9, broken: 3, needs_review: 6, paused: 1, archived: 2 },
  zaehler: { herausgeber: 38, abrufwege: 85, pakete: 11, paketPfade: 146 },
  problematischeWege: [
    { id: "p1", name: "Ministerium X HTML", herausgeber: "Ministerium X", methode: "html", status: "broken", fehlerserie: 11, letzterErfolg: minsAgo(60 * 24 * 9), letzterFehler: "http-404", kritisch: true },
    // Wie in Production beobachtet: als 'broken' konfiguriert, aber OHNE Abruf-Verlauf
    // (Fehlerserie 0, kein letzter Erfolg/Fehler) — darf NICHT "liefert nicht mehr" sagen.
    { id: "p0", name: "Bundestag (Config)", herausgeber: "Deutscher Bundestag", methode: "rss", status: "broken", fehlerserie: 0, letzterErfolg: null, letzterFehler: null, kritisch: true },
    { id: "p2", name: "Bundestag RSS", herausgeber: "Bundestag", methode: "rss", status: "degraded", fehlerserie: 3, letzterErfolg: minsAgo(60 * 5), letzterFehler: null, kritisch: false }
  ],
  herausgeber: [
    { id: "h1", name: "Ministerium X", typ: "ministry", vertrauen: "hoch", wege: [{ id: "p1", name: "Ministerium X HTML", methode: "html", status: "broken", fehlerserie: 11, letzterErfolg: minsAgo(60 * 24 * 9) }], schlechtesterStatusRang: 5 },
    { id: "h2", name: "ARD", typ: "media", vertrauen: "hoch", wege: [{ id: "p3", name: "ARD Tagesschau", methode: "rss", status: "healthy", fehlerserie: 0, letzterErfolg: minsAgo(30) }], schlechtesterStatusRang: 0 }
  ],
  googleNews: { laeufe: 12, googleChecked: 400, googleOk: 350, googleFailed: 50, directChecked: 500, directOk: 480, directFailed: 20, anteilOkProzent: 42 },
  letzterShadowLauf: { savedAt: minsAgo(60 * 20), modus: "shadow", abdeckungDokumenteProzent: 96 },
  watchdog: {
    briefingWatchdog: { verfuegbar: true, aktiv: true, zeitplanUtc: "30 5 * * *", quelle: ".github/workflows/briefing-watchdog.yml" },
    healthWatch: { verfuegbar: true, aktiv: false, zeitplanUtc: null, quelle: ".github/workflows/health-watch.yml" }
  }
});
api.setData("crawl", { recentRawItemCount: 3910 });
api.setData("crawlReport", { failedSources: 8, checkedSources: 94 });
const view = api.render();
check("B1 Status-Labels als Text (gesund/beeintraechtigt/defekt/pruefen)", view.includes("gesund") && view.includes("defekt") && view.includes("Prüfen (needs_review)") && view.includes("Beeinträchtigt (degraded)"));
check("B2 Zustandskopf nennt Zaehler", view.includes("64 gesund"));
check("B3 Handlungsbedarf: defekte Wege benannt", view.includes("Abrufwege defekt"));
check("B4 Architektur-Zaehler (Herausgeber/Wege/Pakete/Zuordnungen)", view.includes("38") && view.includes("85") && view.includes("146"));
check("B5 Problematische Wege: Herausgeber + Methode + Fehlerserie", view.includes("Ministerium X") && view.includes("html") && view.includes("11"));
check("B6 Konkrete Handlungsempfehlung je Weg (mit Beleg -> 'liefert nicht mehr')", view.includes("Reparieren oder ersetzen — liefert nicht mehr."));
check("B6b Ehrlich: broken OHNE Abruf-Verlauf sagt NICHT 'liefert nicht mehr', sondern 'ohne Abruf-Verlauf'", view.includes("ohne Abruf-Verlauf — Konfiguration/Aktivierung prüfen"));
check("B6c Kontext-Notiz: Status stammt aus der Quellen-Architektur (kann vom Crawl abweichen)", view.includes("Quellen-Architektur") && view.includes("aktive Crawl kann davon abweichen"));
check("B7 Google-News-Anteil mit Quelle der Zahl", view.includes("42 %") && view.includes("Crawl-Läufen"));
check("B8 Shadow-Messlauf mit Abdeckung", view.includes("Abdeckung 96"));
check("B9 Watchdog aktiv mit UTC-Zeitplan", view.includes("30 5 * * *") && view.includes("aktiv"));
check("B10 Health-Watch ehrlich 'nur manuell'", view.includes("nur manuell"));
check("B11 Messwerte je Weg ehrlich — (Telemetrie ohne Lesepfad)", view.includes("source_crawl_telemetry"));
check("B12 Fehlerquote letzter Lauf berechnet (9 %)", view.includes("9 %"));
check("B13 Herausgeber-Detail aufklappbar", view.includes("adm-pub-sum"));
check("B14 Kein Kosten-/Tokenwert im Quellen-Bereich", !/USD|Tokens/.test(view));

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Quellen-UI-Assertions`);
process.exit(failed > 0 ? 1 : 0);
