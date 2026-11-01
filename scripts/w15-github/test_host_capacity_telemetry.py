"""Fictional counters cross the existing Python/JS privacy boundary; no runs."""
import sys
sys.dont_write_bytecode = True

import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent


def load(name):
    spec = importlib.util.spec_from_file_location('host_telemetry_' + name, HERE/(name+'.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


C, T, F = (load(name) for name in ('common_resources', 'end500_capacity_trace', 'test_end500_capacity_trace'))
GIB = 1024**3
HOST_MODE = 'end500-full-host-capacity-diagnostic'


def admission():
    return T.CAP.host_admission_dynamic(observation=dict(hostTotalBytes=16*GIB,
        hostAvailableBytes=10*GIB, hierarchyRootIdentity=[1, 2], callerRelativePath='/',
        ancestors=[dict(relativePath='/', identity=[1, 2], maximumBytes='UNLIMITED_ROOT',
            currentBytes='NOT_APPLICABLE', headroomBytes='UNLIMITED_ROOT')], observedMonotonicNS=1))


def observation(status='PASS'):
    return dict(schema=T.CAP.HOST_OBSERVATION_SCHEMA, status=status,
        hostAvailableBytes=3*GIB if status=='PASS' else GIB,
        minimumAncestorHeadroomBytes='UNLIMITED', requiredAncestorHeadroomBytes=10*GIB,
        minimumHostReserveBytes=2*GIB, observedMonotonicNS=2, ancestorIdentitiesMatch=True)


def sample():
    row=F.sample(peak=6*GIB, current=5*GIB, file=4*GIB, anon=GIB)
    row.update(configuredLimit=str(8*GIB), hostCapacityBudget=T.CAP.host_budget(admission()),
        hostCapacityObservation=observation(), hostCapacitySafetyObserved=True)
    return row


class HostCapacityTelemetryChecks(unittest.TestCase):
    def trace(self):
        collector=T.Collector(host_capacity_admission=admission())
        collector.observe(sample(), phase=F.phase(), components=F.components(123),
            progress={name:{'value':bound,'kind':'EXACT'} for name,bound in T.COUNTERS.items()})
        return collector

    def js(self,value,program):
        action=HERE.parents[1]/'.github/actions/w15-isolated/index.js'
        result=subprocess.run(['node','-e',program,str(action)],input=json.dumps(value),text=True,
            capture_output=True,timeout=10,cwd=HERE.parents[1],check=True)
        return json.loads(result.stdout)

    def project_js(self,value):
        return self.js(value,"const fs=require('node:fs'),vm=require('node:vm'),m=require('node:module'),p=process.argv[1],c={require:m.createRequire(p)};vm.createContext(c);vm.runInContext(fs.readFileSync(p,'utf8').split('// Runtime artifact')[0],c);process.stdout.write(JSON.stringify(c.closedFailureMemory(JSON.parse(fs.readFileSync(0,'utf8')))));")

    def test_eight_gib_budget_and_six_gib_observation_cross_both_closed_trace_boundaries(self):
        collector=self.trace();trace=collector.summary()
        self.assertIsNone(T.closed(trace))
        self.assertIsNotNone(T.closed(trace,host_capacity_budget=T.CAP.host_budget(admission())))
        self.assertEqual(trace['hardLimitBytes'],8*GIB)
        self.assertEqual(trace['kernelLifetimePeakBytes'],6*GIB)
        self.assertFalse(trace['anyCapacitySafetyFailureOrUnknown'])
        for key in ('legacyContractAccepted','end500Acceptance','mock500Acceptance','providerResourceAccepted','productionAcceptance'):
            self.assertIs(trace[key],False)
        self.assertEqual(trace['schema'],T.HOST_SCHEMA)
        program="const fs=require('node:fs'),p=require('node:path'),c=require(p.join(p.dirname(process.argv[1]),'capacity-trace')),v=JSON.parse(fs.readFileSync(0,'utf8'));if(c.closed(v.trace)!==null)throw Error('scope');process.stdout.write(JSON.stringify(c.closed(v.trace,v.budget)));"
        self.assertEqual(self.js({'trace':trace,'budget':T.CAP.host_budget(admission())},program),trace)
        old=T.Collector();old.observe(sample())
        self.assertTrue(old.summary()['anyCapacitySafetyFailureOrUnknown'])
        self.assertEqual(old.summary()['hardLimitBytes'],4999999488)

    def test_first_host_reserve_failure_and_progress_survive_python_and_action_error_projection(self):
        collector=self.trace();bad=sample();bad['hostCapacitySafetyObserved']=False
        bad['hostCapacityObservation']=observation('FAIL_HOST_RESERVE');bad['events']['max']=2
        collector.observe(bad,phase=F.phase(2))
        bad['end500CapacityTrace']=collector.summary()
        projected=C.project_failure_memory(bad,False)
        self.assertEqual(projected['configuredLimitBytes'],8*GIB)
        self.assertEqual(projected['hostCapacityObservation']['status'],'FAIL_HOST_RESERVE')
        self.assertEqual(projected['events']['max'],2)
        self.assertEqual(projected['end500CapacityTrace']['progress']['authCAS']['value'],500)
        self.assertEqual(self.project_js(projected),projected)
        self.assertEqual(projected['end500CapacityTrace']['capacitySafetyFailureOrUnknownCount'],1)

    def test_budget_mismatch_and_private_extras_never_export_or_erase_known_core(self):
        row=sample();row['end500CapacityTrace']=self.trace().summary();core=C.project_failure_memory(row,False)
        for key in ('hostCapacityBudget','hostCapacityObservation'):
            bad=copy.deepcopy(core);bad[key]['privatePath']='FICTIONAL_PRIVATE'
            python=C.closed_failure_memory(bad);js=self.project_js(bad)
            self.assertNotIn('FICTIONAL_PRIVATE',json.dumps(python))
            self.assertNotIn('FICTIONAL_PRIVATE',json.dumps(js))
            self.assertEqual(python['kernelLifetimePeakBytes'],6*GIB)
            self.assertEqual(js['kernelLifetimePeakBytes'],6*GIB)
        bad=copy.deepcopy(core);bad['hostCapacityBudget']['hardLimitBytes']+=4096
        self.assertNotIn('hostCapacityBudget',C.closed_failure_memory(bad))
        self.assertNotIn('end500CapacityTrace',self.project_js(bad))
        trace=self.trace().summary();trace['hostCapacityBudget']['hardLimitBytes']+=4096
        self.assertIsNone(T.closed(trace,host_capacity_budget=T.CAP.host_budget(admission())))
        bad=copy.deepcopy(core);bad['hostCapacityObservation']['minimumAncestorHeadroomBytes']=1
        for projected in (C.closed_failure_memory(bad),self.project_js(bad)):
            self.assertNotIn('hostCapacityObservation',projected)
            self.assertNotIn('hostCapacitySafetyObserved',projected)

    def test_legacy_failure_cannot_adopt_host_trace_or_lose_its_valid_old_trace(self):
        collector=T.Collector();collector.observe(F.sample(),phase=F.phase())
        old=F.sample();old['end500CapacityTrace']=collector.summary()
        core=C.project_failure_memory(old,False)
        self.assertEqual(self.project_js(core),core)
        malformed=copy.deepcopy(core);malformed['hostCapacityBudget']=T.CAP.host_budget(admission())
        self.assertEqual(C.closed_failure_memory(malformed),core)
        self.assertEqual(self.project_js(malformed),core)
        substituted=copy.deepcopy(core);substituted['end500CapacityTrace']=self.trace().summary()
        self.assertNotIn('end500CapacityTrace',C.closed_failure_memory(substituted))
        self.assertNotIn('end500CapacityTrace',self.project_js(substituted))

    def test_common_resource_guard_uses_admitted_limit_and_retains_rejected_observation(self):
        context={'runId':'123456','runAttempt':1,'nonce':'11111111-1111-4111-8111-111111111111'}
        with tempfile.TemporaryDirectory(prefix='w15-host-counters-') as tmp:
            path=Path(tmp);identity=path.stat();row=sample()
            for incompatible in ({'functional_stage':'end500'}, {'processing_backup_stage':'end500'},
                                 {'end_capacity_diagnostic':'FICTIONAL_PRIVATE'}):
                with self.assertRaises(C.ResourceError):
                    C.CommonResources(C.TOKEN,context,path,(identity.st_dev,identity.st_ino),
                        host_capacity_admission=admission(),**incompatible)
            for name,value in {'memory.max':str(8*GIB),'memory.swap.max':'0','memory.peak':str(6*GIB),
                    'memory.current':str(5*GIB),'memory.swap.current':'0',
                    'memory.events':'\n'.join(k+' 0' for k in T.EVENTS)}.items():
                (path/name).write_text(value)
            obj=C.CommonResources(C.TOKEN,context,path,(identity.st_dev,identity.st_ino),host_capacity_admission=admission())
            self.assertTrue(obj.capacity_diagnostic);self.assertTrue(obj.end_capacity_diagnostic)
            self.assertEqual(obj.container_limit,8*GIB)
            with patch.object(C,'_kernel_directory',side_effect=lambda _:os.open(path,os.O_RDONLY|os.O_DIRECTORY)), \
                 patch.object(obj,'check_pid'),patch.object(C.capacity(),'capture',return_value=row['capacityMeasurement']['last']), \
                 patch.object(C.capacity(),'host_runtime_guard',return_value=observation()) as guard:
                observed=obj.sample();self.assertTrue(observed['hostCapacitySafetyObserved']);guard.assert_called_once()
                guard.return_value=observation('FAIL_HOST_RESERVE')
                with self.assertRaises(C.ResourceError):obj.sample()
            failed=obj.failure_observation()
            self.assertFalse(failed['lastReadbackValid']);self.assertFalse(failed['hostCapacitySafetyObserved'])
            self.assertEqual(failed['hostCapacityObservation']['status'],'FAIL_HOST_RESERVE')
            self.assertEqual(failed['configuredLimitBytes'],8*GIB)

    def test_dynamic_trace_stays_20k_bounded_with_distinct_extrema_and_phase_history(self):
        collector=T.Collector(host_capacity_admission=admission())
        for i in range(1280):
            row=sample();row['kernelLifetimePeakBytes']=6*GIB+i
            row['currentBytes']=5*GIB-i
            row['capacityMeasurement']['last']['observedMonotonicNS']=10**15+i
            row['hostCapacityObservation']['observedMonotonicNS']=10**15+i
            row['capacityMeasurement']['last']['memoryStat']={
                name:4*GIB-abs(i-(index+2))*1000 for index,name in enumerate(T.CATEGORIES)}
            collector.observe(row,phase=F.phase(i//10+1),components=F.components(123+i))
        trace=collector.summary()
        self.assertLessEqual(len(T._encode(trace)),20*1024)
        self.assertIsNotNone(T.closed(trace,host_capacity_budget=T.CAP.host_budget(admission())))
        self.assertEqual(trace['phaseCoverage']['observed'],128)
        self.assertEqual(trace['phaseObservations'][0]['phase']['sequence'],1)
        self.assertEqual(trace['phaseObservations'][-1]['phase']['sequence'],128)

    def test_actual_action_entry_uses_policy_unchanged_and_sanitizes_diagnostic_success(self):
        trace=self.trace().summary();budget=T.CAP.host_budget(admission())
        receipt=dict(status='COMPLETED_FULL_END500_HOST_CAPACITY_DIAGNOSTIC_ONLY',mode=HOST_MODE,
            diagnosticOnly=True,hostCapacityBudget=budget,hostCapacityAdmission=T.CAP.host_public_admission(admission()),
            end500CapacityTrace=trace,end500Acceptance=False,mock500Acceptance=False,commonLifetimeMemoryAccepted=False,
            executionAuthority=False,legacyEnd500Accepted=False,legacyRegularMemoryAccepted=False,providerResourceAccepted=False)
        policy={'minimumHostReserveBytes':2*GIB,'swapBytes':0}
        payload={'receipt':receipt,'policy':policy}
        program="""const fs=require('node:fs'),vm=require('node:vm'),m=require('node:module'),p=process.argv[1],v=JSON.parse(fs.readFileSync(0,'utf8'));
const output=[],real=m.createRequire(p),env={W15_MODE:'end500-full-host-capacity-diagnostic',W15_REQUEST:JSON.stringify({nonce:'FICTIONAL',limits:v.policy}),GITHUB_EVENT_PATH:'/FICTIONAL',EXPECTED_COMMIT:'a'.repeat(40),GITHUB_RUN_ID:'123456',GITHUB_RUN_ATTEMPT:'1',HELMUT_W15_RECEIVER_PASSPHRASE:'FICTIONAL_PRIVATE'};
const context={Buffer,process:{env},console:{log:x=>output.push(JSON.parse(x))},require:name=>{
if(name==='node:fs')return {readFileSync:()=>JSON.stringify({inputs:{}})};
if(name==='node:child_process')return {spawnSync:(_cmd,_args,opts)=>{const input=JSON.parse(opts.input);if(JSON.stringify(input.request.limits)!==JSON.stringify(v.policy)||opts.timeout!==3720000)throw Error('binding');return {status:0,stdout:JSON.stringify(v.receipt)};}};
return real(name);}};vm.runInNewContext(fs.readFileSync(p,'utf8'),context,{timeout:2000});process.stdout.write(JSON.stringify({output,exitCode:context.process.exitCode??0}));"""
        result=self.js(payload,program);self.assertEqual(result['exitCode'],0)
        self.assertEqual(result['output'][-1],receipt)
        bad=copy.deepcopy(payload);bad['receipt']['hostCapacityAdmission']['private']='FICTIONAL_PRIVATE'
        result=self.js(bad,program);self.assertEqual(result['exitCode'],1)
        self.assertNotIn('FICTIONAL_PRIVATE',json.dumps(result))


if __name__=='__main__':unittest.main()
