"use strict";

// Local test telemetry only. No Auth call, retry, GC or authority is introduced.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");
const Auth = require("./w15-auth-measurement-report");
function startTicks(pid) {
  const s = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  return s.slice(s.lastIndexOf(") ") + 2).split(" ")[19];
}
function open(state, phase) {
  assert(/^(run|prepare|signal-proof|eu-component)$/.test(phase));
  const directory = fs.lstatSync(state);
  assert(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o777) === 0o700);
  const fd = fs.openSync(path.join(state, `${phase}-observations.SAFE.jsonl`), "wx", 0o600);
  let sequence = 0;
  function write(name, value) {
    const line = JSON.stringify({ sequence: sequence++, atUTC: new Date().toISOString(), atMs: performance.now(), name, ...value }) + "\n";
    fs.writeFileSync(fd, line); fs.fdatasyncSync(fd);
  }
  const identity = { pid: process.pid, startTicks: startTicks(process.pid), phase };
  write("process-start", identity);
  function ready() {
    assert(process.listenerCount("SIGTERM") > 0, "w15-stop-handler-not-installed");
    fs.writeFileSync(path.join(state, `${phase}.node.SAFE.json`), JSON.stringify(identity), { flag: "wx", mode: 0o600 });
  }
  function observe(observation) {
    // Decorate measurement rows, never the business APIs. The original observer
    // and assessment enforce the selected real storage path. A pending row serializes without times.
    for (const key of ["mutations", "usageSinks", "casWrites"]) {
      const rows = observation[key];
      assert(Array.isArray(rows));
      const push = rows.push;
      Object.defineProperty(rows, "push", { value: function(...values) {
        for (const row of values) {
          let wallMs;
          Object.defineProperty(row, "wallMs", { enumerable: true, configurable: true,
            get: () => wallMs, set: value => { wallMs = value;
              write("auth-finished", { collection: key, row, authTimings: Auth.summarize(observation) }); } });
        }
        const length = push.apply(this, values);
        for (const row of values) write("auth-started", { collection: key, row });
        return length;
      }, configurable: true });
    }
    write("auth-observer-attached", { authTimings: Auth.summarize(observation) });
  }
  return { write, observe, identity, ready };
}
function databaseStatsSQL() {
  return "select jsonb_build_object('active',(select count(*)from public.mandate_profiles where aktiv),"
    +"'tempBytes',temp_bytes,'tempFiles',temp_files,'walBytes',(select wal_bytes::text from pg_stat_wal),"
    +"'walPhysicalBytes',(select sum(size)from pg_ls_waldir()where name~'^[0-9A-F]{24}$'),"
    +"'walOldest',(select min(name)from pg_ls_waldir()where name~'^[0-9A-F]{24}$'),"
    +"'walNewest',(select max(name)from pg_ls_waldir()where name~'^[0-9A-F]{24}$'),"
    +"'replicationSlots',(select count(*)from pg_replication_slots),"
    +"'checkpoints',(select num_timed+num_requested from pg_stat_checkpointer),"
    +"'usageBytes',pg_total_relation_size('public.llm_usage'),'usageToastBytes',(select pg_total_relation_size(reltoastrelid)from pg_class where oid='public.llm_usage'::regclass),"
    +"'storeBytes',pg_total_relation_size('public.helmut_store'),'briefingBytes',pg_total_relation_size('public.briefings'),"
    +"'toastBytes',(select pg_total_relation_size(reltoastrelid)from pg_class where oid='public.helmut_store'::regclass),"
    +"'autovacuums',(select coalesce(sum(autovacuum_count),0)from pg_stat_all_tables where relid='public.helmut_store'::regclass"
    +" or relid=(select reltoastrelid from pg_class where oid='public.helmut_store'::regclass)),"
    +"'settings',(select jsonb_object_agg(name,setting)from pg_settings where name in('work_mem','max_wal_size','autovacuum_naptime',"
    +"'fsync','full_page_writes','synchronous_commit','autovacuum','archive_mode','wal_keep_size')))from pg_stat_database where datname=current_database();";
}
function monitor(journal, commonMemory) {
  const { PerformanceObserver } = require("node:perf_hooks");
  const persistGC = entries => { for (const e of entries) journal.write("node-gc", {
    startMs: e.startTime, durationMs: e.duration, kind: e.detail.kind, flags: e.detail.flags }); };
  const observer = new PerformanceObserver(list => persistGC(list.getEntries()));
  observer.observe({ entryTypes: ["gc"] });
  const sample = () => journal.write("common-and-node-memory", { common: commonMemory(), node: process.memoryUsage() });
  sample(); const timer = setInterval(sample, 1000);
  return () => { clearInterval(timer); persistGC(observer.takeRecords()); observer.disconnect(); sample(); };
}
module.exports = { open, startTicks, databaseStatsSQL, monitor };
