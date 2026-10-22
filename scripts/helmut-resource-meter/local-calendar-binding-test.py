"""Small source-only cross-language calendar contract tests; no authority files."""
import copy, datetime, hashlib, importlib.util, json, subprocess, unittest
from pathlib import Path

BIN=Path(__file__).resolve().parent
s=importlib.util.spec_from_file_location('local_calendar_contract',BIN/'local-calendar-binding.py')
C=importlib.util.module_from_spec(s);s.loader.exec_module(C)

class CalendarBindingTest(unittest.TestCase):
    def setUp(self):
        self.rows=[{'briefingEingabe':{'eingabe':{'eingabeHash':'a'*64}}} for _ in range(500)]
        h=hashlib.sha256(json.dumps(['a'*64]*500,separators=(',',':')).encode()).hexdigest()
        self.policy={'version':C.VERSION,'operationId':'synthetik500-resources18-0123456789ab','sourceDay':'2026-10-18',
            'sourceViewAtUTC':'2026-10-18T08:00:00.000Z','sourceInputsHash':h,'executionDayUTC':'2026-10-18',
            'startsAtUTC':'2026-10-18T20:00:00.000Z','endsAtUTC':'2026-10-18T23:59:59.999Z'}
        self.source={'status':'ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER','day':'2026-10-18','adoptedRowsPin':'rows',
            'startsAtUTC':'2026-10-18T08:00:00.000Z','endsAtUTC':'2026-10-18T16:59:59.999Z',
            'positiveOriginalA':500,'positiveOriginalF':500,'positiveOriginalLAtBothWindowEnds':500}
        self.day={'status':C.STATUS,'day':'2026-10-18','startsAtUTC':self.policy['startsAtUTC'],'endsAtUTC':self.policy['endsAtUTC'],
            'localCalendar':self.policy,'sourceDayAcceptance':'source','adoptedRowsPin':'rows','independentReview':'review',
            'positiveOriginalA':500,'positiveOriginalF':500,'positiveOriginalLAtSourceView':500,'profiles':500,
            'allPositionsReviewed':True,'currentTemporalJudgmentAccepted':True,'rootAdoptsExactIndependentScope':True,
            'realExecutionClockPreserved':True,'freshSecurityChecksPreserved':True}
        self.descriptor={'production':False,'fullContractUnchanged':False,'timingMemoryAndLiveSecurityContractUnchanged':True,'localCalendar':self.policy}
        self.docs={'rows':self.rows,'source':self.source,'review':{'model':'deepseek-v4-pro','route':{'effort':'high'},'payload':{'summary':{'status':'ok'}}}}

    def test_cross_language_admission_rejects_same_tampered_scopes(self):
        items=[]
        def add(mutation=None):
            a=copy.deepcopy({'day':self.day,'descriptor':self.descriptor,'docs':self.docs})
            if mutation:mutation(a)
            try:C.admit(a['day'],a['docs'].__getitem__,descriptor=a['descriptor'],operation=self.policy['operationId'],rows_pin='rows');ok=True
            except (RuntimeError,KeyError,TypeError,ValueError):ok=False
            items.append({**a,'expected':ok})
        add()
        mutations=[lambda a:a['day'].update(positiveOriginalLAtBothWindowEnds=500),
            lambda a:a['day'].update(freshSecurityChecksPreserved=False),
            lambda a:a['day'].update(realExecutionClockPreserved=False),
            lambda a:a['day'].update(positiveOriginalLAtSourceView=499),
            lambda a:a['day'].update(status='ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER'),
            lambda a:a['descriptor'].update(production=True),
            lambda a:a['descriptor'].update(fullContractUnchanged=True),
            lambda a:a['descriptor'].update(timingMemoryAndLiveSecurityContractUnchanged=False),
            lambda a:a['descriptor']['localCalendar'].update(operationId='synthetik500-resources18-ffffffffffff'),
            lambda a:a['docs']['rows'][1]['briefingEingabe']['eingabe'].update(eingabeHash='b'*64),
            lambda a:a['docs']['source'].update(positiveOriginalLAtBothWindowEnds=499),
            lambda a:a['docs']['source'].update(startsAtUTC='2026-10-18T09:00:00.000Z'),
            lambda a:a['docs']['review']['payload']['summary'].update(status='blocked'),
            lambda a:a['day']['localCalendar'].update(endsAtUTC='2026-10-19T00:00:00.000Z')]
        for mutation in mutations:add(mutation)
        self.assertTrue(items[0]['expected']);self.assertTrue(all(not i['expected']for i in items[1:]))
        code="""const fs=require('fs'),assert=require('assert/strict'),C=require('./scripts/helmut-resource-meter/local-calendar-admission');
for(const a of JSON.parse(fs.readFileSync(0,'utf8'))){let ok=false;try{C.admit(a.day,k=>a.docs[k],{descriptor:a.descriptor,operation:'synthetik500-resources18-0123456789ab',rowsPin:'rows'});ok=true;}catch{}assert.equal(ok,a.expected);}console.log('15 cross-language admissions matched');"""
        subprocess.run(['node','-e',code],cwd=BIN.parents[1],input=json.dumps(items),text=True,capture_output=True,check=True)

    def test_real_utc_boundary_stays_closed_and_only_local_berlin_boundary_opens(self):
        now=datetime.datetime(2026,10,18,22,30,tzinfo=C.UTC)
        self.assertTrue(C.current_window(self.day,now=now)[0])
        normal={k:v for k,v in self.day.items()if k!='localCalendar'}
        normal['status']='ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER'
        with self.assertRaises(RuntimeError):C.current_window(normal,now=now)
        for t in [datetime.datetime(2026,10,19,0,0,tzinfo=C.UTC),datetime.datetime(2026,10,17,22,30,tzinfo=C.UTC)]:
            with self.assertRaises(RuntimeError):C.current_window(self.day,now=t)
        self.assertFalse(C.current_window(self.day,now=datetime.datetime(2026,10,18,19,0,tzinfo=C.UTC))[0])

if __name__=='__main__':unittest.main()
