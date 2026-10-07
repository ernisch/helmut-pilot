"use strict";
// Separater B2-Nurleser. Kein Teststart, Konto, Datenbankwriter oder Modell.
const A = require("node:assert/strict"), C = require("node:crypto"), F = require("node:fs"), P = require("node:path");
const S = require("../lib/helmut/synthetik-500-profile"), B = require("../lib/helmut/briefing-speicher");
const T = require("./privater-nachweis-transport"), { berlinTagKey } = require("../lib/helmut/briefing-frische");
const RECIPIENT = "8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7";
const ORIGIN = "https://helmut-pilot.vercel.app";
const TARGET = S.erzeuge().profile;
const sha = raw => C.createHash("sha256").update(raw).digest("hex");
const ctx = (env, tag, position) => ({ runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA, tag, abPosition: position, anzahl: 1 });
function preflight(env, tag, expectedRecipient) {
  A.equal(env.GITHUB_REPOSITORY, "ernisch/helmut-pilot"); A.equal(env.GITHUB_REF, "refs/heads/main");
  A.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch"); A.equal(env.GITHUB_RUN_ATTEMPT, "1");
  A.match(env.GITHUB_SHA || "", /^[a-f0-9]{40}$/); A.match(env.HELMUT_PRODUCTION_COMMIT || "", /^[a-f0-9]{40}$/);
  A(typeof env.HELMUT_CRON_SECRET === "string" && env.HELMUT_CRON_SECRET.trim() === env.HELMUT_CRON_SECRET && env.HELMUT_CRON_SECRET.length > 0);
  A.equal(T.publicKey(env.HELMUT_NACHWEIS_PUBLIC_KEY).fingerprint, expectedRecipient); T.kontext(ctx(env, tag, 1));
}
function validate(payload, target, env, tag) {
  const contradiction = payload.productionCommit !== env.HELMUT_PRODUCTION_COMMIT
    || payload.reinLesend !== true || payload.schreibaufrufe !== 0 || payload.modellaufrufe !== 0
    || payload.profile?.id !== target.mandatsId || payload.profile?.profileActive !== false
    || payload.profile?.synthetisch !== true || payload.profile?.parlament !== target.parlament
    || payload.profile?.herkunft?.person !== "vollstaendig-fiktiv"
    || payload.profile?.herkunft?.amtlicherPersonenbeleg !== false;
  if (contradiction) return "contradictory";
  if (payload.art !== "production-briefing-eingabe" || payload.synthetisch !== true
    || payload.fachlicheFreigabe !== false || payload.funktionsnachweis500 !== false
    || payload.all500InputAcceptance !== false || payload.transaktionalerSnapshot !== false
    || !S.VARIANTEN.includes(payload.profile?.szenario?.variante)
    || !/^[a-f0-9]{64}$/.test(payload.profile?.profilHash || "")
    || !/^[a-f0-9]{64}$/.test(payload.profile?.paketHash || "")
    || !Array.isArray(payload.result?.korrekturBasis?.kos)) return "unusable";
  const { eingabeHash, ...input } = payload.result?.eingabe || {};
  if (input.mandat !== target.mandatsId || input.tag !== tag || eingabeHash !== B.hash(input)) return "unusable";
  if (!Array.isArray(payload.result?.briefing?.items)) return "unusable";
  return payload.result.briefing.items.length ? "captured" : "empty";
}
// Der echte fetch-Response wird vor text/JSON begrenzt; kein ungebremster Body.
async function readBody(response) {
  const limit = T.MAX_BYTES, length = response.headers?.get("content-length");
  if (length != null && /^\d+$/.test(length) && Number(length) > limit) {
    if (response.body) await response.body.cancel(); throw new Error("body-limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("body-limit"); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
async function ausfuehren({ env = process.env, fetchFn = global.fetch, now = () => new Date(), writeEnvelope, expectedRecipient = RECIPIENT } = {}) {
  const start = now(), tag = berlinTagKey(start); preflight(env, tag, expectedRecipient); A.equal(typeof writeEnvelope, "function");
  let stopped = null, attempted = 0, firstIdentity = null, lastIdentity = null;
  const statuses = [];
  const seal = async (name, payload, position) => {
    await writeEnvelope(name, T.verschluesseln(payload, env.HELMUT_NACHWEIS_PUBLIC_KEY, ctx(env, tag, position)));
  };
  const timeOK = () => berlinTagKey(now()) === tag && now().getTime() - start.getTime() < 55 * 60000;
  const identity = async () => {
    const r = await fetchFn(ORIGIN + "/api/release/dip-resolver", { method: "GET", redirect: "error", signal: AbortSignal.timeout(60000),
      headers: { Accept: "application/json", "x-helmut-production-commit": env.HELMUT_PRODUCTION_COMMIT } });
    A.equal(r.status, 200); const x = JSON.parse(await readBody(r));
    A.equal(x.ok, true); A.equal(x.commit, env.HELMUT_PRODUCTION_COMMIT); A.equal(x.reinLesend, true);
    A.equal(x.productionDataWrites, 0); A.equal(x.paidModelCalls, 0);
    A.equal(x.syntheticFixturesOnly, true); A.equal(x.all500InputAcceptance, false); return x;
  };
  try { firstIdentity = await identity(); } catch { stopped = "production-identity-unconfirmed"; }
  for (let index = 0; index < TARGET.length; index++) {
    const target = TARGET[index], position = index + 1;
    if (!stopped && !timeOK()) stopped = "day-or-duration-boundary";
    let status = "not-captured", response = null;
    if (!stopped) {
      attempted++;
      const url = ORIGIN + "/api/cron/briefing-nachweis?modus=eingabe&mandat=" + encodeURIComponent(target.mandatsId) + "&tag=" + tag;
      try {
        const r = await fetchFn(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(60000),
          headers: { Authorization: "Bearer " + env.HELMUT_CRON_SECRET, Accept: "application/json", "x-helmut-production-commit": env.HELMUT_PRODUCTION_COMMIT } });
        response = { url, httpStatus: r.status, observedUTC: now().toISOString() };
        const raw = await readBody(r);
        response.rawBodySHA256 = sha(raw); response.rawBody = raw;
        status = "technical";
        if ([401, 403].includes(r.status)) stopped = "cron-access-rejected";
        if (r.status === 200) {
          try { status = validate(JSON.parse(raw), target, env, tag); } catch { status = "unusable"; }
          if (status === "contradictory") stopped = "production-proof-contradiction";
        }
      } catch (error) { status = "technical"; if (response) response.bodyReadFailure = error.message === "body-limit" ? "body-limit" : "body-read-failed"; }
      if (!timeOK()) { stopped = "day-or-duration-boundary"; status = "unusable"; }
    }
    const record = { version: 1, purpose: "blocker2-readonly500-input", userId: target.mandatsId, position, tag,
      workflowCommit: env.GITHUB_SHA, productionCommit: env.HELMUT_PRODUCTION_COMMIT, status, stopReason: stopped,
      fullBodyRetained: response !== null && typeof response.rawBody === "string", response, all500InputAcceptance: false };
    // Zu grosse Antworten bleiben explizit unerfassbar, kein abgeschnittener Erfolg.
    if (Buffer.byteLength(JSON.stringify(record)) > T.MAX_BYTES) {
      if (response) { delete response.rawBody; record.fullBodyRetained = false; }
      record.status = status = "technical"; record.transportLimitExceeded = true;
    }
    await seal(String(position).padStart(4, "0") + ".json", record, position);
    statuses.push({ userId: target.mandatsId, position, status, fullBodyRetained: record.fullBodyRetained });
  }
  if (!stopped && timeOK()) {
    try { lastIdentity = await identity(); } catch { stopped = "ending-production-identity-unconfirmed"; }
  } else if (!stopped) stopped = "day-or-duration-boundary";
  const counts = Object.fromEntries(["captured", "empty", "technical", "unusable", "contradictory", "not-captured"]
    .map(status => [status, statuses.filter(s => s.status === status).length]));
  const report = { ok: !stopped && counts.captured === 500, collectionCompleted: !stopped && attempted === 500, reinLesend: true, profiles: 500, attempted, counts,
    stopReason: stopped, productionCommit: env.HELMUT_PRODUCTION_COMMIT, all500InputAcceptance: false,
    fachlicheFreigabe: false, paidModelCalls: 0, productionDataWrites: 0, transaktionalerSnapshot: false };
  await seal("manifest.json", { version: 1, purpose: "blocker2-readonly500-manifest", ...report,
    runId: env.GITHUB_RUN_ID, workflowCommit: env.GITHUB_SHA, tag, firstIdentity, lastIdentity, statuses }, 1);
  return report;
}
if (require.main === module) {
  const dir = P.join(__dirname, "..", "tmp", "blocker2-readonly500");
  ausfuehren({ writeEnvelope: (name, envelope) => {
    A.match(name, /^(?:\d{4}|manifest)\.json$/); F.mkdirSync(dir, { recursive: true, mode: 0o700 });
    F.writeFileSync(P.join(dir, name), JSON.stringify(envelope) + "\n", { flag: "wx", mode: 0o600 });
  } }).then(r => { console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1; })
    .catch(() => { console.error("Blocker2 Nurleseaufnahme unvollstaendig; ausschliesslich verschluesselte Belege."); process.exitCode = 1; });
}
module.exports = { ausfuehren };
