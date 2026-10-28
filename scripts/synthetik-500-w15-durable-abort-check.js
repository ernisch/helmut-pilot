"use strict";
// Child of the real Docker/Supervisor signal proof. Replays existing measurement
// rows only: no Auth API, SQL, profile, Unit, provider or GC invocation.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const Durable = require("./fixtures/w15-durable-observations"), Auth = require("./fixtures/w15-auth-measurement-report");
assert(require.cache[require.resolve("./lokaler-netzschutz")]);
assert.deepEqual(require("./lokaler-netzschutz").pruefe(process.env), []);
const state = process.argv[2], input = JSON.parse(fs.readFileSync(path.join(state, "reused-observations.SAFE.json")));
assert(!fs.existsSync(path.join(state, "STOP_REQUESTED.SAFE.json")), "w15-proof-stop-before-start");
const journal = Durable.open(state, "run"), observation = { mutations: [], usageSinks: [], casWrites: [] };
journal.observe(observation);
for (const key of Object.keys(observation)) for (const original of input[key]) {
  const { wallMs, ...fields } = original, row = { id: original.id, beginMS: original.beginMS };
  observation[key].push(row); Object.assign(row, fields); row.wallMs = wallMs;
}
observation.mutations.push({ id: 999, kind: "public-mutation", index: 0, beginMS: 4000 });
observation.casWrites.push({ id: 999, envelopeId: 999, rowId: "main-auth", index: 0, beginMS: 4001 });
const stopMonitor = Durable.monitor(journal, () => ({ scope: "PROCESS_SIGNAL_PROOF_NOT_MEMORY_ACCEPTANCE" }));
Auth.retainOnTermination(() => ({ authTimings: Auth.summarize(observation),
  mutations: observation.mutations, usageSinks: observation.usageSinks, casWrites: observation.casWrites }), value => {
    stopMonitor(); journal.write("termination-received", value);
    fs.writeFileSync(path.join(state, "SIGNAL_ABORT.SAFE.json"), JSON.stringify(value), { flag: "wx", mode: 0o600 });
  });
journal.ready();
fs.writeFileSync(path.join(state, "SIGNAL_READY.SAFE.json"), JSON.stringify({ pid: process.pid }), { flag: "wx", mode: 0o600 });
