"""Pure numeric projection/IPC and mocked launcher; no DB, originals or load run."""
import sys
sys.dont_write_bytecode=True
import ast
import copy
from datetime import datetime,timezone
import importlib.util
import json
import math
import os
from pathlib import Path
import tempfile
import time
from unittest import TestCase,main
from unittest.mock import Mock,patch

HERE=Path(__file__).parent
def load(name):
    spec=importlib.util.spec_from_file_location('functional_results_test_'+name,HERE/(name+'.py'))
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
F=load('test_mock500_functional_adapter');R=F.RF.R
CANARY='FICTIONAL_PRIVATE_TEXT_MUST_NOT_ESCAPE'

def project():
    source=HERE.parent/'synthetik-500-w15-full500-controller.py'
    tree=ast.parse(source.read_text())
    function=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='functional_result_summary')
    namespace={'math':math}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[function],type_ignores=[])),str(source),'exec'),namespace)
    return namespace['functional_result_summary']

def fictional_reports():
    # Metadata cardinality is part of the wire contract, not 500 executed units.
    runtime={'unitReports':[{'owner':str(i),'count':16,'wallMS':50+i/10,'PRIVATE':CANARY}for i in range(500)],
        'providerPhases':[{'actualDelayMS':10+i/100,'PRIVATE':CANARY}for i in range(1000)],
        'completedUnits':500,'activeProfilesAtLastRead':500,
        'authMutations':[{'wallMs':17.5,'PRIVATE':CANARY}],
        'usageSinks':[{'wallMs':22.5}],'casWrites':[{'wallMs':8.5}]}
    audit={'units':[{'checks':34}for _ in range(500)],'positions':[{'PRIVATE':CANARY}for _ in range(1500)],
        'actualStoredRows':1500,'unitChecksCompleted':17000,'storedResultsAccepted':True,
        'categories':dict.fromkeys(('missing','empty','duplicate','technicallyInvalid','unusable'),0),'PRIVATE':CANARY}
    cleanup={'confirmedZero':True,'nativeBoundZero':True,'after':{'active':0},'PRIVATE':CANARY}
    return runtime,audit,cleanup

class FunctionalResultChecks(TestCase):
    def test_actual_aggregates_and_maxima_project_no_private_row_values_or_hashes(self):
        source=fictional_reports();actual=project()(*source)
        self.assertEqual(actual['securityControls'],sum(r['count']for r in source[0]['unitReports']))
        self.assertEqual(actual['storedResults'],source[1]['actualStoredRows'])
        for key,expected in {'auth':22.5,'cas':8.5,'unit':99.9,'provider':19.99}.items():
            self.assertAlmostEqual(actual['maximumTimingsMs'][key],expected)
        self.assertNotIn(CANARY,json.dumps(actual));self.assertEqual(R.validate_functional_results(actual),actual)
        self.assertFalse(actual['mock500Acceptance']);self.assertFalse(actual['productionAcceptance'])

    def test_unknown_timing_is_unknown_and_never_a_zero_or_time_pass(self):
        for field,rows,key in (('auth','authMutations','wallMs'),('cas','casWrites','wallMs'),
                              ('unit','unitReports','wallMS'),('provider','providerPhases','actualDelayMS')):
            data=fictional_reports();data[0][rows][0].pop(key)
            actual=project()(*data)
            self.assertEqual(actual['maximumTimingsMs'][field],'UNKNOWN')
            self.assertFalse(actual['timingsComplete']);self.assertEqual(actual['timeLimitsObserved'],'UNKNOWN')
            R.validate_functional_results(actual)
            actual['timeLimitsObserved']=True
            with self.assertRaises(R.MockRunnerError):R.validate_functional_results(actual)

    def test_bad_cardinality_types_zero_and_real_timing_violation_stop(self):
        mutations=[lambda a:a[0]['unitReports'].pop(),lambda a:a[0]['providerPhases'].pop(),
            lambda a:a[1]['positions'].pop(),lambda a:a[1].update(actualStoredRows=1499),
            lambda a:a[2]['after'].update(active=True),lambda a:a[0]['unitReports'][0].update(count=True),
            lambda a:a[0]['unitReports'][0].update(wallMS=60000),
            lambda a:a[0]['providerPhases'][0].update(actualDelayMS=20000)]
        for mutate in mutations:
            data=fictional_reports();mutate(data)
            with self.subTest(mutation=mutate),self.assertRaises(AssertionError):project()(*data)

    def test_closed_ipc_rejects_private_fields_nested_text_and_claimed_pass(self):
        good=project()(*fictional_reports())
        for mutate in (lambda v:v.update(owner=CANARY),lambda v:v['categories'].update(payload=CANARY),
            lambda v:v['maximumTimingsMs'].update(provider=CANARY),lambda v:v.update(executionAuthority=True),
            lambda v:v['categories'].update(missing=1),lambda v:v['maximumTimingsMs'].update(unit=float('nan'))):
            bad=copy.deepcopy(good);mutate(bad)
            with self.assertRaises(R.MockRunnerError):R.validate_functional_results(bad)

    def test_worker_results_require_current_projection_and_legacy_shape_stays_closed(self):
        request=F.RF.request(True);request.update(mode=R.FUNCTIONAL,limits=F.FC.F.limits('mock500'))
        observed=F.RF.result(request)
        observed.update(functionalContract=F.FC.F.CONTRACT,functionalSafetyChecksCompleted=True,
            legacyRegularMemoryAccepted=False,providerResourceAccepted=False,
            functionalResourceObservation=F.resource_observation(),functionalResults=project()(*fictional_reports()))
        R.validate_public_result(observed,request)
        observed['functionalResults']=None
        with self.assertRaises(R.MockRunnerError):R.validate_public_result(observed,request)
        request=F.RF.request(True);observed=F.RF.result(request)
        observed['functionalResults']=project()(*fictional_reports())
        with self.assertRaises(R.MockRunnerError):R.validate_public_result(observed,request)

    def test_actual_outer_launcher_exposes_validated_nonce_only_for_functional_mode(self):
        value=F.RF.request(True);value.update(mode=R.FUNCTIONAL,limits=F.FC.F.limits('mock500'))
        worker=F.RF.result(value)
        worker.update(functionalContract=F.FC.F.CONTRACT,functionalSafetyChecksCompleted=True,
            legacyRegularMemoryAccepted=False,providerResourceAccepted=False,
            functionalResourceObservation=F.resource_observation(),functionalResults=project()(*fictional_reports()))
        roles={'worker':worker,'workerExited':True,'checkoutFiles':2,'checkoutBytes':100,'binaryBytes':200,
            'dockerSocketGID':987,'workerUID':1000,'workerGID':1000}
        process=Mock();process.wait.return_value=0;process.poll.return_value=0
        with tempfile.TemporaryDirectory(prefix='fictional-functional-public-receipt-')as tmp:
            with patch.object(R,'github_binding'),patch.object(R.S,'_identity_available',return_value=987),\
                 patch.object(R.S,'_roots',return_value=(Path(tmp)/'worker',Path(tmp)/'ipc')),\
                 patch.object(R.P,'privileged'),patch.object(R.P,'identity',return_value=(1,2)),\
                 patch.object(R.P,'parent_empty',return_value=True),\
                 patch.object(R.P,'read_parent',side_effect=lambda *a,**k:F.FC.sample()),\
                 patch.object(R.subprocess,'Popen',return_value=process),\
                 patch.object(R.S,'_receive_result',return_value={'ok':True,'result':roles}),\
                 patch.object(R.S,'_command')as command,\
                 patch.object(R.P.P.R.capacity(),'host_admission'):
                result=R.launch(value,F.RF.private())
        self.assertEqual(result['nonce'],value['nonce'])
        self.assertEqual(result['runId'],value['runId']);self.assertEqual(result['exactCommit'],value['exactCommit'])
        self.assertEqual(result['workerResult']['functionalResults'],worker['functionalResults'])
        command.assert_not_called();self.assertNotIn(CANARY,json.dumps(result))
        self.assertNotIn(F.RF.CANARY,json.dumps(result))

if __name__=='__main__':main()
