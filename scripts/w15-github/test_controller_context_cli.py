"""Only the new stdin CLI boundary; no existing controller checks repeated."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import socket
import subprocess
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('w15_cli_fixtures',Path(__file__).with_name('test_controller_context.py'))
T=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(T)
C=T.C


class ContextCLIChecks(unittest.TestCase):
    def setUp(self):
        self.fixture=T.ContextChecks()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)

    def invoke(self,raw,argv=None):
        output=io.StringIO()
        with patch.object(C,'REPO',self.fixture.repo), \
                patch.object(C.sys,'stdin',io.TextIOWrapper(io.BytesIO(raw),encoding='utf-8')), \
                patch.object(C,'apply_context',side_effect=AssertionError('no host binding')), \
                patch.object(subprocess,'Popen',side_effect=AssertionError('no process')), \
                patch.object(socket,'socket',side_effect=AssertionError('no network')), \
                contextlib.redirect_stdout(output):
            status=C.main(['--validate-context-only']if argv is None else argv)
        return status,json.loads(output.getvalue())

    def test_success_checks_supplied_declarations_and_still_blocks_start(self):
        raw=json.dumps(self.fixture.context).encode()
        status,result=self.invoke(raw+b' '*(1024*1024-len(raw)))
        self.assertEqual(status,0)
        self.assertEqual(result['status'],'BINDING_ONLY_START_BLOCKED')
        self.assertEqual(set(result['blockedGates'].values()),{'BLOCKED'})
        for key in ('hostBindingsApplied','executionAuthority','testStarted',
                    'mock500Acceptance','inputManifestObserved','runtimeImageObserved'):
            self.assertIs(result[key],False)
        self.assertFalse(Path(self.fixture.context['hostPaths']['runRoot']).exists())
        self.assertNotIn(str(self.fixture.base),json.dumps(result))

    def test_invalid_duplicate_oversized_and_unavailable_stdin_are_fixed_public_failures(self):
        for raw in (b'',b'{"/private/do-not-echo":"secret"',
                    b'{"schema":1,"schema":2}',b' '* (1024*1024+1)):
            with self.subTest(size=len(raw)):
                with patch.object(C,'validate_context',side_effect=AssertionError('must reject before validation')):
                    status,result=self.invoke(raw)
                self.assertEqual(status,1)
                self.assertEqual(result['reason'],'CONTEXT_INVALID_OR_UNAVAILABLE')
                self.assertNotIn('/private',json.dumps(result))
                self.assertIs(result['executionAuthority'],False)
        with patch.object(C.sys,'stdin',io.StringIO('not a binary stdin')), \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(C.main(['--validate-context-only']),1)
        self.assertEqual(json.loads(output.getvalue())['reason'],'CONTEXT_INVALID_OR_UNAVAILABLE')

    def test_unsupported_run_missing_and_abbreviated_arguments_do_not_reach_validation(self):
        for argv in ([],['--run','/private/do-not-echo'],['--validate-context']):
            with self.subTest(argv=argv):
                with patch.object(C,'validate_context',side_effect=AssertionError('must reject arguments')):
                    status,result=self.invoke(b'{}',argv)
                self.assertEqual(status,1)
                self.assertEqual(result['reason'],'CONTEXT_INVALID_OR_UNAVAILABLE')
                self.assertNotIn('/private',json.dumps(result))

    def test_cli_uses_existing_current_commit_rejection(self):
        self.fixture.context['exactCommit']='d'*40
        status,result=self.invoke(json.dumps(self.fixture.context).encode())
        self.assertEqual(status,1)
        self.assertEqual(result['status'],'FAIL_CONTEXT_CHECK_START_BLOCKED')
        self.assertIs(result['hostBindingsApplied'],False)


if __name__=='__main__':unittest.main()
