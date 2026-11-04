"use strict";

// Sprint B: vorhandene Verträge, ausschließlich offline. Kein Serverstart.
// Die Routen-/Clientrümpfe werden unverändert aus den bestehenden Dateien gelesen;
// HTTP, Daten und Aktivitätsablage sind injizierte synthetische Testabhängigkeiten.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const auth = require("../lib/helmut/auth");
const root = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");
const client = fs.readFileSync(path.join(root, "client.js"), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let passed = 0;

async function test(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

function between(source, start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `Vorhandener Einstieg fehlt: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `Vorhandenes Ende fehlt: ${end}`);
  return source.slice(from, to);
}

const appStartSource = between(server, '  if (url.pathname === "/api/app/start") {', '\n  if (url.pathname === "/api/profile/current")');
const statementSource = between(client, "async function generateStatementWithBackend(", "\nfunction recommendedInitialChannel(");
const csrfSource = between(server, "function requiresCsrf(", "\n// SICHERHEIT:");
const csrf = vm.runInNewContext(`${csrfSource}; requiresCsrf`, { hasAdminBypass: () => false });
const statement = vm.runInNewContext(`${statementSource}; generateStatementWithBackend`, {});
assert.equal(typeof statement, "function");

function appDependencies(overrides = {}) {
  const observed = { activity: [], lage: [], briefing: [] };
  const values = {
    url: new URL("http://localhost/api/app/start?politicianId=synthetisch-a"),
    accountAuth: true,
    authUser: { id: "synthetisches-konto", role: "abgeordneter" },
    accounts: { recordUserActivity: async id => { observed.activity.push(id); } },
    response: {}, handleAsync: (_, fn) => fn(), politicianId: "synthetisch-a",
    activeMandateList: async () => [],
    activeProfile: async id => ({ id, fullName: "Fiktives Profil", profileActive: true }),
    latestBriefingPayload: async options => {
      observed.briefing.push(options);
      return { available: false, reason: "keine-vorgaenge", items: [],
        currentHelmutState: { status: "empty" }, currentRadarState: { anzeige: { status: "empty" } } };
    },
    previewMode: false,
    withTimeout: async promise => promise,
    buildLageBriefing: async (profile, options) => {
      observed.lage.push({ profile, options });
      return { available: false, reason: "keine-vorgaenge", paragraphs: [], vorgaenge: [] };
    },
    getTasks: async id => [{ id: "synthetische-aufgabe", politicianId: id, title: "Fiktive Aufgabe" }],
    getUserNotes: async () => [], getLatestCompleteKnowledgeObjectAt: async () => null,
    validateProfile: () => ({ ready: true }), isAiEnabled: () => false,
    activeModelName: () => "offline-test", ASSET_VERSION: "ae18658e",
    console: { error() {} }, ...overrides
  };
  const run = () => new AsyncFunction(...Object.keys(values), appStartSource)(...Object.values(values));
  return { observed, run };
}

async function main() {
  await test("Appstart transportiert vorhandene Briefing-, Radar-, Lage- und Aufgabenfelder", async () => {
    const { run } = appDependencies();
    const output = await run();
    assert.deepEqual(Object.keys(output).sort(), ["aiStatus", "briefing", "notes", "profile", "tasks", "version"]);
    assert.equal(output.profile.id, "synthetisch-a");
    assert.equal(output.briefing.currentHelmutState.status, "empty");
    assert.equal(output.briefing.currentRadarState.anzeige.status, "empty");
    assert.deepEqual(output.briefing.lageBriefing.paragraphs, []);
    assert.equal(output.tasks[0].politicianId, "synthetisch-a");
    assert.equal(output.aiStatus.enabled, false);
  });
  await test("Appstart liest Lage mit cacheOnly:true und kompakten Briefingvertrag", async () => {
    const { observed, run } = appDependencies();
    await run();
    assert.equal(observed.lage.length, 1);
    assert.equal(observed.lage[0].options.cacheOnly, true);
    assert.equal(observed.lage[0].options.politicianId, "synthetisch-a");
    assert.equal(observed.briefing[0].compact, true);
  });
  await test("GET-Appstart ist nicht vollständig schreibfrei: Aktivität wird erfasst", async () => {
    const { observed, run } = appDependencies();
    await run();
    assert.deepEqual(observed.activity, ["synthetisches-konto"]);
  });
  await test("Lagefehler bleibt vom ehrlichen Leerzustand unterscheidbar", async () => {
    const { run } = appDependencies({ buildLageBriefing: async () => { throw new Error("synthetischer Ausfall"); } });
    const output = await run();
    assert.equal(output.briefing.lageBriefing.available, false);
    assert.equal(output.briefing.lageBriefing.reason, "error");
    assert.equal(output.briefing.lageBriefing.latestUpdatedAt, null);
    assert.deepEqual(output.briefing.lageBriefing.vorgaenge, []);
    assert.equal(output.briefing.currentRadarState.anzeige.status, "empty");
  });
  await test("Fehlende Mandatsauswahl erzeugt keinen erfundenen Inhalt", async () => {
    const { run } = appDependencies({ politicianId: null,
      activeMandateList: async () => [{ id: "synthetisch-a" }, { id: "synthetisch-b" }] });
    const output = await run();
    assert.equal(output.needsMandateSelection, true);
    assert.equal(output.empty, false);
    assert.equal(Object.hasOwn(output, "briefing"), false);
    assert.equal(output.mandates.length, 2);
  });
  await test("Mandatsauswahl akzeptiert keine fremde URL-Kennung als Berechtigung", async () => {
    assert.equal(auth.pickPoliticianId({ role: "abgeordneter", politicianId: "synthetisch-a" }, "synthetisch-b", ["synthetisch-a"]), "synthetisch-a");
    assert.equal(auth.pickPoliticianId({ role: "referent" }, "synthetisch-b", ["synthetisch-a"]), "synthetisch-a");
    assert.equal(auth.pickPoliticianId({ role: "referent" }, "synthetisch-b", []), null);
  });
  await test("Büro verwendet bestehenden POST mit prompt/channel/decision und wahrer Herkunft", async () => {
    const requests = [];
    const context = {
      apiScopeQuery: () => "politicianId=synthetisch-a",
      fetchWithTimeout: async (url, options) => { requests.push({ url, options }); return { ok: true,
        json: async () => ({ text: "Synthetischer Regelentwurf", aiEnabled: false, channelLabel: "Presse", degraded: true }) }; },
      generateStatement: () => { throw new Error("Unerwarteter Clientfallback"); }
    };
    const generate = vm.runInNewContext(`${statementSource}; generateStatementWithBackend`, context);
    const decision = { id: "synthetischer-vorgang", title: "Fiktiver Vorgang", sources: [] };
    const output = await generate("Fiktiver Auftrag", decision, "press");
    assert.equal(requests[0].url, "/api/communication/generate?politicianId=synthetisch-a");
    assert.equal(requests[0].options.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].options.body), { prompt: "Fiktiver Auftrag", channel: "press", decision });
    assert.equal(output.aiEnabled, false);
    assert.equal(output.text, "Synthetischer Regelentwurf");
    assert.equal(output.channelLabel, "Presse");
  });
  await test("Bürofehler wird vom vorhandenen Client weitergegeben statt als Erfolg dargestellt", async () => {
    const generate = vm.runInNewContext(`${statementSource}; generateStatementWithBackend`, {
      apiScopeQuery: () => "politicianId=synthetisch-a",
      fetchWithTimeout: async () => ({ ok: false, status: 503 })
    });
    await assert.rejects(generate("Fiktiv", {}, "press"), /503/);
  });
  await test("Kommunikation und separater Officepfad behalten den vorhandenen CSRF-Schutz", async () => {
    for (const route of ["/api/communication/generate", "/api/office/generate"]) {
      assert.equal(csrf({ method: "POST" }, new URL(`http://localhost${route}`)), true);
    }
    assert.equal(csrf({ method: "GET" }, new URL("http://localhost/api/app/start")), false);
    assert.equal(csrf({ method: "GET" }, new URL("http://localhost/api/lage/briefing")), true);
  });
  await test("Serverpfade bleiben getrennt; Kommunikation hat Drosselung und serverseitiges Profil", async () => {
    const communication = between(server, '  if (url.pathname === "/api/communication/generate"', '\n  if (url.pathname === "/api/learning/status")');
    const office = between(server, '  if (url.pathname === "/api/office/generate"', '\n  if (url.pathname === "/api/lage/check")');
    assert.match(communication, /request\.method === "POST"/);
    assert.match(communication, /allowRate\(request, "communication", 18,/);
    assert.match(communication, /activeProfile\(politicianId\)/);
    assert.match(communication, /generateCommunicationDraft\(/);
    assert.match(office, /generateOfficeOutput\(/);
    assert.match(office, /getKnowledgeObjectByVorgang\(vorgangId\)/);
    assert.match(office, /if \(previewMode\) return sendPreviewReadOnly/);
  });
  console.log(`\n${passed}/${passed} vorhandene Schnittstellen-Vertragsgruppen bestanden.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
