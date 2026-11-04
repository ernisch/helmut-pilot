"use strict";

// Vergleicht ausschließlich den vorgeschlagenen Profil-GET-Fehlervertrag.
// Patch nur im neuen Wegwerfklon, niemals in diesem Branch/Originalcheckout.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const root = path.join(__dirname, "..");
const patch = path.join(root, "docs/backend-isolated/profil-lesefehler-kandidat-20261104.patch");
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.ok(process.env.NODE_OPTIONS?.includes("lokaler-netzschutz"));
assert.equal(process.env.HELMUT_STORAGE_BACKEND, "local");
assert.equal(process.env.HELMUT_SOURCE_MODE, "off");
const originalHash = hash(path.join(root, "server.js"));
assert.equal(originalHash, "1bdb41bc338018a2e18e704256d9159294b5330e48233ec0ad36be49f3d5919c");

async function child() {
  const clone = fs.realpathSync(process.argv[3]);
  assert.ok(clone.startsWith(os.tmpdir() + path.sep + "helmut-profile-candidate-"));
  assert.ok(fs.statSync(path.join(clone, ".git")).isDirectory());
  assert.equal(fs.existsSync(path.join(clone, ".helmut-data")), false);
  for (const file of [".env", ".env.local", "env.local"]) assert.equal(fs.existsSync(path.join(clone, file)), false);
  const candidate = process.argv[4] === "candidate";
  if (candidate) {
    execFileSync("git", ["-C", clone, "apply", "--check", patch]);
    execFileSync("git", ["-C", clone, "apply", patch]);
  }
  process.env.HELMUT_AUTH_MODE = "accounts"; process.env.HELMUT_STORE_CACHE_MS = "0";
  const storage = require(path.join(clone, "lib/helmut/storage"));
  const accounts = require(path.join(clone, "lib/helmut/accounts"));
  const rawGet = storage.getProfile;
  let fail = false;
  storage.getProfile = async (...args) => { if (fail) throw new Error("synthetic-private-profile-error"); return rawGet(...args); };
  const server = http.createServer(require(path.join(clone, "server.js")));
  const checks = [], requests = [];
  const check = (name, fn) => { fn(); checks.push({ name, passed: true }); };
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const password = "synthetic-profile-candidate-only-123";
    await accounts.createUser({ email: "admin@profile.invalid", name: "Fiktiver Admin", role: "admin", password });
    await accounts.createUser({ email: "user@profile.invalid", name: "Fiktives Konto", role: "abgeordneter", politicianId: "profile-synthetic-alpha", password });
    const fixture = require(path.join(clone, "scripts/fixtures/test-profiles")).testPoliticianOne;
    await storage.saveProfile({ ...fixture, id: "profile-synthetic-alpha", fullName: "Fiktives Profil", profileActive: false });
    const login = async email => {
      const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      assert.equal(response.status, 200); return response.headers.get("set-cookie").split(";")[0];
    };
    const admin = await login("admin@profile.invalid"), user = await login("user@profile.invalid");
    const get = async (id, cookie) => {
      const response = await fetch(`${base}/api/admin/profile/${id}`, { headers: cookie ? { Cookie: cookie } : {} });
      const text = await response.text(); requests.push({ id, status: response.status, fault: fail });
      assert.doesNotMatch(text, /synthetic-private-profile-error|passwordHash|passwordSalt/);
      return { status: response.status, body: JSON.parse(text) };
    };
    let r = await get("profile-synthetic-alpha", admin);
    check("Vorhandenes Profil unverändert HTTP200 mit Validierung/Bereitschaft", () => { assert.equal(r.status, 200); assert.equal(r.body.profile.fullName, "Fiktives Profil"); assert.equal(r.body.validierung.deaktiviert, true); assert.ok(r.body.bereitschaft); });
    r = await get("profile-synthetic-missing", admin);
    check(candidate ? "Fehlendes Profil ehrlich HTTP404" : "Baseline: fehlendes Profil liefert Blankprofil HTTP200", () => assert.equal(r.status, candidate ? 404 : 200));
    fail = true; r = await get("profile-synthetic-alpha", admin); fail = false;
    check(candidate ? "Lesefehler ehrlich generischer HTTP500" : "Baseline: Lesefehler versteckt sich in HTTP200", () => assert.equal(r.status, candidate ? 500 : 200));
    r = await get("profile-synthetic-alpha"); check("Anonym weiterhin HTTP401", () => assert.equal(r.status, 401));
    r = await get("profile-synthetic-alpha", user); check("Mandatskonto weiterhin HTTP403", () => assert.equal(r.status, 403));
    console.log(JSON.stringify({ kind: candidate ? "candidate" : "baseline", groups: checks.length, checks, requests, sharedSourceChanged: false }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function parent() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-profile-candidate-"));
  const results = [];
  try {
    for (const mode of ["baseline", "candidate"]) {
      const clone = path.join(temp, mode);
      execFileSync("git", ["clone", "--quiet", "--shared", "--no-hardlinks", "--single-branch", "--branch", "feat/claude-backend-isolated", root, clone]);
      const r = spawnSync(process.execPath, [__filename, "--child", clone, mode], { env: process.env, encoding: "utf8", timeout: 40000 });
      assert.equal(r.status, 0, `${mode}: ${r.stdout}\n${r.stderr}`);
      const record = JSON.parse(r.stdout.trim().split("\n").findLast(line => line.startsWith("{")));
      results.push({ ...record, output: r.stdout, diagnostic: r.stderr });
      console.log(`PASS ${mode}: ${record.groups}/${record.groups} Profil-GET-Gruppen`);
    }
    assert.equal(hash(path.join(root, "server.js")), originalHash);
    const report = { testedCommit: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), serverSha256: originalHash,
      patchSha256: hash(patch), patchAppliedOnlyInDisposableClone: true, results, noProduction: true, noOriginalSourceChange: true };
    if (process.env.HELMUT_ORIGINAL_EVIDENCE) fs.writeFileSync(path.join(process.env.HELMUT_ORIGINAL_EVIDENCE, "profil-lesefehler-kandidat-ergebnis.json"), JSON.stringify(report, null, 2) + "\n");
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
(process.argv[2] === "--child" ? child() : Promise.resolve().then(parent)).catch(error => { console.error(error); process.exitCode = 1; });
