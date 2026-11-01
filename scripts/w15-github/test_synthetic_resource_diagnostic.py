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
        'nonce':NONCE,'profiles':D.SMALL_COUNT if preflight else 500,'attempt':1,'maxSeconds':D.WALL}


def kernel(hard=D.APP_HARD):
    return {'memory':{'currentBytes':10000,'kernelLifetimePeakBytes':20000,'maximumBytes':hard,
        'swapCurrentBytes':0,'swapMaximumBytes':0},'memoryEvents':dict.fromkeys(('max','oom','oom_kill','oom_group_kill'),0),
        'cpuMaximum':{'quotaUsec':100000,'periodUsec':100000},'cpuStat':dict.fromkeys(D.C.CPU_FIELDS,5000),
        'memoryStat':dict.fromkeys(D.C.M.STAT_FIELDS,1000),'memoryPressure':'UNKNOWN','cpuPressure':'UNKNOWN',
        'effectiveCpuset':'0-1'}


def state(root):
    ctx=D.P.context('123456789',HEAD,NONCE);ctx['capacityDiagnostic']=True
    return {'context':ctx,'stateRoot':str(root),'parentIdentity':[0,0],'startedMonotonicNS':time.monotonic_ns(),
        'request':request(),'preflightOnly':False}


def app_result(count=500):
    return {'schema':D.WORKLOAD_SCHEMA,'nonce':NONCE,'status':'PASS_SYNTHETIC_DIAGNOSTIC_WORKLOAD_ONLY',
        'firstFailurePhase':None,'firstFailureDetail':None,'cleanupFailureDetail':None,'requestedProfiles':count,
        'provisionedProfiles':count,'positiveProfileResults':count,'activeCohortReadbacks':count+2,'understoodCases':96,
        'finalActiveProfiles':0,'simulatedProviderOnly':True,'originalDataUsed':False,'formal1500Acceptance':False,
        'end500Acceptance':False,'mock500Acceptance':False,'productionProof':False,'executionAuthority':False,'retryAllowed':False}


def progress(count=500):
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
            with patch.object(s,'create_groups',side_effect=D.Rejected('synthetic500','COMMON_PARENT_REJECTED')),patch.object(s,'close'):
                report=s.run()
            frame=report['workloadProgress'][0]['lastConfirmedWorkloadProgress']
            self.assertEqual(frame['requestedProfiles'],3);self.assertEqual(frame['operation'],'briefing-build')
            self.assertEqual(frame['understoodCases'],3);self.assertEqual(frame['decisionProfiles'],1)
            self.assertEqual(frame['positiveProfileResults'],0);self.assertEqual(frame['finalActiveProfiles'],'UNKNOWN')
            self.assertEqual(report['workloadResults'],[]);self.assertFalse(report['full500Completed'])

    def test_partial_progress_is_bound_closed_and_never_a_completion_receipt(self):
        value=progress();self.assertEqual(D.workload_progress(value,NONCE,500),value)
        for key,bad in [('nonce','foreign'),('requestedProfiles',3),('phase','PRIVATE'),('operation','PRIVATE'),
            ('sequence',True),('sequence',10001),('understoodCases',97),('matchingProfiles',False),
            ('positiveProfileResults',2),('finalActiveProfiles',False)]:
            with self.subTest(key=key),self.assertRaises(Exception):
                D.workload_progress({**value,key:bad},NONCE,500)
        with self.assertRaises(Exception):D.workload_progress({**value,'message':'PRIVATE_SENTINEL'},NONCE,500)
        with self.assertRaises(Exception):D.workload_result(value,NONCE,500)

    def test_partial_progress_survives_missing_worker_result_without_masking_first_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);s=D.Supervisor(state(root));s.progress_target=(root,500)
            D.private_json(root/'APP_PROGRESS.SAFE.json',progress())
            def cleanup():
                # A later cleanup frame must not replace the pre-cleanup work observation.
                path=root/'APP_PROGRESS.SAFE.json';path.unlink()
                D.private_json(path,{**progress(),'sequence':21,'phase':'deactivate','operation':'profile-deactivation'})
            with patch.object(s,'create_groups',side_effect=D.Rejected('synthetic500','COMMON_PARENT_REJECTED')), \
                    patch.object(s,'close',side_effect=cleanup):
                report=s.run()
            self.assertEqual(report['firstFailure'],{'phase':'synthetic500','code':'COMMON_PARENT_REJECTED'})
            self.assertEqual(report['workloadProgress'][0]['lastConfirmedWorkloadProgress'],progress())
            self.assertEqual(report['workloadProgressUnknownCounts'],[])
            self.assertEqual(report['workloadResults'],[]);self.assertFalse(report['full500Completed'])

    def test_invalid_or_regressing_progress_is_unknown_and_keeps_last_valid_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);s=D.Supervisor(state(root));s.progress_target=(root,500)
            s.collect_workload_progress();self.assertEqual(s.progress_unknown,{500})
            file=root/'APP_PROGRESS.SAFE.json';D.private_json(file,progress());s.collect_workload_progress()
            self.assertEqual(s.progress_unknown,set())
            for bad in [{**progress(),'sequence':19},{**progress(),'matchingProfiles':0},
                        {**progress(),'nonce':'foreign'},{**progress(),'message':'PRIVATE_SENTINEL'}]:
                file.unlink();D.private_json(file,bad);s.collect_workload_progress()
                self.assertEqual(s.progress_unknown,{500})
                self.assertEqual(s.workload_progress[500]['lastConfirmedWorkloadProgress'],progress())

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
            s=D.Supervisor(state(tmp));s.progress_target=(Path(tmp),500)
            with patch.object(D,'read_private',side_effect=KeyboardInterrupt):
                with self.assertRaises(KeyboardInterrupt):s.collect_workload_progress()
            self.assertEqual(s.progress_unknown,set())
            with patch.object(s,'create_groups',side_effect=D.Rejected('synthetic500','COMMON_PARENT_REJECTED')), \
                    patch.object(s,'collect_workload_progress',side_effect=KeyboardInterrupt),patch.object(s,'close'):
                report=s.run()
            self.assertEqual(report['firstFailure'],{'phase':'synthetic500','code':'COMMON_PARENT_REJECTED'})
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

    def test_manual500_is_exact_real_ref_head_attempt_and_scope(self):
        self.assertTrue(D.validate_request(request(),HEAD,environment())['capacityDiagnostic'])
        for key,bad in [('GITHUB_REF','refs/heads/main'),('GITHUB_EVENT_NAME','pull_request'),
                        ('GITHUB_RUN_ATTEMPT','2'),('GITHUB_SHA','b'*40),('GITHUB_ACTIONS','false')]:
            with self.subTest(key=key),self.assertRaises(Exception):
                D.validate_request(request(),HEAD,{**environment(),key:bad})
        for key,bad in [('profiles',499),('attempt',True),('maxSeconds',1801),('scope',D.SMALL_SCOPE)]:
            with self.subTest(key=key),self.assertRaises(Exception):
                D.validate_request({**request(),key:bad},HEAD,environment())

    def test_pr_three_profiles_cannot_admit_any_full500_or_wrong_head_ref(self):
        self.assertEqual(D.request_for_preflight(HEAD)['profiles'],3)
        D.validate_request(request(True),HEAD,environment(True),preflight=True)
        for value,env in [(request(),environment(True)),(request(True),environment()),
            (request(True),{**environment(True),'GITHUB_HEAD_REF':'main'}),
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
            self.assertFalse(report['full500Completed'])

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
        self.assertEqual(D.workload_result(app_result(),NONCE,500)['positiveProfileResults'],500)
        for key,value in [('status','PASS'),('positiveProfileResults',499),('finalActiveProfiles','UNKNOWN'),
                          ('formal1500Acceptance',True),('nonce','wrong')]:
            with self.subTest(key=key),self.assertRaises(Exception):D.workload_result({**app_result(),key:value},NONCE,500)
        with self.assertRaises(Exception):D.workload_result({**app_result(),'rawPrivateError':'PRIVATE'},NONCE,500)

    def test_failure_detail_has_no_free_form_reason_or_sql(self):
        detail={'assertion':'diagnostic-fresh-database-required','code':'ERR_ASSERTION','sqlstate':'42P01','nativeStatus':'failed'}
        self.assertEqual(D.failure_detail(detail),detail)
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

    def test_invented_dataset_covers_all_500_selectors_and_three_preflight_geographies(self):
        selectors={'politicalLevels':['bund','land'],'geographyIDs':['geo-bund','geo-land-berlin','geo-land-brandenburg'],
            'preflightProfileIndices':[0,330,450],'profileSelectorCoverage':500}
        epoch='2026-10-31T18:00:00.000Z'
        raw={'schema':'helmut-resource500-synthetic-dataset/1','syntheticOnly':True,'originalEquivalent':False,
            'epoch':epoch,'profileCount':500,'fixtureRequiredSelectors':selectors,'caseCount':96,'sourceDocumentCount':384,
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
            self.assertFalse(result['full500ReleaseAttempted']);self.assertFalse(result['end500Acceptance'])

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
            self.assertTrue(all(value=='PASS' for value in s.cleanup.values()))

    def test_limit_failure_retains_last_real_kernel_values_before_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));s.phase='synthetic500';s.groups={'application':{'parts':('invented',),'identity':(0,0)}}
            raw=kernel();raw['memory']['kernelLifetimePeakBytes']=D.APP_HARD+4096
            fd=os.open('/dev/null',os.O_RDONLY)
            try:
                with patch.object(s,'_parent_fd',side_effect=lambda:os.dup(fd)),\
                     patch.object(D.P,'read_parent',return_value={'configuredLimit':str(D.HOST_HARD)}),\
                     patch.object(D.C,'_open_group',side_effect=lambda p,*_:os.dup(p)),patch.object(D.C,'_kernel',return_value=raw):
                    with self.assertRaises(D.Rejected):s.guard()
            finally:os.close(fd)
            self.assertEqual(s.metrics['application']['last']['memory']['kernelLifetimePeakBytes'],D.APP_HARD+4096)
            self.assertEqual(s.phase_metrics['synthetic500']['application']['last']['kernelLifetimePeakBytes'],D.APP_HARD+4096)

    def test_phase_samples_do_not_invent_peak_timestamp_or_add_maxima(self):
        with tempfile.TemporaryDirectory() as temp:
            s=D.Supervisor(state(temp));s.phase='preflight-small';s.samples=1;s.record_phase('application',kernel())
            raw=kernel();raw['memory']['currentBytes']=15000;s.samples=2;s.record_phase('application',raw)
            entry=s.phase_metrics['preflight-small']['application']
            self.assertEqual(entry['first']['currentBytes'],10000);self.assertEqual(entry['last']['currentBytes'],15000)
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
            s.metrics={role:{'first':raw,'last':raw,'categoryMaxima':{key:{'value':2**53-1,'sample':2**53-1,'phase':'synthetic500'}
                for key in D.C.M.STAT_FIELDS}} for role in ('application','database','test-tools')}
            def fake_scenario(count):
                result=app_result(count);s.workload_results.append(result);return result
            with patch.object(s,'create_groups'),patch.object(s,'stage'),patch.object(s,'start_database'),\
                patch.object(s,'scenario',side_effect=fake_scenario),patch.object(s,'close'):
                value=s.run()
            self.assertLess(len(D.canonical(value)),D.RECEIPT_MAX)
            self.assertFalse(value['differentTimeMaximaAdditive']);self.assertFalse(value['peakCompositionKnown'])
            self.assertIn('NO_RESET',value['kernelPeakScope']);self.assertEqual(value['pureApplicationBytes'],'UNKNOWN')


if __name__=='__main__':unittest.main()
