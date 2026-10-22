"use strict";

// Synthetic byte/provenance and integration-boundary tests only. This test
// opens no diagnostic authority, native database, engine or provider transport.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const crypto = require("node:crypto"), Module = require("node:module"), vm = require("node:vm");
const root = path.resolve(__dirname, ".."), realLoad = Module._load;
const inactive = Object.freeze({ currentVerified: () => null });
Module._load = function (request, parent, ...rest) {
  if (request === "./local-unit-diagnostic-scope" && parent?.filename.startsWith(path.join(root, "lib/helmut/"))) return inactive;
  return realLoad.call(this, request, parent, ...rest);
};
const noNetwork = () => { throw Error("synthetic motor test forbids network"); };
global.fetch = noNetwork; require("node:https").request = noNetwork; require("node:http").request = noNetwork;
const Source = require("../lib/helmut/local-unit-diagnostic-source");
const Codec = require("../lib/helmut/synthetik-500-direct-codec"), P = require("../lib/helmut/synthetik-500-profile");
const C = require("../lib/helmut/synthetik-500-production-command");
const B = require("../lib/helmut/briefing-aussagenbindung"), L = require("../lib/helmut/briefing-lagebindung");
const sha = x => crypto.createHash("sha256").update(x).digest("hex");
let checks = 0;
function check(name, fn) { fn(); checks++; process.stdout.write("PASS " + name + "\n"); }
function logical() {
  const profile = { id: P.erzeuge().profile.at(-1).mandatsId, profileActive: true };
  const document = { ...Object.fromEntries(require("../lib/helmut/synthetik-500-w-inventar").SOURCE_VERSION_FIELDS.map(k => [k, null])),
    id: "rd-fictional-unit", title: "Fiktive Beratung", summary: "Eine fiktive Beratung ist vorgesehen.",
    source_name: "Offlinefixture", url: "https://example.org/fictional/unit", canonical_url: "https://example.org/fictional/unit",
    published_at: "2026-10-21T08:00:00.000Z" };
  const ko = { ...Object.fromEntries(require("../lib/helmut/knowledge-object-version").VERSION_FIELDS.map(k => [k, null])),
    id: "ko-fictional-unit", vorgang_id: "vg-fictional-unit", ko_version: 1, headline: document.title,
    was_ist_passiert: document.summary, understanding_status: "complete", status: "ready", updated_at: "2026-10-21T09:00:00.000Z" };
  const sourcesByVorgang = { [ko.vorgang_id]: [document] }, kos = [ko];
  const briefing = { available: true, items: [{ vorgangId: ko.vorgang_id, title: ko.headline, summary: ko.was_ist_passiert }] };
  const eingabe = B.baueEingabe({ briefing, kos, sourcesByVorgang, profile, userId: profile.id, day: "2026-10-21" });
  const result = { briefing, eingabe, korrekturBasis: { kos, sourcesByVorgang } };
  const urteil = { version: B.VERSION, eingabeHash: eingabe.eingabeHash, ursprungHash: eingabe.eingabeHash,
    ausgelasseneVorgaenge: [], aussagen: eingabe.aussagen.map(a => ({ ...a, sachlichGetragen: true,
      kontextGetragen: true, mandatsbezugGetragen: true, begruendung: "Fiktives technisches Urteil.",
      belege: [{ vorgangId: ko.vorgang_id, documentId: document.id, feld: "auszug", text: document.summary }] })) };
  urteil.gesamtpruefung = require("./fixtures/briefing-fachurteil")(result, urteil);
  const briefingEingabe = L.baue(result, urteil), briefingDatum = "2026-10-21T10:00:00.000Z";
  const descriptor = { owner: profile.id, profileHash: P.hash(profile), context: { profileVersionHash: P.hash(profile),
    briefingEingabeHash: P.hash(briefingEingabe), briefingDatum }, documentKeys: [], knowledgeObjectKeys: [] };
  const intents = [], drafts = [], units = [];
  for (let i = 0; i < 500; i++) {
    const owner = i === 499 ? profile.id : "fictional-owner-" + i, d = sha("D-" + i), r = sha("R-" + i);
    const selected = i === 499;
    const input = selected ? { intentId: d, profile, descriptor, briefingEingabe, briefingDatum,
      sources: { documents: [document], knowledgeObjects: kos } } : { intentId: d, profile: { id: owner } };
    drafts.push(input); units.push({ kind: "DR", subject: owner, intentIds: [d, r] });
    intents.push({ id: d, phase: "D", owner, inputVersionHash: selected ? P.hash(descriptor) : sha(owner),
      actualRequestHash: sha("fictional-body-" + i), model: "gpt-5-mini", maxOutputTokens: 3000, attemptLimit: 1 },
    { id: r, phase: "R", owner, inputVersionHash: null, actualRequestHash: null, dependsOn: d,
      contextVersionHash: selected ? P.hash(descriptor) : sha(owner), model: "gpt-5-mini", maxOutputTokens: 6000,
      attemptLimit: 1, reviewRule: { version: "helmut-synthetik500-review-body/1", reasoningEffort: "medium" } });
  }
  return { command: { version: C.DIRECT_VERSION, mode: "D-R-500", drafts, units,
    slot: { plan: { operationId: "synthetik500-resources21-f3375a7d5548", intents } } },
    admission: { padding: Array(128).fill(Array(512).fill("P".repeat(1024))) } };
}
function argsFor(envelope) {
  const packetBytes = Buffer.from(JSON.stringify(envelope)), packetPath = "/tmp/fictional-source-packet.json";
  const installPinsBytes = Buffer.from(JSON.stringify({ commandPin: { path: packetPath, bytes: packetBytes.length, sha256: sha(packetBytes) },
    admissionPin: { path: "/tmp/fictional-old-admission.json", bytes: 1, sha256: sha("never-go") } }));
  return { packetBytes, packetPath, installPinsBytes,
    installPin: { path: "/tmp/fictional-install.json", bytes: installPinsBytes.length, sha256: sha(installPinsBytes) },
    terminalBytes: fs.readFileSync(path.join(root, "docs/betrieb/belege/next-local-full500-20261021/V12_ACTUAL_TERMINAL.SAFE.json")),
    diagnosticNonce: "0123456789abcdef0123456789abcdef", preparedAtUTC: "2026-10-22T01:02:03.000Z" };
}
const original = logical(), envelope = Codec.encode(original), args = argsFor(envelope);
let handle, own;
check("actual full expansion hash and native selected context are verified", () => {
  assert.equal(envelope.version, Codec.DICTIONARY_VERSION);
  handle = Source.extractPinnedSource(args);
  const binding = Source.sourceBinding(handle), selected = Source.readSelection(handle);
  assert.equal(binding.expandedSHA256Verified, true); assert.equal(binding.expandedSHA256, envelope.sha256);
  assert.equal(binding.fullCommandValidated, false); assert.equal(binding.executionAuthority, false);
  assert.equal(selected.sourceIndex, 499); assert.equal(selected.diagnosticUnit, 0);
  assert.equal(selected.sourceViewAtUTC, "2026-10-21T10:00:00.000Z");
  assert.equal(selected.intents[0].maxOutputTokens, 3000); assert.equal(selected.intents[1].maxOutputTokens, 6000);
  assert.equal(selected.intents[1].reviewRule.reasoningEffort, "medium");
  assert(Object.isFrozen(selected.draft.sources.documents));
});
check("source handles cannot be forged or serialized into authority", () => {
  assert.throws(() => Source.readSelection({})); assert.throws(() => Source.commandSource(JSON.parse(JSON.stringify(handle))));
});
check("a changed declared expansion hash is rejected after fresh outer pins", () => {
  assert.throws(() => Source.extractPinnedSource(argsFor({ ...envelope, sha256: "f".repeat(64) })));
});
check("own one-unit remap retains every selected native input field", () => {
  const selected = Source.readSelection(handle), [d, r] = structuredClone(selected.intents);
  d.id = sha("new-only-D"); r.id = sha("new-only-R"); r.dependsOn = d.id;
  own = { version: "helmut-local-unit-diagnostic-command/1", mode: "D-R-1-local-fixture", source: Source.commandSource(handle),
    calendar: { sourceDay: selected.sourceDay, sourceViewAtUTC: selected.sourceViewAtUTC },
    drafts: [{ ...structuredClone(selected.draft), intentId: d.id }],
    units: [{ kind: "DR", subject: selected.unit.subject, intentIds: [d.id, r.id] }], slot: { plan: { intents: [d, r] } } };
  assert.equal(Source.verifyCommandSource(own, handle), Source.sourceBinding(handle));
});
for (const [name, change] of [
  ["historical intent replay", c => { c.units[0].intentIds[0] = Source.readSelection(handle).intents[0].id; }],
  ["source profile mutation", c => { c.drafts[0].profile.profileActive = false; }],
  ["source time mutation", c => { c.calendar.sourceViewAtUTC = "2026-10-22T10:00:00.000Z"; }],
  ["R context downgrade", c => { c.slot.plan.intents[1].maxOutputTokens = 3000; }],
  ["second unit", c => { c.units.push(c.units[0]); }],
  ["old command version", c => { c.version = C.DIRECT_VERSION; c.mode = "D-R-500"; }]
]) check(name + " is rejected", () => { const c = structuredClone(own); change(c); assert.throws(() => Source.verifyCommandSource(c, handle)); });

// Load the actual calendar with an explicitly synthetic scope; no production
// module exports are patched and no executable native proof is minted.
function calendarFor(active) {
  const filename = path.join(root, "lib/helmut/synthetik-500-local-calendar.js"), output = { exports: {} };
  const localRequire = Module.createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module: output, exports: output.exports, Buffer, URL, Date,
    process: { env: {} }, require: name => name === "./local-unit-diagnostic-scope"
      ? { currentVerified: () => active } : localRequire(name) }, { filename });
  return output.exports;
}
check("diagnostic source day and real output day stay separate without a Date mock", () => {
  const real = new Date(), day = real.toISOString().slice(0, 10), command = structuredClone(own);
  command.calendar = { sourceDay: "2026-10-21", sourceViewAtUTC: "2026-10-21T10:00:00.000Z", executionDayUTC: day,
    startsAtUTC: new Date(real.getTime() - 1000).toISOString(), endsAtUTC: new Date(real.getTime() + 60000).toISOString() };
  command.slot.plan = { ...command.slot.plan, operationId: "localUnitDiagnostic-" + "a".repeat(32),
    startsAtUTC: command.calendar.startsAtUTC, endsAtUTC: command.calendar.endsAtUTC };
  const calendar = calendarFor({ command, selection: { operationId: command.slot.plan.operationId, commandHash: sha("fictional") } });
  assert.equal(calendar.outputDay(), day); assert.equal(calendar.generatedDay(real), day);
  assert.equal(calendar.sourceViewDate(real).toISOString(), "2026-10-21T10:00:00.000Z");
  assert.equal(calendar.commandOutputDay(command), day);
  assert.throws(() => calendar.commandOutputDay(structuredClone(command)));
});
check("malformed or closed diagnostic scope cannot fall back to a legacy calendar", () => {
  assert.throws(() => calendarFor({ command: {}, selection: {} }).outputDay());
  assert.equal(calendarFor(null).outputDay(), require("../lib/helmut/briefing-frische").berlinTagKey(new Date()));
});
check("finite Lage input requires the same live diagnostic capability", () => {
  const real = new Date(), command = structuredClone(own), operationId = "localUnitDiagnostic-" + "c".repeat(32);
  command.calendar = { sourceDay: "2026-10-21", sourceViewAtUTC: command.drafts[0].briefingDatum,
    executionDayUTC: real.toISOString().slice(0, 10), startsAtUTC: new Date(real.getTime() - 1000).toISOString(),
    endsAtUTC: new Date(real.getTime() + 60000).toISOString() };
  command.slot.plan = { ...command.slot.plan, operationId, startsAtUTC: command.calendar.startsAtUTC,
    endsAtUTC: command.calendar.endsAtUTC };
  let active = { command, selection: { operationId, commandHash: sha("opaque-input-scope") } };
  const filename = path.join(root, "lib/helmut/synthetik-500-lage-input.js"), output = { exports: {} }, localRequire = Module.createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module: output, exports: output.exports, Date, structuredClone,
    require: name => name === "./local-unit-diagnostic-scope" ? { currentVerified: () => active }
      : name === "./synthetik-500-local-calendar" ? calendarFor(active) : localRequire(name) }, { filename });
  const input = output.exports, token = input.create(command.drafts[0], command.slot.plan);
  const finite = input.read(token, command.drafts[0].profile);
  assert.equal(finite.briefingDatum, "2026-10-21T10:00:00.000Z"); assert.equal(finite.dateBinding, null);
  assert.throws(() => input.create(structuredClone(command.drafts[0]), command.slot.plan));
  assert.throws(() => input.read({}, command.drafts[0].profile));
  const originalActive = active; active = null; assert.throws(() => input.read(token, command.drafts[0].profile));
  active = { ...originalActive, selection: { ...originalActive.selection, commandHash: sha("different-scope") } };
  assert.throws(() => input.read(token, command.drafts[0].profile));
});
function adapterFor(scope, storage) {
  const filename = path.join(root, "lib/helmut/local-unit-diagnostic-adapter.js"), output = { exports: {} };
  const localRequire = Module.createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module: output, exports: output.exports, Date, structuredClone,
    require: name => name === "./local-unit-diagnostic-scope" ? scope : name === "./storage" ? storage : localRequire(name) }, { filename });
  return output.exports;
}
async function motorBoundaries() {
  const selection = { operationId: "localUnitDiagnostic-" + "b".repeat(32), commandHash: sha("fictional-new-command") };
  const events = [], storage = {
    readSynthetik500CurrentInputs: async () => events.push("current-inputs"),
    getProfileFromDb: async () => structuredClone(own.drafts[0].profile),
    synthetik500ReviewStorageContract: async () => { throw Error("unexpected review execution"); },
    retainLocalUnitDiagnosticEvidence: async () => { throw Error("unexpected evidence write"); },
    readLocalUnitDiagnosticEvidence: async () => { throw Error("unexpected evidence read"); }
  };
  const scope = {
    currentVerified: () => ({ command: own, selection }),
    runClaimed: async () => { events.push("claim-gate"); throw Error("missing-actual-originals"); },
    verifyRuntime: async () => events.push("fresh-runtime"),
    readState: async () => { events.push("own-state-read"); return {}; },
    mutateState: async () => { throw Error("unexpected state write"); }, costAdmission: () => ({}),
    checkControl: async () => { throw Error("unexpected control execution"); },
    verification: () => { throw Error("unexpected verification export"); },
    confirmFinalACK: async () => { throw Error("unexpected final ACK"); },
    assertTicket: ticket => { assert.equal(ticket, genuineTestTicket); },
    beforeSend: async () => { throw Error("unexpected send claim"); },
    guard: () => { throw Error("own-claim-expired"); }
  };
  const genuineTestTicket = Object.freeze({ synthetic: true });
  async function test(name, fn) { await fn(); checks++; process.stdout.write("PASS " + name + "\n"); }
  await test("missing own native state consumers reject before claim", async () => {
    await assert.rejects(adapterFor({ ...scope, readState: undefined }, storage).execute(selection), /own-state-consumers-missing/);
    assert.deepEqual(events, []);
  });
  await test("missing original native proofs cannot be replaced with the new selector", async () => {
    await assert.rejects(adapterFor(scope, storage).execute(selection), /missing-actual-originals/);
    assert.deepEqual(events, ["claim-gate"]); events.length = 0;
  });
  await test("forged send tickets stop before native input or runtime reads", async () => {
    await assert.rejects(adapterFor(scope, storage).beforeSend({ ...genuineTestTicket })); assert.deepEqual(events, []);
  });
  await test("sender delegates to the closed measured control consumer", async () => {
    await assert.rejects(adapterFor({ ...scope, beforeSend: async () => { events.push("measured-send"); throw Error("current-profile-drift"); } }, storage)
      .beforeSend(genuineTestTicket), /current-profile-drift/);
    assert.deepEqual(events, ["measured-send"]); events.length = 0;
  });
  await test("expired own claim cannot fall through to the old500 sender", async () => {
    await assert.rejects(adapterFor({ ...scope, beforeSend: async () => { events.push("measured-send"); throw Error("own-claim-expired"); } }, storage)
      .beforeSend(genuineTestTicket), /own-claim-expired/);
    assert.deepEqual(events, ["measured-send"]); events.length = 0;
  });
}
motorBoundaries().then(() => {
  Module._load = realLoad;
  process.stdout.write(JSON.stringify({ syntheticChecks: checks, nativeQualification: false, databaseCalls: 0,
    providerCalls: 0, executionAuthority: false, full500Accepted: false }) + "\n");
}).catch(error => { Module._load = realLoad; console.error(error); process.exitCode = 1; });
