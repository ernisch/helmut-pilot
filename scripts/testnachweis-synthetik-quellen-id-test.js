"use strict";
// Die echten beiden Leser mit injiziertem Transport; keine Production/Modellaufrufe.
const A = require("node:assert/strict"), fs = require("node:fs");
const C = require("../lib/helmut/synthetik-500-production-command");
const KO = require("../lib/helmut/knowledge-object-version"), W = require("../lib/helmut/synthetik-500-w-inventar");
const code = fs.readFileSync(require.resolve("../lib/helmut/storage"), "utf8");
const begin = code.indexOf("const synthetik500SourceId"), end = code.indexOf("const synthetik500NativeIo", begin);
A.ok(begin >= 0 && end > begin);
const factory = new Function("require", "synthetik500ProductionBackend", "supabaseRequest", "V3_KO_VERSION_SELECT_60",
  code.slice(begin, end) + "\nreturn {read:readSynthetik500CurrentInputs,post:getSynthetik500UnderstandingPostimage};");
global.fetch = () => { throw Error("offline-network-forbidden"); };
let passed = 0;
function fixture(id = "ko-fiktive-präsidentin-ÄÖÜäöüß") {
  const doc = { ...Object.fromEntries(W.SOURCE_VERSION_FIELDS.map(k => [k, null])), id: "doc-fiktiver-auszug",
    title: "Fiktiver Testauszug" };
  const ko = { ...Object.fromEntries(KO.VERSION_FIELDS.map(k => [k, null])), id, vorgang_id: "vg-fiktive-präsidentin",
    ko_version: 1, verstehen_fencing: 1, status: "complete", understanding_status: "complete" };
  const expected = { documents: [doc], knowledgeObjects: [ko] }; C.validateSources(expected);
  const calls = [], links = [{ knowledge_object_id: id, raw_document_id: doc.id, created_at: null }];
  const request = async path => {
    calls.push(path); const u = new URL(path, "https://fictional.invalid"), selector = u.searchParams.get("id");
    if (u.pathname === "/rest/v1/raw_documents") { A.equal(selector, `in.(${doc.id})`); return [structuredClone(doc)]; }
    if (u.pathname === "/rest/v1/knowledge_objects") {
      A.ok([`in.(${id})`, `eq.${id}`].includes(selector)); return [structuredClone(ko)];
    }
    A.equal(u.pathname, "/rest/v1/ko_document_links");
    A.equal(u.searchParams.get("knowledge_object_id"), `eq.${id}`); return structuredClone(links);
  };
  const backend = () => {}, load = req => factory(p => require("../lib/helmut/" + p.replace(/^\.\//, "")), backend, req, KO.VERSION_FIELDS.join(","));
  return { expected, doc, ko, calls, links, api: load(request), load, request };
}
async function main() {
  for (const id of ["ko-fiktive-ASCII_123", "ko-fiktive-präsidentin-ÄÖÜäöüß", "a".repeat(200)]) {
    const f = fixture(id); A.deepEqual(await f.api.read(f.expected), f.expected);
    A.equal((await f.api.post(id, f.ko.vorgang_id, [f.doc.id])).knowledgeObject.id, id);
    if (id.includes("ä")) A.ok(f.calls.some(path => path.includes("%C3%A4")));
    else A.ok(f.calls.some(path => path.includes(`in.(${id})`)));
    passed++;
  }
  for (const bad of ["bad\n", "bad\r", "bad\t", "bad name", "bad/slash", "bad?query", "bad%2Fescape", "bad,comma",
    "bad)paren", "bad'quote", "bad\\path", "badé", "bad中", "bad\u2028", "bad\u200b", "a".repeat(201)]) {
    const f = fixture(bad);
    await A.rejects(f.api.read(f.expected), /production-source-id/);
    A.equal(f.calls.length, 1, "Nur die fiktive Dokumentlesung, kein KO-Request");
    f.calls.length = 0; await A.rejects(f.api.post(bad, f.ko.vorgang_id, [f.doc.id]), /u-postimage-input/);
    A.equal(f.calls.length, 0); passed++;
  }
  for (const bad of [null, 17, "", "doc\n"]) {
    const f = fixture(); await A.rejects(f.api.post(f.ko.id, f.ko.vorgang_id, [bad]), /u-postimage-input/);
    A.equal(f.calls.length, 0); passed++;
  }
  const f = fixture();
  const drift = f.load(async path => { const rows = await f.request(path); if (path.includes("knowledge_objects")) rows[0].status = "drift"; return rows; });
  await A.rejects(drift.read(f.expected), /current-input-drift/); passed++;
  for (const docs of [[], [f.doc.id, f.doc.id]]) {
    f.calls.length = 0; await A.rejects(f.api.post(f.ko.id, f.ko.vorgang_id, docs), /postimage-input/);
    A.equal(f.calls.length, 0); passed++;
  }
  const incomplete = f.load(async path => path.includes("knowledge_objects") ? [] : f.request(path));
  await A.rejects(incomplete.read(f.expected), /current-input-incomplete/); passed++;
  // Exercise the real start entry, with an explicitly fictional admitted boundary.
  // Source rejection must precede counter reads and any permanent journal mutation.
  const Adapter = require("../lib/helmut/synthetik-500-production-adapter");
  const J = require("../lib/helmut/synthetik-500-dispatch-journal");
  const K = require("../lib/helmut/testkosten-budget"), P = require("../lib/helmut/synthetik-500-profile");
  const storagePath = require.resolve("../lib/helmut/storage"), oldCache = require.cache[storagePath];
  const oldAdmission = C.admission, oldActive = K.aktiv, oldStart = K.pruefeStart;
  const oldCommit = process.env.HELMUT_PRODUCTION_COMMIT;
  try {
    C.admission = () => "fictional-admission-only"; K.aktiv = () => true; K.pruefeStart = () => ({});
    process.env.HELMUT_PRODUCTION_COMMIT = "c".repeat(40);
    for (const late of [false, true]) {
      const time = Date.now(), op = "synthetik500-offline-source-preflight";
      const command = { mode: "U-prestage", predecessors: [], understanding: [{ sources: f.expected }],
        units: [{ kind: "U", subject: "fictional-pair", intentIds: ["fictional-intent"] }],
        slot: { planHash: P.hash("fictional-plan"), plan: { operationId: op,
          productionCommit: process.env.HELMUT_PRODUCTION_COMMIT, routeContract: {},
          startsAtUTC: new Date(time - 1000).toISOString(), endsAtUTC: new Date(time + 60000).toISOString() } } };
      let auth = { testKostenAuftrag: { version: 3, id: "fictional-order", limit: 7000000,
        abTag: new Date(time).toISOString().slice(0, 10), externGebunden: 0 } };
      const day = new Date(time).toISOString().slice(0, 10);
      auth[K.KEY] = { [day]: { version: K.VERSION, day, tarif: K.konfiguration({}).tarif,
        limit: K.LIMIT_MICRO_USD, spent: 0, baseline: 0, manualCalls: 0, manualUntil: null, calls: {}, frozen: null } };
      J.install(auth, command, P.hash(command), C.controlHash(auth));
      const original = structuredClone(auth), events = [];
      const packet = { command, admission: { booksHash: C.booksHash(auth) } };
      require.cache[storagePath] = { id: storagePath, filename: storagePath, loaded: true, exports: {
        synthetik500ProductionBackend() {}, loadSynthetik500ProductionCommand: async () => packet,
        readSynthetik500CurrentInputs: async () => {
          events.push("source");
          if (!late || events.filter(e => e === "source").length === 2) throw Error("fictional-source-drift");
          return f.expected;
        },
        leseLlmTageszaehler: async () => { events.push("counter"); return { ok: true, used: 0 }; },
        mutateAuthStore: async fn => { events.push("mutate"); const next = structuredClone(auth); await fn(next); auth = next; },
        retainSynthetik500ProductionEvidence: async () => { events.push("evidence"); }
      } };
      await A.rejects(Adapter.productionStart({ operationId: op, commandHash: P.hash(command) }),
        late ? /production-stopped-or-unknown/ : /fictional-source-drift/);
      A.equal(events[0], "source");
      if (!late) { A.deepEqual(events, ["source"]); A.deepEqual(auth, original); }
      else {
        A.equal(events.filter(e => e === "source").length, 2, "Input is rechecked after permanent entry");
        A.equal(J.current(auth).state, "unknown"); A.equal(J.current(auth).units[0].entered, true);
        A.deepEqual(J.current(auth).attempts, {});
      }
      passed++;
    }
  } finally {
    if (oldCache) require.cache[storagePath] = oldCache; else delete require.cache[storagePath];
    C.admission = oldAdmission; K.aktiv = oldActive; K.pruefeStart = oldStart;
    if (oldCommit === undefined) delete process.env.HELMUT_PRODUCTION_COMMIT; else process.env.HELMUT_PRODUCTION_COMMIT = oldCommit;
  }
  console.log(`${passed}/${passed} echte Vollversions-/Postimageleser mit festen ID-Grenzen gruen; nur offline.`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
