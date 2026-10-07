"use strict";
// Unveraenderte Cipherbytes vor weiteren Production-GETs dauerhaft sichern.
// Der Upload laeuft in einem Kindprozess ohne Cronsecret und ohne Public Key.
const A = require("node:assert/strict"), F = require("node:fs"), P = require("node:path"), C = require("node:crypto");
const { spawn } = require("node:child_process"), X = require("./blocker2-cipher-parts");
const ROOT = P.join(__dirname, "..", "tmp", "blocker2-checkpoints"), MAX_UPLOADS = 64;
function transportEnv(env) {
  const names = ["PATH", "SystemRoot", "TMPDIR", "RUNNER_TEMP", "GITHUB_REPOSITORY", "GITHUB_REF", "GITHUB_EVENT_NAME",
    "GITHUB_RUN_ATTEMPT", "GITHUB_RUN_ID", "GITHUB_SHA", "ACTIONS_RUNTIME_TOKEN", "ACTIONS_RUNTIME_URL", "ACTIONS_RESULTS_URL",
    "GITHUB_SERVER_URL", "GITHUB_API_URL", "GITHUB_WORKSPACE", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"];
  return Object.fromEntries(names.filter(name => typeof env[name] === "string").map(name => [name, env[name]]));
}
function preflight(env) {
  A.equal(env.GITHUB_REPOSITORY, "ernisch/helmut-pilot"); A.equal(env.GITHUB_REF, "refs/heads/main");
  A.equal(env.GITHUB_EVENT_NAME, "workflow_dispatch"); A.equal(env.GITHUB_RUN_ATTEMPT, "1");
  A.match(env.GITHUB_SHA || "", /^[a-f0-9]{40}$/); A.match(env.GITHUB_RUN_ID || "", /^\d{5,20}$/);
}
async function uploadCheckpoint({ sequence, tag, remainingParts = MAX_UPLOADS, env = process.env, root = ROOT, client, recipient = X.RECIPIENT }) {
  preflight(env); A(Number.isInteger(sequence) && sequence >= 0 && sequence <= 27);
  A(Number.isInteger(remainingParts) && remainingParts >= 1 && remainingParts <= MAX_UPLOADS);
  A.match(tag, /^\d{4}-\d{2}-\d{2}$/);
  const dir = P.join(root, String(sequence).padStart(4, "0"));
  A(F.lstatSync(dir).isDirectory() && !F.lstatSync(dir).isSymbolicLink());
  const names = F.readdirSync(dir).sort(); A(names.includes("manifest.json"));
  const entries = new Map();
  for (const name of names) {
    A(X.NAMES.includes(name)); const file = P.join(dir, name), stat = F.lstatSync(file);
    A(stat.isFile() && !stat.isSymbolicLink() && stat.size <= X.MAX_FILE);
    entries.set(name, F.readFileSync(file));
  }
  const context = { runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA, tag };
  // Alles validieren, bevor die SDK ueberhaupt einen Upload starten darf.
  const groups = X.plane(entries, context, { recipient, partial: true, maxParts: Math.min(X.MAX_PARTS, remainingParts) });
  if (!client) {
    const { DefaultArtifactClient } = require("./blocker2-artifact-client/node_modules/@actions/artifact");
    client = new DefaultArtifactClient();
  }
  const receipts = [];
  for (let index = 0; index < groups.length; index++) {
    const name = "blocker2-readonly500-" + env.GITHUB_RUN_ID + "-checkpoint-" + String(sequence).padStart(4, "0")
      + "-part-" + String(index + 1).padStart(2, "0");
    const r = await client.uploadArtifact(name, groups[index].map(file => P.join(dir, file)), dir,
      { retentionDays: 1, compressionLevel: 0 });
    A(Number.isSafeInteger(r.id) && r.id > 0 && Number.isSafeInteger(r.size) && r.size > 0);
    A.match(r.digest || "", /^[a-f0-9]{64}$/);
    receipts.push({ id: r.id, size: r.size, digest: r.digest, files: groups[index].length });
  }
  return { checkpoint: sequence, encryptedOnly: true, receipts };
}
function runTransport(request, env, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cipher-upload-cancelled"));
    const child = spawn(process.execPath, [__filename, "upload"], { env: transportEnv(env), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", settled = false;
    const finish = (error, value) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", onAbort);
      if (error) { child.kill("SIGKILL"); reject(new Error("cipher-upload-failed")); } else resolve(value);
    };
    const timer = setTimeout(() => finish(true), 120000);
    const onAbort = () => finish(true);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.stdout.on("data", chunk => { stdout += chunk.toString(); if (stdout.length > 32768) finish(true); });
    // Keine SDK-Rohlogs, signed URLs oder Zugangsdaten an den Leser weitergeben.
    child.stderr.resume(); child.on("error", () => finish(true)); child.stdin.on("error", () => finish(true));
    child.on("exit", code => {
      if (code !== 0) return finish(true);
      try { const r = JSON.parse(stdout); A.equal(r.checkpoint, request.sequence); A.equal(r.encryptedOnly, true);
        A(Array.isArray(r.receipts) && r.receipts.length > 0); finish(false, r);
      } catch { finish(true); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
function checkpointWriter({ source, env, root = ROOT, upload = runTransport }) {
  let savedThrough = 0, uploads = 0;
  return async ({ sequence, tag, envelope, completedPositions, cancelled, signal }) => {
    if (cancelled) return;
    A(Number.isInteger(sequence) && sequence >= 0 && sequence <= 27);
    A(Number.isInteger(completedPositions) && completedPositions >= savedThrough && completedPositions <= 500);
    A(uploads < MAX_UPLOADS);
    const dir = P.join(root, String(sequence).padStart(4, "0")); F.mkdirSync(dir, { recursive: true, mode: 0o700 });
    F.writeFileSync(P.join(dir, "manifest.json"), JSON.stringify(envelope) + "\n", { flag: "wx", mode: 0o600 });
    for (let position = savedThrough + 1; position <= completedPositions; position++) {
      const name = String(position).padStart(4, "0") + ".json", path = P.join(source, name), stat = F.lstatSync(path);
      A(stat.isFile() && !stat.isSymbolicLink() && stat.size <= X.MAX_FILE);
      F.writeFileSync(P.join(dir, name), F.readFileSync(path), { flag: "wx", mode: 0o600 });
    }
    // Bei SIGINT/SIGTERM kein neuer/langsamer Upload. Der Reader beendet sich
    // schnell; always()-Paketierung rettet den lokalen End-/Teilstand.
    const receipt = await upload({ sequence, tag, remainingParts: MAX_UPLOADS - uploads }, env, signal);
    A.equal(receipt.encryptedOnly, true); A.equal(receipt.checkpoint, sequence);
    A(Array.isArray(receipt.receipts) && receipt.receipts.length > 0 && receipt.receipts.length <= MAX_UPLOADS - uploads);
    for (const r of receipt.receipts) {
      A(Number.isSafeInteger(r.id) && r.id > 0 && Number.isSafeInteger(r.size) && r.size > 0);
      A.match(r.digest || "", /^[a-f0-9]{64}$/); A(Number.isInteger(r.files) && r.files >= 1 && r.files <= 501);
    }
    F.writeFileSync(P.join(dir, "../" + String(sequence).padStart(4, "0") + "-receipt.json"),
      JSON.stringify(receipt) + "\n", { flag: "wx", mode: 0o600 });
    savedThrough = completedPositions;
    uploads += receipt.receipts.length;
    console.log(JSON.stringify({ cipherCheckpointSaved: sequence, artifacts: receipt.receipts.length, all500InputAcceptance: false }));
  };
}
if (require.main === module) {
  // SDK-Ausgaben bewusst unterdruecken, nur validierte Quittungen ausgeben.
  const out = process.stdout.write.bind(process.stdout), err = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true; process.stderr.write = () => true;
  let input = "";
  process.stdin.on("data", chunk => { input += chunk.toString(); if (input.length > 512) process.exit(1); });
  process.stdin.on("end", async () => {
    try {
      A.deepEqual(process.argv.slice(2), ["upload"]); const request = JSON.parse(input);
      A.deepEqual(Object.keys(request).sort(), ["remainingParts", "sequence", "tag"]);
      const result = await uploadCheckpoint(request); out(JSON.stringify(result) + "\n");
    } catch { err("B2 Cipher-Sicherung fehlgeschlagen; keine Klartexte oder erneuten Abrufe.\n"); process.exitCode = 1; }
  });
}
module.exports = { uploadCheckpoint, checkpointWriter, transportEnv };
