"""Bind fresh host names to an imported End500 module; never launch anything.

Only public repository entry pins are read. Input-manifest and image bindings
are declarations, not observations. Immutable input/provenance paths and every
existing controller check remain intact. No review or GO can unlock this API.

CLI: --validate-context-only reads at most 1 MiB of context JSON from stdin.
Exit 0 means the binding declarations passed; readiness remains BLOCKED.
"""
import sys
sys.dont_write_bytecode=True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
from types import ModuleType
import uuid

SPEC=importlib.util.spec_from_file_location('w15_context_prepare',Path(__file__).with_name('prepare.py'))
P=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(P)
REPO=Path(__file__).absolute().parents[2]
FORWARD='scripts/synthetik-500-w15-memory-forward.py'
CONTROLLER='scripts/synthetik-500-w15-full500-controller.py'
AUDITOR='scripts/synthetik-500-w15-memory-final-audit.py'
MEMORY='scripts/fixtures/w15-end500-memory-contract.json'
BASE='/tmp/w15-memory-atomic-20261028d'
DATABASE='helmut_w15_memory_atomic_20261028d'
INITIAL_CONTAINER='w15-memory-atomic-20261028d'
REQUIRED_SOURCE_PINS=frozenset((FORWARD,CONTROLLER,AUDITOR,MEMORY,
    'scripts/synthetik-500-w15-memory-forward.js','scripts/synthetik-500-w15-auth-transport-probe.js',
    'scripts/synthetik-500-w15-full500-runtime.js','scripts/fixtures/w15-local-memory-budget.json',
    'scripts/fixtures/w15-atomic-integration-target.json','scripts/fixtures/w15-durable-observations.js',
    'scripts/fixtures/w15-auth-measurement-report.js','scripts/fixtures/w15-owned-process-stop.js',
    'scripts/fixtures/z3-plattform.js','scripts/lokaler-netzschutz.js',
    'supabase/proposals/auth_usage_atomic_local.sql','scripts/auth-usage-split.Dockerfile',
    'scripts/w15-github/controller_context.py','scripts/w15-github/prepare.py','.github/workflows/ci.yml'))
BLOCKED_GATES=('inputPathPort','receptionReceivedPaths','sourceQualification',
    'cachePreparation','freshIndependentReview','separateExplicitGO','accountedCompleteBackup')
RUNTIME={
    'node':{'version':'v24.19.0','bytes':125989464,
            'sha256':'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12'},
    'postgrest':{'version':'12.2.3','bytes':17309560,
                 'sha256':'870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617'},
    'postgresBaseDigest':'sha256:f3bd19c606e442c3d7bdfa8002e03fe260a1023351e0ea4598032022b68dd6e3'}


def require(value):P.require(value,'CONTEXT_INVALID')


def _directory(path):
    require(isinstance(path,str)and path.startswith('/')and path!='/')
    fd=os.open('/',os.O_RDONLY|os.O_DIRECTORY)
    try:
        for part in P.parts(path[1:]):
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            os.close(fd);fd=child
        return fd
    except BaseException:
        os.close(fd);raise


def _source_pin(repo_fd,path,pin):
    parts=P.parts(path)
    require(isinstance(pin,dict)and set(pin)=={'bytes','sha256'}and type(pin['bytes'])is int
      and 0<=pin['bytes']<=16*1024*1024 and isinstance(pin['sha256'],str)and P.SHA.fullmatch(pin['sha256']))
    fd=os.dup(repo_fd)
    try:
        for part in parts[:-1]:
            child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            os.close(fd);fd=child
        child=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)
        os.close(fd);fd=child
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode)and before.st_nlink==1 and before.st_size==pin['bytes'])
        digest=hashlib.sha256();size=0
        while chunk:=os.read(fd,1024*1024):
            size+=len(chunk);require(size<=pin['bytes']);digest.update(chunk)
        after=os.fstat(fd)
        require(size==pin['bytes']and digest.hexdigest()==pin['sha256']
          and (before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_size,after.st_mtime_ns,after.st_ctime_ns))
    finally:os.close(fd)


def _validate(context,repo):
    require(isinstance(context,dict)and set(context)=={'schema','scope','nonce','runId','runAttempt',
      'exactCommit','runnerTemp','hostPaths','uidMap','inputManifestPin','sourcePins','runtimePins',
      'executionAuthority','testStarted'})
    require(context['schema']=='helmut-w15-controller-context/1'
      and context['scope']=='ISOLATED_GITHUB_END500_BINDING_ONLY'
      and context['executionAuthority']is False and context['testStarted']is False)
    nonce=uuid.UUID(context['nonce'])
    require(str(nonce)==context['nonce']and nonce.version==4 and nonce.variant==uuid.RFC_4122)
    require(isinstance(context['runId'],str)and re.fullmatch(r'[1-9][0-9]{4,19}',context['runId'])
      and type(context['runAttempt'])is int and context['runAttempt']==1)
    require(isinstance(context['exactCommit'],str)and P.HEX.fullmatch(context['exactCommit'])
      and P.git_head(repo)==context['exactCommit'])
    uid=context['uidMap']
    require(isinstance(uid,dict)and set(uid)=={'runnerUID','runnerGID','containerUID','containerGID'}
      and all(type(value)is int for value in uid.values())
      and uid=={'runnerUID':os.getuid(),'runnerGID':os.getgid(),'containerUID':1000,'containerGID':1000})
    temp=context['runnerTemp'];fd=_directory(temp)
    name='w15-end500-'+context['runId']+'-'+nonce.hex
    try:
        parent=os.fstat(fd)
        require(parent.st_uid==os.getuid()and stat.S_IMODE(parent.st_mode)&0o022==0)
        try:os.stat(name,dir_fd=fd,follow_symlinks=False)
        except FileNotFoundError:pass
        else:require(False)
    finally:os.close(fd)
    root=temp+'/'+name
    require(context['hostPaths']=={'runRoot':root,'work':root+'/work','prepare':root+'/prepare','cache':root+'/cache'})
    pin=context['inputManifestPin']
    require(isinstance(pin,dict)and set(pin)=={'sha256','fileCount','totalBytes'}
      and isinstance(pin['sha256'],str)and P.SHA.fullmatch(pin['sha256'])
      and type(pin['fileCount'])is int and pin['fileCount']==12
      and type(pin['totalBytes'])is int and pin['totalBytes']==242570240)
    runtime=context['runtimePins']
    require(isinstance(runtime,dict)and set(runtime)==set(RUNTIME)|{'imageId'}
      and all(runtime[key]==expected for key,expected in RUNTIME.items())
      and isinstance(runtime['imageId'],str)and re.fullmatch(r'sha256:[a-f0-9]{64}',runtime['imageId']))
    pins=context['sourcePins']
    require(isinstance(pins,dict)and set(pins)==REQUIRED_SOURCE_PINS)
    fd=_directory(str(repo))
    try:
        for path,pin in pins.items():_source_pin(fd,path,pin)
    finally:os.close(fd)
    memory=P.decode((repo/MEMORY).read_bytes())
    require(memory.get('version')=='helmut-w15-end500-memory-check/3'
      and memory.get('scope')=='ISOLATED_GITHUB_END500_ONLY'
      and all(type(memory.get(k))is int for k in ('comparisonBudgetBytes','requiredReserveBytes',
          'maximumConsumptionBytes','minimumReservePercent','swapBytes'))
      and memory.get('minimumReservePercent')==20 and memory.get('swapBytes')==0
      and memory.get('mock500Acceptance')is False and memory.get('executionAuthority')is False
      and tuple(memory.get(k)for k in ('comparisonBudgetBytes','requiredReserveBytes','maximumConsumptionBytes'))
         ==(2560000000,512000000,2048000000))
    require(P.git_head(repo)==context['exactCommit'])
    return {'status':'BINDING_ONLY_START_BLOCKED','readiness':'BLOCKED',
      'contextSHA256':hashlib.sha256(json.dumps(context,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest(),
      'exactCommit':context['exactCommit'],'runId':context['runId'],'runAttempt':1,
      'verifiedRepositoryEntryPins':len(pins),'declaredInputFiles':12,'declaredInputBytes':242570240,
      'inputManifestObserved':False,'runtimeImageObserved':False,'repositoryCommitContentsVerified':False,
      'completeSourceClosureAccepted':False,
      'hostBindingsApplied':False,'blockedGates':{key:'BLOCKED'for key in BLOCKED_GATES},
      'executionAuthority':False,'testStarted':False,'mock500Acceptance':False}


def validate_context(context,repo=REPO):
    """Validate names, public source pins and declarations; never private inputs."""
    try:return _validate(P.decode(json.dumps(context,allow_nan=False)),Path(repo))
    except (Exception,KeyboardInterrupt):raise P.Rejected('CONTEXT_INVALID_OR_UNAVAILABLE')from None


def apply_context(module,context,repo=REPO):
    """Apply this exact host-global allowlist only. Never call controller methods."""
    try:
        context=P.decode(json.dumps(context,allow_nan=False))
        result=validate_context(context,repo)
        repo=Path(repo)
        require(type(module)is ModuleType and type(module.M)is ModuleType and type(module.AUDIT)is ModuleType)
        require(Path(module.__file__)==repo/FORWARD and Path(module.M.__file__)==repo/CONTROLLER
          and Path(module.AUDIT.__file__)==repo/AUDITOR and module.ROOT==repo and module.M.ROOT==repo)
        require(module.BASE==module.M.BASE==module.AUDIT.BASE==BASE
          and module.DB==module.M.DB==module.AUDIT.DATABASE==DATABASE
          and module.CONTAINER==module.M.CONTAINER==module.AUDIT.CONTAINER==INITIAL_CONTAINER)
        require(all(type(value)is int for value in (module.M.LIMIT,module.M.RESERVE,module.M.MAXIMUM))
          and (module.M.LIMIT,module.M.RESERVE,module.M.MAXIMUM)==(2560000000,512000000,2048000000)
          and module.M.MEMORY==P.decode((repo/MEMORY).read_bytes()))
        paths=context['hostPaths'];container='w15-end500-'+context['runId']+'-'+uuid.UUID(context['nonce']).hex
        forward={'WORK':Path(paths['work']),'PREP':Path(paths['prepare']),'CACHE':Path(paths['cache']),
                 'BASE':BASE,'DB':DATABASE,'CONTAINER':container}
        shared={'WORK':forward['WORK'],'BASE':BASE,'DB':DATABASE,'CONTAINER':container,
                'IMAGE':context['runtimePins']['imageId']}
        audit={'WORK':forward['WORK'],'BASE':BASE,'DATABASE':DATABASE,'CONTAINER':container}
        # Type and module identities were checked before the first mutation.
        # No function replacement, immutable-path rewrite, UID change or RAM override.
        module.__dict__.update(forward);module.M.__dict__.update(shared);module.AUDIT.__dict__.update(audit)
    except (Exception,KeyboardInterrupt):raise P.Rejected('CONTEXT_BINDING_REJECTED')from None
    return {**result,'hostBindingsApplied':True}


def main(argv=None):
    """Validate supplied public declarations; never import or bind a controller."""
    try:
        parser=P.Parser(description=__doc__,allow_abbrev=False)
        parser.add_argument('--validate-context-only',action='store_true',required=True)
        parser.parse_args(argv)
        raw=sys.stdin.buffer.read(1024*1024+1)
        require(0<len(raw)<=1024*1024)
        result=validate_context(P.decode(raw),REPO)
        print(json.dumps(result,separators=(',',':'),allow_nan=False))
        return 0
    except (Exception,KeyboardInterrupt):
        print(json.dumps({'status':'FAIL_CONTEXT_CHECK_START_BLOCKED',
          'reason':'CONTEXT_INVALID_OR_UNAVAILABLE','readiness':'BLOCKED',
          'hostBindingsApplied':False,'executionAuthority':False,'testStarted':False,
          'mock500Acceptance':False},separators=(',',':')))
        return 1


if __name__=='__main__':
    raise SystemExit(main())
