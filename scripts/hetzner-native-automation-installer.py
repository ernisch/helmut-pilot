"""One admin setup only. Embedded code is public, reviewed and hash-pinned.

BOOTSTRAP_SOURCE, SERVER_SOURCE and PRECHECK_SOURCE are embedded by the builder.
Never create/transfer an SSH private key. Reuse only the existing target CI key.
"""
import base64
import contextlib
import hashlib
import io
import json
import os
import pwd
import re
import selectors
import shlex
import signal
import stat
import subprocess
import sys
import time

BASE='/opt/helmut-native-test/automation-20261026'
KEY_SOURCE='/etc/helmut-ci/authorized_keys'
GATE='/usr/local/libexec/helmut-ci-bridge.py'
RFLAGS=os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME|os.O_CLOEXEC
PHASE='preflight';CREATED=False;FIRST_TOOL=None;PRECHECK_REPORT=None
KEY_WRITE_ATTEMPTED=False;KEY_WRITE_VERIFIED=False
SSH_ARGS=['-T','-C','user=root,host=localhost,addr=100.64.0.1,laddr=100.96.83.66,lport=22']
S={'__name__':'qualified_server_installer_definitions'}
B={'__name__':'qualified_bootstrap_installer_definitions'}
P={'__name__':'qualified_precheck_installer_definitions'}
exec(compile(BOOTSTRAP_SOURCE,'<bound-root-bootstrap>','exec'),B)
exec(compile(SERVER_SOURCE,'<bound-recipient-server>','exec'),S)
exec(compile(PRECHECK_SOURCE,'<bound-readonly-precheck>','exec'),P)

def need(value,code):
    if not value:raise B['Stop'](code)

def read(path,limit=65536):
    parent=B['trusted_dir'](os.path.dirname(path))
    try:
        fd=os.open(os.path.basename(path),RFLAGS,dir_fd=parent)
        try:
            before=os.fstat(fd)
            need(stat.S_ISREG(before.st_mode) and before.st_uid==before.st_gid==0
                 and before.st_nlink==1 and not stat.S_IMODE(before.st_mode)&0o022,'UNTRUSTED_EXISTING_FILE')
            need(not os.listxattr(fd),'EXISTING_FILE_XATTR_UNQUALIFIED')
            with os.fdopen(os.dup(fd),'rb') as source:data=source.read(limit+1)
            need(len(data)<=limit and before==os.fstat(fd),'EXISTING_FILE_CHANGED_OR_LIMIT')
            return data,before
        finally:os.close(fd)
    finally:os.close(parent)

def tool(path,args,timeout=20):
    global FIRST_TOOL
    need((path=='/usr/sbin/sshd' and args==SSH_ARGS) or
         (path=='/usr/bin/gpg' and args==['--no-options','--version']),'INSTALLER_TOOL_NOT_ALLOWED')
    process=subprocess.Popen([path,*args],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
        env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C'},start_new_session=True)
    buffers=[bytearray(),bytearray()];selector=selectors.DefaultSelector();end=time.monotonic()+timeout
    try:
        for index,pipe in enumerate((process.stdout,process.stderr)):
            os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ,index)
        while selector.get_map():
            need(time.monotonic()<end,'INSTALLER_TOOL_TIMEOUT')
            for key,_ in selector.select(min(.2,max(0,end-time.monotonic()))):
                block=os.read(key.fileobj.fileno(),4096)
                if not block:selector.unregister(key.fileobj);continue
                buffers[key.data].extend(block);need(len(buffers[key.data])<=65536,'INSTALLER_TOOL_OUTPUT_LIMIT')
        code=process.wait(timeout=max(.01,end-time.monotonic()))
        need(code==0,'INSTALLER_TOOL_NONZERO')
        return bytes(buffers[0])
    except BaseException:
        FIRST_TOOL={'path':path,'stdout_sha256':hashlib.sha256(buffers[0]).hexdigest(),
                    'stderr_sha256':hashlib.sha256(buffers[1]).hexdigest(),
                    'stderr_prefix_base64':base64.b64encode(bytes(buffers[1][:8192])).decode('ascii')}
        try:os.killpg(process.pid,signal.SIGKILL)
        except OSError:pass
        try:process.wait(timeout=5)
        except Exception:pass
        raise
    finally:
        selector.close()
        process.stdout.close();process.stderr.close()

def public_ci_key(raw):
    try:text=raw.decode('ascii')
    except UnicodeError:raise B['Stop']('CI_PUBLIC_KEY_FORMAT') from None
    pattern=r'from="100\.64\.0\.0/10",restrict,command="/usr/bin/python3 -I /usr/local/libexec/helmut-ci-bridge\.py gate" (ssh-ed25519) ([A-Za-z0-9+/]+={0,2})\n?'
    match=re.fullmatch(pattern,text)
    need(match is not None,'CI_PUBLIC_KEY_FORMAT')
    blob=base64.b64decode(match[2],validate=True)
    need(len(blob)==51 and blob[:19]==b'\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20','CI_PUBLIC_KEY_TYPE')
    return match[1]+' '+match[2]

def authorized_paths(effective,home):
    settings={}
    for line in effective.decode('utf-8','strict').splitlines():
        key,_,value=line.partition(' ')
        settings.setdefault(key,[]).append(value)
    def one(key):
        need(len(settings.get(key,[]))==1,'SSH_SETTING_UNPROVEN')
        return settings[key][0]
    need(one('pubkeyauthentication')=='yes' and one('permitrootlogin') in ('yes','without-password','prohibit-password','forced-commands-only')
         and one('forcecommand')=='none' and one('permituserenvironment')=='no'
         and one('authorizedkeyscommand')=='none' and one('trustedusercakeys')=='none','ROOT_SSH_POLICY_UNQUALIFIED')
    for entry in settings.get('acceptenv',[]):
        need(all(item in ('LANG','LANGUAGE','LC_*') for item in entry.split()),'SSH_ACCEPTENV_UNQUALIFIED')
    paths=[]
    for token in one('authorizedkeysfile').split():
        if token=='none':continue
        value=token.replace('%%','\x00').replace('%h',home).replace('%u','root').replace('%U','0').replace('\x00','%')
        need('%' not in value,'SSH_AUTHORIZED_PATH_UNSUPPORTED')
        path=value if value.startswith('/') else home+'/'+value
        need(os.path.normpath(path)==path,'SSH_AUTHORIZED_PATH_UNSAFE')
        paths.append(path)
    need(bool(paths) and len(paths)<=4 and len(set(paths))==len(paths),'SSH_AUTHORIZED_PATHS_UNPROVEN')
    return paths

def append_key(target,before,metadata,public):
    global KEY_WRITE_ATTEMPTED,KEY_WRITE_VERIFIED
    forced='/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C HELMUT_REQUEST_COMMAND="$SSH_ORIGINAL_COMMAND" /usr/bin/python3 -I -S -B '+BASE+'/bootstrap.py'
    escaped=forced.replace('\\','\\\\').replace('"','\\"')
    line=('from="100.64.0.0/10",restrict,command="'+escaped+'" '+public+'\n').encode('ascii')
    content=before+(b'' if before.endswith(b'\n') else b'\n')+line
    current,now=read(target)
    need(current==before and now==metadata,'ROOT_AUTHORIZED_KEYS_CHANGED')
    parent=B['trusted_dir'](os.path.dirname(target))
    temporary='.helmut-native-authorized-keys-once'
    try:
        fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,stat.S_IMODE(metadata.st_mode),dir_fd=parent)
        try:
            os.fchmod(fd,stat.S_IMODE(metadata.st_mode))
            offset=0
            while offset<len(content):
                count=os.write(fd,content[offset:]);need(count>0,'AUTH_KEY_SHORT_WRITE');offset+=count
            os.fsync(fd)
            need(os.fstat(fd).st_uid==os.fstat(fd).st_gid==0,'ROOT_AUTH_NEW_OWNER')
            # Atomic replacement is the only authorized existing-file change.
            need(os.stat(os.path.basename(target),dir_fd=parent,follow_symlinks=False)==metadata,'ROOT_AUTH_REPLACED')
            KEY_WRITE_ATTEMPTED=True
            os.rename(temporary,os.path.basename(target),src_dir_fd=parent,dst_dir_fd=parent)
            os.fsync(parent)
        finally:os.close(fd)
    finally:os.close(parent)
    actual,_=read(target)
    need(actual==content and actual.startswith(before),'ROOT_AUTHORIZED_KEYS_WRITE_UNCONFIRMED')
    KEY_WRITE_VERIFIED=True
    return {'path':target,'before_sha256':hashlib.sha256(before).hexdigest(),
            'after_sha256':hashlib.sha256(actual).hexdigest(),'added_entries':1}

def main():
    global PHASE,CREATED,PRECHECK_REPORT
    try:
        need(os.getuid()==os.geteuid()==os.getgid()==os.getegid()==0,'ROOT_REQUIRED')
        os.umask(0o077)
        need(not os.path.lexists(BASE),'SETUP_ALREADY_EXISTS_NO_RETRY')
        parent=B['trusted_dir'](os.path.dirname(BASE));os.close(parent)
        with contextlib.redirect_stdout(io.StringIO()) as output:status=P['main'](['--all-existing-docker28-checks-readonly'])
        report=json.loads(output.getvalue())
        PRECHECK_REPORT=report
        need(status==0 and report['summary']['FAIL']==report['summary']['BLOCKED']==0,'READONLY_ADMISSION_FAILED')
        need(report['checks']['freeCapacity']['actual']['freeBytes']>=12*1024**3,'FREE_CAPACITY')
        PHASE='root-ssh-policy'
        account=pwd.getpwnam('root');need(account.pw_uid==account.pw_gid==0,'ROOT_ACCOUNT_IDENTITY')
        source,key_meta=read(KEY_SOURCE);public=public_ci_key(source)
        gate,gate_meta=read(GATE,131072)
        need(hashlib.sha256(gate).hexdigest()=='85111232a240a41d43622a2ad188f74232ca04b6dd5458da0871c254977d69d9','PROBE_GATE_SOURCE_DRIFT')
        ssh_effective=tool('/usr/sbin/sshd',SSH_ARGS)
        paths=authorized_paths(ssh_effective,account.pw_dir)
        gpg_version=tool('/usr/bin/gpg',['--no-options','--version']).decode('ascii','strict')
        need(re.match(r'gpg \(GnuPG\) 2\.(2|4)\.[0-9]+',gpg_version) is not None
             and 'EDDSA' in gpg_version and 'ECDH' in gpg_version,'GPG_VERSION_OR_ALGORITHMS_UNQUALIFIED')
        existing={}
        for path in paths:
            if os.path.lexists(path):
                raw,metadata=read(path)
                need(public.split()[1].encode('ascii') not in raw,'CI_KEY_ALREADY_ACCEPTED_FOR_ROOT')
                existing[path]=(raw,metadata)
        need(bool(existing),'NO_EXISTING_ROOT_AUTH_FILE')
        selected=next(path for path in paths if path in existing)
        PHASE='green-public-deployment'
        B['STATE']['deadline']=time.monotonic()+300
        commit=B['main_commit']();ci=B['qualify_ci'](commit)
        deployed=B['get']('https://raw.githubusercontent.com/ernisch/helmut-pilot/'+commit+'/'+B['MODULE'],131072)
        need(deployed==SERVER_SOURCE and B['main_commit']()==commit,'QUALIFIED_MAIN_SOURCE_CHANGED')
        # All preconditions above precede any installation or authorization change.
        PHASE='create-own-context'
        os.mkdir(BASE,0o700);CREATED=True
        for name in ('requests','results','deployments','once'):os.mkdir(BASE+'/'+name,0o700)
        boot=P['M']['kernel']('/proc/sys/kernel/random/boot_id').strip()
        policy={'plan_sha256':B['PLAN'],'native_go_authority_sha256':B['PLAN'],'boot_id':boot,
                'root_deployment_trust':'ernisch/helmut-pilot/main, exact successful mandatory CI and independent source review',
                'initial_main_commit':commit,'initial_server_sha256':hashlib.sha256(SERVER_SOURCE).hexdigest(),
                'native_profile_enabled_at_install':False,'private_mac_key_transferred':False}
        B['write_once'](BASE+'/POLICY.SAFE.json',B['canonical'](policy)+b'\n')
        B['write_once'](BASE+'/bootstrap.py',BOOTSTRAP_SOURCE)
        B['write_once'](BASE+'/ROOT_AUTHORIZED_KEYS_BEFORE.PRIVATE',existing[selected][0])
        B['write_once'](BASE+'/ROOT_AUTHORIZED_KEYS_BEFORE_METADATA.SAFE.json',B['canonical']({
            'path':selected,'dev':existing[selected][1].st_dev,'ino':existing[selected][1].st_ino,
            'mode':existing[selected][1].st_mode,'uid':0,'gid':0,
            'atime_ns':existing[selected][1].st_atime_ns,'mtime_ns':existing[selected][1].st_mtime_ns,
            'ctime_ns':existing[selected][1].st_ctime_ns})+b'\n')
        PHASE='install-bounded-root-authorization'
        need(tool('/usr/sbin/sshd',SSH_ARGS)==ssh_effective,'ROOT_SSH_EFFECTIVE_POLICY_CHANGED')
        for path in paths:
            if path not in existing:need(not os.path.lexists(path),'ROOT_AUTH_FILE_APPEARED')
        auth=append_key(selected,*existing[selected],public)
        PHASE='create-target-only-recipient'
        recipient=S['handle']({'operation':'recipient'},{'base':BASE,'source_sha256':hashlib.sha256(SERVER_SOURCE).hexdigest(),
            'deadline':time.monotonic()+240,'stdin':io.BytesIO()})
        PHASE='postcheck'
        after,after_meta=read(KEY_SOURCE);after_gate,after_gate_meta=read(GATE,131072)
        need(after==source and after_meta==key_meta and after_gate==gate and after_gate_meta==gate_meta,'EXISTING_PROBE_CHANGED')
        need(tool('/usr/sbin/sshd',SSH_ARGS)==ssh_effective,'ROOT_SSH_EFFECTIVE_POLICY_CHANGED')
        for path in paths:
            if path not in existing:need(not os.path.lexists(path),'ROOT_AUTH_FILE_APPEARED')
        for path,(raw,metadata) in existing.items():
            if path!=selected:
                current,current_meta=read(path);need(current==raw and current_meta==metadata,'OTHER_ROOT_AUTH_CHANGED')
        free=os.statvfs(BASE);free_bytes=free.f_bavail*free.f_frsize
        result={'status':'BOUNDED_AUTOMATION_INSTALLED_RECIPIENT_READY','authorization':auth,'recipient':recipient['recipient'],
                'main_commit':commit,'server_sha256':hashlib.sha256(SERVER_SOURCE).hexdigest(),
                'bootstrap_sha256':hashlib.sha256(BOOTSTRAP_SOURCE).hexdigest(),'free_bytes':free_bytes,
                'existing_probe_unchanged':True,'native_started':False,'native_go_consumed':False,
                'originals_transferred':False,'root_account_created':False,'sshd_config_changed':False,
                'trust_boundary':'CI-gated root deployment from reviewed main; not an execution sandbox'}
        B['write_once'](BASE+'/INSTALLATION_RESULT.SAFE.json',B['canonical'](result)+b'\n')
        public_result=dict(result,recipient={key:result['recipient'][key] for key in ('fingerprint','public_sha256')})
        print(json.dumps(public_result,sort_keys=True));return 0
    except Exception as error:
        observed=getattr(error,'code',None)
        code=observed if type(observed) is str and re.fullmatch('[A-Z0-9_]{1,96}',observed) else 'INSTALLER_FAILURE'
        result={'status':'FAIL_KEEP_STATE_NO_RETRY','phase':PHASE,'code':code,'exception_type':type(error).__name__,
                'errno':getattr(error,'errno',None),'context_created':CREATED,'native_started':False,
                'first_tool_diagnostic_saved':False,'key_write_attempted':KEY_WRITE_ATTEMPTED,
                'key_write_state':'VERIFIED' if KEY_WRITE_VERIFIED else 'UNKNOWN' if KEY_WRITE_ATTEMPTED else 'NOT_ATTEMPTED',
                'precheck_failures':{name:value for name,value in (PRECHECK_REPORT or {}).get('checks',{}).items()
                                     if value.get('status')!='PASS' and not value.get('diagnosticOnly',False)}}
        if os.geteuid()==0:
            try:
                private=dict(result,first_tool=FIRST_TOOL)
                error_path=BASE+'/INSTALLER_FIRST_ERROR.PRIVATE.json' if CREATED else BASE+'.PREFLIGHT_ERROR.PRIVATE.json'
                B['write_once'](error_path,B['canonical'](private)+b'\n')
                result['first_tool_diagnostic_saved']=True
            except Exception:pass
        print(json.dumps(result,sort_keys=True));return 1

if __name__=='__main__':
    if sys.argv[1:]!=['--install-bounded-native-automation-once']:
        print(json.dumps({'status':'NOT_EXECUTED_EXPLICIT_INSTALL_FLAG_REQUIRED'}));raise SystemExit(2)
    raise SystemExit(main())
