"""New fictional cache-stage checks only; no actual binaries, children or network."""
import sys
sys.dont_write_bytecode = True

import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_runtime_cache_checks', HERE / 'runtime_cache.py')
R = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(R)


class RuntimeCacheChecks(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix='w15-fictional-cache-')
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name)
        self.repo, self.runner, self.binaries = (self.base / name for name in ('repo', 'runner', 'binaries'))
        for directory in (self.repo, self.runner, self.binaries):
            directory.mkdir(mode=0o700)
        self.packages = {'package.json': b'{"name":"FICTIONAL"}', 'package-lock.json': b'{"lockfileVersion":3}'}
        for name, raw in self.packages.items():
            path = self.repo / name
            path.write_bytes(raw)
            path.chmod(0o644)
        self.sources, self.raw = {}, {}
        pins = copy.deepcopy(R.C.RUNTIME)
        for name in ('node', 'postgrest'):
            raw = ('FICTIONAL-PUBLIC-' + name).encode()
            self.raw[name] = raw
            self.sources[name] = self.binaries / name
            self.sources[name].write_bytes(raw)
            self.sources[name].chmod(0o755)
            pins[name]['bytes'] = len(raw)
            pins[name]['sha256'] = hashlib.sha256(raw).hexdigest()
        patcher = patch.object(R.C, 'RUNTIME', pins)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.root = self.runner / 'w15-end500-123456789-26d5a4135ca7415ca41262fc45b561c8'
        self.cache = self.root / 'cache'
        self.context = {'hostPaths': {'runRoot': str(self.root), 'work': str(self.root / 'work'),
                                      'prepare': str(self.root / 'prepare'), 'cache': str(self.cache)},
                        'runnerTemp': str(self.runner), 'runtimePins': copy.deepcopy(pins)}
        self.source_checks, self.samples, self.checked = 0, 0, []
        self.source_hook, self.resource_hook = None, None

        def check_sources():
            self.source_checks += 1
            if self.source_hook:
                self.source_hook()

        def sample():
            self.samples += 1
            if self.resource_hook:
                self.resource_hook()

        self.review = {'sourcePins': {name: {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
                                      for name, raw in self.packages.items()}}
        self.inputs = SimpleNamespace(controller_context=lambda: copy.deepcopy(self.context),
                                      check_sources=check_sources,
                                      source_review_bytes=lambda: json.dumps(self.review).encode())
        self.resources = SimpleNamespace(sample=sample)

        def checked_inputs(value):
            self.assertIs(value, self.inputs)
            self.checked.append('inputs')
            return value

        def checked_resources(value, resources):
            self.assertIs(value, self.inputs)
            self.assertIs(resources, self.resources)
            self.checked.append('resources')
            return resources

        self.forward = SimpleNamespace(ROOT=self.repo, CACHE=self.cache, WORK=self.root / 'work',
                                       PREP=self.root / 'prepare', _checked_runtime_inputs=checked_inputs,
                                       _checked_common_resources=checked_resources)

    def stage(self, **kwargs):
        return R.stage_cache(self.forward, self.inputs, self.resources,
                             node_source=kwargs.get('node', self.sources['node']),
                             postgrest_source=kwargs.get('postgrest', self.sources['postgrest']))

    def test_fixed_layout_pins_modes_readback_and_originals_unchanged(self):
        originals = {name: (path.read_bytes(), path.stat().st_mode) for name, path in self.sources.items()}
        result = self.stage()
        self.assertEqual(result['binaryFiles'], 2)
        self.assertEqual(result['packageFiles'], 2)
        self.assertEqual(result['copiedBytes'], sum(map(len, self.raw.values())) + sum(map(len, self.packages.values())))
        self.assertFalse(result['fullAppAccepted'])
        self.assertFalse(result['executionAuthority'])
        self.assertFalse(result['databaseStarted'])
        self.assertEqual(result['childProcessesStarted'], 0)
        self.assertEqual(self.source_checks, 2)
        self.assertEqual(self.checked, ['inputs', 'resources', 'resources'])
        self.assertGreater(self.samples, 25)
        for path in (self.root, self.cache, self.cache / 'app', self.cache / 'app/scripts', self.cache / 'app/scripts/fixtures'):
            self.assertEqual(path.stat().st_mode & 0o777, 0o700)
        expected = {'node', 'postgrest', 'app/package.json', 'app/package-lock.json'}
        self.assertEqual({str(path.relative_to(self.cache)) for path in self.cache.rglob('*') if path.is_file()}, expected)
        for name, raw in self.raw.items():
            target = self.cache / name
            self.assertEqual(target.read_bytes(), raw)
            self.assertEqual(target.stat().st_mode & 0o777, 0o700)
            self.assertEqual(target.stat().st_uid, os.geteuid())
            self.assertNotEqual(target.stat().st_ino, self.sources[name].stat().st_ino)
        for name, raw in self.packages.items():
            self.assertEqual((self.cache / 'app' / name).read_bytes(), raw)
            self.assertEqual((self.cache / 'app' / name).stat().st_mode & 0o777, 0o600)
        self.assertEqual(originals, {name: (path.read_bytes(), path.stat().st_mode) for name, path in self.sources.items()})
        self.assertNotIn(str(self.root), str(result))

    def test_inputs_and_common_parent_are_mandatory_before_writes(self):
        for inputs, resources in ((None, self.resources), (self.inputs, None)):
            with self.subTest(inputs_missing=inputs is None), self.assertRaises(R.RuntimeCacheError):
                R.stage_cache(self.forward, inputs, resources,
                              node_source=self.sources['node'], postgrest_source=self.sources['postgrest'])
            self.assertFalse(self.root.exists())

    def test_rejected_runtime_binding_and_source_review_stop_before_root(self):
        for step in ('binding', 'source-review', 'resource'):
            with self.subTest(step=step):
                def reject(*args):
                    raise ValueError('FICTIONAL-PRIVATE-FAILURE')
                target = (patch.object(self.forward, '_checked_runtime_inputs', side_effect=reject)
                          if step == 'binding' else patch.object(
                              self.inputs if step == 'source-review' else self.resources,
                              'check_sources' if step == 'source-review' else 'sample', side_effect=reject))
                with target, self.assertRaisesRegex(R.RuntimeCacheError, '^RUNTIME_CACHE_REJECTED$'):
                    self.stage()
                self.assertFalse(self.root.exists())

    def test_inconsistent_context_paths_rejected_before_root(self):
        self.context['hostPaths']['cache'] = str(self.root / 'other-cache')
        with self.assertRaises(R.RuntimeCacheError):
            self.stage()
        self.assertFalse(self.root.exists())

    def test_existing_root_is_never_reused_or_overwritten(self):
        self.root.mkdir(mode=0o700)
        retained = self.root / 'EXISTING'
        retained.write_bytes(b'RETAINED')
        with self.assertRaises(R.RuntimeCacheError):
            self.stage()
        self.assertEqual(retained.read_bytes(), b'RETAINED')
        self.assertFalse(self.cache.exists())

    def test_binary_size_mismatch_rejected_before_root(self):
        self.sources['node'].write_bytes(b'WRONG-SIZE')
        with self.assertRaises(R.RuntimeCacheError):
            self.stage()
        self.assertFalse(self.root.exists())

    def test_wrong_binary_hash_retains_exclusive_private_partial(self):
        self.sources['node'].write_bytes(b'X' * len(self.raw['node']))
        with self.assertRaisesRegex(R.RuntimeCacheError, '^RUNTIME_CACHE_REJECTED$'):
            self.stage()
        partial = self.cache / 'node'
        self.assertEqual(partial.read_bytes(), b'X' * len(self.raw['node']))
        self.assertEqual(partial.stat().st_mode & 0o777, 0o700)
        self.assertFalse((self.cache / 'postgrest').exists())

    def test_source_links_writable_sources_and_ancestor_links_rejected_before_root(self):
        for kind in ('symlink', 'hardlink', 'ancestor', 'writable'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory(dir=self.base) as folder:
                folder = Path(folder)
                alias = folder / 'alias'
                if kind == 'symlink':
                    alias.symlink_to(self.sources['node'])
                elif kind == 'hardlink':
                    os.link(self.sources['node'], alias)
                elif kind == 'ancestor':
                    alias.symlink_to(self.binaries, target_is_directory=True)
                    alias = alias / 'node'
                else:
                    self.sources['node'].chmod(0o777)
                    alias = self.sources['node']
                try:
                    with self.assertRaises(R.RuntimeCacheError):
                        self.stage(node=alias)
                    self.assertFalse(self.root.exists())
                finally:
                    self.sources['node'].chmod(0o755)

    def test_small_package_bound_rejected_before_root(self):
        with patch.object(R, 'MAX_PACKAGE_BYTES', 4), self.assertRaises(R.RuntimeCacheError):
            self.stage()
        self.assertFalse(self.root.exists())

    def test_budget_guard_failure_preserves_partial_without_success(self):
        def fail():
            if (self.cache / 'node').exists():
                raise ValueError('FICTIONAL-BUDGET-FAILURE')
        self.resource_hook = fail
        with self.assertRaisesRegex(R.RuntimeCacheError, '^RUNTIME_CACHE_REJECTED$'):
            self.stage()
        self.assertTrue((self.cache / 'node').exists())
        self.assertEqual((self.cache / 'node').stat().st_mode & 0o777, 0o700)

    def test_source_mutation_during_guarded_copy_rejected(self):
        changed = False
        def mutate():
            nonlocal changed
            if (self.cache / 'node').exists() and not changed:
                changed = True
                self.sources['node'].write_bytes(b'X' * len(self.raw['node']))
        self.resource_hook = mutate
        with self.assertRaises(R.RuntimeCacheError):
            self.stage()
        self.assertTrue(changed)
        self.assertTrue((self.cache / 'node').exists())

    def test_postcopy_source_review_failure_retains_all_copies(self):
        def fail_later():
            if self.source_checks == 2:
                raise ValueError('FICTIONAL-SOURCE-REVIEW-DRIFT')
        self.source_hook = fail_later
        with self.assertRaises(R.RuntimeCacheError):
            self.stage()
        self.assertEqual((self.cache / 'postgrest').read_bytes(), self.raw['postgrest'])
        self.assertTrue((self.cache / 'app/package-lock.json').exists())

    def test_postcopy_changed_context_rejected(self):
        def change_context():
            if self.source_checks == 2:
                self.context['runtimePins']['node']['version'] = 'FICTIONAL-DRIFT'
        self.source_hook = change_context
        with self.assertRaises(R.RuntimeCacheError):
            self.stage()
        self.assertTrue((self.cache / 'node').exists())

    def test_review_pins_reject_package_swap_between_source_check_and_open(self):
        changed = False
        def swap_before_open():
            nonlocal changed
            if not changed:
                # The source is changed BEFORE _source captures its stable
                # inode snapshot. Snapshot/readback checks alone would accept
                # these wrong but stable bytes; only the reviewed pin blocks.
                changed = True
                (self.repo / 'package.json').write_bytes(b'X' * len(self.packages['package.json']))
            elif (self.cache / 'app/package-lock.json').exists():
                (self.repo / 'package.json').write_bytes(self.packages['package.json'])
        self.resource_hook = swap_before_open
        with self.assertRaisesRegex(R.RuntimeCacheError, '^RUNTIME_CACHE_REJECTED$'):
            self.stage()
        self.assertTrue(changed)
        self.assertEqual(self.source_checks, 1)
        self.assertEqual((self.cache / 'app/package.json').read_bytes(), b'X' * len(self.packages['package.json']))
        self.assertFalse((self.cache / 'app/package-lock.json').exists())


if __name__ == '__main__':
    unittest.main()
