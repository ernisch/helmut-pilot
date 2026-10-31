#!/usr/bin/env python3
"""One small real Docker signal/journal check, no database or workload."""
import datetime,hashlib,importlib.util,json,os,pathlib,posixpath,subprocess,threading,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
WORK=pathlib.Path('/workspace/shared/helmut-w15-ram-sprint-20261028d/signal-proof')
BASE='/tmp/w15-signal-proof-20261028d'
CONTAINER='w15-signal-proof-20261028d'
spec=importlib.util.spec_from_file_location('actual_controller',ROOT/'scripts/synthetik-500-w15-full500-controller.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
M.WORK=WORK;M.BASE=BASE;M.CONTAINER=CONTAINER;M.DB='signal_proof_no_database'
def main():
    assert not WORK.exists(),'signal-proof-once-only'
    os.umask(0o077);WORK.mkdir(mode=0o700);state=WORK/'state';state.mkdir(mode=0o700)
    witness=pathlib.Path('/workspace/shared/helmut-w15-auth-observer-check-20261028/AUTH_MEASUREMENT_CHECK.SAFE.json')
    raw=witness.read_bytes();assert hashlib.sha256(raw).hexdigest()=='ce9c17f64a647220fa26774588f92d5a87f912cd3d40ecfee8e62cd624f983d8'
    data=json.loads(raw);assert data['status']=='PASS_GENUINE_ALL_AUTH_WRITES_TIMED'
    (state/'reused-observations.SAFE.json').write_text(json.dumps({k:data[k]for k in ['mutations','usageSinks','casWrites']}))
    node=pathlib.Path('/workspace/shared/helmut-w15-memory-forward-20261028/diagnostic-run-c/stage/node')
    assert hashlib.sha256(node.read_bytes()).hexdigest()=='bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'
    M.docker('create','--name',CONTAINER,'--pull=never','--network=none','--restart=no','--memory=2048000000','--memory-swap=2048000000',
      '--user','1000:1000','--mount','type=bind,src='+str(node)+',dst='+BASE+'/node,readonly',
      '--mount','type=bind,src='+str(ROOT)+',dst='+BASE+'/app,readonly',
      '--mount','type=bind,src='+str(state)+',dst='+BASE+'/state','--entrypoint',BASE+'/node',M.IMAGE,'-e','setInterval(()=>{},1000)')
    M.docker('start',CONTAINER);info=json.loads(M.docker('inspect',CONTAINER))[0];pid=info['State']['Pid']
    rel=pathlib.Path('/proc/'+str(pid)+'/cgroup').read_text().strip().split('0::')[-1]
    cg=pathlib.Path('/sys/fs/cgroup')/posixpath.normpath('/'+rel.lstrip('/')).lstrip('/');assert info['Id']in str(cg)
    w=M.Supervisor(cg);w.sample();w.thread.start();expected='expected-inner-sigterm-reporting-proof'
    def request():
        try:
            end=time.monotonic()+10
            while not(state/'SIGNAL_READY.SAFE.json').exists()and time.monotonic()<end:time.sleep(.05)
            assert(state/'SIGNAL_READY.SAFE.json').exists(),'signal-proof-ready-timeout'
            w.first_failure(RuntimeError(expected))
        except BaseException as e:w.first_failure(e)
    requester=threading.Thread(target=request);requester.start()
    cmd='umask 077; echo $$ >'+BASE+'/state/run.pid; exec timeout --signal=TERM --kill-after=25s 50s env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HELMUT_SOURCE_MODE=off HELMUT_STORAGE_BACKEND=local '+BASE+'/node --require '+BASE+'/app/scripts/lokaler-netzschutz.js '+BASE+'/app/scripts/synthetik-500-w15-durable-abort-check.js '+BASE+'/state'
    try:w.stage(M.DOCKER+['exec','--user','1000:1000',CONTAINER,'sh','-c',cmd],'run',60)
    except RuntimeError as e:assert str(e)=='full500-stage-failed:run:143',str(e)
    requester.join(timeout=5);w.stop()
    assert w.failure['reason']==expected and w.stop_failure is None
    assert w.last_stage_exit_code==143
    stop=[json.loads(line)for line in(state/'stop-run.SAFE.jsonl').read_text().splitlines()]
    assert [x['status']for x in stop]==['SIGTERM_REQUEST','OWNED_PROCESS_EXIT_CONFIRMED'],stop
    abort=json.loads((state/'SIGNAL_ABORT.SAFE.json').read_text());summary=abort['authTimings']
    assert abort['terminationSignal']=='SIGTERM' and summary['incompleteFullCalls']==summary['incompleteCASWrites']==1
    assert summary['maximumFullCallWallMs']==859.089335 and summary['maximumCASWallMs']==663.495627
    journal=[json.loads(line)for line in(state/'run-observations.SAFE.jsonl').read_text().splitlines()]
    assert [x['sequence']for x in journal]==list(range(len(journal)))
    assert any(x['name']=='termination-received'and x['terminationSignal']=='SIGTERM'for x in journal)
    assert len([x for x in journal if x['name']=='auth-finished'])==8
    for key in ['mutations','casWrites']:
        pending=abort[key][-1]
        assert not any(k in pending for k in ['ackMS','endMS','wallMs','acknowledged'])
    assert any(x['name']=='common-and-node-memory'for x in journal)
    assert all(p.stat().st_mode&0o777==0o600 for p in state.iterdir())
    report={'status':'PASS_REAL_DOCKER_INNER_SIGTERM_AND_DURABLE_AUTH_JOURNAL','controlledExpectedSignalProof':True,
      'newDatabaseCreated':False,'authAPICalls':0,'unitExecutions':0,'profileActivations':0,'providerCalls':0,
      'actualSupervisorUsed':True,'hostDockerClientKilledBeforeInnerReceipt':False,'innerSignal':'SIGTERM',
      'actualDockerStageExitCode':w.last_stage_exit_code,'SIGKILLFallbackUsed':False,'unfinishedFullCalls':1,'unfinishedCASWrites':1,'authTimings':summary,
      'journalEntries':len(journal),'maximumCommonKernelBytes':w.maximum,'retryAllowed':False,
      'sourcePins':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest()for f in ['scripts/fixtures/w15-durable-observations.js','scripts/fixtures/w15-owned-process-stop.js','scripts/synthetik-500-w15-full500-controller.py','scripts/synthetik-500-w15-durable-abort-check.js','scripts/synthetik-500-w15-durable-abort-check.py']}}
    M.save('SIGNAL_PROOF.SAFE.json',report);print(json.dumps(report))
    # Keep evidence/container intact; stop only its verified process-only entrypoint.
    M.docker('stop','--time=2',CONTAINER)
if __name__=='__main__':main()
