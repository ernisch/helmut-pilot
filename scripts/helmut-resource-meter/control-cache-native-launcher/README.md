# V6: PostgREST lifecycle, then exact native control-cache observation

PREPARED / NOT RUN. No AST, syntax, unit, Node, SQL, PostgREST, Docker or native
execution was performed by this author. Root integration, independent SOL review,
fresh admission/preflight/adoption and actual qualification remain required.
This directory is new; R, V5 and historical cases/evidence were not changed.
The old candidate-abba-02 PostgREST shutdown FAIL remains FAIL. Its exact signed
return code was never persisted and is not inferred here.

There are exactly two separate one-shot modes, each with a new case and a fresh
Root adoption. `lifecycle-only` must complete and close first. `control-cache`
requires the actual lifecycle ACTUAL_RESULT pin with the SAME current PREPARED
pin, binary/config/source/body closure and successful final native last exit.
A lifecycle proof from another freeze is rejected. No automatic second mode,
retry, mutation, provider call, main Auth workload or full500 run exists.

## Runtime and source contract

Both modes independently make one new persistent 768MiB-budgeted derived PGDATA
copy from the same canonical closed source:1709 files/369399611 bytes, complete
manifest827a9872003182a73dff6329f16e0f68aa429fbe680606b58c138668a8d23396.
Original source remains readonly and is fully compared after shutdown. Source
copy, all actual runtime/source checks, original JIT restoration, PG/catalog
setup, PostgREST, optional Node and final closure are inside the same native group.
No peak reset, forced GC, host cache eviction or RAM filesystem PGDATA occurs.
The 256MiB tmpfs is only for original JIT/socket/config; PGDATA/WAL/temp remain on
the private persistent disk. The previous 553 original readonly runtime bindings,
original JIT archive/root manifest, no-network tiny image and explicit clone PG
configuration are retained. No image is built/downloaded or substituted.

Current R engine source is e7530ffd737179fb261d8a680ade77262d88e4685b3d8d90f2a92ecb5fad83c5.
Both modes qualify the complete original catalog/ABI/ACL/Auth/store, install only
the reviewed renderer d02ac4844aaa10dd41c601a1e568398adf375f18810c6301bdab6040d11a1e32,
then install only graph_read body4e2b9015790312d0b05e781ba6ef9a62cb13462167c47b6c9a998f27cdfb9ae0.
The same five sessions/29 statements are used in both modes, then one independent
full catalog/store comparison after the operation. Only those two intended body
changes are accepted; original identity is PG17.6/database OID JSON string18405.
This is a fresh derived clone, never the original running bank or Root database.

Node binary is the existing125989464-byte original at dependencies/node/bin/node,
SHA bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12.
PostgREST is the existing17309560-byte source-capture/postgrest-pinned,
SHA870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617.
Their actual files were freshly hashed read-only after ABBA finished. No version
command was executed. Future actual startup must report Node v24.19.0 and the
PostgREST12.2.3 startup banner; PREPARED does not claim fresh executed versions.
Every executed local/transitive JS file and preload is pinned; no node_modules,
application entry point, storage workload, adapter or provider is invoked.

## Mode lifecycle-only

Root prepares with `--measurement lifecycle-only`; no lifecycle proof is supplied.
After the identical PG/catalog setup, direct owned PostgREST starts against only
/ram/socket and listens on127.0.0.1:38419 inside network none, service_role, pool2.
Readiness uses only a TCP socket connection and the actual startup banner. No
HTTP readiness request, Auth RPC or Node process exists in this mode.

The NEW copied closure helper binds the direct Popen object/PID/argv and verified
binary/config pin metadata. It records poll-before, explicit SIGTERM, bounded
wait and the raw signed return code. Only an initially live child returning0 or
-SIGTERM can pass. 143,1, other nonzero codes, timeout, kill, binding mismatch,
double stop, any error or uncertain persistence fail. Failure escalation is
bounded kill/reap and remains failure. The stdout/stderr pipe is drained by one
bounded logger; EOF plus ended thread/no overflow/no errors is required before
explicit parent-log close. Full log capture is capped256KiB; receipt tail is
bounded16KiB with truncation stated. The strict stop receipt is persisted before
caller acceptance. A returned persistence error cannot become a worker PASS.
PG then closes with exit0, ended log drain/EOF, offline shut-down proof, unchanged
full source manifest and native group empty through last owned exit. All helper
and worker container identities are retained. No retirement executes here.

## Mode control-cache

A separate new preflight must supply `--measurement control-cache` and
`--lifecycle-result /absolute/lifecycle-case/ACTUAL_RESULT.SAFE.json`.
The lifecycle gate is verified before any native group/resource is started and
again inside the control worker. The three small lifecycle proof files are
readonly mounted; no old case is writable by the new worker.

One fresh Node process uses exactly384MiB old space/16MiB semi space and the
existing original native-node-budget/http-meter preloads. STARTED and EXITED
heap receipts, one isolate/no worker, Node exit0 and native whole-group last exit
are required. Environment is constructed from an allowlist, with no inherited
Production/provider credentials, NODE_OPTIONS or application source modes.
History and control flags are on; graph reuse and single capture are off.

The driver calls the original U module exactly once each, sequentially:
`U.read -> U.readControl -> U.readControl`, same main-auth row and target.
The only request callback route is POST /rpc/helmut_auth_state_graph_read_v1 on
the isolated127.0.0.1 endpoint. It makes exactly three real fetch calls, no mocks,
response rewrites, readiness RPCs, writes or extra native reads. Each U request
carries its original fresh distinct UUIDv4. Native history/graph nonce echoes,
knownGraph absent/null/object, bindings/digest/count metadata and actual response
presence are recorded. The SAME real response object passes the unchanged U
proof/history/graph/token/decoder checks. No private cache/token is modified.
Both control calls still require fresh native database checks even if reused.
The full initial Auth and each returned control value are dropped before the
next step; only the engine's own normal caches and small observations remain.

A transparent temporary JSON.stringify wrapper invokes the original exactly
ONCE with the identical arguments/this and returns its identical result. It
only records byte length when the caller is pinned original controlText line153
and the argument has exactly the four CONTROL_KEYS in their original order.
No control/Auth string or object is retained, no second serialization, clone,
full-payload hash or reconstructed four-field Auth projection is made. The
observer is restored before receipts are serialized. This distinguishes the
cache's actual text from the returned view's extra _authStoreRevision field.
The actual observed length selects and checks the existing source's conditional
path: if above2097152 bytes, counts1/2/2 and both native knownGraph:null; otherwise
counts1/0/0 and both native graph hints/reuse. No outcome is presumed by PREPARED.

Passive original HTTP framing observes actual received body/header/framing/TCP
bytes and one completed response per step, with no extra body consumption. Raw
request JSON UTF8 bytes are counted separately. Process memory/heap and lifetime
maxRSS are recorded around each call; those are not summed into native RAM.
Natural GC is unchanged. No RAM saving, three-RPC plateau, full workload warmth,
cache authorization shortcut or full500/reserve claim follows from this case.

## Root-only execution contract

Use R/scripts/lokal.js for Root's separately authorized checks/actions. The author
has run none. `prepare` is metadata-only and creates no container/SQL process.
It emits selection, preflight and the new outside-Git `control-[24hex]` case.
`start --root-adoption ABSOLUTE_FILE` accepts only a fresh Root receipt <=15min
binding schema/action, exact selection, authRPCCount0 or3, nodeLaunchCount0 or1,
lifecycleResultPin(null for lifecycle), preparedPin, preflightPin, sourceManifestSHA256,
installReviewedRenderer:true, fresh24hex nonce, atUTC/expiresUTC, full500:false,
production:false. Schemas/actions are:

- helmut-control-cache-lifecycle-only-root-adoption/1 / ROOT START POSTGREST LIFECYCLE ONLY
- helmut-control-cache-control-cache-root-adoption/1 / ROOT START CONTROL CACHE THREE RPCS ONLY

Native max1547997184/high1399996416/swap0, host floor8GiB, disk admission784MiB,
persistent copy cap768MiB, per-client combined capture256KiB/30s, PG/PostgREST
logs256KiB each, evidence4MiB, work300s/total360s remain unchanged. Parent polls
exact owned CID/name/image/group, caps, OOM and deadlines. Only owned process
cleanup can signal/kill. No new resources start during final closure. Result
PASS requires kernel last exit/empty subgroups, no OOM, strict PostgREST closure,
PG clean shutdown, source equality and actual required Node receipts. Partial
Node attempt/exit metadata remains visible on failure where receipts exist;
unknown counters are null rather than invented zero.

All evidence, closed hulls, images/volumes/loops, source originals and derived
PGDATA persist. Retirement output is only an ineligible candidate manifest;
separate verified archive/Root review and explicit targeted cleanup are required.
