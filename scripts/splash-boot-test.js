"use strict";

// Regressionstest fuer den Splash-/Boot-Hotfix (Android/Brave "haengt im Splash").
// Prueft PRIMAER die TATSAECHLICH ausgelieferte Production-Shell aus
// server.js.__indexHtml() (der Server nutzt ein eigenes Template, NICHT die
// Datei index.html direkt — siehe Kommentar bei SPLASH_WATCHDOG_SCRIPT in
// server.js). Zusaetzlich: Konsistenzpruefung index.html <-> server.js (keine
// unbemerkte Drift), Guard-Variable gegen doppelte Timer, sowie die
// bestehenden statischen Garantien in client.js/styles.css.
// KEIN Netz, KEINE KI, KEINE Mutation.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const serverModule = require(path.join(root, "server.js"));
const productionShell = serverModule.__indexHtml();

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

// --- Pflichtprüfung: die TATSAECHLICH ausgelieferte Production-Shell -------
console.log("Production-Shell (server.js __indexHtml())");
check("Production Shell enthaelt den Watchdog (Guard-Variable vorhanden)",
  productionShell.includes("__helmutSplashWatchdogInstalled"));
check("Production Shell: Watchdog steht NACH dem client.js-Script (laedt weiterhin zuerst)",
  productionShell.indexOf('<script src="client.js') < productionShell.indexOf("__helmutSplashWatchdogInstalled"));
check("Production Shell: appSplash/loading-screen/app-Grundgeruest unveraendert vorhanden",
  productionShell.includes('id="appSplash"') && productionShell.includes('id="app"') && productionShell.includes("loading-screen"));

// Watchdog-IIFE aus der ECHTEN Production-Shell extrahieren (nicht aus index.html).
const shellScripts = [...productionShell.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const watchdog = shellScripts.find((s) => s.includes("__helmutClientLoaded") && s.includes("is-loading"));
check("Production Shell: Watchdog-Script extrahierbar", Boolean(watchdog));

// --- Konsistenz index.html <-> server.js (keine unbemerkte Drift) ----------
console.log("\nKonsistenz index.html <-> server.js");
const indexScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const indexWatchdog = indexScripts.find((s) => s.includes("__helmutClientLoaded") && s.includes("is-loading"));
const normalize = (s) => (s || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
check("index.html-Watchdog UND server.js-Watchdog sind funktional identisch (Kommentare/Whitespace ignoriert)",
  Boolean(indexWatchdog) && normalize(indexWatchdog) === normalize(watchdog));

// Fall 1: App startet NICHT (bleibt is-loading) -> Watchdog entfernt Splash + zeigt Neu-laden.
console.log("\nWatchdog-Verhalten (gegen die echte Production-Shell)");
{
  const env = makeEnv({ startsLoading: true });
  const sandbox = { window: env.win, document: env.document, setTimeout: env.win.setTimeout };
  sandbox.window.document = env.document;
  vm.createContext(sandbox);
  vm.runInContext(watchdog, sandbox);
  // client.js kam nie an -> __helmutClientLoaded bleibt undefined -> Stufe-1 (8s)
  env.runTimersUpTo(8000);
  check("Watchdog Fall1 (Stufe 1): Splash-Overlay wird versteckt (display:none)", env.splash.style.display === "none");
  check("Watchdog Fall1: is-loading entfernt", !env.classes.has("is-loading"));
  check("Watchdog Fall1: splash-gone gesetzt", env.classes.has("splash-gone"));
  check("Watchdog Fall1: Neu-laden-Ansicht mit Button erscheint", /Neu laden/.test(env.app.innerHTML) && /reload\(\)/.test(env.app.innerHTML));
}

// Fall 2: App startet erfolgreich (is-loading vor Timeout entfernt) -> Watchdog wirkt NICHT,
// normaler Start wird NICHT verzoegert (vor Ablauf der Timer passiert nichts).
{
  const env = makeEnv({ startsLoading: true });
  const sandbox = { window: env.win, document: env.document, setTimeout: env.win.setTimeout };
  vm.createContext(sandbox);
  vm.runInContext(watchdog, sandbox);
  // Vor JEDEM Timer-Ablauf darf der Watchdog nichts tun (kein verzoegerter Normalstart).
  check("Watchdog Fall2: vor Timer-Ablauf unveraendert (kein verzoegerter Normalstart)",
    env.splash.style.display === "" && env.classes.has("is-loading"));
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
  check("Watchdog Fall3 (Stufe 2): entfernt Splash nach Boot-Hang + Neu-laden-Ansicht", env.splash.style.display === "none" && /Neu laden/.test(env.app.innerHTML));
}

// Fall 4: Guard-Variable verhindert doppelte Timer, falls das Skript zweimal
// im selben Dokument ausgefuehrt wird (Robustheit, kein Doppel-Feuer).
{
  const env = makeEnv({ startsLoading: true });
  const sandbox = { window: env.win, document: env.document, setTimeout: env.win.setTimeout };
  vm.createContext(sandbox);
  vm.runInContext(watchdog, sandbox);
  vm.runInContext(watchdog, sandbox); // zweite Ausfuehrung im selben Kontext
  check("Watchdog Fall4: Guard-Variable verhindert doppelte Timer-Registrierung",
    env.timers.length === 2, `${env.timers.length} Timer registriert (erwartet 2, nicht 4)`);
}

// --- client.js laedt weiterhin korrekt aus der Production-Shell ------------
console.log("\nclient.js-Ladepfad in der Production-Shell");
check("Production Shell: client.js-Script-Tag mit Asset-Version vorhanden",
  /<script src="client\.js\?v=[^"]+"><\/script>/.test(productionShell));
check("Production Shell: genau EIN client.js-Script-Tag (kein Doppel-Laden)",
  (productionShell.match(/<script src="client\.js/g) || []).length === 1);

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
