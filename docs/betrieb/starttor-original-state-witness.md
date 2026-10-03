# Original Auth/Main hash and quiet witness

This is a dormant read-only preparation interface. It does not activate profiles,
claim commands, create books, reserve costs, dispatch providers or authorize 500.
Daily 6 USD and cumulative 7 USD remain unchanged. The Root executor is responsible
for genuinely authorized current inputs and independent evidence review.

## Invocation and closed admission

The exact existing route is `GET /api/cron/testnachweis-status?modus=starttor-original-state`.
It is selected before the account/admin-seed prelude. It requires the existing
`Authorization: Bearer <CRON_SECRET>` and unchanged `authorizeCron`; query-string
credentials are rejected. Additional headers are `x-helmut-witness-nonce` (new UUID)
and `x-helmut-witness-packet-hash` (the exact `V.hash` of the private Root packet).
No newly generated credentials or revived old operation entitlement are used.

Root must separately stage `helmut_store.id=synthetik500-original-state-<nonce>`
with the exact packet schema in the companion private source template. This route
contains no staging writer. Missing, incomplete, stale, wrong-project/runtime or
unaccepted actual evidence stops before Original Auth/Main reads and native RPC.
The packet's `startschutz.input.belege.kosten.auth` must be literal null: the route
supplies the original complete Auth internally, without duplicating it in staging.

The packet binds actual runtime commit/deployment/immutable host/project, original
user authorization, independent source acceptance, current native ABI/type/actor/
serializer/ACL acceptance, complete current Finance, controlled paid/manual/worker/
GitHub/cron scopes and end guard evidence. Pins identify Root's independently
reviewed evidence; this backend does not read Cloud private evidence files or prove
their authenticity from hex shape. Root supplies and stages genuine inputs. The
new authorization slot is currently null. No indirect call/export may bypass the
terminal rejected Finance payload operation or the pending specific user approval.

Freshness is at most 60 seconds; the admitted operation window is at most 20 minutes.
The backend makes at most four GET requests: private packet, original `main-auth`,
original `main`, and one fixed native witness RPC. There is no retry, local fallback,
normalization, default merge, cache or arbitrary endpoint. Packet response is at
most 1 MiB, each original response 4 MiB, all responses together 8 MiB, and native/
external output 8 KiB. The packet counts inside the aggregate bound. All requests
share a 20-second backend deadline. These are new explicit response-byte limits;
actual current fit and physical peak memory are unknown, and failures stay closed.
Streaming bounds precede chunk retention; UTF-8, JSON and finite safe parsed values
are checked. A cap or precision/depth failure is a STOP, never an empty object.

The server does not write a once ledger. The eventual Root transport caller must
have a newly reviewed raw-first physical once family, retain the whole result before
decoding, and consume a failure permanently. No old Finance or capture family is
reset. Such actual caller/admission/nonce/ledger is still absent and unaccepted.

## Same-version JavaScript/native binding

`readStore` and `readAuthStore` are unsuitable: they merge defaults/normalize/cache.
This reader fetches fixed `id,data` originals, never changes a revision or value, and
computes existing `realkohorte-500-vertrag.V.hash` over the exact parsed full data.
Both hashes must equal current known `json_compact` hashes in the native witness.
The Root packet itself also requires JS/native compact-hash equality. No equality
is inferred because two hashes share a hex format. Native JSON-text/Finance projection
hashes remain separate domains and do not replace either original JavaScript hash.
Unsafe parsed numbers/depth or nonmatching actual numeric/string/key semantics STOP.
This checks these finite actual values, not a universal PostgreSQL/JavaScript codec.

The native heads include fixed PK, table OID, xmin, and original revision presence
and value; missing is distinct from JSON null. Auth and current-day/global counter
must exactly match the genuine current Finance head; rewrites with a different xmin
stop even if contents match. JS revisions are compared with the same native heads.
No single MVCC snapshot is claimed across HTTP/Finance captures: exact current
hash/version equality ties these reads to the final native snapshot.

## Concrete inert native ABI

The private companion `native-witness-abi.inert.sql` proposes exactly one public
`helmut_starttor_original_state_witness(text,text,text,text) returns jsonb` function.
It is not a repository migration and is uninstalled. It is STABLE, SECURITY INVOKER,
with fixed `search_path`, UTC/ISO output and bounded statement/lock settings.
PostgREST GET must genuinely use `transaction_read_only=on`; the function checks
that setting rather than changing isolation after its outer statement starts.
It reports actual actor/session actor/JWT role/database/version/isolation and current
non-definer state. All STABLE subreads share one PostgreSQL statement snapshot.
No forced or claimed REPEATABLE READ is added; the existing Finance reader's RR
contract remains unchanged.

Six actual relations are required: helmut_store, llm_budget_counters, pipeline_locks,
helmut_jobs, process_runs, helmut_job_outbox. A pure current catalog/actor barrier
precedes any business field read. Exactly 11 used attributes, four stock types and
16 stock IO entries are checked and compared to the genuine bound catalog, including
relation/type/attribute identities, xmin, ACL and privilege checks. Only permanent
ordinary heap relations without inheritance/partitions and the actually observed
BYPASSRLS invoker are accepted. Actor is not assumed to equal Root postgres. No
RLS disable or SECURITY DEFINER shortcut is used. Logical missing stock datums may
be read normally; opaque `attmissingval` is never serialized. Heap scans are preferred
by fixed planner options; unknown custom I/O/storage and unsupported shapes STOP.
This uses the normal trusted PostgreSQL platform boundary and does not attest C
binaries or exclude privileged outside catalog mutation.

The current existing `helmut_synthetik500_internal.json_compact` exact source/body,
OID/signature, owner/language/config/ACL/catalog descriptor is mandatory. It is not
called before its barrier. That serializer is a dependency of Native D's private
schema, not a newly stock-assumed serializer. This recipe does not install or replace
it. Actual serializer/type/actor/ACL/catalog facts are NULL in source and hard-stop.
Root must materialize and independently review those constants, the resulting
function body/config/ACL and exact whole catalog descriptor before installation.
The body hash in the staged packet is derived after this materialization; no circular
self-hash constant is embedded. No execute grant is included in the inert recipe.

Adding the public RPC changes Native D's protected `publicFunctionsExceptOwn`
baseline. Install it before observing a fresh baseline, or explicitly reobserve/
recompute that protected baseline with independent acceptance. Never silently change
Native D's 3 public/5 private functions or 17-object ownership whitelist. If Native D
installation creates the serializer after its initial public-function snapshot, a
separate sequencing/re-baseline step is required. All such installations remain open.

## Quiet, full consumer and limits of this result

Native aggregates cover all rows, with no latest-N/time-window shortcut: open jobs,
live leases/locks, unfinished processes, open outbox and unknown/null control states.
All must be exactly zero. Blob pipeline locks and every retained processRun are
checked against the native witness time, with no missing-default substitute. An
existing cost admission/dispatch journal stops this pre-start flow; it is not deleted.
This is point-in-time observed quiet for these scopes. Controlled future actors,
paid routes, GitHub, cron and end-guard evidence remain separately Root-bound inputs.

The unchanged synthetik Startschutz receives complete original `kosten.auth` and
the genuine counter, plus bound preparation inputs. Its full book/order/historical
cost checks and complete nonfinancial contract remain active. Output includes only
hashes, technical heads/counts, signature and that consumer's preparation hash line;
no tickets/books/users/sessions/source data or secret is exported. A successful
local preparation check is not complete finite funding. Genuine U/W, full remaining
worst-case cost, numeric funding decision, paid in-flight exclusions, end activation
and 500 remain independently required. `fundingAccepted`, `globalFutureQuietAccepted`,
`activation` and `paid500` are always false here.

Source-only verification is limited to one authorized Node syntax check for each of
the three newly touched JS files. No imports, helper/route execution, unit suites,
native queries, Docker, provider calls or deployment is authorized in this lane.
