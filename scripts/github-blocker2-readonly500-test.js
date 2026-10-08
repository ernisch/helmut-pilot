"use strict";
const A = require("node:assert/strict"), C = require("node:crypto"), F = require("node:fs");
const G = require("./github-blocker2-readonly500"), T = require("./privater-nachweis-transport");
const S = require("../lib/helmut/synthetik-500-profile"), B = require("../lib/helmut/briefing-speicher");
const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
const key = pair.privateKey.export({ format: "pem", type: "pkcs8" });
const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123456789", GITHUB_SHA: "a".repeat(40),
  HELMUT_PRODUCTION_COMMIT: "b".repeat(40), HELMUT_CRON_SECRET: "private-test-secret", HELMUT_NACHWEIS_PUBLIC_KEY: publicKey };
const tag = "2026-10-07", fixed = new Date("2026-10-07T12:00:00Z"), targets = S.erzeuge().profile;
function payload(target) {
  const rest = { version: 1, mandat: target.mandatsId, tag };
  return { art: "production-briefing-eingabe", productionCommit: env.HELMUT_PRODUCTION_COMMIT,
    reinLesend: true, synthetisch: true, schreibaufrufe: 0, modellaufrufe: 0, fachlicheFreigabe: false,
    funktionsnachweis500: false, all500InputAcceptance: false, transaktionalerSnapshot: false,
    profile: { id: target.mandatsId, profileActive: false, synthetisch: true, parlament: target.parlament,
      herkunft: { person: "vollstaendig-fiktiv", amtlicherPersonenbeleg: false }, szenario: { variante: "basis-v1" },
      profilHash: "c".repeat(64), paketHash: "d".repeat(64) },
    result: { eingabe: { ...rest, eingabeHash: B.hash(rest) }, korrekturBasis: { kos: [] }, briefing: { items: [{ text: "PRIVATE_BODY_SENTINEL" }] } } };
}
function fixture(change = () => {}, failure = null) {
  const calls = [], envelopes = new Map(); let inputs = 0, identities = 0;
  const args = { env: { ...env }, expectedRecipient: T.publicKey(publicKey).fingerprint, now: () => fixed,
    persistCheckpoint: async () => {}, // Nur der explizite Fake-Artefaktdienst dieses Offline-Tests.
    writeEnvelope: async (name, value) => { A(!envelopes.has(name)); envelopes.set(name, value); },
    fetchFn: async (url, options) => {
      calls.push(url); A.equal(options.method, "GET"); A.equal(options.redirect, "error");
      A.equal(new URL(url).origin, "https://helmut-pilot.vercel.app");
      A.equal(options.headers["x-helmut-production-commit"], env.HELMUT_PRODUCTION_COMMIT);
      if (url.endsWith("/api/release/dip-resolver")) {
        identities++; A.equal(options.headers.Authorization, undefined);
        return { status: 200, body: new Response(JSON.stringify({ ok: true, commit: env.HELMUT_PRODUCTION_COMMIT,
          reinLesend: true, productionDataWrites: 0, paidModelCalls: 0, syntheticFixturesOnly: true,
          all500InputAcceptance: false, ...(failure === "ending-runtime" && identities === 2 ? { commit: "e".repeat(40) } : {}) })).body };
      }
      const u = new URL(url), target = targets[inputs++];
      A.equal(u.pathname, "/api/cron/briefing-nachweis"); A.equal(u.searchParams.get("modus"), "eingabe");
      A.equal(u.searchParams.get("tag"), tag); A.equal(u.searchParams.get("mandat"), target.mandatsId);
      A.equal(options.headers.Authorization, "Bearer " + env.HELMUT_CRON_SECRET);
      if (failure === "network" && inputs === 1) throw new Error("PRIVATE_BODY_SENTINEL");
      const p = payload(target); if (inputs === 1) change(p);
      return { status: failure === "403" && inputs === 1 ? 403 : failure === "503" && inputs === 1 ? 503 : 200,
        body: new Response(failure === "oversize" && inputs === 1 ? "x".repeat(T.MAX_BYTES + 1) : failure === "non-json" && inputs === 1 ? "PRIVATE_BODY_SENTINEL" : JSON.stringify(p)).body };
    } };
  return { args, calls, envelopes, count: () => inputs };
}
const decrypt = (f, name, position = 1) => T.entschluesseln(f.envelopes.get(name), key,
  { runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA, tag, abPosition: position, anzahl: 1 });
(async () => {
  const good = fixture(), r = await G.ausfuehren(good.args);
  A.equal(r.ok, true); A.equal(r.attempted, 500); A.equal(r.counts.captured, 500);
  A.equal(good.calls.length, 502); A.equal(good.envelopes.size, 501); A.equal(r.all500InputAcceptance, false);
  const ids = [], scopes = {};
  for (let i = 1; i <= 500; i++) {
    const d = decrypt(good, String(i).padStart(4, "0") + ".json", i);
    A.equal(d.userId, targets[i - 1].mandatsId); A.equal(d.status, "captured"); A.equal(d.fullBodyRetained, true);
    A.equal(d.response.rawBodySHA256, C.createHash("sha256").update(d.response.rawBody).digest("hex"));
    A.equal(JSON.parse(d.response.rawBody).profile.profileActive, false); ids.push(d.userId);
    scopes[targets[i - 1].parlament] = (scopes[targets[i - 1].parlament] || 0) + 1;
  }
  A.equal(new Set(ids).size, 500); A.deepEqual(scopes, { bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
  A(!JSON.stringify([...good.envelopes.values()]).includes("PRIVATE_BODY_SENTINEL"));
  A(!JSON.stringify([...good.envelopes.values()]).includes(env.HELMUT_CRON_SECRET));
  A(!JSON.stringify(r).includes(targets[0].mandatsId));
  const manifest = decrypt(good, "manifest.json"); A.equal(manifest.statuses.length, 500); A.equal(manifest.all500InputAcceptance, false);
  A.throws(() => T.entschluesseln(good.envelopes.get("0001.json"), key, { runId: env.GITHUB_RUN_ID,
    commit: env.GITHUB_SHA, tag, abPosition: 2, anzahl: 1 }));
  const tamper = structuredClone(good.envelopes.get("0001.json")); tamper.authentisierung = Buffer.alloc(16).toString("base64");
  A.throws(() => T.entschluesseln(tamper, key, { runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA, tag, abPosition: 1, anzahl: 1 }));
  for (const [name, value] of [["HELMUT_CRON_SECRET", ""], ["HELMUT_NACHWEIS_PUBLIC_KEY", "invalid"], ["GITHUB_REPOSITORY", "foreign/repo"],
    ["GITHUB_REF", "refs/heads/foreign"], ["GITHUB_EVENT_NAME", "push"], ["GITHUB_RUN_ATTEMPT", "2"], ["HELMUT_PRODUCTION_COMMIT", "wrong"]]) {
    const f = fixture(); f.args.env[name] = value; await A.rejects(G.ausfuehren(f.args)); A.equal(f.calls.length, 0); A.equal(f.envelopes.size, 0);
  }
  for (const mutate of [p => p.profile.profileActive = true, p => p.profile.id = "foreign", p => p.profile.synthetisch = false,
    p => p.profile.herkunft.amtlicherPersonenbeleg = true, p => p.productionCommit = "e".repeat(40),
    p => p.schreibaufrufe = 1, p => p.modellaufrufe = 1]) {
    const f = fixture(mutate), x = await G.ausfuehren(f.args); A.equal(x.ok, false); A.equal(f.count(), 1);
    A.equal(x.counts.contradictory, 1); A.equal(x.counts["not-captured"], 499); A.equal(x.all500InputAcceptance, false);
  }
  for (const failure of ["network", "non-json", "oversize"]) {
    const f = fixture(() => {}, failure), x = await G.ausfuehren(f.args); A.equal(f.count(), 500);
    A.equal(x.ok, false); A.equal(x.collectionCompleted, true); A.equal(x.counts.captured, 499); A.equal(x.counts.technical + x.counts.unusable, 1);
    if (failure === "oversize") { const d = decrypt(f, "0001.json"); A.equal(d.fullBodyRetained, false); A.equal(d.response.bodyReadFailure, "body-limit"); }
  }
  const serverFailure = fixture(() => {}, "503"), failureReport = await G.ausfuehren(serverFailure.args);
  A.equal(serverFailure.count(), 1); A.equal(failureReport.stopReason, "production-input-http-error");
  A.equal(failureReport.collectionCompleted, false); A.equal(failureReport.counts.technical, 1);
  A.equal(failureReport.counts["not-captured"], 499); A.equal(decrypt(serverFailure, "0001.json").fullBodyRetained, true);
  const recipientDrift = fixture(); recipientDrift.args.expectedRecipient = "0".repeat(64);
  await A.rejects(G.ausfuehren(recipientDrift.args)); A.equal(recipientDrift.calls.length, 0); A.equal(recipientDrift.envelopes.size, 0);
  const denied = fixture(() => {}, "403"), deniedReport = await G.ausfuehren(denied.args);
  A.equal(denied.count(), 1); A.equal(deniedReport.ok, false); A.equal(deniedReport.counts["not-captured"], 499);
  for (const [change, status] of [[p => p.result.briefing.items = [], "empty"], [p => delete p.result.eingabe, "unusable"],
    [p => p.result.eingabe.eingabeHash = "f".repeat(64), "unusable"]]) {
    const f = fixture(change), x = await G.ausfuehren(f.args); A.equal(x.counts[status], 1); A.equal(x.all500InputAcceptance, false);
  }
  const drift = fixture(); let ticks = 0; drift.args.now = () => ++ticks < 4 ? fixed : new Date("2026-10-07T22:01:00Z");
  const driftReport = await G.ausfuehren(drift.args); A.equal(driftReport.ok, false); A(drift.count() < 500);
  const ending = fixture(() => {}, "ending-runtime"), endingReport = await G.ausfuehren(ending.args);
  A.equal(endingReport.ok, false); A.equal(endingReport.attempted, 500); A.equal(endingReport.all500InputAcceptance, false);
  const workflow = F.readFileSync(require("node:path").join(__dirname, "../.github/workflows/blocker2-readonly500.yml"), "utf8");
  A.match(workflow, /workflow_dispatch:/); A(!/^  (schedule|push|pull_request):/m.test(workflow));
  A.match(workflow, /contents: read/); A.match(workflow, /secrets\.HELMUT_CRON_SECRET/);
  A(!/(SUPABASE_SERVICE_ROLE_KEY|DEEPSEEK_API_KEY|500-direkt|500-testfenster|500-testende)/.test(workflow));
  A.match(workflow, /tmp\/blocker2-cipher-parts\/01\/\*\.json/);
  console.log("B2 Nurleser: 500/500 eindeutige inaktive synthetische Eingaben 330/120/50, verschluesselter Transport, Zugriffssperren, Drift-/Widerspruchsstop und getrennte Fehlerklassen offline bestanden; keine Production-Abnahme.");
})().catch(() => { console.error("B2 Nurleser Offline-Test fehlgeschlagen."); process.exitCode = 1; });
