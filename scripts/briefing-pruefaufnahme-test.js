"use strict";
const A = require("node:assert/strict"), P = require("../lib/helmut/briefing-pruefaufnahme");
const commit = "a".repeat(40), userId = "test-kohorte-b-055", tag = "2026-09-15";
const zeit = new Date("2026-09-14T22:30:00Z");
function fixture() {
  let reads = 0, builds = 0;
  const profile = { id: userId, profileActive: false, committees: ["Haushaltsausschuss"] };
  const args = { userId, tag, commit, expectedCommit: commit, production: true, now: () => zeit,
    storage: { getProfile: async () => { reads++; return structuredClone(profile); } },
    build: async (p, id, opts) => {
      builds++; A.equal(id, userId); A.deepEqual(p, profile);
      A.deepEqual(opts, { aussagenEingabe: true, now: zeit });
      return { eingabe: { mandat: id, tag }, korrekturBasis: { kos: [] }, briefing: { items: [] } };
    } };
  return { args, profile, counts: () => ({ reads, builds }) };
}
(async () => {
  const f = fixture(), r = await P.erfasse(f.args);
  A.deepEqual(f.counts(), { reads: 2, builds: 1 });
  A.equal(r.art, "production-briefing-eingabe"); A.equal(r.productionCommit, commit);
  A.equal(r.reinLesend, true); A.equal(r.modellaufrufe, 0);
  A.equal(r.transaktionalerSnapshot, false); A.equal(r.fachlicheFreigabe, false);
  for (const mutate of [a => { a.expectedCommit = "b".repeat(40); }, a => { a.production = false; },
    a => { a.userId = "echtes-mandat"; }, a => { a.tag = "2026-09-14"; }, a => { a.commit = null; }]) {
    const f = fixture(); mutate(f.args); await A.rejects(P.erfasse(f.args));
    A.deepEqual(f.counts(), { reads: 0, builds: 0 });
  }
  for (const mutate of [p => { p.profileActive = true; }, p => { delete p.profileActive; },
    p => { p.id = "test-kohorte-b-056"; }]) {
    const f = fixture(); mutate(f.profile); await A.rejects(P.erfasse(f.args)); A.equal(f.counts().builds, 0);
  }
  const drift = fixture(); let n = 0;
  drift.args.storage.getProfile = async () => ({ ...drift.profile, committees: ++n === 1 ? [] : ["Anderer Ausschuss"] });
  drift.args.build = async () => r.result;
  await A.rejects(P.erfasse(drift.args));
  const day = fixture(); let t = 0; day.args.now = () => ++t === 1 ? zeit : new Date("2026-09-15T22:01:00Z");
  await A.rejects(P.erfasse(day.args));
  console.log("5/5 Aufnahmegruppen: Productionbindung, inaktive Kohorte, reiner Builder, Profil-/Tagesdrift und ehrliche Beleggrenze.");
})().catch(e => { console.error(e); process.exitCode = 1; });
