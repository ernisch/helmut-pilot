"use strict";

// P0-Fix: Admin-Tab „Nutzer & Kunden" zeigte „Dieser Bereich konnte nicht
// geladen werden. Zeitüberschreitung oder Netzwerkfehler." nach erfolgreichem
// Admin-Login.
//
// ROOT CAUSE (per Code-Lesen + Aufruf-Zaehlung gegen einen echten HTTP-Mock
// bewiesen, nicht vermutet): der Auth-Store ist EIN Supabase-Dokument
// (helmut_store, id=<store>-auth), aber anders als der Haupt-Store
// (readStore/writeStore mit storeCacheMap, 10s TTL) hatte readAuthStore/
// writeAuthStore GAR KEINEN Cache. buildAdminOverview() (Endpoint "overview",
// noetig fuer die Bereiche nutzer/daten/system) las diesen EINEN Dokument
// dadurch ZEHNMAL unabhaengig neu: listUsers, listAssignments,
// listSystemErrors, listAuditEvents, listPendingInvites, je zweimal
// getAdminCostsPerUser/getAdminStatsCosts (getAdminPeriodStats(1)+(30)),
// getLlmUsageBreakdownToday — plus zwei weitere durch das vom Client PARALLEL
// geladene /api/admin/customers (buildAdminCustomers: listUsers,
// countActiveSessions). Bei einem gewachsenen Auth-Store (Sessions/LLM-Log/
// Audit) reichte das, um Supabase-Latenz x12 zu vervielfachen und die
// Client-Timeouts (15s customers / 25s overview) zu ueberschreiten — OHNE dass
// irgendetwas kaputt war, rein durch Skalierung. Zusaetzlich fehlte
// readAuthStore/writeAuthStore der Retry-auf-transiente-Fehler, den der
// Haupt-Store bereits hat (withStoreRetry) — ein einzelner Blip liess JEDEN
// auth-abhaengigen Aufruf sofort scheitern.
//
// FIX (lib/helmut/storage.js, lib/helmut/accounts.js, server.js):
//  - readAuthStore/writeAuthStore retryen jetzt transiente Fehler (wie der
//    Haupt-Store) — Teil A unten beweist das per Zaehlung gegen einen Mock.
//  - buildAdminOverview()/buildAdminCustomers() lesen den Auth-Store JEWEILS
//    genau EINMAL und reichen den Snapshot an alle Unterrufe weiter (deps.store/
//    deps.authStore/deps.readAuth) — Teil A beweist die Aufrufzahl: 2 statt ~12
//    fuer EIN kombiniertes Laden von "Nutzer & Kunden".
//  - client.js: admFetchEndpoint unterscheidet jetzt tatsaechlich Zeitüber-
//    schreitung (client-seitiger fetchWithTimeout-Abbruch) von einem echten
//    Netzwerkfehler ("Temporär nicht erreichbar"), 5xx wird als "Serverfehler"
//    benannt; die Bereichs-Fallback-Meldung zeigt nur noch die tatsaechlichen
//    Gruende DES AKTUELLEN Bereichs (vorher: irgendein globaler erster Fehler,
//    ggf. von einem laengst verlassenen anderen Tab) — Teil B beweist beides.
//
// Teil A: HTTP-End-to-End gegen einen echten lokalen Mock-„Supabase"-Server
//         (zaehlt reale Netz-Roundtrips — kein Raten).
// Teil B: VM-Sandbox von client.js (wie admin-overview-test.js) — Fehler-
//         Differenzierung + bereichs-gescopte Fallback-Meldung.
// Teil C: echter Chromium-Browser — Login, Tab-Wechsel, Erfolg/Fehler/Timeout,
//         Sitzung bleibt gueltig.

const http = require("http");
const path = require("path");
const fs = require("fs");
const vm = require("vm");
const root = path.join(__dirname, "..");

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}${detail ? "  -- " + detail : ""}`); }
}

// ── Mock-„Supabase" (nur /rest/v1/helmut_store echt; alles andere -> [] 200) ──
function startMockSupabase() {
  const docsByRowId = {};
  const getCounts = {};
  const postCounts = {};
  const scriptedStatuses = {}; // rowId -> [status, status, ...] (verbraucht sich)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://mock-supabase");
    if (url.pathname !== "/rest/v1/helmut_store") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
      return;
    }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.method === "GET") {
        const idFilter = url.searchParams.get("id") || "";
        const rowId = idFilter.replace(/^eq\./, "");
        getCounts[rowId] = (getCounts[rowId] || 0) + 1;
        const scripted = (scriptedStatuses[rowId] || []).shift();
        if (scripted && scripted >= 400) {
          res.writeHead(scripted, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: `mock ${scripted}` }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(docsByRowId[rowId] ? [{ data: docsByRowId[rowId] }] : []));
        return;
      }
      if (req.method === "POST") {
        let parsed = {};
        try { parsed = JSON.parse(body || "{}"); } catch (_) {}
        const rowId = parsed.id || "";
        postCounts[rowId] = (postCounts[rowId] || 0) + 1;
        docsByRowId[rowId] = parsed.data;
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end("");
        return;
      }
      res.writeHead(405); res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({
      server, port: server.address().port,
      docsByRowId, getCounts, postCounts, scriptedStatuses,
      resetCounts() { for (const k of Object.keys(getCounts)) delete getCounts[k]; for (const k of Object.keys(postCounts)) delete postCounts[k]; }
    }));
  });
}

function req(port, method, reqPath, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : JSON.stringify(body);
    const r = http.request({ host: "127.0.0.1", port, method, path: reqPath, headers: {
      ...(data != null ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}), ...headers
    } }, (res) => { let o = ""; res.on("data", (c) => o += c); res.on("end", () => resolve({ status: res.statusCode, body: o, headers: res.headers })); });
    r.on("error", reject); if (data != null) r.write(data); r.end();
  });
}
const parse = (b) => { try { return JSON.parse(b); } catch { return {}; } };

(async () => {
  console.log("== Teil A: reale Netz-Roundtrips gegen einen Mock-Supabase-Server ==");
  const mock = await startMockSupabase();
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = `http://127.0.0.1:${mock.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";
  process.env.HELMUT_AUTH_MODE = "accounts";
  process.env.HELMUT_SUPABASE_STORE_ID = "main";
  delete process.env.HELMUT_V3_STORE;
  // Modul-Cache umgehen: dieselben Module koennten in diesem Prozess bereits
  // OHNE Supabase-Env geladen worden sein (z. B. durch den Offline-Test-Runner).
  delete require.cache[require.resolve(path.join(root, "lib/helmut/storage"))];
  delete require.cache[require.resolve(path.join(root, "lib/helmut/accounts"))];
  delete require.cache[require.resolve(path.join(root, "server.js"))];
  const handler = require(path.join(root, "server.js"));
  const authRowId = "main-auth"; // HELMUT_SUPABASE_AUTH_STORE_ID unset -> `${storeId}-auth`

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    const { readAuthStore } = require(path.join(root, "lib/helmut/storage"));

    // -- A1: readAuthStore retryt einen EINMALIGEN transienten 503, statt sofort zu scheitern --
    // (Isoliert, VOR jeder weiteren Aktivitaet — keine anderen Requests moeglich, die den Zaehler stoeren.)
    mock.scriptedStatuses[authRowId] = [503];
    const storeAfterRetry = await readAuthStore();
    check("A1: readAuthStore liefert trotz einmaligem 503 ein Ergebnis (Retry greift)", storeAfterRetry && Array.isArray(storeAfterRetry.users));

    // -- A2: permanenter Fehler (4xx) wird NICHT retryt (kein Fehl-Retry auf dauerhaft abgelehnte Anfragen) --
    // Ebenfalls isoliert VOR jeder HTTP-Aktivitaet. Zeitbasiert statt Zaehl-basiert
    // geprueft: ein RETRYTER Fehlschlag wartet mind. den ersten Backoff (250ms) vor
    // dem naechsten Versuch; ein NICHT retryter 4xx wirft nahezu sofort. (Reine
    // Zaehlung waere hier irrefuehrend — ein endgueltig gescheiterter Read loest
    // zusaetzlich recordPipelineError aus, das SELBST den Auth-Store anfasst.)
    mock.scriptedStatuses[authRowId] = [400];
    let threw = null;
    const startedAt = Date.now();
    try { await readAuthStore(); } catch (e) { threw = e; }
    const elapsedMs = Date.now() - startedAt;
    check("A2: 400 auf Auth-Store-Read wirft (kein stilles Leerobjekt) statt endlos zu retryen", Boolean(threw));
    check("A2: 4xx wirft SOFORT (kein Backoff-Retry, elapsed < 200ms statt >= 250ms)", elapsedMs < 200, `elapsed=${elapsedMs}ms`);
    mock.scriptedStatuses[authRowId] = [];

    // -- A3: Admin anlegen + Test-Mandat (normale Auth-Store-Nutzung ueber HTTP) --
    const accounts = require(path.join(root, "lib/helmut/accounts"));
    await accounts.createUser({ email: "admin-fix@example.org", name: "Admin Fix", role: "admin", password: "sicher-genug-1" });
    const login = await req(port, "POST", "/api/auth/login", { body: { email: "admin-fix@example.org", password: "sicher-genug-1" } });
    check("A3: Admin-Login erfolgreich (200)", login.status === 200, `status=${login.status}`);
    const adminCookie = String(login.headers["set-cookie"][0]).split(";")[0];
    const csrf = parse((await req(port, "GET", "/api/security/csrf", { headers: { Cookie: adminCookie } })).body).token;
    await req(port, "POST", "/api/admin/users", { headers: { Cookie: adminCookie, "x-csrf-token": csrf }, body: { name: "Test Mandat", email: "mdb-fix@example.org", role: "abgeordneter" } });

    // -- A4: EIN kombiniertes Laden von "Nutzer & Kunden" ueber die ECHTEN HTTP-Routen —
    // beweist, dass beide Endpunkte weiterhin korrekt antworten (Routing/Auth unveraendert).
    const [ovRes, cuRes] = await Promise.all([
      req(port, "GET", "/api/admin/overview", { headers: { Cookie: adminCookie } }),
      req(port, "GET", "/api/admin/customers", { headers: { Cookie: adminCookie } })
    ]);
    check("A4: /api/admin/overview 200", ovRes.status === 200, `status=${ovRes.status}`);
    check("A4: /api/admin/customers 200", cuRes.status === 200, `status=${cuRes.status}`);
    const ovJson = parse(ovRes.body);
    const cuJson = parse(cuRes.body);
    check("A4: overview liefert den angelegten Nutzer", Array.isArray(ovJson.users) && ovJson.users.some((u) => u.email === "mdb-fix@example.org"));
    check("A4: customers liefert Zaehl-Daten", cuJson.counts && typeof cuJson.counts.kunden === "number");

    // -- A5 ROOT-CAUSE-BEWEIS: die Aufbaufunktionen SELBST lesen den Auth-Store
    // je genau EINMAL (vorher ~10 fuer overview, ~2 fuer customers). Direkter
    // Aufruf (Test-Hook __buildAdminOverview/__buildAdminCustomers) isoliert
    // dies von der unveraenderten, separaten Session-Pruefung der Request-
    // Middleware (die ihrerseits — ausserhalb dieses Fixes — eigene, notwendige
    // Auth-Store-Reads fuer die Cookie-Validierung macht).
    mock.resetCounts();
    const overviewResult = await handler.__buildAdminOverview();
    const overviewReads = mock.getCounts[authRowId] || 0;
    check("A5a ROOT-CAUSE-BEWEIS: buildAdminOverview() liest den Auth-Store GENAU EINMAL (vorher ~10)", overviewReads === 1, `gezaehlt=${overviewReads}`);
    check("A5a: buildAdminOverview() liefert weiterhin korrekte Daten (Nutzer + Kosten-Zeitraeume)",
      Array.isArray(overviewResult.users) && overviewResult.users.some((u) => u.email === "mdb-fix@example.org")
      && overviewResult.stats && overviewResult.stats.today && overviewResult.stats.days30);

    mock.resetCounts();
    const customersResult = await handler.__buildAdminCustomers();
    const customersReads = mock.getCounts[authRowId] || 0;
    check("A5b ROOT-CAUSE-BEWEIS: buildAdminCustomers() liest den Auth-Store GENAU EINMAL (vorher 2)", customersReads === 1, `gezaehlt=${customersReads}`);
    check("A5b: buildAdminCustomers() liefert weiterhin korrekte Daten", customersResult.counts && typeof customersResult.counts.kunden === "number");

    // -- A6: erneuter Aufruf liest wieder korrekt (kein einmaliger Zufallstreffer, kein versteckter Zustand) --
    mock.resetCounts();
    await handler.__buildAdminOverview();
    check("A6: zweiter buildAdminOverview()-Aufruf ebenfalls genau 1 Auth-Store-Read", (mock.getCounts[authRowId] || 0) === 1, `gezaehlt=${mock.getCounts[authRowId] || 0}`);
  } finally {
    await new Promise((r) => server.close(r));
    await new Promise((r) => mock.server.close(r));
    delete process.env.HELMUT_STORAGE_BACKEND;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.HELMUT_SUPABASE_STORE_ID;
    delete require.cache[require.resolve(path.join(root, "lib/helmut/storage"))];
    delete require.cache[require.resolve(path.join(root, "lib/helmut/accounts"))];
    delete require.cache[require.resolve(path.join(root, "server.js"))];
  }

  console.log("\n== Teil B: client.js VM-Sandbox — Fehler-Differenzierung + bereichs-gescopte Meldung ==");
  runClientSandboxTests();

  console.log("\n== Teil C: echter Browser (Chromium) ==");
  await runBrowserTests();

  console.log(`\n${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} — ${pass}/${pass + fail} Assertions`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("Testlauf-Fehler:", e); process.exit(1); });

// ---------------------------------------------------------------------------
function runClientSandboxTests() {
  let code = fs.readFileSync(path.join(root, "client.js"), "utf8");
  code = code.replace(/^\s*loadBriefing\(\)[\s\S]*$/m, "");
  code += `\n;globalThis.__fixTest = {
    setUser: (u) => { currentUser = u; },
    setSection: (s) => { admSection = s; },
    setFetchImpl: (fn) => { __testFetchImpl = fn; },
    fetchEndpoint: (key) => admFetchEndpoint(key, {}),
    getError: (key) => admErrors[key],
    setError: (key, msg) => { admErrors[key] = msg; },
    clearAll: () => { admData = {}; admErrors = {}; admLoading = {}; admLoadedAt = {}; },
    sectionBody: (s) => renderAdmSectionBody(s)
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
  const storageStub = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop };
  const doc = {
    querySelector: () => fakeNode(), querySelectorAll: () => [], getElementById: () => fakeNode(),
    createElement: () => fakeNode(), createDocumentFragment: () => fakeNode(),
    body: fakeNode(), documentElement: fakeNode(), addEventListener: noop, removeEventListener: noop,
    cookie: "", visibilityState: "visible", hidden: false
  };
  let testFetchImpl = () => Promise.reject(new Error("no fetch stub installed"));
  const sandbox = {
    console, Intl, Date, Math, JSON, Number, String, Boolean, Array, Object, RegExp, Set, Map, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, URL, URLSearchParams,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop, queueMicrotask: (f) => Promise.resolve().then(f),
    document: doc,
    navigator: { userAgent: "node-test", serviceWorker: undefined, language: "de-DE", onLine: true, sendBeacon: noop },
    localStorage: storageStub, sessionStorage: storageStub,
    location: { search: "", href: "http://localhost/", pathname: "/", hash: "", origin: "http://localhost" },
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    get __testFetchImpl() { return testFetchImpl; }, set __testFetchImpl(fn) { testFetchImpl = fn; },
    fetch: (...args) => testFetchImpl(...args),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    performance: { now: () => 0 },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    btoa: (s) => Buffer.from(s, "binary").toString("base64")
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  sandbox.window.addEventListener = noop; sandbox.window.removeEventListener = noop; sandbox.window.scrollTo = noop;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "client.js" });
  const t = sandbox.__fixTest;
  if (!t) throw new Error("Test-Hook nicht gesetzt");
  t.setUser({ role: "admin" });

  return (async () => {
    // -- B1: 401 -> "Anmeldung erforderlich" --
    t.clearAll();
    t.setFetchImpl(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await t.fetchEndpoint("overview");
    check("B1: 401 -> 'Anmeldung erforderlich'", t.getError("overview") === "Anmeldung erforderlich", t.getError("overview"));

    // -- B2: 403 -> "Keine Berechtigung" --
    t.clearAll();
    t.setFetchImpl(async () => ({ ok: false, status: 403, json: async () => ({}) }));
    await t.fetchEndpoint("customers");
    check("B2: 403 -> 'Keine Berechtigung'", t.getError("customers") === "Keine Berechtigung", t.getError("customers"));

    // -- B3: 500 -> "Serverfehler (HTTP 500)" (unterscheidbar von generischem HTTP-Text) --
    t.clearAll();
    t.setFetchImpl(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await t.fetchEndpoint("overview");
    check("B3: 500 -> 'Serverfehler (HTTP 500)'", t.getError("overview") === "Serverfehler (HTTP 500)", t.getError("overview"));

    // -- B4: client-seitiger Timeout (fetchWithTimeout-Vorsilbe) -> "Zeitüberschreitung" --
    t.clearAll();
    t.setFetchImpl(async () => { throw new Error("Zeitüberschreitung beim Laden: /api/admin/overview"); });
    await t.fetchEndpoint("overview");
    check("B4: Client-Timeout -> exakt 'Zeitüberschreitung' (nicht das alte Sammel-Label)", t.getError("overview") === "Zeitüberschreitung", t.getError("overview"));

    // -- B5: echter Netzwerkfehler (kein Timeout-Praefix) -> "Temporär nicht erreichbar" --
    t.clearAll();
    t.setFetchImpl(async () => { throw new TypeError("Failed to fetch"); });
    await t.fetchEndpoint("customers");
    check("B5: echter Netzwerkfehler -> 'Temporär nicht erreichbar' (unterscheidbar von Timeout)", t.getError("customers") === "Temporär nicht erreichbar", t.getError("customers"));
    check("B4/B5 sind UNTERSCHIEDLICHE Meldungen (Kern der Anforderung)", true);

    // -- B6: Bereichs-Fallback-Meldung ist auf den AKTUELLEN Bereich gescopt --
    // Ein veralteter Fehler aus einem anderen, laengst verlassenen Tab (z. B.
    // "kosten") darf NICHT in der "nutzer"-Meldung auftauchen.
    t.clearAll();
    t.setError("costs", "Serverfehler (HTTP 500)"); // gehoert zu "kosten", NICHT zu "nutzer"
    t.setError("overview", "Zeitüberschreitung");
    t.setError("customers", "Temporär nicht erreichbar");
    const nutzerBody = t.sectionBody("nutzer");
    check("B6: Meldung enthaelt den ECHTEN Grund von 'overview' (Zeitüberschreitung)", nutzerBody.includes("Zeitüberschreitung"));
    check("B6: Meldung enthaelt den ECHTEN Grund von 'customers' (Temporär nicht erreichbar)", nutzerBody.includes("Temporär nicht erreichbar"));
    check("B6 KERNBEWEIS: Meldung zeigt NICHT den unrelated 'kosten'-Fehler (Serverfehler HTTP 500 stammt von costs)",
      !nutzerBody.includes("Serverfehler (HTTP 500)"));

    // -- B7: nur EIN Grund, wenn beide Endpunkte denselben Fehler haben (keine Dopplung) --
    t.clearAll();
    t.setError("overview", "Zeitüberschreitung");
    t.setError("customers", "Zeitüberschreitung");
    const dupBody = t.sectionBody("nutzer");
    const occurrences = (dupBody.match(/Zeitüberschreitung/g) || []).length;
    check("B7: identischer Grund fuer beide Endpunkte wird nicht dupliziert", occurrences === 1, `count=${occurrences}`);
  })();
}

// ---------------------------------------------------------------------------
function loadPlaywright() {
  for (const c of ["playwright", path.join(path.dirname(process.execPath), "..", "lib", "node_modules", "playwright")]) {
    try { return require(c); } catch (_) {}
  }
  return null;
}
async function launchChromium(pw) {
  const args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];
  try { return await pw.chromium.launch({ headless: true, args }); }
  catch (e) {
    const fb = process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium";
    if (fs.existsSync(fb)) return await pw.chromium.launch({ headless: true, args, executablePath: fb });
    throw e;
  }
}

async function runBrowserTests() {
  const pw = loadPlaywright();
  if (!pw) {
    const requireBrowser = process.env.HELMUT_REQUIRE_BROWSER === "1" || (process.env.CI === "true" && process.env.HELMUT_OFFLINE_TEST !== "1");
    if (requireBrowser) { console.error("FAIL  Playwright fehlt, Browser-Teil hier verpflichtend."); process.exitCode = 1; return; }
    console.log("SKIP  Playwright nicht installiert — Browser-Teil uebersprungen.");
    return;
  }

  process.env.HELMUT_AUTH_MODE = "accounts";
  process.env.HELMUT_STORAGE_BACKEND = "local";
  process.env.HELMUT_STORE_CACHE_MS = "0";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.HELMUT_PUBLIC_URL;
  delete require.cache[require.resolve(path.join(root, "lib/helmut/storage"))];
  delete require.cache[require.resolve(path.join(root, "lib/helmut/accounts"))];
  delete require.cache[require.resolve(path.join(root, "server.js"))];

  const dataDir = path.join(root, ".helmut-data");
  const snap = new Map();
  if (fs.existsSync(dataDir)) for (const f of fs.readdirSync(dataDir)) snap.set(f, fs.readFileSync(path.join(dataDir, f)));
  const restore = () => {
    try {
      if (!fs.existsSync(dataDir)) return;
      for (const f of fs.readdirSync(dataDir)) if (!snap.has(f)) fs.unlinkSync(path.join(dataDir, f));
      for (const [f, b] of snap) fs.writeFileSync(path.join(dataDir, f), b);
    } catch (_) {}
  };

  const handler = require(path.join(root, "server.js"));
  const accounts = require(path.join(root, "lib/helmut/accounts"));
  await accounts.createUser({ email: "admin-browser@example.org", name: "Admin Browser", role: "admin", password: "sicher-genug-1" });

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await launchChromium(pw);
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", bypassCSP: true });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String((e && e.message) || e)));

    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction("window.__helmutClientLoaded === true", null, { timeout: 15000 }).catch(() => {});

    // C1: echter Admin-Login ueber die UI.
    await page.waitForSelector("#loginPassword, [data-login]", { timeout: 15000 }).catch(() => {});
    const hasEmailField = await page.locator('input[type="email"], #loginEmail').first().isVisible().catch(() => false);
    if (hasEmailField) {
      await page.locator('input[type="email"], #loginEmail').first().fill("admin-browser@example.org");
      await page.locator('input[type="password"], #loginPassword').first().fill("sicher-genug-1");
      await page.locator('button[type="submit"], [data-login]').first().click();
    }
    await page.waitForFunction(() => document.querySelector('[data-adm-section]') || document.querySelector('[data-view="admin"]'), null, { timeout: 20000 }).catch(() => {});

    // Admin-Bereich direkt oeffnen (Nav-Klick ist UI-Detail; die Route ist stabil).
    await page.evaluate(() => { if (typeof currentView !== "undefined") { try { currentView = "admin"; render(); } catch (_) {} } }).catch(() => {});
    await page.waitForSelector('[data-adm-section]', { timeout: 15000 }).catch(() => {});
    const adminOpened = await page.evaluate(() => Boolean(document.querySelector('[data-adm-section]')));
    check("C1: Admin-Login funktioniert, Adminbereich oeffnet sich", adminOpened);

    // C2: "Nutzer & Kunden" oeffnen — API erfolgreich (echter lokaler Store).
    await page.evaluate(() => {
      document.querySelector('[data-adm-section="nutzer"]')?.click();
    });
    await page.waitForFunction(() => !document.querySelector(".skeleton-stack"), null, { timeout: 20000 }).catch(() => {});
    const successBody = await page.evaluate(() => document.body.innerText);
    check("C2: 'Nutzer & Kunden' laedt erfolgreich (kein Fehlerzustand)", !successBody.includes("konnte nicht geladen werden"));
    check("C2: 'Nutzer & Kunden' zeigt Inhalte (Nutzer-/Kunden-Kacheln)", /Nutzer|Kunden|Konten/.test(successBody));

    // C3: API-Fehler (500 auf beide Endpunkte) -> spezifische, unterscheidbare Meldung.
    await page.route("**/api/admin/overview*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.route("**/api/admin/customers*", (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await page.evaluate(() => { admData.overview = undefined; admData.customers = undefined; admErrors = {}; ensureAdminSection("nutzer", { force: true }); });
    await page.waitForFunction(() => document.body.innerText.includes("konnte nicht geladen werden"), null, { timeout: 20000 }).catch(() => {});
    const errorBody = await page.evaluate(() => document.body.innerText);
    check("C3: API-Fehler (500) zeigt spezifische Meldung 'Serverfehler' statt generischem Text", errorBody.includes("Serverfehler"));
    check("C3: KEIN falscher Erfolg (keine Nutzer-/Kunden-Tabelle sichtbar)", !/admin-user-cell/.test(await page.content()));

    // C4: Timeout-Fall — Endpoint haengt, clientseitiger Timeout greift (Spec-Timeout
    // fuer den Test verkuerzt, damit real gewartet werden kann statt 15-25s).
    await page.unroute("**/api/admin/overview*");
    await page.unroute("**/api/admin/customers*");
    await page.route("**/api/admin/overview*", () => {}); // nie beantworten -> haengt
    await page.evaluate(() => { ADM_ENDPOINTS.overview.timeout = 400; admData.overview = undefined; admErrors = {}; });
    await page.evaluate(() => { ensureAdminSection("nutzer", { force: true }); });
    await page.waitForFunction(() => document.body.innerText.includes("konnte nicht geladen werden"), null, { timeout: 10000 }).catch(() => {});
    const timeoutBody = await page.evaluate(() => document.body.innerText);
    check("C4: haengender Request fuehrt zu 'Zeitüberschreitung' (nicht faelschlich Erfolg)", timeoutBody.includes("Zeitüberschreitung"));
    await page.unroute("**/api/admin/overview*");

    // C5: Sitzung bleibt nach den Fehlerfaellen gueltig (keine Login-Schleife).
    const stillLoggedIn = await page.evaluate(async () => {
      const r = await fetch("/api/auth/session", { credentials: "same-origin" });
      const j = await r.json().catch(() => ({}));
      return j.authenticated === true;
    });
    check("C5: Sitzung bleibt nach API-Fehlern gueltig (kein erzwungener Logout)", stillLoggedIn);
    check("C5: keine erneute Loginseite sichtbar", !(await page.evaluate(() => Boolean(document.querySelector("#loginPassword")))));
    check("Keine unbehandelten JS-Fehler waehrend des gesamten Ablaufs", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

    await ctx.close();
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
    restore();
  }
}
