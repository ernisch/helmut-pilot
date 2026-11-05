"""Small fictional admission, failure and process-barrier counterexamples only."""
import sys
sys.dont_write_bytecode = True
import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location('resource_diagnostic_under_test',Path(__file__).with_name('synthetic_resource_diagnostic.py'))
D=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(D)
HEAD='a'*40
NONCE='12345678-1234-4123-8123-123456789abc'


def environment(preflight=False):
    return {'GITHUB_ACTIONS':'true','GITHUB_SHA':HEAD,'EXPECTED_COMMIT':HEAD,'GITHUB_RUN_ATTEMPT':'1',
        'GITHUB_RUN_ID':'123456789','GITHUB_EVENT_NAME':'pull_request' if preflight else 'workflow_dispatch',
        'GITHUB_REF':'refs/pull/1004/merge' if preflight else D.REF,
        'GITHUB_HEAD_REF':D.REF.removeprefix('refs/heads/')}


def request(preflight=False):
    return {'schema':D.SCHEMA,'scope':D.SMALL_SCOPE if preflight else D.SCOPE,'expectedCommit':HEAD,
        'nonce':NONCE,'profiles':D.SMALL_COUNT if preflight else 100,'attempt':1,'maxSeconds':D.WALL}


def kernel(hard=D.APP_HARD):
    return {'memory':{'currentBytes':10000,'kernelLifetimePeakBytes':20000,'maximumBytes':hard,
        'swapCurrentBytes':0,'swapMaximumBytes':0},'memoryEvents':dict.fromkeys(('max','oom','oom_kill','oom_group_kill'),0),
        'cpuMaximum':{'quotaUsec':100000,'periodUsec':100000},'cpuStat':dict.fromkeys(D.C.CPU_FIELDS,1000),
        'memoryStat':dict.fromkeys(D.C.M.STAT_FIELDS,1000),'memoryPressure':'UNKNOWN','cpuPressure':'UNKNOWN',
        'effectiveCpuset':'0-1'}


def state(root):
    ctx=D.P.context('123456789',HEAD,NONCE);ctx['capacityDiagnostic']=True
    return {'context':ctx,'stateRoot':str(root),'parentIdentity':[0,0],'startedMonotonicNS':time.monotonic_ns(),
        'request':request(),'preflightOnly':False}


def app_result(count=100):
    return {'schema':D.WORKLOAD_SCHEMA,'nonce':NONCE,'status':'PASS_MOCK100_RUNTIME' if count==100 else 'PASS_MOCK100_PREFLIGHT',
        'firstFailurePhase':None,'firstFailureDetail':None,'cleanupFailureDetail':None,'requestedProfiles':count,
        'provisionedProfiles':count,'positiveProfileResults':count,'activeCohortReadbacks':count+2,'understoodCases':3 if count==3 else 96,
        'finalActiveProfiles':0,'simulatedProviderOnly':True,'originalDataUsed':False,'formal1500Acceptance':False,
        'end500Acceptance':False,'mock500Acceptance':False,'productionProof':False,'professionalAcceptance':False,'executionAuthority':False,'retryAllowed':False,
        'outputPositions':count*3,'outputKinds':{'mandatsbriefing':count,'lage':count,'morgenlageReceipt':count},
        'modelPhases':{'understanding':3 if count==3 else 96,'entwurf':count,'pruefung':count},
        'nativeAuditSHA256':'a'*64,'acknowledgedResultsSHA256':'b'*64,'tenantGuardChecks':count*4,
        'confirmedCountsOnly':True,'outputErrors':dict.fromkeys(('missing','empty','duplicate','technicallyInvalid','unusable'),0),
        'nativeObserved':{'positions':3*count,'usage':(3 if count==3 else 96)+2*count,'understanding':3 if count==3 else 96,'entwurf':count,'pruefung':count}}


def progress(count=100):
    return {'schema':D.WORKLOAD_SCHEMA,'nonce':NONCE,'requestedProfiles':count,'sequence':20,
        'phase':'work','operation':'match','provisionedProfiles':count,'activatedProfiles':count,
        'activeCohortReadbacks':4,'sourceDocumentsSaved':12 if count==3 else 384,
        'understoodCases':3 if count==3 else 96,'matchingProfiles':1,'decisionProfiles':1,
        'positiveProfileResults':1,'deactivatedProfiles':0,'finalActiveProfiles':'UNKNOWN'}


class DiagnosticChecks(unittest.TestCase):
    def test_actual_node_progress_survives_sigkill_and_crosses_supervisor_without_app_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);s=D.Supervisor(state(root));s.progress_target=(root,3)
            source="""
const D=require('./scripts/synthetik-500-resource-diagnostic');
const p=D.appProgress({resultRoot:process.argv[1],count:3,nonce:process.argv[2]});
for(let i=0;i<3;i++){p.confirmed('provisionedProfiles');p.confirmed('activatedProfiles');}
for(let i=0;i<12;i++)p.confirmed('sourceDocumentsSaved');
for(let i=0;i<3;i++)p.confirmed('understoodCases');
p.confirmed('matchingProfiles');p.confirmed('decisionProfiles');
p.before('work','briefing-build');process.kill(process.pid,'SIGKILL');
"""
            child=subprocess.run(['node','-e',source,str(root),NONCE],cwd=D.REPO,
                env=os.environ.copy(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
            self.assertEqual(child.returncode,-signal.SIGKILL)
            self.assertFalse((root/'APP_RESULT.SAFE.json').exists())
            with patch.object(s,'create_groups',side_effect=D.Rejected('mock100','COMMON_PARENT_REJECTED')),patch.object(s,'close'):
                report=s.run()
            frame=report['workloadProgress'][0]['lastConfirmedWorkloadProgress']
            self.assertEqual(frame['requestedProfiles'],3);self.assertEqual(frame['operation'],'briefing-build')
            self.assertEqual(frame['understoodCases'],3);self.assertEqual(frame['decisionProfiles'],1)
            self.assertEqual(frame['positiveProfileResults'],0);self.assertEqual(frame['finalActiveProfiles'],'UNKNOWN')
            self.assertEqual(report['workloadResults'],[]);self.assertFalse(report['full100Completed'])

    def test_partial_progress_is_bound_closed_and_never_a_completion_receipt(self):
        value=progress();self.assertEqual(D.workload_progress(value,NONCE,100),value)
        for key,bad in [('nonce','foreign'),('requestedProfiles',3),('phase','PRIVATE'),('operation','PRIVATE'),
            ('sequence',True),('sequence',10001),('understoodCases',97),('matchingProfiles',False),
            ('positiveProfileResults',2),('finalActiveProfiles',False)]:
            with self.subTest(key=key),self.assertRaises(Exception):
                D.workload_progress({**value,key:bad},NONCE,100)
        with self.assertRaises(Exception):D.workload_progress({**value,'message':'PRIVATE_SENTINEL'},NONCE,100)
        with self.assertRaises(Exception):D.workload_result(value,NONCE,100)

    def test_partial_progress_survives_missing_worker_result_without_masking_first_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);s=D.Supervisor(state(root));s.progress_target=(root,100)
            D.private_json(root/'APP_PROGRESS.SAFE.json',progress())
            def cleanup():
                # A later cleanup frame must not replace the pre-cleanup work observation.
                path=root/'APP_PROGRESS.SAFE.json';path.unlink()
                D.private_json(path,{**progress(),'sequence':21,'phase':'deactivate','operation':'profile-deactivation'})
            with patch.object(s,'create_groups',side_effect=D.Rejected('mock100','COMMON_PARENT_REJECTED')), \
                    patch.object(s,'close',side_effect=cleanup):
                report=s.run()
            self.assertEqual(report['firstFailure'],{'phase':'mock100','code':'COMMON_PARENT_REJECTED'})
            self.assertEqual(report['workloadProgress'][0]['lastConfirmedWorkloadProgress'],progress())
            self.assertEqual(report['workloadProgressUnknownCounts'],[])
            self.assertEqual(report['workloadResults'],[]);self.assertFalse(report['full100Completed'])

    def test_invalid_or_regressing_progress_is_unknown_and_keeps_last_valid_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);s=D.Supervisor(state(root));s.progress_target=(root,100)
            s.collect_workload_progress();self.assertEqual(s.progress_unknown,{100})
            file=root/'APP_PROGRESS.SAFE.json';D.private_json(file,progress());s.collect_workload_progress()
            self.assertEqual(s.progress_unknown,set())
            for bad in [{**progress(),'sequence':19},{**progress(),'matchingProfiles':0},
                        {**progress(),'nonce':'foreign'},{**progress(),'message':'PRIVATE_SENTINEL'}]:
                file.unlink();D.private_json(file,bad);s.collect_workload_progress()
                self.assertEqual(s.progress_unknown,{100})
                self.assertEqual(s.workload_progress[100]['lastConfirmedWorkloadProgress'],progress())

    def test_first_memory_failure_snapshot_is_not_overwritten_by_cleanup_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=D.Supervisor(state(tmp));s.cleaning=True
            first=RuntimeError('FIRST');first.failure_memory={'observedMonotonicNS':100}
            cleanup=RuntimeError('CLEANUP');cleanup.failure_memory={'observedMonotonicNS':200}
            fd=os.open(tmp,os.O_RDONLY|os.O_DIRECTORY)
            try:
                with patch.object(D.P,'read_parent',side_effect=[first,cleanup]), \
                    patch.object(D.P.R,'closed_failure_memory',side_effect=lambda value:value), \
                    patch.object(s,'_parent_fd',side_effect=lambda:os.dup(fd)), \
                    patch.object(D.C,'_kernel',return_value=kernel(D.HOST_HARD)):
                    with self.assertRaises(RuntimeError):s.guard()
                    s.phase='closure'
                    with self.assertRaises(RuntimeError):s.guard()
                self.assertEqual(s.common_failure_memory,first.failure_memory)
                self.assertIn('closure',s.phase_metrics)
            finally:os.close(fd)

    def test_progress_metadata_does_not_swallow_stop_and_unknown_first_memory_stays_unknown(self):
        with tempfile.TemporaryDirectory() as tmp:
            s=D.Supervisor(state(tmp));s.progress_target=(Path(tmp),100)
            with patch.object(D,'read_private',side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):s.collect_workload_progress()
            self.assertEqual(s.progress_unknown,set())
            with patch.object(s,'create_groups',side_effect=D.Rejected('mock100','COMMON_PARENT_REJECTED')), \
                    patch.object(s,'collect_workload_progress',side_effect=KeyboardInterrupt),patch.object(s,'close'):
                report=s.run()
            self.assertEqual(report['firstFailure'],{'phase':'mock100','code':'COMMON_PARENT_REJECTED'})
            s.cleaning=True;first=RuntimeError('FIRST_UNKNOWN')
            later=RuntimeError('LATER');later.failure_memory={'observedMonotonicNS':200}
            fd=os.open(tmp,os.O_RDONLY|os.O_DIRECTORY)
            try:
                with patch.object(D.P,'read_parent',side_effect=[first,later]), \
                    patch.object(D.P.R,'closed_failure_memory',side_effect=lambda value:value), \
                    patch.object(s,'_parent_fd',side_effect=lambda:os.dup(fd)), \
                    patch.object(D.C,'_kernel',return_value=kernel(D.HOST_HARD)):
                    with self.assertRaises(RuntimeError):s.guard()
                    self.assertTrue(s.common_failure_memory_seen)
                    with self.assertRaises(RuntimeError):s.guard()
                self.assertIsNone(s.common_failure_memory)
            finally:os.close(fd)

    @unittest.skipUnless(os.geteuid() == 0, 'ownership counterexample needs the isolated root test user')
    def test_root_verifies_runner_owned_public_checkout_without_global_git_trust(self):
        with tempfile.TemporaryDirectory(prefix='public-diagnostic-git-owner-') as tmp:
            repo=Path(tmp)/'repo';repo.mkdir()
            def git(*argv):
                return subprocess.check_output(['/usr/bin/git','-c','safe.directory='+str(repo),
                    '-C',str(repo),*argv],env=D.ENV,stderr=subprocess.DEVNULL).decode().strip()
            git('init','--quiet');(repo/'public.txt').write_text('public synthetic source\n')
            git('add','public.txt')
            git('-c','user.name=Synthetic fixture','-c','user.email=fixture@example.invalid',
                'commit','--quiet','-m','public fixture')
            head=git('rev-parse','HEAD')
            for root,dirs,files in os.walk(repo):
                os.chown(root,1000,1000)
                for name in files:os.chown(Path(root)/name,1000,1000)
            # Verify the counterexample actually triggers Git's default protection.
            rejected=subprocess.run(['/usr/bin/git','-C',str(repo),'rev-parse','HEAD'],
                env=D.ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            self.assertNotEqual(rejected.returncode,0)
            with patch.object(D,'REPO',repo):D.blob_bound('public.txt',head)

    def test_manual100_is_exact_real_ref_head_attempt_and_scope(self):
        self.assertTrue(D.validate_request(request(),HEAD,environment())['capacityDiagnostic'])
        for key,bad in [('GITHUB_REF','refs/heads/main'),('GITHUB_EVENT_NAME','pull_request'),
                        ('GITHUB_RUN_ATTEMPT','2'),('GITHUB_SHA','b'*40),('GITHUB_ACTIONS','false')]:
            with self.subTest(key=key),self.assertRaises(Exception):
                D.validate_request(request(),HEAD,{**environment(),key:bad})
        for key,bad in [('profiles',99),('attempt',True),('maxSeconds',1801),('scope',D.SMALL_SCOPE)]:
            with self.subTest(key=key),self.assertRaises(Exception):
                D.validate_request({**request(),key:bad},HEAD,environment())

    def test_pr_three_profiles_cannot_admit_any_full100_or_wrong_head_ref(self):
        self.assertEqual(D.request_for_preflight(HEAD)['profiles'],3)
        D.validate_request(request(True),HEAD,environment(True),preflight=True)
        for value,env in [(request(),environment(True)),
            (request(True),{**environment(True),'GITHUB_HEAD_REF':''}),
            (request(True),{**environment(True),'GITHUB_REF':'refs/pull/1/head'})]:
            with self.assertRaises(Exception):D.validate_request(value,HEAD,env,preflight=True)
        with self.assertRaises(Exception):D.validate_request(request(),HEAD,environment(True))

    def test_closed_json_private_file_and_local_jwt_claims(self):
        for raw in ('{"a":1,"a":2}','{"a":NaN}'):
            with self.assertRaises(Exception):D.decode(raw)
        with tempfile.TemporaryDirectory() as temp:
            file=Path(temp)/'a.json';D.private_json(file,{'local':True})
            self.assertEqual(D.read_private(file),{'local':True});self.assertEqual(file.stat().st_mode&511,384)
            link=Path(temp)/'link';link.symlink_to(file)
            with self.assertRaises(Exception):D.read_private(link)
        token=D.jwt_token('fictional-secret-never-a-provider-credential',1234567890,NONCE)
        claims=json.loads(base64.urlsafe_b64decode(token.split('.')[1]+'==='))
        self.assertEqual(claims['resourceDiagnosticNonce'],NONCE);self.assertEqual(claims['role'],'service_role')
        self.assertNotIn('fictional-secret',token)

    def test_nested_component_identity_preserves_parent_restriction_and_rejects_links(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);s=D.Supervisor(state(root));s.parent=root
            child=root/'application.slice';child.mkdir();leaf=child/'bound_node';leaf.mkdir()
            fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY)
            try:
                with patch.object(s,'_parent_fd',side_effect=lambda:os.dup(fd)):
                    self.assertEqual(s.component_identity(leaf),(leaf.stat().st_dev,leaf.stat().st_ino))
                    link=root/'linked';link.symlink_to(child,target_is_directory=True)
                    with self.assertRaises(OSError):s.component_identity(link)
                    with self.assertRaises(ValueError):s.component_identity(root.parent)
                    with self.assertRaises(D.Rejected):s.component_identity(root/'..'/'sibling')
            finally:os.close(fd)
        value=D.closed_failure(FileNotFoundError(),'groups')
        self.assertEqual(value,{'phase':'groups','code':'FILESYSTEM_ENTRY_MISSING'})

    def test_unexpected_decoder_failure_keeps_public_location_but_no_raw_value(self):
        try:D.decode(b'FICTIONAL_PRIVATE_INVALID_JSON')
        except Exception as error:record=D.closed_failure(error,'services')
        self.assertEqual(record['exceptionType'],'JSONDecodeError')
        self.assertGreater(record['sourceLine'],0)
        self.assertNotIn('FICTIONAL_PRIVATE',json.dumps(record))

    def test_connection_sql_reaches_psql_through_real_docker_stdin_contract(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));s.container='fictional-owned-container'
            snapshot=dict.fromkeys(D.S.SETTINGS+D.S.COUNTS,0)
            snapshot.update(maxConnections=60,clientBackends=1,observerClients=1,activeClients=1)
            def docker_exec(argv,*,input=None,seconds=30,check=True):
                self.assertIsNotNone(input);self.assertIn(b'begin read only;',input);self.assertIn(b'rollback;',input)
                # Docker exec without -i closes the inner stdin: psql succeeds but returns no row.
                output=D.canonical(snapshot) if '-i' in argv[argv.index('exec')+1:argv.index(s.container)] else b''
                return subprocess.CompletedProcess(argv,0,output)
            with patch.object(s,'command',side_effect=docker_exec):s.connections('fictional')
            self.assertEqual(s.connection_max,1)

    def test_local_ai_counters_survive_work_failure_without_claiming_success(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));root=s.work/'results'/'preflight';root.mkdir(parents=True)
            keys=('aufrufe','erfolgreich','fehler','abgewiesenWegenObergrenze','eingabeBytes','ausgabeBytes',
                  'eingabeTokenGeschaetzt','ausgabeTokenGeschaetzt','bytesJeGeschaetztemToken','gleichzeitigSpitze')
            counters=dict.fromkeys(keys,1);counters['dauerMs']=dict.fromkeys(('n','min','p50','p95','max','mittel'),2)
            D.private_json(root/'SERVICES_CLOSED.SAFE.json',{'schema':D.WORKLOAD_SCHEMA,'nonce':NONCE,
                'closed':True,'failed':False,'executionAuthority':False,'localSimulatedAI':counters})
            D.private_json(root/'MOCK_RESPONSE_FAILURE.SAFE.json',{'schema':D.WORKLOAD_SCHEMA,'nonce':NONCE,
                'phase':'services','failureDetail':{'assertion':'diagnostic-one-explicit-case','code':'ERR_ASSERTION',
                  'sqlstate':'UNKNOWN','nativeStatus':'unknown'},'retryAllowed':False})
            with patch.object(s,'create_groups',side_effect=D.Rejected('services','FIRST_SYNTHETIC_FAILURE')),patch.object(s,'close'):
                report=s.run()
            self.assertEqual(report['firstFailure']['code'],'FIRST_SYNTHETIC_FAILURE')
            self.assertEqual(report['servicesResults'][0]['localSimulatedAI']['aufrufe'],1)
            self.assertEqual(report['servicesResults'][0]['responseFailure']['assertion'],'diagnostic-one-explicit-case')
            self.assertEqual(report['servicesResults'][0]['applicationExitAttestedBeforeServiceStop'],'UNKNOWN')
            self.assertFalse(report['full100Completed'])

    def test_component_guard_unknown_peak_swap_oom_and_cpu_fail_closed(self):
        self.assertTrue(D.group_fit(kernel(),D.APP_HARD))
        at_limit=kernel();at_limit['memory']['kernelLifetimePeakBytes']=D.APP_HARD
        self.assertTrue(D.group_fit(at_limit,D.APP_HARD))
        paths=[('memory','kernelLifetimePeakBytes',D.APP_HARD+4096),('memory','maximumBytes','UNKNOWN'),
            ('memory','swapCurrentBytes',1),('memoryEvents','max',1),('memoryEvents','oom',1),
            ('cpuMaximum','quotaUsec',200000),('memory','kernelLifetimePeakBytes',True)]
        for section,key,value in paths:
            raw=kernel();raw[section][key]=value
            with self.subTest(key=key),self.assertRaises(D.Rejected):D.group_fit(raw,D.APP_HARD)

    def test_actual_workload_success_enum_and_counters_are_closed(self):
        self.assertEqual(D.workload_result(app_result(),NONCE,100)['positiveProfileResults'],100)
        for key,value in [('status','PASS'),('positiveProfileResults',99),('finalActiveProfiles','UNKNOWN'),
                          ('formal1500Acceptance',True),('nonce','wrong')]:
            with self.subTest(key=key),self.assertRaises(Exception):D.workload_result({**app_result(),key:value},NONCE,100)
        with self.assertRaises(Exception):D.workload_result({**app_result(),'rawPrivateError':'PRIVATE'},NONCE,100)

    def test_failure_detail_has_no_free_form_reason_or_sql(self):
        detail={'assertion':'diagnostic-fresh-database-required','code':'ERR_ASSERTION','sqlstate':'42P01','nativeStatus':'failed'}
        self.assertEqual(D.failure_detail(detail),{**detail,'codepoint':None})
        for key,value in [('assertion','private SQL and token'),('sqlstate','select *'),('nativeStatus','arbitrary')]:
            with self.assertRaises(Exception):D.failure_detail({**detail,key:value})
        with self.assertRaises(Exception):D.failure_detail({**detail,'message':'PRIVATE_SENTINEL'})

    def test_local_ai_transport_statistics_are_closed_estimates_not_paid_usage(self):
        keys=('aufrufe','erfolgreich','fehler','abgewiesenWegenObergrenze','eingabeBytes','ausgabeBytes',
            'eingabeTokenGeschaetzt','ausgabeTokenGeschaetzt','bytesJeGeschaetztemToken','gleichzeitigSpitze')
        value=dict.fromkeys(keys,3);value['dauerMs']=dict.fromkeys(('n','min','p50','p95','max','mittel'),2.5)
        result=D.simulated_ai_result(value);self.assertFalse(result['actualPaidProviderUsage']);self.assertTrue(result['tokensAreEstimates'])
        self.assertEqual(D.simulated_ai_result(None),'UNKNOWN')
        with self.assertRaises(Exception):D.simulated_ai_result({**value,'rawRequest':'PRIVATE_SENTINEL'})

    def test_invented_dataset_covers_all_100_selectors_and_three_preflight_geographies(self):
        selectors={'politicalLevels':['bund','land'],'geographyIDs':['geo-bund','geo-land-berlin','geo-land-brandenburg'],
            'preflightProfileIndices':[0,330,450],'profileSelectorCoverage':3}
        epoch='2026-10-31T18:00:00.000Z'
        raw={'schema':'helmut-mock100-synthetic-dataset/1','syntheticOnly':True,'originalEquivalent':False,
            'epoch':epoch,'profileCount':3,'profileDistribution':{'bundestag':1,'berlin':1,'brandenburg':1},'fixtureRequiredSelectors':selectors,'caseCount':96,'sourceDocumentCount':384,
            'executedProfileCount':3,'executedCaseCount':3,'executedSourceCount':12,'sourceTextBytes':300000,
            'minimumSourceTextBytes':700,'maximumSourceTextBytes':900,'sourceDatasetSHA256':'a'*64,'profileSpecsSHA256':'b'*64,
            'originalQualificationClaimed':False,'professionalAcceptance':False,'productionProof':False,
            'unprojectedDocument':'PRIVATE_SENTINEL'}
        result=D.dataset_result(raw,epoch,3);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))
        for key,value in [('profileSelectorCoverage',499),('geographyIDs',['geo-bund'])]:
            bad=copy.deepcopy(raw);bad['fixtureRequiredSelectors'][key]=value
            with self.assertRaises(Exception):D.dataset_result(bad,epoch,3)

    def test_first_failure_is_not_replaced_by_cleanup_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp))
            with patch.object(s,'create_groups',side_effect=D.Rejected('schema','FIRST_NATIVE_FAILURE')),\
                    patch.object(s,'close',side_effect=RuntimeError('PRIVATE_SENTINEL')):
                result=s.run()
            self.assertEqual(result['firstFailure'],{'phase':'schema','code':'FIRST_NATIVE_FAILURE'})
            self.assertEqual(result['cleanup']['closure'],'UNKNOWN');self.assertNotIn('PRIVATE_SENTINEL',json.dumps(result))
            self.assertFalse(result['full100ReleaseAttempted']);self.assertFalse(result['end500Acceptance'])

    def test_actual_shell_barrier_blocks_exec_and_keeps_pid_on_release(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);marker=root/'marker';log=root/'log'
            child=subprocess.Popen(['/bin/sh','-c',D.BOUND_SHELL,'barrier',str(log),sys.executable,'-B','-c',
                'import os,sys;open(sys.argv[1],"w").write(str(os.getpid()))',str(marker)],
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=D.ENV)
            try:
                self.assertTrue(select.select([child.stdout],[],[],2)[0]);line=child.stdout.readline()
                self.assertEqual(line,('W15_DIAG_CHILD_READY '+str(child.pid)+'\n').encode())
                self.assertFalse(marker.exists());child.stdin.write(b'GO\n');child.stdin.close();child.wait(timeout=3)
                self.assertEqual(child.returncode,0);self.assertEqual(marker.read_text(),str(child.pid))
            finally:
                if child.poll() is None:child.kill();child.wait()
                child.stdout.close()
            rejected=subprocess.run(['/bin/sh','-c',D.BOUND_SHELL,'barrier',str(log),'/bin/false'],
                input=b'WRONG\n',stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=D.ENV,timeout=3)
            self.assertEqual(rejected.returncode,79)

    def test_owned_cleanup_is_not_suppressed_by_failed_admission(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));s.container_attempted=True;s.container_id='f'*64
            before={'id':'f'*64,'running':True,'pid':123};after={**before,'running':False,'pid':0};calls=[]
            def fake(argv,seconds=15):
                calls.append(argv);return subprocess.CompletedProcess(argv,0,b'false\n')
            with patch.object(s,'inspect',side_effect=[before,after]),patch.object(s,'raw_command',side_effect=fake),\
                 patch.object(s,'guard',side_effect=D.Rejected('groups','COMPONENT_LIMIT_OR_EVENT')):
                s.close()
            self.assertEqual(s.cleanup['databaseStopped'],'PASS')
            self.assertTrue(any(argv[-1]=='f'*64 and 'stop'in argv for argv in calls))
            self.assertEqual(s.cleanup['resourceClosure'],'UNKNOWN')
            self.assertEqual(s.first['code'],'COMPONENT_LIMIT_OR_EVENT')

    def test_limit_failure_retains_last_real_kernel_values_before_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));s.phase='mock100';s.groups={'application':{'parts':('invented',),'identity':(0,0)}}
            raw=kernel();raw['memory']['kernelLifetimePeakBytes']=D.APP_HARD+4096
            fd=os.open('/dev/null',os.O_RDONLY)
            try:
                with patch.object(s,'_parent_fd',side_effect=lambda:os.dup(fd)),\
                     patch.object(D.P,'read_parent',return_value={'configuredLimit':str(D.HOST_HARD)}),\
                     patch.object(D.C,'_open_group',side_effect=lambda p,*_:os.dup(p)),patch.object(D.C,'_kernel',return_value=raw):
                    with self.assertRaises(D.Rejected):s.guard()
            finally:os.close(fd)
            self.assertEqual(s.metrics['application']['last']['memory']['kernelLifetimePeakBytes'],D.APP_HARD+4096)
            self.assertEqual(s.phase_metrics['mock100']['application']['last']['kernelLifetimePeakBytes'],D.APP_HARD+4096)

    def test_phase_samples_do_not_invent_peak_timestamp_or_add_maxima(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));s.phase='preflight-small';s.samples=1;s.record_phase('application',kernel())
            raw=kernel();raw['memory']['currentBytes']=11000;s.samples=2;s.record_phase('application',raw)
            entry=s.phase_metrics['preflight-small']['application']
            self.assertEqual(entry['first']['currentBytes'],10000);self.assertEqual(entry['last']['currentBytes'],11000)
            self.assertNotIn('peakOccurrenceTime',entry)

    def test_fixed_root_receipt_is_bounded_exclusive_and_never_executes_native_test(self):
        value={'schema':'helmut-w15-synthetic-resource-diagnostic-result/1','scope':D.SMALL_SCOPE,'executionAuthority':False}
        with patch.object(D.subprocess,'run',return_value=subprocess.CompletedProcess([],0)) as run:
            D.final_receipt('/tmp/invented-runner-temp',value)
            argv=run.call_args.args[0]
            self.assertEqual(argv[-1],'/tmp/invented-runner-temp/resource-diagnostic.SAFE.json')
            self.assertIn('O_NOFOLLOW',argv[-2]);self.assertIn('O_EXCL',argv[-2]);self.assertEqual(run.call_args.kwargs['input'],D.canonical(value)+b'\n')
        with patch.object(D.subprocess,'run',side_effect=AssertionError('must reject before command')):
            with self.assertRaises(D.Rejected):D.final_receipt('/tmp/x',{'oversize':'x'*D.RECEIPT_MAX})

    def test_bounded_full_phase_metric_shape_fits_public_check_receipt_without_peak_reset(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));raw=kernel();raw['cpuStat']=dict.fromkeys(D.C.CPU_FIELDS,2**53-1)
            for phase in D.PHASES:
                s.phase=phase
                for role in ('common-parent','application','database','test-tools'):
                    s.record_phase(role,raw);s.record_phase(role,raw)
            s.metrics={role:{'first':raw,'last':raw,'categoryMaxima':{key:{'value':2**53-1,'sample':2**53-1,'phase':'mock100'}
                for key in D.C.M.STAT_FIELDS}} for role in ('application','database','test-tools')}
            def fake_scenario(count):
                result=app_result(count);s.workload_results.append(result);return result
            with patch.object(s,'create_groups'),patch.object(s,'stage'),patch.object(s,'start_database'),\
                patch.object(s,'scenario',side_effect=fake_scenario),patch.object(s,'close'):
                value=s.run()
            self.assertLess(len(D.canonical(value)),D.RECEIPT_MAX)
            self.assertFalse(value['differentTimeMaximaAdditive']);self.assertFalse(value['peakCompositionKnown'])
            self.assertIn('NO_RESET',value['kernelPeakScope']);self.assertEqual(value['pureApplicationBytes'],'UNKNOWN')


    def test_new_copy_helpers_use_exact_committed_blobs_and_reject_links(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);repo=root/'source';repo.mkdir();target=root/'copy'
            def git(*args):
                return subprocess.check_output(['/usr/bin/git','-C',str(repo),*args],env=D.ENV,stderr=subprocess.DEVNULL).decode().strip()
            git('init','--quiet');file=repo/D.WORKLOAD;file.parent.mkdir(parents=True);file.write_text('committed synthetic source\n')
            git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','--quiet','-m','fixture')
            head=git('rev-parse','HEAD');file.write_text('UNCOMMITTED PRIVATE SENTINEL\n')
            with patch.object(D,'REPO',repo):pins=D.copy_committed_repo({'exactCommit':head},target,lambda:None)
            self.assertEqual((target/D.WORKLOAD).read_text(),'committed synthetic source\n')
            self.assertEqual(pins[D.WORKLOAD]['bytes'],len('committed synthetic source\n'))
            self.assertFalse((target/'.git/objects/info/alternates').exists())
        for name,mode in [('scripts/../escape','100644'),('scripts/link','120000'),('.git/config','100644')]:
            raw=(mode+' blob '+'a'*40+' 1\t'+name+'\0').encode()
            with self.assertRaises(Exception):D._tree_rows(raw)

    def test_optional_invalid_codepoint_keeps_known_first_failure(self):
        known={'assertion':'diagnostic-fresh-database-required','code':'ERR_ASSERTION','sqlstate':'42P01','nativeStatus':'failed'}
        for location in [{'module':[],'function':'workload','line':1},{'module':'PRIVATE','function':'workload','line':1},
                         {'module':D.WORKLOAD,'function':{},'line':1},{'module':D.WORKLOAD,'function':'workload','line':True}]:
            result=D.failure_detail({**known,'codepoint':location})
            self.assertEqual(result,{**known,'codepoint':None})
        location={'module':D.WORKLOAD,'function':'workload','line':123}
        self.assertEqual(D.failure_detail({**known,'codepoint':location})['codepoint'],location)

    def test_full_scenario_is_exactly_one_hundred_and_never_repeats_native_three(self):
        with tempfile.TemporaryDirectory() as temp:
            instance=D.Supervisor(state(temp));calls=[]
            def scenario(count):
                calls.append(count);value=app_result(count);instance.workload_results.append(value);return value
            with patch.object(instance,'create_groups'),patch.object(instance,'stage'),patch.object(instance,'start_database'), \
                 patch.object(instance,'scenario',side_effect=scenario),patch.object(instance,'close'):
                report=instance.run()
            self.assertEqual(calls,[100]);self.assertTrue(report['full100Completed']);self.assertEqual(report['status'],'PASS_MOCK100')

    def test_success_requires_all_output_categories_and_native_counts(self):
        value=app_result()
        for key,bad in [('nativeObserved',None),('outputErrors',None),('confirmedCountsOnly',False),
                        ('outputErrors',{**value['outputErrors'],'missing':1}),
                        ('nativeObserved',{**value['nativeObserved'],'positions':299})]:
            with self.subTest(key=key),self.assertRaises(Exception):D.workload_result({**value,key:bad},NONCE,100)
        failed={**value,'status':'FAIL_OR_UNKNOWN_DIAGNOSTIC','firstFailurePhase':'work',
                'firstFailureDetail':{'assertion':'UNKNOWN','code':'ERR_ASSERTION','sqlstate':'UNKNOWN','nativeStatus':'unknown','codepoint':None},
                'nativeObserved':None,'outputErrors':None,'nativeAuditSHA256':None,'finalActiveProfiles':'UNKNOWN'}
        self.assertEqual(D.workload_result(failed,NONCE,100)['finalActiveProfiles'],'UNKNOWN')

    def test_model_transport_is_bound_to_one_draft_and_review_per_profile(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);instance=D.Supervisor(state(temp));phases=[]
            for index in range(3):
                phases.append({'phase':'understanding','ownerHash':None,'profileContextSHA256':None,'requestSHA256':str(index)*64})
                for phase in ('entwurf','pruefung'):
                    phases.append({'phase':phase,'ownerHash':str(index)*64,'profileContextSHA256':'d'*64,'requestSHA256':'e'*64})
            record={'schema':D.WORKLOAD_SCHEMA,'nonce':NONCE,'phases':phases}
            D.private_json(root/'MODEL_PHASES.SAFE.json',record)
            instance.services_results=[{'localSimulatedAI':{'aufrufe':9,'erfolgreich':9,'fehler':0,'abgewiesenWegenObergrenze':0}}]
            instance.verify_model_phases(root,3,app_result(3))
            self.assertEqual(instance.services_results[0]['modelPhaseCounts'],{'understanding':3,'entwurf':3,'pruefung':3})
            phases[-1]['phase']='entwurf';(root/'MODEL_PHASES.SAFE.json').unlink();D.private_json(root/'MODEL_PHASES.SAFE.json',record)
            with self.assertRaises(D.Rejected):instance.verify_model_phases(root,3,app_result(3))

    def test_publisher_preserves_new_closed_evidence_and_excludes_raw_values(self):
        publisher=D.load('publish_synthetic_resource_receipt')
        value=app_result();value['firstFailureDetail']={'assertion':'diagnostic-five-output-categories-required',
          'code':'ERR_ASSERTION','sqlstate':'UNKNOWN','nativeStatus':'unknown',
          'codepoint':{'module':D.WORKLOAD,'function':'workload','line':123}}
        projected=publisher.metric_projection(value)
        self.assertEqual(projected['nativeAuditSHA256'],'a'*64)
        self.assertEqual(projected['firstFailureDetail']['codepoint'],value['firstFailureDetail']['codepoint'])
        with self.assertRaises(AssertionError):publisher.metric_projection({**value,'privateRawLog':'PRIVATE_SENTINEL'})
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(publisher.metric_projection({'status':'PRIVATE_SENTINEL'})))

    def test_current_javascript_closed_error_vocabulary_crosses_supervisor_and_publisher(self):
        source=(D.REPO/D.WORKLOAD).read_text()
        assertions=set(re.findall(r'"(diagnostic-[a-z-]+)"',source))
        self.assertLessEqual(assertions,D.ASSERTIONS)
        declared_codes=re.search(r'const CODES=new Set\(\[(.*?)\]\);',source,re.S)[1]
        self.assertLessEqual(set(re.findall(r'"([^\"]+)"',declared_codes)),D.NODE_CODES)
        declared=re.search(r'const CODEPOINT_SYMBOLS=new Set\(\[(.*?)\]\);',source,re.S)[1]
        self.assertEqual(set(re.findall(r'"([^"]+)"',declared)),set(D.CODEPOINT_SYMBOLS))
        publisher=D.load('publish_synthetic_resource_receipt')
        self.assertLessEqual(D.ASSERTIONS,publisher.PUBLIC_ENUMS)
        self.assertLessEqual(D.NODE_CODES,publisher.PUBLIC_ENUMS)
        detail={'assertion':'diagnostic-positive-native-lage-required','code':'LAGE_AI_PROVIDER_HTTP_429',
                'sqlstate':'UNKNOWN','nativeStatus':'failed','codepoint':{'module':D.WORKLOAD,'function':'Object.workload','line':123}}
        self.assertEqual(publisher.metric_projection(D.failure_detail(detail)),detail)
        for code in ('ENOBUFS','ERR_CHILD_PROCESS_STDIO_MAXBUFFER'):
            bounded={**detail,'code':code}
            self.assertEqual(publisher.metric_projection(D.failure_detail(bounded)),bounded)

    def test_cleanup_first_failure_is_closed_and_never_replaces_an_earlier_cause(self):
        with tempfile.TemporaryDirectory() as temp:
            instance=D.Supervisor(state(temp))
            instance.cleanup_error('databaseStopped',FileNotFoundError('PRIVATE PATH SENTINEL'))
            first=dict(instance.first)
            self.assertEqual(first,{'phase':'closure','code':'FILESYSTEM_ENTRY_MISSING'})
            instance.cleanup_error('systemdReload',RuntimeError('LATER PRIVATE SENTINEL'))
            self.assertEqual(instance.first,first)
            self.assertEqual(instance.cleanup,{'databaseStopped':'UNKNOWN','systemdReload':'UNKNOWN'})
            self.assertNotIn('SENTINEL',json.dumps(instance.first))

    def test_actual_failed_mock100_receipt_keeps_phase_metrics_and_first_cause_publishable(self):
        publisher=D.load('publish_synthetic_resource_receipt')
        original=json.loads((D.REPO/'scripts/fixtures/mock100-run-42042488458.SAFE.json').read_text())
        projected=publisher.metric_projection(original)
        self.assertEqual(projected['phaseMeasurements']['mock100'],original['phaseMeasurements']['mock100'])
        self.assertEqual(projected['firstFailure'],original['firstFailure'])
        workload=projected['workloadResults'][0]
        self.assertEqual(workload['positiveProfileResults'],34)
        self.assertEqual(workload['finalActiveProfiles'],0)
        self.assertEqual(projected['servicesResults'][0]['applicationExitAttestedBeforeServiceStop'],'UNKNOWN')
        env={'GITHUB_ACTIONS':'true','GITHUB_REPOSITORY':'ernisch/helmut-pilot',
          'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_REF':D.REF,'GITHUB_SHA':original['exactCommit'],
          'SOURCE_HEAD_SHA':original['exactCommit'],'GITHUB_RUN_ID':original['runId'],'GITHUB_TOKEN':'SYNTHETIC_FIXTURE_TOKEN'}
        check=publisher.prepare(original,env)
        self.assertEqual(check['head_sha'],original['exactCommit'])
        self.assertIn('LAGE_AI_PROVIDER_HTTP_422',check['output']['text'])
        self.assertNotIn('SYNTHETIC_FIXTURE_TOKEN',check['output']['text'])
        self.assertLess(len(check['output']['text']),60020)
        for key in ('PRIVATE_SENTINEL','mock101'):
            bad=copy.deepcopy(original);bad['phaseMeasurements'][key]={}
            with self.assertRaises(AssertionError):publisher.metric_projection(bad)

    @unittest.skipUnless(hasattr(os,'pidfd_open'),'requires Linux bound process descriptors')
    def test_failed_application_exit_is_attested_before_live_mock_service_stop(self):
        with tempfile.TemporaryDirectory() as temp:
            instance=D.Supervisor(state(temp));children=[]
            try:
                for action,role in [('--services','test-tools'),('--app','application')]:
                    process=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],
                      stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,env=D.ENV)
                    child={'process':process,'pidfd':os.pidfd_open(process.pid),'role':role,'action':action,'exitAttested':False}
                    children.append(child)
                instance.children=children
                instance.first={'phase':'mock100','code':'APP_RESULT'}
                with patch.object(instance,'guard'),patch.object(instance,'raw_command',return_value=subprocess.CompletedProcess([],0,b'')):
                    instance.close()
                self.assertTrue(instance.application_exit_before_service_stop)
                self.assertEqual(instance.first,{'phase':'mock100','code':'APP_RESULT'})
                self.assertTrue(all(c['exitAttested'] for c in children))
            finally:
                for child in children:
                    process=child['process']
                    if process.poll() is None:process.kill();process.wait(timeout=3)
                    if child['pidfd'] is not None:os.close(child['pidfd'])
                    if process.stdin and not process.stdin.closed:process.stdin.close()
                    if process.stdout and not process.stdout.closed:process.stdout.close()

    def test_already_stopped_service_does_not_invent_application_exit_order(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as temp:
            instance=D.Supervisor(state(temp));process=Mock();process.poll.return_value=0
            process.stdin=None;process.stdout.closed=True
            application={'role':'application','exitAttested':True}
            service={'process':process,'pidfd':None,'role':'test-tools','action':'--services','exitAttested':False}
            instance.children=[application,service];instance.stop_child(service)
            self.assertEqual(instance.application_exit_before_service_stop,'UNKNOWN')
            self.assertFalse(service['exitAttested'])

    @unittest.skipUnless(hasattr(os,'pidfd_open'),'requires Linux bound process descriptors')
    def test_exited_native_service_with_running_docker_client_does_not_invent_exit_order(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as temp:
            instance=D.Supervisor(state(temp))
            process=subprocess.Popen([sys.executable,'-c','pass'],env=D.ENV)
            descriptor=os.pidfd_open(process.pid)
            try:
                process.wait(timeout=3)
                client=Mock();client.poll.return_value=None;client.stdin=None;client.stdout.closed=True
                application={'role':'application','exitAttested':True}
                service={'process':client,'pidfd':descriptor,'role':'test-tools','action':'--services','exitAttested':False}
                instance.children=[application,service];instance.stop_child(service)
                descriptor=None
                self.assertEqual(instance.application_exit_before_service_stop,'UNKNOWN')
                self.assertTrue(service['exitAttested'])
            finally:
                if process.poll() is None:process.kill();process.wait(timeout=3)
                if descriptor is not None:os.close(descriptor)


if __name__=='__main__':unittest.main()
