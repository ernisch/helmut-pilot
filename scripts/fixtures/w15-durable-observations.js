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
// Opt-in asynchronous native IO. Existing synchronous component evidence keeps
// using open() above unchanged. Each string is captured at the observation call.
function openAsync(state, phase, options = {}) {
  assert(/^(run|prepare|signal-proof|eu-component)$/.test(phase));
  const directory = fs.lstatSync(state);
  assert(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o777) === 0o700);
  const deadlineMs = options.flushDeadlineMs === undefined ? 15000 : options.flushDeadlineMs;
  assert(Number.isInteger(deadlineMs) && deadlineMs > 0 && deadlineMs <= 180000);
  assert(options.onIO === undefined || typeof options.onIO === "function");
  const filename = options.filename === undefined ? `${phase}-observations.SAFE.jsonl` : options.filename;
  assert([`${phase}-observations.SAFE.jsonl`, "gateway-observations.SAFE.jsonl"].includes(filename));
  const fd = fs.openSync(path.join(state, filename), "wx", 0o600);
  const MAX_PENDING = 8 * 1024 * 1024;
  let sequence = 0, acknowledgedSequence = -1, pendingBytes = 0, pendingEntries = 0;
  let queue = [], running = false, failure = null, closing = false, closed = false, descriptorRetainedOpen = false, closePromise;
  const waiters = new Set();
  const metrics = { completedWrites: 0, completedSyncs: 0, maximumWriteMs: 0, maximumSyncMs: 0,
    maximumPendingBytes: 0, lastIO: null };
  function snapshot() { return { ...metrics, lastIO: metrics.lastIO && { ...metrics.lastIO }, acknowledgedSequence, nextSequence: sequence,
    pendingBytes, pendingEntries, maximumAllowedPendingBytes: MAX_PENDING, running,
    status: failure ? "FAIL_OR_UNKNOWN" : pendingEntries ? "UNKNOWN_PENDING" : "DURABLE_ACKNOWLEDGED",
    failureCode: failure?.code || null, closed, descriptorRetainedOpen }; }
  function fail(code) {
    if (!failure) { failure = Error(code); failure.code = code; }
    for (const entry of queue) entry.reject(failure);
    queue = [];
    for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.reject(failure); }
    waiters.clear(); return failure;
  }
  function ioRecord(kind, beginMS, entry, ok) {
    const endMS = performance.now(), durationMs = endMS - beginMS;
    const span = { kind, sequence: entry.sequence, beginMS, endMS, durationMs, acknowledged: ok,
      pendingBytes, pendingEntries, acknowledgedSequence: kind === "sync" && ok ? entry.sequence : acknowledgedSequence };
    metrics.lastIO = span;
    if (ok) metrics[kind === "write" ? "completedWrites" : "completedSyncs"]++;
    const key = kind === "write" ? "maximumWriteMs" : "maximumSyncMs";
    metrics[key] = Math.max(metrics[key], durationMs);
    if (options.onIO) { try {
      const outcome = options.onIO({ ...span });
      if (outcome && typeof outcome.then === "function") {
        Promise.resolve(outcome).catch(() => {}); fail("W15_DURABLE_OBSERVER_FAILED");
      }
    } catch { fail("W15_DURABLE_OBSERVER_FAILED"); } }
  }
  function settled() {
    if (pendingEntries || failure) return;
    for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.resolve(snapshot()); }
    waiters.clear();
  }
  function pump() {
    if (running || failure || !queue.length) return;
    running = true;
    const entry = queue[0], beginMS = performance.now(); let offset = 0;
    function writeRest() {
      try { fs.write(fd, entry.bytes, offset, entry.bytes.length - offset, null, (error, written) => {
        if (error || !Number.isInteger(written) || written <= 0) {
          ioRecord("write", beginMS, entry, false); running = false; fail("W15_DURABLE_WRITE_FAILED"); return;
        }
        if (failure) { ioRecord("write", beginMS, entry, false); running = false; return; }
        offset += written;
        if (offset < entry.bytes.length) return writeRest();
        ioRecord("write", beginMS, entry, true);
        if (failure) { running = false; return; }
        const syncBeginMS = performance.now();
        try { fs.fdatasync(fd, error => {
          ioRecord("sync", syncBeginMS, entry, !error && !failure);
          running = false;
          if (error) { fail("W15_DURABLE_SYNC_FAILED"); return; }
          if (failure) return;
          queue.shift(); pendingBytes -= entry.bytes.length; pendingEntries--;
          acknowledgedSequence = entry.sequence; entry.resolve(snapshot()); settled(); pump();
        }); } catch { ioRecord("sync", syncBeginMS, entry, false); running = false; fail("W15_DURABLE_SYNC_FAILED"); }
      }); } catch { ioRecord("write", beginMS, entry, false); running = false; fail("W15_DURABLE_WRITE_FAILED"); }
    }
    writeRest();
  }
  function write(name, value) {
    if (failure) throw failure;
    if (closing || closed) throw fail("W15_DURABLE_CLOSED");
    let bytes;
    try { bytes = Buffer.from(JSON.stringify({ sequence, atUTC: new Date().toISOString(), atMs: performance.now(), name, ...value }) + "\n"); }
    catch { throw fail("W15_DURABLE_SERIALIZE_FAILED"); }
    if (pendingBytes + bytes.length > MAX_PENDING) throw fail("W15_DURABLE_QUEUE_OVERFLOW");
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    // An ignored observer return value must not cause unhandled rejection. The
    // original promise still rejects to any caller awaiting its durable ACK.
    promise.catch(() => {});
    queue.push({ bytes, sequence: sequence++, resolve, reject }); pendingBytes += bytes.length; pendingEntries++;
    metrics.maximumPendingBytes = Math.max(metrics.maximumPendingBytes, pendingBytes); pump(); return promise;
  }
  function flush(remainingMs = deadlineMs) {
    assert(Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= deadlineMs);
    let result;
    if (failure) result = Promise.reject(failure);
    else if (!pendingEntries) result = Promise.resolve(snapshot());
    else result = new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      waiter.timer = setTimeout(() => fail("W15_DURABLE_DEADLINE"), remainingMs);
      waiters.add(waiter);
    });
    result.catch(() => {}); return result;
  }
  function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      const end = performance.now() + deadlineMs; let original;
      try { await flush(); } catch (error) { original = error; }
      // Never close/reuse an fd while a native write/sync still owns it. A
      // failed drain leaves it UNKNOWN/open until the bounded process stop.
      if (running) { descriptorRetainedOpen = true; throw original || fail("W15_DURABLE_DEADLINE"); }
      const closingFD = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(fail("W15_DURABLE_DEADLINE")), Math.max(1, end - performance.now()));
        try { fs.close(fd, error => { clearTimeout(timer); closed = !error;
          if (error) reject(fail("W15_DURABLE_CLOSE_FAILED")); else resolve(); }); }
        catch { clearTimeout(timer); reject(fail("W15_DURABLE_CLOSE_FAILED")); }
      });
      try { await closingFD; } catch (error) { original ||= error; }
      if (original) throw original;
      return snapshot();
    })();
    closePromise.catch(() => {}); return closePromise;
  }
  const identity = { pid: process.pid, startTicks: startTicks(process.pid), phase };
  write("process-start", identity);
  async function ready() {
    assert(process.listenerCount("SIGTERM") > 0, "w15-stop-handler-not-installed"); await flush();
    fs.writeFileSync(path.join(state, `${phase}.node.SAFE.json`), JSON.stringify(identity), { flag: "wx", mode: 0o600 });
  }
  function observe(observation) {
    for (const key of ["mutations", "usageSinks", "casWrites"]) {
      const rows = observation[key]; assert(Array.isArray(rows)); const push = rows.push;
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
  return { write, observe, identity, ready, flush, close, snapshot };
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
module.exports = { open, openAsync, startTicks, databaseStatsSQL, monitor };
