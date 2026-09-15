"use strict";
const A = require("node:assert/strict");
const R = require("./github-laufzeitpruefung");
const T = require("./b055-aufnahme/transport");
const { publicKey } = require("./privater-nachweis-transport");
const MANDAT = "test-kohorte-b-055";

async function erfasse({ env = process.env, fetchFn = global.fetch, now = () => new Date() } = {}) {
  A.equal(env.GITHUB_REPOSITORY, "ernisch/helmut-pilot");
  A.equal(env.GITHUB_REF, "refs/heads/main");
  A.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  A.equal(env.GITHUB_RUN_ATTEMPT, "1");
  A.match(env.HELMUT_PRODUCTION_COMMIT || "", /^[a-f0-9]{40}$/);
  A.equal(env.HELMUT_PRODUCTION_COMMIT, env.GITHUB_SHA);
  const modus = env.HELMUT_NACHWEIS_MODUS || "eingabe";
  A(["eingabe", "ausgabe"].includes(modus));
  publicKey(env.HELMUT_NACHWEIS_PUBLIC_KEY);
  const context = T.context({ purpose: "b055-eingabeaufnahme-v1", runId: env.GITHUB_RUN_ID,
    workflowCommit: env.GITHUB_SHA, productionCommit: env.HELMUT_PRODUCTION_COMMIT });
  const runtime = async () => {
    const r = await R.pruefe({ env, fetchFn });
    A.equal(r.ok, true);
    for (const k of ["storageSupabase", "v3Bereit", "profileRelational", "profileExclusive",
      "kommunikationGesperrt", "kohortenQuellenGesperrt"]) A.equal(r[k], true);
    A.equal(r.testKosten?.aktiv, true); A.equal(r.testKosten.limitUsd, 4);
    A.equal(r.quellenkontext?.atomicLock, true);
    return r;
  };
  const before = await runtime();
  const tag = require("../lib/helmut/briefing-frische").berlinTagKey(now());
  const url = `https://helmut-pilot.vercel.app/api/cron/briefing-nachweis?mandat=${MANDAT}&tag=${tag}&modus=eingabe`;
  const response = await fetchFn(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(120000),
    headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json",
      "x-helmut-production-commit": env.HELMUT_PRODUCTION_COMMIT } });
  A.equal(response.status, 200);
  const raw = await response.text(); A(Buffer.byteLength(raw) <= 8 * 1024 * 1024);
  const payload = JSON.parse(raw);
  A.equal(payload.art, "production-briefing-eingabe"); A.equal(payload.reinLesend, true);
  A.equal(payload.productionCommit, env.HELMUT_PRODUCTION_COMMIT);
  A.equal(payload.profile?.id, MANDAT); A.equal(payload.profile.profileActive, false);
  A.equal(payload.result?.eingabe?.mandat, MANDAT); A.equal(payload.result.eingabe.tag, tag);
  let ausgabe = null;
  if (modus === "ausgabe") {
    const appUrl = url.replace("&modus=eingabe", "");
    const appResponse = await fetchFn(appUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json",
        "x-helmut-production-commit": env.HELMUT_PRODUCTION_COMMIT } });
    A.equal(appResponse.status, 200);
    const appRaw = await appResponse.text(); A(Buffer.byteLength(appRaw) <= 8 * 1024 * 1024);
    const app = JSON.parse(appRaw), n = app.gespeicherterNachweis;
    A.equal(app.available, true);
    A(require("../lib/helmut/briefing-profilkontext").nachweisKennungGueltig(n, MANDAT, tag));
    // Der strukturelle Speicherbeleg behauptet bewusst keine Faktenabnahme.
    // Fachurteil und echte Modellpruefung werden separat inhaltlich gelesen.
    A.equal(n.pruefung?.strukturellVollstaendig, true);
    A(Array.isArray(app.items) && app.items.length > 0 && app.currentHelmutState && app.currentRadarState);
    A(Array.isArray(app.lageBriefing?.paragraphs) && app.lageBriefing.paragraphs.length > 0);
    ausgabe = { url: appUrl, httpStatus: 200, rawBody: appRaw,
      rawBodySha256: require("node:crypto").createHash("sha256").update(appRaw).digest("hex"), payload: app };
  }
  const after = await runtime();
  A.deepEqual(after, before);
  return { ok: true, klartextImLog: false, envelope: T.encrypt({ version: 1, runtimeBefore: before,
    runtimeAfter: after, ...(ausgabe ? { ausgabe } : {}), response: { url, httpStatus: 200, rawBody: raw,
      rawBodySha256: require("node:crypto").createHash("sha256").update(raw).digest("hex") }, payload }, env.HELMUT_NACHWEIS_PUBLIC_KEY, context) };
}
if (require.main === module) erfasse().then(r => {
  console.log("B055_PRODUCTION_BEGIN"); console.log(JSON.stringify(r, null, 2)); console.log("B055_PRODUCTION_END");
}).catch(() => { console.error("B055 Productionaufnahme nicht bestaetigt; keine privaten Daten im Log."); process.exitCode = 1; });
module.exports = { erfasse };
