"use strict";

// Neue, kleine FS-Vertragstests mit ausschliesslich erfundenen Beleginhalten.
// Keine Datenbank, kein Import-/Start-/Workflowaufruf und keine historische Suite.
const A = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const K = require("../lib/helmut/synthetik-500-starttor-kapsel");
const P = require("../lib/helmut/synthetik-500-profile");
const CLI = require("./synthetik-500-starttor-kapsel");
const sha = "a".repeat(64), checked = [];
const only = process.argv.slice(2);
A(only.length === 0 || (only.length === 2 && only[0] === "--only" && only[1] === "main-auth"), "unknown test selection");
function test(name, fn) { if (only.length && name !== "Opake frische MainAuth-Bindung mit Ausgabe-GUCs") return; fn(); checked.push(name); }
function fixture() {
  const refs = Object.fromEntries(K.BELEGE.map(k => [k, { path: "/private/fixture/" + k, sha256: sha }]));
  refs.zyklusReview.sha256 = "1f85df23c7676a3fff7fc25f4f9a7eb3fd15060150583b8553943d20e7389345";
  refs.transportReview.sha256 = "533b5839478bd9749b0e0ab3af53ea105651aa8bf4756726a0638d2964ac8127";
  refs.kostenReview.sha256 = "f204fc591126fa9afeb823d56fcdaeeb6eb980646b96e33415820cb02517abc3";
  const sourcePins = Object.fromEntries(K.SOURCE5.map(k => [k, sha]));
  const anfrage = { version: K.VERSION, basisCommit: "b".repeat(40), paket: { path: "/private/fixture/paket", sha256: sha }, belege: refs };
  const belege = {
    zyklus: { localOnly: true, productionWrites: 0, productionRequests: 0, applicationReady: false, stageReady: false,
      diagnosticOnly: true, transactionSeconds: 17, statementSeconds: 20, lockSeconds: 2,
      inputContractSha256: sha, preparedPlanSha256: sha, restoreResultSha256: sha,
      phases: ["stage", "forward", "rollback"].map(phase => ({ phase, code: 0, committedByPostCommitEndpoint: true,
        postconditionsFullyValidated: true, originalBodyByteIdentical: true })) },
    zyklusReview: { accepted: true, currentPhaseWrapperLocalAccepted: true, resultSha256: sha, actualContractSha256: sha,
      actualPreparedPlanSha256: sha, actualRestoreSha256: sha, initialFullSourceRows: 136765, initialFullControlRows: 46143,
      runtimeFunctions: 10, runtimeNamespaces: 2, initialJournalRows: 41, finalJournalRows: 44, originalSource5Pins: sourcePins },
    zyklusVertrag: { localOnly: true, snapshotNativeExportFreshnessClaimed: false,
      ...Object.fromEntries(["controlManifest", "runtimeManifest", "auditManifest", "localFixture", "preparedPlan", "restoreResult"]
        .map(k => [k, { sha256: sha }])) },
    originalSnapshotManifest: { snapshotVertrag: "helmut-500-preimage/2", sha256: sha, paket: { sha256: sha },
      bestand: { profilesGesamt: 501, mandateProfilesGesamt: 500, aktivGesamt: 0 },
      ids: { mandat: Array.from({ length: 500 }, (_, n) => "fixture-" + n), fremd: ["fixture-foreign"] },
      dateien: Object.fromEntries([...K.QUELLEN, "fremd_profiles"].map(t => [t + ".jsonl", { tabelle: t, sha256: sha,
        zeilen: t === "decisions" ? 136764 : 0 }])) },
    kontrollManifest: { complete: true, totalRows: 46143, rowsAreRawTypedPostgresToJsonbText: true,
      numericLexemesNeverConvertedToJSNumber: true,
      tables: K.KONTROLLEN.map((table, n) => ({ table, rows: [246, 2, 22709, 712, 22474][n] })) },
    runtimeManifest: { complete: true, runtimeFunctions: 10, internalNamespaces: 2, rootActualProof: { querySha256: sha } },
    auditManifest: { complete: true, actualNativeRows: 41 },
    localFixtureBinding: { originalSourceManifestHash: sha, paketSha256: sha, freshNativeExportClaimed: false },
    preparedClonePlan: { nativeFullSource17BusinessParity: false, controlManifestSha256: sha, runtimeManifestSha256: sha,
      auditManifestSha256: sha, sourceModulePins: sourcePins, dump: "/private/fixture/native.dump", dumpSha256: sha },
    transportReview: { accepted: true, actualTerminalToolFailureEvidenceAccepted: true, nativeTransportAccepted: false,
      capsuleRetryAccepted: false, capsuleResumeAccepted: false },
    kostenPlan: { status: { wholeRunMaxCostForCompletionProven: false } },
    kostenReview: { accepted: true, proposalScopeAccepted: true, wholeRunCompletionCostBoundAccepted: false,
      pins: [{ sha256: sha }] },
  };
  return { anfrage, belege, paket: P.erzeuge(), sourcePins, dateistatus: [],
    queries: ["source", "runtime"].map(file => ({ file, sha256: sha, bytes: 1 })), erstelltAm: "2026-10-02T09:10:00Z" };
}

test("Historische Vollbelege verleihen kein Startrecht", () => {
  const c = K.baueKapsel(fixture());
  A.equal(c.paket.profile, 500); A.equal(c.paket.sollpositionen, 1500);
  A.equal(c.starttorFreigegeben, false); A.equal(c.nativeAppReady, false); A.equal(c.importFreigegeben, false);
  A(c.dynamischeGates.every(g => g.akzeptiert === false));
  A(c.dynamischeGates[0].grund.includes("kein aktuelles Importpreimage"));
  A.equal(c.routinePlanKandidat.enforcementProven, false); A.equal(c.endwaechter.lebenderRunNachgewiesen, false);
});
function reject(name, mutate, expected) {
  test(name, () => { const f = fixture(); mutate(f); A.throws(() => K.baueKapsel(f), expected); });
}
reject("Fehlende Kontrollhistorie stoppt trotz passendem Gesamtcount", f => f.belege.kontrollManifest.tables[4].table = "helmut_jobs", /kontrollhistorie/);
reject("Runtime ohne geschuetzte Realfunktionen stoppt", f => f.belege.runtimeManifest.runtimeFunctions = 5, /runtime-audit/);
reject("Aktueller Journalstand ersetzt nicht historischen Auditanker", f => f.belege.auditManifest.actualNativeRows = 42, /runtime-audit/);
reject("Ungebundene Originalsnapshot-Herkunft stoppt", f => f.belege.localFixtureBinding.originalSourceManifestHash = "c".repeat(64), /archiv-herkunft/);
reject("Anderer tatsächlicher Restore stoppt", f => f.belege.zyklusVertrag.restoreResult.sha256 = "c".repeat(64), /historische-bindungen/);
reject("Verringerter Source5-Umfang stoppt", f => { delete f.belege.zyklusReview.originalSource5Pins[K.SOURCE5[0]]; }, /source5-umfang/);
reject("Aktuelle Originalbody-Dateidrift stoppt", f => { f.sourcePins = { ...f.sourcePins, [K.SOURCE5[0]]: "c".repeat(64) }; }, /source5-drift/);
reject("Nicht bytegleicher Originalbody stoppt", f => f.belege.zyklus.phases[2].originalBodyByteIdentical = false, /phasen/);
reject("Terminalfehler wird nicht in Nativeakzeptanz umgedeutet", f => f.belege.transportReview.nativeTransportAccepted = true, /terminaler-transport/);
reject("Ungepruefte unabhängige Abnahme stoppt", f => f.anfrage.belege.zyklusReview.sha256 = "c".repeat(64), /abnahme-anker/);
reject("Fremde Runtime-Lesevorlage stoppt", f => f.anfrage.belege.runtimeLesungVorlage.sha256 = "c".repeat(64), /runtime-audit/);
reject("Erfundener kompletter Kostenabschluss stoppt", f => f.belege.kostenReview.wholeRunCompletionCostBoundAccepted = true, /kosten-scope/);
reject("DDL-/Executionflag nicht Teil der Eingabe", f => f.anfrage.execute = true, /anfrage/);

const runtimePrefix = "begin transaction read only;set local lock_timeout='2s';set local transaction_timeout='17s';set local statement_timeout='17s';set local search_path=pg_catalog,public;set local time zone 'UTC';\n";
test("Additive RO-Komposition erhaelt vorhandenen SELECT und17/20/2", () => {
  const select = "select jsonb_build_object('fixture',1) ";
  const q = K.ergaenzeRuntimeLesung(runtimePrefix + select + "as observation;commit;\n");
  A.equal(q.originalSelectSha256, K.hash(select));
  A.equal(q.sql.slice(runtimePrefix.length, runtimePrefix.length + select.length), select);
  for (const [name, value] of [["transaction_timeout", 17], ["statement_timeout", 20], ["lock_timeout", 2]])
    A(q.sql.includes(`${name}='${value}s'`));
  for (const t of K.KONTROLLEN) A(q.sql.includes(`count(*) from public.${t}`));
  A(!/\b(insert|update|delete|create|alter|drop)\b/i.test(q.sql));
});
test("Unerwarteter SQL-Rest oder Schreibprefix stoppt", () => {
  A.throws(() => K.ergaenzeRuntimeLesung(runtimePrefix + "select jsonb_build_object('fixture',1) as observation;commit;\nselect 1;"), /runtime-query-vorlage/);
  A.throws(() => K.ergaenzeRuntimeLesung("begin;select 1;commit;\n"), /runtime-query-vorlage/);
});
test("Opake frische MainAuth-Bindung mit Ausgabe-GUCs", () => {
  const q = K.ergaenzeRuntimeLesung(runtimePrefix + "select jsonb_build_object('fixture',1) as observation;commit;\n").sql;
  A(q.includes("'mainAuth',(select jsonb_build_object('rows',count(*)"));
  A(q.includes("s.id='main-auth'")); A(q.includes("string_agg(to_jsonb(s)::text")); A(q.includes("jsonb_agg(s.xmin::text"));
  for (const g of ["TimeZone", "DateStyle", "extra_float_digits", "client_encoding", "server_encoding"])
    A(q.includes(`current_setting('${g}')`));
  A(!q.includes("'data',s.data")); A(!q.includes("pg_get_functiondef("));
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-new-kapsel-fs-"));
fs.chmodSync(tmp, 0o700);
try {
  test("Private Ausgabe ist exklusiv,600/700 und hashgebunden", () => {
    const out = path.join(tmp, "new"), result = CLI.publiziere(out, { "kapsel.json": { inert: true }, "probe.sql": "select 1;" });
    A.equal(result.externeAnfragen, 0); A.equal(fs.statSync(out).mode & 0o777, 0o700);
    const freeze = JSON.parse(fs.readFileSync(path.join(out, "freeze.json"), "utf8"));
    for (const f of freeze.files) {
      const p = path.join(out, f.file); A.equal(fs.statSync(p).mode & 0o777, 0o600);
      A.equal(K.hash(fs.readFileSync(p)), f.sha256);
    }
    const before = fs.readFileSync(path.join(out, "freeze.json"));
    A.throws(() => CLI.publiziere(out, { "probe.sql": "different" }), /ausgabe-existiert/);
    A.deepEqual(fs.readFileSync(path.join(out, "freeze.json")), before);
  });
  test("Git-/Symlink-/Fremdpfade und grosse Kleindatei werden abgewiesen", () => {
    const dir = path.join(tmp, "git"); fs.mkdirSync(dir, { mode: 0o700 });
    fs.writeFileSync(path.join(dir, ".git"), "fixture", { mode: 0o600 });
    A.throws(() => CLI.publiziere(path.join(dir, "new"), { "probe.sql": "select 1;" }), /private-gitroot/);
    const file = path.join(tmp, "private"); fs.writeFileSync(file, "fixture", { mode: 0o600 });
    fs.symlinkSync(file, path.join(tmp, "link"));
    A.throws(() => CLI.privatDatei(path.join(tmp, "link")), /private-datei/);
    A.throws(() => CLI.publiziere(path.join(tmp, "escape"), { "../escape.sql": "select 1;" }), /ausgabe-name/);
    const large = path.join(tmp, "large"); const fd = fs.openSync(large, "wx", 0o600); fs.ftruncateSync(fd, 2097153); fs.closeSync(fd);
    A.throws(() => CLI.lese({ path: large, sha256: sha }), /kleinbeleg-groesse/);
  });
  test("Publikationsfehler hinterlaesst keinen Complete-Freeze", () => {
    const original = fs.linkSync, out = path.join(tmp, "partial"); let n = 0;
    fs.linkSync = (...args) => { if (++n === 2) throw new Error("fixture-link-failure"); return original(...args); };
    try { A.throws(() => CLI.publiziere(out, { "kapsel.json": {}, "probe.sql": "select 1;" }), /fixture-link-failure/); }
    finally { fs.linkSync = original; }
    A.equal(fs.existsSync(path.join(out, "freeze.json")), false);
    A.throws(() => CLI.publiziere(out, { "probe.sql": "different" }), /ausgabe-existiert/);
  });
  test("Hashdrift der kleinen Datei stoppt vor Ausgabepublikation", () => {
    A.throws(() => CLI.lese({ path: path.join(tmp, "private"), sha256: sha }), /beleg-hash/);
  });
  test("CLI kennt keinen Ausführungsmodus", () => A.throws(() => CLI.main(["--execute"]), /cli/));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(JSON.stringify({ version: K.VERSION, passed: checked.length, tests: checked, scope: "new-small-fictitious-FS-contract-only",
  databaseCalls: 0, networkCalls: 0, oldSuitesRun: 0, importedProfiles: 0 }));
