"""Public ingestion mocks and own synthetic files only; never executes Git."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import types
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).with_name('hetzner-native-public-checkout.py')
fd=os.open(SOURCE,os.O_RDONLY|os.O_NOATIME|os.O_NOFOLLOW)
with os.fdopen(fd,'rb') as stream:RAW=stream.read()
M=types.ModuleType('fixed_public_checkout_under_test')
exec(compile(RAW,str(SOURCE),'exec'),M.__dict__)


def oid(data):return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()


class CheckoutTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='.public-checkout-synthetic-',dir=SOURCE.parent.parent)
        self.addCleanup(self.temp.cleanup);self.base=Path(self.temp.name)
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(M,'BASE',self.base))
        self.stack.enter_context(patch.object(M,'root_required'))
        self.stack.enter_context(patch.object(M,'root_owner',return_value=True))
        # Keep the ownership model local to the module under test. Host files
        # retain the caller's real ownership; source observations start at an
        # explicit non-1000 identity even on a developer machine with UID 1000.
        source_os=types.SimpleNamespace(**{name:getattr(os,name) for name in dir(os)})
        self.stack.enter_context(patch.object(M,'os',source_os))
        self.owners={}
        def view(info):
            uid,gid=self.owners.get((info.st_dev,info.st_ino),(12345,23456))
            fields={key:getattr(info,key) for key in dir(info) if key.startswith('st_')}
            return types.SimpleNamespace(**{**fields,'st_uid':uid,'st_gid':gid})
        self.stack.enter_context(patch.object(source_os,'stat',side_effect=lambda *a,**kw:view(os.stat(*a,**kw))))
        self.stack.enter_context(patch.object(source_os,'fstat',side_effect=lambda fd:view(os.fstat(fd))))
        # Exercise the root-only ownership contract without changing any host
        # account's ownership. GitHub's runner need not itself have UID 1000.
        def chown(*args,**kwargs):
            self.assertEqual(args[1:],(1000,1000))
            info=(os.fstat(args[0]) if isinstance(args[0],int)
                  else os.stat(args[0],**kwargs))
            self.owners[(info.st_dev,info.st_ino)]=(1000,1000)
        self.chown=self.stack.enter_context(patch.object(M.os,'chown',side_effect=chown))
        self.fchown=self.stack.enter_context(patch.object(M.os,'fchown',side_effect=chown))
        self.stack.enter_context(patch.object(M,'open_base',side_effect=lambda:os.open(self.base,M.D)))
        self.stack.enter_context(patch.object(M,'capacity',side_effect=lambda end,extra=0:M.need(time.monotonic()<end,'DEADLINE')))
        self.stack.enter_context(patch.object(M.subprocess,'Popen',side_effect=AssertionError('real processes forbidden')))
        self.rows={'code.js':('100644',b'// synthetic public code\n'),
                   'bin/tool':('100755',b'#!/bin/false\n'), 'alias':('120000',b'code.js')}
        self.events=[];self.dirty=b'';self.tree=M.TREE;self.head=M.COMMIT;self.corrupt=False
        self.executor=self.stack.enter_context(patch.object(M,'git',side_effect=self.git))

    @property
    def repo(self):return self.base/M.PARENT/M.LEAF

    def git(self,args,repo,deadline):
        self.assertEqual(repo,self.repo);self.events.append(tuple(args))
        command=args[0]
        if command=='init':
            (repo/'.git').mkdir(mode=0o700)
            (repo/'.git/config').write_bytes(b'[core]\n bare=false\n')
            (repo/'.git/index').write_bytes(b'synthetic index only')
        elif command=='fetch':
            self.assertEqual(args,('fetch','--quiet','--no-tags','--depth=1','--no-recurse-submodules',
                                   '--no-write-fetch-head',M.REPOSITORY,M.COMMIT))
        elif command=='rev-parse':
            return ((self.tree if args[2].endswith('^{tree}') else self.head)+'\n').encode()
        elif command in ('ls-tree','ls-files'):
            result=[]
            for name,(mode,data) in sorted(self.rows.items()):
                prefix=(mode+' blob '+oid(data)) if command=='ls-tree' else (mode+' '+oid(data)+' 0')
                result.append(prefix.encode()+b'\t'+name.encode()+b'\0')
            return b''.join(result)
        elif command=='checkout':
            self.assertEqual(args,('checkout','--quiet','--detach','--no-recurse-submodules',M.COMMIT))
            for name,(mode,data) in self.rows.items():
                target=repo/name;target.parent.mkdir(parents=True,exist_ok=True)
                if mode=='120000':target.symlink_to(data.decode())
                else:target.write_bytes(data+(b'CORRUPT' if self.corrupt else b''))
        elif command=='status':return self.dirty
        else:self.fail('unexpected command '+repr(args))
        return b''

    def test_default_and_import_are_inert_before_any_filesystem_or_git(self):
        with patch.object(M,'create_public_checkout',side_effect=AssertionError('must be inert')),\
             contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(M.main([]),2)
            self.assertEqual(M.main(['--unknown']),2)
        self.assertIn('NOT_EXECUTED',output.getvalue());self.executor.assert_not_called()

    def test_complete_fixed_checkout_modes_owner_link_hash_and_durable_receipt(self):
        result=M.create_public_checkout()
        self.assertEqual(result['status'],'PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED',result)
        self.assertFalse(result['native_qualified']);self.assertEqual(result['files'],3)
        self.assertEqual((self.repo/'code.js').read_bytes(),self.rows['code.js'][1])
        self.assertEqual(os.readlink(self.repo/'alias'),'code.js')
        for name,mode in [('code.js',0o644),('bin/tool',0o755),('.git/config',0o600)]:
            info=(self.repo/name).stat()
            self.assertEqual((info.st_uid,info.st_gid,stat.S_IMODE(info.st_mode)),
                             (os.getuid(),os.getgid(),mode))
        self.assertEqual(self.base.stat().st_mode & 0o777,0o700)
        self.assertEqual((self.base/M.PARENT).stat().st_mode & 0o777,0o700)
        self.assertEqual(self.repo.stat().st_uid,os.getuid())
        observed=M.os.stat(self.repo/'code.js',follow_symlinks=False)
        self.assertEqual((observed.st_uid,observed.st_gid),(1000,1000))
        self.chown.assert_any_call(self.repo,1000,1000)
        for name in ('code.js','tool','alias'):
            self.assertTrue(any(call.args==(name,1000,1000) and
                                call.kwargs.get('follow_symlinks') is False
                                for call in self.chown.call_args_list))
        self.assertTrue(self.fchown.called)
        self.assertEqual(json.loads((self.base/M.READY).read_bytes()),result)
        self.assertFalse((self.base/M.PENDING).exists());self.assertFalse((self.base/M.ERROR).exists())

    def test_ignored_owner_update_fails_the_actual_metadata_readback(self):
        self.chown.side_effect=lambda *args,**kwargs:None
        result=M.create_public_checkout()
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(result['code'],'TRACKED_METADATA')
        self.assertFalse((self.base/M.READY).exists())
        self.assertTrue((self.base/M.ERROR).exists())

    def test_ownership_failure_retains_attempt_error_and_partial_without_ready(self):
        self.chown.side_effect=PermissionError(1,'synthetic owner update denied')
        result=M.create_public_checkout()
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(result['code'],'FILESYSTEM_OR_FORMAT_FAILURE')
        self.assertTrue((self.base/M.ATTEMPT).exists())
        self.assertTrue(self.repo.exists())
        self.assertFalse((self.base/M.READY).exists())
        error=json.loads((self.base/M.ERROR).read_bytes())
        self.assertEqual((error['exception_type'],error['errno']),('PermissionError',1))

    def test_completed_slot_cannot_be_retried_or_create_new_error(self):
        first=M.create_public_checkout();before=(self.base/M.READY).read_bytes();calls=self.executor.call_count
        second=M.create_public_checkout()
        self.assertEqual(first['status'],'PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED')
        self.assertEqual(second['code'],'ALREADY_ATTEMPTED');self.assertEqual(self.executor.call_count,calls)
        self.assertEqual((self.base/M.READY).read_bytes(),before);self.assertFalse((self.base/M.ERROR).exists())

    def test_existing_output_is_never_adopted_modified_or_fetched(self):
        self.repo.mkdir(parents=True,mode=0o700);(self.repo/'existing').write_bytes(b'preserve')
        (self.base/M.PARENT).chmod(0o700)
        result=M.create_public_checkout()
        self.assertEqual(result['code'],'OUTPUT_EXISTS');self.executor.assert_not_called()
        self.assertEqual((self.repo/'existing').read_bytes(),b'preserve')
        self.assertFalse((self.base/M.READY).exists())

    def test_parent_symlink_is_not_followed(self):
        destination=self.base/'own-other';destination.mkdir()
        (self.base/M.PARENT).symlink_to(destination,target_is_directory=True)
        result=M.create_public_checkout();self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.executor.assert_not_called();self.assertEqual(list(destination.iterdir()),[])

    def test_root_preflight_failure_happens_before_file_or_git_access(self):
        with patch.object(M,'root_required',side_effect=M.Stop('ROOT_REQUIRED')),patch.object(M,'open_base') as opening:
            result=M.create_public_checkout()
        self.assertEqual(result['code'],'ROOT_REQUIRED');opening.assert_not_called();self.executor.assert_not_called()

    def test_wrong_tree_stops_before_checkout_and_preserves_slot(self):
        self.tree='0'*40;result=M.create_public_checkout()
        self.assertEqual(result['code'],'TREE_PIN')
        self.assertNotIn('checkout',[args[0] for args in self.events])
        self.assertTrue((self.base/M.ATTEMPT).exists());self.assertFalse((self.base/M.READY).exists())

    def test_wrong_commit_is_never_adopted(self):
        self.head='0'*40;result=M.create_public_checkout()
        self.assertEqual(result['code'],'COMMIT_PIN');self.assertFalse((self.base/M.READY).exists())

    def test_submodule_rejected_before_checkout_and_no_recursive_git(self):
        self.rows['module']=('160000',b'synthetic gitlink')
        result=M.create_public_checkout();self.assertEqual(result['code'],'TRACKED_MODE_OR_OBJECT')
        self.assertNotIn('checkout',[args[0] for args in self.events])
        self.assertFalse(any('submodule'==arg for args in self.events for arg in args))

    def test_lfs_pointer_never_becomes_success_or_substitute_download(self):
        self.rows['large.bin']=('100644',b'version https://git-lfs.github.com/spec/v1\noid sha256:synthetic\nsize 1\n')
        result=M.create_public_checkout();self.assertEqual(result['code'],'LFS_POINTER')
        self.assertTrue((self.repo/'large.bin').exists());self.assertFalse((self.base/M.READY).exists())

    def test_actual_blob_mismatch_preserves_materialized_partial(self):
        self.corrupt=True;result=M.create_public_checkout()
        self.assertEqual(result['code'],'TRACKED_HASH');self.assertFalse((self.base/M.READY).exists())
        self.assertIn(b'CORRUPT',(self.repo/'code.js').read_bytes())

    def test_symlink_escape_is_rejected_without_reading_target(self):
        self.rows['alias']=('120000',b'../../outside-synthetic')
        result=M.create_public_checkout();self.assertEqual(result['code'],'UNQUALIFIED_SYMLINK')
        self.assertFalse((self.base/M.READY).exists())

    def escaped_symlink_rows(self):
        self.rows.update({'dir/data.txt':('100644',b'only synthetic directory entry'),
            'deep/safe':('100644',b'synthetic lexical destination'),
            'deep/a/hop':('120000',b'../../dir'),
            'rootlink':('120000',b'deep/a/hop/../../safe')})

    def test_intermediate_symlink_dotdot_escape_cannot_be_normalized_away(self):
        self.escaped_symlink_rows()
        self.repo.parent.mkdir(mode=0o700)
        outside=self.repo.parent/'safe';outside.write_bytes(b'own outside fixture only')
        os.utime(outside,ns=(1000000000,2000000000));before=outside.stat()
        result=M.create_public_checkout()
        self.assertEqual(result['code'],'UNQUALIFIED_SYMLINK')
        self.assertFalse((self.base/M.READY).exists())
        self.assertEqual(outside.stat(),before)

    def test_intermediate_symlink_dotdot_dangling_escape_is_also_rejected(self):
        self.escaped_symlink_rows()
        result=M.create_public_checkout()
        self.assertEqual(result['code'],'UNQUALIFIED_SYMLINK')
        self.assertFalse((self.repo.parent/'safe').exists())
        self.assertFalse((self.base/M.READY).exists())

    def test_normal_relative_parent_link_within_public_tree_is_qualified(self):
        self.rows['deep/up']=('120000',b'../code.js')
        result=M.create_public_checkout()
        self.assertEqual(result['status'],'PUBLIC_CHECKOUT_READY_NOT_NATIVE_QUALIFIED',result)
        self.assertEqual(os.readlink(self.repo/'deep/up'),'../code.js')
        self.assertEqual(result['files'],4)

    def test_dirty_checkout_blocks_publication(self):
        self.dirty=b'?? synthetic-extra\0';result=M.create_public_checkout()
        self.assertEqual(result['code'],'DIRTY_CHECKOUT');self.assertFalse((self.base/M.READY).exists())

    def test_pending_receipt_corruption_blocks_atomic_publication(self):
        write=M.write_new
        def corrupt(fd,name,data):
            write(fd,name,data)
            if name==M.PENDING:(self.base/name).write_bytes(b'['+data[1:])
        with patch.object(M,'write_new',side_effect=corrupt),patch.object(M,'publish') as publish:
            result=M.create_public_checkout()
        self.assertEqual(result['code'],'RECEIPT_READBACK');publish.assert_not_called()
        self.assertFalse((self.base/M.READY).exists());self.assertTrue((self.base/M.PENDING).exists())

    def test_publication_failure_retains_pending_and_never_returns_ready(self):
        with patch.object(M,'publish',side_effect=M.Stop('PUBLICATION_FAILED')):result=M.create_public_checkout()
        self.assertEqual(result['code'],'PUBLICATION_FAILED');self.assertFalse((self.base/M.READY).exists())
        self.assertTrue((self.base/M.PENDING).exists())

    def test_git_failure_preserves_bounded_first_error_and_blocks_retry(self):
        with patch.object(M,'git',side_effect=M.Stop('GIT_FAILED',b'x'*100000,b'y'*100000)):
            result=M.create_public_checkout()
        self.assertEqual(result['code'],'GIT_FAILED')
        path=self.base/M.ERROR;before=path.read_bytes();record=json.loads(before)
        self.assertLess(len(before),16384);self.assertEqual(len(record['stderr_prefix_hex']),4096)
        second=M.create_public_checkout();self.assertEqual(second['code'],'ALREADY_ATTEMPTED')
        self.assertEqual(path.read_bytes(),before)

    def test_index_object_mode_and_stage_must_match_expected_tree(self):
        real=self.git
        def changed(args,*rest):
            raw=real(args,*rest)
            if args[0]=='ls-files':return raw.replace(b'100644 ',b'100755 ',1)
            return raw
        with patch.object(M,'git',side_effect=changed):result=M.create_public_checkout()
        self.assertEqual(result['code'],'INDEX_TREE');self.assertFalse((self.base/M.READY).exists())

    def test_attempt_fsync_failure_never_reaches_git_or_reopens_slot(self):
        fsync=os.fsync;calls=[]
        def fail_once(fd):
            calls.append(fd)
            if len(calls)==1:raise OSError('synthetic ledger durability failure')
            return fsync(fd)
        with patch.object(M.os,'fsync',side_effect=fail_once):result=M.create_public_checkout()
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY');self.executor.assert_not_called()
        self.assertTrue((self.base/M.ATTEMPT).exists());self.assertFalse((self.base/M.READY).exists())
        self.assertEqual(M.create_public_checkout()['code'],'ALREADY_ATTEMPTED')

    def test_materialized_hardlink_is_not_a_valid_public_checkout(self):
        self.rows['copy.js']=self.rows['code.js'];real=self.git
        def linked(args,*rest):
            data=real(args,*rest)
            if args[0]=='checkout':
                (self.repo/'copy.js').unlink();os.link(self.repo/'code.js',self.repo/'copy.js')
            return data
        with patch.object(M,'git',side_effect=linked):result=M.create_public_checkout()
        self.assertEqual(result['code'],'TRACKED_HARDLINK');self.assertFalse((self.base/M.READY).exists())

    def test_index_nonzero_stage_is_rejected(self):
        real=self.git
        def staged(args,*rest):
            data=real(args,*rest)
            return data.replace(b' 0\t',b' 1\t',1) if args[0]=='ls-files' else data
        with patch.object(M,'git',side_effect=staged):result=M.create_public_checkout()
        self.assertEqual(result['code'],'INDEX_STAGE');self.assertFalse((self.base/M.READY).exists())

    def test_atomic_publish_never_replaces_existing_entry(self):
        (self.base/M.PENDING).write_bytes(b'candidate');(self.base/M.READY).write_bytes(b'existing')
        fd=os.open(self.base,M.D)
        try:
            with self.assertRaises(M.Stop) as raised:M.publish(fd)
            self.assertEqual(raised.exception.code,'PUBLICATION_FAILED')
        finally:os.close(fd)
        self.assertEqual((self.base/M.READY).read_bytes(),b'existing')
        self.assertEqual((self.base/M.PENDING).read_bytes(),b'candidate')


class GitBoundaryTests(unittest.TestCase):
    def test_root_identity_private_permissions_and_nofollow_flags(self):
        info=types.SimpleNamespace(st_mode=stat.S_IFDIR|0o700,st_uid=0,st_gid=0)
        M.directory(info,True)
        for changed in (types.SimpleNamespace(st_mode=stat.S_IFDIR|0o755,st_uid=0,st_gid=0),
                        types.SimpleNamespace(st_mode=stat.S_IFDIR|0o700,st_uid=1000,st_gid=1000),
                        types.SimpleNamespace(st_mode=stat.S_IFLNK|0o700,st_uid=0,st_gid=0)):
            with self.assertRaises(M.Stop):M.directory(changed,True)
        self.assertTrue(M.D & os.O_NOFOLLOW);self.assertTrue(M.R & os.O_NOATIME)
        for selected in ('getuid','geteuid','getgid','getegid'):
            with contextlib.ExitStack() as stack:
                for name in ('getuid','geteuid','getgid','getegid'):
                    stack.enter_context(patch.object(M.os,name,return_value=1000 if name==selected else 0))
                with self.assertRaises(M.Stop) as raised:M.root_required()
                self.assertEqual(raised.exception.code,'ROOT_REQUIRED')

    def test_capacity_requires_floor_and_checks_deadline_without_actual_disk(self):
        with patch.object(M.os,'statvfs',return_value=types.SimpleNamespace(f_bavail=M.FLOOR,f_frsize=1)):
            M.capacity(time.monotonic()+1)
            with self.assertRaises(M.Stop) as raised:M.capacity(time.monotonic()+1,1)
            self.assertEqual(raised.exception.code,'DISK_FLOOR')
        with patch.object(M.os,'statvfs') as disk:
            with self.assertRaises(M.Stop) as raised:M.capacity(time.monotonic()-1)
            self.assertEqual(raised.exception.code,'DEADLINE');disk.assert_not_called()

    def test_git_output_bound_and_timeout_kill_only_mock_own_group(self):
        for mode in ('output','timeout'):
            out_read,out_write=os.pipe();err_read,err_write=os.pipe()
            process=types.SimpleNamespace(stdout=os.fdopen(out_read,'rb',buffering=0),
                stderr=os.fdopen(err_read,'rb',buffering=0),pid=123456,wait=unittest.mock.Mock(return_value=0))
            if mode=='output':
                os.write(out_write,b'public output exceeds tiny test cap');os.close(out_write);out_write=None
                os.close(err_write);err_write=None
            try:
                def check(end,extra=0):M.need(time.monotonic()<end,'DEADLINE')
                with patch.object(M.subprocess,'Popen',return_value=process),patch.object(M,'OUT_CAP',8),\
                     patch.object(M,'capacity',side_effect=check),patch.object(M.os,'killpg') as kill:
                    with self.assertRaises(M.Stop) as raised:
                        M.git(('synthetic-mock',),Path('/fixed-public-test'),time.monotonic()+(.03 if mode=='timeout' else 1))
                self.assertEqual(raised.exception.code,'DEADLINE' if mode=='timeout' else 'GIT_OUTPUT_BOUND')
                kill.assert_called_once_with(123456,M.signal.SIGKILL)
                process.wait.assert_called_once_with(timeout=5)
            finally:
                if out_write is not None:os.close(out_write)
                if err_write is not None:os.close(err_write)

    def test_clean_environment_fixed_transport_options_and_bounded_mock_streams(self):
        process=types.SimpleNamespace(stdout=None,stderr=None,pid=123456,wait=lambda **_:0)
        out_read,out_write=os.pipe();err_read,err_write=os.pipe()
        os.write(out_write,b'synthetic git stdout');os.close(out_write);os.close(err_write)
        process.stdout=os.fdopen(out_read,'rb',buffering=0);process.stderr=os.fdopen(err_read,'rb',buffering=0)
        with patch.object(M.subprocess,'Popen',return_value=process) as popen,patch.object(M,'capacity'):
            self.assertEqual(M.git(('status','--porcelain'),Path('/fixed-public-test'),time.monotonic()+5),b'synthetic git stdout')
        args=popen.call_args.args[0];env=popen.call_args.kwargs['env']
        self.assertEqual(args[0],'/usr/bin/git');self.assertEqual(args[-2:],['status','--porcelain'])
        self.assertEqual(env,M.ENV);self.assertNotIn('SSH_AUTH_SOCK',env);self.assertNotIn('GH_TOKEN',env)
        self.assertEqual(env['GIT_TERMINAL_PROMPT'],'0');self.assertEqual(env['GIT_CONFIG_GLOBAL'],'/dev/null')
        self.assertTrue(popen.call_args.kwargs['start_new_session']);self.assertTrue(popen.call_args.kwargs['close_fds'])
        for option in ('core.hooksPath=/dev/null','core.fsmonitor=false','credential.helper=',
                       'maintenance.auto=false','gc.auto=0','protocol.allow=never','protocol.https.allow=always'):
            self.assertIn(option,args)
        self.assertNotIn('shell',popen.call_args.kwargs)


if __name__=='__main__':unittest.main(verbosity=2)
