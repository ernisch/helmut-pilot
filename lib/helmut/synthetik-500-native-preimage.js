'use strict';
// SQL-only: keine Clients, kein Netzwerk, keine Ausfuehrung oder Freigabe.
const G = require('../../scripts/import-preflight-500-sql-generator');
const VERSION = 'helmut-synthetik500-native-aufnahme/1';
const STEUERUNG = Object.freeze(['helmut_store','pipeline_locks','helmut_jobs','process_runs','helmut_job_outbox']);
const literal = value => "'" + String(value).replace(/'/g,"''") + "'";
const ident = value => '"' + String(value).replace(/"/g,'""') + '"';
const pk = table => ['mandate_profiles','matching_weights','profile_embeddings'].includes(table) ? 'user_id' : 'id';
const relation = (schema,table) => ident(schema)+'.'+ident(table);
const idsSql = ids => '('+ids.map(literal).join(',')+')';
function scope(manifest,name,alias='') {
  const table=name===G.FREMD_TABELLE?'profiles':name, key=table==='profiles'?'id':'user_id';
  return alias+ident(key)+' in '+idsSql(name===G.FREMD_TABELLE?manifest.ids.fremd:manifest.ids.mandat);
}
function revisionSql(table,{schema='public',where=null,versionColumn='xmin'}={}) {
  const key=ident(pk(table));
  return `select jsonb_build_object('rows',count(*),'revisionHash',encode(sha256(convert_to(coalesce(string_agg(jsonb_build_array(${key}::text,${ident(versionColumn)}::text)::text,E'\\n' order by ${key}),''),'UTF8')),'hex')) from ${relation(schema,table)}${where?' where '+where:''}`;
}
function catalogSql(schema='public',tables=[...G.SNAPSHOT_TABELLEN,...STEUERUNG]) {
  const names=tables.map(t=>literal(t)).join(','),ns=literal(schema);
  const rels=`select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=${ns} and c.relname in (${names})`;
  const types=`select a.atttypid from pg_attribute a where a.attrelid in (${rels}) and a.attnum>0 and not a.attisdropped`;
  const classes=`select unnest(i.indclass::oid[]) from pg_index i where i.indrelid in (${rels}) and i.indisprimary`;
  const families=`select o.opcfamily from pg_opclass o where o.oid in (${classes})`;
  return `select jsonb_build_object(
    'serverVersion',current_setting('server_version_num'),
    'session',(select jsonb_build_object('currentUser',current_user,'sessionUser',session_user,'rowSecurity',current_setting('row_security'),'roleOid',r.oid,'superuser',r.rolsuper,'bypassRls',r.rolbypassrls)from pg_roles r where r.rolname=current_user),
    'schema',(select jsonb_build_array(oid,nspname,nspowner)from pg_namespace where nspname=${ns}),
    'extensions',(select coalesce(jsonb_agg(jsonb_build_array(oid,extname,extnamespace,extversion)order by oid),'[]')from pg_extension),
    'relations',(select coalesce(jsonb_agg(jsonb_build_object('oid',c.oid,'name',c.relname,'kind',c.relkind,'filenode',c.relfilenode,'owner',c.relowner,'persistence',c.relpersistence,'partition',c.relispartition,'selectPrivilege',has_table_privilege(c.oid,'SELECT'),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity)order by c.relname),'[]')from pg_class c where c.oid in (${rels})),
    'columns',(select coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'attnum',a.attnum,'name',a.attname,'typeOid',a.atttypid,'typmod',a.atttypmod,'collation',a.attcollation,'nullable',not a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid))order by c.relname,a.attnum),'[]')from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid in (${rels}) and a.attnum>0 and not a.attisdropped),
    'types',(select coalesce(jsonb_agg(jsonb_build_array(t.oid,t.typnamespace,t.typname,t.typtype,t.typelem,t.typbasetype,t.typtypmod,t.typcollation,t.typnotnull,t.typdefault,t.typrelid,(select jsonb_agg(pg_get_constraintdef(c.oid)order by c.oid)from pg_constraint c where c.contypid=t.oid))order by t.oid),'[]')from pg_type t where t.oid in (${types}) or t.oid in(select ty.typelem from pg_type ty where ty.oid in (${types})) or t.oid in(select ty.typbasetype from pg_type ty where ty.oid in (${types}))),
    'constraints',(select coalesce(jsonb_agg(jsonb_build_object('oid',co.oid,'table',c.relname,'kind',co.contype,'referencedOid',co.confrelid,'deleteAction',co.confdeltype,'definition',pg_get_constraintdef(co.oid),'validated',co.convalidated)order by co.oid),'[]')from pg_constraint co join pg_class c on c.oid=co.conrelid where co.conrelid in (${rels})or co.confrelid in (${rels})),
    'indexes',(select coalesce(jsonb_agg(jsonb_build_object('oid',i.indexrelid,'table',c.relname,'primary',i.indisprimary,'unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready,'immediate',i.indimmediate,'keys',i.indkey::text,'collations',i.indcollation::text,'opclasses',i.indclass::text,'predicate',pg_get_expr(i.indpred,i.indrelid),'definition',pg_get_indexdef(i.indexrelid))order by i.indexrelid),'[]')from pg_index i join pg_class c on c.oid=i.indrelid where i.indrelid in (${rels})),
    'collations',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('actualVersion',pg_collation_actual_version(c.oid))order by c.oid),'[]')from pg_collation c where c.oid in(select a.attcollation from pg_attribute a where a.attrelid in (${rels}))or c.oid in(select unnest(i.indcollation::oid[])from pg_index i where i.indrelid in (${rels})and i.indisprimary)),
    'opclasses',(select coalesce(jsonb_agg(to_jsonb(o)order by o.oid),'[]')from pg_opclass o where o.oid in (${classes})),
    'operators',(select coalesce(jsonb_agg(jsonb_build_array(a.amopfamily,a.amoplefttype,a.amoprighttype,a.amopstrategy,a.amoppurpose,a.amopopr,a.amopmethod,o.oprcode,pg_get_functiondef(o.oprcode))order by a.oid),'[]')from pg_amop a join pg_operator o on o.oid=a.amopopr where a.amopfamily in (${families})),
    'comparators',(select coalesce(jsonb_agg(jsonb_build_array(a.amprocfamily,a.amproclefttype,a.amprocrighttype,a.amprocnum,a.amproc,pg_get_functiondef(a.amproc))order by a.oid),'[]')from pg_amproc a where a.amprocfamily in (${families})),
    'triggers',(select coalesce(jsonb_agg(jsonb_build_array(t.oid,t.tgrelid,t.tgenabled,pg_get_triggerdef(t.oid),pg_get_functiondef(t.tgfoid))order by t.oid),'[]')from pg_trigger t where t.tgrelid in (${rels})and not t.tgisinternal),
    'policies',(select coalesce(jsonb_agg(to_jsonb(p)order by p.oid),'[]')from pg_policy p where p.polrelid in (${rels})))`;
}
function aufnahmeSql(manifest) {
  if (!manifest?.ids?.mandat?.length || !/^[a-z][a-z0-9-]{2,100}$/.test(manifest.operationId)) throw Error('native-aufnahme-manifest');
  const revisions=G.SNAPSHOT_TABELLEN.map(t=>literal(t)+',('+revisionSql(t)+')').join(',');
  const scoped=G.V2_SNAPSHOT_DATEIEN.map(t=>literal(t)+',('+revisionSql(t===G.FREMD_TABELLE?'profiles':t,{where:scope(manifest,t)})+')').join(',');
  return `begin transaction read only;set local transaction_timeout='17s';set local statement_timeout='17s';
    select jsonb_build_object('version',${literal(VERSION)},'operationId',${literal(manifest.operationId)},'snapshotHash',${literal(manifest.sha256)},'paketBytesHash',${literal(manifest.paket.sha256)},'observedAt',clock_timestamp(),
    'catalog',(${catalogSql()}),'revisionen',jsonb_build_object(${revisions}),'scopeRevisionen',jsonb_build_object(${scoped}))as value;commit;`;
}
module.exports={VERSION,STEUERUNG,literal,ident,pk,relation,idsSql,scope,revisionSql,catalogSql,aufnahmeSql};
