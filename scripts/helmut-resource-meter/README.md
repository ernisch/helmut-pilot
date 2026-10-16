# Isolated local resource meter

This is development measurement plumbing, not a Production deployment or a500
start GO. The Helmut engine, original inputs,16 fresh security controls and
Offline90/Preparation60/Unit60/Auth30 limits remain unchanged. The existing
application+runner limit is2048000000bytes; database infrastructure and the actual
simultaneous whole local stack are reported separately.

## Kernel lifecycle

Fresh Docker cgroup-v2 parents record memory.peak, CPU, OOM and block IO after
all owned processes/threads exit and populated=0. No bootstrap sentinel runs.
App, Worker, Root/install/U stages, observers, CLI helpers and restricted broker
are included. A common parent measures simultaneous app+DB+storage-holder peak.
Codex control/Docker daemon are existing host infrastructure outside workload.
No sum of individual high-water marks substitutes for the group peak.

Neither app nor DB receives the daemon socket. A separate measured broker
forwards only approved exec commands into the one owned DB and fixed inspect.
It cannot create containers or address an old/foreign container.

## Native persistent storage

The earlier inode/stat physical-upper candidate was independently rejected:
delayed allocation/CoW can invalidate a supposed physical bound. Its source and
all experimental reports are retained privately outside this directory. It is
not eligible for full runs.

The supported DB path requires a NEW exclusive regular-file image and a NEW
owned ext4 volume. A narrowly privileged setup helper atomically attaches only
an unbound exact loop minor to that image, verifies inode/device/size with
LOOP_GET_STATUS64+BLKGETSIZE64, then reopens readonly and drops ALL capabilities
before READY. It has no host /dev/PID/network or daemon socket and permission
for only one block minor. The app/DB gain no privileges. Setup is not automatic.

The storage proof verifies actual PGDATA device major/minor, native ext4 type,
filesystem size, pinned kernel receipt and absence of external PGDATA symlinks
or devices before/after the server. Native snapshots reject external tablespaces.
The strict upper includes every block of the guest filesystem, PGDATA,WAL and
its filesystem metadata. It is a kernel-enforced CAPACITY UPPER BOUND, not an
exact observed allocation peak. Host backing-filesystem overhead remains outside
this guest scope. The prepared full500 plan requires exactly8000000000bytes;
small calibration uses512MiB and no profiles.

No autoclear, detach, reassign or mount/format API exists in the holder. Failed
or expired holders leave the mapping bound to their OWN image for safe recovery.
Before normal exit the device node is retired; the controller renames its node
directory before STOP so retained volume definitions cannot later follow a
stale device address. Image, volumes and reports remain local. Repeated small
fixtures leave owned loop mappings until separately verified host cleanup.
Never detach a mapping without checking its exact backing inode/device.

## WAL, traffic, errors and logs

PG17 native read-only snapshots run before the first stage, during work and
after client shutdown. Resets/regressions fail acceptance. Only first/latest
snapshots remain in RAM; complete numeric samples stream to a local file.
Fresh-initdb WAL generation is bounded from nonnegative LSN zero through the
actual clean shutdown checkpoint plus segment end allowance; initial padding
is included. Application-baseline WAL deltas are separately labeled.

Own namespace interface counters include startup, all directions, errors/drops
and a stable tail after clients/server exit with no active non-TIME_WAIT TCP
sockets. Directions are not blindly summed into billable egress. The Node
preload measures HTTP1 headers/framing/received body bytes, request/status/abort
and socket totals without retaining bodies, header values or queries. Explicit
preload survives scrubbed env. Each PID/thread start needs a closed-schema exit
receipt; full acceptance rejects unknown/incomplete/reset measurement. The pure
content Worker has no preload but explicitly denies every network/spawn API;
its memory/CPU remain kernel measured.

SQL/Docker RPC stdin/stdout/stderr are additionally counted as IPC payload, not
billable network. Private logs remain local; producer/log payload bytes are
reported. Unknown provider serialization overhead and real model responses are
not assumed zero. Tiny mock data alone cannot close Production cost ceilings.

## One500 attempt

No default command launches a500 workflow. Full start requires Root-adopted
independent Pro High reviews, exact source pins, a fresh owner authorization
binding, a fresh actual start preflight and sufficient same UTC/Berlin-day time.
One GLOBAL exclusive ONCE_ONLY_RESOURCES_GO_CLAIM.SAFE.json is written before
start; runtime verifies recipe SHA256, container ID and authority pins.
Historical OWNER_LOCAL_GO is never reused. All original engine guards remain.

The retained execution fixture is qualified16Oct2026. Its window ends before
Berlin midnight22:00UTC. Last actual complete workflow took8089543.088ms.
Later execution needs a genuinely current independently reviewed day binding;
never silently redatestamp or relax day/price/quality rules. This creates no new
owner-GO requirement: the operator's existing one-time resource GO remains unused
until a valid actual run starts. No automatic full-run retries.

Tiny tests cover Worker/exit tails, errors, concurrent foreign exclusion, HTTP
framing/reset/callbacks, env scrubbing, closed receipt/claim guards, native PG
and kernel-enforced ENOSPC. They create zero profiles and make zero Helmut paid
model calls. All earlier failures/corrections remain in the local evidence area.
No Production action, merge, deployment, migration or budget change is performed.
