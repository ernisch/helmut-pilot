"use strict";

// Reine Planung: kein DB-Client, kein Netz und keine Dateizugriffe. Historische
// Seeds werden nicht wieder angewendet. Bestehende Zeilen sind niemals UPDATE-Ziele.
const crypto = require("crypto");
const M = require("./model");

const VERSION = "helmut-quellen-ergaenzung-v1";
// Einzige ausdruecklich beauftragte Ergaenzung zwischen Bestandsobjekten:
// Bund-Basispaket soll auch den bestehenden Arbeit/Soziales-Ausschussweg enthalten.
// Kein allgemeiner Schalter zum Veraendern aktiver Bestands-Paketzuordnungen.
const APPROVED_EXISTING_LINKS = Object.freeze([
  Object.freeze({ package_id: "pkg-bund-basis", retrieval_path_id: "rp-ausschuss-arbeit-soziales" })
]);
const SPECS = Object.freeze({
  geographies: { alias: "geographies", pk: ["id"], columns: ["id", "level", "name", "parent_id", "ags"], required: ["id", "level", "name"], identity: ["id", "level", "parent_id"], enums: { level: M.GEO_LEVELS } },
  political_entities: { alias: "entities", pk: ["id"], columns: ["id", "entity_type", "name", "canonical_key", "level", "geography_id", "aliases"], required: ["id", "entity_type", "name"], identity: ["id", "entity_type"], arrays: ["aliases"], enums: { entity_type: M.ENTITY_TYPES, level: M.POLITICAL_LEVELS } },
  publishers: { alias: "publishers", pk: ["id"], columns: ["id", "name", "canonical_domain", "publisher_type", "evidence_role", "trust", "lifecycle_status", "entity_id"], required: ["id", "name", "publisher_type", "evidence_role", "trust", "lifecycle_status"], identity: ["id", "canonical_domain"], enums: { evidence_role: M.EVIDENCE_ROLES, trust: M.TRUST_LEVELS, lifecycle_status: M.PUBLISHER_LIFECYCLE } },
  source_packages: { alias: "packages", pk: ["id"], columns: ["id", "key", "name", "purpose", "status", "is_base", "political_level", "geography_id", "required_classes"], required: ["id", "key", "name", "status", "is_base"], identity: ["id", "key"], arrays: ["required_classes"], booleans: ["is_base"], enums: { status: M.PACKAGE_STATUS, political_level: M.POLITICAL_LEVELS } },
  retrieval_paths: { alias: "retrievalPaths", pk: ["id"], columns: ["id", "publisher_id", "legacy_source_id", "name", "method", "url", "query", "parser", "expected_frequency", "priority", "status", "activation_mode", "is_critical", "max_items", "represents_type"], required: ["id", "publisher_id", "method", "priority", "status", "activation_mode", "is_critical"], identity: ["id", "publisher_id", "legacy_source_id"], integers: ["priority", "max_items"], booleans: ["is_critical"], enums: { method: M.RETRIEVAL_METHODS, status: M.PATH_STATUS, activation_mode: M.ACTIVATION_MODES } },
  package_paths: { alias: "packagePaths", pk: ["package_id", "retrieval_path_id"], columns: ["package_id", "retrieval_path_id"] },
  path_expected_levels: { alias: "pathExpectedLevels", pk: ["retrieval_path_id", "level"], columns: ["retrieval_path_id", "level"], enums: { level: M.POLITICAL_LEVELS } },
  path_expected_geographies: { alias: "pathExpectedGeographies", pk: ["retrieval_path_id", "geography_id"], columns: ["retrieval_path_id", "geography_id"] },
  path_expected_topics: { alias: "pathExpectedTopics", pk: ["retrieval_path_id", "topic"], columns: ["retrieval_path_id", "topic"] },
  path_expected_entities: { alias: "pathExpectedEntities", pk: ["retrieval_path_id", "entity_id"], columns: ["retrieval_path_id", "entity_id"] }
});
const TABLES = Object.freeze(Object.keys(SPECS));
const FKS = Object.freeze([
  ["geographies", "parent_id", "geographies"],
  ["political_entities", "geography_id", "geographies"],
  ["publishers", "entity_id", "political_entities"],
  ["source_packages", "geography_id", "geographies"],
  ["retrieval_paths", "publisher_id", "publishers"],
  ["package_paths", "package_id", "source_packages"],
  ["package_paths", "retrieval_path_id", "retrieval_paths"],
  ...["levels", "geographies", "topics", "entities"].map((s) => [`path_expected_${s}`, "retrieval_path_id", "retrieval_paths"]),
  ["path_expected_geographies", "geography_id", "geographies"],
  ["path_expected_entities", "entity_id", "political_entities"]
]);
// Weiche Nutzungsverweise haben keinen FK. Sie muessen beim Rueckweg genauso
// sperren wie harte Referenzen. Keine dieser Tabellen wird beschrieben.
const SOFT_REFS = Object.freeze([
  ["raw_documents", "source_id", "source"], ["raw_documents", "publisher_id", "publisher"],
  ["document_findings", "source_id", "source"], ["document_findings", "retrieval_path_id", "source"],
  ["source_crawl_telemetry", "source_id", "source"],
  ["gate_shadow_events", "source_id", "source"], ["gate_shadow_events", "package_id", "package"],
  ["gate_shadow_events", "geografie", "geography"],
  ["llm_usage", "source_id", "source"], ["llm_usage", "package_id", "package"],
  ["knowledge_objects", "affected_geographies", "geography", "geography_id"],
  ["knowledge_objects", "mentioned_geographies", "geography", "geography_id"],
  ["knowledge_objects", "decision_entities", "entity", "entity_id"],
  ["knowledge_objects", "related_entities", "entity", "entity_id"]
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  return value;
}
function stringify(value) { return JSON.stringify(stable(value)); }
function digest(value) { return crypto.createHash("sha256").update(stringify(value)).digest("hex"); }
function fail(message) { throw new Error(`Quellen-Ergaenzungsplan: ${message}`); }
function pick(row, columns) { return Object.fromEntries(columns.map((c) => [c, row[c] === undefined ? null : row[c]])); }
function key(table, row) { return pick(row, SPECS[table].pk); }
function keyString(table, row) { return stringify(key(table, row)); }
function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function sortRows(table, rows) { return [...rows].sort((a, b) => compare(keyString(table, a), keyString(table, b))); }
function rowsByKey(table, rows) {
  const result = new Map();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) fail(`${table}: Zeile ist kein Objekt`);
    for (const k of SPECS[table].pk) if (typeof row[k] !== "string" || !row[k].trim() || row[k].includes("\0")) fail(`${table}: ungueltiger Primaerschluessel ${k}`);
    const k = keyString(table, row);
    if (result.has(k)) fail(`${table}: doppelter Primaerschluessel ${k}`);
    result.set(k, row);
  }
  return result;
}
function desiredRow(table, input) {
  const row = pick(input, SPECS[table].columns);
  for (const c of SPECS[table].arrays || []) row[c] = input[c] === undefined ? [] : input[c];
  if (table === "publishers") {
    row.trust = input.trust === undefined ? "unbekannt" : input.trust;
    row.lifecycle_status = input.lifecycle_status === undefined ? "active" : input.lifecycle_status;
  }
  if (table === "source_packages") { row.status = "prepared"; row.is_base = input.is_base === undefined ? false : input.is_base; }
  if (table === "retrieval_paths") {
    row.status = "paused";
    row.activation_mode = "manual";
    row.priority = input.priority === undefined ? 60 : input.priority;
    row.is_critical = input.is_critical === undefined ? false : input.is_critical;
    if (["api_xml", "opendata_xml"].includes(row.method)) row.method = "structured_download";
  }
  for (const c of SPECS[table].required || SPECS[table].pk) if (row[c] === null || row[c] === "") fail(`${table}: Pflichtwert ${c} fehlt`);
  for (const [c, value] of Object.entries(row)) {
    if (value === null) continue;
    if ((SPECS[table].arrays || []).includes(c)) {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.includes("\0"))) fail(`${table}.${c}: text[] erwartet`);
    } else if ((SPECS[table].booleans || []).includes(c)) {
      if (typeof value !== "boolean") fail(`${table}.${c}: boolean erwartet`);
    } else if ((SPECS[table].integers || []).includes(c)) {
      if (!Number.isSafeInteger(value) || value < -2147483648 || value > 2147483647) fail(`${table}.${c}: integer erwartet`);
    } else if (typeof value !== "string" || value.includes("\0")) fail(`${table}.${c}: text erwartet`);
    if (SPECS[table].enums?.[c] && !SPECS[table].enums[c].includes(value)) fail(`${table}.${c}: ungueltiger Wert ${value}`);
  }
  return row;
}
function readBaseline(input) {
  if (!input || input.complete !== true || !input.capturedAt || !Number.isFinite(Date.parse(input.capturedAt))) fail("Baseline braucht complete:true und capturedAt");
  const tables = input.tables;
  if (!tables || !input.counts) fail("Baseline braucht tables und exakte counts");
  for (const table of TABLES) {
    if (!Array.isArray(tables[table]) || !Number.isSafeInteger(input.counts[table]) || input.counts[table] !== tables[table].length) fail(`Baseline ${table}: fehlt oder unvollstaendig`);
    rowsByKey(table, tables[table]);
  }
  return Object.fromEntries(TABLES.map((t) => [t, sortRows(t, tables[t])]));
}
function normalizeDesired(input) {
  const tables = input?.tables || input;
  if (!tables || typeof tables !== "object") fail("Sollkatalog fehlt");
  const result = {};
  for (const [t, spec] of Object.entries(SPECS)) {
    const rows = tables[t] || tables[spec.alias] || [];
    if (!Array.isArray(rows)) fail(`Sollkatalog ${t}: Array erwartet`);
    rowsByKey(t, rows);
    result[t] = sortRows(t, rows.map((r) => desiredRow(t, r)));
  }
  return result;
}
function collisionCheck(tables) {
  for (const [table, column] of [["publishers", "canonical_domain"], ["source_packages", "key"]]) {
    const seen = new Map();
    for (const r of tables[table]) {
      if (r[column] === null || r[column] === undefined) continue;
      if (typeof r[column] !== "string" || !r[column].trim()) fail(`${table}.${column}: ungueltiger Wert`);
      const k = column === "canonical_domain" ? r[column].toLowerCase().replace(/^www\./, "") : r[column];
      if (seen.has(k) && seen.get(k) !== r.id) fail(`${table}: ${column}-Kollision ${k}`);
      seen.set(k, r.id);
    }
  }
}
function buildPlan(baselineInput, desiredInput) {
  const baseline = readBaseline(baselineInput);
  const desired = normalizeDesired(desiredInput);
  const existing = Object.fromEntries(TABLES.map((t) => [t, rowsByKey(t, baseline[t])]));
  const additions = Object.fromEntries(TABLES.map((t) => [t, desired[t].filter((r) => !existing[t].has(keyString(t, r)))]));
  const newIds = (t) => new Set(additions[t].map((r) => r.id));
  const newPaths = newIds("retrieval_paths"), newPackages = newIds("source_packages");
  const deferred = [];
  // Bestehende Wege an bestehende Pakete zu haengen kann sofort einen Crawl
  // aktivieren. Das ist eine eigene Bestandsaenderung, kein Ergaenzungs-Insert.
  additions.package_paths = additions.package_paths.filter((r) => {
    if (newPackages.has(r.package_id) || newPaths.has(r.retrieval_path_id)) return true;
    if (APPROVED_EXISTING_LINKS.some((a) => a.package_id === r.package_id && a.retrieval_path_id === r.retrieval_path_id)) return true;
    deferred.push({ table: "package_paths", key: key("package_paths", r), reason: "beide-endpunkte-bestehend" }); return false;
  });
  for (const t of TABLES.filter((t) => t.startsWith("path_expected_"))) additions[t] = additions[t].filter((r) => {
    if (newPaths.has(r.retrieval_path_id)) return true;
    deferred.push({ table: t, key: key(t, r), reason: "bestehender-abrufweg" }); return false;
  });
  const effective = Object.fromEntries(TABLES.map((t) => [t, [...baseline[t], ...additions[t]]]));
  collisionCheck(effective);
  // Auch gleicher PK mit anderer Domain/anderem Paketkey ist eine Identitaets-
  // kollision. Status-/URL-/Health-Abweichungen dagegen werden nur bewahrt.
  for (const [t, col] of [["publishers", "canonical_domain"], ["source_packages", "key"]]) for (const r of desired[t]) {
    const old = existing[t].get(keyString(t, r));
    if (old && (old[col] ?? null) !== (r[col] ?? null)) fail(`${t}: bestehende ID mit anderem ${col}: ${r.id}`);
  }
  const parentAssertions = new Map();
  for (const [child, column, parent] of FKS) for (const r of additions[child]) {
    if (r[column] === null) continue;
    const p = effective[parent].find((p) => p.id === r[column]);
    if (!p) fail(`${child}.${column}: Fremdschluessel fehlt (${r[column]})`);
    if (existing[parent].has(keyString(parent, p))) {
      const identity = pick(p, SPECS[parent].identity || SPECS[parent].pk);
      parentAssertions.set(`${parent}:${p.id}`, { table: parent, key: key(parent, p), expected: identity });
    }
  }
  // Fremde oder zyklische Geografie-Eltern duerfen kein unreviewbares SQL erzeugen.
  const geos = new Map(effective.geographies.map((r) => [r.id, r]));
  for (const g of additions.geographies) {
    const seen = new Set(); let at = g;
    while (at) { if (seen.has(at.id)) fail(`Geografie-Zyklus: ${g.id}`); seen.add(at.id); at = at.parent_id ? geos.get(at.parent_id) : null; }
  }
  const preserved = Object.fromEntries(TABLES.map((t) => [t, baseline[t].length]));
  const plan = {
    version: VERSION, baselineCapturedAt: baselineInput.capturedAt, baselineHash: digest(baseline),
    additions, parentAssertions: [...parentAssertions.values()].sort((a, b) => compare(stringify(a), stringify(b))),
    counts: Object.fromEntries(TABLES.map((t) => [t, additions[t].length])), preserved, deferred,
    approvedExistingLinks: additions.package_paths.filter((r) => !newPackages.has(r.package_id) && !newPaths.has(r.retrieval_path_id)),
    contract: { insertsOnly: true, newPackageStatus: "prepared", newPathStatus: "paused", newPathActivation: "manual", applyRequiresAbsence: true, rollbackRequiresReceipt: true, existingRowsUpdated: 0 }
  };
  return { ...plan, planHash: digest(plan) };
}
function checkedPlan(plan) {
  const { planHash, ...content } = plan || {};
  if (plan?.version !== VERSION || planHash !== digest(content)) fail("Planhash stimmt nicht");
  return plan;
}
function jsonLiteral(value) {
  const data = stringify(value); let tag = "$helmut_json$";
  while (data.includes(tag)) tag = tag.slice(0, -1) + "x$";
  return `${tag}${data}${tag}::jsonb`;
}
// Ein inneres JSON-Dollar-Literal schuetzt nicht den aeusseren DO-Delimiter.
// Der ganze Blockkoerper entscheidet daher ueber einen kollisionsfreien Tag.
function safeDoBlock(statement) {
  if (!statement.startsWith("do $check$") || !statement.endsWith("$check$;")) return statement;
  const body = statement.slice("do $check$".length, -"$check$;".length);
  let tag = "$helmut_do$";
  while (body.includes(tag)) tag = tag.slice(0, -1) + "x$";
  return `do ${tag}${body}${tag};`;
}
function rowEntries(plan) { return TABLES.flatMap((t) => plan.additions[t].map((r) => ({ table_name: t, pk: key(t, r), row_data: r }))); }
function schemaPreflight() {
  const columns = TABLES.flatMap((t) => SPECS[t].columns.map((c) => ({ table_name: t, column_name: c,
    udt_name: (SPECS[t].arrays || []).includes(c) ? "_text" : (SPECS[t].integers || []).includes(c) ? "int4" : (SPECS[t].booleans || []).includes(c) ? "bool" : "text" })));
  const pks = TABLES.map((t) => ({ table_name: t, columns: SPECS[t].pk }));
  const fks = [...FKS, ["electoral_districts", "geography_id", "geographies"]].map(([child, column, parent]) => ({ child, column_name: column, parent,
    delete_type: ["geographies", "political_entities", "publishers", "source_packages", "electoral_districts"].includes(child) ? "n" : "c" }));
  return `do $check$ begin
  if exists (select 1 from jsonb_to_recordset(${jsonLiteral(columns)}) x(table_name text,column_name text,udt_name text)
    where not exists (select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=x.table_name and c.column_name=x.column_name and c.udt_name=x.udt_name))
  then raise exception 'Quellenplan: erforderliches Schema fehlt'; end if;
  if exists(select 1 from jsonb_to_recordset(${jsonLiteral(pks)}) x(table_name text,columns jsonb)
    where not exists(select 1 from pg_constraint f join pg_class t on t.oid=f.conrelid join pg_namespace n on n.oid=t.relnamespace
      where f.contype='p' and n.nspname='public' and t.relname=x.table_name
      and (select jsonb_agg(a.attname order by k.ord) from unnest(f.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum)=x.columns))
    then raise exception 'Quellenplan: erwarteter Primaerschluessel fehlt'; end if;
  if exists(select 1 from jsonb_to_recordset(${jsonLiteral(fks)}) x(child text,column_name text,parent text,delete_type text)
    where not exists(select 1 from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace cn on cn.oid=c.relnamespace
      join pg_class p on p.oid=f.confrelid join pg_namespace pn on pn.oid=p.relnamespace
      join pg_attribute ca on ca.attrelid=c.oid and ca.attnum=f.conkey[1] join pg_attribute pa on pa.attrelid=p.oid and pa.attnum=f.confkey[1]
      where f.contype='f' and f.convalidated and cn.nspname='public' and pn.nspname='public' and c.relname=x.child and p.relname=x.parent
        and array_length(f.conkey,1)=1 and array_length(f.confkey,1)=1 and ca.attname=x.column_name and pa.attname='id' and f.confdeltype::text=x.delete_type))
    then raise exception 'Quellenplan: erwarteter Fremdschluessel fehlt oder weicht ab'; end if;
  if exists(select 1 from (values ('publishers','canonical_domain'),('source_packages','key')) x(table_name,column_name)
    where not exists(select 1 from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='public' and t.relname=x.table_name and i.indisunique and i.indisvalid and i.indnkeyatts=1
        and (select a.attname from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=t.oid and a.attnum=k.attnum where k.ord=1)=x.column_name
        and (i.indpred is null or (x.table_name='publishers' and pg_get_expr(i.indpred,i.indrelid)='(canonical_domain IS NOT NULL)'))))
    then raise exception 'Quellenplan: erwarteter eindeutiger Domain-/Paketindex fehlt'; end if;
end $check$;`;
}
function prologue(plan, operation) {
  return [`-- ${VERSION} ${operation}; Plan SHA256 ${plan.planHash}`,
    "-- Nur pruefbares SQL. Dieser Generator fuehrt es niemals aus.",
    "begin;", "set local lock_timeout = '3s';", "set local statement_timeout = '30s';", "set local search_path = pg_catalog, pg_temp;",
    `lock table ${TABLES.map((t) => `public.${t}`).sort().join(", ")} in share row exclusive mode;`,
    schemaPreflight(),
    "create temporary table helmut_quellen_delta (table_name text not null, pk jsonb not null, row_data jsonb not null, primary key(table_name,pk)) on commit drop;",
    `insert into helmut_quellen_delta select * from jsonb_to_recordset(${jsonLiteral(rowEntries(plan))}) x(table_name text,pk jsonb,row_data jsonb);`];
}
function applySQL(plan) {
  checkedPlan(plan);
  const out = prologue(plan, "APPLY");
  out.push(`do $check$ declare r record; actual jsonb; begin
  for r in select * from helmut_quellen_delta loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.pk;
    if actual is not null then raise exception 'Quellenplan: neue ID ist inzwischen vorhanden (% / %)',r.table_name,r.pk; end if;
  end loop;
  for r in select * from jsonb_to_recordset(${jsonLiteral(plan.parentAssertions)}) x("table" text,key jsonb,expected jsonb) loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r."table") into actual using r.key;
    if actual is null or not actual @> r.expected then raise exception 'Quellenplan: referenzierte Identitaet geaendert (% / %)',r."table",r.key; end if;
  end loop;
  if exists(select 1 from public.publishers p join helmut_quellen_delta d on d.table_name='publishers'
    and regexp_replace(lower(p.canonical_domain),'^www\\.','')=regexp_replace(lower(d.row_data->>'canonical_domain'),'^www\\.',''))
    then raise exception 'Quellenplan: Herausgeberdomain inzwischen belegt'; end if;
  if exists(select 1 from public.source_packages p join helmut_quellen_delta d on d.table_name='source_packages' and p.key=d.row_data->>'key')
    then raise exception 'Quellenplan: Paketkey inzwischen belegt'; end if;
end $check$;`);
  // Session-temporaer, kein neues permanentes Schema. Receipt erst NACH Commit
  // ausgeben, damit eine fehlgeschlagene Transaktion keinen Erfolg belegt.
  out.push("create temporary table helmut_quellen_receipt (table_name text not null, pk jsonb not null, row_data jsonb not null, primary key(table_name,pk)) on commit preserve rows;");
  for (const t of TABLES) {
    if (!plan.additions[t].length) continue;
    const cols = SPECS[t].columns.join(", ");
    const pkArgs = SPECS[t].pk.map((c) => `'${c}',added.${c}`).join(",");
    out.push(`with added as (
  insert into public.${t} (${cols})
    select ${cols} from jsonb_populate_recordset(null::public.${t},${jsonLiteral(plan.additions[t])})
  returning *
) insert into helmut_quellen_receipt select '${t}',jsonb_build_object(${pkArgs}),to_jsonb(added) from added;`);
  }
  out.push(`do $check$ begin
  if exists(select 1 from helmut_quellen_delta d left join helmut_quellen_receipt r using(table_name,pk) where r.row_data is null or exists(select 1 from jsonb_each(d.row_data) e where r.row_data->e.key is distinct from e.value))
    then raise exception 'Quellenplan: Insert-Nachbedingung verletzt'; end if;
end $check$;`, "commit;",
  `select jsonb_build_object('version','${VERSION}','planHash','${plan.planHash}','rows',coalesce(jsonb_agg(jsonb_build_object('table_name',table_name,'pk',pk,'row_data',row_data) order by table_name,pk::text),'[]'::jsonb)) as apply_receipt from helmut_quellen_receipt;`, "");
  return out.map(safeDoBlock).join("\n");
}
function softTargets(plan) {
  const a = plan.additions;
  return { source: [...new Set(a.retrieval_paths.flatMap((r) => [r.id, r.legacy_source_id]).filter(Boolean))], publisher: a.publishers.map((r) => r.id),
    package: [...new Set(a.source_packages.flatMap((r) => [r.id, r.key]))], geography: a.geographies.map((r) => r.id), entity: a.political_entities.map((r) => r.id) };
}
function validateReceipt(plan, receipt) {
  checkedPlan(plan);
  if (receipt?.version !== VERSION || receipt.planHash !== plan.planHash || !Array.isArray(receipt.rows)) fail("Apply-Receipt passt nicht zum Plan");
  const expected = new Map(rowEntries(plan).map((r) => [`${r.table_name}:${stringify(r.pk)}`, r]));
  if (receipt.rows.length !== expected.size) fail("Receipt unvollstaendig");
  for (const r of receipt.rows) {
    const k = `${r.table_name}:${stringify(r.pk)}`, want = expected.get(k);
    if (!want || !r.row_data || Object.entries(want.row_data).some(([c, v]) => stringify(r.row_data[c]) !== stringify(v))) fail("Receipt enthaelt fremde, doppelte oder abweichende Zeilen");
    expected.delete(k);
  }
  return receipt;
}
function rollbackSQL(plan, receipt) {
  checkedPlan(plan); if (receipt) validateReceipt(plan, receipt);
  const out = prologue(plan, "ROLLBACK");
  out.splice(2, 0, "-- Ohne passendes Apply-Receipt gesperrt. Alternativ Generator erneut mit --receipt DATEI aufrufen.",
    "-- Bei Nutzung der Vorlage: Receipt vorher in derselben SQL-Sitzung ueber set_config('helmut.quellen_ergaenzung_receipt', <JSON-Text>, false) setzen.");
  out.push("create temporary table helmut_quellen_undo (table_name text not null, pk jsonb not null, row_data jsonb not null, primary key(table_name,pk)) on commit drop;");
  const receiptExpr = receipt ? jsonLiteral(receipt) : "nullif(current_setting('helmut.quellen_ergaenzung_receipt',true),'')::jsonb";
  out.push(`do $check$ declare receipt jsonb := ${receiptExpr}; r record; actual jsonb; begin
  if receipt is null or receipt->>'version' is distinct from '${VERSION}' or receipt->>'planHash' is distinct from '${plan.planHash}' or jsonb_typeof(receipt->'rows') is distinct from 'array'
    then raise exception 'Quellenplan: passendes Apply-Receipt fehlt'; end if;
  insert into helmut_quellen_undo select * from jsonb_to_recordset(receipt->'rows') x(table_name text,pk jsonb,row_data jsonb);
  if (select count(*) from helmut_quellen_undo) <> (select count(*) from helmut_quellen_delta)
    or exists(select 1 from helmut_quellen_delta d full join helmut_quellen_undo u using(table_name,pk) where d.row_data is null or u.row_data is null or exists(select 1 from jsonb_each(d.row_data) e where u.row_data->e.key is distinct from e.value))
    then raise exception 'Quellenplan: Receipt-Menge oder Insertwerte weichen ab'; end if;
  for r in select * from helmut_quellen_undo loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.pk;
    if actual is distinct from r.row_data then raise exception 'Quellenplan: eingefuegte Zeile inzwischen veraendert oder entfernt (% / %)',r.table_name,r.pk; end if;
  end loop;
end $check$;`);
  // Eltern sind bereits gesperrt; danach alle eingehenden FK-Tabellen sperren.
  // Damit werden auch kuenftige FKs automatisch geprueft, einschliesslich SET NULL.
  out.push(`do $check$ declare r record; join_sql text; used boolean; begin
  for r in select distinct n.nspname,c.relname from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_class p on p.oid=f.confrelid join pg_namespace pn on pn.oid=p.relnamespace
    where f.contype='f' and pn.nspname='public' and p.relname in (select distinct table_name from helmut_quellen_undo)
    order by n.nspname,c.relname loop execute format('lock table %I.%I in share row exclusive mode',r.nspname,r.relname); end loop;
  for r in select f.*,cn.nspname child_schema,c.relname child_table,p.relname parent_table from pg_constraint f
    join pg_class c on c.oid=f.conrelid join pg_namespace cn on cn.oid=c.relnamespace
    join pg_class p on p.oid=f.confrelid join pg_namespace pn on pn.oid=p.relnamespace
    where f.contype='f' and pn.nspname='public' and p.relname in (select distinct table_name from helmut_quellen_undo) loop
    select string_agg(format('c.%I = p.%I',ca.attname,pa.attname),' and ' order by k.i) into join_sql
      from generate_subscripts(r.conkey,1) k(i) join pg_attribute ca on ca.attrelid=r.conrelid and ca.attnum=r.conkey[k.i]
      join pg_attribute pa on pa.attrelid=r.confrelid and pa.attnum=r.confkey[k.i];
    execute format('select exists(select 1 from %I.%I c join public.%I p on %s where exists(select 1 from helmut_quellen_undo u where u.table_name=%L and to_jsonb(p)=u.row_data) and not exists(select 1 from helmut_quellen_undo u where %L=''public'' and u.table_name=%L and to_jsonb(c)=u.row_data))',r.child_schema,r.child_table,r.parent_table,join_sql,r.parent_table,r.child_schema,r.child_table) into used;
    if used then raise exception 'Quellenplan: neue Fremdreferenz in %.%',r.child_schema,r.child_table; end if;
  end loop;
end $check$;`);
  const targets = softTargets(plan);
  const soft = SOFT_REFS.filter(([, , type]) => targets[type].length);
  if (soft.length) {
    out.push(`do $check$ declare r record; used boolean; condition text; begin
  for r in select * from jsonb_to_recordset(${jsonLiteral(soft.map(([table, column, type, jsonKey]) => ({ table_name: table, column_name: column, targets: targets[type], json_key: jsonKey || null })))}) x(table_name text,column_name text,targets jsonb,json_key text) order by table_name,column_name loop
    if not exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name)
      then raise exception 'Quellenplan: Nutzungsreferenz-Schema fehlt (%.%)',r.table_name,r.column_name; end if;
    execute format('lock table public.%I in share row exclusive mode',r.table_name);
    if r.json_key is null then condition := format('t.%I::text in (select jsonb_array_elements_text($1))',r.column_name);
    else condition := format('exists(select 1 from jsonb_array_elements_text($1) as ids(id) where coalesce(t.%I,''[]''::jsonb) @> jsonb_build_array(jsonb_build_object(%L,id)))',r.column_name,r.json_key); end if;
    execute format('select exists(select 1 from public.%I t where %s)',r.table_name,condition) into used using r.targets;
    if used then raise exception 'Quellenplan: bereits genutzt (%.%)',r.table_name,r.column_name; end if;
  end loop;
end $check$;`);
  }
  // Alle Guards laufen vor dem ersten Delete. Kindtabellen zuerst, immer nur
  // exakt die vollstaendigen, unveraenderten Receipt-Zeilen; niemals CASCADE SQL.
  for (const t of [...TABLES].reverse()) if (plan.additions[t].length) out.push(`delete from public.${t} t using helmut_quellen_undo u where u.table_name='${t}' and to_jsonb(t)=u.row_data;`);
  out.push(`do $check$ declare r record; actual jsonb; begin
  for r in select * from helmut_quellen_undo loop
    execute format('select to_jsonb(t) from public.%I t where to_jsonb(t) @> $1',r.table_name) into actual using r.pk;
    if actual is not null then raise exception 'Quellenplan: Ruecknahme unvollstaendig'; end if;
  end loop;
end $check$;`, "commit;", "");
  return out.map(safeDoBlock).join("\n");
}
function artifacts(baseline, desired, receipt) {
  const plan = buildPlan(baseline, desired);
  return { plan, applySql: applySQL(plan), rollbackSql: rollbackSQL(plan, receipt) };
}

module.exports = { VERSION, SPECS, TABLES, FKS, SOFT_REFS, APPROVED_EXISTING_LINKS, stable, stringify, digest, normalizeDesired, readBaseline, buildPlan, applySQL, rollbackSQL, validateReceipt, artifacts };
