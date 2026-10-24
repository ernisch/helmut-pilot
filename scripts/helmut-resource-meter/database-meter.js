'use strict';
// Pure fixed read-only SQL and exact counter arithmetic. Caller supplies an
// outer BEGIN READ ONLY and an exclusively owned isolated PostgreSQL17 server.
// Native snapshots are NOT labeled as exact lifetime physical peaks; the
// separate file-allocation tracer supplies the conservative storage bound.
function snapshotSQL() {
  return `SELECT jsonb_build_object(
    'schema','helmut-postgres-resource-snapshot/1',
    'atUTC',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'version',current_setting('server_version'),
    'walLSN',pg_current_wal_lsn()::text,
    'wal',(SELECT jsonb_object_agg(key,value) FROM pg_stat_wal s,LATERAL jsonb_each_text(to_jsonb(s))),
    'io',(SELECT coalesce(jsonb_agg((SELECT jsonb_object_agg(key,value) FROM jsonb_each_text(to_jsonb(s)))),'[]'::jsonb) FROM pg_stat_io s),
    'databases',(SELECT coalesce(jsonb_agg(jsonb_build_object('oid',d.oid::text,'name',d.datname,'sizeBytes',pg_database_size(d.oid)::text,
      'stats',(SELECT jsonb_object_agg(key,value) FROM pg_stat_database s,LATERAL jsonb_each_text(to_jsonb(s)) WHERE s.datid=d.oid))),'[]'::jsonb) FROM pg_database d WHERE NOT d.datistemplate),
    'walFiles',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',name,'sizeBytes',size::text)),'[]'::jsonb) FROM pg_ls_waldir()),
    'slots',(SELECT count(*)::text FROM pg_replication_slots),
    'externalTablespaces',(SELECT count(*)::text FROM pg_tablespace WHERE pg_tablespace_location(oid)<>''),
    'settings',jsonb_build_object('archiveMode',current_setting('archive_mode'),'walSegmentSize',current_setting('wal_segment_size'),'blockSize',current_setting('block_size')),
    'relationPersistence',(SELECT coalesce(jsonb_object_agg(relpersistence,amount),'{}'::jsonb) FROM (SELECT relpersistence,count(*)::text amount FROM pg_class WHERE relkind IN ('r','t','i') GROUP BY relpersistence) s)
  );`;
}
const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
function parseSnapshot(text) {
  const x = typeof text === 'string' ? JSON.parse(text) : structuredClone(text);
  if (x?.schema !== 'helmut-postgres-resource-snapshot/1' || !Number.isFinite(Date.parse(x.atUTC)) ||
      typeof x.version !== 'string' || !x.wal || !Array.isArray(x.io) || !Array.isArray(x.databases) ||
      !Array.isArray(x.walFiles) || !decimal(x.slots) || !x.settings || !x.relationPersistence) throw Error('DB_METER_SNAPSHOT_INVALID');
  lsn(x.walLSN);
  for (const key of ['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']) {
    if (!decimal(x.wal[key])) throw Error('DB_METER_WAL_COUNTER_INVALID');
  }
  for (const d of x.databases) if (typeof d.name !== 'string' || !decimal(d.oid) || !decimal(d.sizeBytes) || !d.stats) throw Error('DB_METER_DATABASE_INVALID');
  for (const f of x.walFiles) if (typeof f.name !== 'string' || !decimal(f.sizeBytes)) throw Error('DB_METER_WAL_FILE_INVALID');
  return x;
}
function lsn(text) {
  const m = typeof text === 'string' && /^([0-9a-fA-F]{1,8})\/([0-9a-fA-F]{1,8})$/.exec(text);
  if (!m) throw Error('DB_METER_LSN_INVALID');
  return (BigInt('0x' + m[1]) << 32n) + BigInt('0x' + m[2]);
}
function lsnDiffBytes(before, after) {
  const delta = lsn(after) - lsn(before);
  if (delta < 0n) throw Error('DB_METER_LSN_RESET');
  return delta.toString();
}
function difference(before, after) {
  if (!decimal(before) || !decimal(after)) throw Error('DB_METER_COUNTER_INVALID');
  const delta = BigInt(after) - BigInt(before);
  if (delta < 0n) throw Error('DB_METER_COUNTER_RESET');
  return delta.toString();
}
function summarize(before, after) {
  before = parseSnapshot(before); after = parseSnapshot(after);
  if (before.wal.stats_reset !== after.wal.stats_reset) throw Error('DB_METER_STATS_RESET');
  const wal = {};
  for (const k of ['wal_records','wal_fpi','wal_bytes','wal_buffers_full','wal_write','wal_sync']) wal[k] = difference(before.wal[k], after.wal[k]);
  return {schema: 'helmut-postgres-resource-delta/1', walLSNBytes: lsnDiffBytes(before.walLSN, after.walLSN), wal,
    beforeDatabaseSizes: before.databases.map(x => ({name: x.name, bytes: x.sizeBytes})),
    afterDatabaseSizes: after.databases.map(x => ({name: x.name, bytes: x.sizeBytes})),
    sampledDatabaseSizeIsNotLifetimePhysicalPeak: true,
    completeStorageBoundRequiresFileTracer: true,
    noGuaranteedProductionCostBoundFromMockObservationsAlone: true};
}
module.exports = {snapshotSQL, parseSnapshot, lsnDiffBytes, difference, summarize};
