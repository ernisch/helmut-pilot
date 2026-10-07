"use strict";
// Ausschliesslich lokale Responses, Testschluessel, Fake-Artefaktdienst und echte
// Prozesssignale. Kein Productionabruf, Secretzugriff oder Modell.
const A = require("node:assert/strict"), C = require("node:crypto"), F = require("node:fs"), P = require("node:path"), O = require("node:os");
const { fork } = require("node:child_process");
const G = require("./github-blocker2-readonly500"), H = require("./github-blocker2-cipher-checkpoint");
const X = require("./blocker2-cipher-parts"), T = require("./privater-nachweis-transport");
const S = require("../lib/helmut/synthetik-500-profile"), B = require("../lib/helmut/briefing-speicher");
const targets = S.erzeuge().profile, tag = "2026-10-08", fixed = new Date("2026-10-08T10:00:00Z");
function testEnv(publicKey) {
  return { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123456789", GITHUB_SHA: "a".repeat(40),
    HELMUT_PRODUCTION_COMMIT: "b".repeat(40), HELMUT_CRON_SECRET: "ONLY_A_TEST_SECRET", HELMUT_NACHWEIS_PUBLIC_KEY: publicKey };
}
function input(target, env) {
  const rest = { version: 1, mandat: target.mandatsId, tag };
  return { art: "production-briefing-eingabe", productionCommit: env.HELMUT_PRODUCTION_COMMIT, reinLesend: true,
    synthetisch: true, schreibaufrufe: 0, modellaufrufe: 0, fachlicheFreigabe: false, funktionsnachweis500: false,
    all500InputAcceptance: false, transaktionalerSnapshot: false,
    profile: { id: target.mandatsId, profileActive: false, synthetisch: true, parlament: target.parlament,
      herkunft: { person: "vollstaendig-fiktiv", amtlicherPersonenbeleg: false }, szenario: { variante: "basis-v1" },
      profilHash: "c".repeat(64), paketHash: "d".repeat(64) },
    result: { eingabe: { ...rest, eingabeHash: B.hash(rest) }, korrekturBasis: { kos: [] },
      briefing: { items: [{ text: "PRIVATE_OFFLINE_SENTINEL" }] } } };
}
function identity(env) {
  return new Response(JSON.stringify({ ok: true, commit: env.HELMUT_PRODUCTION_COMMIT, reinLesend: true,
    productionDataWrites: 0, paidModelCalls: 0, syntheticFixturesOnly: true, all500InputAcceptance: false }));
}
function fixture(env) {
  const files = new Map(), checkpoints = []; let inputs = 0, identities = 0;
  const args = { env, expectedRecipient: T.publicKey(env.HELMUT_NACHWEIS_PUBLIC_KEY).fingerprint, now: () => fixed,
    writeEnvelope: (name, envelope) => { A(!files.has(name)); files.set(name, envelope); },
    persistCheckpoint: request => { checkpoints.push(request); },
    fetchFn: async (url, options) => {
      A.equal(options.method, "GET"); A.equal(options.redirect, "error");
      if (url.endsWith("/api/release/dip-resolver")) { identities++; return identity(env); }
      const target = targets[inputs++]; A.equal(new URL(url).searchParams.get("mandat"), target.mandatsId);
      return new Response(JSON.stringify(input(target, env)));
    } };
  return { args, files, checkpoints, counts: () => ({ inputs, identities }) };
}
async function signalChild() {
  // Ein blockierter Fake-Body hat keinen Socket. IPC haelt den Testprozess bis
  // zum echten Signal lebendig, so wie der reale HTTP-Abruf seinen Socket.
  process.on("message", () => {});
  const config = JSON.parse(process.env.B2_DURABLE_CHILD_CONFIG), env = testEnv(config.publicKey);
  const f = fixture(env), controller = new AbortController(), cleanup = G.installStopHandlers(controller);
  f.args.signal = controller.signal;
  f.args.writeEnvelope = (name, envelope) => G.atomicEnvelope(config.source, name, envelope);
  f.args.persistCheckpoint = H.checkpointWriter({ source: config.source, env, root: config.checkpoints,
    upload: async request => ({ encryptedOnly: true, checkpoint: request.sequence,
      receipts: [{ id: request.sequence + 1, size: 1, digest: "e".repeat(64), files: 1 }] }) });
  const realFetch = f.args.fetchFn; let inputs = 0;
  f.args.fetchFn = async (url, options) => {
    if (url.includes("modus=eingabe") && ++inputs === 2) {
      const stream = new ReadableStream({ start(c) { c.enqueue(Buffer.from("PARTIAL_BODY")); } });
      process.send({ blocked: true }); return { status: 200, body: stream };
    }
    return realFetch(url, options);
  };
  try { const report = await G.ausfuehren(f.args); await new Promise(resolve => process.send({ report }, resolve)); }
  finally { cleanup(); process.disconnect(); }
}
async function main() {
  const pair = C.generateKeyPairSync("rsa", { modulusLength: 3072 });
  const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const key = pair.privateKey.export({ format: "pem", type: "pkcs8" }), env = testEnv(publicKey);
  const context = { runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA, tag };
  const decode = (envelope, position = 1) => T.entschluesseln(envelope, key, { ...context, abPosition: position, anzahl: 1 });
  const good = fixture(env), result = await G.ausfuehren(good.args);
  const missingStore = fixture(env); delete missingStore.args.persistCheckpoint;
  await A.rejects(G.ausfuehren(missingStore.args)); A.deepEqual(missingStore.counts(), { inputs: 0, identities: 0 });
  A.equal(result.ok, true); A.equal(good.checkpoints.length, 28);
  A.deepEqual(good.counts(), { inputs: 500, identities: 2 });
  A.equal(decode(good.checkpoints[0].envelope).attempted, 0);
  A.equal(decode(good.checkpoints[0].envelope).phase, "in-progress");
  A.equal(decode(good.checkpoints[1].envelope).completedPositions, 1);
  A.equal(decode(good.checkpoints.at(-1).envelope).phase, "final");
  for (const cp of good.checkpoints) { const d = decode(cp.envelope); A.equal(d.statuses.length, 500);
    A.equal(Object.values(d.counts).reduce((a, b) => a + b, 0), 500); A.equal(d.all500InputAcceptance, false); }
  for (const failedAt of [0, 1, 27]) {
    const f = fixture(env); let checkpoints = 0;
    f.args.persistCheckpoint = () => { if (checkpoints++ === failedAt) throw new Error("UPLOAD_FAILURE"); };
    const r = await G.ausfuehren(f.args); A.equal(r.ok, false); A.equal(r.stopReason, "cipher-checkpoint-failed");
    A.equal(f.counts().inputs, failedAt === 0 ? 0 : failedAt === 1 ? 1 : 500);
    A.equal(f.counts().identities, failedAt === 0 ? 0 : failedAt === 1 ? 1 : 2);
    A.equal(f.files.size, 501); A.equal(decode(f.files.get("manifest.json")).stopReason, "cipher-checkpoint-failed");
  }
  const denied = fixture(env), deniedFetch = denied.args.fetchFn;
  denied.args.fetchFn = async (url, options) => url.includes("modus=eingabe")
    ? new Response("x".repeat(T.MAX_BYTES + 1), { status: 401 }) : deniedFetch(url, options);
  const denial = await G.ausfuehren(denied.args);
  A.equal(denial.stopReason, "cron-access-rejected"); A.equal(denial.attempted, 1); A.equal(denial.counts["not-captured"], 499);
  const cancelledUpload = fixture(env), uploadStop = new AbortController(); cancelledUpload.args.signal = uploadStop.signal;
  cancelledUpload.args.persistCheckpoint = async request => {
    if (request.sequence === 1) { uploadStop.abort(); throw new Error("UPLOAD_CANCELLED"); }
  };
  const cancelledReport = await G.ausfuehren(cancelledUpload.args);
  A.equal(cancelledReport.stopReason, "workflow-cancelled"); A.equal(cancelledReport.attempted, 1);
  A.equal(cancelledUpload.counts().identities, 1); A.equal(cancelledUpload.files.size, 501);
  // Echtzeitdeadline, die waehrend eines blockierten Bodys ablaeuft. Keine
  // sleeps oder realen Productionanfragen und keine neue 60s-Nachlaufzeit.
  for (const kind of ["duration", "day"]) {
    const f = fixture(env), began = Date.now(); let offset = 0;
    const start = kind === "day" ? new Date("2026-10-08T21:59:59.500Z") : fixed;
    f.args.now = () => new Date(start.getTime() + offset + Date.now() - began);
    f.args.fetchFn = async (url, options) => {
      if (url.endsWith("/api/release/dip-resolver")) {
        offset = kind === "day" ? 250 : 55 * 60000 - 250;
        return identity(env);
      }
      const stream = new ReadableStream({ start(c) { c.enqueue(Buffer.from("PARTIAL")); } });
      return { status: 200, body: stream };
    };
    // Test-Socket: AbortSignal.timeout ist unref; der Fake-Body selbst hat
    // keinen Socket. Nur diesen lokalen Test waehrend der Deadline halten.
    const keepAlive = setInterval(() => {}, 1000);
    try { const r = await G.ausfuehren(f.args); A.equal(r.stopReason, "day-or-duration-boundary");
      A(r.attempted <= 1); A.equal(r.all500InputAcceptance, false); A.equal(f.files.size, 501); }
    finally { clearInterval(keepAlive); }
  }
  const temp = F.mkdtempSync(P.join(O.tmpdir(), "b2-durable-test-"));
  try {
    const root = P.join(temp, "checkpoints"), dir = P.join(root, "0000"); F.mkdirSync(dir, { recursive: true });
    for (const [name, envelope] of [["manifest.json", good.checkpoints[1].envelope], ["0001.json", good.files.get("0001.json")]])
      F.writeFileSync(P.join(dir, name), JSON.stringify(envelope) + "\n");
    const calls = [], client = { uploadArtifact: async (name, files, base, options) => {
      calls.push({ name, files }); A.equal(base, dir); A.deepEqual(options, { retentionDays: 1, compressionLevel: 0 });
      A(files.every(file => !F.readFileSync(file).includes("PRIVATE_OFFLINE_SENTINEL")));
      return { id: 1, size: 100, digest: "f".repeat(64) };
    } };
    const request = { sequence: 0, tag, env, root, client, recipient: T.publicKey(publicKey).fingerprint };
    const ack = await H.uploadCheckpoint(request); A.equal(ack.receipts.length, 1); A.equal(calls.length, 1);
    for (const change of [{ tag: "2026-10-09" }, { recipient: "0".repeat(64) }, { sequence: 28 },
      { remainingParts: 0 }, { remainingParts: 65 },
      { env: { ...env, GITHUB_RUN_ATTEMPT: "2" } }, { env: { ...env, GITHUB_SHA: "e".repeat(40) } }]) {
      const before = calls.length; await A.rejects(H.uploadCheckpoint({ ...request, ...change })); A.equal(calls.length, before);
    }
    F.writeFileSync(P.join(dir, "secret.txt"), "DO_NOT_UPLOAD");
    const before = calls.length; await A.rejects(H.uploadCheckpoint(request)); A.equal(calls.length, before); F.unlinkSync(P.join(dir, "secret.txt"));
    for (const receipt of [{ id: 0, size: 100, digest: "f".repeat(64) }, { id: 1, size: 100, digest: undefined }])
      await A.rejects(H.uploadCheckpoint({ ...request, client: { uploadArtifact: async () => receipt } }));
    const allowed = H.transportEnv({ ...env, GH_TOKEN: "FORBIDDEN", DEEPSEEK_API_KEY: "FORBIDDEN", ACTIONS_RUNTIME_TOKEN: "FAKE_RUNTIME" });
    A.equal(allowed.ACTIONS_RUNTIME_TOKEN, "FAKE_RUNTIME");
    A.equal(allowed.HELMUT_CRON_SECRET, undefined); A.equal(allowed.HELMUT_NACHWEIS_PUBLIC_KEY, undefined);
    A.equal(allowed.GH_TOKEN, undefined); A.equal(allowed.DEEPSEEK_API_KEY, undefined);
    for (const signal of ["SIGINT", "SIGTERM", "SIGKILL"]) {
      const source = P.join(temp, signal), checkpoints = P.join(temp, signal + "-checkpoints");
      let report = null, sent = false;
      await new Promise((resolve, reject) => {
        const child = fork(__filename, ["signal-child"], { env: { PATH: process.env.PATH,
          B2_DURABLE_CHILD_CONFIG: JSON.stringify({ publicKey, source, checkpoints }) }, stdio: ["ignore", "pipe", "pipe", "ipc"] });
        const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("signal-test-timeout")); }, 7000);
        child.stdout.resume(); child.stderr.resume(); child.on("error", reject);
        child.on("message", message => { if (message.blocked && !sent) { sent = true; child.kill(signal); }
          if (message.report) report = message.report; });
        child.on("exit", (code, exitSignal) => { clearTimeout(timer);
          try { A(sent); if (signal === "SIGKILL") A.equal(exitSignal, "SIGKILL"); else { A.equal(code, 0); A.equal(exitSignal, null); } resolve(); }
          catch (e) { reject(e); }
        });
      });
      const original = JSON.parse(F.readFileSync(P.join(source, "0001.json")));
      A.equal(decode(original).fullBodyRetained, true);
      const durable = F.readFileSync(P.join(checkpoints, "0001", "0001.json"));
      A.equal(durable.toString(), F.readFileSync(P.join(source, "0001.json"), "utf8"));
      A(F.existsSync(P.join(checkpoints, "0001-receipt.json")));
      if (signal === "SIGKILL") {
        A.equal(report, null); A(!F.existsSync(P.join(source, "manifest.json")));
        const entries = new Map([["0001.json", durable]]);
        A.equal(X.plane(entries, context, { recipient: T.publicKey(publicKey).fingerprint, partial: true }).flat().length, 1);
        A.throws(() => X.plane(entries, context, { recipient: T.publicKey(publicKey).fingerprint }));
      } else {
        if (report?.stopReason !== "workflow-cancelled" || report?.attempted !== 2)
          console.error(JSON.stringify({ signal, stopReason: report?.stopReason, attempted: report?.attempted }));
        A.equal(report.stopReason, "workflow-cancelled"); A.equal(report.attempted, 2);
        A.deepEqual(report.counts, { captured: 1, empty: 0, technical: 1, unusable: 0, contradictory: 0, "not-captured": 498 });
        A.equal(F.readdirSync(source).length, 501); A.equal(report.all500InputAcceptance, false);
        const interrupted = decode(JSON.parse(F.readFileSync(P.join(source, "0002.json"))), 2);
        A.equal(interrupted.fullBodyRetained, false); A.equal(interrupted.response.rawBody, undefined);
      }
    }
  } finally { F.rmSync(temp, { recursive: true, force: true }); }
  const workflow = F.readFileSync(P.join(__dirname, "../.github/workflows/blocker2-readonly500.yml"), "utf8");
  A.match(workflow, /uses: \.\/\.github\/actions\/blocker2-readonly500/);
  const action = F.readFileSync(P.join(__dirname, "../.github/actions/blocker2-readonly500/action.yml"), "utf8");
  A.match(action, /using: node24/); A.match(action, /main: \.\.\/\.\.\/\.\.\/scripts\/github-blocker2-readonly500\.js/);
  A.match(workflow, /blocker2-cipher-parts\.js teilstand/);
  A.match(workflow, /npm ci --prefix scripts\/blocker2-artifact-client --ignore-scripts/);
  A(!/actions: write|contents: write|schedule:|workflow_run:|DEEPSEEK_API_KEY/.test(workflow));
  console.log("B2 dauerhafte Cipher-Sicherung offline: 500 geschlossene Positionen, Upload-vor-GET, Sicherungsfehlerstop, feste Identitaet/Empfaenger, Secrettrennung, SIGINT/SIGTERM und erhaltene Originalbytes nach SIGKILL bestanden. Kein Production-Nachweis.");
}
(process.argv[2] === "signal-child" ? signalChild() : main()).catch(error => {
  console.error("B2 dauerhafte Cipher-Sicherung Offline-Test fehlgeschlagen."); process.exitCode = 1;
  console.error((error.stack || "").split("\n").filter(line => /^\s+at /.test(line)).slice(0, 5).join("\n"));
});
