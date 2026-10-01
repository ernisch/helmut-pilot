"use strict";

// Ausschliesslich private lokale SQL-Vorbereitung. Kein Client, kein psql,
// keine Migration/Slotanlage/Aktivierung beim Aufruf. Fehlender Fachbeleg oder
// separates Aktivierungs-GO verweigert den betreffenden Plan statt Gruen.
const fs = require("node:fs");
const path = require("node:path");
const V = require("../lib/helmut/realkohorte-500-vertrag");
const S = require("../lib/helmut/realkohorte-500-startschutz");
const ROOT = path.resolve(__dirname, "..");
const VERSION = "helmut-realkohorte500-runtime/1";
const MANIFEST_VERSION = "helmut-realkohorte500-runtime-manifest/1";
const PAKET = path.resolve(__dirname, "../daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const literal = s => "'" + String(s).replace(/'/g, "''") + "'";
const json = x => literal(JSON.stringify(x)) + "::jsonb";
const sqlHash = expr => `encode(sha256(convert_to((${expr})::text,'UTF8')),'hex')`;
const jsHash = expr => `encode(sha256(convert_to(helmut_real500_internal.json_compact(${expr}),'UTF8')),'hex')`;
const exakt = (o, keys) => o && Object.keys(o).sort().join("|") === [...keys].sort().join("|");

function schreibePrivat(out, inhalt) {
  const parent = fs.realpathSync(path.dirname(path.resolve(out)));
  const target = path.join(parent, path.basename(out));
  const repo = fs.realpathSync(ROOT);
  V.fordere(target !== repo && !target.startsWith(repo + path.sep), "startsql-ausgabe-im-repository");
  for (let dir = parent;; dir = path.dirname(dir)) {
    const git = path.join(dir, ".git");
    // Die Umgebung hat leere .git-Platzhalter; nur echte Repositories und
    // Worktree-Verweisdateien sperren. realpath schliesst Symlink-Umwege.
    const repository = fs.existsSync(git) && (fs.statSync(git).isFile() || fs.existsSync(path.join(git, "HEAD")));
    V.fordere(!repository, "startsql-ausgabe-im-repository");
    if (path.dirname(dir) === dir) break;
  }
  let fd;
  try {
    fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
    fs.fchmodSync(fd, 0o600);
    fs.writeFileSync(fd, inhalt, "utf8");
    fs.fsyncSync(fd);
  } catch (error) {
    if (fd !== undefined) fs.unlinkSync(target);
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function baueRuntimeManifest({ manifest, snapshot, belege }, paketBytes, jetzt = Date.now()) {
  const p = S.pruefeVorbereitung({ manifest, snapshot, belege }, paketBytes, jetzt);
  V.fordere(Date.parse(manifest.endeAm)-Date.parse(manifest.vorflugAm)<=4*3600000, "startsql-endwaechter-zeitfenster");
  return { version: MANIFEST_VERSION, profilManifestHash: V.hash(manifest),
    profilvertrag: manifest, startbelegeGrundlinie: p.startbelegeGrundlinie };
}

function pruefeGo(go, runtimeManifest, jetzt) {
  const m = runtimeManifest.profilvertrag, grund = runtimeManifest.startbelegeGrundlinie;
  V.fordere(exakt(go, ["version", "operationId", "manifestHash", "productionCommit", "aktion", "freigegebenAm",
    "aussteller", "primaerbeleg"])
    && go.version === "helmut-real500-aktivierungs-go/1" && go.operationId === m.operationId
    && go.manifestHash === V.hash(runtimeManifest) && go.productionCommit === grund.productionCommit
    && go.aktion === "EXAKT_500_REALPROFILE_AKTIVIEREN_UND_TEST_STARTEN"
    && typeof go.aussteller === "string" && go.aussteller.trim(), "startsql-separates-aktivierungs-go-fehlt");
  S.frisch(go.freigegebenAm, jetzt); S.referenz(go.primaerbeleg);
  return { freigegeben: true, operationId: go.operationId, manifestHash: go.manifestHash,
    productionCommit: go.productionCommit, belegHash: V.hash(go), freigegebenAm: go.freigegebenAm,
    primaerbeleg: go.primaerbeleg };
}

function baueEnvelope({ runtimeManifest, snapshot, belege, schritt = "vorbereiten", aktivierungsGo = null }, paketBytes, jetzt = Date.now()) {
  V.fordere(["vorbereiten", "aktivieren"].includes(schritt), "startsql-schritt");
  const m = runtimeManifest.profilvertrag;
  V.fordere(Date.parse(m.endeAm)-Date.parse(m.vorflugAm)<=4*3600000, "startsql-endwaechter-zeitfenster");
  let go = null, wach = null;
  if (schritt === "aktivieren") {
    S.pruefeRuntimeAktivierung({ runtimeManifest, snapshot, belege }, paketBytes, jetzt);
    go = pruefeGo(aktivierungsGo, runtimeManifest, jetzt);
    const w = belege.endwaechter;
    wach = { bereit: true, operationId: w.operationId, manifestHash: w.manifestHash,
      productionCommit: w.productionCommit, jobId: w.jobId, beobachtetAm: w.beobachtetAm,
      rpcHash: w.rpcHash, primaerbeleg: w.primaerbeleg };
  } else {
    V.fordere(aktivierungsGo === null, "startsql-vorbereitung-kein-aktivierungsrecht");
    S.pruefeRuntimeVorbereitung({ runtimeManifest, snapshot, belege }, paketBytes, jetzt);
  }
  const grundlinie = runtimeManifest.startbelegeGrundlinie;
  const startbelege = { version: "helmut-realkohorte500-startbelege/1", grundlinie,
    qualifizierteRechtsfreigabe: { freigegeben: true, qualifiziert: true, belegHash: grundlinie.phaseAHash,
      paketHash: V.PAKET_HASH, idsHash: V.IDS_HASH },
    fachfreigabe: { freigegeben: true, belegHash: grundlinie.fachHash, paketHash: V.PAKET_HASH, idsHash: V.IDS_HASH },
    aktivierungsGo: go, endwaechterBereit: wach };
  // SQL-Selbsthashes werden ausschliesslich serverseitig aus den exakt
  // eingebetteten JSONB-Werten berechnet. Ohne SQL sind dies keine Live-Hashes.
  return { version: VERSION, operationId: m.operationId, manifest: runtimeManifest,
    manifestHash: V.hash(runtimeManifest), manifestSqlHash: null, snapshot, snapshotSqlHash: null,
    quittung: null, quittungSqlHash: null, startbelege, startbelegeSqlHash: null, zustand: "vorbereitet" };
}

function baueSql(input, paketBytes, jetzt = Date.now()) {
  const e = baueEnvelope(input, paketBytes, jetzt), m = e.manifest.profilvertrag;
  const aktivieren = input.schritt === "aktivieren", slot = "realkohorte500-runtime-" + e.operationId;
  const grund = e.startbelege.grundlinie;
  const vorherBelege = { ...e.startbelege, aktivierungsGo: null, endwaechterBereit: null };
  const alleFrischenBelege = [m.vorflugAm, e.snapshot.beobachtetAm, input.belege.production.beobachtetAm,
    input.belege.ruhe.beobachtetAm, input.belege.kosten.beobachtetAm, input.belege.landesversorgung.beobachtetAm,
    ...(aktivieren ? [input.belege.endwaechter.beobachtetAm, input.aktivierungsGo.freigegebenAm] : [])];
  const body = `declare
  e jsonb := ${json(e)};
  vorher jsonb;
  q jsonb := null;
  n integer;
  vor_auth jsonb;
  vor_main jsonb;
begin
  if clock_timestamp() < ${literal(m.vorflugAm)}::timestamptz or clock_timestamp() >= ${literal(m.startBis)}::timestamptz
    or exists(select 1 from jsonb_array_elements_text(${json(alleFrischenBelege)}) x(am)
      where am::timestamptz > clock_timestamp() or clock_timestamp()-am::timestamptz>interval '1 minute') then
    raise exception 'real500-startsql-frischer-vorflug-fehlt';
  end if;
  select data into vor_auth from public.helmut_store where id='main-auth';
  select data into vor_main from public.helmut_store where id='main';
  if ${jsHash("vor_auth")} is distinct from ${literal(grund.authHash)}
    or ${jsHash("vor_main")} is distinct from ${literal(grund.mainHash)}
    or (select jsonb_agg(to_jsonb(p) order by user_id collate "C") from public.mandate_profiles p) is distinct from
      (select jsonb_agg(v order by v->>'user_id' collate "C") from jsonb_array_elements(e->'snapshot'->'mandate_profiles') x(v))
    or (select jsonb_agg(to_jsonb(p) order by id collate "C") from public.profiles p) is distinct from
      (select jsonb_agg(v order by v->>'id' collate "C") from jsonb_array_elements(e->'snapshot'->'profiles') x(v))
    or exists(select 1 from public.pipeline_locks where expires_at>clock_timestamp())
    or exists(select 1 from public.helmut_jobs where lease_expires_at>clock_timestamp() or status not in ('erledigt','fehlgeschlagen'))
    or exists(select 1 from public.process_runs where finished_at is null and status='running') then
    raise exception 'real500-startsql-null-grundlinie-ruhe-drift';
  end if;
  e := e||jsonb_build_object('manifestSqlHash',${sqlHash("e->'manifest'")},
    'snapshotSqlHash',${sqlHash("e->'snapshot'")},'startbelegeSqlHash',${sqlHash("e->'startbelege'")});
  ${aktivieren ? `vorher := helmut_real500_internal.pruefe(${literal(e.operationId)},${literal(e.manifestHash)},${literal(grund.productionCommit)});
  if vorher->>'zustand' is distinct from 'vorbereitet' or vorher->'manifest' is distinct from e->'manifest'
    or vorher->'snapshot' is distinct from e->'snapshot' or vorher->'startbelege' is distinct from ${json(vorherBelege)} then
    raise exception 'real500-startsql-prepared-cas';
  end if;
  update public.mandate_profiles set aktiv=true where user_id in
    (select jsonb_array_elements_text(e->'manifest'->'profilvertrag'->'ids')) and aktiv=false;
  get diagnostics n=row_count;
  if n<>500 or (select count(*) from public.mandate_profiles where aktiv)<>500 then
    raise exception 'real500-startsql-aktivierung-nicht-vollstaendig';
  end if;
  q := jsonb_build_object('version','helmut-realkohorte-500/1','operationId',${literal(e.operationId)},
    'manifest',e->'manifest'->'profilvertrag','zustand','aktiv','bestaetigtAktiv',500,
    'aktiviertAm',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  e := e||jsonb_build_object('zustand','aktiv','quittung',q,'quittungSqlHash',${sqlHash("q")});
  update public.helmut_store set data=e where id=${literal(slot)} and data=vorher;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'real500-startsql-aktiv-cas'; end if;` : `if exists(select 1 from public.helmut_store where id=${literal(slot)}) then
    raise exception 'real500-startsql-operation-bereits-verwendet';
  end if;
  insert into public.helmut_store(id,data) values(${literal(slot)},e);`}
  perform helmut_real500_internal.pruefe(${literal(e.operationId)},${literal(e.manifestHash)},${literal(grund.productionCommit)});
  if vor_auth is distinct from (select data from public.helmut_store where id='main-auth')
    or vor_main is distinct from (select data from public.helmut_store where id='main') then
    raise exception 'real500-startsql-auth-main-veraendert';
  end if;
end`;
  let tag = "$real500_start$", n = 0;
  while (body.includes(tag)) tag = `$real500_start_${++n}$`;
  return `-- NUR PRIVATE OFFLINE-VORBEREITUNG. NICHT AUSFUEHREN ohne konkrete Fach-/Betreiberfreigaben.
-- Schritt: ${aktivieren ? "GESONDERT FREIGEGEBENE AKTIVIERUNG vorbereitet" : "prepared0: KEIN Aktivierungsrecht, KEIN behaupteter lebender Waechter"}.
-- Bei unklarem Ausgang keine Wiederholung; nur gebunden frisch gegenlesen.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
lock table public.mandate_profiles,public.profiles,public.helmut_store,public.pipeline_locks,public.helmut_jobs,public.process_runs in share row exclusive mode;
do ${tag}
${body}
${tag};
commit;
`;
}

function main(argv) {
  V.fordere(argv.length === 4 && argv[0] === "--input" && argv[2] === "--out", "startsql-cli-argumente");
  const input = JSON.parse(fs.readFileSync(argv[1], "utf8"));
  V.fordere(Object.keys(input).every(k => ["runtimeManifest", "snapshot", "belege", "schritt", "aktivierungsGo"].includes(k)),
    "startsql-cli-eingabe");
  schreibePrivat(argv[3], baueSql(input, fs.readFileSync(PAKET)));
  console.log("Private Offline-Startvorbereitung (0600) erstellt. Nichts angewendet; Fachentscheidung/GO nicht durch Code bestaetigt.");
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error("Startvorbereitung verweigert: " + (/^real500-[a-z0-9-]+$/.test(error.message || "")
      ? error.message : "Eingabe/Beleg/Dateipfad ungueltig"));
    process.exitCode = 1;
  }
}
module.exports = { VERSION, MANIFEST_VERSION, baueRuntimeManifest, pruefeGo, baueEnvelope, baueSql, schreibePrivat, main };
