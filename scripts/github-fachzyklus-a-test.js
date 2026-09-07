#!/usr/bin/env node
"use strict";

const assert = require("assert");
const S = require("../lib/helmut/testkohorte-stufen");
const G = require("./github-fachzyklus-a");
const { STATUS_URL } = require("./github-laufzeitpruefung");

const COMMIT = "a".repeat(40);
const TAG = "2026-09-06";
const FENSTER = `${TAG}T00Z`;
const A = [...S.kennungenBisStufe("a")];
let pass = 0;
function check(name, fn) {
  try { fn(); console.log(`PASS ${name}`); pass += 1; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}

const profile = [
  ...A.map((id) => ({ user_id: id, aktiv: true, geloescht_at: null, updated_at: "x" })),
  ...Array.from({ length: 5 }, (_, i) => ({ user_id: `alt-aktiv-${i}`, aktiv: true,
    geloescht_at: null, updated_at: "x" })),
  ...Array.from({ length: 4 }, (_, i) => ({ user_id: `alt-inaktiv-${i}`, aktiv: false,
    geloescht_at: null, updated_at: "x" }))
].sort((a, b) => a.user_id.localeCompare(b.user_id));

const users = [
  ...A.map((politicianId) => ({ politicianId, active: false })),
  ...Array.from({ length: 3 }, (_, i) => ({ politicianId: `alt-aktiv-${i}`, active: true })),
  ...Array.from({ length: 2 }, (_, i) => ({ politicianId: `alt-inaktiv-${i}`, active: false }))
];
const identitaeten = [
  ...A.map((id) => ({ id })),
  ...Array.from({ length: 10 }, (_, i) => ({ id: `alt-identitaet-${i}` }))
].sort((a, b) => a.id.localeCompare(b.id));

function jobs(nachher = false) {
  return A.flatMap((tenant_id, i) => [
    { tenant_id, freshness_window: FENSTER, job_type: "source_fetch",
      status: nachher || i < 19 ? "erledigt" : "wartend" },
    { tenant_id, freshness_window: FENSTER, job_type: "mandate_projection", status: "erledigt" },
    { tenant_id, freshness_window: FENSTER, job_type: "briefing_materialization",
      status: nachher || i < 10 ? "erledigt" : "wartend" }
  ]);
}

function antwort(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function attrappe(vorrangreserveReal = 200) {
  let nachher = false;
  const usageVor = [{ createdAt: `${TAG}T20:00:00Z`, model: "gpt-5-mini", estimatedCost: 0.01 }];
  const usageNach = [...usageVor,
    { createdAt: `${TAG}T22:30:00Z`, model: "gpt-5-mini", estimatedCost: 0.02 }];
  return async (url) => {
    if (url === STATUS_URL) return antwort({ ok: true, schemaVersion: 1, reinLesend: true,
      production: true, commit: COMMIT, storageSupabase: true, v3Bereit: true,
      profileRelational: true, profileExclusive: true, retentionGueltig: true,
      kommunikationGesperrt: true, kohortenQuellenGesperrt: true, retention: 36,
      tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal });
    const u = new URL(url);
    if (u.origin === G.PUBLIC_URL && u.pathname === "/api/cron/pipeline") {
      nachher = true;
      return antwort({ ok: true, successfulSources: 10, checkedSources: 10,
        understanding: { processed: 10, deferred: 0 }, errors: [] });
    }
    if (u.origin !== G.PROJECT_URL) return antwort({}, 404);
    if (u.pathname.endsWith("/mandate_profiles")) return antwort(profile);
    if (u.pathname.endsWith("/profiles")) return antwort(identitaeten);
    if (u.pathname.endsWith("/process_runs")) return antwort([{ run_id: `cron-crawl-20260906200000-test`,
      process: "warteschlange-crawl", status: "success", started_at: `${TAG}T20:00:00Z`,
      finished_at: `${TAG}T20:04:00Z`, processed_count: 100, failed_count: 0 }]);
    if (u.pathname.endsWith("/pipeline_locks")) return antwort([]);
    if (u.pathname.endsWith("/helmut_job_outbox")) return antwort([]);
    if (u.pathname.endsWith("/helmut_jobs")) {
      return antwort(u.searchParams.get("select") === "id" ? [] : jobs(nachher));
    }
    if (u.pathname.endsWith("/llm_budget_counters")) return antwort([{ used: nachher ? 2 : 1 }]);
    if (u.pathname.endsWith("/helmut_store")) return antwort([{ data: {
      users, pushEvents: [], llmUsage: nachher ? usageNach : usageVor
    } }]);
    return antwort({}, 404);
  };
}

check("Profilbestand erkennt exakt A und die fünf älteren aktiven Profile", () => {
  const b = G.pruefeProfile(profile);
  assert.strictEqual(b.weitereAktiveMandate.length, 5);
});
check("Aktive Kohortenkonten werden abgewiesen", () => {
  assert.throws(() => G.pruefeAuth({ users: users.map((u, i) => i === 0 ? { ...u, active: true } : u) }));
});
check("Unbekannte Kosten werden mit Reserve statt mit null bewertet", () => {
  const b = G.kostenBefund({ llmUsage: [{ createdAt: `${TAG}T22:00:00Z`,
    model: "gpt-5-mini", estimatedCost: "unknown" }] }, 1, TAG);
  assert.strictEqual(b.unbekannteKosten, 1);
  assert.strictEqual(b.prognoseUsd, 2.05);
});
check("Historischer Modellplatzhalter gilt nur als reservierte Kostenlücke", () => {
  const erlaubt = G.kostenBefund({ llmUsage: [{ createdAt: `${TAG}T22:00:00Z`,
    model: "none", estimatedCost: null }] }, 1, TAG);
  assert.strictEqual(erlaubt.prognoseUsd, 2.05);
  assert.throws(() => G.kostenBefund({ llmUsage: [{ createdAt: `${TAG}T22:00:00Z`,
    model: "none", estimatedCost: 0.01 }] }, 1, TAG));
});
check("Eine unvollständige Pflichtklasse wird abgewiesen", () => {
  assert.throws(() => G.bestandAusJobs(jobs().slice(1), FENSTER));
});

(async () => {
  const env = {
    GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: COMMIT,
    HELMUT_PRODUCTION_COMMIT: COMMIT, HELMUT_FACHZYKLUS_A_CONFIRM: G.CONFIRM,
    HELMUT_NATURLAUF_ID: "cron-crawl-20260906200000-test",
    SUPABASE_URL: G.PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY: "test",
    HELMUT_CRON_SECRET: "test", HELMUT_STORAGE_BACKEND: "supabase",
    HELMUT_V3_STORE: "on", HELMUT_PROFILE_DB_MODE: "relational-exclusive",
    HELMUT_CRAWL_RUN_RETENTION: "36", HELMUT_MAX_LLM_CALLS_PER_DAY: "2416",
    HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt"
  };
  const result = await G.ausfuehren({ env, fetchFn: attrappe(),
    now: () => new Date(`${TAG}T22:30:00Z`) });
  check("Der geschützte Weg führt genau eine Scheibe aus und prüft danach erneut", () => {
    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(result.ausgeloest, true);
    assert.strictEqual(result.scheiben, 1);
    assert.strictEqual(result.profileGleich, true);
    assert.strictEqual(result.identitaetenGleich, true);
    assert.strictEqual(result.kontenGleich, true);
    assert.strictEqual(result.kommunikationGleich, true);
    assert.strictEqual(result.jobsNach.briefing_materialization.erledigt, 20);
    assert.strictEqual(result.starttor.vorrangreserveReal, 200);
  });
  for (const wert of [null, 0, 199, "200"]) {
    let pipelineAufrufe = 0;
    const fake = attrappe(wert);
    const gesperrt = await G.ausfuehren({ env: { ...env, HELMUT_TESTLAUF_VORRANG_REAL: "200" },
      fetchFn: async (url, options) => {
        if (url === `${G.PUBLIC_URL}/api/cron/pipeline`) pipelineAufrufe++;
        return fake(url, options);
      }, now: () => new Date(`${TAG}T22:30:00Z`) });
    check(`Lokale Reserve ersetzt keinen gültigen Production Wert (${JSON.stringify(wert)})`, () => {
      assert.strictEqual(gesperrt.ausgeloest, false);
      assert.strictEqual(gesperrt.grund, "production-konfiguration-nicht-bestaetigt");
      assert.strictEqual(pipelineAufrufe, 0);
    });
  }
  const falscheZeit = await G.ausfuehren({ env, fetchFn: attrappe(),
    now: () => new Date(`${TAG}T20:00:00Z`) });
  check("Außerhalb des sicheren Tagesfensters wird vor jedem Aufruf gestoppt", () => {
    assert.strictEqual(falscheZeit.ausgeloest, false);
    assert.strictEqual(falscheZeit.grund, "a-fachzyklus-ausserhalb-des-heutigen-sicheren-fensters");
  });
  for (const started_at of ["2026-09-05T20:00:00Z", `${TAG}T04:00:00Z`]) {
    let pipelineAufrufe = 0;
    const fake = attrappe();
    const gesperrt = await G.ausfuehren({ env, fetchFn: async (url, options) => {
      if (url === `${G.PUBLIC_URL}/api/cron/pipeline`) pipelineAufrufe++;
      const response = await fake(url, options);
      if (new URL(url).pathname.endsWith("/process_runs")) {
        const rows = await response.json();
        rows[0].started_at = started_at;
        return antwort(rows);
      }
      return response;
    }, now: () => new Date(`${TAG}T22:30:00Z`) });
    check(`Nur der natürliche Abendcrawl desselben UTC Tages gilt (${started_at})`, () => {
      assert.strictEqual(gesperrt.ausgeloest, false);
      assert.strictEqual(gesperrt.grund, "erfolgreicher-natuerlicher-abendcrawl-fehlt");
      assert.strictEqual(pipelineAufrufe, 0);
    });
  }
  console.log(`\n${pass}/13 Prüfungen erfolgreich.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
