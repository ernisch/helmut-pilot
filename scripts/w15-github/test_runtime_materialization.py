"""New fictional checks for parent-local materialization; no Docker or database."""
import sys
sys.dont_write_bytecode = True

import ast
import copy
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).absolute().parent


def load(name):
    spec = importlib.util.spec_from_file_location('materialization_test_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R = load('runtime_materialization')


class MaterializationChecks(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix='w15-fictional-materialize-')
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name)
        self.prep = self.base / 'prepare'
        self.prep.mkdir(mode=0o700)
        self.root = self.prep / 'runtime-files'
        self.state = self.base / 'state'
        self.state.mkdir(mode=0o700)
        self.app = self.prep / 'app'
        self.app.mkdir(mode=0o755)
        self.script = self.app / 'entry.js'
        self.script.write_bytes(b'FICTIONAL-APP')
        self.script.chmod(0o644)
        self.sources = {}
        for name in ('node', 'postgrest', 'roles', 'dump', 'command', 'command_binding', 'bound'):
            path = self.base / name
            path.write_bytes(('FICTIONAL-' + name).encode())
            path.chmod(0o755 if name in ('node', 'postgrest') else 0o600)
            self.sources[name] = path
        self.samples = 0

    def guard(self):
        self.samples += 1

    def run_copy(self, guard=None):
        return R.materialize(self.root, app=self.app, state=self.state,
                             guard=guard or self.guard, **self.sources)

    def test_distinct_verified_copies_readonly_mounts_and_private_state(self):
        modes = {name: path.stat().st_mode for name, path in self.sources.items()}
        mounts = self.run_copy()
        self.assertEqual(len(mounts), 10)
        self.assertEqual(mounts[::2], ('--mount',) * 5)
        for name, mount in zip(R.NAMES, mounts[1::2]):
            self.assertEqual(mount, 'type=bind,src=' + str(self.root / name)
                             + ',dst=' + R.BASE + '/' + name + ',readonly')
        for key, dest in (('node', self.root / 'node'), ('roles', self.root / 'roles.PRIVATE.sql'),
                          ('command', self.state / 'current-command.PRIVATE.json')):
            source = self.sources[key]
            self.assertEqual(dest.read_bytes(), source.read_bytes())
            self.assertNotEqual(dest.stat().st_ino, source.stat().st_ino)
            self.assertEqual(dest.stat().st_mode & 0o777, 0o700 if key == 'node' else 0o600)
        self.assertEqual((self.root / 'app/entry.js').read_bytes(), self.script.read_bytes())
        self.assertEqual((self.root / 'app/entry.js').stat().st_mode & 0o777, 0o600)
        self.assertEqual(modes, {name: path.stat().st_mode for name, path in self.sources.items()})
        self.assertGreater(self.samples, 16)

    def test_new_assets_and_state_fit_existing_backup_walk(self):
        self.run_copy()
        backup = load('runtime_backup')
        assets = backup._tree(self.prep, private=False)
        state = backup._tree(self.state, private=True)
        self.assertIn('runtime-files/node', {row['path'] for row in assets})
        self.assertEqual(len(state), 3)

    def mount_rows(self):
        return [{'Type': 'bind', 'Source': str(self.root / name),
                 'Destination': R.BASE + '/' + name, 'RW': False} for name in R.NAMES]

    def test_actual_mount_readback_accepts_only_exact_readonly_assets(self):
        rows = self.mount_rows()
        rows.append({'Type': 'bind', 'Source': str(self.state), 'Destination': R.BASE + '/state', 'RW': True})
        self.assertIsNone(R.verify_mounts(rows, self.root))

    def test_actual_mount_readback_rejects_wrong_source_writable_missing_or_shadowed_assets(self):
        for change in ('source', 'type', 'writable', 'unknown-rw', 'missing', 'duplicate', 'child', 'parent'):
            with self.subTest(change=change):
                rows = copy.deepcopy(self.mount_rows())
                if change == 'source':
                    rows[0]['Source'] = '/tmp/FICTIONAL-OTHER'
                elif change == 'type':
                    rows[0]['Type'] = 'volume'
                elif change == 'writable':
                    rows[0]['RW'] = True
                elif change == 'unknown-rw':
                    rows[0].pop('RW')
                elif change == 'missing':
                    rows.pop()
                elif change == 'duplicate':
                    rows.append(dict(rows[0]))
                else:
                    rows.append({'Type': 'bind', 'Source': '/tmp/FICTIONAL-OTHER', 'RW': True,
                                 'Destination': R.BASE + ('/app/lib' if change == 'child' else '')})
                with self.assertRaisesRegex(R.RuntimeMaterializationError, '^RUNTIME_MOUNT_READBACK_REJECTED$'):
                    R.verify_mounts(rows, self.root)

    def test_links_and_writable_sources_rejected(self):
        for kind in ('file-symlink', 'parent-symlink', 'hardlink', 'writable', 'app-symlink'):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory(dir=self.base) as folder:
                self.root = Path(folder) / 'runtime-files'
                original = dict(self.sources)
                try:
                    if kind == 'file-symlink':
                        alias = Path(folder) / 'alias'
                        alias.symlink_to(self.sources['node'])
                        self.sources['node'] = alias
                    elif kind == 'parent-symlink':
                        alias = Path(folder) / 'linked'
                        alias.symlink_to(self.base, target_is_directory=True)
                        self.sources['node'] = alias / 'node'
                    elif kind == 'hardlink':
                        alias = Path(folder) / 'alias'
                        os.link(self.sources['node'], alias)
                    elif kind == 'writable':
                        self.sources['node'].chmod(0o777)
                    else:
                        (self.app / 'linked').symlink_to(self.script)
                    with self.assertRaisesRegex(R.RuntimeMaterializationError, '^RUNTIME_MATERIALIZATION_REJECTED$'):
                        self.run_copy()
                finally:
                    self.sources = original
                    self.sources['node'].chmod(0o755)

    def test_existing_destination_never_overwritten(self):
        target = self.state / 'current-command.PRIVATE.json'
        target.write_bytes(b'EXISTING')
        target.chmod(0o600)
        with self.assertRaises(R.RuntimeMaterializationError):
            self.run_copy()
        self.assertEqual(target.read_bytes(), b'EXISTING')
        self.assertTrue(self.root.is_dir())
        with self.assertRaises(R.RuntimeMaterializationError):
            self.run_copy()

    def test_mutating_source_stops_with_private_partial_retained(self):
        changed = False
        def mutate():
            nonlocal changed
            if (self.root / 'node').exists() and not changed:
                changed = True
                with self.sources['node'].open('ab') as out:
                    out.write(b'CHANGED')
        with self.assertRaises(R.RuntimeMaterializationError):
            self.run_copy(mutate)
        self.assertTrue(changed)
        self.assertTrue((self.root / 'node').exists())
        self.assertEqual((self.root / 'node').stat().st_mode & 0o777, 0o700)

    def test_parent_guard_failure_is_fixed_and_retains_partial(self):
        def stop():
            if (self.root / 'node').exists():
                raise ValueError('FICTIONAL-PRIVATE-ERROR')
        with self.assertRaisesRegex(R.RuntimeMaterializationError, '^RUNTIME_MATERIALIZATION_REJECTED$'):
            self.run_copy(stop)
        self.assertTrue((self.root / 'node').exists())

    def test_mount_source_delimiters_rejected_before_copy(self):
        self.root = self.prep / 'unsafe,source'
        with self.assertRaises(R.RuntimeMaterializationError):
            self.run_copy()
        self.assertFalse(self.root.exists())

    def test_total_and_file_count_limits(self):
        for limit in ('MAX_BYTES', 'MAX_FILES'):
            with self.subTest(limit=limit), patch.object(R, limit, 0):
                with self.assertRaises(R.RuntimeMaterializationError):
                    self.run_copy()
            self.assertTrue(self.root.exists())
            # A new independent fictional destination, no failed-path retry.
            self.root = self.prep / ('next-' + limit)

    def test_real_forward_uses_materialization_only_for_runtime_and_cp_only_for_legacy(self):
        tree = ast.parse((HERE.parent / 'synthetik-500-w15-memory-forward.py').read_text())
        parents = {child: node for node in ast.walk(tree) for child in ast.iter_child_nodes(node)}
        def guards(node):
            child = node
            while child in parents:
                parent = parents[child]
                if isinstance(parent, ast.If) and child in parent.body:
                    yield ast.unparse(parent.test)
                child = parent
        copies, materializers = [], []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr == 'copy_in':
                    copies.append(node)
                    self.assertIn('inputs is None', list(guards(node)))
                if node.func.attr == 'materialize':
                    materializers.append(node)
                    self.assertIn('inputs is not None', list(guards(node)))
                    self.assertEqual(ast.unparse(node.args[0]), "PREP / 'runtime-files'")
        self.assertTrue(copies)
        self.assertEqual(len(materializers), 1)
        creates = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                   and isinstance(node.func, ast.Attribute) and node.func.attr == 'docker'
                   and node.args and isinstance(node.args[0], ast.Constant) and node.args[0].value == 'create']
        self.assertEqual(len(creates), 1)
        self.assertTrue(any(isinstance(arg, ast.Starred) and isinstance(arg.value, ast.Name)
                            and arg.value.id == 'runtime_mounts' for arg in creates[0].args))
        imports = [node for node in ast.walk(ast.parse((HERE / 'runtime_materialization.py').read_text()))
                   if isinstance(node, (ast.Import, ast.ImportFrom))]
        self.assertFalse(any('subprocess' in ast.unparse(node) for node in imports))


if __name__ == '__main__':
    unittest.main()
