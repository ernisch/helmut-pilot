"use strict";
// Offline source-gate tests only. Read the real public receipts; never follow
// their private evidence paths. All altered inputs and qualification metadata
// exist only in fresh temporary copies. No DB, provider or resource launcher.
const test = require("node:test"), { after } = require("node:test");
const assert = require("node:assert/strict"), fs = require("node:fs");
const os = require("node:os"), path = require("node:path");
const { createHash } = require("node:crypto");
const ROOT = path.resolve(__dirname, "../.."), MODE = "bounded-native-read-v1";
const FILE = Object.freeze({
  adapter: "scripts/helmut-resource-meter/bounded-read-integration.js",
  sql: "supabase/proposals/auth_read_bounded_local.sql",
  rollback: "supabase/proposals/auth_read_bounded_local.rollback.sql",
  historical: "scripts/helmut-resource-meter/bounded-read-source-acceptance.json",
  metadata: "scripts/helmut-resource-meter/bounded-read-cold-digest-source.json",
  native: "scripts/helmut-resource-meter/cold-digest-native-qualification-20261020.SAFE.json",
  review: "scripts/helmut-resource-meter/cold-digest-sol-review-20261020.SAFE.json"
});
const EXPECTED = Object.freeze({
  adapter: [8510, "5e4048e862f3c942ac2563638336964a10c96bf337566474568705a43e1830f0"],
  sql: [18910, "e7530ffd737179fb261d8a680ade77262d88e4685b3d8d90f2a92ecb5fad83c5"],
  rollback: [8946, "44825c2e5e51180d03c72d0e845f5da5670414af602445ca91f1b4d54ad69575"],
  historical: [1418, "99e523bf222a584fe728571272d18d427bd015196a2f520f1c6e8931e864bccc"],
  native: [14721, "6c8988e6ca763376554591d1244d574edb8bbf01586113402c452b1470937a15"],
  review: [17466, "b488ae4bec1a60bce3c4ce3f98facf487a6c4414d201d0d20af4b35007754609"]
});
const BODY = "4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0";
const sha = b => createHash("sha256").update(b).digest("hex");
const INPUT = Object.fromEntries(Object.entries(FILE).map(([key, relative]) => {
  const b = fs.readFileSync(path.join(ROOT, relative));
  if (EXPECTED[key]) assert.deepEqual([b.length, sha(b)], EXPECTED[key], "Real fixture drift: " + key);
  return [key, b];
}));
after(() => {
  for (const [key, relative] of Object.entries(FILE))
    assert(fs.readFileSync(path.join(ROOT, relative)).equals(INPUT[key]), "Repository input changed: " + key);
});

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-cold-digest-gate-"));
  fs.chmodSync(root, 0o700);
  const at = key => path.join(root, FILE[key]);
  const json = key => JSON.parse(fs.readFileSync(at(key), "utf8"));
  const writeJSON = (key, value) => fs.writeFileSync(at(key), JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  const pin = key => {
    const b = fs.readFileSync(at(key));
    return { name: path.basename(FILE[key]), bytes: b.length, sha256: sha(b) };
  };
  try {
    for (const [key, b] of Object.entries(INPUT)) {
      fs.mkdirSync(path.dirname(at(key)), { recursive: true, mode: 0o700 });
      fs.writeFileSync(at(key), b, { mode: 0o600, flag: "wx" });
    }
    // Qualification is derived from the real hash-pinned receipts only here,
    // inside this disposable test fixture; repository metadata is untouched.
    const native = json("native"), review = json("review"), metadata = json("metadata");
    metadata.currentQualification = { qualified: true, nativeDifferential: {
      status: native.status, exactWholeResponsesEqual: native.exactWholeResponsesEqual,
      identicalErrors: native.identicalErrors, originalStateUnchanged: native.originalStateUnchanged,
      requestedNegativesPassed: native.requestedNegativesPassed, proofPin: pin("native")
    }, independentSafetyReview: { status: review.status, proofPin: pin("review") } };
    writeJSON("metadata", metadata);
    fn({ at, json, writeJSON, pin, load: () => require(at("adapter")) });
  } finally {
    delete require.cache[at("adapter")];
    fs.rmSync(root, { recursive: true, force: true });
  }
}
function rejects(fn, pattern) { fixture(f => { fn(f); assert.throws(() => f.load().acceptance(), pattern); }); }
function refreshSQLMetadata(f) {
  const metadata = f.json("metadata");metadata.sha256 = sha(fs.readFileSync(f.at("sql")));
  f.writeJSON("metadata", metadata);
}
function refreshReviewPin(f) {
  const metadata = f.json("metadata");metadata.currentQualification.independentSafetyReview.proofPin = f.pin("review");
  f.writeJSON("metadata", metadata);
}
function adversarialNative(f, change) {
  // Negative fixtures recalculate outer pins to exercise semantic/source
  // binding after byte integrity. These altered receipts must be rejected.
  const native = f.json("native");change(native);f.writeJSON("native", native);
  const p = f.pin("native"), metadata = f.json("metadata"), review = f.json("review");
  metadata.currentQualification.nativeDifferential.proofPin = p;
  f.writeJSON("metadata", metadata);review.nativeProofPin = p;f.writeJSON("review", review);refreshReviewPin(f);
}
function tamperSameSize(f, key, before, afterText) {
  const original = fs.readFileSync(f.at(key), "utf8");assert(original.includes(before));
  const altered = original.replace(before, afterText);assert.notEqual(altered, original);
  assert.equal(Buffer.byteLength(altered), Buffer.byteLength(original));fs.writeFileSync(f.at(key), altered);
}
function changeActualBody(f) {
  const sql = fs.readFileSync(f.at("sql"), "utf8");
  const line = "graph_count:=jsonb_array_length(graph->'nodes');";assert(sql.includes(line));
  fs.writeFileSync(f.at("sql"), sql.replace(line, line + " -- isolated changed prosrc\n"));refreshSQLMetadata(f);
}
function removeProofs(f) { fs.unlinkSync(f.at("native"));fs.unlinkSync(f.at("review")); }

test("actual Native19 and independent SOL receipts admit the exact local source, without full-run authority", () => fixture(f => {
  const api = f.load(), accepted = api.acceptance();
  assert.equal(accepted.currentDeltaAcceptance.currentQualification.qualified, true);
  assert.equal(accepted.production, false);assert.equal(accepted.full500Accepted, false);
  assert.equal(accepted.currentDeltaAcceptance.requiresFreshIntegrationAcceptance, true);
  assert.equal(api.specs(MODE).helmut_auth_state_graph_read_v1.hash, BODY);
  assert(api.FILES.includes(FILE.native) && api.FILES.includes(FILE.review));
}));
test("missing native receipt blocks otherwise qualified metadata", () => rejects(f => fs.unlinkSync(f.at("native")), /ENOENT/));
test("missing independent review blocks otherwise qualified metadata", () => rejects(f => fs.unlinkSync(f.at("review")), /ENOENT/));
test("same-size native receipt tampering is rejected by actual byte hash", () => rejects(f =>
  tamperSameSize(f, "native", '"status": "passed"', '"status": "failed"'), /qualification proof drift/));
test("same-size review tampering is rejected by actual byte hash", () => rejects(f =>
  tamperSameSize(f, "review", '"status": "accepted"', '"status": "rejected"'), /qualification proof drift/));
test("changed SQL bytes fail before proof admission", () => rejects(f =>
  fs.appendFileSync(f.at("sql"), "\n-- isolated source drift\n"), /candidate source drift/));
test("refreshing SQL metadata cannot transfer old receipts to different whole SQL", () => rejects(f => {
  fs.appendFileSync(f.at("sql"), "\n-- isolated source drift\n");refreshSQLMetadata(f);
}));
test("default acceptance checks actual prosrc even with refreshed whole-SQL metadata", () => rejects(changeActualBody, /actual prosrc drift/));
test("a rehashed native receipt with the wrong prosrc cannot pass the actual-body binding", () => rejects(f =>
  adversarialNative(f, p => { p.functionBodySHA256 = "0".repeat(64); })));
test("actual adapter drift invalidates otherwise genuine source receipts", () => rejects(f =>
  fs.appendFileSync(f.at("adapter"), "\n// isolated adapter drift\n")));
test("a correctly rehashed review cannot reference a different native proof", () => rejects(f => {
  const review = f.json("review");review.nativeProofPin.sha256 = "0".repeat(64);
  f.writeJSON("review", review);refreshReviewPin(f);
}));
test("a symlink to identical native receipt bytes is refused", () => rejects(f => {
  fs.renameSync(f.at("native"), f.at("native") + ".real");fs.symlinkSync(f.at("native") + ".real", f.at("native"));
}));
test("a symlink to identical review bytes is refused", () => rejects(f => {
  fs.renameSync(f.at("review"), f.at("review") + ".real");fs.symlinkSync(f.at("review") + ".real", f.at("review"));
}));
test("sourceOnly needs no proof I/O and cannot convey authority from qualified metadata", () => fixture(f => {
  removeProofs(f);const api = f.load(), source = api.currentDeltaAcceptance({ sourceOnly: true });
  assert.equal(source.localSourceOnly, true);assert.equal(source.currentQualification.qualified, false);
  assert.equal(api.specs(MODE, { localSourceOnly: true }).helmut_auth_state_graph_read_v1.hash, BODY);
  assert.throws(() => api.acceptance(), /ENOENT/);
}));
test("NOT_QUALIFIED metadata supports source derivation but default admission remains blocked", () => fixture(f => {
  removeProofs(f);const metadata = f.json("metadata");metadata.currentQualification.qualified = false;
  f.writeJSON("metadata", metadata);const api = f.load();
  assert.equal(api.currentDeltaAcceptance({ sourceOnly: true }).currentQualification.qualified, false);
  assert.equal(api.specs(MODE, { localSourceOnly: true }).helmut_auth_state_graph_read_v1.hash, BODY);
  assert.throws(() => api.acceptance(), /NOT_QUALIFIED/);
}));
test("a rehashed native receipt with failed catalog restoration is not qualification", () => rejects(f =>
  adversarialNative(f, p => { p.fullCatalogRestored = false; })));
test("a rehashed review must still be independent", () => rejects(f => {
  const review = f.json("review");review.independent = false;f.writeJSON("review", review);refreshReviewPin(f);
}));
test("sourceOnly retains actual prosrc checks while skipping absent receipts", () => fixture(f => {
  removeProofs(f);changeActualBody(f);
  assert.throws(() => f.load().currentDeltaAcceptance({ sourceOnly: true }), /actual prosrc drift/);
}));
