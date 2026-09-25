"use strict";
const A = require("node:assert/strict"), P = require("../lib/helmut/briefing-pruefaufnahme");
const commit = "a".repeat(40), userId = "test-kohorte-b-055", tag = "2026-09-15";
const zeit = new Date("2026-09-14T22:30:00Z");
function fixture(userId = "test-kohorte-b-055") {
  let reads = 0, builds = 0, lageReads = 0;
  const profile = { id: userId, profileActive: false, committees: ["Haushaltsausschuss"] };
  const args = { userId, tag, commit, expectedCommit: commit, production: true, now: () => zeit,
    storage: { getProfile: async () => { reads++; return structuredClone(profile); } },
    leseLage: async (p, opts) => {
      lageReads++; A.deepEqual(p, profile);
      A.deepEqual(opts, { politicianId: userId, cacheOnly: true });
      return { available: true, demo: false, pendingNarrative: true, paragraphs: [],
        vorgaenge: [{ id: "echte-auswahl" }] };
    },
    build: async (p, id, opts) => {
      builds++; A.equal(id, userId); A.deepEqual(p, profile);
      A.deepEqual(opts, { aussagenEingabe: true, now: zeit });
      return { eingabe: { mandat: id, tag }, korrekturBasis: { kos: [] }, briefing: { items: [] } };
    } };
  return { args, profile, counts: () => ({ reads, builds }), lageReads: () => lageReads };
}
(async () => {
  const f = fixture(), r = await P.erfasse(f.args);
  A.deepEqual(f.counts(), { reads: 2, builds: 1 });
  A.equal(r.art, "production-briefing-eingabe"); A.equal(r.productionCommit, commit);
  A.equal(r.reinLesend, true); A.equal(r.modellaufrufe, 0);
  A.equal(r.transaktionalerSnapshot, false); A.equal(r.fachlicheFreigabe, false);
  A.equal(f.lageReads(), 0); A.equal(r.lageAnsicht, undefined);
  const cem = fixture("cem-ince"), cemResult = await P.erfasse(cem.args);
  A.equal(cemResult.profile.id, "cem-ince");
  A.equal(cemResult.modellaufrufe, 0); A.equal(cemResult.reinLesend, true);
  A.deepEqual(cem.counts(), { reads: 2, builds: 1 });
  A.equal(cem.lageReads(), 1); A.equal(cemResult.gespeichertesGesamtpaket, false);
  A.equal(cemResult.lageAnsicht.pendingNarrative, true);
  A.equal(cemResult.result.eingabe.mandat, "cem-ince");
  A.equal(cemResult.result.briefing.lageBriefing, undefined);
  for (const lage of [undefined, { demo: true, paragraphs: [], vorgaenge: [] },
    { demo: false, paragraphs: [], vorgaenge: null }]) {
    const x = fixture("cem-ince"); x.args.leseLage = async () => lage;
    await A.rejects(P.erfasse(x.args));
  }
  const lageDrift = fixture("cem-ince");
  lageDrift.args.leseLage = async () => {
    lageDrift.profile.committees = ["Anderer Ausschuss"];
    return { demo: false, paragraphs: [], vorgaenge: [] };
  };
  await A.rejects(P.erfasse(lageDrift.args));
  const lageFehler = fixture("cem-ince");
  lageFehler.args.leseLage = async () => { throw Error("Lesefehler"); };
  await A.rejects(P.erfasse(lageFehler.args), /Lesefehler/);
  const cemAktiv = fixture("cem-ince"); cemAktiv.profile.profileActive = true;
  await A.rejects(P.erfasse(cemAktiv.args)); A.equal(cemAktiv.counts().builds, 0);
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
  console.log("9/9 Aufnahmegruppen: Productionbindung, inaktive Kohorte/Cem, lesende Lage-Auswahl, Demo-/Lesefehler, Profil-/Tagesdrift und ehrliche Beleggrenze.");
})().catch(e => { console.error(e); process.exitCode = 1; });
