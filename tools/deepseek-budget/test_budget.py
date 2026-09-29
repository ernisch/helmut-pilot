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
  # Deterministic off-peak clock (Saturday 12:00 UTC) so provider-path tests never
  # depend on the wall clock; the peak tests below override it explicitly.
  self.clock=patch.object(R,'utcnow',return_value=R.dt.datetime(2026,9,26,12,0,tzinfo=R.dt.timezone.utc))
  self.clock.start();self.addCleanup(self.clock.stop)
 def tearDown(self):self.tmp.cleanup()
 def gate(self,mode='flash-read',peak_go_einmalig=False):return R.Gate(self.c,self.l,mode,'test-key',peak_go_einmalig=peak_go_einmalig)
 def at(self,*moments):
  # Scripted UTC clock: the last moment repeats if read more often than provided.
  seq=list(moments)
  return patch.object(R,'utcnow',side_effect=lambda:seq.pop(0) if len(seq)>1 else seq[0])
 def test_all_eight_modes_unchanged(self):
  self.assertEqual(len(R.MODES),8)
  for m,(model,effort,sandbox) in R.MODES.items():
   g=self.gate(m);self.assertEqual((g.model,g.effort,g.sandbox),(model,effort,sandbox))
   with self.l.connect() as db:ceiling=db.execute('select ceiling from runs where id=?',(g.run,)).fetchone()[0]
   self.assertEqual(ceiling,R.micro({'flash-high':2,'flash-max':3,'pro-high':4,'pro-max':5}[('flash' if m.startswith('flash') else 'pro')+'-'+effort]))
 def test_extension_question_triggers_before_hard_cap(self):
  run=self.l.new_run(20000000);self.l.seed('old',D,17000000)
  with self.assertRaises(R.BudgetError) as cm:self.l.reserve(run,1000000,self.c,[D])
  self.assertEqual(cm.exception.code,'daily_extension_go_required')
  self.assertEqual(self.l.snapshot(D)['bound_micro_usd'],17000000)
 def test_explicit_extension_then_enforces_approved_hard_cap(self):
  self.c['day_approvals'][D]={'usd':25,'explicit_user_approval':'Betreiber-GO fuer genau diesen UTC-Tag'}
  run=self.l.new_run(30000000);self.l.seed('old',D,24000000)
  self.l.reserve(run,1000000,self.c,[D])
  with self.assertRaises(R.BudgetError) as cm:self.l.reserve(run,1,self.c,[D])
  self.assertEqual(cm.exception.code,'daily_go_required')
 def test_concurrent_reservations_stop_at_preapproval_guard(self):
  run=self.l.new_run(30000000);barrier=threading.Barrier(12);out=[]
  def f():
   barrier.wait()
   try:self.l.reserve(run,2000000,self.c,[D]);out.append(True)
   except R.BudgetError as e:out.append(e.code)
  ts=[threading.Thread(target=f) for _ in range(12)]
  for t in ts:t.start()
  for t in ts:t.join()
  self.assertEqual(out.count(True),8);self.assertEqual(self.l.snapshot(D)['bound_micro_usd'],16000000)
  self.assertTrue(all(x is True or x=='daily_extension_go_required' for x in out))
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
  self.assertEqual(R.limit(self.c,D),20000000)
  # Approval without an explicit operator release is never enough.
  self.c['day_approvals'][D]={'usd':30}
  with self.assertRaises(ValueError):R.limit(self.c,D)
  # A preserved approval at or below the new hard default is redundant, not invalid.
  self.c['day_approvals'][D]={'usd':8,'explicit_user_approval':'Betreiber-GO fuer genau diesen UTC-Tag'}
  self.assertEqual(R.limit(self.c,D),20000000)
  # A real, dated operator release above the hard default raises only its own UTC date.
  self.c['day_approvals'][D]={'usd':30,'explicit_user_approval':'Betreiber-GO fuer genau diesen UTC-Tag'}
  self.assertEqual(R.limit(self.c,D),30000000);self.assertEqual(R.limit(self.c,'2026-09-28'),20000000)
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
 def test_preapproval_guard_never_sends_upstream(self):
  self.l.seed('near',R.day(),18000000);g=self.gate()
  with patch.object(R.urllib.request,'urlopen') as f:
   with self.assertRaises(R.BudgetError) as cm:g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(cm.exception.code,'daily_extension_go_required');f.assert_not_called()
 def test_transport_failure_holds_reservation_no_retry(self):
  g=self.gate()
  with patch.object(R.urllib.request,'urlopen',side_effect=OSError('test')) as f:
   with self.assertRaises(R.BudgetError):g.execute({'model':g.model,'input':'hello'})
  snap=self.l.snapshot();self.assertEqual(f.call_count,1);self.assertGreater(snap['bound_micro_usd'],0)
  self.assertGreater(snap['by_state'].get('unknown',0),0);self.assertEqual(snap['by_state'].get('reserved',0),0)
 def test_missing_usage_holds_reservation(self):
  g=self.gate();t=terminal();t.pop('usage')
  with patch.object(R.urllib.request,'urlopen',return_value=Response(t)):
   with self.assertRaises(R.BudgetError):g.execute({'model':g.model,'input':'hello'})
  snap=self.l.snapshot();self.assertGreater(snap['bound_micro_usd'],0)
  self.assertGreater(snap['by_state'].get('unknown',0),0);self.assertEqual(snap['by_state'].get('reserved',0),0)
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
 def test_preapproval_guard_blocks_token_retry_without_second_request(self):
  g=self.gate()
  p1={'model':g.model,'input':'hello','reasoning':{'effort':g.effort},'max_output_tokens':g.output}
  p2={**p1,'max_output_tokens':min(self.c['provider_max_output_tokens'],g.output*2)}
  est1=R.estimate(self.c,g.model,p1,g.output);est2=R.estimate(self.c,g.model,p2,p2['max_output_tokens'])
  prompt=R.micro(self.c['daily_approval_prompt_usd'])
  # First request remains below the prompt threshold; after its tiny confirmed
  # usage, the larger retry reservation would cross the threshold and must stop.
  self.l.seed('nearly-prompt',R.day(),prompt-est2+1)
  with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal('incomplete','max_output_tokens'))) as f:
   with self.assertRaises(R.BudgetError) as cm:g.execute({'model':g.model,'input':'hello'})
  self.assertLess(prompt-est2+1+est1,prompt)
  self.assertEqual(f.call_count,1);self.assertEqual(cm.exception.code,'daily_extension_go_required')
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
 def test_warning_ten_prompt_eighteen_hard_twenty_and_config_rejects_others(self):
  self.assertEqual(self.c['daily_warning_usd'],10);self.assertEqual(self.c['daily_approval_prompt_usd'],18);self.assertEqual(R.limit(self.c,D),20000000)
  p=Path(self.tmp.name)/'old.json'
  for wrong in (5,10,15):
   c=copy.deepcopy(BASE);c['daily_limit_usd']=wrong;p.write_text(json.dumps(c))
   with self.assertRaises(ValueError):R.config(p)
  for wrong in (0,18,20):
   c=copy.deepcopy(BASE);c['daily_warning_usd']=wrong;p.write_text(json.dumps(c))
   with self.assertRaises(ValueError):R.config(p)
  for wrong in (9,10,20):
   c=copy.deepcopy(BASE);c['daily_approval_prompt_usd']=wrong;p.write_text(json.dumps(c))
   with self.assertRaises(ValueError):R.config(p)
 def test_warning_does_not_block_and_status_is_transparent(self):
  self.l.seed('warn',D,10000000);run=self.l.new_run(2000000)
  ident=self.l.reserve(run,1,self.c,[D]);snap=self.l.snapshot(D,c=self.c)
  self.assertTrue(snap['warning_reached']);self.assertEqual(snap['confirmed_micro_usd'],10000000)
  self.assertEqual(snap['reserved_micro_usd'],1);self.assertEqual(snap['unknown_micro_usd'],0)
  self.assertEqual(snap['available_to_warning_micro_usd'],0)
  self.assertEqual(snap['available_to_approval_prompt_micro_usd'],7999999)
  self.assertEqual(snap['available_to_hard_limit_micro_usd'],9999999)
  self.assertFalse(snap['approval_prompt_reached'])
  self.l.release(ident)
 def test_run_caps_and_extension_unchanged(self):
  self.assertEqual(self.c['budgets_usd'],{'flash-high':2,'flash-max':3,'pro-high':4,'pro-max':5})
  self.assertEqual(self.c['retry_multiplier'],2);self.assertEqual(self.c['max_retries'],1)
  self.assertEqual(self.c['output_tokens'],{'high':131072,'max':196608})
  cfg=R.config(Path(__file__).with_name('budget.json'))
  self.assertEqual(cfg['daily_warning_usd'],10);self.assertEqual(cfg['daily_approval_prompt_usd'],18);self.assertEqual(cfg['daily_limit_usd'],20)
 def test_peak_windows_and_weekend_exact(self):
  monday=R.dt.datetime(2026,9,28,tzinfo=R.dt.timezone.utc)
  expected={0:False,1:True,2:True,3:True,4:False,5:False,6:True,7:True,9:True,10:False,23:False}
  for hour,flag in expected.items():self.assertEqual(R.peak(monday.replace(hour=hour)),flag,hour)
  self.assertTrue(R.peak(R.dt.datetime(2026,9,28,1,0)))
  self.assertFalse(R.peak(R.dt.datetime(2026,9,28,4,0)))
  self.assertFalse(R.peak(R.dt.datetime(2026,9,28,10,0)))
  for weekend in (R.dt.datetime(2026,9,26,2),R.dt.datetime(2026,9,27,7)):
   self.assertFalse(R.peak(weekend))
 def test_peak_tariff_and_block_share_one_window(self):
  for hour in range(24):
   monday=R.dt.datetime(2026,9,28,hour,tzinfo=R.dt.timezone.utc)
   self.assertEqual(R.rates(self.c,'deepseek-flash',monday)['output']==1.2,R.peak(monday),hour)
 def test_peak_block_before_reservation_never_contacts_provider(self):
  g=self.gate()
  with self.at(R.dt.datetime(2026,9,28,2,tzinfo=R.dt.timezone.utc)):
   with patch.object(R.urllib.request,'urlopen') as f:
    with self.assertRaises(R.BudgetError) as cm:g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(cm.exception.code,'peak_blocked');self.assertNotEqual(cm.exception.code,'daily_go_required')
  f.assert_not_called();self.assertEqual(self.l.snapshot()['bound_micro_usd'],0)
 def test_peak_go_einmalig_allows_exact_gate_only(self):
  peak=R.dt.datetime(2026,9,28,2,tzinfo=R.dt.timezone.utc)
  g=self.gate(peak_go_einmalig=True)
  with self.at(peak,peak,peak):
   with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal())) as f:
    body,_=g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(f.call_count,1);self.assertEqual(json.loads(body)['status'],'completed')
  self.assertGreater(self.l.snapshot()['bound_micro_usd'],0)
  # A fresh gate has no inherited exception and must block at the same peak time.
  g2=self.gate()
  with self.at(peak):
   with patch.object(R.urllib.request,'urlopen') as f:
    with self.assertRaises(R.BudgetError) as cm:g2.execute({'model':g2.model,'input':'hello'})
  self.assertEqual(cm.exception.code,'peak_blocked');f.assert_not_called()
 def test_peak_go_einmalig_keeps_peak_pricing(self):
  peak=R.dt.datetime(2026,9,28,2,tzinfo=R.dt.timezone.utc)
  g=self.gate(peak_go_einmalig=True)
  with self.at(peak,peak,peak):
   with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal())):
    g.execute({'model':g.model,'input':'hello'})
  snap=self.l.snapshot()
  expected=R.cost(self.c,g.model,terminal()['usage'],peak)
  self.assertEqual(snap['by_state'].get('spent'),expected)
 def test_entry_into_peak_after_reservation_releases_and_skips_provider(self):
  g=self.gate();off=R.dt.datetime(2026,9,28,0,30,tzinfo=R.dt.timezone.utc);on=R.dt.datetime(2026,9,28,1,5,tzinfo=R.dt.timezone.utc)
  with self.at(off,on):
   with patch.object(R.urllib.request,'urlopen') as f:
    with self.assertRaises(R.BudgetError) as cm:g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(cm.exception.code,'peak_blocked');f.assert_not_called();self.assertEqual(self.l.snapshot()['bound_micro_usd'],0)
 def test_retry_recheck_blocks_when_peak_begins(self):
  g=self.gate();off=R.dt.datetime(2026,9,28,0,30,tzinfo=R.dt.timezone.utc);peak=R.dt.datetime(2026,9,28,1,5,tzinfo=R.dt.timezone.utc)
  with self.at(off,off,off,peak):
   with patch.object(R.urllib.request,'urlopen',return_value=Response(terminal('incomplete','max_output_tokens'))) as f:
    with self.assertRaises(R.BudgetError) as cm:g.execute({'model':g.model,'input':'hello'})
  self.assertEqual(cm.exception.code,'peak_blocked');self.assertEqual(f.call_count,1)
 def test_peak_has_its_own_exit_code(self):
  self.assertEqual(R.exit_code(R.BudgetError('peak_blocked','x')),R.PEAK_EXIT_CODE)
  self.assertEqual(R.exit_code(R.BudgetError('daily_go_required','x')),78)
  self.assertEqual(R.exit_code(R.BudgetError('daily_extension_go_required','x')),80)
  self.assertEqual(R.exit_code(R.BudgetError('run_budget','x')),1)
  self.assertNotEqual(R.PEAK_EXIT_CODE,78);self.assertNotEqual(R.EXTENSION_GO_EXIT_CODE,78)
if __name__=='__main__':unittest.main()
