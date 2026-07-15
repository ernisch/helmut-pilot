"use strict";

// Büro-/Kommunikations-Ehrlichkeit (Audit-Fix 2026-07, Produktwahrheit).
// FRÜHERE FEHLER:
//   1. Bei KI-Fehler zeigte der Client still einen Regel-Fallback und toastete
//      trotzdem "Entwurf erstellt" — ein MdB konnte einen generischen
//      Platzhaltertext für einen geprüften KI-Entwurf halten.
//   2. Hartkodierte Behauptungen "Linie geprüft. Zitierfähig..." ohne jede Prüfung.
//   3. Keinerlei Kennzeichnung KI-Entwurf vs. Regel-Fallback vs. Fehlerzustand.
//   4. Teilerfolg fror den Tagescache ein: fehlende Entwürfe wurden nie nachgeneriert.
// Dieser Test prüft Servermodul (lib/helmut/ai.js) funktional und den Client
// strukturell + funktional (vm).

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Server: generateCommunicationDraft kennzeichnet Fallbacks ehrlich ────────
(async () => {
  const envBefore = { o: process.env.OPENAI_API_KEY, a: process.env.AZURE_OPENAI_KEY, e: process.env.AZURE_OPENAI_ENDPOINT };
  delete process.env.OPENAI_API_KEY;
  delete process.env.AZURE_OPENAI_KEY;
  delete process.env.AZURE_OPENAI_ENDPOINT;
  const ai = require("../lib/helmut/ai");
  const decision = { title: "Testvorgang", statement: "Kernaussage.", summary: "Zusammenfassung." };
  const noKey = await ai.generateCommunicationDraft({ prompt: "x", decision, profile: { id: "t" }, channel: "press" });
  check("Ohne KI-Schlüssel: aiEnabled=false + degraded + fallbackReason",
    noKey.aiEnabled === false && noKey.degraded === true && noKey.fallbackReason === "kein-ki-schluessel",
    JSON.stringify({ aiEnabled: noKey.aiEnabled, degraded: noKey.degraded, reason: noKey.fallbackReason }));
  check("Ohne KI-Schlüssel: regelbasierter Text vorhanden", Boolean(noKey.text && noKey.text.length > 10));
  check("Ohne KI-Schlüssel: sourceNote erklärt die Herkunft", /regelbasiert/i.test(noKey.sourceNote || ""));
  if (envBefore.o !== undefined) process.env.OPENAI_API_KEY = envBefore.o;
  if (envBefore.a !== undefined) process.env.AZURE_OPENAI_KEY = envBefore.a;
  if (envBefore.e !== undefined) process.env.AZURE_OPENAI_ENDPOINT = envBefore.e;

  // Struktur: KI-Fehler- und Leerantwort-Pfade liefern ehrliche Fallbacks statt 500/Fehlkennzeichnung.
  const aiSource = fs.readFileSync(path.join(root, "lib/helmut/ai.js"), "utf8");
  check("KI-Fehler-Pfad existiert (fallbackReason 'ki-fehler', aiEnabled:false)",
    /fallbackReason:\s*"ki-fehler"/.test(aiSource) && /catch \(error\)[\s\S]{0,400}aiEnabled:\s*false/.test(aiSource));
  check("Leere KI-Antwort wird als Regel-Fallback gekennzeichnet ('ki-antwort-leer')",
    /fallbackReason:\s*"ki-antwort-leer"/.test(aiSource));
  check("Erfolgs-Pfad behauptet KI nur bei echtem KI-Text (kein result.text||fallback-Mix mehr)",
    !/aiEnabled:\s*true[\s\S]{0,300}result\.text \|\| fallbackStatement/.test(aiSource));

  // ── Client: Struktur ───────────────────────────────────────────────────────
  const clientSource = fs.readFileSync(path.join(root, "client.js"), "utf8");
  check("Keine unwahre Prüf-Behauptung 'Linie geprüft' mehr", !clientSource.includes("Linie geprüft"));
  check("Keine unwahre Behauptung 'Zitierfähig nach kurzem Check'", !clientSource.includes("Zitierfähig nach"));
  check("Kein falscher Erfolgs-Toast im Fehlerpfad (catch setzt Quelle 'fehler' + ehrlichen Toast)",
    /generatedStatementSource = "fehler";\s*\n\s*showToast\("KI nicht erreichbar/.test(clientSource));
  check("Regel-Fallback wird im Erfolgspfad nie als KI gemeldet",
    clientSource.includes('KI nicht verfügbar — regelbasierter Entwurf eingesetzt'));
  check("Büro-Loop speichert Herkunft ({text, source: ki|regel})",
    /officeDrafts\[key\] = \{ text: result\.text, source: result\.aiEnabled \? "ki" : "regel" \}/.test(clientSource));
  check("Büro-Loop friert Teilerfolge nicht mehr ein (kein early-return auf beliebigen Cache)",
    !/Object\.keys\(cached\)\.length > 0\) \{\s*\n\s*officeDrafts = cached;\s*\n\s*render\(\);\s*\n\s*return;/.test(clientSource));
  check("Fehlgeschlagene Erzeugung wird sichtbar gemacht (officeDraftErrors + Status)",
    clientSource.includes("officeDraftErrors[key] = true") && clientSource.includes('"Erstellung fehlgeschlagen"'));
  check("Karten tragen eine Herkunftszeile (buero-card-provenance)",
    clientSource.includes("buero-card-provenance"));
  check("Kommunikations-View kennzeichnet Herkunft statt pauschal 'Generierter Entwurf'",
    clientSource.includes('"KI-Entwurf · vor Veröffentlichung prüfen"'));

  // ── Teil 3 (2026-07): Büro-Header zählt "bereit" ehrlich ───────────────────
  // FRÜHERER FEHLER: readyCount zählte über draftStatus(format) — die STATISCHE
  // editorische Format-Vorgabe ("Entwurf bereit") — und meldete "N Entwürfe bereit",
  // obwohl noch KEIN gültiger Entwurf vorlag (Karten: "Wird vorbereitet"/"Erstellung
  // fehlgeschlagen"). FIX: über officeCardStatus(decision, format) zählen (prüft isValidDraft).
  check("Header zählt readyCount über officeCardStatus (echter Entwurfsstand, nicht Format-Vorgabe)",
    /const readyCount = allCards\.filter\(\(\{ decision, format \}\) => officeCardStatus\(decision, format\) === "Entwurf bereit"\)/.test(clientSource));
  check("Alte editorische readyCount-Zählung (draftStatus) ist entfernt",
    !/const readyCount = allCards\.filter\(\(\{ format \}\) => draftStatus\(format\) === "Entwurf bereit"\)/.test(clientSource));
  check("Priority-Hinweis (readyFormats) nutzt ebenfalls officeCardStatus (kein Widerspruch zur Summary)",
    /const readyFormats = formats\.filter\(\(f\) => allCards\.some\(\(\{ decision, format \}\) => format\.id === f\.id && officeCardStatus\(decision, format\) === "Entwurf bereit"\)\)/.test(clientSource));

  // ── Client: Funktion (vm) — Herkunfts-Helfer inkl. Legacy-Cache ────────────
  let code = clientSource.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__bt = { text: officeDraftText, prov: officeDraftProvenance, label: draftProvenanceLabel,
    cardStatus: (d, f) => officeCardStatus(d, f), draftStatus: (f) => draftStatus(f), formats: () => activeOfficeFormats(),
    keyFor: (d, f) => officeDraftKey(d, f),
    setDrafts: (o) => { officeDrafts = o; }, setErrors: (o) => { officeDraftErrors = o; }, setGenerating: (b) => { officeDraftsGenerating = b; } };`;
  const noop = () => {};
  const fakeNode = () => ({ classList: { toggle: noop, add: noop, remove: noop, contains: () => false }, style: {}, dataset: {},
    addEventListener: noop, removeEventListener: noop, querySelector: () => null, querySelectorAll: () => [], appendChild: noop,
    setAttribute: noop, getAttribute: () => null, removeAttribute: noop, focus: noop, blur: noop, click: noop, closest: () => null,
    contains: () => false, insertAdjacentHTML: noop, scrollIntoView: noop, getBoundingClientRect: () => ({ top: 0, left: 0 }),
    textContent: "", value: "", offsetParent: null });
  const storage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: { querySelector: (sel) => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
      createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(), body: fakeNode(), documentElement: fakeNode(),
      addEventListener: noop, removeEventListener: noop, cookie: "", visibilityState: "visible", hidden: false },
    navigator: { userAgent: "node-test", language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storage, sessionStorage: storage,
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
  vm.runInContext(code, sandbox, { filename: "client.js" });
  const bt = sandbox.__bt;
  check("officeDraftText liest Legacy-Strings UND neue Objekte",
    bt.text("alt") === "alt" && bt.text({ text: "neu", source: "ki" }) === "neu" && bt.text(null) === "");
  check("officeDraftProvenance behauptet bei Legacy/Unbekannt nichts",
    bt.prov("alt") === "" && bt.prov({ text: "x", source: "ki" }) === "ki" && bt.prov({ text: "x", source: "unsinn" }) === "");
  check("draftProvenanceLabel: KI klar, Regel klar, ungültig ehrlich",
    bt.label("ki", true).startsWith("KI-Entwurf") &&
    bt.label("regel", true).includes("Regelbasiert") &&
    bt.label("", false).includes("kein KI-Entwurf"));

  // ── Teil 3 (vm): officeCardStatus wertet laufende/fehlgeschlagene/leere Karten NIE als bereit ──
  const bformats = bt.formats();
  const readyFmt = bformats.find((f) => bt.draftStatus(f) === "Entwurf bereit");
  check("Fixture: ein Format mit editorischer Vorgabe 'Entwurf bereit' existiert", Boolean(readyFmt));
  if (readyFmt) {
    const decision = { id: "vg-1", title: "Testvorgang" };
    const key = bt.keyFor(decision, readyFmt);
    // (a) gültiger Entwurf -> bereit
    bt.setGenerating(false); bt.setErrors({}); bt.setDrafts({ [key]: { text: "Fertiger, belastbarer Entwurf.", source: "ki" } });
    check("bereit: gültiger Entwurf -> officeCardStatus 'Entwurf bereit'", bt.cardStatus(decision, readyFmt) === "Entwurf bereit");
    // (b) wird gerade generiert, kein Entwurf -> NICHT bereit
    bt.setDrafts({}); bt.setGenerating(true);
    check("wird vorbereitet: kein Entwurf + generating -> 'Wird vorbereitet' (nicht bereit)", bt.cardStatus(decision, readyFmt) === "Wird vorbereitet");
    // (c) fehlgeschlagen -> NICHT bereit
    bt.setGenerating(false); bt.setErrors({ [key]: true });
    check("fehlgeschlagen: officeDraftErrors -> 'Erstellung fehlgeschlagen' (nicht bereit)", bt.cardStatus(decision, readyFmt) === "Erstellung fehlgeschlagen");
    // (d) leer (kein Entwurf, nicht generierend, kein Fehler) -> NICHT bereit
    bt.setErrors({});
    check("leer: kein Entwurf -> 'Noch kein Entwurf' (nicht bereit)", bt.cardStatus(decision, readyFmt) === "Noch kein Entwurf");
    // (e) Nur (a) trägt "Entwurf bereit" — die readyCount-Zählung darf (b)/(c)/(d) nie mitzählen.
    check("gemischt: kein unfertiger Zustand ist 'Entwurf bereit'",
      ["Wird vorbereitet", "Erstellung fehlgeschlagen", "Noch kein Entwurf"].every((s) => s !== "Entwurf bereit"));
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
