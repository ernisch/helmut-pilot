"use strict";

// Echter regulaerer HTTP Handler und echte beide Protokollprojektionen.
// Profilzugriff, Facharbeit und Transport sind ausschliesslich lokale Attrappen.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const storage = require("../lib/helmut/storage");
const serverPath = path.join(__dirname, "../server.js");
const source = fs.readFileSync(serverPath, "utf8");
const start = source.indexOf('  if (url.pathname === "/api/cron/lage-briefing") {');
const end = source.indexOf('  // ═══ ZWEITER MORGENSLOT', start);
assert(start > 0 && end > start, "Regulaerer Lagehandler muss vorhanden sein");
const script = new vm.Script("(async () => {\n" + source.slice(start, end) + "\n})()");
const hash = id => crypto.createHash("sha256").update(JSON.stringify(id)).digest("hex");
const clean = value => JSON.parse(JSON.stringify(value));
const successful = { available: true, fromCache: false, demo: false, vorgaenge: [] };
const diagnosis = { absatz: 1, fehler: ["aussage-unbelegt", "aussage-unbelegt", "GEHEIMER_TEXT"], text: "GEHEIMER_TEXT" };
const expectedDiagnosis = { absatz: 1, fehler: ["aussage-unbelegt"] };

async function run(profiles, options = {}) {
  let now = Date.parse("2026-09-12T05:45:00Z");
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const auth = { processRuns: [] }, rows = [], calls = [];
  const context = vm.createContext({
    require: createRequire(serverPath), crypto, Date: Clock,
    url: { pathname: "/api/cron/lage-briefing" }, request: {}, response: {},
    authorizeCron: () => options.authorized !== false,
    handleAsync: (_res, fn) => fn(),
    helmutRunId: () => "briefing-lage-local-diagnose", helmutExecLocation: () => "local",
    scalablePipeline: { narrativUeberWarteschlange: () => false },
    mandatsklasse: require("../lib/helmut/mandatsklasse"),
    listProfiles: async () => profiles,
    activeProfile: async id => {
      if (options.profileErrors?.[id]) throw options.profileErrors[id];
      return profiles.find(p => p?.id === id);
    },
    validateProfile: p => ({ disabled: p.disabled === true }),
    buildLageBriefing: async p => {
      calls.push(p.id);
      if (options.advanceMs) now += options.advanceMs;
      if (options.buildErrors?.[p.id]) throw options.buildErrors[p.id];
      return options.results?.[p.id] || successful;
    },
    recordProcessRun: async entry => {
      const result = await storage.recordProcessRun(entry, {
        relationalAktiv: true, readAuth: async () => auth, writeAuth: async () => {},
        insertRelational: async row => { rows.push(clean(row)); }
      });
      return options.telemetryFailure ? { ...result, ok: false, vollstaendig: false, fehler: [{ backend: "relational" }] } : result;
    }
  });
  const response = clean(await script.runInContext(context) ?? null);
  return { response, rows, blob: clean(auth.processRuns[0] ?? null), calls };
}

function persisted(result) {
  assert.equal(result.rows.length, 1);
  const entries = result.rows[0].telemetrie?.mandatsErgebnisse;
  assert(Array.isArray(entries), "Einzelergebnisse muessen relational gespeichert sein");
  assert.deepEqual(result.blob.mandatsErgebnisse, entries, "Blob und relationale Ablage muessen uebereinstimmen");
  const serialized = JSON.stringify({ rows: result.rows, blob: result.blob });
  assert(!serialized.includes("GEHEIMER"));
  for (const entry of entries) {
    assert.match(entry.mandatHash, /^[a-f0-9]{64}$/);
    assert.equal(entry.briefingGespeichert, false, "Lagevorwaermen speichert kein Gesamtbriefing");
  }
  return entries;
}

let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log("PASS " + name); }
  catch (error) { failed++; console.error("FAIL " + name + ": " + error.message); }
}
(async () => {
  await check("Fuenf bearbeitete Profile: drei Fehler dauerhaft getrennt, keine Wiederholung", async () => {
    const active = Array.from({ length: 5 }, (_, i) => ({ id: "local-active-" + i }));
    const disabled = Array.from({ length: 499 }, (_, i) => ({ id: "local-disabled-" + i, disabled: true }));
    const r = await run([...active, ...disabled], { results: {
      [active[0].id]: { available: false, reason: "ai-text-source-support", diagnose: diagnosis },
      [active[1].id]: { available: false, reason: "ai-provider-http-429" },
      [active[2].id]: { available: false, reason: "budget" },
      [active[3].id]: { ...successful, fromCache: true }
    } });
    const entries = persisted(r);
    assert.equal(entries.length, 5);
    assert.deepEqual(entries.map(e => e.grund), ["ai-text-source-support", "ai-provider-http-429", "budget", "cache-vorhanden", "gespeichert"]);
    assert.deepEqual(entries[0].diagnose, expectedDiagnosis);
    assert.equal(entries[0].mandatHash, hash(active[0].id));
    assert(!JSON.stringify(r.rows).includes(active[0].id));
    assert.deepEqual(entries.map(e => e.lageGespeichert), [false, false, false, true, true]);
    assert.equal(r.rows[0].processed_count, 5); assert.equal(r.rows[0].failed_count, 3);
    assert.equal(r.rows[0].deferred_count, 499); assert.equal(r.rows[0].status, "failed");
    assert.equal(r.response.prewarmed, 2); assert.equal(r.response.vollstaendig, false);
    assert.deepEqual(r.calls, active.map(p => p.id));
  });
  await check("Innere und aeussere Ausnahme behalten sichere Diagnose und Mandatsisolation", async () => {
    const secret = Object.assign(new Error("GEHEIMER_TEXT https://secret.invalid token=GEHEIMER"), { diagnose: diagnosis });
    const r = await run([{ id: "local-build" }, { id: "local-profile" }, { id: "local-next" }], {
      buildErrors: { "local-build": secret }, profileErrors: { "local-profile": secret }
    });
    const entries = persisted(r);
    assert.deepEqual(entries.map(e => e.grund), ["error", "profil-fehler", "gespeichert"]);
    assert.deepEqual(entries[0].diagnose, expectedDiagnosis); assert.deepEqual(entries[1].diagnose, expectedDiagnosis);
    assert(!JSON.stringify(r.response).includes("GEHEIMER"));
    assert.deepEqual(r.calls, ["local-build", "local-next"]);
  });
  await check("Unbekannte Gruende bleiben unbekannt; Rohtext ist keine Fehlerklasse", async () => {
    const r = await run([{ id: "local-unknown" }, { id: "local-thrown" }], {
      results: { "local-unknown": { available: false, reason: "geheimer-modelltext", diagnose: { absatz: 500, fehler: ["GEHEIMER"] } } },
      buildErrors: { "local-thrown": new Error("GEHEIMER_TEXT") }
    });
    const entries = persisted(r);
    assert.deepEqual(entries.map(e => e.grund), ["unbekannter-grund", "error"]);
    assert(entries.every(e => !e.diagnose));
    assert(!JSON.stringify(r.rows).includes("geheimer-modelltext"));
  });
  await check("500 aktive und vier inaktive Profile: alle 500 Ergebnisse passen in die vorhandene Ablage", async () => {
    const profiles = Array.from({ length: 500 }, (_, i) => ({ id: "local-target-" + i }));
    const r = await run([...Array.from({ length: 4 }, (_, i) => ({ id: "local-inactive-" + i, disabled: true })), ...profiles]);
    const entries = persisted(r);
    assert.equal(entries.length, 500); assert.equal(new Set(entries.map(e => e.mandatHash)).size, 500);
    assert.deepEqual(entries.map(e => e.mandatHash), profiles.map(p => hash(p.id)));
    assert.equal(r.response.prewarmed, 500); assert.equal(r.response.vollstaendig, true);
    assert.equal(r.calls.length, 500); assert.equal(r.rows[0].status, "success");
  });
  await check("Fehlende Kennung und Zeitbudget erzeugen keine erfundenen Einzelversuche", async () => {
    const r = await run([{}, { id: "local-first" }, { id: "local-later" }], { advanceMs: 240001 });
    const entries = persisted(r);
    assert.equal(entries.length, 1); assert.equal(entries[0].mandatHash, hash("local-first"));
    assert.deepEqual(r.calls, ["local-first"]); assert.equal(r.rows[0].deferred_count, 2);
    assert.equal(r.rows[0].status, "failed"); assert.equal(r.rows[0].failed_count, 0);
  });
  await check("Demo und ausstehendes Narrativ gelten nicht als gespeicherte Lage", async () => {
    const r = await run([{ id: "local-demo" }, { id: "local-pending" }], { results: {
      "local-demo": { ...successful, demo: true }, "local-pending": { ...successful, pendingNarrative: true }
    } });
    const entries = persisted(r);
    assert(entries.every(e => !e.lageGespeichert));
    assert.deepEqual(entries.map(e => e.grund), ["demo", "narrativ-ausstehend"]);
  });
  await check("Protokollierungsfehler bleibt im HTTP Abschluss sichtbar", async () => {
    const r = await run([{ id: "local-one" }], { telemetryFailure: true });
    persisted(r); assert.equal(r.response.lauftelemetrie.gespeichert, false);
    assert.equal(r.response.lauftelemetrie.vollstaendig, false);
    assert.equal(r.response.lauftelemetrie.fehler[0].backend, "relational");
  });
  await check("Ohne Cronberechtigung startet weder Facharbeit noch Protokollierung", async () => {
    const r = await run([{ id: "local-one" }], { authorized: false });
    assert.equal(r.calls.length, 0); assert.equal(r.rows.length, 0); assert.equal(r.blob, null);
  });
  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
