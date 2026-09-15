"use strict";
const A = require("node:assert/strict");
const R = require("./github-laufzeitpruefung");
const T = require("./b055-aufnahme/transport");
const { publicKey } = require("./privater-nachweis-transport");
const E = require("../lib/helmut/b055-einzelabschluss");

async function ausfuehren({ env = process.env, fetchFn = global.fetch } = {}) {
  A.equal(env.GITHUB_REPOSITORY, "ernisch/helmut-pilot");
  A.equal(env.GITHUB_REF, "refs/heads/main"); A.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch");
  A.equal(env.GITHUB_RUN_ATTEMPT, "1"); A.equal(env.HELMUT_PRODUCTION_COMMIT, env.GITHUB_SHA);
  A.equal(env.HELMUT_EINZEL_BESTAETIGUNG, E.CONFIRM);
  A.match(env.HELMUT_PRODUCTION_COMMIT || "", /^[a-f0-9]{40}$/);
  A.match(env.HELMUT_EINZEL_AUFTRAG_HASH || "", /^[a-f0-9]{64}$/);
  publicKey(env.HELMUT_NACHWEIS_PUBLIC_KEY);
  const ctx = T.context({ purpose: "b055-einzelabschluss-v1", runId: env.GITHUB_RUN_ID,
    workflowCommit: env.GITHUB_SHA, productionCommit: env.HELMUT_PRODUCTION_COMMIT });
  const before = await R.pruefe({ env, fetchFn }); A.equal(before.ok, true);
  // Genau EIN Request. Timeout/unklare Antwort bleibt abgebrochen, kein Retry.
  const response = await fetchFn("https://helmut-pilot.vercel.app/api/cron/b055-einzelabschluss", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(290000),
    headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json",
      "x-helmut-production-commit": env.HELMUT_PRODUCTION_COMMIT,
      "x-helmut-auftrag-hash": env.HELMUT_EINZEL_AUFTRAG_HASH, "x-helmut-bestaetigung": E.CONFIRM } });
  const raw = await response.text(); A(Buffer.byteLength(raw) <= 8 * 1024 * 1024);
  // Auch negative Serverberichte sichern. Keine privaten Texte/Fehler ins Log.
  let after = null; try { after = await R.pruefe({ env, fetchFn }); } catch { /* Bericht bleibt erhalten. */ }
  const payload = JSON.parse(raw);
  const ok = response.status === 200 && payload.ok === true && payload.userId === E.MANDAT
    && payload.freigegebeneModelle === 2 && payload.briefing?.gespeichert === true
    && JSON.stringify(before) === JSON.stringify(after);
  return { ok, envelope: T.encrypt({ version: 1, runtimeBefore: before, runtimeAfter: after,
    httpStatus: response.status, payload }, env.HELMUT_NACHWEIS_PUBLIC_KEY, ctx) };
}
if (require.main === module) ausfuehren().then(r => {
  console.log("B055_EINZEL_BEGIN"); console.log(JSON.stringify(r, null, 2)); console.log("B055_EINZEL_END");
  if (!r.ok) process.exitCode = 1;
}).catch(() => { console.error("B055 Einzelabschluss nicht bestaetigt. Keine automatische Wiederholung."); process.exitCode = 1; });
module.exports = { ausfuehren };
