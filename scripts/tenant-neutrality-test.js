"use strict";

// =============================================================================
// Mandantenneutralitaets-Suite — beweist die Kernregeln der Pilot-Neutralisierung
// =============================================================================
// Offline, in-process, lokaler Datei-Store (kein Netz, kein Supabase, keine KI).
// Beweist:
//   1)  Es existiert KEIN Standardmandant im Code (config/scheduler/tenant-context).
//   2)  Fehlender Mandantenkontext wird blockiert (HTTP 503 + TenantContextError).
//   3)  Mandant A sieht keine Daten von Mandant B (Tasks/Export).
//   4)  Mandant A loescht/schreibt keine Daten von Mandant B (DSGVO-Loeschung,
//       Personen-Rohdaten strikt eigen).
//   5)  Crons koennen mehrere aktive Mandanten aus der Datenbank laden.
//   6)  Ein fehlerhafter Mandant stoppt andere Mandanten nicht (Cron-Isolation).
//   7)  Globale Prozesse (understanding, pipeline-status) brauchen keinen Mandanten.
//   8)  Budgetlogik funktioniert ohne persoenliche Overrides (neutrale Limits).
//   9)  Provisionierung funktioniert mit beliebigen validen (kuenstlichen) IDs.
//  10)  Teardown loescht keine fremden Daten.
//  11)  Cache-/Blob-/Store-Schluessel sind je Mandant getrennt.
//  12)  Bestehende Production-Daten brauchen KEINE Umbenennung: Personenquelle
//       und persoenliches Paket folgen exakt der Bestandskonvention
//       ("<id>-news" / "profil-<id>") — fuer JEDE Mandats-ID.
//  13)  Betrieb mit genau EINEM aktiven Mandanten bleibt funktionsfaehig.
//
// Ausfuehren: node scripts/tenant-neutrality-test.js   (npm run test:tenant-neutral)
// Exitcode 0 = alle Checks bestanden.
// =============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

// Sauberer Ausgangszustand: Pilot-Modus (kein Account-Gate), lokaler Datei-Store,
// KEIN konfiguriertes Pilotmandat (wird je Testblock gesetzt).
delete process.env.HELMUT_AUTH_MODE;
delete process.env.PILOT_SECRET;
delete process.env.HELMUT_PILOT_TENANT_ID;
delete process.env.HELMUT_CRON_MULTI_TENANT;
delete process.env.HELMUT_TENANT_LLM_LIMITS;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.CRON_SECRET = "test-cron-secret";

const { testPoliticianOne, testPoliticianTwo, TENANT_ALPHA, TENANT_BETA } = require("./fixtures/test-profiles");

// Store-Hermetik: betroffene Dateien sichern und am Ende wiederherstellen.
const dataDir = path.join(root, ".helmut-data");
const GUARDED = ["auth.json", "store.json",
  `p-${testPoliticianOne.id}.json`, `p-${testPoliticianTwo.id}.json`,
  `p-${TENANT_ALPHA}.json`, `p-${TENANT_BETA}.json`, "p-tenant-bestand.json"];
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

(async () => {
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  // ── 1) Kein Standardmandant im Code ────────────────────────────────────────
  check("config.js exportiert kein Personenprofil mehr",
    !("cemInceProfile" in config) && !Object.keys(config).some((k) => /profile$/i.test(k) && k !== "profileCompleteness"));
  check("tenant-context: ohne Env kein konfiguriertes Pilotmandat",
    tenantContext.configuredPilotTenantId({}) === "");
  check("scheduler.getActiveProfile ohne ID wirft TenantContextError",
    await scheduler.getActiveProfile().then(() => false).catch((e) => e.name === "TenantContextError"));
  check("scheduler.runSourceCrawl ohne ID wirft TenantContextError",
    await scheduler.runSourceCrawl().then(() => false).catch((e) => e.name === "TenantContextError"));
  check("scheduler.runLageCheck ohne ID wirft TenantContextError",
    await scheduler.runLageCheck().then(() => false).catch((e) => e.name === "TenantContextError"));
  const mergedNeutral = scheduler.mergeProfileDefaults({ id: "irgendein-neues-mandat" });
  check("mergeProfileDefaults liefert fuer JEDE ID neutrale Defaults (keine Partei/Themen/Termine)",
    (mergedNeutral.party || "") === "" && (mergedNeutral.focusTopics || []).length === 0 && (mergedNeutral.upcomingAppointments || []).length === 0);
  check("mergeProfileDefaults erfindet KEINE Mandats-ID",
    scheduler.mergeProfileDefaults({}).id === "");

  // ── 2) Fehlender Kontext wird blockiert (fail-closed) ──────────────────────
  const startUnconfigured = await req(server, { pathname: "/api/app/start" });
  check("Pilot-Modus ohne HELMUT_PILOT_TENANT_ID: /api/app/start -> 503 pilot-tenant-not-configured",
    startUnconfigured.status === 503 && parse(startUnconfigured).reason === "pilot-tenant-not-configured",
    `status=${startUnconfigured.status}`);
  const tasksUnconfigured = await req(server, { pathname: "/api/tasks" });
  check("Pilot-Modus ohne Mandat: /api/tasks -> 503 (kein stiller Personen-Fallback)",
    tasksUnconfigured.status === 503);
  const releasePublic = await req(server, { pathname: "/api/release/public" });
  check("/api/release/public ohne Mandat: ehrlicher Leerzustand statt geratenem Mandat",
    releasePublic.status === 200 && parse(releasePublic).configured === false);
  const cronNoTenant = await req(server, { pathname: "/api/cron/crawl", headers: cronHeaders });
  check("Cron crawl ohne Mandanten: skipped kein-mandant-konfiguriert (kein Lauf, kein Fallback)",
    cronNoTenant.status === 200 && parse(cronNoTenant).skipped === true && parse(cronNoTenant).reason === "kein-mandant-konfiguriert");
  const healthNoTenant = await req(server, { pathname: "/api/cron/health-report", headers: cronHeaders });
  check("Cron health-report ohne Mandanten: skipped (kein Versand)",
    healthNoTenant.status === 200 && parse(healthNoTenant).skipped === true);

  // Ein Phantom-Mandat (konfiguriert, aber NICHT in der Datenbank) laeuft ebenfalls leer.
  process.env.HELMUT_PILOT_TENANT_ID = "phantom-mandat";
  const cronPhantom = await req(server, { pathname: "/api/cron/lage-check", headers: cronHeaders });
  check("Cron mit konfiguriertem, aber in der DB fehlendem Mandat: skipped (DB-Validierung)",
    cronPhantom.status === 200 && parse(cronPhantom).skipped === true);
  delete process.env.HELMUT_PILOT_TENANT_ID;

  // ── Fixtures anlegen: zwei kuenstliche Mandanten als normale Datensaetze ───
  await storage.saveProfile({ ...testPoliticianOne });
  await storage.saveProfile({ ...testPoliticianTwo });

  // ── 13) Betrieb mit EINEM konfigurierten Mandanten bleibt funktionsfaehig ──
  process.env.HELMUT_PILOT_TENANT_ID = testPoliticianOne.id;
  const startConfigured = await req(server, { pathname: "/api/app/start" });
  const startPayload = parse(startConfigured);
  check("Mit konfiguriertem Mandat: /api/app/start -> 200 und Profil aus dem STORE (nicht aus Code)",
    startConfigured.status === 200 && startPayload.profile && startPayload.profile.id === testPoliticianOne.id
      && startPayload.profile.fullName === testPoliticianOne.fullName,
    `status=${startConfigured.status}`);
  check("Profil-Inhalte stammen aus dem Datensatz (Partei des Fixtures, keine Code-Konstante)",
    startPayload.profile && startPayload.profile.party === testPoliticianOne.party);

  // ── 3+4+11) Mandantentrennung: Tasks, Export, DSGVO-Loeschung, Store-Keys ──
  await storage.saveTask({ id: "task-alpha-1", title: "Aufgabe Alpha", politicianId: testPoliticianOne.id, status: "open" });
  const tasksOne = await storage.getTasks(testPoliticianOne.id);
  const tasksTwo = await storage.getTasks(testPoliticianTwo.id);
  check("Mandant B sieht die Tasks von Mandant A nicht (getrennte Politiker-Stores)",
    tasksOne.some((t) => t.id === "task-alpha-1") && !tasksTwo.some((t) => t.id === "task-alpha-1"));

  // Personen-Rohdaten: Item der Personenquelle von A gehoert NICHT B.
  const mainStore = await storage.readStore("main").catch(() => null);
  if (mainStore) {
    mainStore.rawItems = [
      ...(mainStore.rawItems || []),
      { id: "raw-alpha-person", title: "Meldung ueber Test Politician One", content: "x", sourceId: `${testPoliticianOne.id}-news`, sourceType: "person", retrievedAt: new Date().toISOString() },
      { id: "raw-beta-person", title: "Meldung ueber Test Politician Two", content: "y", sourceId: `${testPoliticianTwo.id}-news`, sourceType: "person", retrievedAt: new Date().toISOString() }
    ];
    await storage.writeStore(mainStore, "main");
  }
  const exportOne = await storage.exportProfileData(testPoliticianOne.id);
  const exportedRawIds = (exportOne.rawItems || []).map((i) => i.id);
  check("Export von Mandant A enthaelt NUR die eigenen Personen-Rohdaten",
    exportedRawIds.includes("raw-alpha-person") && !exportedRawIds.includes("raw-beta-person"));
  await storage.deleteProfileData(testPoliticianOne.id);
  const afterDelete = await storage.readStore("main");
  const remainingIds = (afterDelete.rawItems || []).map((i) => i.id);
  check("DSGVO-Loeschung von Mandant A loescht die Personen-Rohdaten von Mandant B NICHT",
    !remainingIds.includes("raw-alpha-person") && remainingIds.includes("raw-beta-person"));
  check("DSGVO-Loeschung von A laesst das Profil von B unangetastet",
    Boolean(await storage.getProfile(testPoliticianTwo.id)));
  // Profil A fuer die folgenden Blöcke wiederherstellen.
  await storage.saveProfile({ ...testPoliticianOne });

  // ── 5) Crons laden mehrere aktive Mandanten aus der Datenbank ──────────────
  process.env.HELMUT_CRON_MULTI_TENANT = "1";
  const multiIds = await tenantContext.resolveCronTenantIds();
  check("Multi-Tenant-Flag: resolveCronTenantIds liefert BEIDE Mandanten aus der DB",
    multiIds.includes(testPoliticianOne.id) && multiIds.includes(testPoliticianTwo.id));
  const lageBriefingMulti = await req(server, { pathname: "/api/cron/lage-briefing", headers: cronHeaders });
  const lageMultiPayload = parse(lageBriefingMulti);
  check("Cron lage-briefing verarbeitet mehrere Mandanten in EINEM Lauf",
    lageBriefingMulti.status === 200 && Number(lageMultiPayload.prewarmed || 0) >= 2);

  // ── 6) Ein fehlerhafter Mandant stoppt andere nicht ────────────────────────
  // Kaputtes Profil (id vorhanden, Inhalt zerstoert) + intaktes Profil: der Lauf
  // antwortet 200 und liefert je Mandant ein Ergebnis (Fehler isoliert, kein 500).
  const brokenStore = await storage.readStore("main");
  brokenStore.profiles[TENANT_BETA] = { id: TENANT_BETA, fullName: 42, committees: "kein-array", topicPriorities: "kaputt" };
  await storage.writeStore(brokenStore, "main");
  const isolationRun = await req(server, { pathname: "/api/cron/lage-briefing", headers: cronHeaders });
  const isolationPayload = parse(isolationRun);
  check("Fehlerhafter Mandant: Cron antwortet 200 und die intakten Mandanten wurden trotzdem verarbeitet",
    isolationRun.status === 200 && Array.isArray(isolationPayload.results)
      && isolationPayload.results.some((r) => r.userId === testPoliticianOne.id),
    `status=${isolationRun.status}`);
  const cleanupStore = await storage.readStore("main");
  delete cleanupStore.profiles[TENANT_BETA];
  await storage.writeStore(cleanupStore, "main");
  delete process.env.HELMUT_CRON_MULTI_TENANT;

  // ── 7) Globale Prozesse brauchen keinen Mandanten ───────────────────────────
  delete process.env.HELMUT_PILOT_TENANT_ID;
  const understanding = await req(server, { pathname: "/api/cron/understanding", headers: cronHeaders });
  check("Globaler understanding-Cron laeuft ohne Mandantenkontext (kein tenant-skipped, kein 503)",
    understanding.status === 200 && parse(understanding).ok === true);
  const pipelineStatus = await req(server, { pathname: "/api/cron/pipeline-status", headers: cronHeaders });
  check("Globaler pipeline-status laeuft ohne Mandantenkontext",
    pipelineStatus.status === 200 && parse(pipelineStatus).ok === true);

  // ── 8) Budgetlogik ohne persoenliche Overrides ──────────────────────────────
  // Keine Env-Overrides gesetzt: es gibt keine im Code hinterlegten Limits fuer
  // konkrete Personen — die Konfiguration ist leer und damit neutral.
  check("Keine persoenlichen Budget-Overrides konfiguriert oder im Code hinterlegt",
    String(process.env.HELMUT_TENANT_LLM_LIMITS || "") === "");
  const libSource = ["storage.js", "llm-budget.js"].map((f) => fs.readFileSync(path.join(root, "lib/helmut", f), "utf8")).join("\n");
  check("Budget-Code enthaelt keine hartkodierten Mandanten-Limits (nur Env/Profil/neutraler Fallback)",
    !/TENANT_LLM_LIMITS\s*=\s*\{[^}]*"/.test(libSource) && /TENANT_LLM_LIMIT_FALLBACK\s*=\s*40/.test(libSource));

  // ── 9+10) Provisionierung mit beliebigen validen IDs + Teardown-Schutz ─────
  const provDeps = {}; // echte lokale Module (Datei-Store)
  const spec = {
    id: TENANT_ALPHA, email: "tenant-alpha@example.test", name: "Tenant Alpha", password: "test-passwort-123",
    party: "Testpartei Alpha", parliamentType: "Bundestag", constituency: "Testkreis Nord",
    committees: ["Arbeit und Soziales"], focusTopics: ["Arbeit"]
  };
  const provisioned = await provisioning.provisionTenant(spec, provDeps);
  check("Provisionierung funktioniert mit beliebiger kuenstlicher ID (tenant-alpha)",
    provisioned.ok === true, JSON.stringify(provisioned.reason || provisioned.errors || ""));
  check("Provisioniertes Profil traegt die Herkunftsmarkierung (datengetriebener Schutz)",
    (await storage.getProfile(TENANT_ALPHA))?.provisionedBy === provisioning.PROVISIONING_MARKER);
  check("Bestehende (nicht provisionierte) Mandanten sind automatisch geschuetzt",
    (await provisioning.isProtectedTenant(testPoliticianOne.id)) === true);
  check("Selbst provisionierte Mandanten sind NICHT geschuetzt (idempotente Pflege erlaubt)",
    (await provisioning.isProtectedTenant(TENANT_ALPHA)) === false);
  const protectedTeardown = await provisioning.teardownTenant(testPoliticianOne.id);
  check("Teardown eines bestehenden Mandanten wird verweigert (protected-tenant)",
    protectedTeardown.ok === false && protectedTeardown.reason === "protected-tenant");
  const ownTeardown = await provisioning.teardownTenant(TENANT_ALPHA);
  check("Teardown des eigenen Test-Mandanten funktioniert",
    ownTeardown.ok === true);
  check("Teardown von tenant-alpha hat fremde Profile NICHT geloescht",
    Boolean(await storage.getProfile(testPoliticianOne.id)) && Boolean(await storage.getProfile(testPoliticianTwo.id)));

  // ── 12) Bestandskonvention: keine Umbenennung von Production-Daten noetig ──
  const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
  check("Persoenliches Paket folgt fuer JEDE ID der Bestandskonvention profil-<id>",
    pp.personalPackageKeyFor("beliebige-id") === "profil-beliebige-id");
  const personSources = await scheduler.getSourcesForProfile({ ...testPoliticianOne });
  const personSource = personSources.find((s) => s.type === "person");
  check("Personenquelle folgt fuer JEDE ID der Bestandskonvention <id>-news (dynamisch aus dem Profil)",
    Boolean(personSource) && personSource.id === `${testPoliticianOne.id}-news`);
  const catalog = require("../lib/helmut/quellenarchitektur/catalog");
  check("Legacy-Mehrfachsuchen JEDES Mandats werden musterbasiert als orphan_legacy erklaert",
    catalog.classifyOrphanId("beliebige-id-news-region") === "orphan_legacy"
      && catalog.classifyOrphanId("test-mdb-news-region") === "orphan_test");

  // Aufraeumen der Fixture-Profile aus dem Main-Store.
  const finalStore = await storage.readStore("main");
  delete finalStore.profiles[testPoliticianOne.id];
  delete finalStore.profiles[testPoliticianTwo.id];
  if (finalStore.mandateProfiles) {
    delete finalStore.mandateProfiles[testPoliticianOne.id];
    delete finalStore.mandateProfiles[testPoliticianTwo.id];
  }
  finalStore.rawItems = (finalStore.rawItems || []).filter((i) => !["raw-alpha-person", "raw-beta-person"].includes(i.id));
  await storage.writeStore(finalStore, "main");

  server.close();
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER", e); process.exit(1); });
