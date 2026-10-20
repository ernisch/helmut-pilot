# Complete start preflight: scope and consumer comparison

This is a local development gate. It grants no GO and never activates a profile.
All historical resource attempts, their owner documents, claims, databases,
receipts and inputs remain immutable. No consumed namespace can be reset or replayed.
The current prepared slot is day20/V10, with19 pinned historical spent markers,
one fresh operator GO, a2GiB storage capacity, and the unchanged8GiB free host
reserve. It has not started or consumed its claim/reservation. The bounded
native reader requires fresh complete integration acceptance; component proofs
do not establish the common500-profile RAM or timing result.
The historical measured slot was V9 with17 pinned earlier consumed markers. Its separately
approved single attempt68f480265d50 finished on19October2026 at23:47:24UTC with
pass=false; its reservation and claim are now consumed and retained. This text
grants no further GO. Its dedicated internal subnet is 172.16.243.0/24;
the old 172.16.244.0/24 and 172.16.245.0/24 networks remain intact.

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
| controller.window; preparation.window; contracts.checkWindow | Exact accepted day/window; default requires one UTC/Berlin day. Explicit local mock calendar may cross Berlin midnight within ONE real UTC accounting day; all three actual consumers enforce the bound execution window. Last actual10685.884867s+600s reserve; no backdating | Genuine current command timestamps and each fresh expiry check |
| original_preflight; Gates.pinned; H.privateJSON | Nine original hashes; actual complete original DB identity/profile/U binding; all six native KOs, seven documents and complete link set; canonical paths, selected private modes; exact replay of26 staged transformations | New owned clone and inactive snapshot must actually equal input; native SQL0-to500 result |
| preparation.reviewed/finishInactivePreparation | Request status, target, package, all primary pins, local external binding, end watcher, canonical state publication timestamps; actual package generator validation | Real snapshot/nullbestand/runtimeManifest/import/activation SQL are never replaced by projected positive receipts |
| assembly/start-services | Pinned binary/config, exact config literals, fresh service/material output targets; actual common constants and bridge API | New DB IP, PostgREST/gateway readiness and HTTP health; no old gateway reuse |
| prepare-materials.budgetScenario/prepare; local-io/root-io-bridge.environment | ACTUAL budgetScenario predicate (2416/702/200/1 and primary SHA); fictional env only, communication blocked, no external key/private signer; JWT source mode/format; original store IDs | Fresh signer, public/private separation, service token and generated environment bytes must really match |
| build-command; original-draft-request; assembly mock loop | Exact500 owner set, active ordinary-v1 rows, native inventory/version fields/fencing, prior U pin, all original A/F/L acceptance bindings; default D/preR/Q at both accepted endpoints, explicit local mock mode at its separately accepted source view for all500; template hash/variant completeness; actual sourceBinding; EU route, direct purposes | Fresh run/command/plan hashes,1000 genuine intents, original executor, exact D binder and packet metadata depend on newly generated command and stay mandatory |
| H.destination/save/mkdirFresh; sequence entry | Fresh case/output/run dirs; no previous packet/activation/assembly/failure/controller/sequence/material/service outputs; no overwrite/continuation | Exclusive creation remains atomic; future disk/I/O errors cannot be predicted |
| process-runner; contracts.LIMITS; sequence | Exact three commands, pins/timeouts and CPU0; all500/16; worst cases0,499; Offline90/Preparation60/Unit60/Auth30/2048000000B unchanged; mock-only/no profiler | All original negative cases, actual16 fresh controls per500, ACK/result counts and timings |
| bounded-storage/kernel-meter/isolation | Node24.19.0,Python3.12.14,pinned PG image,cgroupv2/vfs,CPU0,formatter availability; free space2GiB+8GiB plus4new-vfs-container/output margins; approved minor observed unbound; all names/subnet/cgroup unused | Atomic loop configuration, owned2GiB filesystem identity, PGDATA/WAL/no external tablespaces, all namespace IDs |
| process/network/HTTP/WAL/finalization meters | Exact reviewed meter/source pins, continuous1s DB observer and full phase recipe; original scoped independent meter acceptance | Actual common kernel peak/CPU, WAL/DB/IO, network requests/bytes/errors/logs, every child/worker and final populated=0 |

## Coverage is a checked prerequisite

The optional local fixture calendar has a distinct acceptance status. Its exact
operation, 500 input-hash set, accepted source view, real UTC execution window and
descriptor are bound together; a source-view proof is never labeled a proof at
both execution endpoints. The raw policy and changed engine files enter the
existing signed actual-row source binding. Private mock transport registration,
all 16 fresh database/security controls, real timestamps and expiry checks remain
mandatory. Default/Production retains its Berlin calendar. This local calendar
contract change grants no execution authority, financial correction or test GO.

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

## Historical V9 authorization status

At the V9 endpoint no unconsumed resource GO remained. V9 was used exactly once after32 fresh PASS
groups and genuine independent scope adoption. It ended with499 native final
ACKs, terminal index499 HTTP409, and common memoryPeakBytes2300071936 above the
unchanged2048000000-byte limit. Its original source after-check passed; all
measured groups were empty with last-exit evidence. V9 and every earlier consumed
namespace remain blocked. A future attempt needs a separately approved new exact
binding, never deletion or relabeling of old claims. Historical day-window
acceptances cannot be silently extended: the explicit local fixture calendar
requires its own independent scope adoption. Local mock/input success does not
close Production memory or infrastructure cost proof.

## Preparing a fresh candidate before a new GO

`--check-only --prepare-without-go` runs the same32 groups, using the explicit
`helmut-owner-local-fixture-intent/1` document for technical policy only. It must
contain `authorized:false`, literal `allowDispose:false`, the exact new case,
operation, preserved old marker pins, existing corrected input and proposed final
owner path. Confirmation, approval time and user authorization reference are
forbidden in an intent. The staged action is also unauthorized. The future owner
file is absent; staged assembly already names that exact future file.

A complete technical plan returns `technicalReady:true`, **`pass:false`**,
`MISSING_NEW_OPERATOR_GO`. It cannot be frozen into an execution receipt, and
`--prepare-without-go` cannot be combined with `--run-exactly-once`. The default
controller and direct full-authority path always require the real GO schema,
explicit new authorization, literal preservation, fresh timestamp/reference, exact
confirmation and final owner path. No planning flag reaches the executable recipe.

The historical claim/reservation are `NEXT_RESOURCE19_V9_*` in the existing
meter area. All17 earlier consumed markers through V8 were hash-pinned to their
preserved baseline and never reset. V9's own two markers are now also spent and
retained. No replacement prospective slot or future authority is created by this
documentation. A future case/subnet must preserve the existing networks and
freshly recheck every actual subnet for overlap;172.16.243/24 is now historical.
Loop allocation remains an atomic runtime check against the reviewed unbound minor.

The successful16Oct,17Oct and18Oct corrections are reused only as preexisting input: exact capture
SHA, real old receipt/consumed-marker provenance, unchanged monetary limits, actual
native original/corrected auth and entire counter table, plus dump/roles/binary
pins. The historical correction GO grants no new resource authority. No correction
is repeated. Host preflight reads the actual original databases; the application
rechecks mounted provenance and the actual restored native bytes, without trying to
query the original server through its deliberately restricted broker.

After an explicit future GO, approval-dependent candidate metadata must be sealed
with the genuine new GO and all pins regenerated, retaining this pending plan. The
complete default preflight must freshly pass before any reservation. The temporal
acceptance, code inventory, prior reviews and unchanged source facts must remain
exactly bound; preparation results are never promoted to runtime receipts. This
is metadata finalization, not permission to activate during preparation.

## Exact container file visibility and early failure closure

The V3 attempt exposed a real completeness defect:32 host checks could PASS
while three required authority/source files were absent in the application.
`isolation.runtime_read_manifest` now defines one exact hash-bound input set:
meter acceptance, all accepted and requested source pins, primitive/connection
reviews, fixture/request/staged files, immutable workflow files, application
assets, owner intent/GO, preserved consumed markers, actual corrected-input
provenance and day/independent day review. Historical owner approvals mentioned
only as provenance are not recursively imported.

`application_mounts` consumes that list for BOTH the eventual application and
the small visibility check. `mountInputs` starts only the existing pinned image's
networkless Python read/hash checker. It opens all listed bytes and proves the
effective longest matching `/proc/self/mountinfo` mount is read-only. It never
imports a workflow entrypoint, runs a recipe, activates profiles, queries a
database, reserves storage or consumes GO. Probe metadata/logs are retained;
only that exact fresh ephemeral probe container is removed after exit.

The pinned image and read-only repository/Node/Python mounts supply trusted
platform code/libraries. Generated workflow files remain confined to the owned
case, output and temporary directories. A new GO, global reservation/claim,
fresh actual setup/empty-DB receipt, generated signing key and final immutable
configuration do not exist during planning. No placeholders are manufactured.
Their actual authority, byte binding, identity and freshness remain required at
runtime. After the real GO changes metadata, the default full precheck hashes
the actual new inputs again inside the same mount builder before reservation.

Runner cleanup now surrounds recipe parsing and initial authority checking,
in addition to the original stage cleanup. A failure still terminates only its
owned private-PID children and the fixed `/meter-database` supervisor mount,
without trusting a shutdown path in invalid recipe JSON. Host finalization also
signals the exact new database after app exit. Controller setup failures close
only resources matching its exclusive reservation invocation ID and dedicated
case cgroup; concurrent/consumed reservations never qualify for cleanup.

The container runner and its child cleanup also require actual PID1 BEFORE
entering any workflow or error-cleanup path. A direct host invocation fails
without enumerating/signalling host processes or stopping a database. This
private-namespace precondition is enforced, not just assumed by the cleanup.

The container visibility check is a necessary actual observation, not a
guarantee against later disk, scheduling or other I/O failures. Every full
technical condition must still pass freshly; insufficient free disk remains a
technical blocker, distinct from missing operator GO.

## Whole-run window and final runtime authority

`controller.window` and `start-preflight.window_evidence` require at least
11285.884867 seconds:10685.884867 seconds for the last complete workflow plus600
seconds for setup/close reserve. The actual controller calls this gate before
setup and again after the owned database is ready. Its second complete
32-condition assessment must pass immediately before the exclusive reservation.

The shared and final isolation authority checks retain an additional
10685.884867-second runtime-workflow floor. That floor is not a substitute for
the complete whole-run gate: `verify_full_authority` also requires the exact
reserved complete proof and a matching actual post-setup start receipt no older
than60 seconds. `claim_full_attempt` and `launch_application` call that same
final authority check. Neither a lower isolation floor nor a planning-only
intent authorizes bypassing the complete11285.884867-second controller gate.
These are existing separate checks; no window, reserve or runtime limit is
changed by this explanation.

## Historical measured day19/V9 continuation and closed authority

The terminal historical slot accepted only19October2026 and the exactV9 owner document,
global claim and reservation. All17 earlier consumed markers through V8 remained
in the immutable historical baseline. The actualV9 attempt is now terminal;
neither its owner document nor either marker can be reused or reset. Unapproved
intents cannot satisfy an executable owner-policy check. Old cases are retained
unchanged. See the actual outcome in
`docs/betrieb/local-control-resource-outcome-20261019.md`; the tested revision was
80273b866594081a68777eeb318abf291b397beb before these documentation-only updates.

That historical input source was the separately approved, completed book18 correction in
`helmut_resource_input_20261019_e400dff25393`. The shared source verifier checks
all three correction receipts, native financial witnesses, the full empty counter
table, and the exact book18/capacity39→40 delta while preserving the earlier
correction bindings. Historical approval references
prove completed input provenance only; their owner documents are not opened or
reused as resource authority. Current-day19 bookkeeping remains the original
in-memory projection until genuinely authorized runtime preparation.

`next-resource-authority.capture_data_pins` supplies the same explicit source
dependencies to the verifier, staged input set and actual container visibility
check. It includes prior witnesses/receipts and the completed input-only claim;
it excludes historical owner approvals. `query_input` has no writable mode and
can address only that fixed completed local input database.

The proposed dedicated subnet is172.16.243.0/24, selected after a complete read-only
overlap check and checked again before setup. Earlier networks remain intact.
The explicit local mock calendar is the only calendar-contract change; all500
profiles/1500positions/16fresh controls, originalU, Offline90/Unit60/Auth30,
joint2048000000-byte limit, filesystem reserve and runtime safeguards are unchanged.

The actual preparation and its deterministic precheck now share
`measured-preparation.assertInputBindings`: the physical corrected input,
logical source namespace in the new owned server, exact19October target and
exactV9 claim path must agree before any real claim file is read. The connection
also binds these fields to the Python authority constants. No future claim is
created for the precheck. The actual atomic installer and materials precheck
share `atomic-usage-integration.assertLocalTarget`, preserving its original
production/profile/container guards with the current19October namespace.
The entry regression stops at the first mocked SQL boundary and creates no
database, activation, acceptance receipt or usable operator authority.


## New20Oct/V10 source and bounded reader delta

The next unused slot is20October/V10; both terminalV9 markers are added to the
19 immutable prior marker pins. All previous claims/reservations remain spent.
The completed19Oct null-book correction in the newinput20 database is a fourth
DATA layer above the unchanged16/17/18Oct verifiers. Its exact native auth and
empty counter witnesses, source dump, receipt and once-only input claim join
the same explicit capture_data_pins closure used by host and container reads.
Historical owner documents remain excluded. The measured stage now checks the
exact20Oct target/input/V10 claim before opening a claim file. No current-day20
book exists until the actual measured original preparation creates it.

The new independently reviewed SQL delta is admitted only by the explicit
bounded-native-read-v1 descriptor combined with the original Merkle/history/
control modes. SQL source hashes and exact native helper/reader bodies,
signatures, STABLE/invoker/pg_catalog attributes and grants are checked. No
unexpected function, body drift or policy is normalized away. The unchanged
base bootstrap is checked first; the new overlay is applied only afterward to
the owned new measured target, followed by complete candidate catalog checks
and the original all-field logical hash. Root-IO checks those same candidate
catalogs before runtime. CAS/writers/history and original full reader stay exact.
The old W50 acceptance is not relabeled as acceptance of this SQL/integration.
The adapter's separate diagnostic-only source delta is explicitly identified.

The new case binds exact2GiB device capacity forV11 with the unchanged8GiB free host
reserve and33000-second holder lifetime. This is a stricter physical disk upper
bound, not a measured peak or a lower free reserve. Controller, factory and
precheck must agree before setup. Actual whole lifetime bounds remain mandatory.
The new exact private subnet172.16.242.0/24 was checked for overlap; the old V9
network remains retained. New20Oct source adoption and sameUTC execution-day
calendar keep every real budget/security/deadline clock. The window floor is
raised to the last actualV9 runner10685.884867seconds plus600seconds reserve.

Only the local observer formatter is changed for the new explicit mode; the
original Error propagates unchanged. Extra causes are limited to four, prototype
lookup to eight steps; unknown cause text is hashed and not emitted in clear.
No stack/environment/credentials or added permission/ACK cache is introduced.
These changes require fresh complete independent source/guard adoption and all
32 entry groups; native component checks do not authorize or prove full500.

## Bounded exact500 input loading within the explicit local candidate

The bounded-native candidate also binds `bounded-profile-rows.js` in its exact
source closure. Only its assembly and exact `contracts.json` day-row pin use
this reader. All original raw bytes/SHA256,500 complete row values and original
command decoder remain mandatory; no field projection or permission cache.
One row is parsed at a time; exact repeated JSON subtrees may be shared only as
immutable values, with bounded interning metadata. Unknown writes fail closed.
Both renderer transformation sites are exact and replayed against all26 original
templates. Default and other descriptors retain the original JSON reader.
Native SQL semantics proofs do not accept this separate JS integration. Actual
all500 equality, parser negatives, bounded-component RAM comparison and current
independent full source/guard adoption are required before the one full attempt.

V11 retains the original8GB maximum and tightens its particular owned guest
device to2GiB. The original full-run dataset and SQL semantics are unchanged;
the known286909881B database-size sample and67108864B WAL-file sample are
feasibility observations, not peak guarantees. Disk exhaustion remains a real
possible terminal failure of the one authorized trial. No original/evidence
deletion or reduced8GiB host floor is inferred. Preflight now additionally
budgets four new Docker-vfs image/init copies plus64MiB each and512MiB retained
output; the exact437457485B image size is checked against the pinned image.
