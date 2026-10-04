'use strict';
// Additive, offline-only native metadata input. The preimage itself is copied
// and sealed by the existing server-side Stage; this is NOT a JSONL manifest.
const crypto = require('node:crypto');
const N = require('./synthetik-500-native-preimage');
const G = require('../../scripts/import-preflight-500-sql-generator');
const I = require('../../scripts/synthetik-500-import');
const J = require('../../scripts/synthetik-500-native-import');
const VERSION = 'helmut-synthetik500-native-source-pin/1';
const SHA = /^[a-f0-9]{64}$/;
const isSha = x => typeof x === 'string' && SHA.test(x);
const contexts = new WeakMap();
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const canonical = x => JSON.stringify(G.kanonisch(x));
const exact = (x, keys) => x && typeof x === 'object' && !Array.isArray(x)
  && Object.keys(x).sort().join('|') === keys.slice().sort().join('|');
const requirePin = (ok, code) => { if (!ok) throw Error('synthetik500-native-pin-' + code); };
const same = (a, b) => canonical(a) === canonical(b);
const assertSql = (condition, code) => `do $$begin if ${condition} then raise exception 'synthetik500-native-pin-${code}';end if;end$$;\n`;

function aufnahmeSql(operationId) {
  requirePin(/^[a-z][a-z0-9-]{2,100}$/.test(operationId), 'operation');
  const scope = t => t === G.FREMD_TABELLE
    ? 'not exists(select 1 from public.mandate_profiles m where m.user_id=profiles.id)'
    : (t === 'profiles' ? 'id' : 'user_id') + ' in(select user_id from public.mandate_profiles)';
  const revisions = G.SNAPSHOT_TABELLEN.map(t => N.literal(t) + ',(' + N.revisionSql(t) + ')').join(',');
  const scoped = G.V2_SNAPSHOT_DATEIEN.map(t => N.literal(t) + ',(' + N.revisionSql(t === G.FREMD_TABELLE ? 'profiles' : t, { where: scope(t) }) + ')').join(',');
  return `begin transaction isolation level repeatable read read only;set local transaction_timeout='17s';set local statement_timeout='20s';set local lock_timeout='2s';set local search_path=pg_catalog,public;set local time zone 'UTC';
select jsonb_build_object('version',${N.literal(VERSION)},'operationId',${N.literal(operationId)},'observedAt',clock_timestamp(),
'catalog',(${N.catalogSql()}),'revisionen',jsonb_build_object(${revisions}),'scopeRevisionen',jsonb_build_object(${scoped}),
'mandatIds',(select jsonb_agg(user_id order by user_id)from public.mandate_profiles),
'fremdIds',(select jsonb_agg(id order by id)from public.profiles p where not exists(select 1 from public.mandate_profiles m where m.user_id=p.id)),
'mainAuth',(${mainAuthSql()}),'controls',(${controlsSql()}),'quiet',jsonb_build_object(
'jobs',(select count(*)from public.helmut_jobs where lease_expires_at>clock_timestamp()or status not in('erledigt','fehlgeschlagen')),
'locks',(select count(*)from public.pipeline_locks where expires_at>clock_timestamp()),
'processes',(select count(*)from public.process_runs where finished_at is null and status='running'),
'outbox',(select count(*)from public.helmut_job_outbox where status is null or status not in('bestaetigt','aufgegeben','verzichtet'))),
'migrationJournal',(${journalSql()}),'transaction',jsonb_build_object('readOnly',current_setting('transaction_read_only'),
'isolation',current_setting('transaction_isolation'),'transactionTimeout',current_setting('transaction_timeout'),
'statementTimeout',current_setting('statement_timeout'),'lockTimeout',current_setting('lock_timeout'),'snapshot',txid_current_snapshot()::text))as native_pin;commit;`;
}
function mainAuthSql() {
  return `select jsonb_build_object('rows',count(*),'fullFieldSha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(s)::text,E'\\n' order by s.id collate "C"),''),'UTF8')),'hex'),'xmins',coalesce(jsonb_agg(s.xmin::text order by s.id collate "C"),'[]'::jsonb))from public.helmut_store s where s.id='main-auth'`;
}
function controlsSql() { return 'select jsonb_build_object(' + N.STEUERUNG.map(t => N.literal(t) + ',(select count(*)from public.' + N.ident(t) + ')').join(',') + ')'; }
function journalSql() { return "select jsonb_build_object('count',count(*),'versions',coalesce(jsonb_agg(version order by version),'[]'::jsonb))from supabase_migrations.schema_migrations"; }

function pruefeNativePinEingabe({ paketBytes, nativePinBytes }) {
  requirePin((typeof nativePinBytes === 'string' || Buffer.isBuffer(nativePinBytes)) && Buffer.byteLength(nativePinBytes) > 0 && Buffer.byteLength(nativePinBytes) <= 4 * 1024 * 1024, 'bytes');
  const a = JSON.parse(String(nativePinBytes)), p = I.ladePaket(paketBytes);
  requirePin(exact(a, ['version','operationId','observedAt','catalog','revisionen','scopeRevisionen','mandatIds','fremdIds','mainAuth','controls','quiet','migrationJournal','transaction']) && a.version === VERSION, 'format');
  requirePin(/^[a-z][a-z0-9-]{2,100}$/.test(a.operationId) && typeof a.observedAt === 'string' && Number.isFinite(Date.parse(a.observedAt)), 'identity-clock');
  for (const [v, tables] of [[a.revisionen,G.SNAPSHOT_TABELLEN],[a.scopeRevisionen,G.V2_SNAPSHOT_DATEIEN]]) {
    requirePin(exact(v,tables) && tables.every(t => exact(v[t],['rows','revisionHash']) && Number.isSafeInteger(v[t].rows) && v[t].rows >= 0 && isSha(v[t].revisionHash)), 'revision-format');
  }
  const ids = { mandat:a.mandatIds, fremd:a.fremdIds }, freshIds = new Set(p.paket.profile.map(x => x.mandatsId));
  for (const [key, count] of [['mandat',500],['fremd',1]]) requirePin(Array.isArray(ids[key]) && ids[key].length === count && new Set(ids[key]).size === count && ids[key].every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id) && !freshIds.has(id)), 'ids');
  requirePin(!ids.mandat.includes(ids.fremd[0]) && a.revisionen.profiles.rows === 501 && a.revisionen.mandate_profiles.rows === 500 && a.scopeRevisionen.profiles.rows === 500 && a.scopeRevisionen.mandate_profiles.rows === 500 && a.scopeRevisionen.fremd_profiles.rows === 1, 'scope');
  requirePin(G.SNAPSHOT_TABELLEN.every(t => a.scopeRevisionen[t].rows <= a.revisionen[t].rows), 'scope-count');
  requirePin(exact(a.mainAuth,['rows','fullFieldSha256','xmins']) && a.mainAuth.rows === 1 && isSha(a.mainAuth.fullFieldSha256) && Array.isArray(a.mainAuth.xmins) && a.mainAuth.xmins.length === 1 && typeof a.mainAuth.xmins[0] === 'string' && /^\d{1,20}$/.test(a.mainAuth.xmins[0]), 'main-auth');
  requirePin(exact(a.controls,N.STEUERUNG) && N.STEUERUNG.every(t => Number.isSafeInteger(a.controls[t]) && a.controls[t] >= 0), 'controls');
  requirePin(exact(a.quiet,['jobs','locks','processes','outbox']) && Object.values(a.quiet).every(n => n === 0), 'quiet');
  const j = a.migrationJournal;
  requirePin(exact(j,['count','versions']) && Number.isSafeInteger(j.count) && j.count > 0 && j.count <= 1000 && Array.isArray(j.versions) && j.versions.length === j.count && new Set(j.versions).size === j.count && j.versions.every(x => typeof x === 'string' && /^\d{14}$/.test(x)) && same(j.versions,j.versions.slice().sort()), 'journal');
  const tr = a.transaction;
  requirePin(exact(tr,['readOnly','isolation','transactionTimeout','statementTimeout','lockTimeout','snapshot']) && tr.readOnly === 'on' && tr.isolation === 'repeatable read' && tr.transactionTimeout === '17s' && tr.statementTimeout === '20s' && tr.lockTimeout === '2s' && typeof tr.snapshot === 'string' && /^\d+:\d+:(?:\d+(?:,\d+)*)?$/.test(tr.snapshot), 'transaction');
  const c = a.catalog, tables = [...G.SNAPSHOT_TABELLEN,...N.STEUERUNG];
  requirePin(c && /^170\d{3}$/.test(c.serverVersion) && c.session && ['columns','relations','indexes','opclasses','types','constraints','collations','operators','comparators','triggers','policies','extensions'].every(k => Array.isArray(c[k])), 'catalog');
  requirePin(c.session.currentUser === c.session.sessionUser && /^\d+$/.test(String(c.session.roleOid)) && (c.session.superuser === true || c.session.bypassRls === true), 'actor');
  requirePin(c.relations.length === tables.length && same(c.relations.map(r => r.name).sort(),tables.slice().sort()) && c.relations.every(r => r.kind === 'r' && r.persistence === 'p' && r.partition === false && r.selectPrivilege === true && String(r.owner) === String(c.session.roleOid)), 'relations');
  const columns = {};
  for (const t of G.SNAPSHOT_TABELLEN) {
    const cols = c.columns.filter(x => x.table === t), primary = c.indexes.filter(x => x.table === t && x.primary);
    requirePin(primary.length === 1 && primary[0].unique === true && primary[0].valid === true && primary[0].ready === true && primary[0].immediate === true && !primary[0].predicate && /^\d+$/.test(primary[0].keys), 'single-pk');
    const k = cols.find(x => String(x.attnum) === primary[0].keys);
    requirePin(k && k.name === N.pk(t) && k.nullable === false && String(primary[0].collations) === String(k.collation) && c.opclasses.some(o => String(o.oid) === String(primary[0].opclasses) && o.opcdefault === true), 'pk-comparator');
    requirePin(cols.length > 0 && new Set(cols.map(x => x.name)).size === cols.length && cols.every(x => typeof x.name === 'string' && !x.identity && !x.generated && x.name !== '__native_xmin'), 'columns');
    columns[t] = cols.map(x => x.name);
  }
  const snapshotHash = hash(nativePinBytes), operationId = a.operationId;
  const binding = { version:'helmut-synthetik500-native-live-preimage/1',operationId,snapshotHash,paketBytesHash:p.paketBytesHash,nativePinSha256:snapshotHash,actorOwnerOid:String(c.session.roleOid),...I.projizierteBindung(p.paket) };
  const ctx = { p,sp:{ids,manifest:{operationId,sha256:snapshotHash,ids}},a,columns,binding,schema:'synthetik500_preimage_' + hash(operationId).slice(0,24),outer:'synthetik500-native-preimage-' + operationId,inner:'synthetik500-import-' + operationId };
  contexts.set(ctx,hash(canonical(ctx))); return ctx;
}
function erzeugeSql(ctx) {
  requirePin(contexts.has(ctx) && contexts.get(ctx) === hash(canonical(ctx)), 'context-drift');
  const sql = J.erzeugeSql(ctx), marker = `create schema ${N.ident(ctx.schema)};revoke all on schema`;
  requirePin(sql.stage.split(marker).length === 2, 'stage-marker');
  const controls = assertSql(`(${mainAuthSql()})is distinct from ${N.literal(canonical(ctx.a.mainAuth))}::jsonb`, 'main-auth-drift')
    + assertSql(`(${controlsSql()})is distinct from ${N.literal(canonical(ctx.a.controls))}::jsonb`, 'control-drift')
    + assertSql(`(${journalSql()})is distinct from ${N.literal(canonical(ctx.a.migrationJournal))}::jsonb`, 'journal-drift');
  sql.stage = sql.stage.replace(marker,() => controls + marker);
  requirePin(Buffer.byteLength(sql.stage) <= 4 * 1024 * 1024 && contexts.get(ctx) === hash(canonical(ctx)), 'generated-bound');
  return sql;
}
module.exports = { VERSION,aufnahmeSql,pruefeNativePinEingabe,erzeugeSql };
