"""Fictional proc/cgroup files only; no actual process, Docker or kernel work."""
import sys
sys.dont_write_bytecode = True

import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('end500_capacity_roles_tested', Path(__file__).with_name('end500_capacity_roles.py'))
R = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(R)
CONTAINER = 'a' * 64


class RoleBindingChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-fictional-capacity-roles-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.parent = self.root / ('w15_12345_' + 'b' * 32 + '.slice'); self.parent.mkdir()
        self.group = self.parent / ('docker-' + CONTAINER + '.scope'); self.group.mkdir()
        self.proc = self.root / 'proc'; self.proc.mkdir()
        (self.parent / 'cgroup.procs').write_text('901\n')
        (self.group / 'cgroup.procs').write_text('101\n102\n103\n')
        self.write_process(901, namespace=[901], group='/' + self.parent.name)
        self.write_process(101, namespace=[101, 1])
        self.write_process(102, namespace=[102, 22])
        self.write_process(103, namespace=[103, 33])
        self.identity = (self.parent.stat().st_dev, self.parent.stat().st_ino)
        kernel = patch.object(R.M.R, '_kernel_directory', side_effect=lambda path: os.open(path, os.O_RDONLY | os.O_DIRECTORY))
        proc = patch.object(R.M, 'PROC_ROOT', self.proc)
        kernel.start(); proc.start(); self.addCleanup(kernel.stop); self.addCleanup(proc.stop)

    def write_process(self, pid, namespace=None, group=None, start=None):
        folder = self.proc / str(pid); folder.mkdir(exist_ok=True)
        # The misleading comm is deliberately ignored; only the fixed stat
        # field, exact cgroup and status Pid/NSpid values establish identity.
        fields = ['S', *(['0'] * 18), str(start or pid * 100), '0']
        (folder / 'stat').write_text(str(pid) + ' (NOT_A_CLASSIFICATION_SOURCE) ' + ' '.join(fields))
        (folder / 'cgroup').write_text('0::' + (group or '/' + self.parent.name + '/' + self.group.name) + '\n')
        ids = namespace if namespace is not None else [pid, 99]
        (folder / 'status').write_text('Name:\tDO_NOT_EXPORT\nPid:\t' + str(pid) + '\nNSpid:\t' + '\t'.join(map(str, ids)) + '\n')

    def call(self, **kwargs):
        args = {'parent_path': self.parent, 'identity': self.identity, 'postgres_host_pid': 101,
                'container_id': CONTAINER, 'namespace_pids': {'helmut-node': 22, 'postgrest': 33}}
        args.update(kwargs); return R.bindings(**args)

    def test_exact_owned_container_namespace_matches_only_and_no_names(self):
        self.assertEqual(self.call(), [{'pid': 101, 'startTicks': 10100, 'role': 'postgresql'},
            {'pid': 102, 'startTicks': 10200, 'role': 'helmut-node'}, {'pid': 103, 'startTicks': 10300, 'role': 'postgrest'}])
        self.assertEqual(self.call(namespace_pids={}), [{'pid': 101, 'startTicks': 10100, 'role': 'postgresql'}])

    def test_unattested_parent_pg_container_or_invalid_values_yield_no_claim(self):
        for key, value in [('identity', (0, 0)), ('postgres_host_pid', 999), ('postgres_host_pid', True),
                           ('container_id', 'b' * 64), ('container_id', CONTAINER + 'extra'),
                           ('namespace_pids', {'helmut-node': 1}), ('namespace_pids', {'private-text': 22})]:
            with self.subTest(key=key): self.assertEqual(self.call(**{key: value}), [])
        self.write_process(101, namespace=[101, 2])
        self.assertEqual(self.call(), [])

    def test_namespace_depth_other_container_and_duplicate_matches_are_unknown(self):
        self.write_process(102, namespace=[102, 2, 22])
        self.assertEqual([r['role'] for r in self.call()], ['postgresql', 'postgrest'])
        self.write_process(102, namespace=[102, 22], group='/' + self.parent.name + '/docker-' + 'b' * 64 + '.scope')
        self.assertEqual([r['role'] for r in self.call()], ['postgresql', 'postgrest'])
        self.write_process(102, namespace=[102, 33])
        self.assertEqual([r['role'] for r in self.call()], ['postgresql'])
        self.write_process(102, namespace=[102, 22])
        self.assertEqual([r['role'] for r in self.call(namespace_pids={'helmut-node': 22, 'postgrest': 22})], ['postgresql'])

    def test_proc_denial_and_invalid_status_preserve_only_attested_pg(self):
        (self.proc / '102' / 'status').unlink()
        self.assertEqual([r['role'] for r in self.call()], ['postgresql'])
        self.write_process(102, namespace=[999, 22])
        self.assertEqual([r['role'] for r in self.call()], ['postgresql'])

    def test_pid_reuse_movement_or_inventory_change_cannot_produce_stale_binding(self):
        original = R._record
        counts = {}
        def changed(pid, parent):
            counts[pid] = counts.get(pid, 0) + 1
            value = original(pid, parent)
            if pid == 102 and counts[pid] > 1: return value[0] + 1, value[1], value[2]
            return value
        with patch.object(R, '_record', side_effect=changed):
            self.assertEqual([r['role'] for r in self.call()], ['postgresql'])
        with patch.object(R.M, '_inventory', side_effect=[{101, 102, 103}, {101, 102}]):
            self.assertEqual(self.call(), [])
        def pg_changed(pid, parent):
            value = original(pid, parent)
            if pid == 101: return value[0], value[1], (101, 2)
            return value
        with patch.object(R, '_record', side_effect=pg_changed): self.assertEqual(self.call(), [])

    def test_existing_inventory_bound_is_enforced_without_large_scan_or_new_process(self):
        with patch.object(R.M, '_inventory', return_value=set(range(2, 131)) | {101}):
            self.assertEqual(self.call(), [])
        self.assertLessEqual(len(self.call()), 3)


if __name__ == '__main__': unittest.main()
