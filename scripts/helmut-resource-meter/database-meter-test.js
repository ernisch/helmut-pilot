'use strict';
const assert = require('node:assert/strict'), M = require('./database-meter');
function fixture() {
  return {schema: 'helmut-postgres-resource-snapshot/1', atUTC: '2026-10-16T19:00:00.000Z', version: '17.6', walLSN: '1/FFFFFFFE',
    wal: {wal_records: '9007199254740993', wal_fpi: '0', wal_bytes: '9007199254740994', wal_buffers_full: '0', wal_write: '1', wal_sync: '1', stats_reset: null},
    io: [], databases: [{oid: '5', name: 'postgres', sizeBytes: '123456', stats: {}}], walFiles: [], slots: '0', settings: {}, relationPersistence: {p: '1'}};
}
let cases = 0;
assert.equal(M.lsnDiffBytes('1/FFFFFFFE', '2/2'), '4'); cases++;
assert.equal(M.difference('9007199254740993', '9007199254740995'), '2'); cases++;
assert.throws(() => M.lsnDiffBytes('2/0', '1/0'), /RESET/); cases++;
assert.throws(() => M.difference('2','1'), /RESET/); cases++;
assert.throws(() => M.parseSnapshot({}), /INVALID/); cases++;
const a=fixture(), b=fixture(); b.walLSN='2/2'; b.wal.wal_records='9007199254740995';
const d=M.summarize(a,b); assert.equal(d.wal.wal_records,'2'); assert.equal(d.walLSNBytes,'4');
assert.equal(d.sampledDatabaseSizeIsNotLifetimePhysicalPeak,true); cases++;
b.wal.stats_reset='changed';assert.throws(()=>M.summarize(a,b),/STATS_RESET/); cases++;
assert(!/\b(?:UPDATE|INSERT|DELETE|CREATE|DROP|CHECKPOINT|pg_stat_reset)\b/i.test(M.snapshotSQL()));cases++;
console.log(JSON.stringify({pass:true,smallCounterCases:cases,full500Runs:0}));
