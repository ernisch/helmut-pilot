"""Setup failure registry boundaries; no Docker, process or database execution."""
import copy
from contextlib import redirect_stderr
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import types
import unittest

spec=importlib.util.spec_from_file_location('native_supervisor_offline',Path(__file__).with_name('local-unit-native-supervisor.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class ReadonlyHTTPMode(unittest.TestCase):
    def result(self):
        return {'schema': 'helmut-local-unit-native-readonly-http-result/1', 'diagnosticMode': 'readonly-http-pre-admission-v1',
            'originalControlGraphReads': 2,
            **dict.fromkeys(('readonlyHttpObserved', 'signedReadonlyContractObserved', 'publicationReadObserved'), True),
            **dict.fromkeys(('executionAuthorityInstalled', 'admissionPerformed', 'seedPerformed', 'scopeClaimConsumed',
                'runtimeReadMeasured', 'ownStateReadMeasured', 'unit60Qualified', 'auth30Qualified', 'independentFinalAcceptance', 'production', 'full500'), False),
            **dict.fromkeys(('actualEntryCalls', 'motorCalls', 'providerCalls', 'completedUnits', 'expectedPositions', 'controlCount'), 0),
            'phaseCaptures': {name: {'pin': {'path': '/case/READONLY_HTTP_' + name.upper() + '_PHASES.PRIVATE.log', 'bytes': 5, 'sha256': 'a' * 64},
                'containerId': 'b' * 64, 'processClose': {'exitCode': 0, 'stdoutNaturalEOF': True, 'stderrNaturalEOF': True, 'registeredHostPID': 123}}
                for name in ('endpoint', 'broker')}}

    def test_new_cli_is_explicit_and_mutually_exclusive_with_all_old_modes(self):
        new = '--diagnose-native-readonly-http'
        self.assertTrue(m.arguments([new]).diagnose_native_readonly_http)
        for old in ('--qualify-native-store', '--qualify-native-bindings', '--run-native-single-unit', '--diagnose-native-claim-only'):
            self.assertFalse(m.arguments([old]).diagnose_native_readonly_http)
            with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit): m.arguments([old, new])
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit): m.arguments([])

    def test_readonly_result_requires_no_execution_and_both_closed_private_captures(self):
        m.readonly_http_result(self.result())
        for key in ('diagnosticMode', 'schema', 'readonlyHttpObserved', 'publicationReadObserved', 'executionAuthorityInstalled',
                    'admissionPerformed', 'seedPerformed', 'scopeClaimConsumed', 'runtimeReadMeasured', 'ownStateReadMeasured',
                    'actualEntryCalls', 'motorCalls', 'providerCalls', 'unit60Qualified', 'full500', 'phaseCaptures', 'originalControlGraphReads'):
            result = self.result(); result[key] = not result[key] if type(result[key]) is bool else 'wrong'
            with self.subTest(key=key), self.assertRaises(RuntimeError): m.readonly_http_result(result)
        for fault in ('eof', 'cap', 'raw', 'extra-close'):
            result = self.result(); value = result['phaseCaptures']['endpoint']
            if fault == 'eof': value['processClose']['stderrNaturalEOF'] = False
            if fault == 'cap': value['pin']['bytes'] = 128 * 1024 + 1
            if fault == 'raw': value['stderrBase64'] = 'forbidden'
            if fault == 'extra-close': value['processClose']['stderrBase64'] = 'forbidden'
            with self.subTest(fault=fault), self.assertRaises(RuntimeError): m.readonly_http_result(result)


class TransactionGuardMode(unittest.TestCase):
    def result(self, case='state'):
        return {'schema':'helmut-local-unit-native-transaction-guard-result/1','diagnosticMode':'native-transaction-guard-v1',
            'transactionGuardCase':case, **dict.fromkeys(('transactionGuardObserved','executionAuthorityInstalled','reuseForbidden'),True),
            **dict.fromkeys(('scopeExecutionQualified','unit60Qualified','auth30Qualified','independentFinalAcceptance','production','full500'),False),
            **dict.fromkeys(('actualEntryCalls','motorCalls','providerCalls','completedUnits','expectedPositions','controlCount'),0)}

    def test_one_case_and_own_explicit_mode_are_required(self):
        flag='--diagnose-native-transaction-guard'
        for case in ('state','same-root-usage','late-old-mirror','late-outside'):
            args=m.arguments([flag,'--transaction-guard-case',case])
            self.assertTrue(args.diagnose_native_transaction_guard); self.assertEqual(args.transaction_guard_case,case)
        for args in ([flag],['--transaction-guard-case','state'],[flag,'--transaction-guard-case','other'],
                     ['--diagnose-native-claim-only','--transaction-guard-case','state'],[flag,'--run-native-single-unit']):
            with self.subTest(args=args),redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):m.arguments(args)

    def test_result_cannot_grant_scope_or_unit_or_hide_calls(self):
        m.transaction_guard_result(self.result(),'state')
        for key in self.result():
            value=self.result();value[key]=not value[key] if type(value[key]) is bool else 'wrong'
            with self.subTest(key=key),self.assertRaises(RuntimeError):m.transaction_guard_result(value,'state')

class SetupClosure(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='helmut-supervisor-registry-');self.addCleanup(self.temp.cleanup)
        self.case=Path(self.temp.name);self.cid='a'*64;self.parent='helmut-meter-memorybudget-'+'b'*24
        self.runtime={'imageId':'sha256:'+'c'*64};self.record={'containerId':self.cid}
        self.row={'Id':self.cid,'HostConfig':{'CgroupParent':'/'+self.parent},'Image':self.runtime['imageId'],'State':{'Running':False}}
        self.reader=types.SimpleNamespace(read_file=lambda path,cap:(json.dumps(self.record).encode(),{}),unique=json.loads)
        self.calls=[]
        def docker(args):
            self.calls.append(args);return types.SimpleNamespace(stdout=json.dumps([self.row]))
        self.native=types.SimpleNamespace(docker=docker)
    def run_check(self):return m.registered_setup_children(self.reader,self.native,self.case,self.parent,self.runtime)
    def test_no_created_record_means_no_adopted_child(self):
        self.assertEqual(self.run_check(),set());self.assertEqual(self.calls,[])
    def test_created_child_is_recovered_without_a_returned_plan(self):
        (self.case/'ALIAS_INSTALLER_CREATED.SAFE.json').touch()
        self.assertEqual(self.run_check(),{self.cid});self.assertEqual(self.calls,[['inspect',self.cid]])
    def test_foreign_running_or_changed_child_cannot_be_adopted(self):
        (self.case/'ALIAS_INSTALLER_CREATED.SAFE.json').touch();original=copy.deepcopy(self.row)
        for key in ('parent','running','image','id'):
            self.row=copy.deepcopy(original)
            if key=='parent':self.row['HostConfig']['CgroupParent']='/foreign'
            if key=='running':self.row['State']['Running']=True
            if key=='image':self.row['Image']='sha256:'+'d'*64
            if key=='id':self.row['Id']='d'*64
            with self.subTest(key=key),self.assertRaises(RuntimeError):self.run_check()
    def test_registry_is_not_an_arbitrary_container_selector(self):
        (self.case/'ALIAS_INSTALLER_CREATED.SAFE.json').touch()
        for record in ({'containerId':'short'},{'containerId':self.cid,'extra':True}):
            self.record=record
            with self.assertRaises(RuntimeError):self.run_check()
        self.assertEqual(self.calls,[])

class OwnerRuntimeMounts(unittest.TestCase):
    def setUp(self):
        self.case = Path('/workspace/helmut-unit-diagnostic-native/'+'a'*32)
        self.cid = 'b'*64
        self.rows = [{'source': {'path': '/retained/public-runtime-'+str(i), 'bytes': i+1, 'sha256': str(i)*64},
                      'imagePath': target, 'readonly': True} for i,target in enumerate(m.OWNER_RUNTIME_TARGETS)]
        self.rows.append({'source': {'path': '/retained/postgres', 'bytes': 2, 'sha256': 'f'*64},
                          'imagePath': '/usr/lib/postgresql/17/bin/postgres', 'readonly': True})
        copies = [{'originalSource': copy.deepcopy(row['source']),
                   'copy': {**row['source'], 'path': str(self.case/'owner-public'/('runtime-'+str(i).zfill(3)))},
                   'imagePath': row['imagePath'],
                   'mode': 0o555 if row['imagePath'].endswith('/ld-linux-x86-64.so.2') else 0o444,
                   'installerContainerId': self.cid} for i,row in enumerate(self.rows[:-1])]
        self.plan = {'ownerRuntimeCopies': copies, 'knownSetupContainerIds': [self.cid],
                     'sourceOwnerRuntimeMounts': [(row['copy']['path'],row['imagePath'],True) for row in copies]}

    def test_owner_selection_requires_exact_complete_original_subset(self):
        self.assertEqual(m.owner_runtime_bindings(self.rows), self.rows[:-1])
        for rows in (self.rows[1:], self.rows+self.rows[:1]):
            with self.assertRaises(RuntimeError): m.owner_runtime_bindings(rows)

    def test_source_uses_measured_public_copies_and_preserves_other_original_mounts(self):
        before = copy.deepcopy(self.rows)
        mounts = m.source_runtime_mounts(self.rows,self.plan,self.case)
        self.assertEqual(mounts[:-1], [(Path(p),target,ro) for p,target,ro in self.plan['sourceOwnerRuntimeMounts']])
        self.assertEqual(mounts[-1], (Path('/retained/postgres'),self.rows[-1]['imagePath'],True))
        self.assertEqual(self.rows,before)
        self.assertEqual(m.source_runtime_mounts(self.rows,None,self.case),
                         [(Path(row['source']['path']),row['imagePath'],True) for row in self.rows])

    def test_unknown_incomplete_changed_or_writable_mirrors_are_rejected(self):
        for fault in ('missing','duplicate','origin','bytes','hash','outside','name','mode','installer','mount','extra'):
            plan = copy.deepcopy(self.plan); row = plan['ownerRuntimeCopies'][0]
            if fault=='missing': plan['ownerRuntimeCopies'].pop()
            if fault=='duplicate': plan['ownerRuntimeCopies'][1]=copy.deepcopy(row)
            if fault=='origin': row['originalSource']['path']='/foreign/runtime'
            if fault=='bytes': row['copy']['bytes']+=1
            if fault=='hash': row['copy']['sha256']='e'*64
            if fault=='outside': row['copy']['path']='/outside/runtime-000'
            if fault=='name': row['copy']['path']=str(self.case/'owner-public'/'unqualified')
            if fault=='mode': row['mode']=0o777
            if fault=='installer': row['installerContainerId']='c'*64
            if fault=='mount': plan['sourceOwnerRuntimeMounts'][0]=(row['copy']['path'],row['imagePath'],False)
            if fault=='extra': row['extra']=True
            with self.subTest(fault=fault),self.assertRaises(RuntimeError): m.source_runtime_mounts(self.rows,plan,self.case)
        rows=copy.deepcopy(self.rows);rows[-1]['readonly']=False
        with self.assertRaises(RuntimeError): m.source_runtime_mounts(rows,None,self.case)

if __name__=='__main__':unittest.main()
