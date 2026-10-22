"use strict";

// Synthetic bounded DAGs only. The public terminal is a historical failure,
// never a fixture granting execution or a native acceptance receipt.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const { inspectPinnedPacket } = require("../lib/helmut/synthetik-500-unit-diagnostic-contract");
const terminalBytes = fs.readFileSync(path.resolve(__dirname, "../docs/betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json"));
const CLI = path.resolve(__dirname, "helmut-resource-meter/single-unit-diagnostic-inspect.js");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const SENTINEL = "PRIVATE_SENTINEL_DO_NOT_EXPORT";
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("PASS  " + name); }
  catch (_) { failed++; console.log("FAIL  " + name); }
}

function graph(value) {
  const nodes = [], objects = new WeakMap(), scalars = new Map();
  function put(x) {
    const object = x !== null && typeof x === "object";
    const key = object ? null : JSON.stringify(x);
    if (object && objects.has(x)) return objects.get(x);
    if (!object && scalars.has(key)) return scalars.get(key);
    let node;
    if (x === null) node = ["n"];
    else if (typeof x === "string") node = ["s", x];
    else if (typeof x === "boolean") node = ["b", x];
    else if (typeof x === "number") node = ["d", x];
    else if (Array.isArray(x)) node = ["a", x.map(put)];
    else node = ["o", Object.keys(x).map(k => [put(k), put(x[k])])];
    const i = nodes.length; nodes.push(node);
    if (object) objects.set(x, i); else scalars.set(key, i);
    return i;
  }
  return { root: put(value), nodes };
}
function expandedSize(payload) {
  const sizes = [];
  for (const node of payload.nodes) {
    if (node[0] === "a") sizes.push(2 + Math.max(0, node[1].length - 1) + node[1].reduce((sum, r) => sum + sizes[r], 0));
    else if (node[0] === "o") sizes.push(2 + Math.max(0, node[1].length - 1) + node[1].length + node[1].reduce((sum, pair) => sum + sizes[pair[0]] + sizes[pair[1]], 0));
    else sizes.push(Buffer.byteLength(JSON.stringify(node[0] === "n" ? null : node[1])));
  }
  return sizes[payload.root];
}
function logical() {
  const drafts = [], units = [], intents = [];
  for (let i = 0; i < 500; i++) {
    const owner = "synthetic-owner-" + String(i).padStart(3, "0");
    const d = sha("D" + owner), r = sha("R" + owner);
    drafts.push({ intentId: d, profile: { id: owner } });
    units.push({ kind: "DR", subject: owner, intentIds: [d, r] });
    intents.push({ id: d, phase: "D", owner }, { id: r, phase: "R", owner, dependsOn: d });
  }
  const padding = Array(256).fill(Array(512).fill("P".repeat(1024)));
  return { command: { version: "helmut-synthetik500-production-command/2-direct", mode: "D-R-500",
    drafts, units, slot: { plan: { operationId: "synthetik500-resources21-f3375a7d5548", intents } } },
    admission: { privateText: SENTINEL, padding }, testAuthority: { privateText: SENTINEL } };
}
function envelope(payload) {
  const raw = Buffer.from(JSON.stringify(payload));
  return { version: "helmut-synthetik500-direct-dictionary-gzip/2", bytes: expandedSize(payload),
    sha256: "a".repeat(64), dictionaryBytes: raw.length, dictionarySha256: sha(raw),
    data: zlib.gzipSync(raw).toString("base64") };
}
function argsFor(packet, packetPath = "/tmp/synthetic-packet.json", installPath = "/tmp/synthetic-install.json") {
  const packetBytes = Buffer.isBuffer(packet) ? packet : Buffer.from(JSON.stringify(packet));
  const installPinsBytes = Buffer.from(JSON.stringify({ commandPin: { path: packetPath, bytes: packetBytes.length, sha256: sha(packetBytes) },
    admissionPin: { path: "/tmp/historical-admission.json", bytes: 123, sha256: "b".repeat(64) } }));
  return { packetBytes, packetPath, installPinsBytes,
    installPin: { path: installPath, bytes: installPinsBytes.length, sha256: sha(installPinsBytes) },
    terminalBytes, diagnosticNonce: "0123456789abcdef0123456789abcdef", preparedAtUTC: "2026-10-22T01:02:03.000Z" };
}
function rejected(fn) { assert.throws(fn); }
function negativeLogical(name, mutate) {
  check(name, () => { const x = logical(); mutate(x); rejected(() => inspectPinnedPacket(argsFor(envelope(graph(x))))); });
}
const fixture = envelope(graph(logical()));
const input = argsFor(fixture);
let result;
check("synthetic DAG preparation succeeds without execution", () => {
  assert(fixture.bytes > 64 * 1024 * 1024 && fixture.dictionaryBytes < 2 * 1024 * 1024);
  result = inspectPinnedPacket(input);
  assert.equal(result.status, "PREPARATION_ONLY_EXECUTION_BLOCKED");
  assert.equal(result.schema, "helmut-local-unit-diagnostic-preparation/1");
  assert.equal(result.sourceIndex, 499); assert.equal(result.diagnosticUnit, 0);
});
check("no authority, installation, command validation or expanded hash claim", () => {
  for (const key of ["namespaceInstalled", "diagnosticIdReserved", "production", "executionAuthority", "full500Accepted", "paidProviderCallsAllowed", "fullCommandValidated", "expandedSHA256Verified"]) assert.equal(result[key], false, key);
  assert.equal(result.sourceQualification, "IDENTITY_AND_STRUCTURE_ONLY");
  assert.equal(result.executionBlockedBy.length, 11);
  assert(result.executionBlockedBy.includes("postrunAuthJournalMissing"));
  assert(result.executionBlockedBy.includes("independentAcceptanceMissing"));
});
check("source day stays historical; diagnostic keys are proposals", () => {
  assert.equal(result.sourceDay, "2026-10-21"); assert.equal(result.executionDayUTC, "2026-10-22");
  assert.notEqual(result.sourceOperationId, result.diagnosticOperationId);
  for (const key of ["journal", "costs", "reservation", "sendClaim", "review", "result"]) assert(result.proposedNamespaceKeys[key].startsWith("localUnitDiagnostic:" + input.diagnosticNonce + ":"));
});
check("small immutable output excludes source owner and private text", () => {
  const text = JSON.stringify(result);
  assert(text.length < 10000 && !text.includes(SENTINEL) && !text.includes("synthetic-owner-"));
  function frozen(x) { if (x && typeof x === "object") { assert(Object.isFrozen(x)); Object.values(x).forEach(frozen); } }
  frozen(result); assert.throws(() => { result.executionAuthority = true; });
});
check("repeat inspection has identical binding and leaves input bytes unchanged", () => {
  const pins = [sha(input.packetBytes), sha(input.installPinsBytes), sha(terminalBytes)];
  const again = inspectPinnedPacket(input);
  assert.equal(again.sourceSelectionBindingSHA256, result.sourceSelectionBindingSHA256);
  assert.match(result.sourceSelectionBindingSHA256, /^[a-f0-9]{64}$/);
  assert.deepEqual([sha(input.packetBytes), sha(input.installPinsBytes), sha(terminalBytes)], pins);
});
check("original full-command validator rejects preparation", () => {
  const C = require("../lib/helmut/synthetik-500-production-command");
  assert.throws(() => C.validate(result), /command-shape/);
});
check("unknown approval flag rejected", () => rejected(() => inspectPinnedPacket({ ...input, executionAuthority: true })));
check("unsafe nonce rejected", () => rejected(() => inspectPinnedPacket({ ...input, diagnosticNonce: "../../unsafe" })));
check("invalid preparation day rejected", () => rejected(() => inspectPinnedPacket({ ...input, preparedAtUTC: "2026-02-30T00:00:00.000Z" })));
check("install hash drift rejected", () => rejected(() => inspectPinnedPacket({ ...input, installPin: { ...input.installPin, sha256: "0".repeat(64) } })));
check("packet pin drift rejected", () => rejected(() => inspectPinnedPacket({ ...input, packetBytes: Buffer.concat([input.packetBytes, Buffer.from(" ")]) })));
check("terminal byte drift rejected", () => rejected(() => inspectPinnedPacket({ ...input, terminalBytes: Buffer.concat([terminalBytes, Buffer.from(" ")]) })));
for (const [name, change] of [
  ["unknown envelope field", e => { e.authority = true; }],
  ["dictionary hash drift", e => { e.dictionarySha256 = "0".repeat(64); }],
  ["dictionary size drift", e => { e.dictionaryBytes++; }],
  ["logical size drift", e => { e.bytes++; }],
  ["noncanonical base64", e => { e.data += "\n"; }],
  ["invalid gzip", e => { e.data = Buffer.from("not gzip").toString("base64"); }],
  ["logical size above bound", e => { e.bytes = 4 * 1024 ** 3 + 1; }]
]) check(name + " rejected", () => { const e = { ...fixture }; change(e); rejected(() => inspectPinnedPacket(argsFor(e))); });
negativeLogical("wrong draft cardinality rejected", x => x.command.drafts.pop());
negativeLogical("wrong unit cardinality rejected", x => x.command.units.pop());
negativeLogical("wrong intent cardinality rejected", x => x.command.slot.plan.intents.pop());
negativeLogical("selected unit subject mismatch rejected", x => { x.command.units[499].subject = "wrong"; });
negativeLogical("selected draft intent mismatch rejected", x => { x.command.drafts[499].intentId = "wrong"; });
negativeLogical("duplicate unit intent rejected", x => { x.command.units[499].intentIds[1] = x.command.units[499].intentIds[0]; });
negativeLogical("selected review owner mismatch rejected", x => { x.command.slot.plan.intents[999].owner = "wrong"; });
negativeLogical("selected review phase mismatch rejected", x => { x.command.slot.plan.intents[999].phase = "D"; });
negativeLogical("selected review dependency mismatch rejected", x => { x.command.slot.plan.intents[999].dependsOn = "wrong"; });
negativeLogical("duplicate plan intent rejected", x => { x.command.slot.plan.intents[0].id = x.command.slot.plan.intents[999].id; });
negativeLogical("different source case rejected", x => { x.command.slot.plan.operationId = "synthetik500-resources21-000000000000"; });
for (const [name, mutate] of [
  ["forward reference", p => { p.nodes[p.root][1][0][1] = p.root; }],
  ["duplicate object key", p => { p.nodes[p.root][1].push(p.nodes[p.root][1][0]); }],
  ["unreachable node", p => { p.nodes.push(["s", "orphan"]); }],
  ["unsafe number", p => { p.nodes.push(["d", Number.MAX_SAFE_INTEGER + 1]); p.root = p.nodes.length - 1; }]
]) check(name + " rejected", () => {
  const p = graph(logical()); mutate(p);
  const raw = Buffer.from(JSON.stringify(p)), e = { ...fixture, dictionaryBytes: raw.length, dictionarySha256: sha(raw), data: zlib.gzipSync(raw).toString("base64") };
  rejected(() => inspectPinnedPacket(argsFor(e)));
});
check("excessive depth rejected", () => {
  const x = logical(); let deep = "end";
  for (let i = 0; i < 82; i++) deep = [deep];
  x.admission.deep = deep;
  rejected(() => inspectPinnedPacket(argsFor(envelope(graph(x)))));
});

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-unit-prep-test-"));
fs.chmodSync(temp, 0o700);
try {
  const packetPath = path.join(temp, "packet.json"), installPath = path.join(temp, "install.json");
  const cliArgs = argsFor(fixture, packetPath, installPath);
  fs.writeFileSync(packetPath, cliArgs.packetBytes, { mode: 0o600 });
  fs.writeFileSync(installPath, cliArgs.installPinsBytes, { mode: 0o600 });
  const command = ["--inspect", "--packet", packetPath, "--install-pins", installPath, "--install-sha256", cliArgs.installPin.sha256];
  const run = extra => spawnSync(process.execPath, [CLI, ...extra], { env: process.env, encoding: "utf8", timeout: 20000, maxBuffer: 100000 });
  check("real CLI returns only blocked preparation; source files unchanged", () => {
    const before = [sha(fs.readFileSync(packetPath)), sha(fs.readFileSync(installPath))];
    const r = run(command); assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout); assert.equal(out.status, "PREPARATION_ONLY_EXECUTION_BLOCKED");
    assert.equal(out.executionAuthority, false); assert(!r.stdout.includes(SENTINEL));
    assert.deepEqual([sha(fs.readFileSync(packetPath)), sha(fs.readFileSync(installPath))], before);
  });
  check("CLI help exits without inspection", () => { const r = run(["--help"]); assert.equal(r.status, 0); assert.match(r.stdout, /preparation|Preparation/); });
  for (const [name, args] of [["missing options", []], ["unknown approval", [...command, "--authority", SENTINEL]], ["hash drift", command.map(v => v === cliArgs.installPin.sha256 ? "0".repeat(64) : v)]]) check("CLI " + name + " fails without leaking values", () => {
    const r = run(args); assert.notEqual(r.status, 0); assert.equal(r.stdout, ""); assert.equal(r.stderr.trim(), "unit-diagnostic-inspection-rejected"); assert(!r.stderr.includes(SENTINEL));
  });
  check("CLI symlink input fails", () => {
    const link = path.join(temp, "packet-link.json"); fs.symlinkSync(packetPath, link);
    const r = run(command.map(v => v === packetPath ? link : v)); assert.notEqual(r.status, 0); assert.equal(r.stdout, "");
  });
  check("CLI hardlink input fails", () => {
    const link = path.join(temp, "packet-hardlink.json"); fs.linkSync(packetPath, link);
    try { assert.notEqual(run(command).status, 0); } finally { fs.unlinkSync(link); }
  });
  check("CLI publicly readable private input fails", () => {
    fs.chmodSync(packetPath, 0o644);
    try { assert.notEqual(run(command).status, 0); } finally { fs.chmodSync(packetPath, 0o600); }
  });
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log(`\nPASS ${passed} FAIL ${failed} (synthetic preparation only; no engine or full500 run)`);
process.exitCode = failed ? 1 : 0;
