#!/usr/bin/env python3
"""Pure relocation regression: execute selected real AST nodes, never a meter.

No module import may initialize authority, fixtures, sockets or containers.
The selected consumer functions run only against synthetic values/stubs.
This is not native execution, visibility, source acceptance or admission.
"""
import ast
import hashlib
from pathlib import Path
from types import SimpleNamespace
import unittest

BIN = Path(__file__).resolve().parent
FILES = ('kernel-meter.py', 'isolation.py', 'process-runner.py',
         'docker-broker.py', 'local-postgrest-owner.py')
SOURCES = {name: (BIN / name).read_bytes() for name in FILES}
TREES = {name: ast.parse(raw, filename=name) for name, raw in SOURCES.items()}
OLD_ROOT = '/workspace/helmut-cpu-epoch-20261015'


def assignment(tree, name):
    nodes = [node for node in tree.body if isinstance(node, ast.Assign)
             and any(isinstance(t, ast.Name) and t.id == name for t in node.targets)]
    if len(nodes) != 1:
        raise AssertionError('one real assignment required: ' + name)
    return nodes[0]


def function(tree, name):
    nodes = [node for node in tree.body
             if isinstance(node, ast.FunctionDef) and node.name == name]
    if len(nodes) != 1:
        raise AssertionError('one real consumer required: ' + name)
    return nodes[0]


def execute(nodes, values):
    code = compile(ast.Module(body=nodes, type_ignores=[]), '<selected-real-source>', 'exec')
    exec(code, values)
    return values


def globals_for(root, source, names):
    values = {'Path': Path, '__file__': str(root / 'scripts/helmut-resource-meter' / source)}
    return execute([assignment(TREES[source], n) for n in names], values)


class CurrentRepositoryRoot(unittest.TestCase):
    def test_all_four_consumers_follow_two_distinct_checkouts(self):
        for text in ('/tmp/SYNTHETIC_REPO_ONE', '/tmp/SYNTHETIC_REPO_TWO'):
            root = Path(text)
            for source, name in [('kernel-meter.py', 'REPOSITORY'), ('process-runner.py', 'REPO'),
                                 ('local-postgrest-owner.py', 'ROOT')]:
                self.assertEqual(globals_for(root, source, [name])[name], root)
            value = globals_for(root, 'docker-broker.py', ['OWNER_SUPERVISOR'])['OWNER_SUPERVISOR']
            self.assertEqual(value, str(root / 'scripts/helmut-resource-meter/database-supervisor.py'))

    def test_paths_are_canonical_even_when_invoked_through_dot_components(self):
        root = Path('/tmp/SYNTHETIC_REPO_ONE/unused/..')
        for source, name in [('kernel-meter.py', 'REPOSITORY'), ('process-runner.py', 'REPO'),
                             ('local-postgrest-owner.py', 'ROOT')]:
            self.assertEqual(globals_for(root, source, [name])[name], root.resolve())

    def test_actual_readonly_mount_uses_the_selected_repository(self):
        root = Path('/tmp/SYNTHETIC_REPO_ONE')
        values = globals_for(root, 'kernel-meter.py', ['REPOSITORY', 'NODE_ROOT', 'PYTHON_ROOT'])
        execute([function(TREES['kernel-meter.py'], 'common_mounts')], values)
        mounts = values['common_mounts']('/tmp/SYNTHETIC_OUTPUT')
        self.assertIn('type=bind,src=' + str(root) + ',dst=' + str(root) + ',readonly', mounts)
        self.assertFalse(any(OLD_ROOT in entry for entry in mounts))
        self.assertIn('type=bind,src=/tmp/SYNTHETIC_OUTPUT,dst=/meter-output', mounts)

    def test_isolation_helpers_follow_the_same_kernel_repository(self):
        root = Path('/tmp/SYNTHETIC_REPO_ONE')
        values = {'K': SimpleNamespace(REPOSITORY=root)}
        execute([assignment(TREES['isolation.py'], 'BIN')], values)
        self.assertEqual(values['BIN'], root / 'scripts/helmut-resource-meter')

    def test_actual_runner_snapshot_arguments_use_current_http_and_database_modules(self):
        root = Path('/tmp/SYNTHETIC_REPO_ONE')
        values = globals_for(root, 'process-runner.py', ['REPO', 'NODE'])
        # Select the real paired statements without executing runner main().
        nodes = [node for node in ast.walk(TREES['process-runner.py'])
                 if isinstance(node, ast.If) and isinstance(node.test, ast.Call)
                 and ast.unparse(node.test) == "recipe.get('databaseContainer')"]
        self.assertEqual(len(nodes), 1)
        calls = []
        def simulated_run(argv, **kwargs):
            calls.append((argv, kwargs))
            return SimpleNamespace(stdout='SYNTHETIC_SQL_NOT_EXECUTED')
        values.update(recipe={'databaseContainer': True, 'scope': 'owner-approved-local500-resources'},
                      subprocess=SimpleNamespace(run=simulated_run))
        execute([nodes[0]], values)
        self.assertEqual(len(calls), 1)
        argv, options = calls[0]
        self.assertIn('--require=' + str(root / 'scripts/helmut-resource-meter/http-meter.js'), argv)
        self.assertEqual(argv[-1], str(root / 'scripts/helmut-resource-meter/database-meter.js'))
        self.assertEqual(values['sql'], 'SYNTHETIC_SQL_NOT_EXECUTED')
        self.assertTrue(options['check'])
        self.assertFalse(any(OLD_ROOT in entry for entry in argv))

    def test_actual_broker_owner_command_uses_current_supervisor_and_keeps_guard(self):
        root = Path('/tmp/SYNTHETIC_REPO_ONE')
        values = globals_for(root, 'docker-broker.py', ['OWNER_START', 'OWNER_PYTHON', 'OWNER_SUPERVISOR'])
        execute([function(TREES['docker-broker.py'], n)
                 for n in ('owner_enabled', 'allowed', 'docker_arguments')], values)
        cfg = {'containerId': 'SYNTHETIC_ID', 'containerName': 'SYNTHETIC_NAME',
               'localPostgrestBackendPlanPin': {'SYNTHETIC_ONLY': True}}
        argv = values['docker_arguments']([values['OWNER_START']], cfg)
        self.assertEqual(argv, ['exec', '-i', 'SYNTHETIC_ID', values['OWNER_PYTHON'],
                               str(root / 'scripts/helmut-resource-meter/database-supervisor.py'),
                               '--submit-local-postgrest-request'])
        with self.assertRaises(RuntimeError):
            values['docker_arguments']([values['OWNER_START']], {**cfg, 'localPostgrestBackendPlanPin': None})

    def test_actual_owner_source_role_list_uses_only_selected_current_root(self):
        root = Path('/tmp/SYNTHETIC_REPO_ONE')
        values = globals_for(root, 'local-postgrest-owner.py', ['ROOT', 'SOURCE_ROLES'])
        consumer = function(TREES['local-postgrest-owner.py'], 'read_backend_plan')
        execute([assignment(consumer, 'expected')], values)
        expected = [str(root / 'scripts/helmut-resource-meter' / name) for name in values['SOURCE_ROLES']]
        expected.append(str(root / 'scripts/helmut-resource-meter/local-postgrest-services.js'))
        self.assertEqual(values['expected'], expected)
        self.assertFalse(any(OLD_ROOT in entry for entry in values['expected']))

    def test_sources_remain_unchanged_during_the_pure_checks(self):
        for name, raw in SOURCES.items():
            self.assertEqual(hashlib.sha256((BIN / name).read_bytes()).digest(), hashlib.sha256(raw).digest())


if __name__ == '__main__':
    unittest.main()
