"""Immutable SSH bootstrap: deploy one reviewed public module from green main.

This is trusted root code deployment, not a Python sandbox. SSH authenticates a
separate restricted account. The approved repository/main and its mandatory CI
are the deployment trust boundary. No caller-selected URL, path or argv exists.
"""
import hashlib
import json
import os
import re
import stat
import sys
import time
import urllib.request

BASE='/opt/helmut-native-test/automation-20261026'
REPO='ernisch/helmut-pilot'
PLAN='e6d463a634925a190d60d066c0fae2ba94b9f7f0a10a115b50b4f4018b1b35eb'
MODULE='scripts/hetzner-native-automation-server.py'
CHECKS=('Syntax + Offline-Suiten','Browser-/Mobile-Smoke (Chromium)')
BOUNDARY_STEP='Native automation boundary qualification (synthetic)'
OPERATIONS=('status','recipient','stage','admit','four-tx')
HEX=re.compile(r'[0-9a-f]{64}\Z')
RFLAGS=os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME|os.O_CLOEXEC
STATE={'phase':'entry','nonce':None,'trusted':False}

class Stop(Exception):
    def __init__(self,code):self.code=code

def need(value,code):
    if not value:raise Stop(code)

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode('ascii')

def trusted_dir(path):
    fd=os.open('/',RFLAGS|os.O_DIRECTORY)
    try:
        for part in path.strip('/').split('/'):
            child=os.open(part,RFLAGS|os.O_DIRECTORY,dir_fd=fd)
            os.close(fd);fd=child;s=os.fstat(fd)
            need(s.st_uid==s.st_gid==0 and not stat.S_IMODE(s.st_mode)&0o022,'UNTRUSTED_DIRECTORY')
        return fd
    except BaseException:os.close(fd);raise

def read_file(path,limit):
    fd=os.open(path,RFLAGS)
    try:
        before=os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0
             and before.st_nlink==1 and not stat.S_IMODE(before.st_mode)&0o077,'UNTRUSTED_FILE')
        with os.fdopen(os.dup(fd),'rb') as stream:data=stream.read(limit+1)
        need(len(data)<=limit and before==os.fstat(fd),'FILE_CHANGED_OR_TOO_LARGE')
        return data
    finally:os.close(fd)

def write_once(path,data):
    need(len(data)<=262144,'OUTPUT_LIMIT')
    parent=trusted_dir(os.path.dirname(path))
    try:
        fd=os.open(os.path.basename(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o600,dir_fd=parent)
        try:
            offset=0
            while offset<len(data):
                count=os.write(fd,data[offset:]);need(count>0,'SHORT_WRITE');offset+=count
            os.fsync(fd)
        finally:os.close(fd)
        os.fsync(parent)
    finally:os.close(parent)

def get(url,limit=1048576):
    need(url.startswith('https://api.github.com/repos/'+REPO+'/') or
         url.startswith('https://raw.githubusercontent.com/'+REPO+'/'),'UNAPPROVED_SOURCE')
    request=urllib.request.Request(url,headers={'User-Agent':'helmut-native-root-bootstrap-v1',
                                               'Accept':'application/vnd.github+json'})
    remaining=STATE.get('deadline',time.monotonic()+20)-time.monotonic()
    need(remaining>0,'CONTROL_DEADLINE')
    with urllib.request.urlopen(request,timeout=min(20,remaining)) as response:
        need(response.geturl()==url,'SOURCE_REDIRECT')
        data=response.read(limit+1)
    need(len(data)<=limit,'SOURCE_SIZE_LIMIT')
    return data

def api(path):return json.loads(get('https://api.github.com/repos/'+REPO+'/'+path))

def main_commit():
    value=api('git/ref/heads/main')['object']
    need(value.get('type')=='commit' and re.fullmatch('[0-9a-f]{40}',value.get('sha','')),'MAIN_IDENTITY')
    return value['sha']

def qualify_ci(commit):
    data=api('commits/'+commit+'/check-runs?per_page=100')
    need(type(data.get('check_runs')) is list and data.get('total_count',101)<=100,'CI_LIST_UNPROVEN')
    selected={};run_cache={}
    for name in CHECKS:
        candidates=[row for row in data['check_runs'] if row.get('name')==name
                    and row.get('app',{}).get('id')==15368 and row.get('app',{}).get('slug')=='github-actions']
        need(bool(candidates),'REQUIRED_CHECK_MISSING')
        row=max(candidates,key=lambda item:item['id'])
        need(row.get('head_sha')==commit and row.get('status')=='completed'
             and row.get('conclusion')=='success','REQUIRED_CHECK_NOT_GREEN')
        match=re.fullmatch('https://github.com/'+REPO+r'/actions/runs/([0-9]+)/job/([0-9]+)',row.get('details_url',''))
        need(match is not None,'CI_RUN_IDENTITY')
        run_id=match[1]
        if run_id not in run_cache:run_cache[run_id]=api('actions/runs/'+run_id)
        run=run_cache[run_id]
        need(run.get('head_sha')==commit and run.get('head_branch')=='main'
             and run.get('path')=='.github/workflows/ci.yml' and run.get('event')=='push'
             and run.get('status')=='completed' and run.get('conclusion')=='success'
             and run.get('repository',{}).get('full_name')==REPO,'UNTRUSTED_CI_WORKFLOW')
        need(row.get('check_suite',{}).get('id')==run.get('check_suite_id')
             and type(run.get('check_suite_id')) is int,'CI_SUITE_BINDING')
        job=api('actions/jobs/'+match[2])
        need(job.get('id')==int(match[2]) and job.get('run_id')==int(run_id)
             and job.get('head_sha')==commit and job.get('name')==name
             and job.get('status')=='completed' and job.get('conclusion')=='success'
             and job.get('check_run_url')=='https://api.github.com/repos/'+REPO+'/check-runs/'+str(row['id']),
             'CI_JOB_CHECK_BINDING')
        if name==CHECKS[0]:
            steps=[step for step in job.get('steps',[]) if step.get('name')==BOUNDARY_STEP]
            need(len(steps)==1 and steps[0].get('status')=='completed'
                 and steps[0].get('conclusion')=='success','NATIVE_BOUNDARY_CHECK_NOT_PASSED')
        selected[name]={'check_id':row['id'],'run_id':int(run_id)}
    return selected

def request(stream):
    raw=stream.readline(8193)
    need(len(raw)<=8192 and raw.endswith(b'\n'),'REQUEST_LIMIT_OR_DELIMITER')
    def unique(pairs):
        result={}
        for key,value in pairs:
            need(key not in result,'DUPLICATE_REQUEST_FIELD');result[key]=value
        return result
    value=json.loads(raw,object_pairs_hook=unique)
    need(type(value) is dict and set(value)=={'schema','operation','nonce','plan_sha256','payload_sha256'},'REQUEST_FIELDS')
    need(value['schema']=='helmut-native-control-request-v1' and value['operation'] in OPERATIONS,'REQUEST_OPERATION')
    need(value['plan_sha256']==PLAN and all(type(value[key]) is str and HEX.fullmatch(value[key])
          for key in ('nonce','payload_sha256')),'REQUEST_BINDING')
    return value

def serve(stream):
    need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0,'ROOT_REQUIRED')
    need(os.environ.get('HELMUT_REQUEST_COMMAND')=='helmut-native-control-v1','SSH_COMMAND_REJECTED')
    STATE['deadline']=time.monotonic()+300
    os.umask(0o077)
    directory=trusted_dir(BASE)
    try:
        need(stat.S_IMODE(os.fstat(directory).st_mode)==0o700,'BASE_MODE')
        STATE['trusted']=True
        policy=json.loads(read_file(BASE+'/POLICY.SAFE.json',16384))
        need(policy['plan_sha256']==PLAN,'POLICY_BINDING')
        boot_fd=os.open('/proc/sys/kernel/random/boot_id',RFLAGS)
        with os.fdopen(boot_fd,'r') as boot:boot_id=boot.read(64).strip()
        need(boot_id==policy['boot_id'],'KERNEL_RUNTIME_CHANGED')
        value=request(stream)
        STATE.update(phase='request',nonce=value['nonce'])
        # A request outcome is never silently retried with the same identity.
        receipt=BASE+'/requests/'+value['nonce']+'.json'
        write_once(receipt,canonical({'request':value,'state':'STARTED','time':int(time.time())})+b'\n')
        STATE['phase']='deployment-ci'
        commit=main_commit();checks=qualify_ci(commit)
        source=get('https://raw.githubusercontent.com/'+REPO+'/'+commit+'/'+MODULE,131072)
        need(hashlib.sha256(source).hexdigest()==value['payload_sha256'],'DEPLOYMENT_SOURCE_HASH')
        need(main_commit()==commit,'MAIN_CHANGED_DURING_QUALIFICATION')
        path=BASE+'/deployments/'+value['payload_sha256']+'.py'
        try:write_once(path,source)
        except FileExistsError:need(read_file(path,131072)==source,'DEPLOYMENT_FILE_CHANGED')
        namespace={'__name__':'qualified_helmut_native_server','__file__':path}
        STATE['phase']='load-qualified-module'
        exec(compile(source,path,'exec'),namespace)
        need(callable(namespace.get('handle')),'SERVER_ABI')
        if value['operation']=='four-tx':
            go=namespace.get('NATIVE_GO_PLAN_SHA256')
            need(go==policy.get('native_go_authority_sha256')==PLAN,'NATIVE_GO_NOT_QUALIFIED')
            # This ledger is deliberately outside every deployment/module version.
            write_once(BASE+'/once/'+PLAN+'.json',canonical({'go':go,'request':value,'state':'CONSUMED_BEFORE_HANDLER'})+b'\n')
        context={'base':BASE,'source_sha256':value['payload_sha256'],'deployment_commit':commit,
                 'ci':checks,'stdin':stream,'once_directory':BASE+'/once','deadline':STATE['deadline']}
        STATE['phase']='handler'
        result=namespace['handle'](value,context)
        need(type(result) is dict and len(canonical(result))<=196608,'SERVER_RESULT_LIMIT')
        response={'schema':'helmut-native-control-response-v1',**{key:value[key] for key in
                  ('operation','nonce','plan_sha256','payload_sha256')},'result':result,
                  'result_sha256':hashlib.sha256(canonical(result)).hexdigest()}
        encoded=canonical(response)+b'\n';need(len(encoded)<=262144,'RESPONSE_LIMIT')
        write_once(BASE+'/results/'+value['nonce']+'.json',encoded)
        return encoded
    finally:os.close(directory)

def main():
    try:
        output=serve(sys.stdin.buffer);sys.stdout.buffer.write(output);return 0
    except Exception as error:
        observed=getattr(error,'code',None)
        code=observed if type(observed) is str and re.fullmatch('[A-Z0-9_]{1,96}',observed) else 'BOOTSTRAP_FAILURE'
        saved=False
        if STATE['trusted'] and type(STATE['nonce']) is str and HEX.fullmatch(STATE['nonce']):
            try:
                held=trusted_dir(BASE)
                try:
                    write_once(BASE+'/results/'+STATE['nonce']+'.FIRST_ERROR.SAFE.json',
                        canonical({'code':code,'phase':STATE['phase'],'exception_type':type(error).__name__,
                                   'errno':getattr(error,'errno',None),'time':int(time.time())})+b'\n')
                    saved=True
                finally:os.close(held)
            except Exception:pass
        # No private exception text or tool output ever enters the SSH response.
        print(json.dumps({'status':'FAIL_KEEP_STATE_NO_RETRY','code':code,'phase':STATE['phase'],
                          'first_error_saved':saved},sort_keys=True));return 1

if __name__=='__main__':raise SystemExit(main())
