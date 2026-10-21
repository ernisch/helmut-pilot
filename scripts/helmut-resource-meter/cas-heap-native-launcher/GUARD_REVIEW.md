# Source guard review boundary — not executed

Parent: auth-write-phase-native-launcher PREPARED1868119f, host7d6d654e.
New common/run/worker schemas, Root intent/cases and C SQL bindings are distinct.
No final freeze is permitted while any real handoff is missing.

Keep worker guard/capture/copy_complete/proc_diagnostic function bodies literal;
keep strict PostgREST stop and external PG SIGINT/wait/EOF spans literal.
FREEZE_SOURCE checks these text spans and reports changed/new/removed functions;
this is source fidelity, not AST, runtime, semantic or independently approved proof.
No guard checks are executed by this preparer.

Exactly25 frozen input files remain parent-byte-equal, including U3b88, driverbd044,
Parts f300, both NEW base installers, old unused historical bodies, shutdown helper/
policy/upstream bindings and metric SQL. Catalog SQL adds only the two logging
setting names; startup adds only log_error_verbosity=terse/log_min_error_statement=fatal.
Actual receipts must confirm both; RAISELOG context/statement disclosure is forbidden.

C owns exact overlay and temporary two-object observer ACL prepare/selected/restore
SQL and receipts. Never widen membership, SecurityDefiner, owner or public Auth ACL.
Selected observer ACL is an explicit bounded exception, not whole-catalog equality.
Missing/unrestorable raw ACL baseline fails before grants. Restore on success and
failure before final acceptance; a failed/unknown restore cannot be retried blindly
or accepted. Full public ABI/ACL/catalog/source/restoration still must be exact.

The completed PG log parser accepts only4 CAS binders/8 heap frames in fixed order,
with strict scalar keys/types/PID/XID/accepted driver revision binding. Nullable
raw GUC values are preserved and bounded, not forced NULL/OFF; only exact'on'
projection is rejected according to existing branch semantics.
No names/payloads/graphs, extra Auth RPCs or JS observer work are introduced.
Allocation, non-atomic context traversal and logging overhead remain included;
context accounting cannot establish RSS, lifetime peak owner or RAM saving.

Root must independently review exact final source, run focused pure guards/CLI/
syntax qualifications, perform fresh native admission and separate lifecycle/work
adoptions, then independently accept actual results. No automatic native start,
retries, sequence, cleanup, old-case reuse, third layout attempt or full500.
