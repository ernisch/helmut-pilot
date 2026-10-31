"""Actual public prepared import and closed first-error seams; no originals/DB."""
import sys
sys.dont_write_bytecode = True

from contextlib import ExitStack, redirect_stdout
import ast
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).absolute().parent
REPO = HERE.parents[1]
SPEC = importlib.util.spec_from_file_location('w15_prepared_initialization', REPO / 'scripts/synthetik-500-w15-memory-forward.py')
F = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(F)


class PreparedInitializationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='w15-fictional-prepared-init-')
        self.addCleanup(self.temp.cleanup); self.root = Path(self.temp.name)
        self.cache = self.root / 'cache'; (self.cache / 'app/scripts/fixtures').mkdir(parents=True)
        for name in ('package.json', 'package-lock.json'):
            shutil.copyfile(REPO / name, self.cache / 'app' / name)
        for name in ('node', 'postgrest'): (self.cache / name).write_bytes(b'FICTIONAL NOT EXECUTABLE\n')
        self.prep = self.root / 'prepare'; self.work = self.root / 'work'
        original_digest = F.digest_file
        def digest(path):
            if Path(path) == self.cache / 'node': return 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'
            if Path(path) == self.cache / 'postgrest': return '870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'
            return original_digest(path)
        self.stack = ExitStack(); self.addCleanup(self.stack.close)
        for name, value in {'CACHE': self.cache, 'PREP': self.prep, 'WORK': self.work,
            '_checked_runtime_inputs': lambda value: value, '_checked_common_resources': lambda *args: None,
            'check_seed': lambda *args: None, 'available_disk': lambda: F.PLANNED_TOTAL + 1,
            'digest_file': digest}.items():
            self.stack.enter_context(patch.object(F, name, value))
        inputs = SimpleNamespace(report=lambda name: {'status': 'PASS_PREPARATION_PLAN_ONLY_IMPLEMENTATION_AND_START_GATES_PENDING'})
        with redirect_stdout(io.StringIO()): F.prepare(inputs)

    def node(self, script, *args):
        value = subprocess.run(['node', '-e', script, *map(str, args)], capture_output=True,
            timeout=15, env={**os.environ, 'HELMUT_SOURCE_MODE': 'off', 'HELMUT_STORAGE_BACKEND': 'local'})
        return value, [json.loads(line) for line in value.stdout.decode().splitlines() if line.startswith('{')]

    def test_actual_minimal_prepared_server_and_forward_import(self):
        app = self.prep / 'app'
        script = r'''const M=require('node:module'),resolve=M._resolveFilename,seen=new Set();
M._resolveFilename=function(...args){const file=resolve.apply(this,args);if(file.startsWith(process.argv[1]+'/'))seen.add(file.slice(process.argv[1].length+1));return file;};
const server=require(process.argv[1]+'/server');const forward=require(process.argv[1]+'/scripts/synthetik-500-w15-memory-forward');
if(typeof server!=='function'||typeof forward.firstFailureReporter!=='function')throw Error('fixture-import');
console.log(JSON.stringify({status:'IMPORTED_PUBLIC_CODE_ONLY',scripts:[...seen].filter(p=>p.startsWith('scripts/')).sort(),configs:[...seen].filter(p=>p.endsWith('.json')&&!p.includes('/')).sort()}));'''
        result, rows = self.node(script, app)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(rows[0]['status'], 'IMPORTED_PUBLIC_CODE_ONLY')
        self.assertIn('scripts/bb-nachweis-importpaket-generator.js', rows[0]['scripts'])
        self.assertIn('scripts/fixtures/w15-native-failure.js', rows[0]['scripts'])
        self.assertEqual(rows[0]['configs'], ['vercel.json'])
        self.assertFalse((app / 'helmut-flags.json').exists())
        self.assertFalse((app / 'scripts/github-fachzyklus-a.js').exists())

    def test_pre_try_initialization_failure_has_safe_topcatch_frame(self):
        app = self.prep / 'app'; source = app / 'scripts/synthetik-500-w15-memory-forward.js'
        text = source.read_text(); original = 'const BASE = "/tmp/w15-memory-atomic-20261028d"'
        replacement = 'const BASE = ' + json.dumps(str(self.root / 'FICTIONAL_MISSING_STATE'))
        self.assertEqual(text.count(original), 1)
        source.write_text(text.replace(original, replacement))
        result = subprocess.run(['node', '--require', str(app / 'scripts/lokaler-netzschutz.js'), str(source), 'run'], capture_output=True, timeout=15,
            env={**os.environ, 'HELMUT_SOURCE_MODE': 'off', 'HELMUT_STORAGE_BACKEND': 'local'})
        rows = [json.loads(line) for line in result.stdout.decode().splitlines() if line.startswith('{')]
        self.assertEqual(result.returncode, 1); self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['name'], 'memory-forward-first-failure')
        self.assertEqual(rows[0]['failure']['stage'], 'auth-fixture')
        self.assertEqual(rows[0]['failure']['acknowledgedCAS'], 'UNKNOWN')
        self.assertEqual(rows[0]['failure']['writeOutcome'], 'UNKNOWN')
        self.assertNotIn('FICTIONAL_MISSING_STATE', result.stdout.decode())

    def test_first_failure_reporter_never_replaces_primary_with_cleanup(self):
        script = r'''const F=require(process.argv[1]),frames=[];
const report=F.firstFailureReporter(v=>frames.push(v));
const first=Error('DO_NOT_EXPORT');first.code='MODULE_NOT_FOUND';
const a=report(first,{stage:'server-import',acknowledgedCAS:0});
const b=report(Error('DO_NOT_EXPORT_CLEANUP'),{stage:'journal-close',acknowledgedCAS:500});
console.log(JSON.stringify({same:a===b,frames}));'''
        result, rows = self.node(script, self.prep / 'app/scripts/synthetik-500-w15-memory-forward.js')
        self.assertEqual(result.returncode, 0); self.assertTrue(rows[0]['same'])
        self.assertEqual(len(rows[0]['frames']), 1)
        failure = rows[0]['frames'][0]['failure']
        self.assertEqual(failure['kind'], 'module-load-error'); self.assertEqual(failure['stage'], 'server-import')
        self.assertEqual(failure['acknowledgedCAS'], 0)
        self.assertEqual(failure['acknowledgedCASKind'], 'CONFIRMED_LOWER_BOUND')
        self.assertNotIn('DO_NOT_EXPORT', result.stdout.decode())

    def test_watch_persists_only_first_valid_frame_without_interrupting_finally(self):
        script = r'''const H=require(process.argv[1]);const e=Error('private');e.code='MODULE_NOT_FOUND';
console.log(JSON.stringify(H.project(e,{stage:'server-import',acknowledgedCAS:0})));'''
        result, rows = self.node(script, self.prep / 'app/scripts/fixtures/w15-native-failure.js')
        self.assertEqual(result.returncode, 0); failure = rows[0]
        observed = []; stopped = []
        watch = SimpleNamespace(native_failure=None,
            common_resources=SimpleNamespace(native_failure_observer=observed.append),
            first_failure=lambda error: stopped.append(error), cas_records=[])
        raw = json.dumps({'name': 'memory-forward-first-failure', 'failure': failure}).encode()
        with patch.object(F.M, 'save') as saved:
            F.Watch.observe_line(watch, raw, 'run')
            F.Watch.observe_line(watch, raw, 'run')
            malformed = json.dumps({'name': 'memory-forward-first-failure', 'failure': {**failure, 'private': 'DO_NOT_EXPORT'}}).encode()
            F.Watch.observe_line(watch, malformed, 'run')
            self.assertEqual(observed, [failure]); self.assertEqual(watch.native_failure, failure)
            self.assertEqual(saved.call_count, 1); self.assertEqual(stopped, [])

    def test_actual_final_systemexit_keeps_first_native_failure(self):
        source = ast.parse((REPO / 'scripts/synthetik-500-w15-memory-forward.py').read_text())
        main = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'main')
        final = main.body[-1]
        self.assertIsInstance(final, ast.If)
        failure = {'schema': 'FICTIONAL_NATIVE_ERROR_BINDING'}
        scope = {'failure': True, 'zero': False, 'w': SimpleNamespace(native_failure=failure)}
        with self.assertRaises(SystemExit) as caught:
            exec(compile(ast.fix_missing_locations(ast.Module(body=[final], type_ignores=[])), 'actual-final-native-error-transfer', 'exec'), scope)
        self.assertEqual(caught.exception.code, 1)
        self.assertIs(caught.exception.native_failure, failure)

    def test_internal_telemetry_error_is_synchronously_emitted_before_sigterm_and_cleanup(self):
        script = r'''const fs=require('node:fs'),F=require(process.argv[1]),A=require(process.argv[2]);
const source=fs.readFileSync(process.argv[1],'utf8');
const begin=source.indexOf('const telemetryFailure=error=>');const end=source.indexOf('\n  gcObserver=',begin);
if(begin<0||end<begin)throw Error('fixture-source');
const report={},emit=F.firstFailureReporter(F.writeNativeFailureFrame);
const project=error=>emit(error,{stage:'auth-mutate',acknowledgedCAS:0});
const lifetime={stop(){},isTerminating(){return false;}};
const telemetry=Function('lifetime','report','AuthReport','emitNativeFailure','process',
  'let abortScheduled=false;'+source.slice(begin,end)+';return telemetryFailure;')(lifetime,report,A,project,process);
process.once('SIGTERM',()=>fs.writeSync(1,JSON.stringify({name:'synthetic-signal-observed'})+'\n'));
A.retainOnTermination(()=>({nativeFailure:report.nativeFailure}),async value=>{
  const later=Error('DO_NOT_EXPORT_CLEANUP');later.code='ECONNRESET';
  const preserved=emit(later,{stage:'journal-close',acknowledgedCAS:500});
  fs.writeSync(1,JSON.stringify({name:'synthetic-cleanup-completed',same:preserved===value.nativeFailure,
    originalErrorCode:report.error.code,firstStage:preserved.stage,firstKind:preserved.kind})+'\n');
});
const error=Error('DO_NOT_EXPORT_DURABLE');error.code='W15_DURABLE_SYNC_FAILED';
setTimeout(()=>process.exit(88),5000); // Owned fixture deadline; the real run already has its telemetry timer.
setImmediate(()=>telemetry(error));'''
        result, rows = self.node(script, self.prep / 'app/scripts/synthetik-500-w15-memory-forward.js',
                                 self.prep / 'app/scripts/fixtures/w15-auth-measurement-report.js')
        self.assertEqual(result.returncode, 143)
        self.assertEqual([row['name'] for row in rows], ['memory-forward-first-failure', 'synthetic-signal-observed', 'synthetic-cleanup-completed'])
        self.assertEqual(rows[0]['failure']['kind'], 'durable-io-error')
        self.assertEqual(rows[0]['failure']['code'], 'W15_DURABLE_SYNC_FAILED')
        self.assertEqual(rows[0]['failure']['stage'], 'auth-mutate')
        self.assertTrue(rows[2]['same']); self.assertEqual(rows[2]['originalErrorCode'], 'W15_DURABLE_SYNC_FAILED')
        self.assertEqual(rows[2]['firstStage'], 'auth-mutate')
        self.assertEqual(rows[2]['firstKind'], 'durable-io-error')
        self.assertLessEqual(len(result.stdout.splitlines()[0]) + 1, 1024)
        self.assertNotIn('DO_NOT_EXPORT', result.stdout.decode())


if __name__ == '__main__': unittest.main()
