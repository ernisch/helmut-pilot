"use strict";

// Gemeinsame, gezielte Abnahme der vorbereiteten D1-/D2-Patches.
// Bestehende Testworker werden unveraendert wiederverwendet. Nur Wegwerfklone.
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const assert = require("assert/strict");
const { spawnSync } = require("child_process");
const root = fs.realpathSync(path.resolve(__dirname, ".."));
const BASE = "ae18658e5caac2b39403c0e41e3a8af5c2b3d7be";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const patches = [
  { file: "docs/backend-isolated/sprint-d-status-active.patch", sha256: "bf0c77ecc2950cfc34fee9bfd49c707d934e975500f3817cb9e232d7fe70954e" },
  { file: "docs/backend-isolated/sprint-d2-last-admin.patch", sha256: "e5c2f1abf7d340c671c76187bf743d55e3fbca0a5b18398aca52bd967957868a" }
];
const helpers = [
  { file: "scripts/sprint-d-kontoverwaltung-test.js", sha256: "5eb0699c03616e0db8aec32c01197e456b853f98dbc5d137a37dedb3a04bd068" },
  { file: "scripts/sprint-d2-last-admin-test.js", sha256: "0570d4fc80432ecf66cead592e64ddea39409cee1d7a5ad4bb576fc791e51a09" }
];
const protectedFiles = ["server.js", "lib/helmut/accounts.js", "lib/helmut/auth.js", "lib/helmut/storage.js", "client.js", "index.html", "styles.css", "scripts/lokal.js", "scripts/lokaler-netzschutz.js"];
const hashes = directory => Object.fromEntries(protectedFiles.map(file => [file, sha(fs.readFileSync(path.join(directory, file)))]));
const fixedEnv = () => ({ PATH: "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", TMPDIR: "/tmp", NODE_PATH: "/workspace/helmut-pilot/node_modules", HELMUT_AUTH_MODE: "accounts", HELMUT_STORE_CACHE_MS: "0", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" });
function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, env: fixedEnv(), encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, "Lokaler Git-Schritt " + args[0]); return result.stdout.trim();
}

function main() {
  assert.equal(root, "/workspace/helmut-backend-sprint-b-20261104", "Nur eigener getrennter Arbeitsbereich");
  assert.ok(String(process.env.NODE_OPTIONS || "").includes("lokaler-netzschutz.js"), "scripts/lokal.js erforderlich");
  assert.equal(process.env.HELMUT_SOURCE_MODE, "off"); assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
  assert.equal(process.env.HELMUT_TESTLAUF_KOMMUNIKATION, "gesperrt"); assert.ok(!process.env.HELMUT_V3_STORE);
  for (const key of Object.keys(process.env)) assert.ok(!/(?:KEY|SECRET|TOKEN|CREDENTIAL|DATABASE_URL|SUPABASE|AZURE|VERCEL|SMTP|MAIL_PASSWORD)/i.test(key), "Unerwartete Variable " + key);
  assert.equal(git(["rev-parse", "HEAD"], root), BASE);
  assert.equal(git(["branch", "--show-current"], root), "feat/claude-backend-isolated");
  assert.equal(git(["diff", "--stat", "HEAD"], root), "");
  for (const input of [...patches, ...helpers]) assert.equal(sha(fs.readFileSync(path.join(root, input.file))), input.sha256, "Gebundener Eingang " + input.file);
  const sourceBefore = hashes(root);
  const cases = [{ name: "D1-status-regression", helper: helpers[0], prefix: "helmut-sprint-d-runtime-", args: ["status", patches[0].sha256] },
    ...["last-status", "last-active", "last-role", "unusable-backups", "delete-and-handover", "concurrent-status", "concurrent-role"].map(name => ({ name: "D2-" + name, helper: helpers[1], prefix: "helmut-sprint-d2-runtime-", args: [name] }))];
  const evidence = { baseline: BASE, patches, unchangedHelpers: helpers, sourceBefore, results: [] };
  const start = Date.now();
  let combinedAccountsSha = null;
  try {
    for (const testCase of cases) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), testCase.prefix));
      const runtime = path.join(temp, "repo"), output = path.join(temp, "evidence.json");
      try {
        git(["clone", "--quiet", "--shared", "--no-hardlinks", "--branch", "feat/claude-backend-isolated", root, runtime], temp);
        assert.equal(sha(fs.readFileSync(path.join(runtime, "lib/helmut/accounts.js"))), "08cfa25c4753721277b39fb7ff60ad0023d6381533fd039c337755bad84fe82e");
        for (const patch of patches) { git(["apply", "--check", path.join(root, patch.file)], runtime); git(["apply", path.join(root, patch.file)], runtime); }
        assert.equal(git(["diff", "--name-only", "HEAD"], runtime), "lib/helmut/accounts.js");
        const currentSha = sha(fs.readFileSync(path.join(runtime, "lib/helmut/accounts.js")));
        if (combinedAccountsSha === null) combinedAccountsSha = currentSha;
        assert.equal(currentSha, combinedAccountsSha, "Ein gemeinsamer Kandidatstand fuer alle Worker");
        const workerArgs = testCase.name === "D1-status-regression" ? ["--worker", runtime, output, ...testCase.args] : ["--worker", runtime, testCase.args[0], output, "candidate"];
        const result = spawnSync(process.execPath, [path.join(runtime, "scripts/lokal.js"), path.join(root, testCase.helper.file), ...workerArgs], { cwd: runtime, env: fixedEnv(), encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024 });
        assert.ok(fs.existsSync(output), "Kein Workerbeleg: " + testCase.name);
        const workerEvidence = JSON.parse(fs.readFileSync(output, "utf8"));
        evidence.results.push({ name: testCase.name, exitCode: result.status, stdoutSha256: sha(result.stdout || ""), stderrSha256: sha(result.stderr || ""), combinedAccountsSha256: currentSha, evidence: workerEvidence });
        console.log(testCase.name + ": " + workerEvidence.status + " (exit " + result.status + ")");
        assert.equal(result.status, 0, "Kombinationsworker fehlgeschlagen: " + testCase.name);
      } finally {
        assert.ok(temp.startsWith("/tmp/" + testCase.prefix)); fs.rmSync(temp, { recursive: true, force: true });
      }
    }
    evidence.status = "PASS_COMBINED_TARGETED_HTTP";
  } catch (error) {
    evidence.status = "FAIL_COMBINED";
    evidence.error = { name: error.name, message: String(error.message).slice(0, 300) };
    process.exitCode = 1;
  } finally {
    evidence.sourceAfter = hashes(root); assert.deepEqual(evidence.sourceAfter, sourceBefore);
    evidence.sourceUnchanged = true;
    evidence.combinedAccountsSha256 = combinedAccountsSha;
    evidence.summary = { workerCases: evidence.results.length, passedWorkerCases: evidence.results.filter(result => result.exitCode === 0).length, passedChecks: evidence.results.reduce((sum, result) => sum + (result.evidence.groups || result.evidence.checks || []).filter(item => item.status === "PASS").length, 0), failedChecks: evidence.results.reduce((sum, result) => sum + (result.evidence.groups || result.evidence.checks || []).filter(item => item.status === "FAIL").length, 0), httpRequests: evidence.results.reduce((sum, result) => sum + result.evidence.requests.length, 0) };
    evidence.run = { timestamp: new Date().toISOString(), elapsedMs: Date.now() - start, node: process.version, testSha256: sha(fs.readFileSync(__filename)), environmentKeys: Object.keys(fixedEnv()).sort(), runtimeClonesRemoved: true, invocation: "env -i [fixedEnv allowlist] node scripts/lokal.js scripts/sprint-d-kombination-test.js" };
    fs.writeFileSync(path.join(root, "docs/backend-isolated/sprint-d-kombination-20261104.json"), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify({ status: evidence.status, ...evidence.summary }));
  }
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
