"use strict";
// Private relocation and truthful calendar adaptation. No action on import.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const BASE = "/tmp/w15-full500-20261028d", DB = "helmut_w15_full500_20261028b";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const dayBerlin = iso => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
function namespace(context) {
  assert.equal(context.schema, "helmut-w15-mock500-controller-context/1");
  assert.equal(context.scope, "ISOLATED_GITHUB_MOCK500_BINDING_ONLY");
  assert.match(context.runId, /^[1-9][0-9]{4,19}$/); assert.equal(context.runAttempt, 1);
  assert.match(context.nonce, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.match(context.exactCommit, /^[a-f0-9]{40}$/);
  const stem = "w15-mock500-" + context.runId + "-" + context.nonce.replaceAll("-", "");
  const root = context.runnerTemp + "/" + stem;
  assert.deepEqual(context.hostPaths, { runRoot: root, work: root + "/work", prepare: root + "/prepare", cache: root + "/cache" });
  return { base: BASE, database: DB, container: stem, work: context.hostPaths.work };
}
function privateBytes(pin, maximum = 256 * 1024 ** 2) {
  assert(pin && typeof pin.path === "string" && path.isAbsolute(pin.path));
  assert(Number.isSafeInteger(pin.bytes) && pin.bytes > 0 && pin.bytes <= maximum);
  assert.match(pin.sha256, /^[a-f0-9]{64}$/);
  const fd = fs.openSync(pin.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    assert(before.isFile() && before.nlink === 1 && before.uid === process.getuid() && (before.mode & 511) === 384);
    assert.equal(before.size, pin.bytes);
    const raw = fs.readFileSync(fd), after = fs.fstatSync(fd);
    assert.equal(raw.length, pin.bytes); assert.equal(sha(raw), pin.sha256);
    for (const key of ["dev", "ino", "size", "mtimeMs", "ctimeMs", "mode", "uid", "nlink"]) assert.equal(after[key], before[key]);
    return raw;
  } finally { fs.closeSync(fd); }
}
function readBound() {
  const filename = process.env.HELMUT_W15_MOCK_CONTEXT;
  if (filename === undefined) return null;
  const s = fs.lstatSync(filename);
  assert(Number.isSafeInteger(s.size) && s.size > 0 && s.size <= 1024 * 1024);
  const value = JSON.parse(privateBytes({ path: filename, bytes: s.size, sha256: process.env.HELMUT_W15_MOCK_CONTEXT_SHA256 }, 1024 * 1024));
  assert.equal(value.schema, "helmut-w15-mock500-private-runtime/1");
  namespace(value.context); assert.match(value.bindingSHA256, /^[a-f0-9]{64}$/);
  return value;
}
function currentCalendar(bound, now = new Date().toISOString()) {
  assert.equal(new Date(now).toISOString(), now);
  assert.equal(now.slice(0, 10), bound.calendar.utcDay, "w15-mock500-current-utc-day");
  assert.equal(dayBerlin(now), bound.calendar.berlinDay, "w15-mock500-current-berlin-day");
  assert.equal(bound.calendar.sourceDatesRewritten, false);
  assert.equal(bound.calendar.signaturesReused, false);
  return now;
}
function fixedWindow(bound, now = new Date().toISOString()) {
  currentCalendar(bound, now);
  const w = bound.window, starts = Date.parse(w.startsAtUTC), ends = Date.parse(w.endsAtUTC), finish = Date.parse(w.completionDeadlineUTC);
  assert([starts, ends, finish].every(Number.isFinite));
  assert.equal(ends - starts, 10800000 - 1); assert.equal(finish - starts, 12600000 - 1);
  assert(starts <= Date.parse(now) && Date.parse(now) < ends, "w15-mock500-original-processing-window");
  for (const value of [w.startsAtUTC, w.endsAtUTC, w.completionDeadlineUTC]) {
    assert.equal(value.slice(0, 10), now.slice(0, 10)); assert.equal(dayBerlin(value), dayBerlin(now));
  }
  return structuredClone(w);
}
function qualifiedAssets(bound) {
  const historical = JSON.parse(privateBytes(bound.assets.qualificationReport, 16 * 1024 ** 2));
  assert.equal(historical.status, "PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS");
  assert.equal(historical.completedOwners, 500); assert.equal(historical.qualifiedOwners, 500); assert.equal(historical.failedOwners, 0);
  assert.equal(historical.qualifiedAssetsPinned, true); assert.equal(historical.sourceDatesRewritten, false);
  const result = { report: historical, reportPin: bound.assets.qualificationReport,
    historicalExecutionISO: historical.executionISO, executionISO: currentCalendar(bound) };
  for (const [key, alias] of [["rows", "qualifiedRows"], ["fixtures", "qualifiedFixtures"], ["nativeBundle", "qualifiedNative"], ["derivations", "qualifiedDerivations"], ["replacements", "currentReplacements"]]) {
    const pin = key === "replacements" ? historical.currentNativeReplacementsPin : historical.qualifiedAssets[key === "nativeBundle" ? "native" : key];
    assert.equal(bound.assets[alias].bytes, pin.bytes); assert.equal(bound.assets[alias].sha256, pin.sha256);
    result[key] = JSON.parse(privateBytes(bound.assets[alias]));
  }
  return result;
}
function calendarRow(row, executionISO) {
  return require("../fixtures/w15-local-calendar").rebindOrdinaryRow(row, executionISO);
}
function calendarFixture(fixture, row) {
  // Reconstruct only the request binding for the changed real date. Responses,
  // source identities and independently reviewed content must remain exact.
  const old = structuredClone(fixture);
  const prepared = require("../fixtures/w15-full500-provider").prepare({ index: old.index, row,
    model: old.model, responsesURL: old.responsesURL, mockUsage: old.mockUsage,
    candidate: { draftCandidate: old.draftOutput },
    template: { response: old.reviewOutput, binding: { responseJSONSHA256: old.reviewOutputSHA256 } } });
  for (const key of ["draftOutputSHA256", "reviewOutputSHA256"]) assert.equal(prepared[key], old[key]);
  assert.deepEqual(prepared.draftOutput, old.draftOutput); assert.deepEqual(prepared.reviewOutput, old.reviewOutput);
  return prepared;
}
function originals(bound) {
  const receipt = JSON.parse(privateBytes(bound.assets.originalReception, 1024 * 1024));
  assert.equal(receipt.actualFileCount, 11); assert.equal(receipt.actualPayloadBytes, 96530256);
  return key => {
    const pin = bound.assets[key], historical = receipt.files.find(item => item.key === key);
    assert(historical && historical.status === "PASS");
    assert.equal(pin.bytes, historical.expectedBytes); assert.equal(pin.sha256, historical.expectedSHA256);
    return { value: JSON.parse(privateBytes(pin)), pin };
  };
}
function originalBuilder(bound, root) {
  const archive = bound.assets.originalBuilderArchive;
  assert.equal(archive.bytes, 269598); assert.equal(archive.sha256, "c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15");
  privateBytes(archive);
  const member = name => {
    const p = spawnSync("python3", ["-I", "-S", "-B", "-c", "import sys,zipfile;sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))", archive.path, name], {
      maxBuffer: 1024 * 1024, timeout: 10000, env: { PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"] });
    assert.equal(p.status, 0, "w15-mock500-original-builder-member"); return p.stdout;
  };
  const manifest = JSON.parse(member("MANIFEST.json")), pins = [];
  const source = name => { const pin = manifest.files.find(item => item.sourcePath.endsWith("/native-end-preparation/" + name));
    assert(pin); const raw = member(pin.archivePath); assert.equal(raw.length, pin.bytes); assert.equal(sha(raw), pin.sha256);
    pins.push({ name, bytes: raw.length, sha256: sha(raw) }); return raw.toString("utf8"); };
  const originalRequire = require("node:module").createRequire(path.join(root, "scripts/synthetik-500-w15-signed-chain-test.js"));
  const load = (text, req, filename) => { const module = { exports: {} };
    vm.runInThisContext("(function(require,module,exports,__dirname){" + text + "\n})", { filename })(req, module, module.exports, path.join(root, "scripts")); return module.exports; };
  const today = currentCalendar(bound).slice(0, 10), contractsText = source("contracts.js");
  assert.equal(contractsText.split("'2026-10-16'").length - 1, 2);
  const contracts = { ...load(contractsText.replaceAll("'2026-10-16'", JSON.stringify(today)), originalRequire, "mock500-current-date-contracts"), ROOT: root };
  const req = name => name === "./contracts" ? contracts : originalRequire(name), text = source("build-command.js");
  const old = "assert.equal(row.briefingDatum.slice(0,10),'2026-10-16');";
  assert.equal(text.split(old).length - 1, 1);
  const builder = load(text.replace(old, "assert.equal(row.briefingDatum.slice(0,10),config.window.startsAtUTC.slice(0,10));"), req, "mock500-current-date-builder");
  const draft = load(source("original-draft-request.js"), req, "mock500-original-draft-request");
  return { build: builder.build, prepareDraft: draft.prepare, sourcePins: pins };
}
module.exports = { BASE, DB, namespace, privateBytes, readBound, currentCalendar, fixedWindow, qualifiedAssets, calendarRow, calendarFixture, originals, originalBuilder };
