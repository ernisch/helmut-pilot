"use strict";
const A = require("node:assert/strict"), P = require("../lib/helmut/briefing-pruefaufnahme-500");
const D = require("../lib/helmut/testkohorte-direkt500");
const commit = "a".repeat(40), tag = "2026-09-15", userId = D.ALLE_KENNUNGEN[0];
const zeit = new Date("2026-09-15T12:00:00Z");
function fixture() {
  let reads = 0, builds = 0;
  const profiles = [...D.ALLE_KENNUNGEN.map(id => ({ id, profileActive: true })),
    ...Array.from({ length: 9 }, (_, i) => ({ id: "fixture-" + i, profileActive: i < 5 }))];
  const profile = profiles.find(p => p.id === userId);
  const args = { userId, tag, commit, expectedCommit: commit, production: true, now: () => zeit,
    config: () => ({ production: true, commit, storageSupabase: true, v3Bereit: true,
      profileRelational: true, profileExclusive: true, kommunikationGesperrt: true,
      kohortenQuellenGesperrt: true, atomicLock: true,
      testKosten: { version: 2, aktiv: true, limitUsd: 4, unbekanntBleibtReserviert: true } }),
    storage: { assertTenant: id => A.equal(id, userId),
      listFullProfiles: async () => structuredClone(profiles),
      getProfile: async () => { reads++; return structuredClone(profile); } },
    get: async path => { A(/^(pipeline_locks|helmut_jobs|process_runs)\?select=/.test(path)); return []; },
    // Reale fuenf IDs bleiben privat. Nur die Unitfixture ersetzt die lokale
    // Abhaengigkeit; HTTP und Actions koennen keinen Zielpruefer uebergeben.
    pruefeZielbestand: rows => { A.deepEqual(rows, profiles); return rows.filter(p => p.profileActive).map(p => p.id).sort(); },
    build: async (p, id, opts) => { builds++; A.deepEqual(p, profile);
      A.deepEqual(opts, { aussagenEingabe: true, now: zeit });
      return { eingabe: { mandat: id, tag, eingabeHash: "f".repeat(64) },
        korrekturBasis: { kos: [] }, briefing: { items: [] } }; } };
  return { args, profiles, profile, counts: () => ({ reads, builds }) };
}
(async () => {
  const f = fixture(), r = await P.erfasse(f.args);
  A.deepEqual(f.counts(), { reads: 2, builds: 2 });
  A.equal(r.fachlicheFreigabe, false); A.equal(r.funktionsnachweis500, false);
  A.equal(r.modellaufrufe, 0); A.equal(r.schreibaufrufe, 0); A.equal(r.testende, P.ENDE);
  A.equal(r.transaktionalerSnapshot, false); A.equal(r.zielHash, P.ZIELHASH);
  A.throws(() => P.pruefeBestand(f.profiles), "Gleiche Anzahl mit fremden fuenf IDs reicht nicht");
  for (const mutate of [a => a.production = false, a => a.expectedCommit = "b".repeat(40),
    a => a.tag = "2026-09-16", a => a.now = () => new Date(P.ENDE),
    a => a.now = () => new Date(Date.parse(P.BEGINN) - 1), a => a.config = () => ({}),
    a => a.pruefeZielbestand = P.pruefeBestand]) {
    const x = fixture(); mutate(x.args); await A.rejects(P.erfasse(x.args)); A.equal(x.counts().builds, 0);
  }
  for (const table of ["pipeline_locks", "helmut_jobs", "process_runs"]) {
    const x = fixture(); x.args.get = async path => path.startsWith(table) ? [{}] : [];
    await A.rejects(P.erfasse(x.args)); A.equal(x.counts().builds, 0);
  }
  for (const mutate of [x => x.args.storage.getProfile = async () => ({ ...x.profile, profileActive: false }),
    x => x.args.build = async () => ({ ...r.result, eingabe: { ...r.result.eingabe, mandat: "fremd" } }),
    x => { let n = 0; x.args.build = async () => ({ ...r.result, drift: ++n }); },
    x => { let n = 0; x.args.storage.getProfile = async () => ({ ...x.profile, ...(++n > 1 ? { drift: true } : {}) }); },
    x => { let n = 0; x.args.now = () => ++n > 5 ? new Date(P.ENDE) : zeit; }]) {
    const x = fixture(); mutate(x); await A.rejects(P.erfasse(x.args));
  }
  console.log("5/5 aktive Aufnahmegruppen: feste Zielidentitaet, Zeit/Commit/Kostenkonfiguration, Konkurrenz, Drift und keine Fachfreigabe.");
})().catch(e => { console.error(e); process.exitCode = 1; });
