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
// Eine aktive Publikationssperre braucht ihre eigene erwartete Bindung. Der
// Commit allein darf einen geaenderten Quellenumfang nicht still freigeben.
function expectedPublicationHash(env) {
  const value = env.HELMUT_PUBLICATION_ELIGIBILITY_HASH;
  if (value === undefined || value === "") return null;
  A.equal(typeof value, "string"); A.match(value, /^[a-f0-9]{64}$/); return value;
}
function publicationPolicy(value) {
  if (value === undefined) return null;
  A(value && typeof value === "object" && !Array.isArray(value));
  A.deepEqual(Object.keys(value).sort(), ["hash", "heldPublications", "version"]);
  A.equal(value.version, 1); A.match(value.hash || "", /^[a-f0-9]{64}$/);
  A(Number.isSafeInteger(value.heldPublications) && value.heldPublications > 0);
  return { version: 1, hash: value.hash, heldPublications: value.heldPublications };
}
function samePublicationPolicy(a, b) { return B.hash(a) === B.hash(b); }
function assertSourceSafety(payload, policy) {
  const nested = payload.quellenkontext?.sourceSafetyStandard;
  if (policy) {
    A.equal(payload.sourceSafetyStandard, false);
    A.equal(payload.legacySourceFiltersActive, false);
    if (nested !== undefined) A.equal(nested, false);
  } else {
    A(payload.sourceSafetyStandard === undefined || payload.sourceSafetyStandard === true);
    A(payload.legacySourceFiltersActive === undefined || payload.legacySourceFiltersActive === false);
    A(nested === undefined || nested === true);
  }
}
function preflight(env, tag, expectedRecipient) {
  A.equal(env.GITHUB_REPOSITORY, "ernisch/helmut-pilot"); A.equal(env.GITHUB_REF, "refs/heads/main");
  A.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch"); A.equal(env.GITHUB_RUN_ATTEMPT, "1");
  A.match(env.GITHUB_SHA || "", /^[a-f0-9]{40}$/); A.match(env.HELMUT_PRODUCTION_COMMIT || "", /^[a-f0-9]{40}$/);
  A(typeof env.HELMUT_CRON_SECRET === "string" && env.HELMUT_CRON_SECRET.trim() === env.HELMUT_CRON_SECRET && env.HELMUT_CRON_SECRET.length > 0);
  A.equal(T.publicKey(env.HELMUT_NACHWEIS_PUBLIC_KEY).fingerprint, expectedRecipient); T.kontext(ctx(env, tag, 1));
  expectedPublicationHash(env);
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
async function readBody(response, signal) {
  signal?.throwIfAborted();
  const limit = T.MAX_BYTES, length = response.headers?.get("content-length");
  if (length != null && /^\d+$/.test(length) && Number(length) > limit) {
    if (response.body) void response.body.cancel().catch(() => {});
    throw new Error("body-limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader(), chunks = []; let size = 0;
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => { void reader.cancel().catch(() => {}); rejectAbort(new Error("read-aborted")); };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      signal?.throwIfAborted(); if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new Error("body-limit"); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { signal?.removeEventListener("abort", onAbort); reader.releaseLock(); }
}
// Die beiden oeffentlichen Einstiege binden die Position im Code. Keine
// ENV-, HTTP- oder Workflow-Eingabe darf diese Auswahl erweitern.
async function ausfuehren(options = {}) {
  return ausfuehrenGebunden(options, 122);
}
async function ausfuehrenDiagnose12(options = {}) {
  A(options && typeof options === "object" && !Array.isArray(options));
  const erlaubt = new Set(["env", "fetchFn", "now", "writeEnvelope", "persistCheckpoint", "signal", "expectedRecipient"]);
  A(Object.keys(options).every(k => erlaubt.has(k)));
  const env = options.env || process.env;
  // Dieser eigene Lauf muss aus genau dem ausgerollten Stand stammen.
  // Ein paralleler main-Wechsel stoppt vor Cipher-ACK und Production-GETs.
  A.match(env.GITHUB_SHA || "", /^[a-f0-9]{40}$/);
  A.equal(env.GITHUB_SHA, env.HELMUT_PRODUCTION_COMMIT);
  return ausfuehrenGebunden({ ...options, diagnose: true }, 12);
}
async function ausfuehrenGebunden({ env = process.env, fetchFn = global.fetch, now = () => new Date(), writeEnvelope,
  persistCheckpoint, signal, expectedRecipient = RECIPIENT, diagnose = false } = {}, festePosition) {
  A.equal(typeof diagnose, "boolean");
  // Nur der separate feste Diagnose-Einstieg setzt dies. Kein HTTP-/ENV-/
  // Workflow-Parameter kann ein anderes Profil oder zusaetzliche GETs waehlen.
  const plannedInputGETs = diagnose ? 1 : 500, minutes = diagnose ? 3 : 55;
  const scope = diagnose ? { diagnosticOnly: true, fixedProfilePosition: festePosition, plannedInputGETs: 1 } : {};
  const start = now(), tag = berlinTagKey(start); preflight(env, tag, expectedRecipient); A.equal(typeof writeEnvelope, "function");
  A.equal(typeof persistCheckpoint, "function");
  const expectedPolicyHash = expectedPublicationHash(env);
  let stopped = null, attempted = 0, firstIdentity = null, lastIdentity = null;
  let firstPublicationPolicy = null;
  const policyEvidence = () => ({
    ...(expectedPolicyHash ? { expectedPublicationEligibilityHash: expectedPolicyHash } : {}),
    ...(firstPublicationPolicy ? { publicationEligibilityPolicy: firstPublicationPolicy, sourceSafetyStandard: false } : {})
  });
  const policyHeaders = expectedPolicyHash ? { "x-helmut-publication-eligibility-hash": expectedPolicyHash } : {};
  const statuses = [];
  const seal = async (name, payload, position) => {
    await writeEnvelope(name, T.verschluesseln(payload, env.HELMUT_NACHWEIS_PUBLIC_KEY, ctx(env, tag, position)));
  };
  const timeOK = () => berlinTagKey(now()) === tag && now().getTime() - start.getTime() < minutes * 60000;
  const stopCheck = () => {
    if (!stopped && signal?.aborted) stopped = "workflow-cancelled";
    if (!stopped && !timeOK()) stopped = "day-or-duration-boundary";
  };
  // Der laufende Abruf einschliesslich Body endet an der verbleibenden
  // 55min-/Tagesgrenze, nicht erst beim folgenden Profil.
  const requestSignal = () => {
    const current = now();
    signal?.throwIfAborted();
    let milliseconds = Math.min(60000, start.getTime() + minutes * 60000 - current.getTime());
    if (berlinTagKey(current) !== tag || milliseconds <= 0) throw new Error("read-window-closed");
    if (berlinTagKey(new Date(current.getTime() + Math.max(0, milliseconds))) !== tag) {
      let lo = 0, hi = Math.max(0, milliseconds);
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (berlinTagKey(new Date(current.getTime() + mid)) === tag) lo = mid; else hi = mid;
      }
      milliseconds = hi;
    }
    const deadline = AbortSignal.timeout(Math.max(1, Math.floor(milliseconds)));
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
  };
  let checkpointSequence = 0, cipherFinalSaved = false;
  const checkpoint = async (final = false) => {
    const allStatuses = TARGET.map((target, index) => statuses[index] || {
      userId: target.mandatsId, position: index + 1, status: "not-captured", fullBodyRetained: false });
    const counts = Object.fromEntries(["captured", "empty", "technical", "unusable", "contradictory", "not-captured"]
      .map(status => [status, allStatuses.filter(s => s.status === status).length]));
    const payload = { version: 1, purpose: "blocker2-readonly500-manifest", runId: env.GITHUB_RUN_ID,
      workflowCommit: env.GITHUB_SHA, tag, productionCommit: env.HELMUT_PRODUCTION_COMMIT,
      phase: final ? "final" : "in-progress", completedPositions: statuses.length, profiles: 500, attempted, counts, ...scope,
      stopReason: stopped, firstIdentity, lastIdentity, statuses: allStatuses, ...policyEvidence(),
      collectionCompleted: final && !diagnose && !stopped && attempted === 500,
      all500InputAcceptance: false, fachlicheFreigabe: false, reinLesend: true,
      paidModelCalls: 0, productionDataWrites: 0, transaktionalerSnapshot: false };
    const envelope = T.verschluesseln(payload, env.HELMUT_NACHWEIS_PUBLIC_KEY, ctx(env, tag, 1));
    // Ohne bestaetigte erste Sicherung wird ueberhaupt kein Production-GET
    // gestartet. Uploadfehler fuehren zum Stop, nie zu erneutem Quellenabruf.
    try {
      await persistCheckpoint({ sequence: checkpointSequence++, tag, envelope,
        completedPositions: statuses.length, final, signal, cancelled: signal?.aborted === true });
      if (final && !signal?.aborted) cipherFinalSaved = true;
    } catch { stopCheck(); if (!stopped) stopped = "cipher-checkpoint-failed"; }
    stopCheck();
  };
  const identity = async () => {
    const readSignal = requestSignal();
    const r = await fetchFn(ORIGIN + "/api/release/dip-resolver", { method: "GET", redirect: "error", signal: readSignal,
      headers: { Accept: "application/json", "x-helmut-production-commit": env.HELMUT_PRODUCTION_COMMIT, ...policyHeaders } });
    A.equal(r.status, 200); const x = JSON.parse(await readBody(r, readSignal));
    A.equal(x.ok, true); A.equal(x.commit, env.HELMUT_PRODUCTION_COMMIT); A.equal(x.reinLesend, true);
    A.equal(x.productionDataWrites, 0); A.equal(x.paidModelCalls, 0);
    A.equal(x.syntheticFixturesOnly, true); A.equal(x.all500InputAcceptance, false);
    let policy;
    try {
      policy = publicationPolicy(x.publicationEligibilityPolicy);
      A.equal(policy?.hash || null, expectedPolicyHash);
      if (firstIdentity) A(samePublicationPolicy(policy, firstPublicationPolicy));
    } catch { throw new Error("publication-policy-mismatch"); }
    try { assertSourceSafety(x, policy); } catch { throw new Error("source-safety-mismatch"); }
    return x;
  };
  await checkpoint();
  if (!stopped) {
    try { firstIdentity = await identity(); firstPublicationPolicy = publicationPolicy(firstIdentity.publicationEligibilityPolicy); }
    catch (error) { stopCheck(); if (!stopped) stopped = error.message === "publication-policy-mismatch"
      ? "production-publication-policy-mismatch" : error.message === "source-safety-mismatch"
        ? "production-source-safety-mismatch" : "production-identity-unconfirmed"; }
    stopCheck();
  }
  for (let index = 0; index < TARGET.length; index++) {
    const target = TARGET[index], position = index + 1;
    const requested = !diagnose || position === festePosition;
    stopCheck();
    let status = "not-captured", response = null, requestStarted = false;
    if (!stopped && requested) {
      const url = ORIGIN + "/api/cron/briefing-nachweis?modus=eingabe&mandat=" + encodeURIComponent(target.mandatsId) + "&tag=" + tag;
      try {
        const readSignal = requestSignal();
        attempted++; requestStarted = true;
        const r = await fetchFn(url, { method: "GET", redirect: "error", signal: readSignal,
          headers: { Authorization: "Bearer " + env.HELMUT_CRON_SECRET, Accept: "application/json", "x-helmut-production-commit": env.HELMUT_PRODUCTION_COMMIT, ...policyHeaders } });
        response = { url, httpStatus: r.status, observedUTC: now().toISOString() };
        // Jeder Nicht-200-Ausgang stoppt vor jedem weiteren Production-GET.
        // Auch ein fehlender/zu grosser Fehlerbody darf den Stop nicht umgehen.
        if ([401, 403].includes(r.status)) stopped = "cron-access-rejected";
        else if (r.status !== 200) stopped = "production-input-http-error";
        const raw = await readBody(r, readSignal);
        response.rawBodySHA256 = sha(raw); response.rawBody = raw;
        status = "technical";
        if (r.status === 200) {
          try {
            const payload = JSON.parse(raw);
            try {
              A(samePublicationPolicy(publicationPolicy(payload.publicationEligibilityPolicy), firstPublicationPolicy));
              A(samePublicationPolicy(publicationPolicy(payload.result?.eingabe?.publicationEligibilityPolicy), firstPublicationPolicy));
            } catch { stopped = "production-publication-policy-drift"; status = "contradictory"; }
            if (!stopped) {
              try { assertSourceSafety(payload, firstPublicationPolicy); }
              catch { stopped = "production-source-safety-drift"; status = "contradictory"; }
            }
            if (!stopped) status = validate(payload, target, env, tag);
          } catch { status = "unusable"; if (firstPublicationPolicy && !stopped) stopped = "production-publication-policy-unconfirmed"; }
          if (status === "contradictory" && !stopped) stopped = "production-proof-contradiction";
          if ((diagnose || firstPublicationPolicy) && status === "unusable" && !stopped) stopped = "production-input-unusable";
          if (firstPublicationPolicy && status === "empty" && !stopped) stopped = "production-input-empty";
        }
      } catch (error) { status = requestStarted ? "technical" : "not-captured";
        if (diagnose && !stopped) stopped = "production-input-read-error";
        if (firstPublicationPolicy && requestStarted && !stopped) stopped = "production-publication-policy-unconfirmed";
        if (response) response.bodyReadFailure = error.message === "body-limit" ? "body-limit" : "body-read-failed"; }
      stopCheck();
      if (!timeOK()) { stopped = "day-or-duration-boundary"; if (requestStarted) status = "unusable"; }
    }
    const record = { version: 1, purpose: "blocker2-readonly500-input", userId: target.mandatsId, position, tag,
      workflowCommit: env.GITHUB_SHA, productionCommit: env.HELMUT_PRODUCTION_COMMIT, status, stopReason: stopped,
      fullBodyRetained: response !== null && typeof response.rawBody === "string", response, all500InputAcceptance: false, ...scope, ...policyEvidence() };
    // Zu grosse Antworten bleiben explizit unerfassbar, kein abgeschnittener Erfolg.
    if (Buffer.byteLength(JSON.stringify(record)) > T.MAX_BYTES) {
      if (response) { delete response.rawBody; record.fullBodyRetained = false; }
      record.status = status = "technical"; record.transportLimitExceeded = true;
      if ((diagnose || firstPublicationPolicy) && !stopped) stopped = "production-input-transport-limit";
      record.stopReason = stopped;
    }
    await seal(String(position).padStart(4, "0") + ".json", record, position);
    statuses.push({ userId: target.mandatsId, position, status, fullBodyRetained: record.fullBodyRetained });
    // Erste Eingabe sofort dauerhaft sichern; danach begrenzte Zwischenstaende.
    // Bei Signal zuerst schnell den geschlossenen Endstand schreiben. Bereits
    // bestaetigte Artefakte bleiben auch bei hartem Prozessende abrufbar.
    if (!stopped && requested && (attempted === 1 || position % 20 === 0)) await checkpoint();
  }
  stopCheck();
  if (!stopped) {
    try { lastIdentity = await identity(); } catch (error) { stopCheck(); if (!stopped) stopped = error.message === "publication-policy-mismatch"
      ? "ending-production-publication-policy-drift" : error.message === "source-safety-mismatch"
        ? "ending-production-source-safety-drift" : "ending-production-identity-unconfirmed"; }
    stopCheck();
  }
  await checkpoint(true);
  const counts = Object.fromEntries(["captured", "empty", "technical", "unusable", "contradictory", "not-captured"]
    .map(status => [status, statuses.filter(s => s.status === status).length]));
  const report = { ok: !stopped && counts.captured === plannedInputGETs,
    collectionCompleted: !diagnose && !stopped && attempted === 500,
    cipherFinalSaved, reinLesend: true, profiles: 500, attempted, counts, ...scope, ...policyEvidence(),
    stopReason: stopped, productionCommit: env.HELMUT_PRODUCTION_COMMIT, all500InputAcceptance: false,
    fachlicheFreigabe: false, paidModelCalls: 0, productionDataWrites: 0, transaktionalerSnapshot: false };
  await seal("manifest.json", { version: 1, purpose: "blocker2-readonly500-manifest", ...report,
    runId: env.GITHUB_RUN_ID, workflowCommit: env.GITHUB_SHA, tag, firstIdentity, lastIdentity, statuses }, 1);
  return report;
}
function installStopHandlers(controller, target = process) {
  const stop = () => { if (!controller.signal.aborted) controller.abort(); };
  target.on("SIGINT", stop); target.on("SIGTERM", stop);
  return () => { target.off("SIGINT", stop); target.off("SIGTERM", stop); };
}
function atomicEnvelope(dir, name, envelope) {
  A.match(name, /^(?:\d{4}|manifest)\.json$/); F.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = P.join(dir, name), staging = dir + "-staging";
  A(!F.existsSync(file)); F.mkdirSync(staging, { recursive: true, mode: 0o700 });
  const temp = P.join(staging, name), fd = F.openSync(temp, "wx", 0o600);
  try { F.writeFileSync(fd, JSON.stringify(envelope) + "\n"); F.fsyncSync(fd); } finally { F.closeSync(fd); }
  F.renameSync(temp, file);
}
if (require.main === module) {
  const dir = P.join(__dirname, "..", "tmp", "blocker2-readonly500");
  const controller = new AbortController(), cleanup = installStopHandlers(controller);
  const { checkpointWriter } = require("./github-blocker2-cipher-checkpoint");
  ausfuehren({ signal: controller.signal, writeEnvelope: (name, envelope) => atomicEnvelope(dir, name, envelope),
    persistCheckpoint: checkpointWriter({ source: dir, env: process.env })
  }).then(r => {
    if (process.env.GITHUB_OUTPUT) F.appendFileSync(process.env.GITHUB_OUTPUT, "cipher_final_saved=" + String(r.cipherFinalSaved) + "\n");
    console.log(JSON.stringify(r)); if (!r.ok) process.exitCode = 1;
  })
    .catch(() => { console.error("Blocker2 Nurleseaufnahme unvollstaendig; ausschliesslich verschluesselte Belege."); process.exitCode = 1; })
    .finally(cleanup);
}
module.exports = { ausfuehren, ausfuehrenDiagnose12, installStopHandlers, atomicEnvelope };
