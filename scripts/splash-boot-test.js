"use strict";

// Regressionstest fuer den Splash-/Boot-Hotfix (Android/Brave "haengt im Splash").
// Prueft: (a) den index.html-Watchdog VERHALTENSBASIERT (Fake-DOM + Fake-Timer),
// (b) statische Garantien in client.js (Boot-Sicherheitsnetz, Auth-Timeout,
// hideStartupSplash-Aufrufe) und styles.css (kein Kaesten hinter dem H).
// KEIN Netz, KEINE KI, KEINE Mutation.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// --- Fake-DOM/Timer-Harness fuer den Inline-Watchdog ------------------------
function makeEnv({ startsLoading = true } = {}) {
  const timers = [];
  const classes = new Set(startsLoading ? ["is-loading"] : []);
  const splash = { style: { display: "" } };
  const app = { innerHTML: "", children: [], querySelector: () => (classes.has("is-loading") ? { loading: true } : null) };
  const body = {
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (x) => classes.has(x),
    },
  };
  const document = {
    body,
    getElementById: (id) => (id === "appSplash" ? splash : id === "app" ? app : null),
  };
  const win = {
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    location: { reload: () => {} },
  };
  win.window = win;
  return { win, document, timers, classes, splash, app, runTimersUpTo: (ms) => {
    timers.filter((t) => t.ms <= ms).sort((a, b) => a.ms - b.ms).forEach((t) => t.fn());
  } };
}

// Inline-Watchdog-IIFE aus index.html extrahieren (das zweite <script> ohne src).
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const watchdog = scripts.find((s) => s.includes("__helmutClientLoaded") && s.includes("is-loading"));
check("index.html: Watchdog-Script vorhanden", Boolean(watchdog));

// Fall 1: App startet NICHT (bleibt is-loading) -> Watchdog entfernt Splash + zeigt Neu-laden.
{
  const env = makeEnv({ startsLoading: true });
  const sandbox = { window: env.win, document: env.document, setTimeout: env.win.setTimeout };
  sandbox.window.document = env.document;
  vm.createContext(sandbox);
  vm.runInContext(watchdog, sandbox);
  // client.js kam nie an -> __helmutClientLoaded bleibt undefined -> Stufe-1 (8s)
  env.runTimersUpTo(8000);
  check("Watchdog Fall1: Splash-Overlay wird versteckt (display:none)", env.splash.style.display === "none");
  check("Watchdog Fall1: is-loading entfernt", !env.classes.has("is-loading"));
  check("Watchdog Fall1: splash-gone gesetzt", env.classes.has("splash-gone"));
  check("Watchdog Fall1: Neu-laden-Ansicht mit Button", /Neu laden/.test(env.app.innerHTML) && /reload\(\)/.test(env.app.innerHTML));
}

// Fall 2: App startet erfolgreich (is-loading vor Timeout entfernt) -> Watchdog wirkt NICHT.
{
  const env = makeEnv({ startsLoading: true });
  const sandbox = { window: env.win, document: env.document, setTimeout: env.win.setTimeout };
  vm.createContext(sandbox);
  vm.runInContext(watchdog, sandbox);
  env.win.__helmutClientLoaded = true;      // client.js lief
  env.classes.delete("is-loading");         // hideStartupSplash lief (App sichtbar)
  env.app.innerHTML = "<main>echte App</main>";
  env.runTimersUpTo(30000);
  check("Watchdog Fall2: gestartete App wird NICHT ueberschrieben", /echte App/.test(env.app.innerHTML));
}

// Fall 3: client.js geladen, aber Laufzeit-Hang (bleibt is-loading) -> Stufe-2 (30s) rettet.
{
  const env = makeEnv({ startsLoading: true });
  const sandbox = { window: env.win, document: env.document, setTimeout: env.win.setTimeout };
  vm.createContext(sandbox);
  vm.runInContext(watchdog, sandbox);
  env.win.__helmutClientLoaded = true;      // client.js lief -> Stufe-1 greift NICHT
  env.runTimersUpTo(8000);
  check("Watchdog Fall3: Stufe-1 greift nicht, wenn client.js geladen", env.splash.style.display !== "none");
  env.runTimersUpTo(30000);                 // Laufzeit-Hang -> Stufe-2
  check("Watchdog Fall3: Stufe-2 entfernt Splash nach Hang", env.splash.style.display === "none" && /Neu laden/.test(env.app.innerHTML));
}

// --- Statische Garantien in client.js --------------------------------------
check("client.js: setzt __helmutClientLoaded am Anfang", /window\.__helmutClientLoaded\s*=\s*true/.test(client.slice(0, 2000)));
check("client.js: globaler error-Handler registriert", /addEventListener\(\s*["']error["']/.test(client.slice(0, 2500)));
check("client.js: globaler unhandledrejection-Handler registriert", /addEventListener\(\s*["']unhandledrejection["']/.test(client.slice(0, 2500)));
check("client.js: error-Handler ignoriert Ressourcen-Ladefehler (target.tagName)", /target\.tagName/.test(client.slice(0, 2500)));
check("client.js: fetchAuthState nutzt Timeout (kein rohes fetch)", /fetchWithTimeout\("\/api\/auth\/session"[^)]*\d{3,5}\s*\)/.test(client));
check("client.js: fetchAuthState nutzt KEIN rohes fetch mehr", !/=\s*await\s+fetch\("\/api\/auth\/session"/.test(client));
check("client.js: hideStartupSplash in renderLogin", /function renderLogin[\s\S]{0,80}hideStartupSplash\(\)/.test(client));
check("client.js: hideStartupSplash in renderPilotAccess", /function renderPilotAccess[\s\S]{0,80}hideStartupSplash\(\)/.test(client));
// Boot-Aufrufkette am Dateiende: loadBriefing().then(...).catch(...) mit hideStartupSplash.
const bootTail = client.slice(client.lastIndexOf("loadBriefing()\n") >= 0 ? client.lastIndexOf("loadBriefing()") : client.length - 2000);
check("client.js: hideStartupSplash im Boot-catch (loadBriefing)", /\.catch\(/.test(bootTail) && /hideStartupSplash\(\)/.test(bootTail));

// --- styles.css: kein Kaesten hinter dem H ---------------------------------
const logoRule = (css.match(/\.loading-logo\s*\{[\s\S]*?\}/) || [""])[0];
check("styles.css: .loading-logo ohne gefuellten Hintergrund", /background:\s*transparent/.test(logoRule) && !/background:\s*rgba\(9/.test(logoRule));
check("styles.css: .loading-logo ohne Rahmen", /border:\s*0/.test(logoRule) && !/border:\s*1px/.test(logoRule));
check("styles.css: .loading-logo ohne Schatten", /box-shadow:\s*none/.test(logoRule));
// H-Typografie/Position bleibt: width/height/color unveraendert vorhanden.
check("styles.css: .loading-logo behaelt Groesse/Farbe (H unveraendert)", /width:\s*58px/.test(logoRule) && /color:\s*#fbf7ef/.test(logoRule));

console.log(`\n${passed}/${passed + failed} Splash-Boot-Assertions erfolgreich.`);
if (failed > 0) { console.error(`FEHLGESCHLAGEN: ${failed}`); process.exit(1); }
