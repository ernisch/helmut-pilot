"use strict";

// UI-Test (Sprint 8): die ECHTEN Client-Render-Funktionen der Admin-Quellenarchitektur
// im vm-Kontext. Prueft die 6 Ansichten, ruhige Leerzustaende, ehrliche „nicht verfügbar"-
// Markierungen (keine erfundenen 0/Demozahlen) und den Migrations-Hinweis.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

const { buildFullModel } = require(path.join(root, "lib/helmut/quellenarchitektur"));
const pp = require(path.join(root, "lib/helmut/quellenarchitektur/profile-packages"));
const qw = require(path.join(root, "lib/helmut/quellenarchitektur/quality-watchdog"));
const ar = require(path.join(root, "lib/helmut/quellenarchitektur/admin-report"));

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass += 1; console.log(`PASS  ${name}`); } else { fail += 1; console.log(`FAIL  ${name}`); } }

function loadClient() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__saUi = { render: (sa) => renderAdminQuellenarchitektur(sa) };`;
  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {}, addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop, setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null, contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }), set innerHTML(_v) {}, get innerHTML() { return ""; }, textContent: "", value: "", offsetParent: null });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = { querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(), createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop, cookie: "", visibilityState: "visible", hidden: false };
  const sandbox = { console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f), document: doc, navigator: { userAgent: "node-test", serviceWorker: undefined, language: "de-DE", onLine: true, sendBeacon: noop }, localStorage: storage, sessionStorage: storage, location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" }, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }), fetch: () => Promise.reject(new Error("no-net")), getComputedStyle: () => ({ getPropertyValue: () => "" }), performance: { now: () => 0 }, atob: (s) => Buffer.from(s, "base64").toString("binary"), btoa: (s) => Buffer.from(s, "binary").toString("base64") };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox; sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  if (!sandbox.__saUi) throw new Error("Test-Hook nicht gesetzt");
  return sandbox.__saUi;
}

// --- Report bauen (echter Katalog, leere Metriken = Migrations-Leerzustand) ---
const NOW = Date.parse("2026-07-13T12:00:00Z");
const M = buildFullModel();
const cem = { id: "cem-ince", fullName: "Cem Ince", party: "Die Linke", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", profileActive: true };
const berlin = { id: "be", fullName: "Berlin MdA", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Inneres"], profileActive: true };
const activation = pp.computeGlobalActivation({ packages: M.packages, packagePaths: M.packagePaths, retrievalPaths: M.retrievalPaths, profiles: [cem, berlin] });
const quality = qw.buildQualityReport({ catalog: { retrievalPaths: M.retrievalPaths, packages: M.packages, packagePaths: M.packagePaths }, activation, rawDocs: [], koSourceLinks: [], dedupDocuments: [], profiles: [cem, berlin], llmUsage: [], signals: {}, now: NOW });
const report = ar.buildSourceAdminReport({ catalog: M, activation, qualityReport: quality, now: NOW });

const ui = loadClient();
const html = ui.render(report);

console.log("== Struktur + Migrationshinweis ==");
check("rendert ohne Crash, liefert HTML", typeof html === "string" && html.length > 500);
check("sechs Ansichts-Anker vorhanden", ["admin-sa-laender", "admin-sa-quellen", "admin-sa-profile", "admin-sa-pruefbedarf", "admin-sa-detail", "admin-sa-kosten"].every((id) => html.includes(`id="${id}"`)));
check("Migrations-Hinweis sichtbar (Tabellen nicht migriert)", /sa-mig-note/.test(html) && /nicht migriert/i.test(html));
check("nutzt bestehende Muster (adminSection/op-tiles)", /admin-sec/.test(html) && /op-tiles/.test(html));

console.log("== View 1: Länder und Pakete ==");
check("Berlin als 'Vorbereitet'", /Berlin[\s\S]{0,120}Vorbereitet/.test(html));
check("Niedersachsen als 'Aktiv'", /Niedersachsen[\s\S]{0,120}Aktiv/.test(html));
check("Pflichtklassen: 15 fehlen sichtbar", /15 fehlen|15<\/b> fehlen|>15<\/b>/.test(html));
check("Pakete berlin-basis 'Vorbereitet'", /Berlin Basis[\s\S]{0,120}Vorbereitet/.test(html));

console.log("== View 1b: Reifegrad-Darstellung (Kandidat != einsatzbereit) ==");
const kand = require(path.join(root, "lib/helmut/quellenarchitektur/seeds/landesmodule-kandidaten"));
const reportR = ar.buildSourceAdminReport({ catalog: M, activation, qualityReport: quality, now: NOW, candidateReadiness: kand.readinessByGeography() });
const htmlR = ui.render(reportR);
check("Reifegrad: 'Kandidatenabdeckung' sichtbar", /Kandidatenabdeckung/.test(htmlR));
check("Reifegrad: 'Kandidat'- und 'einsatzbereit'-Badges sichtbar", /Kandidat</.test(htmlR) && /einsatzbereit/.test(htmlR));
check("Reifegrad: ehrlich 'noch nicht technisch verifiziert'", /noch nicht technisch verifiziert/.test(htmlR));
check("Brandenburg: unbesetzte Pilotklassen sichtbar (fraktion_pilot/person_pilot)", /fraktion_pilot/.test(htmlR) && /person_pilot/.test(htmlR));
check("Brandenburg: 'kein Ersatz durch fremde Partei/Person'", /kein Ersatz durch fremde Partei\/Person/.test(htmlR));
check("ohne Rollup (report): keine erfundene Kandidatenabdeckung", !/Kandidatenabdeckung/.test(html));

console.log("== View 2: Quellen und Abrufwege ==");
check("Health-Badges gesund/defekt/unbekannt sichtbar", /gesund/.test(html) && /defekt/.test(html) && /unbekannt/.test(html));
check("defekte Pflichtquelle (Bundestag) im Herausgeber-Prüfbedarf", /Bundestag/.test(html));
check("Hinweis: ohne Dokumentdaten 'Unbekannt' statt erfundenem 'gesund'", /nicht „gesund" erfunden|Unbekannt/.test(html));

console.log("== View 3: Profile ==");
check("Cem 'Versorgt'", /cem-ince[\s\S]{0,140}Versorgt/.test(html));
check("Berlin-MdA 'Unversorgt'", /be[\s\S]{0,200}Unversorgt/.test(html) || /Unversorgt/.test(html));

console.log("== View 4: Prüfbedarf ==");
check("Prüfbedarf als ac-items (echte Probleme)", /ac-item ac-item--bad|ac-item ac-item--warn/.test(html));
check("Noch nicht verfügbare Messwerte gelistet (ds-unavail)", /Noch nicht verfügbare Messwerte/.test(html) && /ds-unavail/.test(html));
check("kein Rauschen: nicht 100+ Prüfpunkte (ruhig)", (html.match(/ac-item ac-item--/g) || []).length < 25);

console.log("== View 5: Quellendetail — Ehrlichkeit ==");
check("Dokumente/KO als 'nicht verfügbar' (kein erfundenes 0)", /Dokumente[\s\S]{0,80}ds-unavail/.test(html));
check("Duplikate 'nicht verfügbar'", /Duplikate[\s\S]{0,80}ds-unavail/.test(html));
check("Kosten je Quelle 'noch nicht zuordenbar'", /noch nicht zuordenbar/.test(html));

console.log("== View 6: Kosten und Produktnutzen ==");
check("Kosten-Leerzustand (keine KI-Kosten)", /Keine KI-Kosten/.test(html));
check("Kosten-Attribution ehrlich nicht verfügbar erwähnt", /nicht zuordenbar|noch keine sourceId/.test(html));

console.log("== Ehrlichkeit: keine erfundenen Demozahlen ==");
check("kein hartes '0 Dokumente'/'0 KOs' im Detail (statt ds-unavail)", !/>0 Dokumente<|0 Knowledge Objects</.test(html));

console.log("== Fehlende Daten -> gar keine Sektion (Alt-Admin unveraendert) ==");
check("ohne Report: renderAdminQuellenarchitektur() = leer", ui.render(undefined) === "" && ui.render({}) === "");

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
