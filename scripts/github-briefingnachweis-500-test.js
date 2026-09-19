"use strict";
const assert = require("node:assert/strict");
const R = require("./github-briefingnachweis-500");
const { KOHORTE_KENNUNGEN } = require("../lib/helmut/testkohorte-betrieb");
const { PROJECT_URL } = require("./github-fachzyklus-a");
const N = require("./fixtures/nachweis-null500");
const SHA = "a".repeat(40), TAG = "2026-09-09";
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_SHA: SHA, HELMUT_PRODUCTION_COMMIT: SHA, HELMUT_NACHWEIS_TAG: TAG, SUPABASE_URL: PROJECT_URL,
  HELMUT_NACHWEIS_TESTFENSTER: N.manifest.laufId,
  SUPABASE_SERVICE_ROLE_KEY: "nur-fixture", HELMUT_CRON_SECRET: "nur-fixture" };
const profile = [...KOHORTE_KENNUNGEN.map(user_id => ({ user_id, aktiv: false })),
  ...Array.from({ length: 9 }, (_, i) => ({ user_id: "mandat-fixture-" + i, aktiv: i < 5 }))];
let calls = 0, badTenant = false, beendet = false, fensterReads = 0, fensterAendern = false;
const gelesen = new Set();
const fetchFn = async (url, init) => {
  calls++; assert.equal(init.method, "GET"); assert.equal(init.redirect, "error");
  const u = new URL(url);
  if (u.pathname === "/api/cron/testnachweis-status") return { status: 200, json: async () => ({
    ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: SHA,
    storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
    retentionGueltig: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true,
    retention: 36, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 }) };
  if (u.pathname === "/rest/v1/mandate_profiles") return { status: 200,
    headers: { get: () => "0-503/504" }, json: async () => profile };
  if (u.pathname === "/rest/v1/helmut_store") {
    assert.equal(u.searchParams.get("id"), "eq." + N.zeile().id);
    fensterReads++;
    return { status: 200, headers: { get: () => "0-0/1" },
      json: async () => [N.zeile(beendet || (fensterAendern && fensterReads > 1) ? "beendet" : "aktiv")] };
  }
  assert.equal(u.pathname, "/api/cron/briefing-nachweis"); assert.equal(u.searchParams.get("tag"), TAG);
  const id = u.searchParams.get("mandat");
  gelesen.add(id);
  if (id.startsWith("test-kohorte-")) return { status: 200, json: async () => ({ available: false, reason: "briefing-nicht-gespeichert" }) };
  return { status: 200, json: async () => ({ available: true, items: [{ text: "PRIVATER_TEXT" }],
    currentHelmutState: {}, currentRadarState: {}, lageBriefing: { paragraphs: [{}] },
    gespeicherterNachweis: { id: `bf-${badTenant ? "fremd" : id}-mandatsbriefing-${TAG}`,
      pruefung: { strukturellVollstaendig: false, bestanden: false } } }) };
};
(async () => {
  const r = await R.ausfuehren({ env, fetchFn });
  assert.equal(r.ok, true); assert.equal(r.gelesen, 500); assert.equal(calls, 504);
  assert.equal(r.zielHash, N.manifest.zielHash); assert.deepEqual([...gelesen].sort(), N.manifest.ids);
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
    abrufGruende: { "app-vertrag-gelesen": 5, "briefing-nicht-gespeichert": 2 } });
  assert.deepEqual(R.oeffentlicherBericht({ results: [{ grund: "PRIVATER_GRUND" }] }), { abrufGruende: { sonstige: 1 } });
  // Der bisherige Aktivfilter verliert hier alle fuenf Bestandsprofile.
  profile.forEach(p => { p.aktiv = false; }); beendet = true; gelesen.clear();
  const nachEnde = await R.ausfuehren({ env, fetchFn });
  assert.equal(nachEnde.ok, true); assert.equal(nachEnde.gelesen, 500); assert.equal(nachEnde.abrufbar, 5);
  assert.deepEqual([...gelesen].sort(), N.manifest.ids);
  // Selbst ein fremd aktives ausgeschlossenes Profil wird nicht in den Nenner gezogen.
  profile.find(p => p.user_id === N.manifest.ausserhalb[0]).aktiv = true; gelesen.clear();
  assert.equal((await R.ausfuehren({ env, fetchFn })).gelesen, 500);
  assert.deepEqual([...gelesen].sort(), N.manifest.ids);
  beendet = false; fensterAendern = true; fensterReads = 0;
  const wechsel = await R.ausfuehren({ env, fetchFn });
  assert.equal(wechsel.ok, false); assert.equal(wechsel.grund, "nachweis-testfenster-waehrend-lesung-veraendert");
  fensterAendern = false;
  badTenant = true;
  assert.equal((await R.ausfuehren({ env, fetchFn })).abrufbar, 0);
  calls = 0;
  assert.equal((await R.ausfuehren({ env: { ...env, GITHUB_REF: "refs/heads/fremd" }, fetchFn })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await R.ausfuehren({ env: { ...env, HELMUT_NACHWEIS_TESTFENSTER: "" }, fetchFn })).ok, false);
  assert.equal(calls, 0);
  assert.equal((await R.ausfuehren({ env: { ...env, HELMUT_NACHWEIS_TAG: "2026-02-30" }, fetchFn })).ok, false);
  assert.equal(calls, 0);
  console.log("7/7 Testgruppen: nur GET, feste500 vor/nach Ende, fremde Aktivierung ohne Einfluss, Quittungswechsel erkannt, keine falsche Fachabnahme.");
})().catch(e => { console.error(e); process.exitCode = 1; });
