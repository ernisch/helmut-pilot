#!/usr/bin/env python3
"""PID1 for an owned disposable PG17 server; never controls an old container.

Must be launched on a private internal Docker network with its own PGDATA
volume. Cleanly stops only this server and owned PostgREST children after the
application signals normal measurement completion, then records final network
counters. PG itself runs directly on the owned bounded filesystem.
"""
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from network_meter import network,settled_network
from storage_proof import verify as verify_storage

def output(path,value):
    with path.open('x') as f:f.write(json.dumps(value,indent=2)+'\n')
    path.chmod(0o600);os.chown(path,1000,1000)

def main():
    cfg=json.loads(Path(sys.argv[1]).read_text());out=Path('/meter-output')
    if cfg['scope'] not in ['small-meter-validation','owner-approved-local500-resources']:raise RuntimeError('DB scope invalid')
    if cfg.get('freshInitdbVolume') is not True:raise RuntimeError('fresh initial database volume not established')
    pgdata=Path(cfg['pgdata'])
    if pgdata.exists() and any(pgdata.iterdir()):raise RuntimeError('owned initial PGDATA must be empty; no reuse')
    pgdata.mkdir(mode=0o700,exist_ok=True)
    before=network();log=Path('/meter-output/DATABASE_SERVER.PRIVATE.log').open('xb')
    initial_storage=verify_storage(pgdata,cfg['storageReadyPin'])
    # Keep initdb, its temporary bootstrap server and the final server inside
    # THIS already measured PID/network/cgroup lifetime. The unchanged pinned
    # image entrypoint performs initialization once, then execs final postgres.
    command=['/usr/local/bin/docker-entrypoint.sh','postgres']
    child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
    (out/'DB_SUPERVISOR_READY').write_text(str(child.pid)+'\n')
    while child.poll() is None and not Path(cfg['stopFile']).exists():time.sleep(.1)
    # Any PostgREST process in this PRIVATE PID namespace is owned test infra.
    for p in Path('/proc').glob('[0-9]*'):
        try:
            name=(p/'comm').read_text().strip()
            if int(p.name) not in [os.getpid(),child.pid] and name!='postgres':os.kill(int(p.name),signal.SIGTERM)
        except (FileNotFoundError,ProcessLookupError):pass
    # Signal only this postgres process. No host or old-container PID.
    pgpid=pgdata/'postmaster.pid'
    if child.poll() is None and pgpid.exists():os.kill(int(pgpid.read_text().splitlines()[0]),signal.SIGINT)
    code=child.wait(timeout=40);log.close()
    until=time.monotonic()+15
    while True:
        while True:
            try:
                pid,_=os.waitpid(-1,os.WNOHANG)
                if not pid:break
            except ChildProcessError:break
        alive=[]
        for p in Path('/proc').glob('[0-9]*'):
            try:
                if int(p.name)==os.getpid():continue
                if '\nState:\tZ' in '\n'+(p/'status').read_text():continue
                alive.append(int(p.name))
            except (FileNotFoundError,ProcessLookupError):pass
        if not alive:break
        if time.monotonic()>until:raise RuntimeError('owned database helper exit incomplete')
        time.sleep(.05)
    final_storage=verify_storage(pgdata,cfg['storageReadyPin'])
    if initial_storage and final_storage!=initial_storage:raise RuntimeError('bounded filesystem identity changed')
    control=subprocess.run(['pg_controldata',str(pgdata)],env={**os.environ,'LC_ALL':'C'},capture_output=True,text=True,check=True)
    fields={line.split(':',1)[0].strip():line.split(':',1)[1].strip() for line in control.stdout.splitlines() if ':' in line}
    if fields.get('Database cluster state')!='shut down':raise RuntimeError('normal clean final WAL checkpoint missing')
    checkpoint=fields['Latest checkpoint location']
    a,b=checkpoint.split('/');checkpoint_bytes=(int(a,16)<<32)+int(b,16)
    segment=int(fields['Bytes per WAL segment'])
    if segment<1024*1024:raise RuntimeError('unexpected WAL segment size')
    # A clean shutdown's final record is its checkpoint. One additional whole
    # segment safely covers that fixed small record, headers and alignment,
    # including a checkpoint crossing a segment boundary. No exact tail claim.
    final_wal_upper=((checkpoint_bytes//segment)+2)*segment
    result={'schema':'helmut-isolated-database-final/1','scope':cfg['scope'],
            'serverExitCode':code,'storageBound':final_storage,'networkBefore':before,
            'freshInitdbVolume':True,
            'initializationAndServerInSameMeasuredNamespace':True,
            'networkAfterServerAndClientsExited':network(),'networkTail':settled_network(),
            'logBytes':(out/'DATABASE_SERVER.PRIVATE.log').stat().st_size,
            'onlyOwnedPrivatePIDNamespace':True,'allocationMeasurementMethod':'kernel-enforced-exclusive-block-device-upper',
            'cleanShutdownCheckpointLSN':checkpoint,'walSegmentBytes':segment,
            'endOfWALUpperLSNBytes':str(final_wal_upper),
            'shutdownWALIsBoundedByActualControlStateNotAnUnmeasuredZero':True,
            'noSQLPayloadOrPathsInFileTrace':True,'kernelFullInfrastructureExitStillPending':True}
    output(Path(cfg['finalFile']),result)
    return 0 if code==0 and final_storage else 1

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as error:
        path=Path('/meter-output/DATABASE_FINAL.SAFE.json')
        if not path.exists():
            output(path,{'schema':'helmut-isolated-database-final/1','serverExitCode':1,
                         'fileAllocation':{'complete':False},'failure':type(error).__name__,
                         'normalFinalNetworkAndWALNotConfirmed':True})
        raise
