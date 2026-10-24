# V5 cold digest comparison — PREPARED / NOT RUN

This is a small evolution of the actually qualified R-v4 launcher, PREPARED
SHA256 `8b72d7fce72e41e7b1419c74f362fc7c23ad7dc97c8b2fe9a6f63fc330b05b6b`.
The complete eight-file v4 source closure is preserved under `baseline-v4/`.
No test, syntax check, Docker/PG/native start or SQL execution was performed by
this preparation. Independent Root/capacity review and fresh adoption remain
required. No old GO, result, case, or adoption can be reused.

There are exactly two measurement types. No selector invokes historical01/02/03.

1. `ram`, with explicit variant `OLD` or `NEW`: one cold four-key read using one
   identical pinned observer SQL file for BOTH variants. Only the selected
   graph_read body hash and the fresh UUID differ as SQL parameters. Both
   variants install their own separately pinned OLD/NEW body, including an
   explicit no-op OLD reinstall, after the same reviewed renderer installation.
   Each fresh native group covers original-runtime verification, complete source
   hashing/copying, JIT, identical setup, one read, and closure through last exit.
2. `differential`, with null variant: exactly nineteen explicit paired requests,
   in the pinned case order. Each selected SQL invocation calls OLD once, replaces
   only the graph_read body, calls NEW once with the SAME request/role/nonce,
   requires exact JSONB equality or identical SQLSTATE AND error message, and
   ROLLBACKs. Each pair proves complete catalog/ABI/ACL/Auth restoration; an extra
   independent complete catalog read follows the nineteen pairs. The component's
   native lifetime peak is diagnostic only. It is not a RAM comparison.

Canonical source stays the same 1709-file / 369399611-byte original with complete
manifest SHA256 `827a9872003182a73dff6329f16e0f68aa429fbe680606b58c138668a8d23396`.
R's `supabase/proposals/auth_read_bounded_local.sql` remains the original
595b2530… source throughout native comparison. Candidate code is separately
pinned; this tool changes no repository or source database. The original
graph_read body is 1644ff69… and the exact candidate body is bound by PREPARED.
The copied PG_PREPARED receipt conserves engine commit
`c2b5a2596804eeabf737b1d038a567228c7d015d` / PG preparation752bbce….
The source-adapter proof-gate correction and adapter qualification are separate
and pending. This native path neither imports nor executes that adapter. An
adapter-only child commit does not silently replace this pinned runtime closure.

Future Root-only commands, after concrete review and admission:

    python -B run.py prepare --measurement ram --variant OLD --case CASES/digest-24freshhex
    python -B run.py prepare --measurement ram --variant NEW --case CASES/digest-24freshhex
    python -B run.py prepare --measurement differential --case CASES/digest-24freshhex
    python -B run.py start --root-adoption EXACT_NEW_RECEIPT

Each is a separate fresh case, not a combined loop. CASES is fixed outside all
Git worktrees at
`/workspace/helmut-ram-fix-20261020/cold-digest-comparison-20261020/cases`.
Prepare is metadata-only. It authenticates the closure, checks the original tiny
runtime image/native policy/source live-mount metadata/vfs/admission, creates a
new private case, and writes PREFLIGHT. Full original PGDATA reads start only
after the unchanged N.start has returned READY inside start.

Prepare generates one UUIDv4 for a RAM read, or nineteen distinct fresh UUIDv4s
for the nineteen differential pairs. It replaces only the exact request-template
value `__ROOT_FRESH_PAIR_NONCE__`. Deliberately malformed request nonces remain
malformed; legacy/malformed requests still have a separate fresh bound pairNonce.
No request's values, role, expected outcome, ordering or case identity can be
overridden by the caller. Preflight, adoption, START, worker config and final
result bind the same selection and complete concrete request list.

Root writes a new exact adoption containing:

- schema `helmut-cold-digest-ram-root-adoption/1` or
  `helmut-cold-digest-differential-root-adoption/1`, matching the selected mode;
- action `ROOT START COLD DIGEST RAM OLD ONLY`,
  `ROOT START COLD DIGEST RAM NEW ONLY`, or
  `ROOT START COLD DIGEST DIFFERENTIAL 19 PAIRS ONLY`;
- measurementMode `ram` or `differential`; variant `OLD`/`NEW` for RAM, null for
  differential; the exact preflight selection, readNonce and differentialRequests;
- integer ramReadCount=1 / differentialPairCount=0 for RAM, or 0 / 19 for
  differential; exact current preparedPin and case preflightPin;
- atUTC/expiresUTC with the same fifteen-minute freshness bounds as v4,
  a new 24-character lowercase hex adoption nonce, installReviewedRenderer=true,
  exact sourceManifestSHA256, full500=false and production=false.

The selection binds mode, variant, action/schema, selected installation SQL pin,
measurement SQL pin, expected body SHA, request-template pin and exact counts.
STARTED is written once before native work. No automatic retry exists.

The original catalog must first match the complete native before-catalog,
including old renderer b3157f… and graph_read 1644ff69…. Installing renderer
d02ac4… must change only its body. Then the selected OLD or NEW graph_read
installation must change only that one body, retaining the exact original
function signature/ABI/raw ACL, all roles, relations, settings and physical Auth.
Both RAM variants perform five setup SQL sessions / twenty-nine statements:
three five-statement catalog files, the six-statement renderer install, and the
selected eight-statement graph install. Differential uses the same OLD setup;
its pair SQL and final verification are explicitly additional diagnostic work.

The shared RAM SQL retains the 03 original identity, state, physical Auth,
function, role, GUC, reachability, nonce, graph/digest and temp-stat guards. It
uses one scalar graph_read behind OFFSET0; no large observer MATERIALIZED CTE.
The whole result remains in the database. Captured output contains metadata,
whole raw result hash/sizes, Graph/Data/State/Proof hashes and the SMALL
componentSemanticDigestSHA256 document made from those component hashes and the
two complete reuse objects without nonce/binding. Full expected result/reuse
key shapes are SQL-qualified. No normalizedWholeResultHash is claimed. The raw
whole-result hash may differ between RAM cases because their nonces/bindings
differ. Exact complete response equality, including nonce and binding, comes
only from the native nineteen-case differential component.

Before comparing OLD/NEW RAM, Root must require both fresh RAM results PASS,
the same complete source/runtime/native policy/shared observer/setup closure,
equal component hashes and componentSemanticDigestSHA256, and a separately
successful nineteen-pair native differential result for these exact candidate
source/body pins. Compare the two kernelThroughLastOwnedExit.memoryPeakBytes
values only with their scope and natural-cache/order limitations. Neither a
historical v4 result nor the differential lifetime peak substitutes for either
fresh symmetric RAM arm. This launcher performs no hidden comparison or retry.

Added hash/catalog observer work is symmetric for OLD and NEW. Temp counters
cover the exclusive database plus observer SQL. Target time includes summary
and hash work. Native peak covers the entire dedicated group's lifetime, not
pure query RAM. Cold means `knownGraph:null`, not cold OS caches. There is no
host-total, common-RAM saving, plateau, full500, reserve, HTTP transport, private
client-token acceptance, or sole nested-SRF attribution claim in preparation.

All v4 resource/source/closure guards are retained: immutable complete source
and independent persistent-copy manifest comparison; original runtime and JIT;
shared128MiB/work4MiB/temp128MiB/JITon/original sync settings; Unix socket only;
read-only source mount and container root; private native namespace, max
1547997184/high1399996416/swap0; disk768MiB+16MiB admission over the unchanged
8GiB host floor; bounded256MiB JIT/socket RAM mount; no PGDATA in tmpfs.

Every SQL client has a thirty-second wall limit including EOF/exit/success
return, every statement30s and lock1s, combined capture256KiB, PG log256KiB and
all evidence4MiB. The overall work/closure limits remain300/360s even for nineteen
pairs; there is no per-pair extension of the group deadline. Exceptions preserve
bounded buffer/signed-exit receipts after kill/reap. PG must exit0 with complete
log EOF/no read error/ended drain thread, shut-down pg_controldata and unchanged
complete source manifest. Exact workload CID closure, helpers exited, empty
descendants and kernel last-exit/lifetime counters remain mandatory. Late or
unknown closure fails. Persistent copies/hulls/evidence stay retained and the
retirement record remains ineligible until separate backup and Root review.

Integration requires copying the three Python files, catalog, renderer install,
this README and the final separately pinned PG SQL/request/source inputs. Rebind
their exact files/input/variant-install/observer/differential/request pins to the
destinations together. Do not resolve the SQL through C.HERE inside the worker:
the already-pinned canonical host paths are mounted read-only and authenticated
by the unchanged metadata-input mechanism. Root uses -B and verifies no local
pre-existing __pycache__; verified-byte native/kernel/JIT loading is unchanged.
