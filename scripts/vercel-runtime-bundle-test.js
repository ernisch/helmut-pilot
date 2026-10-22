"use strict";

// Run via scripts/lokal.js. Supply an unpacked official @vercel/build-utils
// package with --build-utils <absolute path>; no install, network or app startup.
// Its exported glob is the same implementation used by @vercel/node includeFiles.
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const BASE = "ccd3cb1d0385eff61bbe613583b9d6ce7b98de42";
const MANIFEST = "lib/helmut/synthetik-500-release-artifacts.json";
const ADAPTER = "lib/helmut/synthetik-500-production-adapter.js";
const SOURCE_REVIEW = "docs/betrieb/belege/local-view-binding-20261022/SOURCE_REVIEW.SAFE.json";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const read = p => fs.readFileSync(path.join(ROOT, p));
const old = p => JSON.parse(execFileSync("git", ["show", `${BASE}:${p}`], { cwd: ROOT, encoding: "utf8" }));
const tracked = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean));
const allowedJson = new Set(["synthetik-500-cpu-source-pins.json", "synthetik-500-release-artifacts.json", "synthetik-500-stored-command-native-pins.json"]);
const fixed = new Set([".github/workflows/briefing-watchdog.yml", ".github/workflows/health-watch.yml", "vercel.json", "package.json", "package-lock.json"]);
function permitted(p) {
  if (fixed.has(p)) return true;
  const file = path.posix.basename(p), dir = path.posix.dirname(p);
  return (dir === "lib/helmut" && (/^[a-z][A-Za-z0-9_-]*\.js$/.test(file) || allowedJson.has(file)))
    || (dir === "lib/helmut/quellenarchitektur/seeds" && /^[a-z][A-Za-z0-9_-]*\.js$/.test(file));
}
// Inspect source bytes only; never compare against or print session credentials.
function credentialMaterial(bytes) {
  const s = bytes.toString("utf8");
  return /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{32}/.test(s)
    || /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(s)
    || /\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(s)
    || /\bgithub_pat_[A-Za-z0-9_]{60,}\b/.test(s)
    || /\bxox[baprs]-[A-Za-z0-9-]{30,}\b/.test(s)
    || /\beyJ[A-Za-z0-9_-]{16,}\.eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{20,}\b/.test(s);
}
async function main() {
  assert.equal(process.argv.length, 4, "usage: --build-utils <absolute package path>");
  assert.equal(process.argv[2], "--build-utils");
  const modulePath = process.argv[3];
  assert(path.isAbsolute(modulePath));
  const pkg = JSON.parse(fs.readFileSync(path.join(modulePath, "package.json")));
  assert.equal(pkg.name, "@vercel/build-utils");
  assert.equal(pkg.version, "14.23.0", "use the reviewed official matcher package");
  assert.equal(pkg.devDependencies.glob, "8.0.3");
  const { glob } = require(modulePath);
  assert.equal(typeof glob, "function");
  const config = JSON.parse(read("vercel.json")), prior = old("vercel.json");
  const pattern = config.functions["api/index.js"].includeFiles;
  assert.equal(typeof pattern, "string");
  assert(pattern.length > 0 && pattern.length <= 256);
  const previousPattern = prior.functions["api/index.js"].includeFiles;
  assert(previousPattern.length > 256, "reproduce the recorded schema failure");
  prior.functions["api/index.js"].includeFiles = pattern;
  assert.deepEqual(config, prior, "routes, headers, ignore policy and all other settings must remain intact");
  console.log("PASS schema length regression and unchanged deployment guards");

  const unsafe = [".env", "lib/helmut/.credentials.json", "lib/helmut/credentials.json", "lib/helmut/.private.js",
    "lib/helmut/secrets.pem", "lib/helmut/subdir/private.js", "lib/helmut/quellenarchitektur/seeds/.private.js",
    "lib/helmut/quellenarchitektur/seeds/private.json"];
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-vercel-glob-"));
  try {
    const positive = ["lib/helmut/sourceSafety.js", "lib/helmut/synthetik-500-cpu-source-pins.json",
      "lib/helmut/quellenarchitektur/seeds/entities.js", ".github/workflows/health-watch.yml", "package-lock.json"];
    for (const p of [...positive, ...unsafe]) {
      fs.mkdirSync(path.dirname(path.join(fixture, p)), { recursive: true });
      fs.writeFileSync(path.join(fixture, p), "fictional glob fixture\n");
    }
    assert.deepEqual(Object.keys(await glob(pattern, fixture)).sort(), positive.sort(), "actual Vercel matcher must exclude private file shapes");
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }

  const matches = Object.keys(await glob(pattern, ROOT)).sort();
  const previous = Object.keys(await glob(previousPattern, ROOT)).sort();
  const included = new Set(matches);
  assert(matches.length > 0);
  for (const p of previous) assert(included.has(p), `old explicit bundle source absent: ${p}`);
  for (const p of matches) {
    assert(tracked.has(p), `untracked bundle entry: ${p}`);
    assert(permitted(p), `out-of-scope bundle entry: ${p}`);
    const abs = path.join(ROOT, p), stat = fs.lstatSync(abs);
    assert(stat.isFile() && !stat.isSymbolicLink(), `nonregular bundle entry: ${p}`);
    assert.equal(fs.realpathSync(abs), abs, `indirect bundle entry: ${p}`);
    assert(!credentialMaterial(read(p)), `credential-like source material: ${p}`);
  }
  for (const p of [...unsafe, "lib/helmut/test.fixture.js", "../private.js"])
    assert(!permitted(p), `unsafe inventory shape accepted: ${p}`);
  for (const s of ["AKIA" + "X".repeat(16), "ghp_" + "x".repeat(36), "-----BEGIN PRIVATE KEY-----\n" + "A".repeat(40)])
    assert(credentialMaterial(Buffer.from(s)), "credential detector negative control");
  console.log("PASS actual Vercel glob, old bundle coverage, tracked-file scope and credential-signature inventory");

  const manifest = JSON.parse(read(MANIFEST)), before = old(MANIFEST);
  assert.equal(manifest.files.length, 89);
  const entrypoints = new Set(["api/index.js", "server.js"]);
  for (const pin of manifest.files) {
    assert(included.has(pin.path) || entrypoints.has(pin.path), `manifest source not bundled: ${pin.path}`);
    const bytes = read(pin.path);
    assert.equal(bytes.length, pin.bytes, `manifest byte drift: ${pin.path}`);
    assert.equal(sha(bytes), pin.sha256, `manifest hash drift: ${pin.path}`);
  }
  assert.equal(read("api/index.js").toString(), 'module.exports = require("../server");\n');
  const mapping = sha(JSON.stringify(manifest.files.map(x => ({ bytes: x.bytes, path: x.path, sha256: x.sha256 }))));
  assert.equal(mapping, manifest.sourceMappingSHA256);

  // Narrowly reviewed delta: relative to the historical BASE manifest only the
  // vercel.json pin, the single reviewed current adapter row and the aggregate
  // mapping may differ. The adapter substitution is bound to an immutable
  // source-review document and never widens to arbitrary changed pins.
  const reviewBytes = read(SOURCE_REVIEW);
  assert.equal(reviewBytes.length, 2697, `reviewed source-review document byte drift: ${SOURCE_REVIEW}`);
  assert.equal(sha(reviewBytes), "98a48a3095f4d01c7c818dcd208a4c169a4d5f191b1a44c320cb7b659e5e3aaa",
    `reviewed source-review document hash drift: ${SOURCE_REVIEW}`);
  const review = JSON.parse(reviewBytes.toString("utf8"));
  assert.equal(review.historicalAcceptanceTransferred, false, "review must transfer no historical acceptance");
  assert.equal(review.executionAuthority, false, "review must grant no execution authority");
  assert.equal(review.full500Accepted, false, "review must accept no full500 qualification");
  assert.equal(review.nativeUnit60Qualified, false, "review must qualify no native unit60");
  assert.equal(review.requiresFreshIntegrationAcceptance, true, "review must still require fresh integration acceptance");
  assert(Array.isArray(review.sourcePins) && review.sourcePins.length > 0, "reviewed source pins must be a non-empty list");
  for (const pin of review.sourcePins)
    assert.deepEqual(Object.keys(pin).sort(), ["bytes", "file", "sha256"], `reviewed source pin shape: ${pin.file}`);
  const baseIndex = before.files.findIndex(x => x.path === ADAPTER);
  assert(baseIndex >= 0, `historical manifest must pin the adapter: ${ADAPTER}`);
  const historicalAdapter = before.files[baseIndex];
  assert.deepEqual(historicalAdapter, {
    path: ADAPTER, bytes: 28589, sha256: "1aefdf54e0a68e734cf851d48d56f298dd391e0d54bed595068760a19f838aa4"
  }, "historical adapter row must be the recorded pre-delta state");
  assert.deepEqual(review.baselineAdapter, {
    file: ADAPTER, bytes: historicalAdapter.bytes, sha256: historicalAdapter.sha256
  }, "review baseline adapter must match the historical adapter row");
  const reviewedAdapter = review.sourcePins.filter(x => x.file === ADAPTER);
  assert.equal(reviewedAdapter.length, 1, "review must carry exactly one current adapter pin");
  const currentIndex = manifest.files.findIndex(x => x.path === ADAPTER);
  assert(currentIndex >= 0, `current manifest must pin the adapter: ${ADAPTER}`);
  const currentAdapter = manifest.files[currentIndex];
  assert.deepEqual({ file: currentAdapter.path, bytes: currentAdapter.bytes, sha256: currentAdapter.sha256 }, reviewedAdapter[0],
    "current manifest adapter must equal the reviewed current adapter row");
  const vercelPin = manifest.files.find(x => x.path === "vercel.json");
  before.files[baseIndex] = { path: ADAPTER, bytes: reviewedAdapter[0].bytes, sha256: reviewedAdapter[0].sha256 };
  before.files[before.files.findIndex(x => x.path === "vercel.json")] = vercelPin;
  before.sourceMappingSHA256 = mapping;
  assert.deepEqual(manifest, before, "only the vercel pin, the reviewed adapter row and the mapping may change; no qualification or authority upgrade");
  console.log("PASS all 89 artifact pins, entrypoint, canonical mapping, reviewed adapter delta and unchanged qualification limits");
  const added = matches.filter(p => !previous.includes(p));
  console.log(JSON.stringify({ groups: 3, package: `${pkg.name}@${pkg.version}`, glob: pkg.devDependencies.glob,
    patternCharacters: pattern.length, previousIncluded: previous.length, included: matches.length,
    additionalFiles: added.length, additionalBytes: added.reduce((n, p) => n + read(p).length, 0),
    sortedInventorySHA256: sha(JSON.stringify(matches)), additionalInventorySHA256: sha(JSON.stringify(added)),
    artifactPins: manifest.files.length, reviewedAdapterDeltaRows: 1, sourceReviewDocument: SOURCE_REVIEW,
    credentialSignaturesDetected: 0, externalNetwork: false,
    deploymentVerified: false, executionAuthority: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
