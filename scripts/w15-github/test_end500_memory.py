"""Pure AST-selected real guard checks against fictional cgroup files only.

No controller import, Docker invocation, original input or performance run.
These checks prove boundary handling; they cannot accept a real End500 run.
"""
import ast
import datetime
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest

ROOT=Path(__file__).absolute().parents[2]
FORWARD=ROOT/'scripts/synthetik-500-w15-memory-forward.py'
CONTROLLER=ROOT/'scripts/synthetik-500-w15-full500-controller.py'


def selected_module(nodes,scope):
    module=ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[]))
    exec(compile(module,'selected-memory-guard','exec'),scope)


class End500MemoryChecks(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cgroup=Path(self.temp.name)
        self.tree=ast.parse(FORWARD.read_text())
        self.controller=ast.parse(CONTROLLER.read_text())
        self.scope={'ROOT':ROOT,'json':json,'M':SimpleNamespace(),'WORK':self.cgroup,
                    'datetime':datetime,'time':time,'BUDGET':{'minimumCommonHeadroomBytes':67108864}}
        names={'MEMORY','LIMIT','RESERVE','MAXIMUM'}
        assignments=[n for n in self.tree.body if isinstance(n,ast.Assign)and any(
            isinstance(t,ast.Attribute)and isinstance(t.value,ast.Name)and t.value.id=='M'and t.attr in names
            for t in n.targets)]
        self.assertEqual(len(assignments),4)
        selected_module(assignments,self.scope)
        m=self.scope['M']
        self.scope.update({'LIMIT':m.LIMIT,'RESERVE':m.RESERVE,'MAXIMUM':m.MAXIMUM})
        supervisor=next(n for n in self.controller.body if isinstance(n,ast.ClassDef)and n.name=='Supervisor')
        sample=next(n for n in supervisor.body if isinstance(n,ast.FunctionDef)and n.name=='sample')
        selected_module([ast.ClassDef(name='Base',bases=[],keywords=[],body=[sample],decorator_list=[])],self.scope)
        m.Supervisor=self.scope['Base']
        functions=[n for n in self.tree.body if isinstance(n,ast.FunctionDef)and n.name in(
            'end500_memory_assessment','future_mock500_capacity')]
        watch=next(n for n in self.tree.body if isinstance(n,ast.ClassDef)and n.name=='Watch')
        watch_sample=next(n for n in watch.body if isinstance(n,ast.FunctionDef)and n.name=='sample')
        selected_module(functions+[ast.ClassDef(name='Watch',bases=watch.bases,keywords=[],body=[watch_sample],decorator_list=[])],self.scope)
        self.write_sample(1900000000)

    def write_sample(self,peak,cap='2560000000',swap_max='0',swap='0',events=None):
        events=events or {'max':0,'oom':0,'oom_kill':0,'oom_group_kill':0}
        values={'memory.max':cap,'memory.swap.max':swap_max,'memory.swap.current':swap,
                'memory.peak':str(peak),'memory.current':str(peak),
                'memory.events':'\n'.join(k+' '+str(v)for k,v in events.items())}
        for name,value in values.items():
            (self.cgroup/name).write_text(value)

    def sample(self):
        watch=self.scope['Watch'].__new__(self.scope['Watch'])
        watch.cgroup=self.cgroup;watch.stage_name=None;watch.maximum=0
        watch.common_resources=None
        watch.last_component=float('inf');watch.memory_failure=None
        watch.disk_check=lambda:None
        watch.sample()
        return watch

    def test_1800_1900_and_exact2048_allowed(self):
        for peak in (1800000000,1900000000,2048000000):
            with self.subTest(peak=peak):
                self.write_sample(peak)
                watch=self.sample()
                self.assertEqual(watch.maximum,peak)
                self.assertEqual(watch.last['physicalHardCapBytes'],2560000000)
                self.assertEqual(watch.last['physicalReserveBytes'],2560000000-peak)
                self.assertEqual(watch.last['maximumAllowedPeakBytes'],2048000000)
                self.assertIsNone(watch.memory_failure)

    def test_one_byte_above_actual_budget_fails(self):
        self.write_sample(2048000001)
        with self.assertRaises(RuntimeError):self.sample()

    def test_wrong_hard_cap_or_swap_fails(self):
        for values in ({'cap':'2048000000'},{'cap':'max'},{'swap_max':'1'},{'swap':'1'}):
            with self.subTest(values=values):
                self.write_sample(1900000000,**values)
                with self.assertRaises((AssertionError,RuntimeError)):self.sample()

    def test_oom_or_hardcap_events_fail(self):
        for key in ('max','oom','oom_kill','oom_group_kill'):
            events={k:0 for k in ('max','oom','oom_kill','oom_group_kill')};events[key]=1
            self.write_sample(1900000000,events=events)
            with self.assertRaises(RuntimeError):self.sample()

    def test_missing_or_invalid_measurements_fail(self):
        (self.cgroup/'memory.peak').unlink()
        with self.assertRaises(FileNotFoundError):self.sample()
        for peak in ('not-a-number','1.5','-1'):
            self.write_sample(peak)
            with self.assertRaises((ValueError,AssertionError)):self.sample()
        self.write_sample(1900000000,events={'max':0,'oom':0,'oom_kill':0})
        with self.assertRaises(AssertionError):self.sample()

    def test_type_invalid_samples_are_not_accepted(self):
        sample=self.sample().last
        assess=self.scope['end500_memory_assessment']
        for invalid in (None,{},[],{'kernelLifetimePeakBytes':1900000000.0}):
            self.assertFalse(assess(invalid))
        for key in ('kernelLifetimePeakBytes','currentBytes','swapCurrentBytes'):
            for value in (True,'0',-1,float('nan')):
                self.assertFalse(assess({**sample,key:value}))

    def test_projection_above_budget_does_not_reject_actual_end500(self):
        forecast=self.scope['future_mock500_capacity'](1900000000,300000000)
        self.assertFalse(forecast['projectedMeetsBudget'])
        self.assertEqual(forecast['projectedPeakBytes'],2267108864)
        self.assertFalse(forecast['mock500Acceptance'])
        self.assertFalse(forecast['executionAuthority'])
        self.assertTrue(self.scope['end500_memory_assessment'](self.sample().last))
        self.assertIsNone(self.scope['future_mock500_capacity'](None,0)['projectedMeetsBudget'])
        # The controller's statements retain no projection-to-failure gate.
        for node in ast.walk(self.tree):
            if isinstance(node,(ast.Assert,ast.If)):
                self.assertNotIn('projectedAdditionalPhysicalBytes',ast.unparse(node.test))

    def test_docker_flags_follow_end500_hardcap(self):
        creates=[n for n in ast.walk(self.tree)if isinstance(n,ast.Call)and isinstance(n.func,ast.Attribute)
                 and n.func.attr=='docker'and n.args and isinstance(n.args[0],ast.Constant)and n.args[0].value=='create']
        self.assertEqual(len(creates),1)
        flags=[n for n in creates[0].args if isinstance(n,ast.BinOp)and isinstance(n.left,ast.Constant)
               and n.left.value in ('--memory=','--memory-swap=')]
        self.assertEqual(len(flags),2)
        actual=[eval(compile(ast.Expression(n),'selected-docker-flag','eval'),self.scope)for n in flags]
        self.assertEqual(actual,['--memory=2560000000','--memory-swap=2560000000'])

    def test_legacy_v2_and_mock500_default_remain_separate(self):
        old=json.loads((ROOT/'scripts/fixtures/w15-memory-contract.json').read_text())
        self.assertEqual(old,{'version':'helmut-w15-memory-check/2','comparisonBudgetBytes':2048000000,'minimumReservePercent':20})
        names={'MEMORY','LIMIT','RESERVE','MAXIMUM'}
        selected=[n for n in self.controller.body if isinstance(n,ast.Assign)and any(
            isinstance(t,ast.Name)and t.id in names for t in n.targets)]
        scope={'ROOT':ROOT,'json':json}
        selected_module(selected,scope)
        self.assertEqual((scope['LIMIT'],scope['RESERVE'],scope['MAXIMUM']),(2048000000,409600000,1638400000))
        self.assertEqual(self.scope['M'].MEMORY['scope'],'ISOLATED_GITHUB_END500_ONLY')
        self.assertEqual((self.scope['M'].LIMIT,self.scope['M'].RESERVE,self.scope['M'].MAXIMUM),
                         (2560000000,512000000,2048000000))


if __name__=='__main__':unittest.main()
