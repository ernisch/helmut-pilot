"use strict";
const assert = require("node:assert/strict");
const F = require("../lib/helmut/verstehen-rest15-vertrag");
const F16 = require("../lib/helmut/verstehen-frische16-vertrag");
const V = require("../lib/helmut/verstehen-einmalig");
const B = require("./verstehen-rest15");
async function main() {
  const q = { status: "gestoppt", runId: "verstehen16-36207593889",
    runtimeCommit: "af4d51c6c15b95165dbefa1ca9320d341278c2c4", idHash: F16.FRISCHE16.idHash,
    modellaufrufe: 1, abbruchVorgangId: F.VORGANG, abbruchGrund: "verstehen-frische16-einzelergebnis-nicht-bestaetigt",
    bilanz: { verarbeitet: 1, arten: { "skipped-invalid": 1 } }, laufkostenUsd: 0.007537, fachlichBestanden: false };
  const cas = { vorgang_id: F.VORGANG, zustand: "unbekannt", fencing: 2, ki_aufrufe: 2, lease_bis: null };
  assert.equal(F.pruefeVorgaenger(q, cas), true);
  for (const key of Object.keys(q)) assert.notEqual(F.pruefeVorgaenger({ ...q, [key]: null }, cas), true);
  for (const key of Object.keys(cas)) assert.notEqual(F.pruefeVorgaenger(q, { ...cas, [key]: "anders" }), true);
  console.log("PASS Vorgang, Quittung und bestaetigte Kosten exakt gebunden");
  assert.equal(B.argumente(["--plan"]), false);
  assert.equal(B.argumente(["--execute", B.BESTAETIGUNG]), true);
  assert.throws(() => B.argumente(["--execute", require("./verstehen-frische16").BESTAETIGUNG]));
  const commit = "a".repeat(40), env = { HELMUT_REST15_RUNTIME_COMMIT: commit, GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: commit };
  assert.equal(B.pruefeRuntime(env, commit), commit);
  assert.throws(() => B.pruefeRuntime({ ...env, GITHUB_RUN_ATTEMPT: "2" }, commit));
  const old = await V.fuehreAus({ ids: [], deps: {}, erwartet: F.REST15, quittungsschluessel: F16.QUITTUNG });
  assert.equal(old.grund, "verstehen-rest15-quittung-abweichend");
  assert.equal(F.istVersorgung(async () => ({})), false);
  assert.equal(F.pruefeInhalt([]), false);
  console.log("PASS Alter Auftrag und fremde Eingaben bleiben gesperrt");
  if (!process.argv[2]) return;
  const payload = JSON.parse(require("node:fs").readFileSync(process.argv[2], "utf8"));
  const docs = payload.rows.filter(d => d.id !== F.AUSGESCHLOSSEN);
  const supply = F.ausGesichertenBelegen(payload.rows, payload.belege);
  assert.equal(F.pruefeInhalt(docs), true);
  assert.equal(V.idsHash(docs.map(d => d.id)), F.REST15.idHash);
  assert.equal(F.pruefeInhalt(payload.rows), false);
  assert.equal(F.pruefeInhalt(docs, Date.now() + 49 * 3600000), false);
  assert.equal((await supply(payload.rows.filter(d => d.id === F.AUSGESCHLOSSEN))).ok, false);
  for (const doc of docs) assert.equal((await supply([doc])).ok, true);
  const altered = structuredClone(payload); altered.belege[0].text += " fremd";
  assert.throws(() => F.ausGesichertenBelegen(altered.rows, altered.belege));
  console.log("PASS Alle 15 Originale gebunden, gesperrte Quelle ausgeschlossen");
  const U = require("../lib/helmut/understanding"), original = U.understandOneCluster;
  async function run(failure) {
    let calls = 0, cost = 0, claimed = false, released = false, receipt;
    const deps = { enabled: () => true, aiEnabled: () => true, ladeDokumente: async () => docs,
      getExisting: async () => null, getExistingStreng: async () => null,
      findVorgangCandidates: async () => [], listVorgangDocuments: async () => [],
      listWiederaufnahmen: async () => [], verstehenVertrag: () => ({}), artikelkontextVersorgung: supply,
      reservierungHoeheUsd: () => 0.212, laufKostenUsd: async () => cost,
      acquireLock: async () => ({ granted: true }), releaseLock: async () => { released = true; },
      claimRun: async () => { if (claimed) return false; claimed = true; return true; },
      finishRun: async r => { receipt = r; return true; },
      requestUnderstanding: async () => { calls++; cost += 0.003; return {}; } };
    U.understandOneCluster = async (cluster, supplied) => {
      assert.ok(cluster.documents.every(d => d.id !== F.AUSGESCHLOSSEN));
      assert.equal((await supplied.artikelkontextVersorgung(cluster.documents)).ok, true);
      await supplied.requestUnderstanding("isolierter Test");
      return { status: calls === 2 && failure ? failure : "saved", documents: 1, vorgangId: "isoliert-" + calls,
        ...(calls === 2 && failure ? { ausgang: "unbekannt" } : {}) };
    };
    const opts = { ids: docs.map(d => d.id), deps, execute: true, commit: F.REST15.commit,
      erwartet: F.REST15, quittungsschluessel: F.QUITTUNG, runId: "isoliert" };
    const result = await V.fuehreAus(opts), before = calls;
    assert.equal((await V.fuehreAus(opts)).ok, false); assert.equal(calls, before); assert.ok(released);
    return { result, calls, receipt };
  }
  try {
    const success = await run(); assert.equal(success.calls, 15); assert.equal(success.result.ok, true);
    const local = await run("skipped-invalid"); assert.equal(local.calls, 15); assert.equal(local.result.ok, false);
    assert.equal(local.result.bilanz.unbekannt, 1); assert.equal(local.receipt.status, "unbekannt");
    const global = await run("skipped-error"); assert.equal(global.calls, 2); assert.equal(global.result.ok, false);
    console.log("PASS Einmaligkeit; lokaler Fehler bleibt rot, technischer Fehler stoppt sofort");
  } finally { U.understandOneCluster = original; }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
