"use strict";
const assert = require("node:assert/strict");
const R = require("./github-briefingnachweis-500");
const { KOHORTE_KENNUNGEN } = require("../lib/helmut/testkohorte-betrieb");
const { PROJECT_URL } = require("./github-fachzyklus-a");
const SHA = "a".repeat(40), TAG = "2026-09-09";
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_SHA: SHA, HELMUT_PRODUCTION_COMMIT: SHA, HELMUT_NACHWEIS_TAG: TAG, SUPABASE_URL: PROJECT_URL,
  SUPABASE_SERVICE_ROLE_KEY: "nur-fixture", HELMUT_CRON_SECRET: "nur-fixture" };
const profile = [...KOHORTE_KENNUNGEN.map(user_id => ({ user_id, aktiv: false })),
  ...Array.from({ length: 9 }, (_, i) => ({ user_id: "mandat-fixture-" + i, aktiv: i < 5 }))];
let calls = 0, badTenant = false;
const fetchFn = async (url, init) => {
  calls++; assert.equal(init.method, "GET"); assert.equal(init.redirect, "error");
  const u = new URL(url);
  if (u.pathname === "/api/cron/testnachweis-status") return { status: 200, json: async () => ({
    ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
    retentionGueltig: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true,
    retention: 36, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 }) };
  if (u.pathname === "/rest/v1/mandate_profiles") return { status: 200, json: async () => profile };
  assert.equal(u.pathname, "/api/cron/briefing-nachweis"); assert.equal(u.searchParams.get("tag"), TAG);
  const id = u.searchParams.get("mandat");
  if (id.startsWith("test-kohorte-")) return { status: 200, json: async () => ({ available: false, reason: "briefing-nicht-gespeichert" }) };
  return { status: 200, json: async () => ({ available: true, items: [{ text: "PRIVATER_TEXT" }],
    currentHelmutState: {}, currentRadarState: {}, lageBriefing: { paragraphs: [{}] },
    gespeicherterNachweis: { id: `bf-${badTenant ? "fremd" : id}-mandatsbriefing-${TAG}`,
      pruefung: { strukturellVollstaendig: false, bestanden: false } } }) };
};
(async () => {
  const r = await R.ausfuehren({ env, fetchFn });
  assert.equal(r.ok, true); assert.equal(r.gelesen, 500); assert.equal(calls, 502);
  assert.equal(r.abrufbar, 5); assert.equal(r.strukturellVollstaendig, 0); assert.equal(r.qualitaetBestanden, 0);
  assert.equal(r.funktionsnachweis500, false); assert.equal(r.results.length, 500);
  assert(!JSON.stringify(r).includes("PRIVATER") && !JSON.stringify(r).includes("mandat-fixture"));
  const publicReport = R.oeffentlicherBericht({ ...r, privaterZusatz: "PRIVAT" });
  assert.equal(publicReport.gelesen, 500); assert.equal(publicReport.abrufbar, 5);
  assert.equal(publicReport.funktionsnachweis500, false);
  assert.deepEqual(publicReport.abrufGruende, { "briefing-nicht-gespeichert": 495, "app-vertrag-gelesen": 5 });
  assert(!Object.hasOwn(publicReport, "results") && !JSON.stringify(publicReport).includes("PRIVAT"));
  for (const result of r.results) assert(!JSON.stringify(publicReport).includes(result.mandatHash));
  const failedReport = R.oeffentlicherBericht({ ok: false, grund: "nachweis-zeitbudget", gelesen: 7,
    results: r.results.slice(0, 7), funktionsnachweis500: false });
  assert.deepEqual(failedReport, { ok: false, gelesen: 7, funktionsnachweis500: false, grund: "nachweis-zeitbudget",
    abrufGruende: { "briefing-nicht-gespeichert": 7 } });
  assert.deepEqual(R.oeffentlicherBericht({ results: [{ grund: "PRIVATER_GRUND" }] }), { abrufGruende: { sonstige: 1 } });
  badTenant = true;
  assert.equal((await R.ausfuehren({ env, fetchFn })).abrufbar, 0);
  calls = 0;
  assert.equal((await R.ausfuehren({ env: { ...env, GITHUB_REF: "refs/heads/fremd" }, fetchFn })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await R.ausfuehren({ env: { ...env, HELMUT_NACHWEIS_TAG: "2026-02-30" }, fetchFn })).ok, false);
  assert.equal(calls, 0);
  console.log("4/4 Testgruppen: ausschliesslich GET, 500 eindeutige Mandate, keine falsche Abnahme, kein Fremdmandatsnachweis.");
})().catch(e => { console.error(e); process.exitCode = 1; });
