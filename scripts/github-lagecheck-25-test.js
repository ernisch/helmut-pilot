"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ausfuehren, pruefeZeit, CONFIRM, PROJECT_URL, LAGE_URL } = require("./github-lagecheck-25");
const SHA = "a".repeat(40);
const NOW = "2026-09-06T20:20:00.000Z";
let passed = 0;

function fixture() {
  const profiles = [
    ...Array.from({ length: 20 }, (_, i) => ({ user_id: `test-kohorte-a-${String(i + 1).padStart(3, "0")}`, aktiv: true, geloescht_at: null, updated_at: "2026-09-04" })),
    ...Array.from({ length: 9 }, (_, i) => ({ user_id: `bestand-${i}`, aktiv: i < 5, geloescht_at: null, updated_at: "2026-08-06" }))
  ];
  const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: SHA, HELMUT_PRODUCTION_COMMIT: SHA,
    HELMUT_LAGE_25_CONFIRM: CONFIRM, SUPABASE_URL: PROJECT_URL,
    SUPABASE_SERVICE_ROLE_KEY: "secret-never-print", HELMUT_CRON_SECRET: "cron-never-print",
    HELMUT_NATURLAUF_ID: "cron-crawl-20260906200030-abc12" };
  const config = { ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
    retentionGueltig: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true, retention: 36,
    tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 };
  const natural = [{ run_id: env.HELMUT_NATURLAUF_ID, process: "warteschlange-crawl", status: "success",
    started_at: "2026-09-06T20:00:30Z", finished_at: "2026-09-06T20:04:30Z", processed_count: 100, failed_count: 0 }];
  const usage = Array.from({ length: 52 }, () => ({ createdAt: "2026-09-06T18:00:00Z", model: "gpt-5-mini", estimatedCost: 0.003 }));
  const f = { env, config, profiles, natural, usage, used: 58, locks: [], leases: [], calls: [], executed: 0,
    lageStatus: 200, lageBody: { ok: true, tenants: 25, fairnessGestoert: false,
      ohneFortschritt: false, budgetSkipped: 0, persistenzAbweichung: [], fairness: {
      zustandGeladen: true, zustandFehler: null, laufStatus: "abgeschlossen",
      laufId: "cron-lage-check-20260906202000-abc12", geplant: profiles.slice(0, 25).map(p => p.user_id),
      begonnen: profiles.slice(0, 25).map(p => p.user_id), erfolgreich: profiles.slice(0, 25).map(p => p.user_id), fehlgeschlagen: [],
      zeitbudget: [], laeuftBereits: [], lockVerweigert: [], persistenzAbweichung: [] } } };
  f.fetchFn = async (url, options) => {
    f.calls.push({ url, options });
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.body, undefined);
    assert.ok(options.signal);
    const response = body => ({ status: 200, json: async () => structuredClone(body) });
    if (url.endsWith("/api/cron/testnachweis-status")) return response(f.config);
    if (url === LAGE_URL) {
      f.executed += 1;
      if (f.lageError) throw new Error(f.lageError);
      if (f.afterLage) f.afterLage(f);
      return { status: f.lageStatus, json: async () => structuredClone(f.lageBody) };
    }
    assert.ok(url.startsWith(PROJECT_URL + "/rest/v1/"));
    assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    if (url.includes("/mandate_profiles?")) return response(f.profiles);
    if (url.includes("/process_runs?")) return response(f.natural);
    if (url.includes("/pipeline_locks?")) return response(f.locks);
    if (url.includes("/helmut_jobs?")) return response(f.leases);
    if (url.includes("/llm_budget_counters?")) return response([{ used: f.used }]);
    if (url.includes("/helmut_store?")) return response([{ usage: f.usage }]);
    throw new Error("unexpected-request");
  };
  f.run = () => ausfuehren({ env: f.env, fetchFn: f.fetchFn, now: () => new Date(f.now || NOW) });
  return f;
}

async function test(name, fn) {
  await fn(); passed += 1; console.log(`PASS ${name}`);
}

(async () => {
  await test("genau ein bestehender Lageaufruf, nur sichere Metadaten", async () => {
    const f = fixture(), r = await f.run();
    assert.equal(r.ok, true); assert.equal(f.executed, 1);
    assert.equal(r.unabhaengigeProductionAbnahmeOffen, true);
    assert.equal(r.vorKosten.atomarerUsdRiegel, false);
    assert.equal(r.vorKosten.reservierungsluecke, 6);
    assert.ok(!JSON.stringify(r).includes("never-print"));
    assert.ok(!JSON.stringify(r).includes("bestand-"));
  });
  const guards = [
    ["fehlende Freigabe", f => { f.env.HELMUT_LAGE_25_CONFIRM = ""; }],
    ["fremdes Repository", f => { f.env.GITHUB_REPOSITORY = "fremd/repo"; }],
    ["fremder Branch", f => { f.env.GITHUB_REF = "refs/heads/preview"; }],
    ["automatischer Trigger", f => { f.env.GITHUB_EVENT_NAME = "push"; }],
    ["fremdes Datenbankziel", f => { f.env.SUPABASE_URL = "https://example.invalid"; }],
    ["fehlendes Secret", f => { f.env.HELMUT_CRON_SECRET = ""; }],
    ["anderer Checkout", f => { f.env.GITHUB_SHA = "b".repeat(40); }],
    ["anderes Deployment", f => { f.config.commit = "b".repeat(40); }],
    ["keine globale Sperre", f => { f.config.kommunikationGesperrt = false; }],
    ["Kohortenquellen eingeschaltet", f => { f.config.kohortenQuellenGesperrt = false; }],
    ["falscher Deckel", f => { f.config.tagesdeckel = 100; }],
    ["falsche Reserve", f => { f.config.understandingReserve = 0; }],
    ["anderer Speicherpfad", f => { f.config.profileExclusive = false; }],
    ["ungueltige Aufbewahrung", f => { f.config.retentionGueltig = false; }],
    ["abweichende Gesamtzahl", f => { f.profiles.pop(); }],
    ["doppelte Kennung", f => { f.profiles[0] = f.profiles[1]; }],
    ["B statt A", f => { f.profiles[0].user_id = "test-kohorte-b-001"; }],
    ["altes inaktives Profil aktiviert", f => { f.profiles[28].aktiv = true; }],
    ["Loeschmarke", f => { f.profiles[0].geloescht_at = NOW; }],
    ["ungueltige Profilantwort", f => { f.profiles = {}; }],
    ["fehlender Naturlauf", f => { f.natural = []; }],
    ["noch laufender Crawl", f => { f.natural[0].status = "running"; }],
    ["Crawl ohne Abschluss", f => { f.natural[0].finished_at = null; }],
    ["Crawl ohne Wirkung", f => { f.natural[0].processed_count = 0; }],
    ["Crawl mit Fehler", f => { f.natural[0].failed_count = 1; }],
    ["Morgencrawl reicht nicht", f => { f.natural[0].started_at = "2026-09-06T04:00:00Z"; }],
    ["aktive Sperre", f => { f.locks = [{ job_name: "lauf" }]; }],
    ["aktive Lease", f => { f.leases = [{ id: "lease" }]; }],
    ["Tageswechsel", f => { f.now = "2026-09-06T23:58:00Z"; }],
    ["Cronkollision", f => { f.now = "2026-09-06T20:04:00Z"; }],
    ["unbekanntes Modell", f => { f.usage[0].model = "anderes-modell"; }],
    ["fehlender Preis", f => { f.usage[0].estimatedCost = null; }],
    ["negative Kosten", f => { f.usage[0].estimatedCost = -1; }],
    ["fehlende Kostentelemetrie", f => { f.usage = []; }],
    ["Budget erschoepft", f => { f.used = 2416; }],
    ["USD Sicherheitsstopp", f => { f.usage.forEach(x => { x.estimatedCost = 0.14; }); }]
  ];
  for (const [name, mutate] of guards) await test(name, async () => {
    const f = fixture(); mutate(f); const r = await f.run();
    assert.equal(r.ok, false); assert.equal(r.ausgeloest, false); assert.equal(f.executed, 0);
  });
  await test("Antwortverlust wird nie wiederholt, Fehlertext bleibt verborgen", async () => {
    const f = fixture(); f.lageError = "secret-never-print"; const r = await f.run();
    assert.equal(r.ok, false); assert.equal(r.ausgeloest, true); assert.equal(f.executed, 1);
    assert.equal(r.grund, "netz-oder-antwortfehler"); assert.ok(!JSON.stringify(r).includes("secret-never-print"));
  });
  await test("HTTP 200 ohne Fachbilanz ist kein Erfolg", async () => {
    const f = fixture(); f.lageBody = { ok: true }; const r = await f.run();
    assert.equal(r.ok, false); assert.equal(r.fachlichVollstaendig, false);
  });
  await test("ein nicht erreichtes Mandat verhindert volles Gruen", async () => {
    const f = fixture(); f.lageBody.fairness.erfolgreich.pop();
    assert.equal((await f.run()).ok, false);
  });
  await test("Persistenzwiderspruch bleibt Fehler", async () => {
    const f = fixture(); f.lageBody.fairness.persistenzAbweichung = ["widerspruch"];
    assert.equal((await f.run()).ok, false);
  });
  for (const [name, mutate] of [
    ["gestoerte Fairness", f => { f.lageBody.fairnessGestoert = true; }],
    ["fehlender Fairnesszustand", f => { f.lageBody.fairness.zustandGeladen = false; }],
    ["unabgeschlossene Ablage", f => { f.lageBody.fairness.laufStatus = "laufend"; }],
    ["25 doppelte Erfolge", f => { f.lageBody.fairness.erfolgreich.fill(f.profiles[0].user_id); }]
  ]) await test(name, async () => {
    const f = fixture(); mutate(f); assert.equal((await f.run()).ok, false);
  });
  await test("HTTP Fehler verursacht keinen zweiten Aufruf", async () => {
    const f = fixture(); f.lageStatus = 500; const r = await f.run();
    assert.equal(r.ok, false); assert.equal(f.executed, 1);
  });
  await test("Profilabweichung nach Lauf bleibt sichtbar", async () => {
    const f = fixture(); f.afterLage = x => { x.profiles[28].updated_at = NOW; };
    const r = await f.run(); assert.equal(r.ok, false); assert.equal(r.bestandGleich, false);
  });
  await test("Kostenanstieg nach Lauf stoppt die Fortsetzung", async () => {
    const f = fixture(); f.afterLage = x => { x.usage.forEach(u => { u.estimatedCost = 0.2; }); };
    assert.equal((await f.run()).ok, false);
  });
  await test("Workflow ohne automatische Ausfuehrung oder freie Shell Eingaben", () => {
    const y = fs.readFileSync(path.join(__dirname, "../.github/workflows/500-lagecheck-25.yml"), "utf8");
    assert.ok(y.includes("workflow_dispatch:"));
    assert.ok(!/^\s+(push|pull_request|schedule|workflow_run):/m.test(y));
    assert.ok(!y.includes("run: ${{")); assert.ok(y.includes("persist-credentials: false"));
    assert.ok(y.includes("cancel-in-progress: false"));
    assert.ok(!y.includes("AZURE_OPENAI_KEY"));
  });
  console.log(`${passed} PASS / 0 FAIL`);
})().catch(error => { console.error(error); process.exitCode = 1; });
