"use strict";

// Enger Status-CAS nach dem vorhandenen Quellen-Cutover-Muster. Nur lokale
// SQL-Erzeugung: genau EUR-Lex und Bundespuls, kein DB-Client/Apply-Schalter.
const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/ergaenzungsplan");
const VERSION = "helmut-datenquellen-aktivierung-v1";
const TARGETS = Object.freeze([
  Object.freeze({ id: "rp-bundespuls-vorgaenge-rss", legacy: "bundespuls-vorgaenge-rss", publisher: "publisher-bundespuls.de", domain: "bundespuls.de", role: "aggregator", url: "https://bundespuls.de/feed/vorgang", package: "pkg-bund-basis", packageKey: "bund-basis", packageStatus: "active", mode: "auto" }),
  Object.freeze({ id: "rp-eurlex-amtsblatt-l-rss", legacy: "eurlex-amtsblatt-l-rss", publisher: "publisher-eur-lex.europa.eu", domain: "eur-lex.europa.eu", role: "official_primary", url: "https://eur-lex.europa.eu/DE/display-feed.rss?rssId=222", package: "pkg-fach-europaeische-union", packageKey: "fach-europaeische-union", packageStatus: "prepared", mode: "always_on" })
]);
const MUTATED = ["status", "activation_mode", "updated_at"];
const HEALTH = ["last_success_at", "last_error", "error_streak"];
const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const fail = (message) => { throw new Error(`Datenquellen-Aktivierung: ${message}`); };
function json(value) {
  const body = P.stringify(value); let tag = "$aktiv_json$";
  while (body.includes(tag)) tag = tag.slice(0, -1) + "x$";
  return `${tag}${body}${tag}::jsonb`;
}
function block(body) {
  let tag = "$aktiv_do$";
  while (body.includes(tag)) tag = tag.slice(0, -1) + "x$";
  return `do ${tag}\n${body}\n${tag};`;
}
function buildPlan(baseline) {
  const tables = P.readBaseline(baseline), changes = [], parents = [];
  for (const target of TARGETS) {
    const row = tables.retrieval_paths.find((r) => r.id === target.id);
    if (!row || row.legacy_source_id !== target.legacy || row.publisher_id !== target.publisher || row.url !== target.url
      || row.method !== "rss" || row.parser !== "rss-regex" || row.query !== null) fail(`Quellenidentitaet weicht ab: ${target.id}`);
    if (row.status !== "paused" || row.activation_mode !== "manual") fail(`Ausgangszustand ist nicht paused/manual: ${target.id}`);
    if (![...P.SPECS.retrieval_paths.columns, ...HEALTH, "created_at", "updated_at"].every((k) => Object.hasOwn(row, k))) fail(`unvollstaendige Pfadzeile: ${target.id}`);
    if (!["created_at", "updated_at"].every((k) => typeof row[k] === "string" && Number.isFinite(Date.parse(row[k])))) fail("vollstaendige Zeitstempel fehlen");
    const publisher = tables.publishers.find((r) => r.id === target.publisher);
    if (!publisher || publisher.canonical_domain !== target.domain || publisher.evidence_role !== target.role) fail(`Herausgeberidentitaet weicht ab: ${target.id}`);
    const pkg = tables.source_packages.find((r) => r.id === target.package);
    if (!pkg || pkg.key !== target.packageKey || pkg.status !== target.packageStatus) fail(`Paketvoraussetzung weicht ab: ${target.id}`);
    const links = tables.package_paths.filter((r) => r.retrieval_path_id === target.id);
    if (links.length !== 1 || links[0].package_id !== target.package) fail(`Paketbindung weicht ab: ${target.id}`);
    changes.push({ id: target.id, before_data: row, target_mode: target.mode });
    parents.push({ table_name: "publishers", id: publisher.id, expected: { id: publisher.id, canonical_domain: publisher.canonical_domain, evidence_role: publisher.evidence_role, publisher_type: publisher.publisher_type } },
      { table_name: "source_packages", id: pkg.id, expected: { id: pkg.id, key: pkg.key, status: pkg.status, is_base: pkg.is_base } });
  }
  const plan = { version: VERSION, baselineCapturedAt: baseline.capturedAt, baselineHash: P.digest(tables), changes, parentAssertions: parents,
    packageLinks: TARGETS.map((t) => ({ package_id: t.package, retrieval_path_id: t.id })),
    effects: { updatedRetrievalPaths: 2, writtenColumns: ["status", "activation_mode"], targetStatus: "needs_review", healthValuesWritten: 0, packagesWritten: 0, profilesWritten: 0 },
    prerequisites: ["PR1084 samt Quellen-Transportbedingungen gemergt und produktiv verifiziert", "Laufzeit sourceModeOn=true", "Ausdrueckliches Integrationssignal vor Production-Apply"],
    rollbackContract: "Nur diese zwei Wege auf paused/manual zuruecksetzen. Echte spaetere Abruf-/Healthwerte bleiben erhalten; Konfigurations-, Paket- oder Modusdrift sperrt. updated_at wird allein vom vorhandenen Trigger geschrieben." };
  return { ...plan, planHash: P.digest(plan) };
}
function checkPlan(plan) {
  const { planHash, ...body } = plan || {};
  if (plan?.version !== VERSION || planHash !== P.digest(body)) fail("Planhash stimmt nicht");
  if (P.stringify(plan.changes.map((c) => ({ id: c.id, mode: c.target_mode }))) !== P.stringify(TARGETS.map((t) => ({ id: t.id, mode: t.mode })))) fail("Schreibbereich weicht ab");
}
function validateReceipt(plan, receipt) {
  checkPlan(plan);
  if (receipt?.version !== VERSION || receipt.planHash !== plan.planHash || !Array.isArray(receipt.rows) || receipt.rows.length !== 2) fail("passendes Apply-Receipt fehlt");
  if (!Number.isFinite(Date.parse(receipt.appliedAt)) || new Set(receipt.rows.map((r) => r.id)).size !== 2) fail("Receiptzeit/Zeilen ungueltig");
  for (const c of plan.changes) {
    const r = receipt.rows.find((r) => r.id === c.id);
    if (!r || P.stringify(r.before_data) !== P.stringify(c.before_data) || r.after_data?.status !== "needs_review" || r.after_data?.activation_mode !== c.target_mode
      || P.stringify(omit(r.after_data, MUTATED)) !== P.stringify(omit(c.before_data, MUTATED)) || r.after_data.updated_at !== receipt.appliedAt) fail(`Receipt-Konfiguration weicht ab: ${c.id}`);
  }
  return receipt;
}
function preamble(plan, operation) {
  const ids = TARGETS.map((t) => `'${t.id}'`).join(",");
  return [`-- ${VERSION} ${operation}; Plan SHA256 ${plan.planHash}`,
    "-- Nur zwei Status-/Moduszeilen. Keine Pakete, Profile, Healthwerte, Budgets oder Cron schreiben.",
    "begin;", "set local lock_timeout='3s';", "set local statement_timeout='30s';", "set local search_path=pg_catalog,pg_temp;", "set local timezone='UTC';",
    "lock table public.package_paths in share mode;",
    block(`declare r record; actual jsonb; begin
  perform id from public.retrieval_paths where id in (${ids}) order by id for update;
  if not exists(select 1 from pg_constraint c where c.conrelid='public.retrieval_paths'::regclass and c.contype='p'
    and (select array_agg(a.attname::text order by k.ord) from unnest(c.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array['id'])
    then raise exception 'Aktivierung: Pfadprimaerschluessel fehlt'; end if;
  -- Derselbe bekannte Zeitstempeltrigger wie im Livekatalog; fremde Seiteneffekte ablehnen.
  if (select count(*) from pg_trigger where tgrelid='public.retrieval_paths'::regclass and not tgisinternal)<>1
    or not exists(select 1 from pg_trigger g join pg_proc p on p.oid=g.tgfoid join pg_namespace n on n.oid=p.pronamespace
      where g.tgrelid='public.retrieval_paths'::regclass and not g.tgisinternal and g.tgname='set_updated_at' and g.tgtype=19 and g.tgenabled in ('O','A')
        and n.nspname='public' and p.proname='helmut_set_updated_at' and regexp_replace(lower(p.prosrc),'[[:space:]]','','g')='beginnew.updated_at=now();returnnew;end;')
    then raise exception 'Aktivierung: unbekannter/fehlender Zeitstempeltrigger'; end if;
  if exists(select 1 from pg_rewrite where ev_class='public.retrieval_paths'::regclass)
    then raise exception 'Aktivierung: unerwartete Schreibregel'; end if;
  for r in select * from jsonb_to_recordset(${json(plan.parentAssertions)}) x(table_name text,id text,expected jsonb) loop
    execute format('select to_jsonb(t) from public.%I t where id=$1 for share',r.table_name) into actual using r.id;
    if actual is null or exists(select 1 from jsonb_each(r.expected) e where actual->e.key is distinct from e.value)
      then raise exception 'Aktivierung: Elternvoraussetzung geaendert (% / %)',r.table_name,r.id; end if;
  end loop;
  if (select coalesce(jsonb_agg(jsonb_build_object('package_id',package_id,'retrieval_path_id',retrieval_path_id) order by retrieval_path_id),'[]'::jsonb) from public.package_paths where retrieval_path_id in (${ids}))
    is distinct from ${json(plan.packageLinks)} then raise exception 'Aktivierung: Paketbindungen geaendert'; end if;
end`),
    "create temporary table helmut_datenaktiv_delta(id text primary key,before_data jsonb not null,target_mode text not null) on commit drop;",
    `insert into helmut_datenaktiv_delta select id,before_data,target_mode from jsonb_to_recordset(${json(plan.changes)}) x(id text,before_data jsonb,target_mode text);`,
    block(`begin
  if exists(select 1 from helmut_datenaktiv_delta where before_data is distinct from to_jsonb(jsonb_populate_record(null::public.retrieval_paths,before_data)))
    then raise exception 'Aktivierung: unvollstaendige/nichtkanonische Baseline oder Schemadrift'; end if;
end`)];
}
function receiptSelect(plan, table, kind) {
  return `select jsonb_build_object('version','${VERSION}','planHash','${plan.planHash}','operation','${kind}','appliedAt',min(after_data->>'updated_at'),'rows',jsonb_agg(jsonb_build_object('id',id,'before_data',before_data,'after_data',after_data) order by id)) as ${kind}_receipt from ${table};`;
}
function applySQL(plan) {
  checkPlan(plan); const out = preamble(plan, "APPLY");
  out.push(block(`declare r record; actual jsonb; begin
  for r in select * from helmut_datenaktiv_delta loop
    select to_jsonb(t) into actual from public.retrieval_paths t where id=r.id;
    if actual is distinct from r.before_data then raise exception 'Aktivierung: Ausgangszeile geaendert/entfernt (%)',r.id; end if;
  end loop;
end`),
    "create temporary table helmut_datenaktiv_receipt(id text primary key,before_data jsonb not null,after_data jsonb not null) on commit preserve rows;",
    `with changed as (
  update public.retrieval_paths p set status='needs_review',activation_mode=d.target_mode
  from helmut_datenaktiv_delta d where p.id=d.id and to_jsonb(p)=d.before_data returning p.*
) insert into helmut_datenaktiv_receipt select d.id,d.before_data,to_jsonb(c) from changed c join helmut_datenaktiv_delta d on d.id=c.id;`,
    block(`begin
  if (select count(*) from helmut_datenaktiv_receipt)<>2 or exists(select 1 from helmut_datenaktiv_delta d left join helmut_datenaktiv_receipt r using(id)
    where r.after_data is null or r.after_data->>'status'<>'needs_review' or r.after_data->>'activation_mode'<>d.target_mode
      or r.after_data-array['status','activation_mode','updated_at'] is distinct from r.before_data-array['status','activation_mode','updated_at']
      or (r.after_data->>'updated_at')::timestamptz is distinct from transaction_timestamp())
    then raise exception 'Aktivierung: zwei exakte Statusaenderungen nicht belegt'; end if;
end`), "commit;", receiptSelect(plan, "helmut_datenaktiv_receipt", "apply"), "");
  return out.join("\n");
}
function rollbackSQL(plan, receipt) {
  checkPlan(plan); if (receipt) validateReceipt(plan, receipt);
  const out = preamble(plan, "ROLLBACK"), value = receipt ? json(receipt) : "nullif(current_setting('helmut.datenquellen_aktivierung_receipt',true),'')::jsonb";
  out.splice(1, 0, "-- Receipt erforderlich. Pausiert nur die beiden aktivierten Wege; spaetere echte Healthwerte bleiben erhalten.");
  out.push("create temporary table helmut_datenaktiv_undo(id text primary key,before_data jsonb not null,after_data jsonb not null) on commit drop;",
    "create temporary table helmut_datenaktiv_live(id text primary key,before_data jsonb not null,after_data jsonb) on commit preserve rows;",
    block(`declare receipt jsonb := ${value}; r record; actual jsonb; begin
  if receipt is null or receipt->>'version' is distinct from '${VERSION}' or receipt->>'planHash' is distinct from '${plan.planHash}' or jsonb_typeof(receipt->'rows') is distinct from 'array'
    then raise exception 'Aktivierung: passendes Apply-Receipt fehlt'; end if;
  insert into helmut_datenaktiv_undo select * from jsonb_to_recordset(receipt->'rows') x(id text,before_data jsonb,after_data jsonb);
  if (select count(*) from helmut_datenaktiv_undo)<>2 or exists(select 1 from helmut_datenaktiv_delta d full join helmut_datenaktiv_undo u using(id)
    where d.id is null or u.id is null or u.before_data is distinct from d.before_data
      or u.after_data->>'status' is distinct from 'needs_review' or u.after_data->>'activation_mode' is distinct from d.target_mode
      or u.after_data-array['status','activation_mode','updated_at'] is distinct from d.before_data-array['status','activation_mode','updated_at']
      or (u.after_data->>'updated_at')::timestamptz is distinct from (receipt->>'appliedAt')::timestamptz)
    or (receipt->>'appliedAt')::timestamptz is null or (receipt->>'appliedAt')::timestamptz > clock_timestamp()
    then raise exception 'Aktivierung: Receiptmenge/-konfiguration weicht ab'; end if;
  for r in select * from helmut_datenaktiv_undo loop
    select to_jsonb(t) into actual from public.retrieval_paths t where id=r.id;
    if actual is null or actual->>'status' not in ('needs_review','healthy','degraded','broken')
      or actual-array['status','updated_at','last_success_at','last_error','error_streak'] is distinct from r.after_data-array['status','updated_at','last_success_at','last_error','error_streak']
      then raise exception 'Aktivierung: Konfiguration/Modus inzwischen geaendert (%)',r.id; end if;
    insert into helmut_datenaktiv_live values(r.id,actual,null);
  end loop;
end`),
    `with changed as (
  update public.retrieval_paths p set status='paused',activation_mode='manual'
  from helmut_datenaktiv_live l where p.id=l.id and to_jsonb(p)=l.before_data returning p.*
) update helmut_datenaktiv_live l set after_data=to_jsonb(c) from changed c where l.id=c.id;`,
    block(`begin
  if (select count(*) from helmut_datenaktiv_live where after_data is not null)<>2 or exists(select 1 from helmut_datenaktiv_live
    where after_data->>'status'<>'paused' or after_data->>'activation_mode'<>'manual'
      or after_data-array['status','activation_mode','updated_at'] is distinct from before_data-array['status','activation_mode','updated_at'])
    then raise exception 'Aktivierung: Ruecknahme unvollstaendig oder Healthwerte veraendert'; end if;
end`), "commit;", receiptSelect(plan, "helmut_datenaktiv_live", "rollback"), "");
  return out.join("\n");
}
function artifacts(baseline, receipt) {
  const plan = buildPlan(baseline); return { plan, applySql: applySQL(plan), rollbackSql: rollbackSQL(plan, receipt) };
}
function main(argv = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help") { console.log("node scripts/datenquellen-aktivierungsplan.js --baseline SNAPSHOT.json --out VERZEICHNIS [--receipt RECEIPT.json]\nNur lokale Erzeugung fuer EUR-Lex und Bundespuls; niemals SQL-Ausfuehrung."); return; }
    const key = argv[i]; if (!["--baseline", "--out", "--receipt"].includes(key) || !argv[i + 1] || argv[i + 1].startsWith("--") || opts[key.slice(2)]) fail(`ungueltiges Argument ${key}`);
    opts[key.slice(2)] = argv[++i];
  }
  if (!opts.baseline || !opts.out) fail("--baseline und --out fehlen");
  const read = (f) => JSON.parse(fs.readFileSync(path.resolve(f), "utf8"));
  const result = artifacts(read(opts.baseline), opts.receipt ? read(opts.receipt) : undefined), dir = path.resolve(opts.out);
  const files = { "plan.json": JSON.stringify(result.plan, null, 2) + "\n", "apply.sql": result.applySql, "rollback.sql": result.rollbackSql };
  fs.mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(files)) if (fs.existsSync(path.join(dir, name))) fail(`Artefakt besteht bereits: ${name}`);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, { flag: "wx" });
  console.log(JSON.stringify({ planHash: result.plan.planHash, updatedRetrievalPaths: 2, healthValuesWritten: 0, sqlExecuted: false, output: dir }, null, 2));
}
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { VERSION, TARGETS, MUTATED, HEALTH, buildPlan, validateReceipt, applySQL, rollbackSQL, artifacts, main };
