# Complete start preflight: scope and consumer comparison

This is a local development gate. It grants no GO and never activates a profile.
The two historical resource attempts, their owner documents, claims, databases,
receipts and inputs remain immutable. Neither namespace can be reset or replayed.

`full500-controller.py --check-only --accepted-bindings FILE` is the single
read-only entry point. Its result reports every independent check group, including
blocked groups after an earlier failure. The same assessment runs inside the real
controller before its FIRST setup reservation and again immediately before that
reservation. All original execution-path assertions remain in place.
`isolation.verify_pre_setup_authority` is shared with `verify_full_authority`;
it checks existing authority predicates that do not require created objects.
Final launch/claim additionally requires the exact complete pre-GO report, with
all check IDs, freshness and exact binding pins. A direct launch cannot omit it.

## Comparison with actual consumers

| Actual consumer / boundary | Before-GO check | Evidence that must still be obtained during execution |
| --- | --- | --- |
| controller accepted_metadata; isolation verify_full_authority | Exact acceptance/connection/recipe pins; primitive and integration reviews; allFilePins collects every missing/changed file; source closure inventoried | Fresh owned container ID, final serialized recipe SHA, exclusive setup reservation and GO claim |
| connection.stage; preparation.checkOwnerGo; common.activated; assembly owner guard | Exact local target suffix, schema, confirmation, timestamp, owner reference, production=false,500, paid=false, exactlyOneResourceAttempt=true, **allowDispose must be literal false** | No inference or repair of an old/consumed owner document; actual activation receipt still required |
| zero_day.verify_capture; preparation.financialProposal; K.historie/pruefeStart/auftragsStand | Original and corrected native auth/counter witness equality; ENTIRE counter table; all historical days; stock financialProjection; unaltered limits; authority evaluated separately from data | Exact restored input equality, original conditional auth update and fresh runtime cost controls |
| controller.window; preparation.window; contracts.checkWindow | Exact reviewed17Oct UTC/Berlin day and window; last complete8089.543088s+600s reserve; no backdating or extension | Genuine current command timestamps and each fresh expiry check |
| original_preflight; Gates.pinned; H.privateJSON | Nine original hashes; actual complete original DB identity/profile/U binding; all six native KOs, seven documents and complete link set; canonical paths, selected private modes; exact replay of26 staged transformations | New owned clone and inactive snapshot must actually equal input; native SQL0-to500 result |
| preparation.reviewed/finishInactivePreparation | Request status, target, package, all primary pins, local external binding, end watcher, canonical state publication timestamps; actual package generator validation | Real snapshot/nullbestand/runtimeManifest/import/activation SQL are never replaced by projected positive receipts |
| assembly/start-services | Pinned binary/config, exact config literals, fresh service/material output targets; actual common constants and bridge API | New DB IP, PostgREST/gateway readiness and HTTP health; no old gateway reuse |
| prepare-materials.budgetScenario/prepare; local-io/root-io-bridge.environment | ACTUAL budgetScenario predicate (2416/702/200/1 and primary SHA); fictional env only, communication blocked, no external key/private signer; JWT source mode/format; original store IDs | Fresh signer, public/private separation, service token and generated environment bytes must really match |
| build-command; original-draft-request; assembly mock loop | Exact500 owner set, active ordinary-v1 rows, native inventory/version fields/fencing, prior U pin, all original A/F/L day acceptance bindings; original D/preR/Q at both accepted endpoints for all500; template hash/variant completeness; actual sourceBinding; EU route, direct purposes | Fresh run/command/plan hashes,1000 genuine intents, original executor, exact D binder and packet metadata depend on newly generated command and stay mandatory |
| H.destination/save/mkdirFresh; sequence entry | Fresh case/output/run dirs; no previous packet/activation/assembly/failure/controller/sequence/material/service outputs; no overwrite/continuation | Exclusive creation remains atomic; future disk/I/O errors cannot be predicted |
| process-runner; contracts.LIMITS; sequence | Exact three commands, pins/timeouts and CPU0; all500/16; worst cases0,499; Offline90/Preparation60/Unit60/Auth30/2048000000B unchanged; mock-only/no profiler | All original negative cases, actual16 fresh controls per500, ACK/result counts and timings |
| bounded-storage/kernel-meter/isolation | Node24.19.0,Python3.12.14,pinned PG image,cgroupv2/vfs,CPU0,formatter availability; free space8GB+8GiB; approved minor observed unbound; all names/subnet/cgroup unused | Atomic loop configuration, owned8GB filesystem identity, PGDATA/WAL/no external tablespaces, all namespace IDs |
| process/network/HTTP/WAL/finalization meters | Exact reviewed meter/source pins, continuous1s DB observer and full phase recipe; original scoped independent meter acceptance | Actual common kernel peak/CPU, WAL/DB/IO, network requests/bytes/errors/logs, every child/worker and final populated=0 |

## Coverage is a checked prerequisite

`start-guard-inventory.js` parses JavaScript with the pinned Node's bundled Acorn.
Python uses `ast`. Neither imports or runs a consumer. The inventory records code
SHA256, assert/throw and **all call** locations/expressions, and import/require references across the
complete pinned code set plus current meter code. New code/guards or any code
change invalidate the separately adopted inventory hash.

An inventory is **not** semantic proof that every condition is covered. The gate
requires a separate Root adoption of independent Pro High review, its exact
inventory SHA and zero unresolved precomputable conditions. Until that artifact
exists, `completeIndependentCoverage` is BLOCKED. A helper's generic `status:ok`
alone is not a complete acceptance. Unseen dependencies remain explicitly open.

All check IDs must exist exactly once and PASS. An empty/partial report, blocked
field, >60s-old complete check, changed pin, absent review, consumed GO or used
case refuses BEFORE reservation. The controller does not accept an external
caller-provided pass receipt. Assessments are observations; concurrent changes
remain protected by the original fresh/atomic runtime guards. There is no claim
that future I/O failures, scheduler delays or runtime limit violations are
impossible.

The Node CLI denies network/process start and common file mutation APIs while
running deterministic consumer input functions. It imports only the exact staged
transformations of review-pinned templates. It never imports the assembly or
sequence IIFEs. These API guards are defense in depth, not an OS sandbox for
arbitrary untrusted programs.

## Independent review findings and resolutions

- Infrastructure review found authority checks deferred until after resource
  creation. They now reside in the shared pure `verify_pre_setup_authority`,
  invoked by the precheck AND final authority. Only actual-created reservation,
  CID and start receipts stay late. The mandatory complete report also gates
  direct final launch/claim entrypoints.
- The26-template baseline is SHA256-pinned. Count, exact original set,
  destination and transformations must match `connection.render_templates`,
  the SAME pure function used by actual staging. No arbitrary replacement list
  or omitted file can qualify. Python/JS inventories now include ALL calls,
  avoiding name-based validator omissions. Inventory remains syntactic.
- The actual controller now forwards the separate coverage-adoption pin to its
  own assessment. Empty/partial/duplicate/stale reports cannot qualify.
- Source pins are checked individually both in the consumer input validator
  and in the aggregate all-file audit. Contracts/common/bridge modules have
  explicit immutable-workflow pin checks; all other staged modules are checked
  against the complete exact producer transformation before any import.
- Service config SHA and original literals were already in the materials
  check; they are now separately named `servicesInputs`, with target/port
  substitution, original-source absence, exact binary hash and output freshness.
- Final-config acceptance/execution/authority statuses and selector/packet/key
  equality do not exist before generation. They are mandatory actual runtime
  checks, not missing precomputable fields. Before GO, the REAL base template's
  schema/scope/mode/policy/worst cases and fresh derived run directory are
  checked; immutable producer/consumer source must be independently accepted.
- The final source binding includes the NEW public signing key, which does not
  exist before GO. Precheck computes the genuine initial binding and compares
  its hash with the separately adopted expected initial identity. The final
  generated-key binding and acceptance equality stay mandatory at runtime.
- The read-only API guards now wrap `assess` itself and restore on exit, so
  module callers receive the same protection as the CLI. Targeted tests verify
  blocked HTTP, spawn, Worker and file-write APIs. These are defense in depth.

Neither a generic independent `ok` nor this resolution text grants complete
acceptance. The exact final inventory and changes require independent review;
blocked reviews remain retained and cannot serve as positive acceptance.

## Current authorization status

No new GO exists. The current controller's claim namespace belongs to the
**consumed**16Oct-correction/resource authorization; it must remain blocked.
A future, separately approved attempt needs a newly reviewed exact binding and
fixed global authorization namespace, never deletion or relabeling of old claims.
The17Oct00:00..08:59:59.999UTC acceptance cannot be silently extended. Local
mock/input success does not close Production memory or infrastructure cost proof.
