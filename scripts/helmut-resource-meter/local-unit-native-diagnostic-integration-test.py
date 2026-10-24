#!/usr/bin/env python3
"""Connect the real failure consumers with synthetic children and private fixtures.

No native worker, engine, database, container, provider, original, or grant starts.
The Node VM replaces only the diagnostic workload; its real CLI catch is retained.
"""
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import types
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SOURCE_TEST = load('local-unit-native-execution-source-test')
CONTROLLER_TEST = load('local-unit-native-execution-controller-test')
HOST_TEST = load('local-unit-native-execution-host-test')
WORKER_TEST = load('local-unit-native-worker-final-capture-test')

# All dependencies capable of I/O inside the VM are disabled. The only real
# subprocess is this short synthetic Node program; source capture owns its pipes.
GUARD_PROGRAM = r'''
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const file=process.argv[1],kind=process.argv[2],source=fs.readFileSync(file,'utf8');
const marker='if(require.main===module)start()',at=source.indexOf(marker);
if(at<0)throw Error('fixture-cli-marker');
const mod={exports:{}},deny=new Proxy({}, {get(){throw Error('fixture-IO-forbidden')}});
const req=name=>['node:fs','node:child_process'].includes(name)?deny:require(name);
req.main=mod;
const sandbox={require:req,module:mod,__dirname:path.dirname(file),Buffer,process,kind};
const workload=`
start=async()=>{
  process.stdout.write(JSON.stringify({syntheticWriteAttempts:1})+'\\n');
  if(kind==='local')need(false,'psql-outcome-not-confirmed');
  const foreign={};
  for(const name of ['message','code','stack'])Object.defineProperty(foreign,name,
    {get(){throw Error('private-sentinel-must-not-be-inspected')}});
  throw foreign;
};
`;
vm.runInNewContext(source.slice(0,at)+workload+source.slice(at),sandbox,{filename:file});
'''


class IntegratedFailureTests(unittest.TestCase):
    def failure_path(self, kind, *, incomplete=False):
        host_fixture = HOST_TEST.PureHost('runTest')
        host_fixture.setUp()
        self.addCleanup(host_fixture.doCleanups)
        host_module, host = HOST_TEST.M, host_fixture.host
        source = SOURCE_TEST.m
        worker = SOURCE_TEST.Worker(host_fixture.case)
        worker.CHILDREN = []
        worker.LIBRARY_PATH = '/synthetic-unused'
        fixture = CONTROLLER_TEST.Fixture()
        selection = fixture.c.selection
        host.selection = selection
        script = HERE / 'local-unit-native-transaction-guard.js'
        config = {'repository': str(HERE), 'database': 'helmut_unit_diagnostic_' + 'a' * 32,
                  'nodePin': {'path': shutil.which('node')}, 'sourceObserverPin': {},
                  'sourceCodePins': [worker.pin(script)]}
        worker.load = lambda *args: types.SimpleNamespace(process_identity=lambda pid: {
            'parentPID': os.getpid(), 'exe': config['nodePin']['path'],
            'membership': '0::/\n', 'pidNamespace': 'pid:[synthetic]'})
        # Host's fixture has disabled Popen; keep the actual callable separately.
        real_popen = REAL_POPEN
        spawned, events, captured = [], [], {}

        def spawn(argv, **options):
            self.assertEqual(argv[1:3], ['--max-old-space-size=384', '--max-semi-space-size=16'])
            child = real_popen([config['nodePin']['path'], '-e', GUARD_PROGRAM, str(script), kind], **options)
            spawned.append(child)
            return child

        def publish(current_worker, name, value):
            # Stable temporary private fixture, never an original or acceptance.
            current_worker.save(name, value)
            events.append('first-failure-published')

        def observe():
            self.assertEqual(events[0], 'first-failure-published')
            host_module.need(False, 'source-service-host-mapping')

        host._observe = observe
        # Emulate the publication race: no frame at tick entry, present at mapping.
        original_source_close = host._source_failure_close
        checks = []

        def source_close():
            checks.append(True)
            return False if len(checks) == 1 else original_source_close()

        host._source_failure_close = source_close
        host_read = host_module.read_file
        fixture.c.source.capture_failure = lambda unused, *args: source.capture_failure(worker, *args)
        fixture.c.transaction_guard = True

        def probe(*args):
            child = source.NodeChild(worker, config, script.name, '--synthetic-only', 'TRANSACTION_GUARD',
                                     failure_context=(selection, 7))
            captured['child'] = child
            try:
                return child.finish(seconds=3)
            finally:
                events.append('probe-closed')

        fixture.c.transaction_guard_finish = probe
        actual_finish = None

        def finish(**kwargs):
            nonlocal actual_finish
            self.assertTrue((worker.OUT / 'EXECUTION_FAILURE.PRIVATE.json').exists())
            events.append('service-cleanup')
            actual_finish = host.tick()

        original_owner = fixture.c.start_owner

        def owner(*args):
            original_owner(*args)
            fixture.c.service.finish = finish

        fixture.c.start_owner = owner
        try:
            with (mock.patch.object(source.subprocess, 'Popen', side_effect=spawn),
                  mock.patch.object(source, '_publish_private', side_effect=publish),
                  mock.patch.object(source, 'private_json', side_effect=lambda w, p, **kw:
                      (json.loads(Path(p).read_bytes()), w.pin(p))),
                  mock.patch.object(host_module, 'read_file', side_effect=lambda p, *a, **kw:
                      host_read(p, *a, **{**kw, 'uid': os.getuid()}))):
                with self.assertRaises(fixture.m.ExecutionError) as failure:
                    fixture.run(wrapper=True)
        finally:
            for child in spawned:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=3)
                for stream in (child.stdout, child.stderr):
                    if not stream.closed:
                        stream.close()

        self.assertIn('child', captured, repr(failure.exception.native_first_failure))
        child = captured['child']
        self.assertEqual(len(spawned), 1)
        self.assertEqual(json.loads(bytes(child.outputs[0])), {'syntheticWriteAttempts': 1})
        frame = json.loads(bytes(child.outputs[1]))
        self.assertEqual(frame, {'schema': 'helmut-native-transaction-guard-failure/1',
                                'code': 'psql-outcome-not-confirmed' if kind == 'local' else 'unclassified',
                                'retryAllowed': False})
        self.assertEqual((child.child.returncode, child.eof), (1, [True, True]))
        self.assertTrue(child.failed and child.closed)
        first = json.loads((worker.OUT / 'EXECUTION_FAILURE.PRIVATE.json').read_bytes())
        self.assertIn('node-actual-exit-eof', first['privateTraceback'])
        self.assertEqual(first['selection'], selection)
        self.assertLess(events.index('first-failure-published'), events.index('probe-closed'))
        self.assertLess(events.index('probe-closed'), events.index('service-cleanup'))
        self.assertEqual(actual_finish['state'], 'SOURCE_FAILED')
        closed = host.close()
        self.assertFalse(closed['clean'] or closed['sourceStopRequested'])
        self.assertNotIn('private-sentinel', json.dumps(closed))
        self.assertFalse((worker.OUT / 'EXECUTION_HOST_FAILURE.PRIVATE.json').exists())
        self.assertFalse(fixture.saved['EXECUTION_SERVICE_FAILURE_CLOSE.PRIVATE.json']['retryAllowed'])

        final = WORKER_TEST.FinalCaptureTests('runTest')
        state, reads, _, _ = final.run_final(primary=str(failure.exception),
            path='source-1' if incomplete else None, interrupt_at='raw', report=True)
        state['json'] = json
        saved = []
        state['save'] = lambda name, value: saved.append((name, value))
        state['capture_first_failure'](failure.exception)
        self.assertIn('node-actual-exit-eof', saved[0][1]['message'])
        self.assertFalse(state['accepted'])
        self.assertEqual(state['failure'], 'native-single-unit-execution-not-confirmed-no-retry')
        self.assertEqual(state['checked_count'], 1 if incomplete else 3)
        self.assertEqual(reads, ['raw', 'source-0', 'source-1'] if incomplete
                         else ['raw', 'source-0', 'source-1', 'source-2'])
        self.assertEqual(state['FINALIZATION_SIGNALS'], {'15': 2})
        self.assertEqual(state['sources_preserved'], not incomplete)

    def test_classified_guard_failure_closes_all_consumers_without_retry(self):
        self.failure_path('local')

    def test_foreign_guard_error_is_private_and_incomplete_readback_remains_fail(self):
        self.failure_path('foreign', incomplete=True)


REAL_POPEN = subprocess.Popen
if __name__ == '__main__':
    unittest.main()
