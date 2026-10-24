# Late read spill: inert diagnostic preparation

**Native execution and qualification: NOT RUN.** No connection, container, test or source-PGDATA access was performed. The disk-admission observation at 2026-10-20 16:11:14 UTC showed a component shortfall of 9,662,464 bytes; values need fresh observation before admission. Root owns fresh admission, clone creation, the measurement manifest and review. These files grant no admission and contain no optimized SQL. Root integration adds the same 30s/1s local timeouts to every statistics-observer transaction after independent review; the frozen v2 preparation remains preserved in its separate worktree.

The one question is whether the unchanged graph validator's ordered full-row query explains the recurring temp I/O. Existing candidate-abba-02 reports 190 temp files / 1,180,336,050 cumulative bytes across twelve rounds, including four rounds without CAS. That is 6,212,295 bytes per file on average; the aggregate counters do not prove every individual file size. These are written bytes, not resident RAM.

## Bound inputs

Source repository: /workspace/helmut-cpu-epoch-20261015, combined PR924/PR925 HEAD f0d3b0395b638967d89095df8b0ca5731399c633.

- auth_read_bounded_local.sql: 18,650 bytes; SHA256 595b2530b66193c387f111b00b9b22e9f54847bfa24dd1def80a7b2bb4fee561. Target SELECT is lines 85-86.
- Database helmut_resource_fixture_20261020_3b3bf56650bc, OID 18405, PostgreSQL 17.6, Unix-socket access only, effective target role service_role.
- main-auth original physical JSON: 606 bytes; SHA256 9b62ab352733025f1b752e637f6360d7813b10ea86f134168698e8f4f0d11bc9; revision 603ee863-ecaf-43be-8b3a-8d6c5ca76d0d.
- State root 24bea8f26ed99b234b4d0c557ce8f80cbba205bc093797daff329b398b851633; generation 6593701f-3f25-4e43-9e17-e9eda4306554.
- Original history count 6000, generation e46b536a-9768-420e-a468-85a20805e2fa. The CLIENT_RESULT final history count 6002 is deliberately rejected.
- Expected 1848 actual reachable nodes / 6,010,786 payload bytes. The templates derive the actual bounded hash array from this exact root.
- The four required installed body hashes are checked inside SQL. Root must qualify the full catalog independently and install the reviewed PR925 renderer only in its new clone before using these templates. Neither template changes definitions.

Evidence: candidate-abba-02 INPUTS.SAFE.json and WORKER_RESULT.SAFE.json (original metadata), CLIENT_RESULT.SAFE.json (round observations), ACTUAL_NATIVE_CATALOG.SAFE.json (qualified installed bodies). Directory: /workspace/helmut-ram-fix-20261020/auth-working-set-20261020/candidate-abba-02.

## Root's future bounded measurement

1. Preserve source files, original PGDATA, prior containers and receipts. Admit a NEW exclusive clone using the existing native controller, unchanged budget/reserve contract and sufficient disk. Never use RAM-backed storage to bypass admission.
2. Verify source SHA/bytes and these prepared-file pins. Run through Root's admitted existing orchestration, with psql -X -w -v ON_ERROR_STOP=1, the admitted clone's Unix socket, the exact database, and root_clone_receipt_sha256 set to the actual fresh admission receipt SHA. These templates do not supply a socket, credentials, a receipt or a launch command.
3. Run 01-ordered-rows.sql once. It EXPLAINs the selected full rows with the actual reachable array as service_role. Retain its bounded JSON plan and metadata only. Cap captured output externally at 256 KiB within the existing 4 MiB total output budget; an exceeded cap or query timeout is FAIL.
4. If the exact query does not explain the spill, run 02-native-warm-control.sql once in the same unchanged exclusive clone, with a fresh lowercase UUID in read_nonce. It calls the existing native graph reader with the warm control request shape (id, knownProof, readNonce, knownGraph), preserves all fresh graph/history checks, and returns only hashes/sizes/flags. It does not mint or validate the private JavaScript control token.
5. Compare the ordered query's Sort Method / Sort Space Type / Disk bytes and Temp Read/Written Blocks with the native control transaction's temp delta. No planner hints, work_mem increase, index/DDL, data mutation or validation shortcut is included. A spill is not automatically an avoidable resident-memory allocation.

All transactions are READ ONLY and end with ROLLBACK. Every transaction sets statement_timeout=30s and lock_timeout=1s, including the statistics observers. This bounds each statement; it does not prove the complete Auth30 deadline. Target queries use the target role; actual work_mem=4MB, temp_file_limit=128MB, shared_buffers=128MB, JIT, fsync and synchronization settings are checked rather than changed. No full Auth/graph/history body is printed. The ordered EXPLAIN may contain the 1848 hash constants; it must remain private and bounded.

## Attribution limits and observer overhead

pg_stat_force_next_flush() requests a flush at the NEXT transaction end. Each preparation/baseline/target phase therefore requests a flush and ends with ROLLBACK. Statistics are then read in a fresh read-only transaction after pg_stat_clear_snapshot(). The database must have no concurrent work or statistics reset. The emitted counter delta covers the target transaction plus small observer statements; it is not a pure function-only counter, a peak, or RSS. The two statistics-reader intervals are timed separately; flush/rollback and final-summary overhead are not independently timed. The EXPLAIN plan's temp blocks provide synchronous attribution to its measured ordered SELECT. Preparing the hash array warms pages; no cold-cache claim is permitted.

Standalone EXPLAIN with literal bound values can choose a different custom/generic plan than PL/pgSQL's long-lived cached SPI plan; no plan-cache setting is forced. A plain outer EXPLAIN of a PL/pgSQL call does not expose nested statement plans. The first file removes the function/HTTP result envelope, narrowing whether the ordered full-body operation itself spills. A small metadata-only native result that still spills narrows the cause inside the native function; the summary CTE/wrapper is documented observer overhead.

Neither file measures the actual PostgREST envelope or response buffering. To close that gap, Root can use the existing late-node-client.js global.fetch bridge and storage.readSynthetik500ControlStore() after its ordinary read has established the private control cache. Keep the established history/control flags; leave graph-read-reuse and single-write-capture flags unset as in lines 90-94. Capture only response byte count/hash, role/backend provenance and synchronized temp observations. Keep all sixteen fresh safety reads per profile; do not replace them with these diagnostic probes. A later end-to-end comparison must preserve the actual client, security guards and pool configuration.

No native pass, plateau, common-memory saving, HTTP attribution, Auth30 result or 500-profile reserve is established by this preparation. Any next SQL change needs the measured plan/transport attribution first.
