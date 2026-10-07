"use strict";
const A = require("node:assert/strict"), P = require("../lib/helmut/briefing-pruefaufnahme");
const commit = "a".repeat(40), userId = "test-kohorte-b-055", tag = "2026-09-15";
const zeit = new Date("2026-09-14T22:30:00Z");
const S = require("../lib/helmut/synthetik-500-profile");
function synthetischeProfile(variante = "basis-v1") {
  const rows = require("../lib/helmut/synthetik-500-import").erzeugeZeilen(S.erzeuge({ variante }));
  return rows.profileRows.map((row, i) => ({
    ...require("../lib/helmut/storage").fromMandateProfileRow(row, rows.mandateRows[i]),
    updatedAt: "2026-10-05T01:07:20.936627Z"
  }));
}
function synthetischeFixture(profile) {
  let reads = 0, builds = 0, writes = 0;
  const args = { userId: profile.id, tag, commit, expectedCommit: commit, production: true,
    now: () => zeit,
    storage: {
      getProfile: async () => { reads++; return structuredClone(profile); },
      saveProfile: async () => { writes++; throw Error("kein Writer erlaubt"); }
    },
    build: async (p, id, opts) => {
      builds++; A.deepEqual(p, profile); A.equal(id, profile.id);
      A.deepEqual(opts, { aussagenEingabe: true, now: zeit, quellenGebundelt: true });
      return { eingabe: { mandat: id, tag }, korrekturBasis: { kos: [] }, briefing: { items: [] } };
    } };
  return { args, counts: () => ({ reads, builds, writes }) };
}
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
  const alle = synthetischeProfile(), ebenen = {};
  for (const profile of alle) {
    const f = synthetischeFixture(profile), result = await P.erfasse(f.args);
    A.deepEqual(f.counts(), { reads: 2, builds: 1, writes: 0 });
    A.equal(result.profile.id, profile.id); A.equal(result.synthetisch, true);
    A.equal(result.modellaufrufe, 0); A.equal(result.schreibaufrufe, 0);
    A.equal(result.fachlicheFreigabe, false); A.equal(result.funktionsnachweis500, false);
    A.equal(result.all500InputAcceptance, false);
    ebenen[profile.parlament] = (ebenen[profile.parlament] || 0) + 1;
  }
  A.deepEqual(ebenen, { bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
  const quellenFehler = synthetischeFixture(alle[0]);
  quellenFehler.args.build = async (p, id, opts) => {
    A.equal(opts.quellenGebundelt, true); throw Error("pruefquellen-unvollstaendig");
  };
  await A.rejects(P.erfasse(quellenFehler.args), /pruefquellen-unvollstaendig/);
  A.equal(quellenFehler.counts().writes, 0);
  for (const parlament of Object.keys(ebenen)) {
    const f = synthetischeFixture(synthetischeProfile("kontrast-v1").find(p => p.parlament === parlament));
    await P.erfasse(f.args); A.deepEqual(f.counts(), { reads: 2, builds: 1, writes: 0 });
  }
  for (const id of ["test-kohorte-synthetik-bt-000", "test-kohorte-synthetik-bt-331",
    "test-kohorte-synthetik-be-121", "test-kohorte-synthetik-bb-051",
    "test-kohorte-synthetik-bt-001-extra", "test-kohorte-synthetik-bt-1", "fremdes-mandat"]) {
    const f = synthetischeFixture({ ...alle[0], id });
    await A.rejects(P.erfasse(f.args)); A.deepEqual(f.counts(), { reads: 0, builds: 0, writes: 0 });
  }
  for (const mutate of [p => { p.synthetisch = false; }, p => { delete p.synthetisch; },
    p => { p.fullName = "Realer Name"; }, p => { p.party = "AfD"; }, p => { p.faction = "AfD"; },
    p => { p.parlament = "landtag-berlin"; }, p => { p.politicalLevel = "Land"; },
    p => { p.herkunft.amtlicherPersonenbeleg = true; }, p => { p.herkunft.person = "real"; },
    p => { p.szenario.variante = "frei-erfunden"; }, p => { p.szenario.nummer = 2; },
    p => { p.profilHash = "0".repeat(64); }, p => { p.paketHash = "0".repeat(64); },
    p => { p.focusTopics = ["Reales Interessengebiet"]; }, p => { p.state = "Sachsen"; },
    p => { p.constituency = "Realer Wahlkreis"; }, p => { p.committees = ["Realer Ausschuss"]; },
    p => { p.publicPositions = ["Nicht deklarierte Position"]; }, p => { p.profileActive = true; }]) {
    const profile = structuredClone(alle[0]); mutate(profile);
    const f = synthetischeFixture(profile);
    await A.rejects(P.erfasse(f.args)); A.deepEqual(f.counts(), { reads: 1, builds: 0, writes: 0 });
  }
  const synthetikDrift = synthetischeFixture(alle[0]); let gelesen = 0;
  synthetikDrift.args.storage.getProfile = async () => ({ ...alle[0],
    updatedAt: ++gelesen === 1 ? alle[0].updatedAt : "2026-10-06T01:00:00Z" });
  await A.rejects(P.erfasse(synthetikDrift.args));
  console.log("9/9 Altgruppen; 500/500 neue inaktive Profile (330/120/50), drei Kontrastprofile, 7 ID-Grenzen, 19 Profilmanipulationen und synthetische Lesedrift: RO/kein Writer/keine fachliche Abnahme.");
})().catch(e => { console.error(e); process.exitCode = 1; });
