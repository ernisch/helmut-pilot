"""Pure guards for the fixed local Auth diagnostic; no resource or SQL actions."""
import ast
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import types

BASE = Path(__file__).resolve().parent / 'auth-stability30-native-launcher'
EXPECTED = 'fd846c435352b0280c8607995f3d55a690f72094a0bfde17949cdef04c7375ad'
checks = []


def pin(path):
    raw = path.read_bytes()
    return {'path': str(path), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def verify(name, predicate):
    assert predicate, name
    checks.append(name)


def rejects(name, action):
    try:
        action()
    except (RuntimeError, KeyError, OSError, TypeError):
        checks.append(name)
    else:
        raise AssertionError('accepted: ' + name)


raw = (BASE / 'PREPARED.SAFE.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == EXPECTED, 'reviewed freeze drift'
frozen = json.loads(raw)
module = types.ModuleType('common')
module.__file__ = str(BASE / 'common.py')
source = (BASE / 'common.py').read_bytes()
expected = next(p for p in frozen['files'] if p['path'] == module.__file__)
assert len(source) == expected['bytes'] and hashlib.sha256(source).hexdigest() == expected['sha256']
exec(compile(source, module.__file__, 'exec'), module.__dict__)
sys.modules['common'] = module

for mode, variant, count in [('lifecycle-only', 'NONE', 0), ('control-stability', 'NEW', 243)]:
    selected = module.selected_measurement(frozen, mode, variant)
    verify('accept:' + mode, selected['authRPCCount'] == count and selected['bodyVariant'] == 'NEW')
for mode, variant in [('full500', 'NEW'), ('control-cache', 'NEW'), ('control-stability', 'OLD'),
                      ('control-stability', None), ('lifecycle-only', 'NEW'), ('lifecycle-only', 'OLD')]:
    rejects('reject-mode:' + str((mode, variant)),
            lambda m=mode, v=variant: module.selected_measurement(frozen, m, v))
for key, value in module.STABILITY_CONTRACT.items():
    for label, changed in [('changed', value + 1), ('float', float(value)), ('bool', True)]:
        fixture = copy.deepcopy(frozen)
        fixture['stabilityContract'][key] = changed
        rejects('contract:' + key + ':' + label,
                lambda f=fixture: module.selected_measurement(f, 'control-stability', 'NEW'))
for label, change in [
    ('extra-key', lambda c: c.update(extra=1)),
    ('missing-key', lambda c: c.pop('rounds')),
]:
    fixture = copy.deepcopy(frozen)
    change(fixture['stabilityContract'])
    rejects('contract:' + label, lambda f=fixture: module.selected_measurement(f, 'control-stability', 'NEW'))
for field, changed in [('comparisonScope', 'COMBINED_AUTH_BASELINE_CORRECTIONS_ONLY'),
                       ('lifecycleBodyVariant', 'OLD')]:
    fixture = copy.deepcopy(frozen)
    fixture[field] = changed
    rejects('selection:' + field, lambda f=fixture: module.selected_measurement(f, 'control-stability', 'NEW'))

events = dict(high=0, max=0, oom=0, oom_kill=0)
verify('events:required-zero', module.memory_events_clear(events))
verify('events:optional-zero', module.memory_events_clear({**events, 'oom_group_kill': 0}))
for key in [*events, 'oom_group_kill']:
    for value in [1, -1, False, '0', 0.0]:
        verify('events:reject-' + key + ':' + repr(value),
               not module.memory_events_clear({**events, key: value}))
for key in events:
    fixture = events.copy()
    del fixture[key]
    verify('events:missing-' + key, not module.memory_events_clear(fixture))

# Exercise the real accounting function at the atomic-rename observation point:
# walk observed a temporary name; stat now sees only the published counterpart.
real_walk = module.os.walk
with tempfile.TemporaryDirectory(prefix='helmut-stability-guards-') as tmp:
    root = Path(tmp)

    def renamed(name, size=1, kind='file', nested=False):
        parent = root / 'sub' if nested else root
        parent.mkdir(exist_ok=True)
        published = parent / name.removesuffix('.tmp')
        if kind == 'file':
            published.write_bytes(b'x' * size)
        elif kind == 'directory':
            published.mkdir()
        elif kind == 'symlink':
            published.symlink_to(root / 'absent-target')
        module.os.walk = lambda *a, **kw: iter([(str(parent), [], [name])])
        try:
            return module.output_bytes(root)
        finally:
            module.os.walk = real_walk
            if published.is_symlink() or published.is_file():
                published.unlink()
            elif published.is_dir():
                published.rmdir()

    for sequence in [1, 9, 10, 59, 60]:
        for edge in ['MARKER', 'ACK']:
            name = f'CYCLE_{sequence}.{edge}.SAFE.json.tmp'
            verify('rename:accept-' + name, renamed(name) == 512)
    for sequence in ['0', '00', '01', '61', '-1', 'x']:
        rejects('rename:reject-' + sequence,
                lambda s=sequence: renamed(f'CYCLE_{s}.ACK.SAFE.json.tmp'))
    name = 'CYCLE_60.ACK.SAFE.json.tmp'
    rejects('rename:oversize', lambda: renamed(name, size=513))
    rejects('rename:empty', lambda: renamed(name, size=0))
    rejects('rename:directory', lambda: renamed(name, kind='directory'))
    rejects('rename:symlink', lambda: renamed(name, kind='symlink'))
    rejects('rename:missing-counterpart', lambda: renamed(name, kind='absent'))
    rejects('rename:nested', lambda: renamed(name, nested=True))
    rejects('rename:extra-suffix', lambda: renamed('CYCLE_60.ACK.SAFE.json.extra.tmp'))

# Check only the capture policy prefix from the actual worker AST. This does
# not execute capture, create a child, import the worker or claim EOF coverage.
tree = ast.parse((BASE / 'worker.py').read_bytes())
capture = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'capture')
policy = copy.deepcopy(capture)
policy.name = 'capture_policy'
policy.body = policy.body[:2] + [ast.Return(value=ast.Name(id='limit', ctx=ast.Load()))]
policy_tree = ast.fix_missing_locations(ast.Module(body=[policy], type_ignores=[]))
namespace = {'C': module}
exec(compile(policy_tree, 'actual-worker-capture-policy-prefix', 'exec'), namespace)
capture_policy = namespace['capture_policy']
verify('capture:SQL-default', capture_policy([], 'SQL') == 262144)
verify('capture:SQL-shorter', capture_policy([], 'SQL', timeout=0.5) == 262144)
verify('capture:Node-fixed', capture_policy([], 'NODE_CONTROL', timeout=180, capture_limit=1048576) == 1048576)
for label, seconds, limit in [('SQL', 31, None), ('SQL', 30, 1048576), ('SQL', 0, None),
                               ('NODE_CONTROL', 30, None), ('NODE_CONTROL', 181, 1048576),
                               ('NODE_CONTROL', 180, 1048577), ('OTHER', 180, 1048576)]:
    rejects('capture:reject-' + repr((label, seconds, limit)),
            lambda l=label, s=seconds, n=limit: capture_policy([], l, timeout=s, capture_limit=n))

python_sources = sorted(BASE.glob('*.py'))
for path in python_sources:
    ast.parse(path.read_bytes(), filename=str(path))
node = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'
syntax = subprocess.run([node, '--check', str(BASE / 'control-driver.js')], capture_output=True, timeout=20)
assert syntax.returncode == 0, syntax.stderr.decode(errors='replace')
print(json.dumps({'pass': True, 'guardChecks': len(checks), 'checks': checks,
                  'pythonASTs': len(python_sources), 'changedNodeSyntaxFiles': 1,
                  'preparedPin': pin(BASE / 'PREPARED.SAFE.json'),
                  'testSourcePin': pin(Path(__file__).resolve()),
                  'captureTestScope': 'Actual policy prefix only; no child or EOF test',
                  'nativeActions': 0, 'sqlActions': 0, 'modelCalls': 0, 'full500': False}))
