"""Synthetic development boundary tests; no target, Docker, database or providers."""
import copy
import errno
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import subprocess
import sys
import time
import types
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name):
    module = types.ModuleType('development_test_'+name.replace('.', '_'))
    module.__file__ = str(HERE/name)
    exec(compile((HERE/name).read_bytes(), str(HERE/name), 'exec'), module.__dict__)
    return module


M = load('hetzner-development-environment.py')
NSS_PRIMARY_GIDS = M.nss_primary_gids
C = load('hetzner-native-automation-client.py')
S = load('hetzner-native-automation-server.py')


def capsule():
    now = int(time.time())
    return {'schema':'helmut-development-capsule-v1','action':'prepare','phase':'tools',
        'source_sha256':'a'*64,'source_commit':'b'*40,'nonce':'c'*64,
        'issued_at_utc':now-1,'expires_at_utc':now+240}


def identity(uid=60011, gid=60012):
    facts = {'schema':'helmut-development-identity-v1','uid':uid,'gid':gid,
        'uid_absent_from_nss':True,'gid_absent_from_nss':True,
        'uid_absent_from_processes':True,'gid_absent_from_processes':True,
        'observed_at_utc':int(time.time())}
    return {**facts,'proof_sha256':M.digest(M.encoded(facts))}


def tools_receipt(selected=None):
    return {'schema':'helmut-development-tools-v1','node_version':M.NODE_VERSION,
        'node_archive_sha256':M.NODE_SHA,'docker_archive_sha256':M.DOCKER_SHA,
        'postgrest_archive_sha256':M.POSTGREST_SHA,'postgres_base':M.POSTGRES,
        'identity':selected or identity()}


def missing(_):
    raise KeyError('synthetic absence')


class DevelopmentBoundaries(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.object(M,'UID',60011))
        self.enterContext(patch.object(M,'GID',60012))
        self.enterContext(patch.object(M,'ACTIVE_IDENTITY',identity()))
        self.enterContext(patch.object(M,'nss_primary_gids',return_value=set()))

    def test_defaults_are_inert(self):
        with patch('subprocess.Popen', side_effect=AssertionError('process')), patch('urllib.request.urlopen', side_effect=AssertionError('network')):
            load('hetzner-development-environment.py')

    def test_closed_capsule_accepts_source_commit_separate_from_controller(self):
        value = capsule()
        M.check_capsule(value, 'a'*64, int(time.time()))
        C.development_capsule_check(value, 'a'*64)
        self.assertEqual(C.control_request_nonce(value), M.digest(M.PREFIX+M.encoded(value)))

    def test_capsule_rejects_extra_actions_paths_times_and_bindings(self):
        cases = [{'phase':'sh'}, {'action':'four-tx'}, {'source_commit':'main'}, {'source_sha256':'0'*64},
                 {'issued_at_utc':True}, {'expires_at_utc':int(time.time())-5}, {'nonce':'../path'}, {'argv':['sh']}]
        for change in cases:
            with self.subTest(change=change):
                value = {**capsule(), **change}
                with self.assertRaises(M.Stop): M.check_capsule(value, 'a'*64, int(time.time()))
                with self.assertRaises(ValueError): C.development_capsule_check(value, 'a'*64)

    def test_downloads_are_exact_public_hashes(self):
        self.assertEqual(set(M.DOWNLOADS), {'docker.tgz','node.tar.xz','postgrest.tar.xz'})
        self.assertEqual(M.NODE_VERSION, '22.23.4')
        for url, sha, cap in M.DOWNLOADS.values():
            self.assertTrue(url.startswith('https://')); self.assertEqual(len(sha), 64); self.assertLess(cap, 100*1024**2)

    def test_registry_and_sri_lockfile(self):
        raw = (HERE.parent/'package-lock.json').read_bytes()
        self.assertEqual(M.lockfile(raw), M.digest(raw))
        for url in ('http://registry.npmjs.org/a.tgz','https://evil.invalid/a.tgz', 'https://x@registry.npmjs.org/a.tgz'):
            value = json.loads(raw)
            row = next(row for key,row in value['packages'].items() if key)
            row['resolved'] = url
            with self.assertRaises(M.Stop): M.lockfile(M.encoded(value))
        value = json.loads(raw)
        next(row for key,row in value['packages'].items() if key)['hasInstallScript'] = True
        with self.assertRaises(M.Stop): M.lockfile(M.encoded(value))

    def test_host_git_uses_separate_sealed_metadata(self):
        with patch.object(M, 'run', return_value=b'') as command:
            M.git(['status','--porcelain'], time.monotonic()+10, M.BASE/'workspaces'/('repo-'+'a'*64), sealed=True)
        argv = command.call_args.args[0]
        self.assertIn('--git-dir='+str(M.BASE/'repositories'/('repo-'+'a'*64)), argv)
        self.assertEqual(command.call_args.kwargs['user'], 60011)
        self.assertIn('credential.helper=', argv); self.assertIn('core.hooksPath=/dev/null', argv)

    def test_task_has_one_workspace_and_no_host_or_native_access(self):
        current = {'workspace':'repo-'+'a'*64,'package_lock_sha256':'b'*64,'uid':60011,'gid':60012}
        image = {'image_id':'sha256:'+'c'*64,'package_lock_sha256':'b'*64,'uid':60011,'gid':60012}
        with patch.object(M, 'workspace', return_value=M.BASE/'workspaces'/current['workspace']):
            argv = M.task_arguments('lage-rest', current, image, 'd'*64)
            for bad in ('four-tx', 'sh', '--privileged'):
                with self.assertRaises(M.Stop): M.task_arguments(bad,current,image,'d'*64)
        for flag in ('--network=none','--user=60011:60012','--cap-drop=ALL','--read-only','--security-opt=no-new-privileges'):
            self.assertIn(flag, argv)
        self.assertEqual(sum(arg.startswith('--mount=') for arg in argv), 1)
        self.assertNotIn('docker.sock', ' '.join(argv)); self.assertNotIn('helmut-native-test', ' '.join(argv))
        self.assertIn('-i', argv)

    def test_image_keeps_postgres_distribution_and_has_numeric_user(self):
        dockerfile = M.dockerfile_source().decode()
        self.assertIn('FROM '+M.POSTGRES, dockerfile)
        self.assertIn('useradd --uid 60011 --gid 60012', dockerfile)
        self.assertIn('groupadd --gid 60012',dockerfile)
        self.assertIn('COPY --chown=60011:60012',dockerfile)
        self.assertIn('USER 60011:60012',dockerfile)
        self.assertIn(b' = 60011:60012\n',M.entrypoint_source())
        self.assertNotIn('apt', dockerfile); self.assertNotIn('curl', dockerfile)
        self.assertNotIn('500', M.ENTRYPOINT)
        self.assertIn('xargs -0 -r -n1 node --check', M.ENTRYPOINT)

    def test_fresh_image_requests_keep_legacy_and_failed_builds_and_use_separate_caches(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'private').mkdir();repo=root/'workspace';repo.mkdir()
            legacy=[]
            for name in ('build','npm-cache'):
                path=root/name;path.mkdir();marker=path/'retained.fixture';marker.write_bytes(name.encode())
                legacy.append((path,path.stat().st_ino,marker,marker.stat().st_ino,marker.read_bytes()))
            lock=(HERE.parent/'package-lock.json').read_bytes()
            package=(HERE.parent/'package.json').read_bytes()
            current={'source_commit':'b'*40,'workspace':'repo-'+'c'*64,
                     'package_lock_sha256':M.digest(lock),'uid':60011,'gid':60012}
            (root/'private/CURRENT.SAFE.json').write_bytes(M.encoded(current))
            calls=[]
            def own_write(path,raw,mode=0o600):
                with path.open('xb') as stream:stream.write(raw)
                path.chmod(mode)
            def fake_docker(args,*_args,**_kwargs):
                calls.append((M.ACTIVE_NONCE,args))
                if M.ACTIVE_NONCE=='a'*64:raise M.Stop('SYNTHETIC_LATE_IMAGE_FAILURE')
                return ('sha256:'+'d'*64+'\n').encode() if args[0]=='image' else b'OK'
            with patch.object(M,'BASE',root),patch.object(M,'ACTIVE_NONCE','a'*64), \
                 patch.object(M,'refresh_identity'),patch.object(M,'capacity'), \
                 patch.object(M,'read_root',side_effect=lambda path,*args:path.read_bytes()), \
                 patch.object(M,'workspace',return_value=repo), \
                 patch.object(M,'git',side_effect=lambda args,*a,**k:lock if args[1].endswith(':package-lock.json') else package), \
                 patch.object(M,'run',return_value=b'') as command,patch.object(M,'docker',side_effect=fake_docker), \
                 patch.object(M.os,'chown'),patch.object(M.os,'fchown'),patch.object(M,'write_new',side_effect=own_write):
                M.ACTIVE_NONCE='a'*64
                with self.assertRaisesRegex(M.Stop,'SYNTHETIC_LATE_IMAGE_FAILURE'):M.image(time.monotonic()+10)
                self.assertTrue((root/('build-'+'a'*64)/'Dockerfile').is_file())
                first_calls=(command.call_count,len(calls))
                with self.assertRaises(FileExistsError):M.image(time.monotonic()+10)
                self.assertEqual((command.call_count,len(calls)),first_calls)
                M.ACTIVE_NONCE='e'*64
                receipt=M.image(time.monotonic()+10)
                self.assertEqual((receipt['uid'],receipt['gid']),(60011,60012))
                self.assertEqual(receipt['image_id'],'sha256:'+'d'*64)
                before_reuse=(command.call_count,len(calls))
                self.assertEqual(M.image(time.monotonic()+10),receipt)
                self.assertEqual((command.call_count,len(calls)),before_reuse)
                for nonce in ('a'*64,'e'*64):
                    build=root/('build-'+nonce);cache=root/('npm-cache-'+nonce)
                    self.assertTrue(build.is_dir());self.assertTrue(cache.is_dir())
                    self.assertNotIn(cache,build.parents);self.assertNotIn(build,cache.parents)
                cache_flags=[arg for entry in command.call_args_list for arg in entry.args[0] if arg.startswith('--cache=')]
                self.assertEqual(cache_flags,['--cache='+str(root/('npm-cache-'+'a'*64)),
                                             '--cache='+str(root/('npm-cache-'+'e'*64))])
            for path,inode,marker,marker_inode,raw in legacy:
                self.assertEqual(path.stat().st_ino,inode)
                self.assertEqual(marker.stat().st_ino,marker_inode)
                self.assertEqual(marker.read_bytes(),raw)

    def test_archive_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); archive = root/'unsafe.tar'
            with tarfile.open(archive,'w') as tar:
                item = tarfile.TarInfo('docker/../../escape'); item.size=1; tar.addfile(item,io.BytesIO(b'x'))
            with self.assertRaises(M.Stop): M.unpack(archive,root/'out','docker')
            self.assertFalse((root/'escape').exists())

    def test_real_umask077_does_not_hide_tool_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); archive = root/'tool.tar'
            with tarfile.open(archive, 'w') as tar:
                item = tarfile.TarInfo('docker/bin/tool'); item.size=1; item.mode=0o755
                tar.addfile(item, io.BytesIO(b'x'))
            old = os.umask(0o077)
            try:
                M.unpack(archive,root/'out','docker')
                with patch.object(M, 'trusted_directory', side_effect=lambda p: os.open(p,os.O_RDONLY|os.O_DIRECTORY)):
                    M.write_new(root/'entrypoint', b'x', 0o755)
                    M.write_new(root/'lock.sha', b'x', 0o644)
            finally: os.umask(old)
            self.assertEqual((root/'out/bin/tool').stat().st_mode & 0o777, 0o755)
            self.assertEqual((root/'out/bin').stat().st_mode & 0o777, 0o755)
            self.assertEqual((root/'entrypoint').stat().st_mode & 0o777, 0o755)
            self.assertEqual((root/'lock.sha').stat().st_mode & 0o777, 0o644)

    def test_root_read_preserves_real_stale_atime_and_returns_complete_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'own-root-receipt.fixture';expected=b'synthetic private receipt\n'
            path.write_bytes(expected)
            os.utime(path,ns=(1000000000,2000000000))
            before=path.stat()
            original_fstat=os.fstat
            def root_owned(fd):
                # Only owner IDs are simulated for unprivileged CI. Every
                # timestamp and before/after equality comes from real fstat.
                values=list(original_fstat(fd));values[4]=values[5]=0
                return os.stat_result(values)
            with patch.object(M,'trusted_directory',side_effect=lambda parent:os.open(parent,os.O_RDONLY|os.O_DIRECTORY)), \
                 patch.object(M.os,'fstat',side_effect=root_owned):
                observed=M.read_root(path)
            after=path.stat()
            self.assertEqual(observed,expected)
            self.assertEqual(before.st_atime_ns,1000000000)
            self.assertEqual(after.st_atime_ns,before.st_atime_ns)
            self.assertEqual(after.st_mtime_ns,before.st_mtime_ns)

    def test_container_cgroup_is_killed_before_daemon_grace(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); (root/'cgroup.kill').write_text(''); (root/'cgroup.events').write_text('populated 0\n')
            calls = []
            def command(argv, **kwargs):
                self.assertEqual((root/'cgroup.kill').read_text(), '1')
                calls.append(argv); return types.SimpleNamespace(returncode=0)
            with patch.object(M, 'CGROUP', root), patch.object(M.subprocess,'run', side_effect=command): M.stop_development()
            self.assertEqual(calls[0][1:4], ['kill','--kill-whom=all','--signal=SIGKILL'])
            self.assertEqual(calls[1][1], 'stop')

    def test_every_docker_call_starts_fresh_after_a_stopped_runtime(self):
        calls=[]
        with tempfile.TemporaryDirectory() as directory, patch.object(M,'CGROUP',Path(directory)/'absent'), \
             patch.object(M,'capacity'), patch.object(M,'unit_policy'), patch.object(M,'stop_development',side_effect=lambda:calls.append('stop')), \
             patch.object(M,'run',side_effect=lambda argv,*a,**k:calls.append(argv) or b'OK'):
            for _ in range(2): self.assertEqual(M.docker(['image','ls'], time.monotonic()+10), b'OK')
        self.assertEqual(calls[0], 'stop'); self.assertEqual(calls[3], 'stop')
        self.assertEqual(calls[1], ['/usr/bin/systemctl','start',M.SERVICE])
        self.assertEqual(calls[4], calls[1])

    def test_manager_unit_paths_require_typed_positive_metadata(self):
        self.assertEqual(M.parse_unit_paths(M.encoded({'type':'as','data':['/etc/systemd/system']})), ['/etc/systemd/system'])
        for value in ({}, {'type':'s','data':'/etc/systemd/system'}, {'type':'as','data':[]},
                      {'type':'as','data':['/tmp/user-units']}, {'type':'as','data':[[]]}):
            with self.assertRaises(M.Stop):M.parse_unit_paths(M.encoded(value))

    def test_all_effective_dropin_prefixes_are_closed_before_unit_launch(self):
        name='helmut-development-host-'+'a'*64+'-1.service'
        names=M.dropin_names(name)
        self.assertIn('service.d', names)
        self.assertIn('helmut-.service.d', names)
        self.assertIn('helmut-development-.service.d', names)
        self.assertIn('helmut-development-host-.service.d', names)
        self.assertIn(name+'.d', names)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            def existing(path):return os.open(path,os.O_RDONLY|os.O_DIRECTORY) if Path(path).is_dir() else None
            with patch.object(M,'manager_unit_paths',return_value=[str(root)]), patch.object(M,'unit_directory',side_effect=existing):
                self.assertEqual(len(M.unit_policy(name,time.monotonic()+10)),64)
                for prefix in names:
                    target=root/prefix;target.mkdir();(target/'extra.conf').write_text('[Service]\nExecStartPre=/bin/false\n')
                    with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_UNIT_OVERRIDE_UNQUALIFIED'):M.unit_policy(name,time.monotonic()+10)
                    (target/'extra.conf').unlink();target.rmdir()

    def test_external_unit_dependency_is_not_silently_started(self):
        name='helmut-development-host-'+'a'*64+'-1.service'
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); dependency=root/(name+'.requires');dependency.mkdir();(dependency/'outside.service').write_text('')
            def existing(path):return os.open(path,os.O_RDONLY|os.O_DIRECTORY) if Path(path).is_dir() else None
            with patch.object(M,'manager_unit_paths',return_value=[str(root)]), patch.object(M,'unit_directory',side_effect=existing):
                with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_UNIT_DEPENDENCY_UNQUALIFIED'):M.unit_policy(name,time.monotonic()+10)

    def test_unknown_unit_policy_stops_before_any_hostcommand(self):
        with patch.object(M,'ACTIVE_NONCE','a'*64), patch.object(M,'capacity'), \
             patch.object(M,'refresh_identity'), \
             patch.object(M,'unit_policy',side_effect=M.Stop('DEVELOPMENT_UNIT_OVERRIDE_UNQUALIFIED')), \
             patch.object(M.subprocess,'Popen') as start:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_UNIT_OVERRIDE_UNQUALIFIED'):M.run(['/bin/true'],time.monotonic()+10)
            start.assert_not_called()

    def test_low_capacity_rejects_before_any_process_start(self):
        with patch.object(M,'capacity',side_effect=M.Stop('DEVELOPMENT_NATIVE_DISK_RESERVE')), patch.object(M.subprocess,'Popen') as start:
            with self.assertRaises(M.Stop): M.run(['/bin/true'],time.monotonic()+10)
            start.assert_not_called()

    def test_host_supervisor_ends_command_when_controller_disappears(self):
        # Real process-lifetime probe, no systemd/target/Docker call. The same
        # supervisor bytes run inside a KillMode=control-group unit on target.
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); wrapper=root/'host.py';wrapper.write_text(M.HOST_COMMAND)
            child=root/'child.py';child.write_text('import os,time,pathlib\npathlib.Path('+repr(str(root/'pid'))+').write_text(str(os.getpid()))\ntime.sleep(30)\n')
            parent_code=('import subprocess,sys,time\np=subprocess.Popen([sys.executable,"-I","-S","-B",'
                +repr(str(wrapper))+',str(__import__("os").getpid()),str(time.monotonic()+15),"host","60011","60012",sys.executable,"-I","-S",'
                +repr(str(child))+'])\ntime.sleep(.5)\n')
            parent=subprocess.Popen([sys.executable,'-I','-S','-c',parent_code],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            parent.communicate(timeout=5)
            end=time.monotonic()+5
            while not (root/'pid').exists() and time.monotonic()<end:time.sleep(.02)
            self.assertTrue((root/'pid').exists())
            pid=int((root/'pid').read_text())
            while Path('/proc/'+str(pid)).exists() and time.monotonic()<end:time.sleep(.02)
            self.assertFalse(Path('/proc/'+str(pid)).exists(), 'host command survived lost controller')

    def test_host_worker_drops_all_credentials_before_child_without_account_lookup(self):
        calls=[]
        argv=['host.py',str(os.getpid()),str(time.monotonic()+10),'worker','60011','60012','/usr/bin/id']
        process=types.SimpleNamespace(poll=lambda:0,returncode=0)
        with patch.object(sys,'argv',argv), patch.object(os,'setgroups',side_effect=lambda groups:calls.append(('groups',groups))), \
             patch.object(os,'setgid',side_effect=lambda gid:calls.append(('gid',gid))), \
             patch.object(os,'setuid',side_effect=lambda uid:calls.append(('uid',uid))), \
             patch.object(os,'getuid',return_value=60011),patch.object(os,'geteuid',return_value=60011), \
             patch.object(os,'getgid',return_value=60012),patch.object(os,'getegid',return_value=60012), \
             patch.object(os,'getgroups',return_value=[]), \
             patch.object(subprocess,'Popen',side_effect=lambda *a,**k:calls.append('spawn') or process):
            with self.assertRaises(SystemExit) as stopped:exec(compile(M.HOST_COMMAND,'<fixed-host-command>','exec'),{})
        self.assertEqual(stopped.exception.code,0)
        self.assertEqual(calls,[('groups',[]),('gid',60012),('uid',60011),'spawn'])

    def test_test_output_requires_positive_complete_summary(self):
        M.test_output('syntax', b'PASS 92  FAIL 0  (gesamt 92)\n')
        M.test_output('lage-rest', b'REST_ERGEBNIS: erfolgreich, 15/15 Gruppen und Bereinigung bestaetigt\n')
        for task,raw in [('syntax',b'PASS 91  FAIL 1  (gesamt 92)\n'),('syntax',b'SKIP\n'),('lage-rest',b'PASS 1\n')]:
            with self.assertRaises(M.Stop): M.test_output(task,raw)

    def test_restore_compression_is_byte_identical_and_within_root_cap(self):
        self.assertEqual(S.EMBEDDED_STAGE_RESTORE_SOURCE, (HERE/'hetzner-native-stage-restore.py').read_bytes())
        self.assertEqual(M.digest(S.EMBEDDED_STAGE_RESTORE_SOURCE), S.STAGE_RESTORE_SHA256)
        self.assertLessEqual((HERE/'hetzner-native-automation-server.py').stat().st_size, 131072)

    def test_server_loads_only_main_bound_helper(self):
        raw = (HERE/'hetzner-development-environment.py').read_bytes()
        self.assertEqual(S.DEVELOPMENT_SHA256, M.digest(raw)); self.assertEqual(S.DEVELOPMENT_BYTES,len(raw))

    def test_public_result_rejects_native_authority_or_unbounded_diagnostic(self):
        cap = capsule(); sent = C.request('admit',C.STAGE_PLAN,'a'*64,C.control_request_nonce(cap))
        result = S._setup_successor_failure('SYNTHETIC_FAILURE',cap)
        C.development_result(result,sent,cap)
        for update in ({'native_qualified':True},{'code':'private output\nsecret'},{'diagnostic':{'raw':'secret'}}):
            with self.assertRaises(ValueError): C.development_result({**result,**update},sent,cap)

    def test_server_routes_nonce_bound_development_without_native_action(self):
        cap = capsule(); sent = C.request('admit',C.STAGE_PLAN,'a'*64,C.control_request_nonce(cap))
        context = {'base':S.TARGET_BASE,'source_sha256':'a'*64,'deployment_commit':'b'*40,
                   'deadline':time.monotonic()+10,'stdin':io.BytesIO(M.encoded(cap))}
        with patch.object(S,'_setup_watchdog',return_value={'synthetic':True}) as bound:
            self.assertEqual(S.handle(sent,context),{'synthetic':True})
            self.assertEqual(bound.call_args.kwargs,{'successor_capsule':cap})
        context['stdin']=io.BytesIO(M.encoded(cap));sent['nonce']='f'*64
        with patch.object(S,'_setup_watchdog') as bound:
            with self.assertRaises(S._Stop):S.handle(sent,context)
            bound.assert_not_called()

    def test_prepare_client_retains_five_bounded_phase_receipts(self):
        with tempfile.TemporaryDirectory() as directory:
            env={'GITHUB_REPOSITORY':C.REPOSITORY,'GITHUB_REPOSITORY_OWNER':'ernisch','GITHUB_REF':C.BRANCH,
                 'GITHUB_WORKFLOW_REF':C.WORKFLOW_REF,'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_SHA':'b'*40,
                 'HELMUT_NATIVE_OPERATION':'admit','HELMUT_NATIVE_CONTROL_MODE':'development-v1',
                 'HELMUT_NATIVE_PLAN_SHA256':C.STAGE_PLAN,'HELMUT_NATIVE_PAYLOAD_SHA256':'a'*64,
                 'HELMUT_DEVELOPMENT_ACTION':'prepare','RUNNER_TEMP':directory}
            phases=[]
            def exchange(environment, output):
                cap=json.loads(C.base64.b64decode(environment['HELMUT_NATIVE_SETUP_CAPSULE']))
                C.development_capsule_check(cap,'a'*64);phases.append(cap['phase'])
                C.write_public_artifact(output,{'phase':cap['phase'],'result':{'identity':identity()}});return 0
            with patch.object(C,'client',side_effect=exchange):self.assertEqual(C.development_client(env),0)
            self.assertEqual(phases,['tools','source','image','syntax','lage-rest'])
            root=Path(directory)/'helmut-development-public'
            self.assertEqual({p.name for p in root.iterdir()},set(phases))
            for phase in root.iterdir():self.assertEqual({p.name for p in phase.iterdir()},{'RESPONSE.SAFE.json','RESPONSE.SAFE.sha256'})

    def test_selection_ignores_assigned_2000_and_can_choose_different_uid_gid(self):
        looked_up=[]
        def users(number):
            looked_up.append(number)
            if number in (2000,60001):return object()
            raise KeyError(number)
        def groups(number):
            looked_up.append(number)
            if number in (2000,60001,60002):return object()
            raise KeyError(number)
        with patch.object(M.pwd,'getpwuid',side_effect=users),patch.object(M.grp,'getgrgid',side_effect=groups), \
             patch.object(M,'process_identities',return_value=(set(),set())) as observed:
            selected=M.select_identity(time.monotonic()+10)
        self.assertEqual((selected['uid'],selected['gid']),(60002,60003))
        self.assertNotIn(2000,looked_up)
        self.assertEqual(observed.call_count,3)
        self.assertEqual(M.validate_identity(selected),selected)
        self.assertEqual(set(selected),M.IDENTITY_KEYS)

    def test_numeric_process_credentials_exclude_candidates_without_nss_accounts(self):
        with patch.object(M.pwd,'getpwuid',side_effect=missing),patch.object(M.grp,'getgrgid',side_effect=missing), \
             patch.object(M,'process_identities',return_value=({60001},{60001,60002})):
            selected=M.select_identity(time.monotonic()+10)
        self.assertEqual((selected['uid'],selected['gid']),(60002,60003))

    def test_dormant_nss_account_reserves_primary_gid_without_group_object(self):
        switch=b'passwd: files systemd\ngroup: files systemd\n'
        local=b'root:x:0:0::/:/bin/sh\nsynthetic-dormant:x:49000:60001::/:/bin/false\n'
        accounts=[M.pwd.struct_passwd(('root','x',0,0,'','/','/bin/sh')),
                  M.pwd.struct_passwd(('synthetic-dormant','x',49000,60001,'','/','/bin/false'))]
        with patch.object(M,'nss_primary_gids',side_effect=NSS_PRIMARY_GIDS), \
             patch.object(M,'read_root',side_effect=lambda path,*args:switch if path==M.NSS_SWITCH else local), \
             patch.object(M.pwd,'getpwall',return_value=accounts),patch.object(M.pwd,'getpwuid',side_effect=missing), \
             patch.object(M.grp,'getgrgid',side_effect=missing),patch.object(M,'process_identities',return_value=(set(),set())):
            self.assertTrue(M.nss_absent(M.grp.getgrgid,60001,time.monotonic()+10))
            selected=M.select_identity(time.monotonic()+10)
        self.assertEqual((selected['uid'],selected['gid']),(60001,60002))
        self.assertEqual(set(selected),M.IDENTITY_KEYS)

    def test_unknown_incomplete_or_unsupported_nss_enumeration_never_proves_absence(self):
        switch=b'passwd: files systemd\ngroup: files systemd\n'
        local=b'root:x:0:0::/:/bin/sh\nsynthetic-dormant:x:49000:60001::/:/bin/false\n'
        accounts=[M.pwd.struct_passwd(('root','x',0,0,'','/','/bin/sh')),
                  M.pwd.struct_passwd(('synthetic-dormant','x',49000,60001,'','/','/bin/false'))]
        cases=[{'switch':b'passwd: files sss\ngroup: files systemd\n'},
               {'switch':b'passwd: files\ngroup: files ldap\n'},
               {'error':OSError('synthetic unavailable enumeration')},
               {'accounts':[]},{'accounts':accounts[:1]},
               {'accounts':[types.SimpleNamespace(pw_uid=0,pw_gid=0)]},
               {'accounts':[M.pwd.struct_passwd(('synthetic','x',1,'60001','','',''))]},
               {'accounts':accounts*(M.NSS_ACCOUNT_LIMIT//2+1)}]
        for case in cases:
            selected_switch=case.get('switch',switch)
            with self.subTest(case=list(case)),patch.object(M,'nss_primary_gids',side_effect=NSS_PRIMARY_GIDS), \
                 patch.object(M,'read_root',side_effect=lambda path,*args:selected_switch if path==M.NSS_SWITCH else local), \
                 patch.object(M.pwd,'getpwall',return_value=case.get('accounts',accounts),side_effect=case.get('error')), \
                 patch.object(M,'process_identities') as processes:
                with self.assertRaises(M.Stop):M.select_identity(time.monotonic()+10)
                self.assertIsNone(M.ACTIVE_IDENTITY);processes.assert_not_called()

    def test_late_primary_gid_assignment_clears_proof_without_reselection(self):
        with patch.object(M,'nss_primary_gids',side_effect=[set(),{60012}]), \
             patch.object(M.pwd,'getpwuid',side_effect=missing),patch.object(M.grp,'getgrgid',side_effect=missing), \
             patch.object(M,'process_identities',return_value=(set(),set())),patch.object(M,'select_identity') as select:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PRIMARY_GID_ASSIGNED'):
                M.refresh_identity(time.monotonic()+10)
            select.assert_not_called()
        self.assertIsNone(M.ACTIVE_IDENTITY)

    def test_nss_metadata_change_during_enumeration_is_unknown(self):
        switch=b'passwd: files systemd\ngroup: files systemd\n'
        local=b'root:x:0:0::/:/bin/sh\n'
        changed=local+b'synthetic-new:x:49000:60012::/:/bin/false\n'
        account=M.pwd.struct_passwd(('root','x',0,0,'','/','/bin/sh'))
        with patch.object(M,'nss_primary_gids',side_effect=NSS_PRIMARY_GIDS), \
             patch.object(M,'read_root',side_effect=[switch,local,switch,changed]), \
             patch.object(M.pwd,'getpwall',return_value=[account]),patch.object(M,'process_identities') as processes:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_NSS_ENUMERATION_CHANGED'):
                M.refresh_identity(time.monotonic()+10)
            processes.assert_not_called()
        self.assertIsNone(M.ACTIVE_IDENTITY)

    def test_unknown_nss_and_exhausted_candidates_stop_without_fallback(self):
        with patch.object(M.pwd,'getpwuid',side_effect=OSError('synthetic NSS outage')):
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_NSS_UNKNOWN'):
                M.select_identity(time.monotonic()+10)
        self.assertIsNone(M.ACTIVE_IDENTITY)
        with patch.object(M.pwd,'getpwuid',return_value=object()),patch.object(M.grp,'getgrgid',return_value=object()), \
             patch.object(M,'process_identities',return_value=(set(),set())):
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_NONE_AVAILABLE'):
                M.select_identity(time.monotonic()+10)
        self.assertIsNone(M.ACTIVE_IDENTITY)

    def test_fresh_tools_observes_identity_before_any_setup_effect(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(M,'BASE',Path(directory)/'absent'), \
             patch.object(M,'select_identity',side_effect=M.Stop('DEVELOPMENT_IDENTITY_NSS_UNKNOWN')), \
             patch.object(M,'capacity') as capacity,patch.object(M,'unit_policy') as policy, \
             patch.object(M,'download') as download,patch.object(Path,'mkdir') as mkdir, \
             patch.object(M.subprocess,'Popen') as process:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_NSS_UNKNOWN'):M.tools(time.monotonic()+10)
            for action in (capacity,policy,download,mkdir,process):action.assert_not_called()

    def test_second_observation_catches_reassignment_and_clears_public_proof(self):
        with patch.object(M.pwd,'getpwuid',side_effect=missing),patch.object(M.grp,'getgrgid',side_effect=missing), \
             patch.object(M,'process_identities',side_effect=[(set(),set()),({60011},set())]):
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PROCESS_ASSIGNED'):
                M.refresh_identity(time.monotonic()+10)
        self.assertIsNone(M.ACTIVE_IDENTITY)

    def test_process_status_includes_fsids_supplementary_groups_and_every_thread(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            for tid,raw in (('123',b'Uid:\t0 0 0 60001\nGid:\t0 0 0 0\nGroups:\t60002\n'),
                            ('124',b'Uid:\t60003 0 0 0\nGid:\t0 0 60004 0\nGroups:\t\n')):
                path=root/'123/task'/tid;path.mkdir(parents=True)
                (path/'status').write_bytes(b'Name:\tnever-exported\n'+raw)
            with patch.object(M,'PROC',root):
                self.assertEqual(M.process_identities(time.monotonic()+10),({60001,60003},{60002,60004}))

    def test_unknown_changed_or_unbounded_process_observation_is_rejected(self):
        for raw in (b'Uid: 0 0 0\nGid: 0 0 0 0\nGroups:\n',
                    b'Uid: 0 0 0 0\nGid: 0 0 0 0\nGroups: private-name\n',
                    b'Uid: 0 0 0 0\nUid: 0 0 0 0\nGid: 0 0 0 0\nGroups:\n'):
            with self.assertRaises(M.Stop):M.status_identity(raw)
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);path=root/'123/task/123';path.mkdir(parents=True)
            (path/'status').write_bytes(b'Uid: 0 0 0 0\nGid: 0 0 0 0\nGroups:\n')
            with patch.object(M,'PROC',root),patch.object(M.os,'listdir',side_effect=[['123'],['123'],['123'],[]]):
                with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PROCESS_CHANGED'):
                    M._process_snapshot(time.monotonic()+3)
            with patch.object(M,'PROC',root),patch.object(M,'PROC_STATUS_LIMIT',8):
                with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PROCESS_LIMIT'):
                    M.process_identities(time.monotonic()+10)
            with patch.object(M,'PROC',root/'missing'):
                with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN'):
                    M.process_identities(time.monotonic()+10)

    def test_transient_status_io_discards_the_entire_partial_snapshot(self):
        for transient in (errno.ENOENT,errno.ESRCH):
            with self.subTest(errno=transient),tempfile.TemporaryDirectory() as directory:
                root=Path(directory);neutral=b'Uid: 0 0 0 0\nGid: 0 0 0 0\nGroups:\n'
                first=root/'123/task/123';second=root/'456/task/456'
                first.mkdir(parents=True);second.mkdir(parents=True)
                (first/'status').write_bytes(b'Uid: 60031 0 0 0\nGid: 0 60032 0 0\nGroups:\n')
                (second/'status').write_bytes(neutral)
                original_open=os.open;status_reads=[]
                def churn(path,*args,**kwargs):
                    if path=='status':
                        status_reads.append(path)
                        if len(status_reads)==2:
                            (first/'status').write_bytes(neutral)
                            raise OSError(transient,'synthetic vanished task')
                    return original_open(path,*args,**kwargs)
                with patch.object(M,'PROC',root),patch.object(M.os,'open',side_effect=churn):
                    complete=M.process_identities(time.monotonic()+10)
                self.assertEqual(complete,(set(),set()))
                self.assertEqual(len(status_reads),4)

    def test_transient_snapshot_errors_exhaust_exactly_three_attempts_and_keep_errno(self):
        for transient in (errno.ENOENT,errno.ESRCH):
            failure=OSError(transient,'synthetic missing task')
            with self.subTest(errno=transient),patch.object(M,'_process_snapshot',side_effect=failure) as snapshot:
                with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN') as stopped:
                    M.process_identities(time.monotonic()+10)
                self.assertEqual(snapshot.call_count,3)
                self.assertEqual(stopped.exception.errno,transient)
                self.assertIs(stopped.exception.__cause__,failure)

    def test_listing_change_restarts_only_a_whole_observation_with_the_same_end(self):
        changed=M.Stop('DEVELOPMENT_IDENTITY_PROCESS_CHANGED')
        complete=({60002},{60003})
        with patch.object(M,'_process_snapshot',side_effect=[changed,complete]) as snapshot:
            self.assertEqual(M.process_identities(time.monotonic()+10),complete)
            self.assertEqual(snapshot.call_count,2)
            self.assertEqual(snapshot.call_args_list[0].args,snapshot.call_args_list[1].args)
        with patch.object(M,'_process_snapshot',side_effect=changed) as snapshot:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PROCESS_CHANGED'):
                M.process_identities(time.monotonic()+10)
            self.assertEqual(snapshot.call_count,3)

    def test_permission_parse_limit_or_unknown_snapshot_errors_are_never_retried(self):
        failures=[OSError(errno.EACCES,'private path'),OSError(errno.EIO,'private path'),OSError(),
                  M.Stop('DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN'),
                  M.Stop('DEVELOPMENT_IDENTITY_PROCESS_LIMIT'),M.Stop('DEVELOPMENT_IDENTITY_DEADLINE')]
        for failure in failures:
            with self.subTest(error=type(failure).__name__,errno=getattr(failure,'errno',None)), \
                 patch.object(M,'_process_snapshot',side_effect=failure) as snapshot:
                with self.assertRaises(M.Stop) as stopped:M.process_identities(time.monotonic()+10)
                self.assertEqual(snapshot.call_count,1)
                self.assertEqual(stopped.exception.errno,getattr(failure,'errno',None))
                if isinstance(failure,OSError):self.assertIs(stopped.exception.__cause__,failure)
        with tempfile.TemporaryDirectory() as directory,patch.object(M,'PROC',Path(directory)/'missing'), \
             patch.object(M.os,'open',wraps=os.open) as opened:
            with self.assertRaises(M.Stop) as stopped:M.process_identities(time.monotonic()+10)
            self.assertEqual(stopped.exception.errno,errno.ENOENT)
            self.assertEqual(opened.call_count,1)

    def test_assigned_credentials_or_unknown_nss_are_not_retried_or_reselected(self):
        with patch.object(M.pwd,'getpwuid',side_effect=missing),patch.object(M.grp,'getgrgid',side_effect=missing), \
             patch.object(M,'_process_snapshot',return_value=({60011},set())) as snapshot, \
             patch.object(M,'select_identity') as select:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_PROCESS_ASSIGNED'):
                M.refresh_identity(time.monotonic()+10)
            self.assertEqual(snapshot.call_count,1);select.assert_not_called()
        self.assertIsNone(M.ACTIVE_IDENTITY)
        for lookup in (object(),OSError(errno.EIO,'synthetic NSS unknown')):
            M.ACTIVE_IDENTITY=identity()
            kwargs={'side_effect':lookup} if isinstance(lookup,OSError) else {'return_value':lookup}
            with patch.object(M.pwd,'getpwuid',**kwargs),patch.object(M,'_process_snapshot') as snapshot, \
                 patch.object(M,'select_identity') as select:
                with self.assertRaises(M.Stop) as stopped:M.refresh_identity(time.monotonic()+10)
                snapshot.assert_not_called();select.assert_not_called()
                self.assertEqual(stopped.exception.errno,getattr(lookup,'errno',None))
            self.assertIsNone(M.ACTIVE_IDENTITY)

    def test_all_snapshot_attempts_share_three_seconds_and_the_callers_deadline(self):
        for deadline,expected_calls,expected_end in ((110.,2,103.),(101.,1,101.)):
            clock=[100.]
            def changed(end):
                self.assertEqual(end,expected_end)
                clock[0]+=2
                raise M.Stop('DEVELOPMENT_IDENTITY_PROCESS_CHANGED')
            with self.subTest(deadline=deadline),patch.object(M.time,'monotonic',side_effect=lambda:clock[0]), \
                 patch.object(M,'_process_snapshot',side_effect=changed) as snapshot:
                with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_DEADLINE'):
                    M.process_identities(deadline)
                self.assertEqual(snapshot.call_count,expected_calls)
        clock=[100.]
        def late_complete(end):
            clock[0]=end+.01
            return set(),set()
        with patch.object(M.time,'monotonic',side_effect=lambda:clock[0]), \
             patch.object(M,'_process_snapshot',side_effect=late_complete) as snapshot:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_DEADLINE'):
                M.process_identities(110.)
            self.assertEqual(snapshot.call_count,1)

    def test_tools_receipt_binds_reuse_and_rechecks_instead_of_reselecting(self):
        stored=tools_receipt(identity(60005,60006))
        with patch.object(M,'read_root',return_value=M.encoded(stored)), \
             patch.object(M.pwd,'getpwuid',side_effect=missing),patch.object(M.grp,'getgrgid',side_effect=missing), \
             patch.object(M,'process_identities',return_value=(set(),set())),patch.object(M,'select_identity') as select:
            self.assertEqual(M.tools_identity(time.monotonic()+10),stored)
            self.assertEqual(M.identity_ids(),(60005,60006));select.assert_not_called()
        with patch.object(M,'read_root',return_value=M.encoded(stored)), \
             patch.object(M.pwd,'getpwuid',return_value=object()),patch.object(M,'select_identity') as select:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_ASSIGNED'):
                M.tools_identity(time.monotonic()+10)
            select.assert_not_called()
        self.assertIsNone(M.ACTIVE_IDENTITY)

    def test_receipt_identity_tampering_or_unknown_lookup_erases_freshness(self):
        for changed in (identity(2000,60012),{**identity(),'proof_sha256':'0'*64},
                        {**identity(),'account':'forbidden'}):
            with patch.object(M,'read_root',return_value=M.encoded(tools_receipt(changed))):
                with self.assertRaises(M.Stop):M.tools_identity(time.monotonic()+10)
            self.assertIsNone(M.ACTIVE_IDENTITY)
        M.UID,M.GID,M.ACTIVE_IDENTITY=60011,60012,identity()
        with patch.object(M.pwd,'getpwuid',side_effect=RuntimeError('unknown')):
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_NSS_UNKNOWN'):
                M.refresh_identity(time.monotonic()+10)
        self.assertIsNone(M.ACTIVE_IDENTITY)

    def test_workspace_and_image_cannot_switch_bound_identity(self):
        current={'workspace':'repo-'+'a'*64,'package_lock_sha256':'b'*64,'uid':60011,'gid':60012}
        with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_BINDING'):
            M.workspace({**current,'uid':60013})
        wrong_image={'image_id':'sha256:'+'c'*64,'package_lock_sha256':'b'*64,'uid':60013,'gid':60012}
        with patch.object(M,'workspace') as workspace:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_BINDING'):
                M.task_arguments('syntax',current,wrong_image,'d'*64)
            workspace.assert_not_called()

    def test_coordinate_binds_public_identity_to_private_facts_and_failures_clear_it(self):
        cap=capsule();nonce=M.digest(M.PREFIX+M.encoded(cap))
        request={'operation':'admit','nonce':nonce}
        context={'source_sha256':'a'*64,'deadline':time.monotonic()+10}
        def prepared(_):
            M.UID,M.GID,M.ACTIVE_IDENTITY=60011,60012,identity()
            return {'schema':'synthetic-own-development-facts'}
        for callback,complete in ((prepared,True),(M.Stop('DEVELOPMENT_IDENTITY_NSS_UNKNOWN'),False),
                                  (M.Stop('DEVELOPMENT_IDENTITY_PROCESS_UNKNOWN',OSError(errno.EACCES,'private-path')),False)):
            with tempfile.TemporaryFile() as lock:
                fd=os.dup(lock.fileno())
                with patch.object(M.os,'getuid',return_value=0),patch.object(M.os,'geteuid',return_value=0), \
                     patch.object(M.os,'getgid',return_value=0),patch.object(M.os,'getegid',return_value=0), \
                     patch.object(M.os,'fstat',return_value=types.SimpleNamespace(st_mode=M.stat.S_IFREG,st_uid=0,st_gid=0,st_nlink=1)), \
                     patch.object(M.os,'open',return_value=fd),patch.object(M,'write_new') as saved, \
                     patch.object(M,'tools',side_effect=callback):
                    result=M.coordinate(request,context,cap)
            if complete:
                self.assertEqual((result['identity']['uid'],result['identity']['gid']),(60011,60012))
                private=json.loads(saved.call_args.args[1])
                self.assertEqual(private['facts']['identity'],result['identity'])
                self.assertEqual(result['receipt_sha256'],M.digest(M.encoded(private['facts'])))
            else:
                self.assertIsNone(result['identity'])
                self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY')
                self.assertEqual(result['diagnostic']['errno'],callback.errno)
                self.assertNotIn('private-path',json.dumps(result))
            C.development_result(result,{'nonce':nonce},cap)

    def test_wrong_host_worker_identity_stops_before_child_launch(self):
        with patch.object(M,'ACTIVE_NONCE','a'*64),patch.object(M,'capacity'),patch.object(M,'refresh_identity'), \
             patch.object(M.subprocess,'Popen') as start:
            with self.assertRaisesRegex(M.Stop,'DEVELOPMENT_IDENTITY_BINDING'):
                M.run(['/bin/true'],time.monotonic()+10,user=2000)
            start.assert_not_called()
        argv=['host.py',str(os.getpid()),str(time.monotonic()+10),'worker','60011','60012','/usr/bin/id']
        with patch.object(sys,'argv',argv),patch.object(os,'setgroups'),patch.object(os,'setgid'),patch.object(os,'setuid'), \
             patch.object(os,'getuid',return_value=60011),patch.object(os,'geteuid',return_value=60011), \
             patch.object(os,'getgid',return_value=60012),patch.object(os,'getegid',return_value=60012), \
             patch.object(os,'getgroups',return_value=[0]),patch.object(subprocess,'Popen') as spawn:
            with self.assertRaises(SystemExit) as stopped:exec(compile(M.HOST_COMMAND,'<fixed-host-command>','exec'),{})
            self.assertEqual(stopped.exception.code,125);spawn.assert_not_called()

    def test_public_identity_rejects_unproven_ids_names_bits_or_extra_fields(self):
        cap=capsule();sent=C.request('admit',C.STAGE_PLAN,'a'*64,C.control_request_nonce(cap))
        result={**S._setup_successor_failure('SYNTHETIC_FAILURE',cap),
            'status':'DEVELOPMENT_STEP_COMPLETE','code':'DEVELOPMENT_STEP_COMPLETE',
            'receipt_sha256':'d'*64,'identity':identity()}
        C.development_result(result,sent,cap)
        changes=[{'uid':value} for value in (0,2000,True,'60011')]
        changes += [{'gid':value} for value in (0,2000,False,'60012')]
        changes += [{'proof_sha256':'0'*64},{'account_name':'private'},{'pid':123}]
        changes += [{key:False} for key in ('uid_absent_from_nss','gid_absent_from_nss',
                                          'uid_absent_from_processes','gid_absent_from_processes')]
        for update in changes:
            altered={**identity(),**update}
            if 'proof_sha256' not in update:
                altered['proof_sha256']=M.digest(M.encoded({key:value for key,value in altered.items() if key!='proof_sha256'}))
            with self.subTest(update=update),self.assertRaises(ValueError):
                C.development_result({**result,'identity':altered},sent,cap)
        for value in (None,{},identity(2000,60012)):
            with self.assertRaises(ValueError):C.development_result({**result,'identity':value},sent,cap)

    def test_prepare_client_stops_on_cross_phase_identity_change(self):
        with tempfile.TemporaryDirectory() as directory:
            env={'GITHUB_REPOSITORY':C.REPOSITORY,'GITHUB_REPOSITORY_OWNER':'ernisch','GITHUB_REF':C.BRANCH,
                 'GITHUB_WORKFLOW_REF':C.WORKFLOW_REF,'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_SHA':'b'*40,
                 'HELMUT_NATIVE_OPERATION':'admit','HELMUT_NATIVE_CONTROL_MODE':'development-v1',
                 'HELMUT_NATIVE_PLAN_SHA256':C.STAGE_PLAN,'HELMUT_NATIVE_PAYLOAD_SHA256':'a'*64,
                 'HELMUT_DEVELOPMENT_ACTION':'prepare','RUNNER_TEMP':directory}
            phases=[]
            def exchange(environment,output):
                cap=json.loads(C.base64.b64decode(environment['HELMUT_NATIVE_SETUP_CAPSULE']))
                phases.append(cap['phase'])
                value=identity() if len(phases)==1 else identity(60013,60014)
                C.write_public_artifact(output,{'result':{'identity':value}})
                return 0
            with patch.object(C,'client',side_effect=exchange):
                with self.assertRaisesRegex(ValueError,'development-identity-binding'):C.development_client(env)
            self.assertEqual(phases,['tools','source'])


if __name__ == '__main__': unittest.main()
