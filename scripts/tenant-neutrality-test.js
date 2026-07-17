"use strict";

// =============================================================================
// Mandantenneutralitaets-Suite — beweist: KEIN bevorzugter/Pilot-/Default-Mandant
// =============================================================================
// Offline, in-process, lokaler Datei-Store (kein Netz, kein Supabase, keine KI).
// Beweist die geforderten Punkte der Nachbesserung:
//   1)  Das Repository enthaelt weder HELMUT_PILOT_TENANT_ID noch ein semantisch
//       gleichartiges Pilot-/Default-/Fallback-/Primary-Tenant-Konstrukt.
//   2)  Ein einzelner aktiver Datenbankmandant wird OHNE Tenant-Env gefunden.
//   3)  Zwei aktive Datenbankmandanten werden OHNE Tenant-Env isoliert verarbeitet.
//   4)  Null aktive Mandanten fuehren zu KEINEM geratenen/kuenstlichen Mandanten.
//   5)  Eine normale authentifizierte Anfrage funktioniert ohne Pilotkonfiguration.
//   6)  Ein fehlender (authentifizierter) Mandantenkontext bricht sicher ab.
//   7)  Der bestehende Mandant benoetigt nach dem Merge KEINE neue Env-Variable.
//   8)  Ein gueltiger DB-Kontext verursacht ohne Zusatzkonfiguration weder 503
//       noch leere Cron-Laeufe.
// Zusaetzlich: Mandantentrennung, ein fehlerhafter Mandant stoppt andere nicht,
// globale Prozesse ohne Mandant, Provisionierung mit beliebigen IDs.
//
// Ausfuehren: node scripts/tenant-neutrality-test.js   (npm run test:tenant-neutral)
// =============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

delete process.env.HELMUT_AUTH_MODE;
delete process.env.PILOT_SECRET;
delete process.env.HELMUT_TENANT_LLM_LIMITS;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.CRON_SECRET = "test-cron-secret";

const { testPoliticianOne, testPoliticianTwo, TENANT_ALPHA, TENANT_BETA } = require("./fixtures/test-profiles");

const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["auth.json", "store.json",
  `p-${testPoliticianOne.id}.json`, `p-${testPoliticianTwo.id}.json`,
  `p-${TENANT_ALPHA}.json`, `p-${TENANT_BETA}.json`];
const snap = new Map(GUARDED.map((n) => [n, fs.existsSync(path.join(dataDir, n)) ? fs.readFileSync(path.join(dataDir, n)) : null]));
process.on("exit", () => {
  for (const [n, c] of snap) {
    const f = path.join(dataDir, n);
    try { if (c === null) { if (fs.existsSync(f)) fs.rmSync(f); } else fs.writeFileSync(f, c); } catch (_) {}
  }
});

const handler = require("../server.js");
const storage = require("../lib/helmut/storage");
const scheduler = require("../lib/helmut/scheduler");
const config = require("../lib/helmut/config");
const tenantContext = require("../lib/helmut/tenant-context");
const provisioning = require("../lib/helmut/provisioning");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}
function req(server, { method = "GET", pathname, headers = {}, body = null }) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method, path: pathname, headers, timeout: 20000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    if (body != null) r.write(body);
    r.end();
  });
}
const cronHeaders = { authorization: "Bearer test-cron-secret" };
const parse = (res) => { try { return JSON.parse(res.body); } catch { return {}; } };

async function setActiveMandates(profiles) {
  const store = await storage.readStore("main");
  store.profiles = {};
  store.mandateProfiles = {};
  for (const p of profiles) { store.profiles[p.id] = { ...p }; }
  await storage.writeStore(store, "main");
}
const listOf = (arr) => async () => arr.map((p) => ({ ...p }));

(async () => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  // 1) Kein Pilot-/Default-/Fallback-/Primary-Tenant-Konstrukt im Code.
  const tcSrc = fs.readFileSync(path.join(root, "lib/helmut/tenant-context.js"), "utf8");
  const serverSrc = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const clientSrc = fs.readFileSync(path.join(root, "client.js"), "utf8");
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const codeBlob = tcSrc + serverSrc + clientSrc;
  check("tenant-context exportiert KEIN configuredPilotTenantId / cronMultiTenantEnabled mehr",
    !("configuredPilotTenantId" in tenantContext) && !("cronMultiTenantEnabled" in tenantContext));
  check("Kein HELMUT_PILOT_TENANT_ID / HELMUT_CRON_MULTI_TENANT im Code",
    !/HELMUT_PILOT_TENANT_ID|HELMUT_CRON_MULTI_TENANT/.test(codeBlob));
  check("Kein HELMUT_PILOT_TENANT_ID in .env.example",
    !/HELMUT_PILOT_TENANT_ID|HELMUT_CRON_MULTI_TENANT/.test(envExample));
  check("Kein Default-/Primary-/Fallback-Tenant-Bezeichner im Code",
    !/defaultTenant|primaryTenant|fallbackTenant|DEFAULT_TENANT|PRIMARY_TENANT|FALLBACK_TENANT/i.test(codeBlob));
  check("config.js exportiert exakt die vier neutralen Helfer (kein Personenprofil)",
    JSON.stringify(Object.keys(config).sort()) === JSON.stringify(["accountTypeOf", "inferEntities", "parliamentTypeOf", "profileCompleteness"]));

  // tenant-context: 0/1/2 aktive Mandanten (deterministisch, injiziert).
  const one = { id: "test-politician-one", fullName: "Test Politician One" };
  const two = { id: "test-politician-two", fullName: "Test Politician Two" };
  const inactive = { id: "test-politician-two", fullName: "Test Politician Two", profileActive: false };

  const rc1 = await tenantContext.resolveCronTenants({ listProfiles: listOf([one]) });
  check("(2) Cron: ein aktiver Mandant wird OHNE Env gefunden", rc1.reason === "ok" && rc1.tenantIds.length === 1 && rc1.tenantIds[0] === "test-politician-one");
  const ra1 = await tenantContext.resolveActiveTenant({ deps: { listProfiles: listOf([one]) } });
  check("(2) Request: einziges aktives Mandat wird OHNE Env + OHNE Auswahl aufgeloest", ra1.tenantId === "test-politician-one" && ra1.reason === "ok");

  const rc2 = await tenantContext.resolveCronTenants({ listProfiles: listOf([one, two]) });
  check("(3) Cron: zwei aktive Mandanten OHNE Env gefunden (beide)", rc2.reason === "ok" && rc2.tenantIds.length === 2);
  const ra2 = await tenantContext.resolveActiveTenant({ requested: "test-politician-two", deps: { listProfiles: listOf([one, two]) } });
  check("(3) Request: Auswahl unter mehreren aktiven Mandaten (requested) wird honoriert", ra2.tenantId === "test-politician-two");
  const ra2none = await tenantContext.resolveActiveTenant({ deps: { listProfiles: listOf([one, two]) } });
  check("(3) Request: mehrere aktive, keine Auswahl -> KEIN geratener Mandant", ra2none.tenantId === "" && ra2none.reason === "mehrere-mandanten-auswahl-noetig");

  const rc0 = await tenantContext.resolveCronTenants({ listProfiles: listOf([]) });
  check("(4) Cron: 0 aktive Mandanten -> 0 tenants, ok (kein geratener Mandant)", rc0.tenantIds.length === 0 && rc0.reason === "keine-aktiven-mandanten");
  const ra0 = await tenantContext.resolveActiveTenant({ deps: { listProfiles: listOf([]) } });
  check("(4) Request: 0 aktive Mandanten -> leer, kein geratener Mandant", ra0.tenantId === "" && ra0.reason === "keine-aktiven-mandanten");
  const rcInactive = await tenantContext.resolveCronTenants({ listProfiles: listOf([one, inactive]) });
  check("(4) Deaktivierte Mandate zaehlen NICHT als aktiv", rcInactive.tenantIds.length === 1 && rcInactive.tenantIds[0] === "test-politician-one");
  const rcErr = await tenantContext.resolveCronTenants({ listProfiles: async () => { throw new Error("db down"); } });
  check("Ladestoerung ist von 0-Mandaten unterscheidbar", rcErr.reason === "mandanten-liste-nicht-ladbar");

  check("scheduler.getActiveProfile() ohne ID wirft TenantContextError",
    await scheduler.getActiveProfile().then(() => false).catch((e) => e.name === "TenantContextError"));
  check("scheduler.runSourceCrawl() ohne ID wirft TenantContextError",
    await scheduler.runSourceCrawl().then(() => false).catch((e) => e.name === "TenantContextError"));
  check("mergeProfileDefaults erfindet KEINE Mandats-ID", scheduler.mergeProfileDefaults({}).id === "");
  check("mergeProfileDefaults liefert fuer JEDE ID neutrale Defaults", (() => {
    const m = scheduler.mergeProfileDefaults({ id: "irgendein-mandat" });
    return (m.party || "") === "" && (m.focusTopics || []).length === 0 && (m.upcomingAppointments || []).length === 0;
  })());

  // 5)+7)+8) HTTP: EIN aktiver Mandant, OHNE Tenant-Env -> automatisch.
  await setActiveMandates([testPoliticianOne]);
  const startSingle = await req(server, { pathname: "/api/app/start" });
  const singlePayload = parse(startSingle);
  check("(5/7/8) EIN aktiver Mandant, KEINE Env: /api/app/start -> 200, Profil aus dem Store",
    startSingle.status === 200 && singlePayload.profile && singlePayload.profile.id === testPoliticianOne.id
      && singlePayload.profile.fullName === testPoliticianOne.fullName, `status=${startSingle.status}`);
  check("(8) Kein 503 pilot-tenant-not-configured mehr (Zustand existiert nicht)",
    !/pilot-tenant-not-configured/.test(serverSrc));
  const cronSingle = await req(server, { pathname: "/api/cron/morning-briefing", headers: cronHeaders });
  const cronSinglePayload = parse(cronSingle);
  check("(8) Mandatsbezogener Cron mit GENAU einem aktiven Mandanten: verarbeitet (tenants===1, nicht skipped)",
    cronSingle.status === 200 && cronSinglePayload.tenants === 1 && !cronSinglePayload.skipped);
  // health-report: top-level ok = ECHTER Gesundheitsstatus (nicht nur 'Cron lief'); dryRun-Top-Level-Form.
  const health = await req(server, { pathname: "/api/cron/health-report?dryRun=1", headers: cronHeaders });
  const healthPayload = parse(health);
  check("health-report: dryRun liefert top-level {dryRun, ok(bool), tenants, text} und ok spiegelt den Report",
    health.status === 200 && healthPayload.dryRun === true && typeof healthPayload.ok === "boolean"
      && healthPayload.tenants === 1 && typeof healthPayload.text === "string"
      && Array.isArray(healthPayload.reports) && healthPayload.reports.length === 1
      && healthPayload.ok === healthPayload.reports[0].ok);
  // release/public: mandatsagnostisch — kein Tenant-Leak, keine Per-Mandant-Metriken.
  const rel = await req(server, { pathname: "/api/release/public" });
  const relPayload = parse(rel);
  check("release/public ist mandatsagnostisch (ready-Signal, KEINE Mandats-ID/Score/Checks/liveFlow)",
    rel.status === 200 && typeof relPayload.ready === "boolean"
      && !("score" in relPayload) && !("checks" in relPayload) && !("liveFlow" in relPayload)
      && !/test-politician|politicianId|tenant/i.test(rel.body));

  // 3) HTTP: ZWEI aktive Mandanten.
  await setActiveMandates([testPoliticianOne, testPoliticianTwo]);
  const startNoParam = await req(server, { pathname: "/api/app/start" });
  const noParamPayload = parse(startNoParam);
  check("(3) Zwei aktive, kein Param: /api/app/start bietet Auswahl (kein geratener Mandant, kein 503)",
    startNoParam.status === 200 && noParamPayload.needsMandateSelection === true
      && Array.isArray(noParamPayload.mandates) && noParamPayload.mandates.length === 2, `status=${startNoParam.status}`);
  const startPick = await req(server, { pathname: `/api/app/start?politicianId=${testPoliticianOne.id}` });
  check("(3) Zwei aktive, mit Auswahl: das gewaehlte aktive Mandat wird serviert",
    startPick.status === 200 && parse(startPick).profile && parse(startPick).profile.id === testPoliticianOne.id);
  const otherApi = await req(server, { pathname: "/api/tasks" });
  check("(3) Andere mandatsbezogene API ohne Auswahl -> 409 Auswahl noetig (kein geratener Mandant)",
    otherApi.status === 409 && parse(otherApi).needsMandateSelection === true);
  const cronTwo = await req(server, { pathname: "/api/cron/morning-briefing", headers: cronHeaders });
  const twoPayload = parse(cronTwo);
  check("(3) Mandatsbezogener Cron mit zwei aktiven Mandanten: beide isoliert verarbeitet",
    cronTwo.status === 200 && twoPayload.tenants === 2 && Array.isArray(twoPayload.results)
      && twoPayload.results.some((r) => r.politicianId === testPoliticianOne.id)
      && twoPayload.results.some((r) => r.politicianId === testPoliticianTwo.id));

  const brokenStore = await storage.readStore("main");
  brokenStore.profiles[TENANT_BETA] = { id: TENANT_BETA, fullName: 42, committees: "kaputt", topicPriorities: "kaputt" };
  await storage.writeStore(brokenStore, "main");
  const cronBroken = await req(server, { pathname: "/api/cron/lage-briefing", headers: cronHeaders });
  check("Fehlerhafter Mandant: Cron antwortet 200 und intakte Mandanten wurden trotzdem verarbeitet",
    cronBroken.status === 200 && Array.isArray(parse(cronBroken).results)
      && parse(cronBroken).results.some((r) => r.userId === testPoliticianOne.id));

  // 4) HTTP: NULL aktive Mandanten.
  await setActiveMandates([]);
  const startZero = await req(server, { pathname: "/api/app/start" });
  const zeroPayload = parse(startZero);
  check("(4) 0 aktive Mandanten: /api/app/start -> 200 Leerzustand (kein Profil, kein 503, kein geratener Mandant)",
    startZero.status === 200 && zeroPayload.empty === true && !zeroPayload.profile);
  const cronZero = await req(server, { pathname: "/api/cron/morning-briefing", headers: cronHeaders });
  const cronZeroPayload = parse(cronZero);
  check("(4) 0 aktive Mandanten: Cron endet sauber mit 0 verarbeiteten (ok:true, tenants:0)",
    cronZero.status === 200 && cronZeroPayload.ok === true && cronZeroPayload.tenants === 0);

  // 5)+6) Account-Modus.
  const acc = await runAccountModeChecks();
  passed += acc.passed; failed += acc.failed;

  // Mandantentrennung.
  await setActiveMandates([testPoliticianOne, testPoliticianTwo]);
  await storage.saveTask({ id: "task-a-1", title: "A", politicianId: testPoliticianOne.id, status: "open" });
  const tasksA = await storage.getTasks(testPoliticianOne.id);
  const tasksB = await storage.getTasks(testPoliticianTwo.id);
  check("Mandant B sieht Tasks von Mandant A nicht", tasksA.some((t) => t.id === "task-a-1") && !tasksB.some((t) => t.id === "task-a-1"));
  const mainStore = await storage.readStore("main");
  mainStore.rawItems = [
    { id: "raw-a", title: "x", sourceId: `${testPoliticianOne.id}-news`, sourceType: "person", retrievedAt: new Date().toISOString() },
    { id: "raw-b", title: "y", sourceId: `${testPoliticianTwo.id}-news`, sourceType: "person", retrievedAt: new Date().toISOString() }
  ];
  await storage.writeStore(mainStore, "main");
  const exportA = await storage.exportProfileData(testPoliticianOne.id);
  check("Export von A enthaelt NUR eigene Personen-Rohdaten",
    (exportA.rawItems || []).some((i) => i.id === "raw-a") && !(exportA.rawItems || []).some((i) => i.id === "raw-b"));
  await storage.deleteProfileData(testPoliticianOne.id);
  const afterDel = await storage.readStore("main");
  check("DSGVO-Loeschung von A entfernt Personen-Rohdaten von B NICHT",
    !(afterDel.rawItems || []).some((i) => i.id === "raw-a") && (afterDel.rawItems || []).some((i) => i.id === "raw-b"));

  const understanding = await req(server, { pathname: "/api/cron/understanding", headers: cronHeaders });
  check("Globaler understanding-Cron laeuft ohne Mandantenkontext", understanding.status === 200 && parse(understanding).ok === true);

  await setActiveMandates([testPoliticianOne]);
  const spec = { id: TENANT_ALPHA, email: "a@example.test", name: "Tenant Alpha", password: "pw-1234567", party: "Testpartei Alpha", parliamentType: "Bundestag", constituency: "Testkreis", committees: ["Arbeit und Soziales"], focusTopics: ["Arbeit"] };
  const prov = await provisioning.provisionTenant(spec, {});
  check("Provisionierung mit beliebiger kuenstlicher ID funktioniert", prov.ok === true, JSON.stringify(prov.reason || prov.errors || ""));
  check("Bestehendes (nicht provisioniertes) Mandat ist automatisch geschuetzt", (await provisioning.isProtectedTenant(testPoliticianOne.id)) === true);
  const teardown = await provisioning.teardownTenant(TENANT_ALPHA);
  check("Teardown des eigenen Test-Mandanten funktioniert und laesst fremde unberuehrt",
    teardown.ok === true && Boolean(await storage.getProfile(testPoliticianOne.id)));

  await setActiveMandates([]);
  server.close();
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });

async function runAccountModeChecks() {
  let p = 0, f = 0;
  const check2 = (name, cond) => { if (cond) { p += 1; console.log(`PASS  ${name}`); } else { f += 1; console.log(`FAIL  ${name}`); } };
  process.env.HELMUT_AUTH_MODE = "accounts";
  process.env.HELMUT_ADMIN_EMAIL = "admin@example.test";
  process.env.HELMUT_ADMIN_PASSWORD = "admin-pw-1234567";
  const accounts = require("../lib/helmut/accounts");
  const auth = require("../lib/helmut/auth");
  try {
    await accounts.ensureAdminSeed();
    const store = await storage.readStore("main");
    store.profiles = { [testPoliticianOne.id]: { ...testPoliticianOne } };
    store.mandateProfiles = {};
    await storage.writeStore(store, "main");
    const user = await accounts.createUser({ email: "mdb@example.test", name: "MdB", role: "abgeordneter", password: "mdb-pw-1234567", politicianId: testPoliticianOne.id });
    const session = await accounts.createSession(user.id);
    const token = session && (session.token || session.id || session);
    const cookie = `${auth.SESSION_COOKIE}=${encodeURIComponent(String(token))}`;
    const srv = http.createServer(handler);
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const authed = await req(srv, { pathname: "/api/app/start", headers: { cookie } });
    check2("(5) Normale authentifizierte Anfrage funktioniert OHNE Pilotkonfiguration",
      authed.status === 200 && parse(authed).profile && parse(authed).profile.id === testPoliticianOne.id);
    const noSession = await req(srv, { pathname: "/api/tasks" });
    check2("(6) Anfrage ohne Session/Mandatskontext bricht sicher ab (401/403)",
      noSession.status === 401 || noSession.status === 403);
    srv.close();
  } catch (e) {
    check2("(5/6) Account-Modus-Checks liefen ohne Fehler", false);
    console.error("account-mode error", e && e.message);
  } finally {
    delete process.env.HELMUT_AUTH_MODE;
    delete process.env.HELMUT_ADMIN_EMAIL;
    delete process.env.HELMUT_ADMIN_PASSWORD;
  }
  return { passed: p, failed: f };
}
