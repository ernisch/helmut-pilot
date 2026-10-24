\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='1s';
-- No forced stats flush/reset. Counters are sampled observations, not exclusive
-- attribution; asynchronous PostgreSQL statistics may lag a cycle boundary.
SELECT jsonb_build_object('at',clock_timestamp(),'walLSN',pg_current_wal_lsn()::text,
 'walInsertLSN',pg_current_wal_insert_lsn()::text,
 'wal',(SELECT to_jsonb(w) FROM pg_stat_wal w),
 'database',(SELECT jsonb_build_object('tempFiles',temp_files,'tempBytes',temp_bytes,
  'blocksRead',blks_read,'blocksHit',blks_hit,'tuplesInserted',tup_inserted,
  'tuplesUpdated',tup_updated,'tuplesDeleted',tup_deleted,'statsReset',stats_reset)
  FROM pg_stat_database WHERE datname=current_database()));
ROLLBACK;
