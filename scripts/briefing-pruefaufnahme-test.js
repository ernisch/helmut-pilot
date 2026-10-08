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

  // Begrenzte Blocker-2-Wiederaufnahme: genau ein zweiter build()-Versuch im
  // selben Eingabeabruf, nur fuer den streng erkannten echten gebuendelten
  // Quellen-Supabase-Timeout des geschlossenen Synthetiknachweises.
  const quellenTimeout = (ms = 15000) => Error(
    `Supabase storage timed out after ${ms}ms: /rest/v1/knowledge_objects?id=in.(synthetik-000)&select=id,source_kanten`);
  const getterBombe = {};
  Object.defineProperty(getterBombe, "message", { get() { throw Error("hostile"); } });
  const getterNameBombe = quellenTimeout();
  Object.defineProperty(getterNameBombe, "name", { get() { throw Error("hostile name"); } });
  const getterCodeBombe = quellenTimeout();
  Object.defineProperty(getterCodeBombe, "code", { get() { throw Error("hostile code"); } });
  function synthetikRetryFixture(profile, fehlerfolge, erfolg) {
    let reads = 0, builds = 0, writes = 0;
    const args = { userId: profile.id, tag, commit, expectedCommit: commit, production: true,
      now: () => zeit,
      storage: {
        getProfile: async () => { reads++; return structuredClone(profile); },
        saveProfile: async () => { writes++; throw Error("kein Writer erlaubt"); }
      },
      build: async (p, id, opts) => {
        builds++;
        A.deepEqual(p, profile); A.equal(id, profile.id);
        A.deepEqual(opts, { aussagenEingabe: true, now: zeit, quellenGebundelt: true });
        const fehler = fehlerfolge[builds - 1];
        if (fehler) throw fehler;
        return erfolg ? erfolg(id, builds)
          : { eingabe: { mandat: id, tag }, korrekturBasis: { kos: [] }, briefing: { items: [] } };
      } };
    return { args, counts: () => ({ reads, builds, writes }) };
  }
  const retryProfil = alle[0];
  const basis = synthetischeFixture(retryProfil);
  const basisErfolg = await P.erfasse(basis.args);
  const transient = synthetikRetryFixture(retryProfil, [quellenTimeout(15000)]);
  const transientErfolg = await P.erfasse(transient.args);
  A.deepEqual(transient.counts(), { reads: 2, builds: 2, writes: 0 });
  A.deepEqual(transientErfolg.leseWiederaufnahme, { version: "blocker2-read-resume/1",
    phase: "briefing-aufbauen", art: "speicher-timeout", versuche: 2 });
  A.equal(transientErfolg.all500InputAcceptance, false);
  A.equal(transientErfolg.fachlicheFreigabe, false);
  const { leseWiederaufnahme: _wiederaufnahme, ...transientRest } = transientErfolg;
  A.deepEqual(transientRest, basisErfolg);
  const zweiterTimeout = quellenTimeout(12000);
  const doppelTimeout = synthetikRetryFixture(retryProfil, [quellenTimeout(15000), zweiterTimeout]);
  await A.rejects(P.erfasse(doppelTimeout.args), e => e === zweiterTimeout);
  A.deepEqual(doppelTimeout.counts(), { reads: 1, builds: 2, writes: 0 });
  const zweiterQuellenfehler = Error("pruefquellen-unvollstaendig");
  const zweiterQuellen = synthetikRetryFixture(retryProfil, [quellenTimeout(15000), zweiterQuellenfehler]);
  await A.rejects(P.erfasse(zweiterQuellen.args), e => e === zweiterQuellenfehler);
  A.equal(zweiterQuellen.counts().builds, 2);
  const zweiteAssertion = Object.assign(Error("schutz-widerspruch"), { code: "ERR_ASSERTION" });
  const assertionZweit = synthetikRetryFixture(retryProfil, [quellenTimeout(15000), zweiteAssertion]);
  await A.rejects(P.erfasse(assertionZweit.args), e => e === zweiteAssertion);
  A.equal(assertionZweit.counts().builds, 2);
  const negativ = [
    ["bare-abort", Object.assign(Error("aborted"), { name: "AbortError" })],
    ["deadline-exceeded", Error("Supabase request deadline exceeded after 15000ms")],
    ["profil-timeout", Error("Supabase storage timed out after 15000ms: /rest/v1/profiles?id=eq.x")],
    ["frist-null", quellenTimeout(0)],
    ["frist-zu-gross", quellenTimeout(20001)],
    ["fremder-endpoint", Error("Supabase storage timed out after 15000ms: /rest/v1/knowledge_objects?id=eq.a")],
    ["fremder-prefix", Error("Supabase storage timed out after 15000ms")],
    ["http-401", Error("Supabase storage failed (401): /rest/v1/knowledge_objects")],
    ["http-403", Error("Supabase storage failed (403): /rest/v1/knowledge_objects")],
    ["http-429", Error("Supabase storage failed (429): /rest/v1/knowledge_objects")],
    ["http-500", Error("Supabase storage failed (500): /rest/v1/knowledge_objects")],
    ["http-503", Error("Supabase storage failed (503): /rest/v1/knowledge_objects")],
    ["assertion", Object.assign(Error("schutz"), { code: "ERR_ASSERTION" })],
    ["source-unvollstaendig", Error("pruefquellen-unvollstaendig")],
    ["hostile-getter", getterBombe],
    ["valid-timeout-hostile-name-getter", getterNameBombe],
    ["valid-timeout-hostile-code-getter", getterCodeBombe],
    ["primitiv-string", "boom"],
    ["primitiv-zahl", 42]
  ];
  for (const [name, fehler] of negativ) {
    const f = synthetikRetryFixture(retryProfil, [fehler]);
    let geworfen = null, hatGeworfen = false;
    try { await P.erfasse(f.args); } catch (e) { hatGeworfen = true; geworfen = e; }
    A.equal(hatGeworfen, true, `muss scheitern: ${name}`);
    A.equal(geworfen, fehler, `Identitaet erhalten: ${name}`);
    A.equal(f.counts().builds, 1, `genau ein build: ${name}`);
  }
  const nichtSynthetik = fixture("cem-ince");
  let nichtSynthetikBuilds = 0;
  nichtSynthetik.args.build = async () => { nichtSynthetikBuilds++; throw quellenTimeout(15000); };
  await A.rejects(P.erfasse(nichtSynthetik.args));
  A.equal(nichtSynthetikBuilds, 1);
  const tageswechsel = synthetikRetryFixture(retryProfil, [quellenTimeout(15000)]);
  let tagZaehler = 0;
  tageswechsel.args.now = () => (++tagZaehler === 1 ? zeit : new Date("2026-09-15T22:01:00Z"));
  await A.rejects(P.erfasse(tageswechsel.args));
  A.deepEqual(tageswechsel.counts(), { reads: 1, builds: 1, writes: 0 });
  const driftNachRetry = synthetikRetryFixture(retryProfil, [quellenTimeout(15000)]);
  let driftLesen = 0;
  driftNachRetry.args.storage.getProfile = async () => {
    const kopie = structuredClone(retryProfil);
    if (++driftLesen === 2) kopie.updatedAt = "2026-10-06T01:00:00Z";
    return kopie;
  };
  await A.rejects(P.erfasse(driftNachRetry.args));
  A.equal(driftLesen, 2); A.equal(driftNachRetry.counts().builds, 2);
  const vertragsdrift = synthetikRetryFixture(retryProfil, [quellenTimeout(15000)],
    () => ({ eingabe: { mandat: "fremdes-mandat", tag }, korrekturBasis: { kos: [] }, briefing: { items: [] } }));
  await A.rejects(P.erfasse(vertragsdrift.args));
  A.deepEqual(vertragsdrift.counts(), { reads: 1, builds: 2, writes: 0 });

  // Belegter anderer Fehlerort: erster relationaler Profil-GET. Genau ein
  // zusaetzlicher Leseversuch insgesamt, niemals ein zweites Retry-Budget.
  const profilTimeout = (id = retryProfil.id, ms = 10000, suffix = "") => Error(
    `Supabase storage timed out after ${ms}ms: /rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=*,mandate_profiles(*)&limit=1${suffix}`);
  function profilRetryFixture(fehlerfolge, aendereProfil) {
    const f = synthetischeFixture(retryProfil);
    let reads = 0;
    f.args.storage.getProfile = async () => {
      const index = reads++;
      if (index < fehlerfolge.length) throw fehlerfolge[index];
      const p = structuredClone(retryProfil);
      if (aendereProfil) aendereProfil(p, reads);
      return p;
    };
    return { args: f.args, reads: () => reads, counts: f.counts };
  }
  const profilTransient = profilRetryFixture([profilTimeout()]);
  const profilErfolg = await P.erfasse(profilTransient.args);
  A.equal(profilTransient.reads(), 3); A.equal(profilTransient.counts().builds, 1);
  A.equal(profilTransient.counts().writes, 0);
  A.deepEqual(profilErfolg.leseWiederaufnahme, { version: "blocker2-read-resume/1",
    phase: "profil-vorher-lesen", art: "speicher-timeout", versuche: 2 });
  const { leseWiederaufnahme: _profilQuittung, ...profilRest } = profilErfolg;
  A.deepEqual(profilRest, basisErfolg);
  const profilLetzterFehler = profilTimeout();
  const profilDoppelt = profilRetryFixture([profilTimeout(), profilLetzterFehler]);
  await A.rejects(P.erfasse(profilDoppelt.args), e => e === profilLetzterFehler);
  A.equal(profilDoppelt.reads(), 2); A.equal(profilDoppelt.counts().builds, 0);
  A.deepEqual(P.fehlerDiagnose(profilLetzterFehler), { version: "blocker2-briefing-read-diagnostic/1",
    phase: "profil-vorher-lesen", art: "speicher-timeout" });
  const profilGetterFehler = ["name", "code", "message"].map(key => {
    const e = profilTimeout(); Object.defineProperty(e, key, { get() { throw Error("hostile"); } }); return e;
  });
  for (const e of [profilTimeout("fremdes-profil"), profilTimeout(retryProfil.id, 0),
    profilTimeout(retryProfil.id, -1), profilTimeout(retryProfil.id, 10001),
    profilTimeout(retryProfil.id, 10000, "&extra=1"), profilTimeout(retryProfil.id, 10000, "\n"),
    Error("Supabase storage timed out after 10000ms: /rest/v1/profiles?id=eq.x"),
    quellenTimeout(), ...profilGetterFehler,
    Object.assign(profilTimeout(), { name: "AbortError" }),
    Object.assign(profilTimeout(), { code: "ERR_ASSERTION" }),
    ...[401, 403, 429, 500, 503].map(status => Error(`Supabase storage failed (${status}): /rest/v1/profiles`)),
    Error("Supabase request deadline exceeded"), "primitive", 42]) {
    const f = profilRetryFixture([e]);
    await A.rejects(P.erfasse(f.args), got => got === e);
    A.equal(f.reads(), 1); A.equal(f.counts().builds, 0);
  }
  for (const id of ["cem-ince", userId]) {
    const f = fixture(id); let reads = 0; const e = profilTimeout(id);
    f.args.storage.getProfile = async () => { reads++; throw e; };
    await A.rejects(P.erfasse(f.args), got => got === e); A.equal(reads, 1);
  }
  for (const mutate of [p => { p.profileActive = true; }, p => { p.id = "fremdes-profil"; },
    p => { p.fullName = "Nicht synthetisch"; }, p => { p.focusTopics = ["Manipuliert"]; }]) {
    const f = profilRetryFixture([profilTimeout()], mutate);
    await A.rejects(P.erfasse(f.args)); A.equal(f.reads(), 2); A.equal(f.counts().builds, 0);
  }
  const profilTagwechsel = profilRetryFixture([profilTimeout()]); let profilUhr = 0;
  profilTagwechsel.args.now = () => (++profilUhr === 1 ? zeit : new Date("2026-09-15T22:01:00Z"));
  await A.rejects(P.erfasse(profilTagwechsel.args)); A.equal(profilTagwechsel.reads(), 1);
  const budgetVerbraucht = profilRetryFixture([profilTimeout()]); let budgetBuilds = 0;
  const keinZweitesBudget = quellenTimeout();
  budgetVerbraucht.args.build = async () => { budgetBuilds++; throw keinZweitesBudget; };
  await A.rejects(P.erfasse(budgetVerbraucht.args), e => e === keinZweitesBudget);
  A.equal(budgetBuilds, 1); A.equal(budgetVerbraucht.reads(), 2);
  const profilFinalDrift = profilRetryFixture([profilTimeout()], (p, n) => {
    if (n === 3) p.updatedAt = "2026-10-06T01:00:00Z";
  });
  await A.rejects(P.erfasse(profilFinalDrift.args)); A.equal(profilFinalDrift.reads(), 3);
  const profilNachherFehler = profilRetryFixture([profilTimeout()]); let nachherReads = 0;
  const abschliessenderFehler = profilTimeout();
  profilNachherFehler.args.storage.getProfile = async () => {
    if (++nachherReads === 1) throw profilTimeout();
    if (nachherReads === 3) throw abschliessenderFehler;
    return structuredClone(retryProfil);
  };
  await A.rejects(P.erfasse(profilNachherFehler.args), e => e === abschliessenderFehler);
  A.equal(nachherReads, 3);
  A.equal(P.fehlerDiagnose(abschliessenderFehler).phase, "profil-nachher-lesen");

  console.log("9/9 Altgruppen; 500/500 neue inaktive Profile (330/120/50), Kontrast- und Schutzproben, genau ein gemeinsames Blocker-2-Wiederaufnahmebudget: RO/kein Writer/keine fachliche Abnahme.");
})().catch(e => { console.error(e); process.exitCode = 1; });
