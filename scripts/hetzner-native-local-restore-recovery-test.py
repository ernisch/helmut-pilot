"""Synthetic own-temp tests. No actual target, originals, service or native I/O."""
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('recovery_synthetic', ROOT/'scripts/hetzner-native-local-restore-recovery.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='.recovery-synthetic-', dir=ROOT)
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.stack = contextlib.ExitStack()
        self.addCleanup(self.stack.close)
        for name in ('getuid', 'geteuid', 'getgid', 'getegid'):
            self.stack.enter_context(patch.object(M.os, name, return_value=0))
        self.stack.enter_context(patch.object(M, 'owner', return_value=True))
        for name, value in (('BASE', str(self.base)), ('FLOOR', 0), ('TOTAL_BYTES', 7),
                            ('FILE_COUNT', 2), ('ENTRY_COUNT', 3), ('GZIP_SIZE', 3),
                            ('GZIP_SHA', hashlib.sha256(b'zip').hexdigest())):
            self.stack.enter_context(patch.object(M, name, value))
        (self.base/'once').mkdir(mode=0o700)
        (self.base/M.CASE_DIR/'restored').mkdir(parents=True, mode=0o700)
        (self.base/M.CASE_DIR).chmod(0o700)
        self.binding = {'schema':'helmut-private-drive-stage-case-binding-v1', 'nonce':'1'*64,
            'source_sha256':M.OLD_SOURCE, 'capsule_sha256':'2'*64, 'case_id':M.CASE, 'scope_sha256':M.SCOPE}
        self.error = {'schema':'helmut-private-drive-stage-result-v1', 'status':'FAIL_KEEP_STATE_NO_RETRY',
            'code':'STAGE_RESTORE', 'native_qualified':False, 'plan_sha256':M.PLAN, 'case_id':M.CASE,
            'scope_sha256':M.SCOPE, 'capsule_sha256':'2'*64, 'cipher_sha256':M.CIPHER,
            'compressed_tar_sha256':M.GZIP_SHA}
        self.old = {'schema':'helmut-bound-byte-restore-v1', 'ok':False, 'status':'FAIL_KEEP_STATE_NO_RETRY',
            'scope_sha256':M.SCOPE, 'native_qualified':False, 'code':'PATH_ESCAPE',
            'actual_file_count':0, 'actual_bytes':0, 'actual_files':[], 'metadata_state':'UNKNOWN',
            'partial_file_state':'NONE', 'remaining_entries':3, 'unverified_entries':['x','y','z']}
        for relative, value in zip(M.OLD_FILES, (self.binding, self.error, self.old)):
            self.save(relative, value)
        fd = os.open(self.base/M.INPUT, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)
        os.write(fd,b'zip');os.close(fd)
        self.complete = {'schema':'helmut-bound-byte-restore-v1', 'ok':True,
            'status':'BYTES_RESTORED_NOT_NATIVE_QUALIFIED', 'native_qualified':False, 'scope_sha256':M.SCOPE,
            'actual_file_count':2, 'actual_bytes':7, 'remaining_entries':0, 'unverified_entries':[],
            'partial_file_state':'NONE', 'metadata_state':'VERIFIED', 'actual_files':[
                {'archiveMember':'files/synthetic/a', 'sha256':'a'*64, 'bytes':3},
                {'archiveMember':'files/synthetic/b', 'sha256':'b'*64, 'bytes':4}]}

    def save(self, relative, value):
        raw=M.encoded(value)
        fd=os.open(self.base/relative,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
        os.write(fd,raw);os.close(fd)
        return hashlib.sha256(raw).hexdigest()

    def source(self, pre='', post='', saved=None):
        value=self.complete if saved is None else saved
        code=('import os, json, hashlib\n'
              'def restore_bound_archive(source, output):\n'
              '    os.mkdir(output,0o700)\n'
              '    marker=os.open(output+"/SYNTHETIC_CALLED_ONCE",os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)\n'
              '    os.close(marker)\n'+pre+
              '    value='+repr(value)+'\n'
              '    raw=(json.dumps(value,sort_keys=True,separators=(",",":"))+"\\n").encode()\n'
              '    fd=os.open(output+"/RESTORE_RECEIPT.PRIVATE.json",os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)\n'
              '    os.write(fd,raw);os.fsync(fd);os.close(fd)\n'
              '    value.update(receipt_saved=True,receipt_sha256=hashlib.sha256(raw).hexdigest())\n'+post+
              '    return value\n').encode()
        return code

    def run_case(self, source=None, expected=None, deadline=None):
        source=self.source() if source is None else source
        expected=M.read(M.OLD_FILES[2],1024**2,time.monotonic()+60)[1] if expected is None else expected
        with patch.object(M,'RESTORE_SOURCE',hashlib.sha256(source).hexdigest()):
            return M.recover(expected,source,time.monotonic()+60 if deadline is None else deadline)

    def failed(self, result, code=None):
        self.assertEqual(result['status'],'FAIL_KEEP_STATE_NO_RETRY',result)
        self.assertFalse(result['native_qualified']);self.assertFalse(result['native_go_consumed'])
        self.assertFalse((self.base/M.READY).exists())
        if code is not None:self.assertEqual(result['code'],code,result)

    def test_success_binds_saved_receipt_and_preserves_all_historical_file_metadata(self):
        before=[M.read(p,1024**2,time.monotonic()+60) for p in M.OLD_FILES]
        original=M.read(M.INPUT,3,time.monotonic()+60,True)
        result=self.run_case()
        self.assertEqual(result['status'],'RESTORED_NOT_NATIVE_QUALIFIED',result)
        self.assertFalse(result['native_qualified']);self.assertFalse(result['native_go_consumed'])
        self.assertEqual(M.parsed(M.read(M.READY,32768,time.monotonic()+60)[0]),result)
        self.assertEqual([M.read(p,1024**2,time.monotonic()+60) for p in M.OLD_FILES],before)
        self.assertEqual(M.read(M.INPUT,3,time.monotonic()+60,True),original)
        self.assertTrue((self.base/M.OUTPUT/'SYNTHETIC_CALLED_ONCE').exists())
        self.assertFalse((self.base/'STAGE_READY.SAFE.json').exists())

    def test_completed_or_unknown_attempt_is_not_retried_or_reclassified(self):
        self.save(M.ATTEMPT,{'state':'UNKNOWN'})
        result=self.run_case();self.failed(result,'ALREADY_ATTEMPTED')
        self.assertFalse((self.base/M.OUTPUT).exists());self.assertFalse((self.base/M.ERROR).exists())

    def test_losing_exclusive_reservation_does_not_poison_the_winning_attempt(self):
        real=M.new
        def race(relative,value,deadline):
            if relative==M.ATTEMPT:
                self.save(M.ATTEMPT,{'state':'OTHER_UNKNOWN_ATTEMPT_NO_RETRY'})
                raise FileExistsError(17,'synthetic-reservation-race')
            return real(relative,value,deadline)
        with patch.object(M,'new',side_effect=race):result=self.run_case()
        self.failed(result,'ALREADY_ATTEMPTED')
        self.assertFalse((self.base/M.ERROR).exists());self.assertFalse((self.base/M.OUTPUT).exists())

    def test_expiry_after_restore_does_not_publish_success(self):
        marker=self.base/M.OUTPUT/'SYNTHETIC_CALLED_ONCE'
        with patch.object(M.time,'monotonic',side_effect=lambda:100 if marker.exists() else 0):
            result=self.run_case()
        self.failed(result,'DEADLINE');self.assertTrue(marker.exists())

    def test_error_appearing_during_restore_prevents_publication(self):
        path=str(self.base/M.ERROR)
        pre='    with open('+repr(path)+',"xb") as f: f.write(b"synthetic-preserved-conflict")\n'
        self.failed(self.run_case(source=self.source(pre=pre)),'RECOVERY_CONFLICT')

    def test_directory_lock_loser_never_writes_error_or_attempt(self):
        fd=os.open(self.base,M.R|os.O_DIRECTORY)
        try:
            M.fcntl.flock(fd,M.fcntl.LOCK_EX|M.fcntl.LOCK_NB)
            self.failed(self.run_case(),'RECOVERY_BUSY')
            self.assertFalse((self.base/M.ERROR).exists());self.assertFalse((self.base/M.ATTEMPT).exists())
        finally:os.close(fd)
        self.assertEqual(self.run_case()['status'],'RESTORED_NOT_NATIVE_QUALIFIED')

    def test_error_persistence_still_holds_exclusive_directory_lock(self):
        real=M.new;checked=[]
        def check(relative,value,deadline):
            if relative==M.ERROR:
                fd=os.open(self.base,M.R|os.O_DIRECTORY)
                try:
                    with self.assertRaises(BlockingIOError):M.fcntl.flock(fd,M.fcntl.LOCK_EX|M.fcntl.LOCK_NB)
                    checked.append(True)
                finally:os.close(fd)
            return real(relative,value,deadline)
        with patch.object(M,'new',side_effect=check):result=self.run_case(expected='0'*64)
        self.failed(result,'HISTORICAL_RECEIPT_HASH');self.assertTrue(checked)

    def test_failed_durable_reservation_readback_reports_unknown(self):
        real=M.read
        def fail(relative,*args,**kwargs):
            if relative==M.ATTEMPT:raise M.Stop('SYNTHETIC_RESERVATION_READBACK')
            return real(relative,*args,**kwargs)
        with patch.object(M,'read',side_effect=fail):result=self.run_case()
        self.failed(result,'SYNTHETIC_RESERVATION_READBACK')
        self.assertIsNone(result['recovery_once_reserved']);self.assertTrue((self.base/M.ATTEMPT).exists())

    def test_wrong_observed_hash_is_rejected_before_restore(self):
        self.failed(self.run_case(expected='0'*64),'HISTORICAL_RECEIPT_HASH')
        self.assertFalse((self.base/M.OUTPUT).exists())

    def test_wrong_historical_error_and_counts_are_rejected(self):
        self.old['code']='FILESYSTEM_OR_FORMAT_FAILURE';self.save(M.OLD_FILES[2],self.old)
        self.failed(self.run_case(),'HISTORICAL_RESTORE')

    def test_capsule_drift_is_rejected(self):
        self.error['capsule_sha256']='0'*64;self.save(M.OLD_FILES[1],self.error)
        self.failed(self.run_case(),'HISTORICAL_STAGE')

    def test_source_hash_mismatch_does_not_execute(self):
        with patch.object(M,'RESTORE_SOURCE','0'*64):
            result=M.recover('0'*64,self.source(),time.monotonic()+60)
        self.failed(result,'RESTORE_SOURCE_HASH');self.assertFalse((self.base/M.OUTPUT).exists())

    def test_input_hash_mismatch_is_rejected_before_attempt(self):
        fd=os.open(self.base/M.INPUT,os.O_WRONLY|os.O_TRUNC);os.write(fd,b'bad');os.close(fd)
        self.failed(self.run_case(),'INPUT_HASH');self.assertFalse((self.base/M.ATTEMPT).exists())

    def test_symlink_is_not_followed(self):
        p=self.base/M.INPUT;p.rename(p.with_name('synthetic-kept'));p.symlink_to('synthetic-kept')
        self.failed(self.run_case());self.assertFalse((self.base/M.OUTPUT).exists())

    def test_hardlink_is_not_accepted(self):
        os.link(self.base/M.INPUT,self.base/'synthetic-hardlink')
        self.failed(self.run_case(),'FILE_IDENTITY')

    def test_nonprivate_mode_is_not_accepted(self):
        (self.base/M.INPUT).chmod(0o644);self.failed(self.run_case(),'FILE_IDENTITY')

    def test_untrusted_owner_is_not_accepted(self):
        inode=(self.base/M.INPUT).stat().st_ino
        with patch.object(M,'owner',side_effect=lambda info:info.st_ino!=inode):
            result=self.run_case()
        self.failed(result,'FILE_IDENTITY')

    def test_capacity_stops_before_reservation(self):
        with patch.object(M.os,'statvfs',return_value=SimpleNamespace(f_bavail=0,f_frsize=1)):
            self.failed(self.run_case(),'CAPACITY')
        self.assertFalse((self.base/M.ATTEMPT).exists())

    def test_expired_deadline_stops_before_reservation(self):
        self.failed(self.run_case(deadline=time.monotonic()-1),'DEADLINE')
        self.assertFalse((self.base/M.ATTEMPT).exists())

    def test_one_nanosecond_metadata_drift_is_rejected(self):
        original=os.read;inode=(self.base/M.INPUT).stat().st_ino;changed=[]
        def drift(fd,size):
            data=original(fd,size)
            if data and os.fstat(fd).st_ino==inode and not changed:
                st=os.fstat(fd);os.utime(self.base/M.INPUT,ns=(st.st_atime_ns,st.st_mtime_ns+1));changed.append(True)
            return data
        with patch.object(M.os,'read',side_effect=drift):result=self.run_case()
        self.failed(result,'FILE_CHANGED');self.assertTrue(changed)

    def test_failed_restore_keeps_attempt_and_partial_and_refuses_repeat(self):
        code=self.source(pre='    return {"ok":False}\n')
        self.failed(self.run_case(source=code),'RESTORE_FAILED')
        self.assertTrue((self.base/M.ATTEMPT).exists());self.assertTrue((self.base/M.OUTPUT).exists())
        error=M.read(M.ERROR,32768,time.monotonic()+60)
        self.failed(self.run_case(),'ALREADY_ATTEMPTED')
        self.assertEqual(M.read(M.ERROR,32768,time.monotonic()+60),error)

    def test_saved_receipt_is_checked_independently_from_ok_return(self):
        value={**self.complete,'actual_file_count':1}
        self.failed(self.run_case(source=self.source(saved=value)),'RESTORE_RECEIPT')

    def test_returned_receipt_hash_must_match_saved_bytes(self):
        self.failed(self.run_case(source=self.source(post='    value["receipt_sha256"]="0"*64\n')),'RESTORE_RESULT_BINDING')

    def test_original_receipt_mutation_never_publishes_ready(self):
        path=str(self.base/M.OLD_FILES[0])
        pre='    with open('+repr(path)+',"ab") as f: f.write(b" ")\n'
        self.failed(self.run_case(source=self.source(pre=pre)),'ORIGINAL_RECEIPTS_CHANGED')

    def test_pending_write_failure_keeps_no_ready(self):
        real=M.new
        def fail(relative,value,deadline):
            if relative==M.PENDING:raise OSError(28,'synthetic')
            return real(relative,value,deadline)
        with patch.object(M,'new',side_effect=fail):result=self.run_case()
        self.failed(result);self.assertTrue((self.base/M.ATTEMPT).exists())

    def test_publication_failure_keeps_pending_and_no_ready(self):
        with patch.object(M,'publish',side_effect=M.Stop('PUBLICATION')):result=self.run_case()
        self.failed(result,'PUBLICATION');self.assertTrue((self.base/M.PENDING).exists())

    def test_default_entrypoint_has_no_execution_call(self):
        import ast
        with open(ROOT/'scripts/hetzner-native-local-restore-recovery.py','rb') as h:tree=ast.parse(h.read())
        entry=tree.body[-1]
        self.assertIsInstance(entry,ast.If)
        self.assertFalse(any(isinstance(x,ast.Call) and isinstance(x.func,ast.Name) and x.func.id=='recover'
                             for x in ast.walk(entry)))


if __name__=='__main__':
    unittest.main(verbosity=2)
