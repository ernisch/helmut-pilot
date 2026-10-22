# One selected late read probe, 01 OR 02 OR 03 — PREPARED / NOT RUN

No Docker start, SQL, native execution or syntax test was performed during preparation. Root must review these frozen files, obtain the separate shutdown review, perform fresh admission and write a new exact adoption receipt. No previous claim or receipt is reusable.

This adds only03 to the current R v3 launcher (base PREPARED SHA f933026074362a8ef41fbc236a2b8933e935dbeea7e5270baa9f70ce7fcdbed6). Each NEW case selects exactly one pinned SQL file: unchanged01 ordered rows, unchanged02 native warm control, OR new03 native cold control. NativeMemoryBudget, original source/copy, JIT, setup renderer, guards, deadlines, output limits, closure and retirement behavior remain the same. No models, PostgREST, Node workload, workload loop, engine function change, full500, Production operation or automatic deletion is included.

## Concrete execution path

1. Future Root-only prepare: python -B run.py prepare --measurement 01|02|03 --case <CASES>/spill-<24 fresh lowercase hex>. CASES is fixed outside all Git worktrees: /workspace/helmut-ram-fix-20261020/late-read-spill-20261020/cases. It verifies the frozen code/metadata closure, existing tiny helper image, exact native policy, source live-mount metadata, vfs driver and disk capacity; it creates only a fresh private case/preflight receipt. Mode02/03 also creates one fresh UUIDv4 readNonce; mode01 records null. Full PGDATA reads are deferred to the measured group.
2. Root writes and reviews the exact fresh adoption receipt below. Future start: python -B run.py start --root-adoption <receipt>. It consumes STARTED.SAFE.json once, uses a new parent and calls unchanged N.start before source hashing, copying, JIT or PG setup. At most two existing native helpers plus one new worker container are created. There is no retry.
3. The worker hashes the complete readonly original source: 1709 files, 369399611 bytes, manifest SHA827a9872003182a73dff6329f16e0f68aa429fbe680606b58c138668a8d23396. It copies every file/mode to the NEW persistent /disk/pgdata, then independently hashes that copy and requires exact equality. It checks shutdown/16MiB WAL through original pg_controldata. No initdb or source write exists.
4. The existing exact JIT restorer runs inside the measured group. Its 974 original files and four library aliases occupy a capped 256MiB tmpfs used only for JIT/runtime/socket; PGDATA, WAL and PG temp remain on persistent disk. Three original JIT links occupy their separate capped 1MiB library mount.
5. PG17.6 starts with shared128MiB/work4MiB/temp128MiB, JIT on, original fsync/synchronization, no TCP, 30s statements and 1s locks. Command-line data_directory/hba_file/ident_file point explicitly to the new /disk/pgdata files, whose contents were copied unchanged; actual settings are checked before DDL. The first setup catalog must exactly match candidate-abba-02.before, including b3157f… old renderer. The explicit install-reviewed-renderer.sql replaces only the function extracted from pinned R auth_state_parts_local.sql. A fresh full catalog then must equal the old one with only that renderer body hash changed to d02ac4…. Additional function ABI/raw ACL, table/sequence ABI/ACL/index/trigger/policy, role and physical Auth checks must remain identical.
6. Setup comprises three SQL sessions / sixteen statements: before catalog5, explicit renderer install6, after catalog5. All are explicitly identified as local clone setup. The FIRST AND ONLY measurement is the one SQL file selected by the fresh preflight/adoption. Mode01 requires the three qualified metadata objects plus one JSON plan. Mode02/03 require exactly four dictionaries: bound-original-state, reachable-metadata, native-warm-control-result OR native-cold-control-result, target-transaction-temp-observation, all qualified=1. Exact result keys/hashes/sizes/booleans are checked; they produce NATIVE_WARM_CONTROL.SAFE.json OR NATIVE_COLD_CONTROL.SAFE.json, without a plan field. Every psql client has a 30s wall deadline, every statement30s and lock1s.
7. The worker cleanly stops PG with SIGINT (30s bound), requires log-drain EOF with no read error and an ended thread, verifies shutdown, fully rehashes original source after closure and exports phase/memory/CPU/temp/plan/log evidence. Root's unchanged native controller verifies all owned descendants empty and reads lifetime counters AFTER the last worker exit, including setup helpers. No peak reset or cache reclaim occurs.

The original source is:
 /workspace/helmut-ram-fix-20261020/next-single-go-20261020/postrun-canonical-readback/PGDATA_COPY_NOT_AN_ORIGINAL
It is mounted readonly and protected. The reviewed PR925 function installation affects only the newly created persistent copy; the source and the 6000 original history rows remain unchanged.

## Fresh adoption fields

Root supplies actual values, never placeholders:
 schema: helmut-late-read-spill-root-adoption/1
 action: ROOT START ORDERED READ 01 ONLY (mode01) OR ROOT START NATIVE WARM CONTROL 02 ONLY (mode02) OR ROOT START NATIVE COLD CONTROL 03 ONLY (mode03)
 measurementMode: exactly "01", "02" or "03", matching the fresh preflight
 measurementSQLPin: the exact selected SQL pin from that preflight
 readNonce: null for01; the same newly generated preflight UUIDv4 for02/03
 atUTC: fresh timezone-aware UTC timestamp
 expiresUTC: UTC timestamp no more than15min ahead
 nonce: 24 fresh lowercase hex characters
 preparedPin: actual pin of this PREPARED.SAFE.json
 preflightPin: actual pin of the just-created case/PREFLIGHT.SAFE.json
 installReviewedRenderer: true
 sourceManifestSHA256: 827a9872003182a73dff6329f16e0f68aa429fbe680606b58c138668a8d23396
 full500: false
 production: false

Pins have exact path, bytes and sha256. The adoption explicitly authorizes the separately pinned local renderer setup. The original-source catalog is verified before its installation; there is no guard weakening.

For02/03, preflight → exact Root action/adoption → START receipt → worker config → psql read_nonce carry the same UUID. The selected pinned SQL checks both actual historyReuse.nonce and graphReuse.nonce against that value inside its qualified expression. The worker sets nonceEchoVerifiedBySQL=true only after qualified=1 and all four output dictionaries pass; the SQL does not emit raw nonce echoes, so none are invented. Client-token acceptance and HTTP transport remain explicitly unproven. A failed/unknown02 or03 attempt reports null for its nativeControl02Executed or nativeControl03Executed, rather than claiming it did not execute.

## Exact03 scope and integration

The new03 SQL is separately pinned beside the launcher. Root copies the six launcher files plus03-native-cold-control.sql, rebinds the six source pins, the setupSQLPin, the03 metadata input pin and its allowedMeasurements pin. The03 selector requires exactly one adopted metadata pin with that basename and uses its canonical absolute path; it does not resolve C.HERE inside the container, where HERE is /tools. The existing metadata-input mechanism mounts and authenticates that file. The other18 inputs and both old SQL bytes remain unchanged.

03 sends exactly id, valid original6000 knownProof, fresh bound readNonce, and knownGraph:null to the unchanged1644ff69… graph_read function. It requires graph present/root pinned/1848 nodes, historyReuse.reused=true, graphReuse.reused=false, actualPayloadsChecked=false, both response nonces matching, unchanged state/proof/revision, and the returned native node digest equal to the independently bounded reachable-hash digest. The false actualPayloadsChecked field is the existing protocol value for non-reuse; the original graph checker still runs its complete actual-payload validation. Only lengths/hashes/count/digest/nonce status and booleans are printed. The six-megabyte result remains in the database. No full renderer, Node work, controlText measurement or engine SQL modification is added.

Unlike02's metadata-only MATERIALIZED CTE,03 uses SELECT summary FROM (SELECT graph_read_v1(request) AS result OFFSET 0) AS measured. The barrier keeps one scalar evaluation without deliberately spooling the large result in an observer CTE. The outer length/hash summary remains observer work. No second jsonb_array_elements pass is added by this summary: graphNodeDigest is the native protocol digest checked against the bounded expected digest. A whole cold-request temp delta cannot identify its nested ordered aggregate, digest SRF or outer executor as the sole cause. Root must inspect the actual plan form if further attribution is required. No plan is invented by03. The late2MiB control-cache cause remains unproved.

## Bounds and evidence

Native parent: memory.max1547997184, memory.high1399996416, swap0, unchanged 2.048GB hard contract / 500MB reserve target. Persistent copy allocation allowance768MiB plus16MiB setup/evidence admission above the unchanged8GiB host floor. This is deliberately larger than the former RAM-PGDATA case; fresh disk availability must admit it. No image build, paid infrastructure, reserve change or RAM-PGDATA fallback exists.

Work deadline300s from before N.start; whole probe/closure target360s. Any timeout or late closure yields FAIL. Exact owned cleanup still runs with bounded control calls if the overall deadline expires, so it cannot strand a known container merely to meet a reported duration. Each client's 30s wall budget covers pipe draining, exit wait and the success return. Guard/selector/read/wait exceptions still trigger bounded kill/reap and private buffer/status/exit evidence; output-cap or host-floor failure cannot authorize evidence writes beyond those limits. Invalid create output leaves CID unset so only the exact fresh name can be recovered and closed. Every combined SQL stdout/stderr capture is hard-capped256KiB; PG log capture is separately capped256KiB. All retained evidence, helper receipts and timeline together are hard-capped4MiB, excluding the separately admitted persistent copy. Cap overflow kills/reaps the client and fails; no output truncation is accepted as a successful plan.

ACTUAL_RESULT carries final memory.stat, events, lifetime peak, cpu.stat, actual empty-group proof and owned container exit state. Worker evidence contains original/copy/after manifest proofs, actual catalogs, explicit setup counts, SQL raw output and parsed plan/temp observation. RETIREMENT_CANDIDATES lists only exact new CIDs and the derived PGDATA path, pins necessary source/exit/log/result evidence and records stopped/empty state. eligibleForDeletion remains false until complete verified backup plus Root review. No rm/prune/volume/image deletion or N.finish extension is implemented.

This probe distinguishes the standalone ordered full-row plan from the outer native/RPC envelope. A plain outer EXPLAIN cannot expose PL/pgSQL nested statements; literal planning can differ from a cached SPI plan. pg_stat force-flush acts at transaction end; observer intervals/counter scope remain those stated in the pinned SQL. Read-only setup/metadata scanning and original cache charges may warm pages or remain outside the new group. This is an attribution probe, not a host-total, cold-cache, common-RAM saving, plateau or full500-reserve proof. The historical PostgREST shutdown failure is not reclassified.

This preparation executes no mode. Root may adopt one03 after review in a fresh case; a case cannot execute multiple modes or be reused. The sixteen fresh safety reads per profile are unchanged. An HTTP measurement remains outside this launcher.

## Review limitations

Preparation is not qualification: no syntax, native, SQL, Docker or cleanup test has been run. Root must inspect the exact mounts, output closure, graceful-stop/failure paths and frozen source pins before adoption. The explicit native/kernel/JIT loader compiles only the source bytes it just authenticated against the adopted pin; it never reads PYC caches. Root uses -B and verifies no pre-existing local __pycache__ before the normal common import. No source-PGDATA byte was read by this preparation; only existing evidence and source code/metadata were read. The complete first frozen review bundle, including its PREPARED receipt, is preserved at /workspace/helmut-auth-diff-sol-20261020/diagnostics/late-read-spill-launcher/FROZEN_REVIEW_01.PRIVATE.tar.gz; it is private review evidence and is not copied into R.

