"use strict";
// Nur Offlinebelege und injizierte Transporte; weder Aktivierung noch Production.
const A = require("node:assert/strict");
const F = require("./synthetik-500-runtime-test");
const RF = require("./realkohorte-500-runtime-test");
const RV = require("../lib/helmut/realkohorte-500-vertrag");
const K = require("../lib/helmut/testkosten-budget");
const W = require("./synthetik-500-endwaechter");
const RW = require("./realkohorte-500-endwaechter");
const clone = x => structuredClone(x);
let pass = 0;
function grenze(x, limit) {
  x.manifest.kosten.auftragslimitMikroUsd = limit;
  const k = x.manifest.kosten;
  k.restreserveMikroUsd = Math.min(k.tageslimitMikroUsd-k.tagVerbrauchtMikroUsd-k.tagReserviertMikroUsd,
    limit-k.auftragVerbrauchtMikroUsd-k.auftragReserviertMikroUsd);
  const a = x.belege.kosten.auth[K.AUFTRAG_KEY];
  a.limit = limit; a.version = limit === 20000000 ? 4 : 3;
  x.belege.ruhe.authHash = x.V.hash(x.belege.kosten.auth);
}
async function watch({ synthetik = true, limit = 20000000, spent = 7500000, day = 1000000,
  frozen = null, unknown = false, missingLimit = false } = {}) {
  const x = F.fixture();
  const rf = RF.fixture();
  rf.manifest.endeAm = x.manifest.endeAm;
  const auftrag = synthetik ? x.auftrag : RF.auftrag(rf);
  const status = synthetik ? x.status : RF.statusFixture(rf);
  const workflow = synthetik ? "synthetik" : "realkohorte";
  const env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: F.COMMIT, GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "12345",
    GITHUB_WORKFLOW_REF: `ernisch/helmut-pilot/.github/workflows/${workflow}-500-endwaechter.yml@refs/heads/main` };
  let now = F.NOW, writes = 0, reason;
  const result = await (synthetik ? W : RW).steuere({ auftrag, env, deps: {
    jetzt: () => now, warte: async ms => { now += ms; }, melde: () => {}, leseRuntime: async () => true,
    lese: async () => status,
    leseKosten: async () => ({ tag: "2026-10-01", gebundenMikroUsd: day, auftragGebundenMikroUsd: spent,
      ...(missingLimit ? {} : { auftragslimitMikroUsd: limit }), frozen, ungeklaert: unknown }),
    beende: async a => { writes++; reason = a.grund;
      return { zustand: "beendet-bestaetigt", schreibversuche: 1, lesung: { ...status, zustand: "beendet", aktiv: 0 } }; }
  } });
  A.equal(result.ok, true); A.equal(writes, 1); A.equal(result.automatischeWiederholung, false);
  return reason;
}
async function main() {
  A.equal(K.AUFTRAG_V3_LIMIT_MICRO_USD, 7000000); A.equal(K.AUFTRAG_V4_LIMIT_MICRO_USD, 20000000);
  for (const limit of [7000000, 20000000]) {
    const x = F.fixture(); grenze(x, limit);
    A.equal(x.V.pruefeManifest(x.manifest, x.bytes, x.snapshot), x.manifest);
    const m = x.G.baueRuntimeManifest({ manifest: x.manifest, snapshot: x.snapshot, belege: x.belege }, x.bytes, F.NOW);
    A.equal(m.profilvertrag.kosten.auftragslimitMikroUsd, limit); pass++;
  }
  for (const limit of [6000000, 8000000, 19000000, 21000000]) {
    const x = F.fixture(); grenze(x, limit);
    A.throws(() => x.V.pruefeManifest(x.manifest, x.bytes, x.snapshot), /kosten-grenzen/); pass++;
  }
  const real = RF.fixture(); real.manifest.kosten.auftragslimitMikroUsd = 20000000;
  A.throws(() => RV.pruefeManifest(real.manifest, RF.bytes, real.snapshot), /kosten-grenzen/); pass++;
  for (const [manifestLimit, actualLimit] of [[7000000, 20000000], [20000000, 7000000]]) {
    const x = F.fixture(); grenze(x, manifestLimit);
    const a = x.belege.kosten.auth[K.AUFTRAG_KEY]; a.limit = actualLimit; a.version = actualLimit === 20000000 ? 4 : 3;
    x.belege.ruhe.authHash = x.V.hash(x.belege.kosten.auth);
    A.throws(() => x.G.baueRuntimeManifest({ manifest: x.manifest, snapshot: x.snapshot, belege: x.belege }, x.bytes, F.NOW),
      /kosten-projektion-drift/); pass++;
  }
  A.equal(await watch(), "frist"); pass++;
  for (const opts of [{ spent: 20000000 }, { limit: 7000000, spent: 7000000 }, { limit: null },
    { limit: 8000000 }, { day: 6000000 }, { unknown: true }, { frozen: "gesperrt" }]) {
    A.equal(await watch(opts), "notstopp"); pass++;
  }
  // Kein impliziter 7-USD-Ersatz bei fehlender synthetischer Buchgrenze.
  A.equal(await watch({ limit: NaN }), "notstopp"); pass++;
  A.equal(await watch({ missingLimit: true }), "notstopp"); pass++;
  A.equal(await watch({ synthetik: false }), "notstopp"); pass++;
  const x = F.fixture(); grenze(x, 20000000); const m = clone(x.manifest);
  m.kosten.tageslimitMikroUsd = 20000000;
  A.throws(() => x.V.pruefeManifest(m, x.bytes, x.snapshot), /kosten-grenzen/); pass++;
  console.log(`${pass}/${pass} fixe Budget-, Manifest-/Buch- und Endwaechterbindungen gruen; nur offline.`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { main };
