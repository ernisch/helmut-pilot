import copy, importlib.util, json, tempfile, threading, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('budget_runtime',Path(__file__).with_name('runtime.py'))
R=importlib.util.module_from_spec(spec);spec.loader.exec_module(R)
BASE=json.loads(Path(__file__).with_name('budget.json').read_text())
D='2026-09-27'
class Response:
 def __init__(self, terminal, stream=False):
  self.body=(('event: response.'+terminal['status']+'\ndata: '+json.dumps({'type':'response.'+terminal['status'],'response':terminal})+'\n\n').encode() if stream else json.dumps(terminal).encode())
 def __enter__(self):return self
 def __exit__(self,*a):pass
 def read(self,*a):return self.body
 def __iter__(self):return iter(self.body.splitlines(keepends=True))
def terminal(status='completed',reason=None):
 return {'id':'mock','object':'response','status':status,'usage':{'input_tokens':100,'input_tokens_details':{'cached_tokens':50},'output_tokens':20},'incomplete_details':{'reason':reason} if reason else None,'output':[]}
class BudgetTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.l=R.Ledger(Path(self.tmp.name)/'ledger.db');self.c=copy.deepcopy(BASE)
 def tearDown(self):self.tmp.cleanup()
 def gate(self,mode='flash-read'):return R.Gate(self.c,self.l,mode,'test-key')
 def test_all_eight_modes_unchanged(self):
  self.assertEqual(len(R.MODES),8)
  for m,(model,effort,sandbox) in R.MODES.items():
   g=self.gate(m);self.assertEqual((g.model,g.effort,g.sandbox),(model,effort,sandbox))
   with self.l.connect() as db:ceiling=db.execute('select ceiling from runs where id=?',(g.run,)).fetchone()[0]
   self.assertEqual(ceiling,R.micro({'flash-high':2,'flash-max':3,'pro-high':4,'pro-max':5}[('flash' if m.startswith('flash') else 'pro')+'-'+effort]))
 def test_daily_cap_exact_inclusive(self):
  run=self.l.new_run(20000000);self.l.seed('old',D,9000000)
  self.l.reserve(run,1000000,self.c,[D])
  with self.assertRaises(R.BudgetError) as cm:self.l.reserve(run,1,self.c,[D])
  self.assertEqual(cm.exception.code,'daily_go_required')
 def test_concurrent_reservations_cannot_overspend(self):
  run=self.l.new_run(20000000);barrier=threading.Barrier(8);out=[]
  def f():
   barrier.wait()
   try:self.l.reserve(run,2000000,self.c,[D]);out.append(True)
   except R.BudgetError:out.append(False)
  ts=[threading.Thread(target=f) for _ in range(8)]
  for t in ts:t.start()
  for t in ts:t.join()
  self.assertEqual(sum(out),5);self.assertEqual(self.l.snapshot(D)['bound_micro_usd'],10000000)
 def test_finished_call_releases_unused_reservation(self):
  run=self.l.new_run(2000000);i=self.l.reserve(run,1000000,self.c,[D,'2026-09-28'])
  self.l.settle(i,1234,[D]);self.assertEqual(self.l.snapshot(D)['bound_micro_usd'],1234)
  self.assertEqual(self.l.snapshot('2026-09-28')['bound_micro_usd'],0)
 def test_unknown_request_survives_process_restart(self):
  run=self.l.new_run(2000000);self.l.reserve(run,1000000,self.c,[D]);new=R.Ledger(self.l.path)
  self.assertEqual(new.snapshot(D)['bound_micro_usd'],1000000)
 def test_utc_crossing_charged_conservatively_both_dates(self):
  run=self.l.new_run(2000000);i=self.l.reserve(run,1000000,self.c,[D,'2026-09-28']);self.l.settle(i,2345,[D,'2026-09-28'])
  self.assertEqual(self.l.snapshot('2026-09-28')['bound_micro_usd'],2345)
 def test_no_default_daily_raise(self):
  self.assertEqual(R.limit(self.c,D),10000000)
  self.c['day_approvals'][D]={'usd':12}
  with self.assertRaises(ValueError):R.limit(self.c,D)
  self.c['day_approvals'][D]['explicit_user_approval']='Betreiber-GO fuer genau diesen UTC-Tag'
  self.assertEqual(R.limit(self.c,D),12000000);self.assertEqual(R.limit(self.c,'2026-09-28'),10000000)
 def test_single_budget_retry_then_stop(self):
  run=self.l.new_run(2000000);self.assertTrue(self.l.retry(run,self.c,'Kostenlimit'));self.assertFalse(self.l.retry(run,self.c,'Tokenlimit'))
 def test_cached_and_reasoning_cost_not_double_counted(self):
  now=R.dt.datetime(2026,9,27,tzinfo=R.dt.timezone.utc)
  u={'input_tokens':5507,'input_tokens_details':{'cached_tokens':0},'output_tokens':3645,'output_tokens_details':{'reasoning_tokens':1555}}
  self.assertEqual(R.cost(self.c,'deepseek-flash',u,now),3014)
 def test_history_seed_idempotent(self):
  self.l.seed('h',D,555);self.l.seed('h',D,555);self.assertEqual(self.l.snapshot(D)['bound_micro_usd'],555)
 def test_success_no_retry_or_extra_model_call(self):
  g=self.gate()
  with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal())) as f:
   body,stream=g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(f.call_count,1);self.assertEqual(json.loads(body)['status'],'completed');self.assertFalse(stream)
  self.assertLess(self.l.snapshot()['bound_micro_usd'],1000)
  self.assertEqual(f.call_args.kwargs['timeout'],R.STREAM_TIMEOUT_SECONDS)
  self.assertEqual(R.STREAM_TIMEOUT_SECONDS,7200)
 def test_token_limit_retries_once_larger_without_partial_output(self):
  g=self.gate();seen=[]
  def fake(req,**kw):
   p=json.loads(req.data);seen.append(p['max_output_tokens'])
   return Response(terminal('incomplete','max_output_tokens') if len(seen)==1 else terminal(),True)
  with patch.object(R.urllib.request,'urlopen',side_effect=fake):body,_=g.execute({'model':g.model,'input':'hello','stream':True})
  self.assertEqual(seen,[131072,262144]);self.assertNotIn(b'response.incomplete',body)
 def test_second_token_limit_has_no_third_call(self):
  g=self.gate()
  with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal('incomplete','max_output_tokens'))) as f:
   with self.assertRaises(R.BudgetError):g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(f.call_count,2)
 def test_day_limit_never_sends_upstream(self):
  self.l.seed('full',R.day(),10000000);g=self.gate()
  with patch.object(R.urllib.request,'urlopen') as f:
   with self.assertRaises(R.BudgetError) as cm:g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(cm.exception.code,'daily_go_required');f.assert_not_called()
 def test_transport_failure_holds_reservation_no_retry(self):
  g=self.gate()
  with patch.object(R.urllib.request,'urlopen',side_effect=OSError('test')) as f:
   with self.assertRaises(R.BudgetError):g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(f.call_count,1);self.assertGreater(self.l.snapshot()['bound_micro_usd'],0)
 def test_missing_usage_holds_reservation(self):
  g=self.gate();t=terminal();t.pop('usage')
  with patch.object(R.urllib.request,'urlopen',return_value=Response(t)):
   with self.assertRaises(R.BudgetError):g.execute({'model':g.model,'input':'hello'})
  self.assertGreater(self.l.snapshot()['bound_micro_usd'],0)
 def test_model_routing_cannot_change(self):
  g=self.gate()
  with patch.object(R.urllib.request,'urlopen') as f:
   with self.assertRaises(R.BudgetError):g.execute({'model':'deepseek-v4-pro','input':'hello'})
  f.assert_not_called()
 def test_per_run_budget_automatically_expands_once(self):
  g=self.gate();self.l.seed('unrelated',R.day(),0)
  with self.l.connect() as db:db.execute('update runs set ceiling=1 where id=?',(g.run,))
  # Use a realistic depleted 2-USD run, not an artificially tiny configured budget.
  with self.l.connect() as db:
   db.execute('update runs set ceiling=2000000 where id=?',(g.run,))
   db.execute('insert into requests values (?,?,?,?,?)',('oldrun',R.day(),g.run,1950000,'spent'))
  with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal())) as f:g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(f.call_count,1)
  with self.l.connect() as db:self.assertEqual(db.execute('select retries from runs where id=?',(g.run,)).fetchone()[0],1)
 def test_status_opens_ledger_without_chmod_or_write(self):
  p=Path(self.l.path);p.chmod(0o400)
  self.assertEqual(R.Ledger(p,read_only=True).snapshot(D)['bound_micro_usd'],0)
  self.assertEqual(p.stat().st_mode & 0o777,0o400)
 def test_daily_cap_blocks_token_retry_without_second_request(self):
  self.l.seed('nearly-full',R.day(),9839000);g=self.gate()
  with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal('incomplete','max_output_tokens'))) as f:
   with self.assertRaises(R.BudgetError) as cm:g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(f.call_count,1);self.assertEqual(cm.exception.code,'daily_go_required')
 def test_reservation_anomaly_freezes_future_processes(self):
  run=self.l.new_run(2000000);ident=self.l.reserve(run,10,self.c,[D])
  with self.assertRaises(R.BudgetError):self.l.settle(ident,11,[D])
  another=R.Ledger(self.l.path)
  with self.assertRaises(R.BudgetError) as cm:another.reserve(run,1,self.c,[D])
  self.assertEqual(cm.exception.code,'ledger_frozen')
 def test_invalid_retry_multiplier_is_rejected(self):
  c=copy.deepcopy(BASE);c['retry_multiplier']=3;p=Path(self.tmp.name)/'config.json';p.write_text(json.dumps(c))
  with self.assertRaises(ValueError):R.config(p)
 def test_doubled_budget_is_exact(self):
  run=self.l.new_run(3000000);self.l.retry(run,self.c,'Tokenlimit')
  with self.l.connect() as db:self.assertEqual(db.execute('select ceiling from runs where id=?',(run,)).fetchone()[0],6000000)
 def test_tariff_windows_match_published_schedule(self):
  for hour,peak in [(0,False),(1,True),(3,True),(4,False),(6,True),(9,True),(10,False)]:
   monday=R.dt.datetime(2026,9,28,hour,tzinfo=R.dt.timezone.utc)
   self.assertEqual(R.rates(self.c,'deepseek-flash',monday)['output'],1.2 if peak else 0.6)
  sunday=R.dt.datetime(2026,9,27,6,tzinfo=R.dt.timezone.utc)
  self.assertEqual(R.rates(self.c,'deepseek-flash',sunday)['output'],0.6)
 def test_plain_text_modality_names_do_not_reserve_full_context(self):
  ordinary={'input':'Documentation mentioning input_image and file_id is just text'}
  image={'input':[{'role':'user','content':[{'type':'input_image','image_url':'https://example.test/img'}]}]}
  self.assertLess(R.estimate(self.c,'deepseek-flash',ordinary,131072),200000)
  self.assertGreater(R.estimate(self.c,'deepseek-flash',image,131072),450000)
if __name__=='__main__':unittest.main()
