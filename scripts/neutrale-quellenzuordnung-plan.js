"use strict";

// Eng begrenzte Bestandskorrektur, kein allgemeines Update-/Migrationswerkzeug.
// Nur lokale JSON/SQL-Erzeugung; niemals eine Datenbankverbindung oder Ausfuehrung.
const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/ergaenzungsplan");
const VERSION = "helmut-neutrale-quellenzuordnung-v1";
const CHANGE = Object.freeze([
  { action: "delete", table_name: "package_paths", pk: { package_id: "pkg-brandenburg-basis", retrieval_path_id: "rp-bb-partei_pilot" } },
  { action: "insert", table_name: "package_paths", pk: { package_id: "pkg-die-linke-brandenburg", retrieval_path_id: "rp-bb-partei_pilot" } },
  { action: "insert", table_name: "path_expected_geographies", pk: { retrieval_path_id: "rp-rbb24-politik", geography_id: "geo-land-brandenburg" } }
].map((r) => Object.freeze({ ...r, pk: Object.freeze(r.pk) })));
const eqKey = (a, b) => Object.keys(b).every((k) => a[k] === b[k]);
const fail = (s) => { throw new Error(`Quellenzuordnung: ${s}`); };
const json = (v) => {
  const text = P.stringify(v); let delimiter = "$zuordnung_json$";
  while (text.includes(delimiter)) delimiter = delimiter.slice(0, -1) + "x$";
  return `${delimiter}${text}${delimiter}::jsonb`;
};
const block = (body) => {
  let delimiter = "$zuordnung_do$";
  while (body.includes(delimiter)) delimiter = delimiter.slice(0, -1) + "x$";
  return `do ${delimiter}\n${body}\n${delimiter};`;
};
function buildPlan(baseline) {
  const tables = P.readBaseline(baseline);
  const changes = CHANGE.map((c) => {
    const found = tables[c.table_name].find((r) => eqKey(r, c.pk));
    if (c.action === "delete" && (!found || typeof found.created_at !== "string" || !Number.isFinite(Date.parse(found.created_at)))) fail("exakte alte Brandenburg-Basisbindung fehlt");
    if (c.action === "insert" && found) fail(`Zielzuordnung bereits vorhanden: ${P.stringify(c.pk)}`);
    return { ...c, row_data: found || { ...c.pk } };
  });
  const find = (t, id) => tables[t].find((r) => r.id === id) || fail(`referenzierte Identitaet fehlt: ${t}/${id}`);
  const base = find("source_packages", "pkg-brandenburg-basis"), party = find("source_packages", "pkg-die-linke-brandenburg");
  if (base.key !== "brandenburg-basis" || base.is_base !== true || party.key !== "die-linke-brandenburg" || party.is_base !== false) fail("Paketidentitaet stimmt nicht mit dem Neutralitaetsauftrag ueberein");
  if (party.status !== "prepared") fail("Ziel-Parteipaket muss vorbereitet und inaktiv bleiben");
  const own = find("retrieval_paths", "rp-bb-partei_pilot"), rbb = find("retrieval_paths", "rp-rbb24-politik");
  if (own.legacy_source_id !== "bb-partei_pilot" || rbb.legacy_source_id !== "rbb24-politik") fail("Abrufwegidentitaet weicht ab");
  const partyPublisher = find("publishers", own.publisher_id), rbbPublisher = find("publishers", rbb.publisher_id);
  if (partyPublisher.canonical_domain !== "dielinke-brandenburg.de" || partyPublisher.publisher_type !== "party" || partyPublisher.evidence_role !== "direct_interest") fail("Parteiquelle nicht eindeutig belegt");
  if (rbbPublisher.canonical_domain !== "rbb24.de" || rbbPublisher.evidence_role !== "journalistic") fail("rbb-Herausgeber nicht eindeutig belegt");
  const geo = find("geographies", "geo-land-brandenburg");
  if (geo.level !== "land" || base.geography_id !== geo.id || party.geography_id !== geo.id) fail("Brandenburg-Geografie weicht ab");
  const guard = (table_name, row, cols) => ({ table_name, pk: { id: row.id }, expected: Object.fromEntries(cols.map((k) => [k, row[k] ?? null])) });
  const parentAssertions = [
    ...[base, party].map((r) => guard("source_packages", r, ["id", "key", "is_base", "geography_id", "status"])),
    ...[own, rbb].map((r) => guard("retrieval_paths", r, ["id", "publisher_id", "legacy_source_id", "url", "method", "parser", "status", "activation_mode"])),
    ...[partyPublisher, rbbPublisher].map((r) => guard("publishers", r, ["id", "canonical_domain", "publisher_type", "evidence_role", "entity_id"])),
    guard("geographies", geo, ["id", "level", "parent_id"])
  ];
  const plan = { version: VERSION, baselineCapturedAt: baseline.capturedAt, baselineHash: P.digest(tables), changes, parentAssertions,
    effects: { deletedLinks: 1, insertedLinks: 2, changedSources: 0, changedPackageStatus: 0, activations: 0 },
    rollbackNote: "Der Rueckweg stellt die zuvor bestehende parteigebundene Basiszuordnung wieder her. Er ist eine Ruecknahme, keine neutrale Zielkonfiguration." };
  return { ...plan, planHash: P.digest(plan) };
}
function checkPlan(plan) {
  const { planHash, ...body } = plan || {};
  if (plan?.version !== VERSION || planHash !== P.digest(body)) fail("Planhash stimmt nicht");
  if (P.stringify(plan.changes.map(({ action, table_name, pk }) => ({ action, table_name, pk }))) !== P.stringify(CHANGE)) fail("Schreibbereich weicht von den drei beauftragten Tupeln ab");
}
function preamble(plan, kind) {
  const schemas = [
    { table_name: "package_paths", columns: ["package_id", "retrieval_path_id", "created_at"], pkey: ["package_id", "retrieval_path_id"] },
    { table_name: "path_expected_geographies", columns: ["retrieval_path_id", "geography_id"], pkey: ["retrieval_path_id", "geography_id"] }
  ];
  const fks = [
    { child: "package_paths", column_name: "package_id", parent: "source_packages" },
    { child: "package_paths", column_name: "retrieval_path_id", parent: "retrieval_paths" },
    { child: "path_expected_geographies", column_name: "retrieval_path_id", parent: "retrieval_paths" },
    { child: "path_expected_geographies", column_name: "geography_id", parent: "geographies" }
  ];
  return [`-- ${VERSION} ${kind}; SHA256 ${plan.planHash}`, "-- Exakt drei Relationszeilen; keine Quellen-/Paket-/Health-Updates.", "begin;",
    "set local lock_timeout='3s';", "set local statement_timeout='30s';", "set local search_path=pg_catalog,pg_temp;",
    "lock table public.geographies,public.package_paths,public.path_expected_geographies,public.publishers,public.retrieval_paths,public.source_packages in share row exclusive mode;",
    block(`declare r record; actual jsonb; begin
  for r in select * from jsonb_to_recordset(${json(schemas)}) x(table_name text,columns jsonb,pkey jsonb) loop
    if (select jsonb_agg(c.column_name order by c.ordinal_position) from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name) is distinct from r.columns
      or exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name and (c.udt_name<>case when c.column_name='created_at' then 'timestamptz' else 'text' end or c.is_nullable<>'NO'))
      then raise exception 'Quellenzuordnung: Relationsschema weicht ab'; end if;
    if not exists(select 1 from pg_constraint f where f.contype='p' and f.conrelid=format('public.%I',r.table_name)::regclass
      and (select jsonb_agg(a.attname order by k.ord) from unnest(f.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=f.conrelid and a.attnum=k.attnum)=r.pkey)
      then raise exception 'Quellenzuordnung: erwarteter Primaerschluessel fehlt'; end if;
  end loop;
  if exists(select 1 from jsonb_to_recordset(${json(fks)}) x(child text,column_name text,parent text)
    where not exists(select 1 from pg_constraint f join pg_attribute ca on ca.attrelid=f.conrelid and ca.attnum=f.conkey[1]
      join pg_attribute pa on pa.attrelid=f.confrelid and pa.attnum=f.confkey[1]
      where f.contype='f' and f.convalidated and f.conrelid=format('public.%I',x.child)::regclass and f.confrelid=format('public.%I',x.parent)::regclass
        and array_length(f.conkey,1)=1 and array_length(f.confkey,1)=1 and ca.attname=x.column_name and pa.attname='id' and f.confdeltype='c'))
    then raise exception 'Quellenzuordnung: erwarteter Fremdschluessel fehlt'; end if;
  if exists(select 1 from pg_trigger where not tgisinternal and tgrelid in ('public.package_paths'::regclass,'public.path_expected_geographies'::regclass))
    then raise exception 'Quellenzuordnung: unerwarteter Relationstrigger'; end if;
  if exists(select 1 from pg_constraint where contype='f' and confrelid in ('public.package_paths'::regclass,'public.path_expected_geographies'::regclass))
    then raise exception 'Quellenzuordnung: zusaetzliche FK-Abhaengigkeit auf Relationszeilen; separat pruefen'; end if;
  for r in select * from jsonb_to_recordset(${json(plan.parentAssertions)}) x(table_name text,pk jsonb,expected jsonb) loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.pk;
    if actual is null or exists(select 1 from jsonb_each(r.expected) e where actual->e.key is distinct from e.value)
      then raise exception 'Quellenzuordnung: Elternidentitaet inzwischen veraendert (% / %)',r.table_name,r.pk; end if;
  end loop;
end`),
    "create temporary table helmut_zuordnung_changes(action text not null,table_name text not null,pk jsonb not null,row_data jsonb not null,primary key(table_name,pk)) on commit drop;",
    `insert into helmut_zuordnung_changes select * from jsonb_to_recordset(${json(plan.changes)}) x(action text,table_name text,pk jsonb,row_data jsonb);`];
}
function applySQL(plan) {
  checkPlan(plan); const out = preamble(plan, "APPLY");
  out.push(block(`declare r record; actual jsonb; expected jsonb; begin
  for r in select * from helmut_zuordnung_changes loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.pk;
    if r.action='insert' and actual is not null then raise exception 'Quellenzuordnung: Zieltuple inzwischen vorhanden'; end if;
    if r.action='delete' then
      expected := to_jsonb(jsonb_populate_record(null::public.package_paths,r.row_data));
      if actual is distinct from expected then raise exception 'Quellenzuordnung: alte Basisbindung inzwischen veraendert/entfernt'; end if;
    end if;
  end loop;
end`),
  "create temporary table helmut_zuordnung_receipt(action text not null,table_name text not null,pk jsonb not null,row_data jsonb not null,primary key(table_name,pk)) on commit preserve rows;",
  "create temporary table helmut_zuordnung_time(applied_at timestamptz not null) on commit preserve rows; insert into helmut_zuordnung_time values(transaction_timestamp());");
  out.push(`with changed as (delete from public.package_paths where package_id='pkg-brandenburg-basis' and retrieval_path_id='rp-bb-partei_pilot' returning *)
insert into helmut_zuordnung_receipt select 'delete','package_paths',jsonb_build_object('package_id',package_id,'retrieval_path_id',retrieval_path_id),to_jsonb(changed) from changed;`);
  for (const c of CHANGE.filter((c) => c.action === "insert")) {
    const keys = Object.keys(c.pk), columns = c.table_name === "package_paths" ? [...keys, "created_at"] : keys;
    const values = c.table_name === "package_paths" ? [...keys, "transaction_timestamp()"] : keys;
    out.push(`with changed as (insert into public.${c.table_name}(${columns.join(",")}) select ${values.join(",")} from jsonb_populate_record(null::public.${c.table_name},${json(c.pk)}) returning *)
insert into helmut_zuordnung_receipt select 'insert','${c.table_name}',${json(c.pk)},to_jsonb(changed) from changed;`);
  }
  out.push(block(`begin
  if (select count(*) from helmut_zuordnung_receipt)<>3 then raise exception 'Quellenzuordnung: unerwartete Aenderungsmenge'; end if;
  if exists(select 1 from public.package_paths where package_id='pkg-brandenburg-basis' and retrieval_path_id='rp-bb-partei_pilot')
    or not exists(select 1 from public.package_paths where package_id='pkg-die-linke-brandenburg' and retrieval_path_id='rp-bb-partei_pilot')
    or not exists(select 1 from public.path_expected_geographies where retrieval_path_id='rp-rbb24-politik' and geography_id='geo-land-brandenburg')
    then raise exception 'Quellenzuordnung: Zielzustand nicht erreicht'; end if;
end`), "commit;",
  `select jsonb_build_object('version','${VERSION}','planHash','${plan.planHash}','appliedAt',(select applied_at from helmut_zuordnung_time),'rows',jsonb_agg(jsonb_build_object('action',action,'table_name',table_name,'pk',pk,'row_data',row_data) order by table_name,pk::text)) as apply_receipt from helmut_zuordnung_receipt;`, "");
  return out.join("\n");
}
function rollbackSQL(plan, receipt) {
  checkPlan(plan);
  if (receipt && (receipt.version !== VERSION || receipt.planHash !== plan.planHash)) fail("Receipt gehoert zu anderem Plan");
  const out = preamble(plan, "ROLLBACK");
  out.splice(1, 0, "-- Ohne Apply-Receipt gesperrt. Ruecknahme stellt den vorigen, politisch nicht neutralen Basislink wieder her.",
    "-- Receipt ueber --receipt DATEI einbetten oder set_config('helmut.neutrale_quellenzuordnung_receipt', <JSON-Text>, false) in derselben Sitzung setzen.");
  out.push("create temporary table helmut_zuordnung_undo(action text not null,table_name text not null,pk jsonb not null,row_data jsonb not null,primary key(table_name,pk)) on commit drop;");
  const receiptExpr = receipt ? json(receipt) : "nullif(current_setting('helmut.neutrale_quellenzuordnung_receipt',true),'')::jsonb";
  out.push(block(`declare receipt jsonb := ${receiptExpr}; r record; actual jsonb; expected jsonb; applied_at timestamptz; begin
  if receipt is null or receipt->>'version' is distinct from '${VERSION}' or receipt->>'planHash' is distinct from '${plan.planHash}' or jsonb_typeof(receipt->'rows') is distinct from 'array'
    then raise exception 'Quellenzuordnung: passendes Apply-Receipt fehlt'; end if;
  applied_at := (receipt->>'appliedAt')::timestamptz;
  if applied_at is null or applied_at > clock_timestamp() then raise exception 'Quellenzuordnung: Receiptzeit fehlt/liegt in Zukunft'; end if;
  insert into helmut_zuordnung_undo select * from jsonb_to_recordset(receipt->'rows') x(action text,table_name text,pk jsonb,row_data jsonb);
  if (select count(*) from helmut_zuordnung_undo)<>3 or exists(select 1 from helmut_zuordnung_changes c full join helmut_zuordnung_undo u using(table_name,pk)
    where c.action is distinct from u.action or c.row_data is null or u.row_data is null or not u.row_data @> c.pk)
    then raise exception 'Quellenzuordnung: Receipt-Menge weicht ab'; end if;
  for r in select * from helmut_zuordnung_undo loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.pk;
    if r.action='delete' then
      select to_jsonb(jsonb_populate_record(null::public.package_paths,c.row_data)) into expected from helmut_zuordnung_changes c where c.action='delete';
      if actual is not null or r.row_data is distinct from expected then raise exception 'Quellenzuordnung: alte Bindung wieder vorhanden/Receipt veraendert'; end if;
    elsif actual is distinct from r.row_data then raise exception 'Quellenzuordnung: neue Bindung inzwischen veraendert/entfernt'; end if;
  end loop;
  if applied_at is distinct from (select (row_data->>'created_at')::timestamptz from helmut_zuordnung_undo where action='insert' and table_name='package_paths')
    then raise exception 'Quellenzuordnung: Receiptzeit stimmt nicht mit Insertzeit ueberein'; end if;
  -- Nach der Umzuordnung genutzte Quellen zuerst betrieblich pruefen. Fruehere
  -- Telemetrie der gemeinsam genutzten rbb-Quelle ist kein Rollbackhindernis.
  lock table public.source_crawl_telemetry,public.raw_documents,public.document_findings,public.llm_usage,public.gate_shadow_events in share row exclusive mode;
  if exists(select 1 from public.source_crawl_telemetry where source_id in ('bb-partei_pilot','rp-bb-partei_pilot','rbb24-politik','rp-rbb24-politik') and created_at >= applied_at)
    or exists(select 1 from public.raw_documents where source_id in ('bb-partei_pilot','rp-bb-partei_pilot','rbb24-politik','rp-rbb24-politik') and greatest(created_at,retrieved_at) >= applied_at)
    or exists(select 1 from public.document_findings where (source_id in ('bb-partei_pilot','rp-bb-partei_pilot','rbb24-politik','rp-rbb24-politik') or retrieval_path_id in ('rp-bb-partei_pilot','rp-rbb24-politik')) and greatest(created_at,found_at) >= applied_at)
    or exists(select 1 from public.llm_usage where source_id in ('bb-partei_pilot','rp-bb-partei_pilot','rbb24-politik','rp-rbb24-politik') and created_at >= applied_at)
    or exists(select 1 from public.gate_shadow_events where source_id in ('bb-partei_pilot','rp-bb-partei_pilot','rbb24-politik','rp-rbb24-politik') and created_at >= applied_at)
    then raise exception 'Quellenzuordnung: seit Apply genutzte Quelle; Ruecknahme separat pruefen'; end if;
end`));
  out.push("delete from public.path_expected_geographies t using helmut_zuordnung_undo u where u.action='insert' and u.table_name='path_expected_geographies' and to_jsonb(t)=u.row_data;",
    "delete from public.package_paths t using helmut_zuordnung_undo u where u.action='insert' and u.table_name='package_paths' and to_jsonb(t)=u.row_data;",
    "insert into public.package_paths(package_id,retrieval_path_id,created_at) select r.package_id,r.retrieval_path_id,r.created_at from helmut_zuordnung_undo u cross join lateral jsonb_populate_record(null::public.package_paths,u.row_data) r where u.action='delete' and u.table_name='package_paths';",
    block(`declare r record; actual jsonb; begin
  for r in select * from helmut_zuordnung_undo loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.pk;
    if (r.action='insert' and actual is not null) or (r.action='delete' and actual is distinct from r.row_data) then raise exception 'Quellenzuordnung: Ruecknahme unvollstaendig'; end if;
  end loop;
end`), "commit;", "");
  return out.join("\n");
}
function artifacts(baseline, receipt) {
  const plan = buildPlan(baseline); return { plan, applySql: applySQL(plan), rollbackSql: rollbackSQL(plan, receipt) };
}
function main(argv = process.argv.slice(2)) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--help") { console.log("node scripts/neutrale-quellenzuordnung-plan.js --baseline SNAPSHOT.json --out VERZEICHNIS [--receipt APPLY-RECEIPT.json]\nErzeugt nur plan.json/apply.sql/rollback.sql fuer drei feste Relationszeilen; niemals SQL-Ausfuehrung."); return; }
    const name = argv[i]; if (!["--baseline", "--out", "--receipt"].includes(name) || !argv[i + 1] || argv[i + 1].startsWith("--") || opts[name.slice(2)]) fail(`unbekanntes/ungueltiges Argument ${name}`);
    opts[name.slice(2)] = argv[++i];
  }
  if (!opts.baseline || !opts.out) fail("--baseline und --out fehlen");
  const read = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = artifacts(read(opts.baseline), opts.receipt ? read(opts.receipt) : undefined), dir = path.resolve(opts.out);
  fs.mkdirSync(dir, { recursive: true });
  const files = { "plan.json": JSON.stringify(result.plan, null, 2) + "\n", "apply.sql": result.applySql, "rollback.sql": result.rollbackSql };
  for (const name of Object.keys(files)) if (fs.existsSync(path.join(dir, name))) fail(`Artefakt besteht bereits: ${name}`);
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body, { flag: "wx" });
  console.log(JSON.stringify({ planHash: result.plan.planHash, ...result.plan.effects, sqlExecuted: false, output: dir }, null, 2));
}
if (require.main === module) { try { main(); } catch (err) { console.error(err.message); process.exitCode = 1; } }
module.exports = { VERSION, CHANGE, buildPlan, applySQL, rollbackSQL, artifacts, main };
