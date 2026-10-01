"use strict";

// Neues Runtime-Raster. Nur synthetische Belege und injizierte Transporte;
// kanonische oeffentliche IDs sind Testabbilder, keine aktivierten Kunden.
const A = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const V = require("../lib/helmut/realkohorte-500-vertrag");
const E = require("./realkohorte-500-erwartungen");
const S = require("../lib/helmut/realkohorte-500-startschutz");
const L = require("../lib/helmut/realkohorte-500-ergebnisleser");
const K = require("../lib/helmut/testkosten-budget");
const bytes = fs.readFileSync(path.join(__dirname, "../daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json"));
const paket = V.pruefePaket(bytes);
const clone = value => structuredClone(value);
const COMMIT = "c".repeat(40);
const NOW = Date.parse("2026-10-01T10:01:00.000Z");
const ref = name => ({ referenz: "synthetische-offline-fixture:" + name, sha256: "a".repeat(64) });

function fixture({ snapshot = null, day = "2026-10-01", operationId = "real500-runtime-offline-20261001" } = {}) {
  snapshot ||= { beobachtetAm: day + "T10:00:30.000Z",
    mandate_profiles: paket.profile.map(p => ({ user_id: p.mandatsId, aktiv: false, geloescht_at: null,
      updated_at: day + "T10:00:00.000Z", partei: p.partei || null,
      fraktion: p.fraktion || (p.fraktionslos ? "Fraktionslos" : p.partei || null),
      inhalt: { synthetischesTestabbild: true, fachfeld: "unveraendert" } })),
    profiles: [...paket.profile.map(p => ({ id: p.mandatsId, name: p.vollname, inhalt: { synthetischesTestabbild: true } })),
      { id: "real500-runtime-offline-fremdprofil", name: "Synthetisches Fremdprofil", inhalt: { unveraendert: true } }] };
  const manifest = V.vorbereiten({ paketBytes: bytes, snapshot, operationId,
    vorflugAm: day + "T10:00:30.000Z", startBis: day + "T10:05:00.000Z", endeAm: day + "T22:00:00.000Z",
    kosten: { tag: day, beobachtetAm: day + "T10:00:30.000Z", tageslimitMikroUsd: 6000000, auftragslimitMikroUsd: 7000000,
      tagVerbrauchtMikroUsd: 1000000, tagReserviertMikroUsd: 0, auftragVerbrauchtMikroUsd: 4000000,
      auftragReserviertMikroUsd: 0, restreserveMikroUsd: 3000000, laufreserveMikroUsd: 2000000 } });
  const quittung = { version: V.VERSION, operationId, manifest: clone(manifest), zustand: "aktiv",
    aktiviertAm: day + "T10:01:00.000Z", bestaetigtAktiv: 500 };
  return { snapshot, manifest, quittung, grund: "notstopp" };
}

function belegFixture(f = fixture()) {
  const day = f.manifest.vorflugAm.slice(0, 10), am = day + "T10:00:30.000Z";
  const auth = { [K.KEY]: { [day]: { version: K.VERSION, day, tarif: "azure-gpt5-mini-obergrenze-20260909",
    limit: 6000000, spent: 1000000, baseline: 1000000, baselineCalls: 1, manualCalls: 0,
    manualUntil: null, calls: {}, frozen: null } },
  [K.AUFTRAG_KEY]: { version: 3, id: "synthetischer-real500-testauftrag", abTag: day, limit: 7000000, externGebunden: 3000000 } };
  const fach = art => ({ art, entscheidungId: "synthetische-entscheidung-" + art, aussteller: "Synthetische qualifizierte Testinstanz",
    qualifikation: "Nur Testabbild einer dokumentierten Qualifikation, keine echte Freigabe", entschiedenAm: am,
    paketHash: V.PAKET_HASH, idsHash: V.IDS_HASH, entscheidung: "fachlich-bestaetigt", primaerbelege: [ref(art)] });
  return {
    phaseA: fach("phase-a-art6-art9-dsfa-datenfluesse-loeschgrenzen"),
    fach: fach("500-vorab-erwartungen-und-versorgungsabnahme"),
    production: { beobachtetAm: am, mainCommit: COMMIT, productionCommit: COMMIT, deploymentId: "dpl_SyntheticRuntimeFixture",
      status: "READY", primaerbeleg: ref("production"), laufzeit: { ok: true, reinLesend: true, commit: COMMIT,
        storageSupabase: true, v3Bereit: true, profileRelational: true, profileExclusive: true,
        kommunikationGesperrt: true, testKosten: K.konfiguration({ VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt" }) } },
    ruhe: { beobachtetAm: am, authHash: V.hash(auth), mainHash: "b".repeat(64), offeneJobs: 0,
      lebendeLocks: 0, lebendeLeases: 0, laufendeProzesse: 0, primaerbeleg: ref("ruhe") },
    kosten: { beobachtetAm: am, auth, counter: { ok: true, used: 1 }, primaerbeleg: ref("kosten") },
    landesversorgung: { beobachtetAm: am, productionCommit: COMMIT, wirksameFlags: { landesmodul: true, berlin: true, brandenburg: true },
      nachrichtenfenster: { vonTag: "2026-09-20", bisTag: day, primaerbeleg: ref("vorab-nachrichtenfenster") },
      berlin: { artikelHash: "a".repeat(64), sichtbareAusgabeHash: "b".repeat(64), publikationstag: day, publishedAt: null, primaerbeleg: ref("berlin") },
      brandenburg: { artikelHash: "c".repeat(64), sichtbareAusgabeHash: "d".repeat(64), publikationstag: "2026-09-25", publishedAt: null, primaerbeleg: ref("brandenburg") },
      primaerbeleg: ref("landesversorgung") },
    endwaechter: { jobId: "123456", operationId: f.manifest.operationId, manifestHash: V.hash(f.manifest),
      productionCommit: COMMIT, beobachtetAm: am, zustand: "bereit-lesend", rpcHash: "f".repeat(64), primaerbeleg: ref("endwaechter") }
  };
}

function auftrag(f = fixture(), grund = "notstopp") {
  return { operationId: f.manifest.operationId, manifestHash: V.hash(f.manifest), productionCommit: COMMIT, grund };
}
function statusFixture(f = fixture(), zustand = "aktiv", aktiv = 500) {
  return { version: "helmut-realkohorte500-status/1", operationId: f.manifest.operationId, manifestHash: V.hash(f.manifest),
    profilManifestHash: V.hash(f.manifest),
    productionCommit: COMMIT, paketHash: V.PAKET_HASH, idsHash: V.IDS_HASH, beobachtetAm: "2026-10-01T10:01:30.000Z",
    zustand, gesamt: 500, identitaeten: 501, aktiv, fremdUnveraendert: true, fachfelderUnveraendert: true,
    quittungBindungBestaetigt: true, endeAm: f.manifest.endeAm };
}

let pass = 0, fail = 0;
const filter = process.env.REAL500_RUNTIME_TEST_FILTER ? new RegExp(process.env.REAL500_RUNTIME_TEST_FILTER) : null;
async function test(name, fn) {
  if (filter && !filter.test(name)) return;
  try { await fn(); pass++; console.log("PASS " + name); }
  catch (error) { fail++; console.log("FAIL " + name + " — " + error.message); }
}

async function main() {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("real500-offline-netz-verboten"); };
  try {
    const G = require("./realkohorte-500-start-sql");
    function generatorFixture() {
      const f = fixture(); f.manifest.endeAm = "2026-10-01T12:00:00.000Z"; f.quittung.manifest = clone(f.manifest);
      const full = belegFixture(f), { endwaechter, ...belege } = full;
      const runtimeManifest = G.baueRuntimeManifest({ ...f, belege }, bytes, NOW);
      full.endwaechter.manifestHash = V.hash(runtimeManifest);
      const aktivierungsGo = { version: "helmut-real500-aktivierungs-go/1", operationId: f.manifest.operationId,
        manifestHash: V.hash(runtimeManifest), productionCommit: COMMIT,
        aktion: "EXAKT_500_REALPROFILE_AKTIVIEREN_UND_TEST_STARTEN", freigegebenAm: new Date(NOW).toISOString(),
        aussteller: "Synthetische Offline-GO-Fixture, keine Betreiberfreigabe", primaerbeleg: ref("separates-aktivierungs-go") };
      return { f, belege, full, runtimeManifest, aktivierungsGo,
        prepare: { runtimeManifest, snapshot: f.snapshot, belege, schritt: "vorbereiten", aktivierungsGo: null },
        activate: { runtimeManifest, snapshot: f.snapshot, belege: full, schritt: "aktivieren", aktivierungsGo } };
    }
    await test("Neuer Startgenerator: echte Startschutzgrundlinie erzeugt prepared0 ohne aliveWatch/Aktivierungsrecht", () => {
      const x = generatorFixture(), checked = S.pruefeVorbereitung({ ...x.f, belege: x.belege }, bytes, NOW);
      A.deepEqual(x.runtimeManifest.startbelegeGrundlinie, checked.startbelegeGrundlinie);
      const e = G.baueEnvelope(x.prepare, bytes, NOW), sql = G.baueSql(x.prepare, bytes, NOW);
      A.equal(e.zustand, "vorbereitet"); A.equal(e.quittung, null);
      A.equal(e.startbelege.endwaechterBereit, null); A.equal(e.startbelege.aktivierungsGo, null);
      A.equal(e.manifestHash, V.hash(x.runtimeManifest)); A.equal(e.manifest.profilManifestHash, V.hash(x.f.manifest));
      A.equal(x.f.snapshot.mandate_profiles.filter(p => p.aktiv).length, 0);
      A.doesNotMatch(sql, /update public\.mandate_profiles|set aktiv=true/);
      A.match(sql, /insert into public\.helmut_store\(id,data\)/);
      A.match(sql, /operation-bereits-verwendet/); A.match(sql, /perform helmut_real500_internal\.pruefe/);
      A.equal(checked.aktivierungsrecht, false);
    });
    await test("Neuer Startgenerator: fehlende PhaseA/Qualifikation/Primaerreferenz verweigert jeden Plan", () => {
      for (const mutate of [b => { delete b.phaseA; }, b => { b.phaseA = true; },
        b => { b.phaseA.qualifikation = ""; }, b => { b.fach.primaerbelege = []; }]) {
        const x = generatorFixture(); mutate(x.belege);
        A.throws(() => G.baueRuntimeManifest({ ...x.f, belege: x.belege }, bytes, NOW), /startschutz-/);
      }
    });
    await test("Neuer Startgenerator: Aktivsql ohne separatesGO/mitBooleanGO verweigert; Vorbereitung hat keinGO", () => {
      const x = generatorFixture();
      for (const go of [undefined, null, true, { freigegeben: true }]) {
        const input = { ...x.activate, aktivierungsGo: go };
        A.throws(() => G.baueEnvelope(input, bytes, NOW), /separates-aktivierungs-go-fehlt/);
        A.throws(() => G.baueSql(input, bytes, NOW), /separates-aktivierungs-go-fehlt/);
      }
      A.throws(() => G.baueSql({ ...x.prepare, aktivierungsGo: x.aktivierungsGo }, bytes, NOW), /vorbereitung-kein-aktivierungsrecht/);
    });
    await test("Neuer Startgenerator: Livebindung+exaktesGO erzeugt atomaren500CAS und geschlossenen SLOT-CAS", () => {
      const x = generatorFixture(), e = G.baueEnvelope(x.activate, bytes, NOW), sql = G.baueSql(x.activate, bytes, NOW);
      A.equal(e.startbelege.aktivierungsGo.belegHash, V.hash(x.aktivierungsGo));
      A.equal(e.startbelege.endwaechterBereit.manifestHash, V.hash(x.runtimeManifest));
      A.equal(e.startbelege.qualifizierteRechtsfreigabe.belegHash, x.runtimeManifest.startbelegeGrundlinie.phaseAHash);
      A.equal(e.startbelege.fachfreigabe.belegHash, x.runtimeManifest.startbelegeGrundlinie.fachHash);
      A.equal(e.zustand, "vorbereitet"); A.equal(e.quittung, null, "Plan ist keine angewandte Aktivquittung");
      A.match(sql, /update public\.mandate_profiles set aktiv=true/); A.match(sql, /and aktiv=false/);
      A.match(sql, /if n<>500 or \(select count\(\*\) from public\.mandate_profiles where aktiv\)<>500/);
      A.match(sql, /vorher->>'zustand' is distinct from 'vorbereitet'/);
      A.match(sql, /where id='realkohorte500-runtime-[^']+' and data=vorher/);
      A.match(sql, /if n<>1 then raise exception 'real500-startsql-aktiv-cas'/);
      A.match(sql, /share row exclusive mode/); A.match(sql, /auth-main-veraendert/);
      A.match(sql, /^--[\s\S]*\nbegin;[\s\S]*\ncommit;\n$/);
    });
    await test("Neuer Startgenerator: falscher OuterGO/Commit/Operation/Aktion sowie altesGO bleiben gesperrt", () => {
      for (const mutate of [g => { g.manifestHash = "0".repeat(64); }, g => { g.productionCommit = "d".repeat(40); },
        g => { g.operationId += "-fremd"; }, g => { g.aktion = "TEST_GO"; },
        g => { g.freigegebenAm = "2026-10-01T09:00:00.000Z"; }]) {
        const x = generatorFixture(); mutate(x.aktivierungsGo);
        A.throws(() => G.baueSql(x.activate, bytes, NOW), /separates-aktivierungs-go-fehlt|beleg-veraltet/);
      }
      const x = generatorFixture(); x.full.endwaechter.manifestHash = V.hash(x.f.manifest);
      A.throws(() => G.baueSql(x.activate, bytes, NOW), /live-endwaechter-fehlt/);
    });
    await test("Neuer Startgenerator: mehr als4h erzeugt weder vorbereitenden noch aktiven SQL-Plan", () => {
      const f = fixture(), { endwaechter, ...belege } = belegFixture(f);
      A.throws(() => G.baueRuntimeManifest({ ...f, belege }, bytes, NOW), /endwaechter-zeitfenster/);
      const base = S.pruefeVorbereitung({ ...f, belege }, bytes, NOW).startbelegeGrundlinie;
      const runtimeManifest = { version: G.MANIFEST_VERSION, profilManifestHash: V.hash(f.manifest),
        profilvertrag: f.manifest, startbelegeGrundlinie: base };
      for (const schritt of ["vorbereiten", "aktivieren"]) A.throws(() => G.baueSql({ runtimeManifest,
        snapshot: f.snapshot, belege, schritt }, bytes, NOW), /endwaechter-zeitfenster/);
    });
    await test("Neuer Startgenerator: akzeptierter Fremdtext Dollarquote bleibt Daten; private CLI-Datei0600 ohneSQL-stdout", () => {
      const x = generatorFixture(), marker = "O'Brien $real500_start$ $real500_start_1$\\n'; commit; -- nur synthetischer Text";
      x.f.snapshot.profiles.find(p => p.id === "real500-runtime-offline-fremdprofil").name = marker;
      const m = x.f.manifest;
      x.f.manifest = V.vorbereiten({ paketBytes: bytes, snapshot: x.f.snapshot, operationId: m.operationId,
        vorflugAm: m.vorflugAm, startBis: m.startBis, endeAm: m.endeAm, kosten: m.kosten });
      x.runtimeManifest = G.baueRuntimeManifest({ ...x.f, belege: x.belege }, bytes, NOW);
      const input = { ...x.prepare, runtimeManifest: x.runtimeManifest };
      const sql = G.baueSql(input, bytes, NOW);
      A.ok(sql.includes("do $real500_start_2$"), "DO-Tag muss beide belegten Datenkollisionen umgehen");
      A.ok(sql.includes("$real500_start_2$;\ncommit;"));
      A.ok(sql.includes("O''Brien"), "SQL-Stringliteral muss Apostroph escapen");
      A.equal(sql.split("\ncommit;").length - 1, 1, "Fremdtext darf keine weitere Commit-Anweisung bilden");
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real500-startsql-test-"));
      try {
        const inPath = path.join(dir, "input.json"), outPath = path.join(dir, "private.sql");
        fs.writeFileSync(inPath, JSON.stringify(input), { mode: 0o600 });
        const originalNow = Date.now, originalLog = console.log, logs = [];
        try {
          Date.now = () => NOW; console.log = (...args) => logs.push(args.join(" "));
          G.main(["--input", inPath, "--out", outPath]);
        } finally { Date.now = originalNow; console.log = originalLog; }
        const stdout = logs.join("\n");
        A.equal(fs.statSync(outPath).mode & 0o777, 0o600); A.equal(fs.readFileSync(outPath, "utf8"), sql);
        A.match(stdout, /0600/); A.doesNotMatch(stdout, /insert into|update public|mandate_profiles|O'Brien|profilvertrag/);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    await test("Neue Startpfadregression: fremder echter Git-Verweis/HEAD und Symlink werden vor Datei-Oeffnung gesperrt", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "real500-startsql-path-test-"));
      const root = path.resolve(__dirname, ".."), localGit = path.join(root, ".git");
      const actualGit = fs.statSync(localGit).isDirectory() ? localGit
        : path.resolve(root, fs.readFileSync(localGit, "utf8").trim().replace(/^gitdir:\s*/, ""));
      A.ok(fs.existsSync(path.join(actualGit, "HEAD")), "Verweis muss an echte vorhandene Gitmetadaten gebunden sein");
      try {
        const foreign = path.join(dir, "anderer-worktree"), headRoot = path.join(dir, "anderes-repository");
        fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, ".git"), "gitdir: " + actualGit + "\n");
        fs.mkdirSync(path.join(headRoot, ".git"), { recursive: true });
        fs.writeFileSync(path.join(headRoot, ".git", "HEAD"), fs.readFileSync(path.join(actualGit, "HEAD")));
        fs.symlinkSync(foreign, path.join(dir, "symlink-zum-worktree"));
        const originalOpen = fs.openSync; let opens = 0;
        try {
          fs.openSync = () => { opens++; throw new Error("Dateioeffnung durfte nicht erreicht werden"); };
          for (const parent of [foreign, headRoot, path.join(dir, "symlink-zum-worktree"), root])
            A.throws(() => G.schreibePrivat(path.join(parent, "private-runtime-fixture.sql"), "synthetischer Test"), /ausgabe-im-repository/);
        } finally { fs.openSync = originalOpen; }
        A.equal(opens, 0); A.equal(fs.existsSync(path.join(foreign, "private-runtime-fixture.sql")), false);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
    await test("Neue Bridge: vorbereitete Grundlinie ohne aliveWatch; Aktivstruktur nur mit aeusserer Watchbindung", () => {
      const f = fixture(), full = belegFixture(f), { endwaechter, ...belege } = full;
      const prepared = S.pruefeVorbereitung({ ...f, belege }, bytes, NOW);
      A.equal(prepared.aliveWatchErforderlich, false); A.equal(prepared.starttorFreigegeben, false);
      const runtimeManifest = { version: "helmut-realkohorte500-runtime-manifest/1", profilManifestHash: V.hash(f.manifest),
        profilvertrag: f.manifest, startbelegeGrundlinie: prepared.startbelegeGrundlinie };
      const bound = S.pruefeRuntimeVorbereitung({ runtimeManifest, snapshot: f.snapshot, belege }, bytes, NOW);
      A.equal(bound.manifestHash, V.hash(runtimeManifest)); A.equal(bound.profilManifestHash, V.hash(f.manifest));
      A.notEqual(bound.manifestHash, bound.profilManifestHash); A.equal(bound.aktivierungsrecht, false);
      A.throws(() => S.pruefeRuntimeAktivierung({ runtimeManifest, snapshot: f.snapshot, belege }, bytes, NOW), /belegpaket-format/);
      A.throws(() => S.pruefeRuntimeAktivierung({ runtimeManifest, snapshot: f.snapshot, belege: full }, bytes, NOW), /live-endwaechter-fehlt/);
      full.endwaechter.manifestHash = bound.manifestHash;
      const active = S.pruefeRuntimeAktivierung({ runtimeManifest, snapshot: f.snapshot, belege: full }, bytes, NOW);
      A.equal(active.aliveWatchErforderlich, true); A.equal(active.extraAktivierungsGoErforderlich, true);
      A.equal(active.starttorFreigegeben, false); A.equal(active.juristischeRichtigkeitDurchCodeBestaetigt, false);
      A.equal(active.manifestHash, bound.manifestHash);
    });
    await test("Neue Bridge: Grundlinien-/Profilhash-/Snapshot-/Belegdrift fail closed", () => {
      const f = fixture(), { endwaechter, ...belege } = belegFixture(f);
      const prepared = S.pruefeVorbereitung({ ...f, belege }, bytes, NOW);
      const runtimeManifest = { version: "helmut-realkohorte500-runtime-manifest/1", profilManifestHash: V.hash(f.manifest),
        profilvertrag: f.manifest, startbelegeGrundlinie: prepared.startbelegeGrundlinie };
      for (const mutate of [
        x => { x.runtimeManifest.startbelegeGrundlinie.authHash = "0".repeat(64); },
        x => { x.runtimeManifest.profilManifestHash = "0".repeat(64); },
        x => { x.snapshot.mandate_profiles[0].inhalt.fachfeld = "Drift"; },
        x => { x.belege.fach.qualifikation += " Drift"; },
        x => { x.belege.landesversorgung.berlin.artikelHash = "0".repeat(64); },
        x => { x.runtimeManifest.ungebundenerZusatz = true; }
      ]) {
        const x = clone({ runtimeManifest, snapshot: f.snapshot, belege }); mutate(x);
        A.throws(() => S.pruefeRuntimeVorbereitung(x, bytes, NOW), /real500-/);
      }
    });
    await test("Neue Ergebnisbridge: aeusserer Auftrag bindet500/499/geschlossen0 ohne1500 Fachurteile", () => {
      const f = fixture(), { endwaechter, ...belege } = belegFixture(f);
      const base = S.pruefeVorbereitung({ ...f, belege }, bytes, NOW).startbelegeGrundlinie;
      const runtimeManifest = { version: "helmut-realkohorte500-runtime-manifest/1", profilManifestHash: V.hash(f.manifest),
        profilvertrag: f.manifest, startbelegeGrundlinie: base };
      for (const count of [500, 499, 0]) {
        const lesung = clone(f.snapshot); lesung.beobachtetAm = "2026-10-01T10:03:00.000Z";
        lesung.mandate_profiles.forEach((r, i) => { r.aktiv = i < count; });
        const quittung = count ? f.quittung : { ...f.quittung, zustand: "beendet", beendetAm: "2026-10-01T10:02:00.000Z",
          deaktiviert: 499, endgrund: "notstopp" };
        const runtimeStatus = { ...statusFixture(f, count ? "aktiv" : "beendet", count), manifestHash: V.hash(runtimeManifest) };
        const input = { runtimeManifest, snapshot: f.snapshot, quittung, lesung, erwartungen: E.erzeuge(bytes), runtimeStatus };
        const result = L.pruefeRuntimeLesung(input, bytes);
        A.equal(result.aktive, count); A.equal(result.manifestHash, V.hash(runtimeManifest));
        A.equal(result.profilManifestHash, V.hash(f.manifest)); A.equal(result.geprueft, 0); A.equal(result.nichtGeprueft, 1500);
        A.equal(result.funktionsnachweis500, false); A.equal(result.aktivierungsrecht, false);
        for (const mutate of [
          x => { x.runtimeStatus.manifestHash = V.hash(f.manifest); },
          x => { x.runtimeStatus.profilManifestHash = "0".repeat(64); },
          x => { x.runtimeStatus.aktiv = count ? count - 1 : 1; },
          x => { x.runtimeStatus.endeAm = "2026-10-01T23:00:00.000Z"; },
          x => { x.snapshot.profiles[0].inhalt.drift = true; }
        ]) {
          const changed = clone(input); mutate(changed);
          A.throws(() => L.pruefeRuntimeLesung(changed, bytes), /real500-/);
        }
      }
    });
    await test("Startschutz: qualifizierte Referenzstruktur ist kein Aktivierungs-/Testrecht", () => {
      const f = fixture(), belege = belegFixture(f);
      const result = S.pruefe({ ...f, belege }, bytes, NOW);
      A.equal(result.ok, true); A.equal(result.starttorFreigegeben, false);
      A.equal(result.aktivierungsrecht, false); A.equal(result.juristischeRichtigkeitDurchCodeBestaetigt, false);
      A.equal(result.belegHash, V.hash(belege));
    });
    await test("Startschutz: PhaseA-/Fach-GO als Boolean ist gesperrt", () => {
      for (const key of ["phaseA", "fach"]) for (const value of [true, { ok: true }, { freigegeben: true }]) {
        const f = fixture(), belege = belegFixture(f); belege[key] = value;
        A.throws(() => S.pruefe({ ...f, belege }, bytes, NOW), /fachentscheidung-fehlt/);
      }
    });
    await test("Startschutz: Qualifikation, Primaerreferenzen, Paket-/ID-Bindung und Entscheidungsdatum Pflicht", () => {
      const mutations = [b => { delete b.qualifikation; }, b => { b.primaerbelege = []; },
        b => { b.primaerbelege[0].sha256 = "ungueltig"; }, b => { b.paketHash = "0".repeat(64); },
        b => { b.idsHash = "0".repeat(64); }, b => { b.entschiedenAm = "2026-10-01T11:00:00.000Z"; }];
      for (const mutate of mutations) {
        const f = fixture(), belege = belegFixture(f); mutate(belege.phaseA);
        A.throws(() => S.pruefe({ ...f, belege }, bytes, NOW), /startschutz-/);
      }
    });
    await test("Startschutz: frische Runtime, Ruhe, Landesausgaben und exakt gebundener Endwaechter", () => {
      const mutations = [b => { b.production.productionCommit = "d".repeat(40); },
        b => { b.production.beobachtetAm = "2026-10-01T09:00:00.000Z"; },
        b => { b.production.laufzeit.kommunikationGesperrt = false; },
        b => { b.ruhe.lebendeLocks = 1; }, b => { b.ruhe.lebendeLeases = 1; }, b => { b.ruhe.offeneJobs = 1; },
        b => { b.landesversorgung.berlin.sichtbareAusgabeHash = null; },
        b => { b.landesversorgung.brandenburg = { ok: true }; },
        b => { b.endwaechter.manifestHash = "0".repeat(64); }, b => { b.endwaechter.zustand = "behauptet"; },
        b => { b.kosten.counter.ok = false; }];
      for (const mutate of mutations) {
        const f = fixture(), belege = belegFixture(f); mutate(belege);
        A.throws(() => S.pruefe({ ...f, belege }, bytes, NOW));
      }
    });
    const erwartungen = E.erzeuge(bytes);
    await test("Ergebnisleser: 1500 feste Sollpositionen, null Inhalte/Urteile, alle drei Bereiche500", () => {
      const plan = L.pruefeSollplan(erwartungen, bytes);
      A.equal(plan.sollpositionen.length, 1500);
      A.ok(plan.sollpositionen.every(p => p.status === "nicht-geprueft" && p.fachqualitaet === "ausstehend"));
      A.deepEqual(plan.jeBereich, { mandatsbriefing: 500, morgenbriefing: 500, lage: 500 });
      A.equal(plan.vollstaendigeFachabnahme, false); A.equal(plan.funktionsnachweis500, false); A.equal(plan.aktivierungsrecht, false);
    });
    await test("Ergebnisleser: 500 aktiv / 499 aktiv bleiben reine gebundene Lesung, keine Fachabnahme", () => {
      for (const active of [500, 499]) {
        const f = fixture(), lesung = clone(f.snapshot); lesung.beobachtetAm = "2026-10-01T10:02:00.000Z";
        lesung.mandate_profiles.forEach((r, i) => { r.aktiv = i < active; });
        const result = L.pruefeLesung({ ...f, lesung, erwartungen }, bytes);
        A.equal(result.aktive, active); A.equal(result.aktuelle500AktiveGelesen, active === 500);
        A.equal(result.geprueft, 0); A.equal(result.nichtGeprueft, 1500);
        A.equal(result.fehlendeAusgabenFestgestellt, null); A.equal(result.funktionsnachweis500, false);
      }
    });
    await test("Ergebnisleser: nach quittiertem Ende0 aktiv bleibt Nenner500/1500 erhalten", () => {
      const f = fixture(), lesung = clone(f.snapshot); lesung.beobachtetAm = "2026-10-01T10:03:00.000Z";
      const quittung = { ...f.quittung, zustand: "beendet", beendetAm: "2026-10-01T10:02:00.000Z", deaktiviert: 499, endgrund: "notstopp" };
      const result = L.pruefeLesung({ ...f, quittung, lesung, erwartungen }, bytes);
      A.equal(result.aktive, 0); A.equal(result.profile, 500); A.equal(result.soll, 1500);
      A.equal(result.geprueft, 0); A.equal(result.nichtGeprueft, 1500);
      lesung.mandate_profiles[0].aktiv = true;
      A.throws(() => L.pruefeLesung({ ...f, quittung, lesung, erwartungen }, bytes), /reaktivierung-nach-ende/);
    });
    await test("Ergebnisleser: manipulierte Erwartung, fremde ID/Fachfeld/Identitaet/Quittung fail closed", () => {
      const f = fixture(), lesung = clone(f.snapshot); lesung.beobachtetAm = "2026-10-01T10:02:00.000Z";
      const changed = clone(erwartungen); changed.sollpositionen[0].status = "bestanden";
      A.throws(() => L.pruefeLesung({ ...f, lesung, erwartungen: changed }, bytes), /sollplan-drift/);
      for (const mutate of [l => { l.mandate_profiles[0].user_id = "fremd"; },
        l => { l.mandate_profiles[0].inhalt.fachfeld = "drift"; }, l => { l.profiles[500].inhalt.unveraendert = false; }]) {
        const l = clone(lesung); mutate(l);
        A.throws(() => L.pruefeLesung({ ...f, lesung: l, erwartungen }, bytes), /bestand-bindung/);
      }
      const q = clone(f.quittung); q.operationId += "fremd";
      A.throws(() => L.pruefeLesung({ ...f, quittung: q, lesung, erwartungen }, bytes), /endquittung-bindung/);
    });
    const R = require("../lib/helmut/realkohorte-500-end-runtime");
    const W = require("./realkohorte-500-endwaechter");
    await test("Endruntime: DefaultAUS hat0 Requests und0 Schreibversuche", async () => {
      let calls = 0;
      for (const aktiviert of [undefined, false, "true", 1]) {
        const result = await R.beende({ aktiviert, request: async () => { calls++; throw new Error("verboten"); } });
        A.equal(result.zustand, "inaktiv"); A.equal(result.schreibversuche, 0);
      }
      A.equal(calls, 0);
    });
    await test("Endruntime: kompakte Bindung verweigert fremde Epoche/Manifest/IDs/Hash und private Zusatzfelder", () => {
      const f = fixture(), a = auftrag(f);
      for (const [key, value] of [["operationId", "real500-fremde-operation"], ["manifestHash", "0".repeat(64)],
        ["productionCommit", "d".repeat(40)], ["paketHash", "0".repeat(64)], ["idsHash", "0".repeat(64)],
        ["quittungBindungBestaetigt", false], ["gesamt", 499], ["identitaeten", 500], ["aktiv", -1]]) {
        const read = statusFixture(f); read[key] = value;
        A.throws(() => R.pruefeLesung(a, read), /runtime-lesung-/);
      }
      const read = statusFixture(f); read.snapshot = clone(f.snapshot);
      A.throws(() => R.pruefeLesung(a, read), /runtime-lesung-format/);
      for (const change of [a => { a.operationId = "testfenster-null500-alt"; }, a => { a.ids = paket.ids; },
        a => { a.manifestHash = null; }, a => { a.grund = "aktivierung"; }]) {
        const bad = clone(a); change(bad); A.throws(() => R.pruefeAuftrag(bad), /runtime-auftrag/);
      }
    });
    await test("Endruntime: prepared0 und ended0 sind reine Lesung; quittiertes Ende Noop", async () => {
      const f = fixture();
      for (const [zustand, expected] of [["vorbereitet", "vorbereitet-kein-ende"], ["beendet", "beendet-bestaetigt"]]) {
        const calls = [];
        const result = await R.beende({ auftrag: auftrag(f), aktiviert: true, request: async call => {
          calls.push(call); A.equal(call.methode, "GET"); return statusFixture(f, zustand, 0);
        } });
        A.equal(result.zustand, expected); A.equal(result.schreibversuche, 0); A.equal(calls.length, 1);
      }
    });
    await test("Endruntime: aktive500 und partielle499 enden mit genau einem kompakten POST", async () => {
      const f = fixture();
      for (const active of [500, 499]) {
        const calls = [];
        const result = await R.beende({ auftrag: auftrag(f), aktiviert: true, request: async call => {
          calls.push(call);
          return call.methode === "GET" ? statusFixture(f, "aktiv", active) : statusFixture(f, "beendet", 0);
        } });
        A.equal(result.zustand, "beendet-bestaetigt"); A.equal(result.schreibversuche, 1);
        A.deepEqual(calls.map(c => c.methode), ["GET", "POST"]);
        const payload = calls[1].body;
        A.deepEqual(Object.keys(payload).sort(), ["p_bestaetigung", "p_grund", "p_manifest_hash", "p_operation_id", "p_production_commit"]);
        A.equal(payload.p_bestaetigung, R.BESTAETIGUNG); A.equal(payload.p_manifest_hash, V.hash(f.manifest));
        A.equal(calls[1].pfad, "/rest/v1/rpc/" + R.RPC_NAME);
        A.ok(calls.every(c => c.signal instanceof AbortSignal));
        A.equal(JSON.stringify(payload).includes(paket.profile[0].vollname), false);
      }
    });
    await test("Endruntime: verlorene/ungueltige POST-Antwort bleibt unknown auch bei beobachtetem Ende", async () => {
      const f = fixture();
      for (const outcome of ["throw", null, {}, statusFixture(f, "aktiv", 500)]) {
        const calls = [];
        const result = await R.beende({ auftrag: auftrag(f), aktiviert: true, request: async call => {
          calls.push(call);
          if (call.methode === "POST") {
            if (outcome === "throw") throw new Error("synthetischer Antwortverlust nach Write");
            return outcome;
          }
          return statusFixture(f, calls.length === 1 ? "aktiv" : "beendet", calls.length === 1 ? 500 : 0);
        } });
        A.equal(result.zustand, "ausgang-unbekannt"); A.equal(result.eigeneSchreibwirkung, "unbekannt");
        A.equal(result.schreibversuche, 1); A.equal(result.gegenlesung.zustand, "beendet");
        A.deepEqual(calls.map(c => c.methode), ["GET", "POST", "GET"]);
      }
    });
    await test("Endruntime: auch fehlgeschlagene Gegenlesung hat0 Write-Retry und maximal eine Gegenlesung", async () => {
      const f = fixture(), calls = [];
      const result = await R.beende({ auftrag: auftrag(f), aktiviert: true, request: async call => {
        calls.push(call); if (calls.length === 1) return statusFixture(f);
        throw new Error("synthetischer Transportausfall");
      } });
      A.equal(result.zustand, "ausgang-unbekannt"); A.equal(result.gegenlesung, null);
      A.deepEqual(calls.map(c => c.methode), ["GET", "POST", "GET"]);
    });
    await test("Endruntime: falsche Anfangslesung stoppt vor POST", async () => {
      const f = fixture(), calls = [];
      await A.rejects(() => R.beende({ auftrag: auftrag(f), aktiviert: true, request: async call => {
        calls.push(call); return { ...statusFixture(f), manifestHash: "0".repeat(64) };
      } }), /runtime-lesung-bindung/);
      A.deepEqual(calls.map(c => c.methode), ["GET"]);
    });
    await test("Endruntime: echter Abort begrenzt ignorierenden Transport; >20s/ungueltige Limits gesperrt", async () => {
      const f = fixture(); let signal, requests = 0;
      await A.rejects(() => R.lese({ auftrag: auftrag(f), timeoutMs: 5, request: async call => {
        requests++; signal = call.signal; return await new Promise(() => {});
      } }), /runtime-transport-zeitlimit/);
      A.equal(requests, 1); A.equal(signal.aborted, true);
      for (const timeoutMs of [20001, 0, -1, NaN, "20000"]) {
        await A.rejects(() => R.lese({ auftrag: auftrag(f), timeoutMs, request: async () => {
          requests++; return statusFixture(f);
        } }), /runtime-transport-zeitlimit/);
      }
      A.equal(requests, 1);
    });
    await test("Waechtertransport: Node-Wiretext JSON; Bodyhaenger wird wirklich abgebrochen und begrenzt", async () => {
      const env = { SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetischer-test-key" };
      const f = fixture(), a = auftrag(f), payload = R.baueEndPayload(a); let observed;
      const request = W.requestFactory({ env, fetchFn: async (url, options) => {
        const wire = new Request(url, options); observed = { method: wire.method, text: await wire.text(), type: wire.headers.get("content-type") };
        return new Response(JSON.stringify(statusFixture(f, "beendet", 0)), { status: 200 });
      } });
      const result = await request({ methode: "POST", pfad: "/rest/v1/rpc/" + R.RPC_NAME, body: payload });
      A.equal(result.zustand, "beendet"); A.equal(observed.method, "POST");
      A.equal(observed.type, "application/json"); A.deepEqual(JSON.parse(observed.text), payload);
      let signal;
      await A.rejects(() => W.begrenztesJson("https://synthetisch.invalid", {}, { timeoutMs: 5, fetchFn: async (_url, options) => {
        signal = options.signal; return { status: 200, json: () => new Promise(() => {}) };
      } }), /anfrage-zeitlimit/);
      A.equal(signal.aborted, true);
      await A.rejects(() => W.begrenztesJson("https://synthetisch.invalid", {}, { timeoutMs: 20001,
        fetchFn: async () => { throw new Error("darf nicht aufgerufen werden"); } }), /timeout-ungueltig/);
    });
    function watcherFixture() {
      const f = fixture(); f.manifest.startBis = "2026-10-01T10:01:30.000Z"; f.manifest.endeAm = "2026-10-01T10:02:00.000Z";
      f.quittung.manifest = clone(f.manifest);
      const a = auftrag(f), env = { GITHUB_REPOSITORY: "ernisch/helmut-pilot", GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: COMMIT,
        GITHUB_WORKFLOW_REF: "ernisch/helmut-pilot/.github/workflows/realkohorte-500-endwaechter.yml@refs/heads/main",
        GITHUB_RUN_ATTEMPT: "1", GITHUB_RUN_ID: "123456" };
      return { f, a, env };
    }
    await test("Waechter: defaultAUS/fehlende Scharffreigabe/Workflow-Drift erzeugen0 Anfragen", async () => {
      const { a, env } = watcherFixture(); let requests = 0;
      const fetchFn = async () => { requests++; throw new Error("kein Netz erlaubt"); };
      const off = await W.ausfuehren({ auftrag: a, env, fetchFn });
      A.equal(off.bewaffnet, false); A.equal(off.externeAnfragen, 0); A.equal(off.starttorFreigegeben, false);
      const denied = await W.ausfuehren({ auftrag: a, env, fetchFn, scharf: true });
      A.equal(denied.ok, false);
      for (const [key, value] of [["GITHUB_REF", "refs/pull/1/head"], ["GITHUB_SHA", "d".repeat(40)], ["GITHUB_RUN_ATTEMPT", "2"]]) {
        A.equal((await W.ausfuehren({ auftrag: a, env: { ...env, [key]: value }, fetchFn })).ok, false);
      }
      A.equal(requests, 0);
    });
    await test("Waechter: Readiness0 aktiv ist kein500Start und erzeugt ohne Aktivquittung keinen Write", async () => {
      const { f, a, env } = watcherFixture(); let clock = NOW, ends = 0; const messages = [];
      const result = await W.steuere({ auftrag: a, env, deps: { jetzt: () => clock, warte: async ms => { clock += ms; },
        leseRuntime: async () => true, lese: async () => statusFixture(f, "vorbereitet", 0),
        leseKosten: async () => { throw new Error("bei0 aktiv keine Kostenabfrage"); },
        beende: async () => { ends++; throw new Error("bei0 aktiv kein Write"); }, melde: m => messages.push(m) } });
      A.equal(result.ok, false); A.equal(ends, 0); A.equal(result.schreibversuch, false);
      A.equal(messages.length, 1); A.equal(messages[0].aktiv, 0); A.equal(messages[0].aktivierungsrecht, false);
      A.equal(JSON.stringify(messages).includes("500-bestaetigt"), false);
    });
    await test("Waechter: prepared0 -> aktive500 -> Frist erzeugt einen Endversuch, keine Aktivierung", async () => {
      const { f, a, env } = watcherFixture(); let clock = NOW, reads = 0; const endcalls = [], messages = [];
      const result = await W.steuere({ auftrag: a, env, deps: { jetzt: () => clock, warte: async ms => { clock += ms; },
        leseRuntime: async () => true, lese: async () => ++reads === 1 ? statusFixture(f, "vorbereitet", 0) : statusFixture(f),
        leseKosten: async () => ({ tag: "2026-10-01", gebundenMikroUsd: 1000000, auftragGebundenMikroUsd: 4000000, ungeklaert: false, frozen: null }),
        beende: async call => { endcalls.push(call); return { zustand: "beendet-bestaetigt", schreibversuche: 1 }; },
        melde: m => messages.push(m) } });
      A.equal(result.zustand, "beendet-bestaetigt"); A.equal(endcalls.length, 1); A.equal(endcalls[0].grund, "frist");
      A.equal(result.automatischeWiederholung, false); A.equal(result.aktivierungsrecht, false);
      A.equal(messages[0].aktiv, 0);
    });
    await test("Reviewregression: bereits aktive ueberfaellige500 erhalten einen Frist-Endversuch; vorbereitet0 keinen", async () => {
      for (const zustand of ["aktiv", "vorbereitet"]) {
        const { f, a, env } = watcherFixture(); const endcalls = [];
        const result = await W.steuere({ auftrag: a, env, deps: { jetzt: () => Date.parse("2026-10-01T10:03:00.000Z"),
          warte: async () => { throw new Error("ueberfaellig nicht weiterwarten"); }, leseRuntime: async () => true,
          lese: async () => statusFixture(f, zustand, zustand === "aktiv" ? 500 : 0),
          leseKosten: async () => { throw new Error("Frist benoetigt keine neue Kostenabfrage"); },
          beende: async call => { endcalls.push(call); return { zustand: "beendet-bestaetigt", schreibversuche: 1,
            lesung: statusFixture(f, "beendet", 0) }; }, melde: () => {} } });
        A.equal(endcalls.length, zustand === "aktiv" ? 1 : 0);
        if (zustand === "aktiv") { A.equal(endcalls[0].grund, "frist"); A.equal(result.ok, true); }
        else { A.equal(result.ok, false); A.equal(result.schreibversuch, false); }
      }
    });
    await test("Neue Reviewfolgen: aktive Fristdrift/Readinessfehler enden einmal; vorbereitete0 niemals", async () => {
      for (const state of ["aktiv", "vorbereitet"]) for (const errorKind of ["frist-zu-weit", "readiness"]) {
        const { f, a, env } = watcherFixture(); const endcalls = []; let runtimeCalls = 0;
        if (errorKind === "frist-zu-weit") f.manifest.endeAm = "2026-10-01T22:00:00.000Z";
        const bound = auftrag(f);
        const result = await W.steuere({ auftrag: bound, env, deps: { jetzt: () => NOW,
          warte: async () => { throw new Error("keine Wiederholschleife"); },
          leseRuntime: async () => { runtimeCalls++; throw new Error("Readinessausfall"); },
          lese: async () => statusFixture(f, state, state === "aktiv" ? 500 : 0),
          leseKosten: async () => { throw new Error("keine Kosten bei Vorbedingungsfehler"); },
          beende: async call => { endcalls.push(call); return { zustand: "ausgang-unbekannt", schreibversuche: 1 }; }, melde: () => {} } });
        A.equal(endcalls.length, state === "aktiv" ? 1 : 0);
        if (state === "aktiv") { A.equal(endcalls[0].grund, "notstopp"); A.equal(result.ok, false); }
        A.ok(runtimeCalls <= 2, "hoechstens ein gezielter Runtime-Leseretry");
      }
      const { a, env } = watcherFixture(); let writes = 0;
      const unknown = await W.steuere({ auftrag: a, env, deps: { jetzt: () => NOW, warte: async () => {},
        leseRuntime: async () => true, lese: async () => { throw new Error("noch keine gebundene Lesung"); },
        leseKosten: async () => { throw new Error("verboten"); }, beende: async () => { writes++; }, melde: () => {} } });
      A.equal(writes, 0); A.equal(unknown.manuellerSqlRueckwegNoetig, "unbekannt");
    });
    await test("Waechter: Budgetgrenze/unbekannte Kosten triggern einen Notstopp; unknown bleibt ohne Retry", async () => {
      for (const kind of ["tag", "auftrag", "unbekannt"]) {
        const { f, a, env } = watcherFixture(); const endcalls = [];
        const result = await W.steuere({ auftrag: a, env, deps: { jetzt: () => NOW, warte: async () => { throw new Error("kein Weiterwarten"); },
          leseRuntime: async () => true, lese: async () => statusFixture(f),
          leseKosten: async () => {
            if (kind === "unbekannt") throw new Error("Kostenbuch unlesbar");
            return { tag: "2026-10-01", gebundenMikroUsd: kind === "tag" ? 6000000 : 1000000,
              auftragGebundenMikroUsd: kind === "auftrag" ? 7000000 : 4000000, ungeklaert: false, frozen: null };
          }, beende: async call => { endcalls.push(call); return { zustand: "ausgang-unbekannt", schreibversuche: 1 }; }, melde: () => {} } });
        A.equal(result.zustand, "ausgang-unbekannt"); A.equal(endcalls.length, 1); A.equal(endcalls[0].grund, "notstopp");
        A.equal(result.automatischeWiederholung, false);
      }
    });
    await test("Waechterintegration: echter Runtimeadapter bestaetigt Ende mit ok:true; unknown ergibt keinen Erfolg", async () => {
      for (const lostAnswer of [false, true]) {
        const { f, a, env } = watcherFixture(); let clock = NOW; const calls = [];
        const configured = { ...env, SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetischer-key",
          GITHUB_TOKEN: "synthetischer-token", HELMUT_CRON_SECRET: "synthetischer-cron",
          HELMUT_REAL500_ENDWAECHTER_EXECUTE: "1", HELMUT_REAL500_ENDWAECHTER_CONFIRM: R.BESTAETIGUNG };
        const cost = belegFixture(f).kosten.auth;
        let posted = false;
        const result = await W.ausfuehren({ auftrag: a, scharf: true, env: configured, jetzt: () => clock,
          warte: async ms => { clock += ms; }, melde: () => {}, fetchFn: async (url, options) => {
            const wire = new Request(url, options); const u = new URL(wire.url);
            calls.push({ url: wire.url, method: wire.method });
            let value;
            if (u.hostname === "api.github.com" && u.pathname.endsWith("/branches/main")) value = { commit: { sha: COMMIT } };
            else if (u.hostname === "api.github.com" && u.pathname.endsWith("/status")) value = { sha: COMMIT, statuses: [{ context: "Vercel", state: "success" }] };
            else if (u.hostname === "helmut-pilot.vercel.app") value = { ...belegFixture(f).production.laufzeit, production: true };
            else if (u.pathname.endsWith("/rpc/" + R.READ_RPC_NAME)) value = statusFixture(f, posted ? "beendet" : "aktiv", posted ? 0 : 500);
            else if (u.pathname.endsWith("/rpc/" + R.RPC_NAME) && wire.method === "POST") {
              A.deepEqual(JSON.parse(await wire.text()), R.baueEndPayload({ ...a, grund: "frist" }));
              posted = true; if (lostAnswer) throw new Error("simulierter Antwortverlust nach angewandtem Ende");
              value = statusFixture(f, "beendet", 0);
            } else if (u.pathname.endsWith("/helmut_store")) value = [{ buecher: cost[K.KEY], auftrag: cost[K.AUFTRAG_KEY] }];
            else throw new Error("unerlaubtes neues Requestziel");
            return new Response(JSON.stringify(value), { status: 200 });
          } });
        A.equal(calls.filter(c => c.method === "POST").length, 1);
        if (lostAnswer) {
          A.equal(result.ok, false); A.equal(result.zustand, "ausgang-unbekannt");
          A.equal(result.eigeneSchreibwirkung, "unbekannt");
        } else { A.equal(result.ok, true); A.equal(result.zustand, "beendet-bestaetigt"); }
        A.equal(result.automatischeWiederholung, false);
      }
    });
    await test("Waechter: fremde Statusdrift nach aktiver Quittung stoppt nach maximal einem GET-Retry", async () => {
      const { f, a, env } = watcherFixture(); let clock = NOW, reads = 0, ends = 0;
      const result = await W.steuere({ auftrag: a, env, deps: { jetzt: () => clock, warte: async ms => { clock += ms; },
        leseRuntime: async () => true, lese: async () => { reads++; if (reads === 1) return statusFixture(f); throw new Error("Status nicht lesbar"); },
        leseKosten: async () => ({ tag: "2026-10-01", gebundenMikroUsd: 1000000, auftragGebundenMikroUsd: 4000000, ungeklaert: false, frozen: null }),
        beende: async a => { ends++; A.equal(a.grund, "notstopp"); return { zustand: "ausgang-unbekannt", schreibversuche: 1 }; }, melde: () => {} } });
      A.equal(result.zustand, "ausgang-unbekannt"); A.equal(ends, 1); A.equal(reads, 3);
    });
  } finally { global.fetch = originalFetch; }
  console.log(`${pass} PASS, ${fail} FAIL — neue Runtime-Offlinetests, keine Production-/Fachabnahme.`);
  if (fail || pass === 0) process.exitCode = 1;
}

module.exports = { fixture, belegFixture, auftrag, statusFixture, bytes, paket, COMMIT, NOW };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
