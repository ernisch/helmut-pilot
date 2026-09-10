"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), F = require("node:fs");
const R = require("./github-privater-inhaltsnachweis-500"), T = require("./privater-nachweis-transport");
const E = require("../lib/helmut/lage-entwurfsbeleg"), S = require("../lib/helmut/storage");
const { KOHORTE_KENNUNGEN } = require("../lib/helmut/testkohorte-betrieb");
const { PROJECT_URL } = require("./github-fachzyklus-a");
const SHA = "a".repeat(40), DAY = "2026-09-11";
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const publicKey = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
const pem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123456789012",
  GITHUB_SHA: SHA, HELMUT_PRODUCTION_COMMIT: SHA, HELMUT_NACHWEIS_TAG: DAY,
  HELMUT_PRIVAT_AB_POSITION: "6", HELMUT_PRIVAT_ANZAHL: "3", HELMUT_NACHWEIS_PUBLIC_KEY: publicKey,
  SUPABASE_URL: PROJECT_URL, SUPABASE_SERVICE_ROLE_KEY: "PRIVATE_TEST_SERVICE_KEY", HELMUT_CRON_SECRET: "PRIVATE_TEST_CRON_KEY" };
const all = [...KOHORTE_KENNUNGEN.map(user_id => ({ user_id, aktiv: true })),
  ...Array.from({ length: 9 }, (_, i) => ({ user_id: "mandat-fixture-" + i, aktiv: i < 5 }))]
  .sort((a, b) => a.user_id.localeCompare(b.user_id));
const ids = all.filter(r => r.aktiv).map(r => r.user_id).sort().slice(5, 8);
function mock(mode) {
  const calls = [], reads = new Map();
  const response = rows => ({ status: 200, json: async () => rows,
    headers: { get: name => name === "content-range" ? (rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0") : null } });
  return { calls, fetchFn: async (url, init) => {
    calls.push(url); A.equal(init.method, "GET"); A.equal(init.redirect, "error");
    const u = new URL(url);
    if (u.pathname === "/api/cron/testnachweis-status") return { status: 200, json: async () => ({
      ok: true, schemaVersion: 1, reinLesend: true, production: true, commit: mode === "commit" ? "b".repeat(40) : SHA,
      storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
      retentionGueltig: true, kommunikationGesperrt: true, kohortenQuellenGesperrt: true,
      retention: 36, tagesdeckel: 2416, understandingReserve: 702, vorrangreserveReal: 200 }) };
    A.equal(u.origin, PROJECT_URL); A.equal(init.headers.Prefer, "count=exact");
    if (mode === "error") throw new Error("PRIVATER_ROHFEHLER PRIVATE_TEST_SERVICE_KEY");
    if (u.pathname === "/rest/v1/pipeline_locks") return response(mode === "lock" ? [{ job_name: "anderer-lauf" }] : []);
    if (u.pathname === "/rest/v1/helmut_jobs") return response([]);
    const id = (u.searchParams.get("user_id") || "").replace(/^eq\./, "");
    if (!id) {
      A.equal(u.pathname, "/rest/v1/mandate_profiles"); A.equal(u.searchParams.get("select"), "user_id,aktiv");
      const n = (reads.get("all") || 0) + 1; reads.set("all", n);
      const list = structuredClone(all); if (mode === "target-change" && n > 1) list[0].aktiv = !list[0].aktiv;
      return response(list);
    }
    A(ids.includes(id), "Expliziter Mandatsfilter muss in der ausgewaehlten Dreiermenge liegen");
    const rawProfile = { user_id: id, aktiv: true, geloescht_at: null, politische_ebene: "bundestag",
      ausschuesse: ["Wissenschaft"], profil_extras: { privatesKontaktfeld: "NICHT_EXPORTIEREN" } };
    if (u.pathname === "/rest/v1/mandate_profiles") {
      const n = (reads.get(id) || 0) + 1; reads.set(id, n);
      if (mode === "profile-change" && n > 1) rawProfile.ausschuesse = ["Gesundheit"];
      return response([rawProfile]);
    }
    A.equal(u.pathname, "/rest/v1/briefings");
    A.equal(u.searchParams.get("id"), `like.bf-${id}-*-${DAY}*`);
    A.equal(u.searchParams.get("slot"), "in.(lage,mandatsbriefing,lage-pruefentwurf)");
    const profile = S.fromMandateProfileRow({ id }, rawProfile);
    const row = E.baue({ userId: id, runId: "nachlauf500-123456789010", phase: "entwurf",
      antwort: { paragraphs: [{ text: "PRIVATER_TEXT", vorgang_ids: ["vg-fixture"] }] },
      quellen: [{ vorgang_id: "vg-fixture", quellenbelege: [{ auszug: "PRIVATER_QUELLTEXT" }] }],
      profile, now: new Date("2026-09-10T23:00:00Z") });
    if (mode === "foreign") row.user_id = "fremder-mandant";
    if (mode === "damaged") row.payload.antwort.paragraphs[0].text = "verfaelscht";
    if (mode === "day") row.id = row.id.replace(DAY, "2026-09-10");
    const r = response([row]);
    if (mode === "truncated") r.headers.get = () => "0-0/2";
    if (mode === "row-change" && reads.get(id) > 1) {
      row.generated_at = "2026-09-10T23:01:00Z";
    }
    return r;
  } };
}
(async () => {
  const good = mock(), result = await R.ausfuehren({ env, fetchFn: good.fetchFn });
  A.equal(result.ok, true); A.equal(result.modellaufrufe, 0); A.equal(result.schreibaufrufe, 0);
  A.equal(result.funktionsnachweis500, false);
  const plain = T.entschluesseln(result.envelope, pem, { runId: env.GITHUB_RUN_ID, commit: SHA, tag: DAY, abPosition: 6, anzahl: 3 });
  A.deepEqual(plain.mandate.map(m => m.userId), ids); A.equal(plain.transaktionalerSnapshot, false);
  A(plain.mandate.every(m => m.belege[0].payload.antwort.paragraphs[0].text === "PRIVATER_TEXT"));
  A(!JSON.stringify(plain).includes("NICHT_EXPORTIEREN"));
  for (const marker of ["PRIVATER", "PRIVATE_TEST", "mandat-fixture", ...ids]) A(!JSON.stringify(result).includes(marker));
  for (const mode of ["lock", "foreign", "damaged", "day", "truncated", "profile-change", "row-change", "target-change", "commit", "error"]) {
    const m = mock(mode), r = await R.ausfuehren({ env, fetchFn: m.fetchFn });
    A.equal(r.ok, false, mode); A.equal(r.envelope, undefined, mode); A(!JSON.stringify(r).includes("PRIVAT"));
    if (mode === "lock") A(!m.calls.some(s => s.includes("mandate_profiles")));
  }
  for (const change of [{ GITHUB_REF: "refs/heads/fremd" }, { GITHUB_RUN_ATTEMPT: "2" },
    { HELMUT_NACHWEIS_PUBLIC_KEY: "kein-schluessel" }, { HELMUT_PRIVAT_ANZAHL: "26" },
    { HELMUT_PRIVAT_AB_POSITION: "06" }, { HELMUT_PRIVAT_AB_POSITION: "499" },
    { HELMUT_NACHWEIS_TAG: "2026-02-30" }, { GITHUB_SHA: "b".repeat(40) }]) {
    const m = mock(), r = await R.ausfuehren({ env: { ...env, ...change }, fetchFn: m.fetchFn });
    A.equal(r.ok, false, JSON.stringify(change)); A.equal(m.calls.length, 0);
  }
  const workflow = F.readFileSync(require("node:path").join(__dirname, "../.github/workflows/500-zugangspruefung.yml"), "utf8");
  A.match(workflow, /privater_inhaltsnachweis:[\s\S]*?type: boolean\s+default: false/);
  A.match(workflow, /github.event_name == 'workflow_dispatch' && inputs.privater_inhaltsnachweis/);
  A(!/upload-artifact|private[_-]key/i.test(workflow));
  console.log("5/5 Lesergruppen: echte verschluesselte Teilmenge, nur GET, Tenant/Tag/Hash/Gleichstand, Vollstaendigkeit und kein Klartext/Secret im Fehlerpfad.");
})().catch(e => { console.error(e); process.exitCode = 1; });
