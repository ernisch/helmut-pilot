"use strict";

// Reiner Vorbereitungsvertrag. Kein Client, Startrecht oder Ersatz fuer Startschutz.
const P = require("./synthetik-500-profile");
const VERSION = "helmut-synthetik500-starttor-kapsel/1";
const QUELLEN = Object.freeze(["profiles", "mandate_profiles", "political_items", "personalized_recommendations",
  "daily_tasks", "communication_drafts", "user_notes", "priority_changes", "matching_weights", "decisions",
  "topic_memory", "interactions", "office_outputs", "briefings", "profile_embeddings", "matching_runs", "matching_results"]);
const KONTROLLEN = Object.freeze(["helmut_store", "pipeline_locks", "helmut_jobs", "process_runs", "helmut_job_outbox"]);
const SOURCE5 = Object.freeze(["scripts/synthetik-500-native-import.js", "lib/helmut/synthetik-500-native-preimage.js",
  "scripts/import-preflight-500-sql-generator.js", "scripts/synthetik-500-import.js", "lib/helmut/synthetik-500-import.js"]);
const BELEGE = Object.freeze(["zyklus", "zyklusReview", "zyklusVertrag", "originalSnapshotManifest", "kontrollManifest",
  "runtimeManifest", "auditManifest", "transportReview", "kostenPlan", "kostenReview", "runtimeLesungVorlage",
  "localFixtureBinding", "preparedClonePlan"]);
const SHA = /^[a-f0-9]{64}$/;
const HISTORISCHE_ABNAHMEN = Object.freeze({
  zyklusReview: "1f85df23c7676a3fff7fc25f4f9a7eb3fd15060150583b8553943d20e7389345",
  transportReview: "533b5839478bd9749b0e0ab3af53ea105651aa8bf4756726a0638d2964ac8127",
  kostenReview: "f204fc591126fa9afeb823d56fcdaeeb6eb980646b96e33415820cb02517abc3",
});
const fordere = (ok, code) => { if (!ok) throw new Error("synthetik500-kapsel-" + code); };
const genau = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).sort().join("|") === [...keys].sort().join("|");
const hash = value => require("node:crypto").createHash("sha256").update(value).digest("hex");

function pruefeAnfrage(a) {
  fordere(genau(a, ["version", "basisCommit", "paket", "belege"]) && a.version === VERSION
    && /^[a-f0-9]{40}$/.test(a.basisCommit || ""), "anfrage");
  fordere(genau(a.belege, BELEGE), "belegumfang");
  for (const r of [a.paket, ...Object.values(a.belege)])
    fordere(genau(r, ["path", "sha256"]) && typeof r.path === "string"
      && require("node:path").isAbsolute(r.path) && SHA.test(r.sha256), "referenz");
  fordere(Object.entries(HISTORISCHE_ABNAHMEN).every(([k, sha]) => a.belege[k].sha256 === sha), "abnahme-anker");
  return a;
}

function pruefeHistorie(a, b, paket) {
  pruefeAnfrage(a);
  const meta = P.pruefePaket(paket), z = b.zyklus, r = b.zyklusReview;
  fordere(r.accepted === true && r.currentPhaseWrapperLocalAccepted === true
    && r.resultSha256 === a.belege.zyklus.sha256
    && r.actualContractSha256 === a.belege.zyklusVertrag.sha256, "zyklus-review");
  fordere(z.localOnly === true && z.productionWrites === 0 && z.productionRequests === 0
    && z.applicationReady === false && z.stageReady === false && z.diagnosticOnly === true
    && z.transactionSeconds === 17 && z.statementSeconds === 20 && z.lockSeconds === 2,
  "zyklus-grenzen");
  fordere(r.initialFullSourceRows === 136765 && r.initialFullControlRows === 46143
    && r.runtimeFunctions === 10 && r.runtimeNamespaces === 2 && r.initialJournalRows === 41
    && r.finalJournalRows === 44, "vollumfang");
  fordere(Array.isArray(z.phases) && z.phases.map(p => p.phase).join("|") === "stage|forward|rollback"
    && z.phases.every(p => p.code === 0 && p.committedByPostCommitEndpoint === true
      && p.postconditionsFullyValidated === true && p.originalBodyByteIdentical === true), "phasen");
  const c = b.zyklusVertrag;
  fordere(c.localOnly === true && c.snapshotNativeExportFreshnessClaimed === false
    && c.controlManifest.sha256 === a.belege.kontrollManifest.sha256
    && c.runtimeManifest.sha256 === a.belege.runtimeManifest.sha256
    && c.auditManifest.sha256 === a.belege.auditManifest.sha256
    && c.localFixture.sha256 === a.belege.localFixtureBinding.sha256
    && c.preparedPlan.sha256 === a.belege.preparedClonePlan.sha256
    && r.actualPreparedPlanSha256 === a.belege.preparedClonePlan.sha256
    && r.actualRestoreSha256 === c.restoreResult.sha256
    && z.inputContractSha256 === a.belege.zyklusVertrag.sha256
    && z.preparedPlanSha256 === a.belege.preparedClonePlan.sha256
    && z.restoreResultSha256 === c.restoreResult.sha256, "historische-bindungen");
  const s = b.originalSnapshotManifest;
  const dateien = [...QUELLEN, "fremd_profiles"].map(t => t + ".jsonl");
  fordere(s.snapshotVertrag === "helmut-500-preimage/2" && SHA.test(s.sha256)
    && s.paket.sha256 === a.paket.sha256 && genau(s.dateien, dateien)
    && s.bestand.profilesGesamt === 501 && s.bestand.mandateProfilesGesamt === 500
    && s.bestand.aktivGesamt === 0, "snapshot");
  const fixture = b.localFixtureBinding, plan = b.preparedClonePlan;
  fordere(fixture.originalSourceManifestHash === s.sha256 && fixture.paketSha256 === a.paket.sha256
    && fixture.freshNativeExportClaimed === false && plan.nativeFullSource17BusinessParity === false
    && plan.controlManifestSha256 === a.belege.kontrollManifest.sha256
    && plan.runtimeManifestSha256 === a.belege.runtimeManifest.sha256
    && plan.auditManifestSha256 === a.belege.auditManifest.sha256
    && typeof plan.dump === "string" && require("node:path").isAbsolute(plan.dump)
    && SHA.test(plan.dumpSha256), "archiv-herkunft");
  fordere(genau(r.originalSource5Pins, SOURCE5) && genau(plan.sourceModulePins, SOURCE5)
    && SOURCE5.every(k => SHA.test(r.originalSource5Pins[k])
      && r.originalSource5Pins[k] === plan.sourceModulePins[k]), "source5-umfang");
  fordere(s.ids && s.ids.mandat.length === 500 && new Set(s.ids.mandat).size === 500
    && s.ids.fremd.length === 1 && !s.ids.mandat.includes(s.ids.fremd[0])
    && [...s.ids.mandat, ...s.ids.fremd].every(id => typeof id === "string"
      && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(id)), "snapshot-ids");
  for (const [name, f] of Object.entries(s.dateien))
    fordere(f.tabelle + ".jsonl" === name && SHA.test(f.sha256)
      && Number.isSafeInteger(f.zeilen) && f.zeilen >= 0, "snapshot-dateien");
  const controls = b.kontrollManifest;
  fordere(controls.complete === true && controls.totalRows === 46143
    && controls.rowsAreRawTypedPostgresToJsonbText === true
    && controls.numericLexemesNeverConvertedToJSNumber === true
    && Array.isArray(controls.tables) && controls.tables.length === 5
    && controls.tables.map(t => t.table).sort().join("|") === [...KONTROLLEN].sort().join("|")
    && controls.tables.every(t => Number.isSafeInteger(t.rows) && t.rows >= 0)
    && controls.tables.reduce((n, t) => n + t.rows, 0) === 46143, "kontrollhistorie");
  fordere(b.runtimeManifest.complete === true && b.runtimeManifest.runtimeFunctions === 10
    && b.runtimeManifest.internalNamespaces === 2 && b.auditManifest.complete === true
    && b.auditManifest.actualNativeRows === 41
    && b.runtimeManifest.rootActualProof.querySha256 === a.belege.runtimeLesungVorlage.sha256,
  "runtime-audit");
  fordere(b.transportReview.accepted === true && b.transportReview.actualTerminalToolFailureEvidenceAccepted === true
    && b.transportReview.nativeTransportAccepted === false
    && b.transportReview.capsuleRetryAccepted === false && b.transportReview.capsuleResumeAccepted === false,
  "terminaler-transport");
  fordere(b.kostenReview.accepted === true && b.kostenReview.proposalScopeAccepted === true
    && b.kostenReview.wholeRunCompletionCostBoundAccepted === false
    && b.kostenReview.pins.some(p => p.sha256 === a.belege.kostenPlan.sha256)
    && b.kostenPlan.status.wholeRunMaxCostForCompletionProven === false, "kosten-scope");
  return meta;
}

function baueKapsel({ anfrage, belege, paket, sourcePins, dateistatus, queries, erstelltAm }) {
  const meta = pruefeHistorie(anfrage, belege, paket);
  fordere(Number.isFinite(Date.parse(erstelltAm)) && queries.length === 2
    && queries.every(q => SHA.test(q.sha256) && q.bytes > 0), "ausgabe");
  const r = belege.zyklusReview;
  fordere(genau(sourcePins, SOURCE5)
    && SOURCE5.every(name => sourcePins[name] === r.originalSource5Pins[name]), "source5-drift");
  const offen = [
    ["freshNativeFullSnapshot", "Original18+5Controls+Runtime10/2+Audit41 sind historische private Archive. Vor Productionimport kompletten frischen Source/Control/Runtime-Snapshot samt aktuellem MainAuth und Journal binden; nach erfolgreichem Vier-Buecher-Commit auch diese vier Buecher und Audit42. Altes Archiv ist kein aktuelles Importpreimage oder Rueckwegsnapshot."],
    ["nativeAppTransportAndWholePhase", "Grosse inerte Native-Probe terminal invalid/expired requestState; keine Wiederholung/Fortsetzung. Kleine RO-Erfolge belegen keine App-Body-/17s-Gesamtphasen-/Hardwareparitaet."],
    ["inactiveProfileImportGo", "Konkretes Profil-/DATA-GO, aktuelle Aufnahme und unabhängige gebundene Import-/Rueckwegabnahme erforderlich. Nullkostenbuecher-GO erteilt kein Profilrecht."],
    ["freshRuntimeAndQuiet", "READY-Commit/Deployment, 500/501/0, Runtime/ACL/Owner und Queue/Lease/Lock/Prozessruhe sowie aktuelle Auth/main-Bindung frisch nachweisen."],
    ["sourceSupply", "AREA2: aktuelle BT/Berlin/Brandenburg-Quellen und wirksame Flags samt sichtbarem Originalquellenbeleg."],
    ["completeFundedQualityPlan", "AREA1: endliche U/Versionen/Extraattempts und Kosten mit aktuellen Inputs/Tarifen binden. Root kann einen Versuch, keinen automatischen Paid-Retry, Parallelitaet1 und <=4h im selben UTC-Tag waehlen; die tatsächliche Pfaddurchsetzung bleibt unbewiesen. Kein Budget-/Qualitaetswechsel."],
    ["originalStartManifest", "Bestehenden Synthetik-Vertrag/Sollplan/Startschutz mit allen frischen Primärbelegen ausfuellen; <=4h, gleicher UTC-Tag, Start<=5min, Kosten6/7USD inklusive Reserve."],
    ["aliveBoundEndWatcher", "Manuellen Originalworkflow mit exakter Variante/operationId/manifestHash/READY-Commit erst nach eigener Freigabe bewaffnen; echten <=60s bereit-lesend-Beleg des lebenden ersten Runattempts nachweisen."],
    ["activationAndPaidTestGo", "Separates konkret gebundenes Aktivierungs-/Test-/Paid-GO bleibt erforderlich. Kapsel und Endwaechter geben kein Startrecht."],
  ];
  return { version: VERSION, erstelltAm, basisCommit: anfrage.basisCommit, modus: "rein-lokale-reviewvorbereitung",
    ausgefuehrt: false, importFreigegeben: false, starttorFreigegeben: false, aktivierungsrecht: false,
    stageReady: false, nativeAppReady: false, funktionsnachweis500: false, freigegebeneModellaufrufe: 0,
    paket: { referenz: anfrage.paket, variante: meta.variante, ...meta }, belege: anfrage.belege, sourcePins,
    historischerVollumfang: { quellzeilenClone: 136765, kontrollzeilen: 46143, runtimeFunktionen: 10,
      runtimeNamespaces: 2, journalVorher: 41, journalNachherLocal: 44,
      snapshotJsonlZeilen: Object.values(belege.originalSnapshotManifest.dateien).reduce((n, d) => n + d.zeilen, 0),
      grenze: "OriginalJSONL umfasst136764 scoped Zeilen; Clone enthaelt zusaetzliche kontrollierte Fremdentscheidung. Kein vollstaendiger Native-Nontarget- oder MVCC-Paritaetsbeleg." },
    snapshotReuse: { neueExporte: 0, kopierteDatenBytes: 0, grosseDateienNeuGehasht: false,
      historischeNativeDumpReferenz: { path: belege.preparedClonePlan.dump, sha256: belege.preparedClonePlan.dumpSha256 },
      statusPruefung: dateistatus, verbindlicheSpaeterePruefung: "Original17/18 typisierte Vollfeld-/Datei-/Revisionguards unveraendert; Metadatenstat ersetzt sie nicht." },
    routinePlanKandidat: { maxAttemptsPerPaidIntent: 1, automaticPaidRetry: false, modelConcurrency: 1,
      maxWindowMs: 14400000, sameUtcDay: true, executorBinding: null, enforcementProven: false,
      bedeutung: "Root-Routineplanung, keine implementierte Schutzänderung oder fehlende Nutzerpräferenz. Ohne aktuellen Pfad-/Inputbeleg kein vollständiger Maxkosten- oder Qualitätsnachweis." },
    dynamischeGates: offen.map(([gate, grund]) => ({ gate, akzeptiert: false, grund })),
    readonlyQueue: queries.map(q => ({ ...q, caller: "Root only", aufgerufen: false, aufrufeMaximalNachSeparaterFreigabe: 1,
      retry: false, resume: false, transactionSeconds: 17, statementSeconds: 20, lockSeconds: 2,
      transportEndToEndDeadlineProven: false })),
    endwaechter: { workflow: ".github/workflows/synthetik-500-endwaechter.yml", schedule: false,
      schritte: ["eingabepruefung", "bewaffnen"], bestaetigungNurEndrecht: "GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN",
      bewaffnet: false, lebenderRunNachgewiesen: false, inputBindungenOffen: ["operation_id", "manifest_hash", "production_commit"],
      variantenInput: meta.variante, erhaltenerAdapter: "scripts/synthetik-500-endwaechter.js",
      erhaltenerStartgenerator: "scripts/synthetik-500-start-sql.js", automatischerWriteRetry: false },
    grenzen: ["Lokales GREEN ist Diagnose, keine Native- oder Profilfreigabe.",
      "Keine erfolgreiche SubTX-Performance, Body-only-Dauer oder harte CPU-17s-Reserve.",
      "Aktuelle Quellen-/Kosten-/Runtime-/Wächterbelege und konkrete GOs werden nicht aus historischen Hashes abgeleitet.",
      "1500 vollstaendige Qualitaetspositionen und unabhaengige Einzel-/Endabnahme unveraendert; leer/fehlend/fehlerhaft getrennt."] };
}

function quietSql() {
  const counts = KONTROLLEN.map(t => `'${t}',(select count(*) from public.${t})`).join(",");
  return `jsonb_build_object('controls',jsonb_build_object(${counts}),
    'profiles',(select count(*) from public.profiles),'mandates',(select count(*) from public.mandate_profiles),
    'active',(select count(*) from public.mandate_profiles where aktiv is not false),
    'mainAuth',(select jsonb_build_object('rows',count(*),'fullFieldSha256',encode(sha256(convert_to(
      coalesce(string_agg(to_jsonb(s)::text,E'\\n' order by s.id collate "C"),''),'UTF8')),'hex'),
      'xmins',coalesce(jsonb_agg(s.xmin::text order by s.id collate "C"),'[]'::jsonb)) from public.helmut_store s where s.id='main-auth'),
    'quiet',jsonb_build_object('jobs',(select count(*) from public.helmut_jobs where lease_expires_at>clock_timestamp() or status not in('erledigt','fehlgeschlagen')),
    'locks',(select count(*) from public.pipeline_locks where expires_at>clock_timestamp()),
    'processes',(select count(*) from public.process_runs where finished_at is null and status='running'),
    'outbox',(select count(*) from public.helmut_job_outbox where status is null or status not in('bestaetigt','aufgegeben','verzichtet'))),
    'session',jsonb_build_object('pgVersion',current_setting('server_version_num'),'readOnly',current_setting('transaction_read_only'),
    'transactionTimeout',current_setting('transaction_timeout'),'statementTimeout',current_setting('statement_timeout'),'lockTimeout',current_setting('lock_timeout'),
    'timeZone',current_setting('TimeZone'),'dateStyle',current_setting('DateStyle'),'extraFloatDigits',current_setting('extra_float_digits'),
    'clientEncoding',current_setting('client_encoding'),'serverEncoding',current_setting('server_encoding')))`;
}

// Belegtes vorhandenes SELECT bleibt bytegleich, nur RO-Settings + additive Counts.
function ergaenzeRuntimeLesung(sql) {
  const prefix = "begin transaction read only;set local lock_timeout='2s';set local transaction_timeout='17s';set local statement_timeout='17s';set local search_path=pg_catalog,public;set local time zone 'UTC';\n";
  const suffix = "as observation;commit;\n";
  fordere(sql.startsWith(prefix) && sql.endsWith(suffix), "runtime-query-vorlage");
  const select = sql.slice(prefix.length, -suffix.length);
  fordere(select.startsWith("select jsonb_build_object("), "runtime-query-select");
  return { sql: prefix.replace("statement_timeout='17s'", "statement_timeout='20s'")
    + select + " || " + quietSql() + " as observation;commit;\n", originalSelectSha256: hash(select), originalSelectBytes: Buffer.byteLength(select) };
}

module.exports = { VERSION, QUELLEN, KONTROLLEN, SOURCE5, BELEGE, fordere, hash, pruefeAnfrage, pruefeHistorie, baueKapsel, ergaenzeRuntimeLesung };
