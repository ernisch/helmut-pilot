# CAS heap qualification, 21 October 2026

These are byte-identical review copies of the source, pure guards and contracts
used for the two completed diagnostics. `REVIEWABLE_COPIES.SAFE.json` records the
original paths, lengths and SHA256 values. Original evidence remains in place.
No database payload or private retirement context is included.

Root's recorded qualification passed 118 pure guards, six Python AST checks,
both real measurement selectors and host CLI exit cases 0/2/1. The qualification
receipts are under `docs/betrieb/belege/cas-heap-20261021/`. Copying unchanged
files does not constitute a new native execution or a second qualification run.

To reproduce only the resource-free validator guards from the repository root:

```sh
node scripts/lokal.js -- /opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3.12 -I -S -B scripts/helmut-resource-meter/cas-heap-qualification-20261021/run_pure_validator_guards.py scripts/helmut-resource-meter/cas-heap-native-launcher/worker.py
```

The guard reads and extracts seven pinned pure function definitions; it does not
import the worker or start Docker, PostgreSQL or a measured workload. The
preparation files retain their historical “unexecuted” wording; actual execution
is attested separately by `ROOT_QUALIFICATION.SAFE.json` and `PURE_GUARDS.SAFE.json`.

`retirement/` preserves the separately qualified cleanup actor and its source
contracts for review. That review copy is no authorization for another cleanup.
The two fresh case-specific adoptions were spent. The private context, once
claims and full source inventories remain only at their original local paths.
No full 500-profile run, production operation or additional deletion is authorized
by these files.
