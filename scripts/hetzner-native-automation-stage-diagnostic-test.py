"""Fixed failed-stage diagnosis: own synthetic receipts only, never target I/O."""
import ast
import contextlib
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from helmut_native_test_support import ROOT, load_source, read_noatime

S=load_source('server');C=load_source('client')
PRIVATE='PRIVATE_ORIGINAL_PATH_OR_ERROR_MUST_NOT_LEAK'


class StageDiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='.stage-diagnostic-synthetic-',dir=ROOT)
        self.addCleanup(self.temp.cleanup);self.base=Path(self.temp.name)
        self.stack=contextlib.ExitStack();self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(S,'TARGET_BASE',str(self.base)))
        self.stack.enter_context(patch.object(S,'_owned',return_value=True))
        self.stack.enter_context(patch.object(S,'_open_base',side_effect=lambda _:os.open(self.base,S._DFLAGS)))
        for name in ('_bounded_tool','create_recipient','recover_recipient','_stage_handle'):
            self.stack.enter_context(patch.object(S,name,side_effect=AssertionError('no execution authority')))
        (self.base/'once').mkdir(mode=0o700)
        self.restored=self.base/('stage-'+S.STAGE_DIAG_CASE)/'restored'
        self.restored.mkdir(mode=0o700,parents=True);self.restored.parent.chmod(0o700)
        self.binding_path=self.base/'once'/(S.STAGE_PLAN+'.stage-case.json')
        self.error_path=self.base/'STAGE_FIRST_ERROR.SAFE.json'
        self.receipt_path=self.restored/'RESTORE_RECEIPT.PRIVATE.json'
        self.binding={'schema':'helmut-private-drive-stage-case-binding-v1','nonce':'1'*64,
            'source_sha256':S.STAGE_DIAG_SOURCE,'capsule_sha256':'2'*64,
            'case_id':S.STAGE_DIAG_CASE,'scope_sha256':S.STAGE_SCOPE}
        self.error=S._stage_result('STAGE_RESTORE','2'*64,{'case_id':S.STAGE_DIAG_CASE,
            'cipher_sha256':'3'*64,'compressed_tar_sha256':'4'*64})
        self.member='files/workspace/'+PRIVATE+'/saved.bin'
        self.receipt={'schema':'helmut-bound-byte-restore-v1','ok':False,
            'status':'FAIL_KEEP_STATE_NO_RETRY','scope_sha256':S.STAGE_SCOPE,'native_qualified':False,
            'actual_files':[{'archiveMember':self.member,'bytes':7,'sha256':'5'*64,
                             'uid':1000,'gid':1000,'mode':'0o600','mtime_ns':123}],
            'actual_file_count':1,'actual_bytes':7,'remaining_entries':1865,
            'unverified_entries':['files/workspace/'+PRIVATE+str(i) for i in range(1865)],
            'partial_file_state':'UNKNOWN','metadata_state':'UNKNOWN',
            'code':'FILESYSTEM_OR_FORMAT_FAILURE','private_note':PRIVATE}
        self.save(self.binding_path,self.binding);self.save(self.error_path,self.error);self.save(self.receipt_path,self.receipt)

    def save(self,path,value):
        raw=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'wb') as out:out.write(raw)
        return raw

    def valid(self,value):
        C.validate_stage_diagnostic(value)
        self.assertNotIn(PRIVATE,json.dumps(value))
        return value

    def test_saved_generic_failure_projects_only_finite_fields_counts_and_name_hash(self):
        raw=read_noatime(self.receipt_path);before=self.receipt_path.stat()
        value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['state'],'RECORDED');self.assertEqual(value['stage_code'],'STAGE_RESTORE')
        self.assertEqual(value['restore_code'],'FILESYSTEM_OR_FORMAT_FAILURE')
        self.assertEqual(value['actual_file_count'],1);self.assertEqual(value['actual_bytes'],7)
        self.assertEqual(value['remaining_entries'],1865)
        self.assertEqual(value['receipt_sha256'],hashlib.sha256(raw).hexdigest())
        self.assertEqual(value['last_verified_member_name_sha256'],hashlib.sha256(self.member.encode()).hexdigest())
        self.assertEqual(self.receipt_path.stat(),before)
        self.assertNotIn('actual_files',value);self.assertNotIn('unverified_entries',value)

    def test_only_three_fixed_files_are_read_and_slot_bytes_are_preserved(self):
        original=S._stage_diag_read;before=read_noatime(self.binding_path)
        with patch.object(S,'_stage_diag_read',wraps=original) as read:
            self.valid(S._stage_diagnostic())
        self.assertEqual([call.args[0] for call in read.call_args_list],['CASE_BINDING','STAGE_ERROR','RESTORE_RECEIPT'])
        self.assertEqual(read_noatime(self.binding_path),before)
        with self.assertRaises(S._Stop):S._stage_diag_read('../../other-file')

    def test_missing_receipt_is_absent_with_unknown_counts_and_no_success(self):
        self.receipt_path.unlink();value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['state'],'ABSENT');self.assertEqual(value['diagnostic_code'],'RESTORE_RECEIPT_ABSENT')
        self.assertEqual(value['stage_code'],'STAGE_RESTORE')
        self.assertIsNone(value['actual_file_count']);self.assertIsNone(value['actual_bytes'])
        self.assertIsNone(value['receipt_sha256']);self.assertIsNone(value['restore_status'])

    def test_missing_binding_is_absent_without_opening_private_restore_receipt(self):
        self.binding_path.unlink();original=S._stage_diag_read
        with patch.object(S,'_stage_diag_read',wraps=original) as read:value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['state'],'ABSENT');self.assertIsNone(value['actual_bytes'])
        self.assertEqual(read.call_count,1)

    def test_case_path_escape_is_rejected_before_any_restore_read(self):
        self.binding['case_id']='../../'+PRIVATE;self.save(self.binding_path,self.binding)
        original=S._stage_diag_read
        with patch.object(S,'_stage_diag_read',wraps=original) as read:value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['diagnostic_code'],'CASE_BINDING_INVALID');self.assertEqual(read.call_count,1)

    def test_wrong_source_and_error_capsule_binding_are_not_adopted(self):
        self.binding['source_sha256']='0'*64;self.save(self.binding_path,self.binding)
        self.assertEqual(self.valid(S._stage_diagnostic())['diagnostic_code'],'CASE_BINDING_INVALID')
        self.binding['source_sha256']=S.STAGE_DIAG_SOURCE;self.save(self.binding_path,self.binding)
        self.error['capsule_sha256']='0'*64;self.save(self.error_path,self.error)
        self.assertEqual(self.valid(S._stage_diagnostic())['diagnostic_code'],'STAGE_ERROR_INVALID')

    def test_oversized_receipt_is_unknown_without_partial_hash_or_counts(self):
        self.receipt_path.write_bytes(b'x'*(S.STAGE_DIAG_RECEIPT_CAP+1))
        value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['state'],'UNKNOWN');self.assertEqual(value['diagnostic_code'],'RESTORE_RECEIPT_OVERSIZE')
        self.assertIsNone(value['receipt_sha256']);self.assertIsNone(value['actual_file_count'])

    def test_nonprivate_mode_and_hardlink_are_untrusted(self):
        self.receipt_path.chmod(0o644)
        self.assertEqual(self.valid(S._stage_diagnostic())['diagnostic_code'],'RESTORE_RECEIPT_UNTRUSTED')
        self.receipt_path.chmod(0o600);os.link(self.receipt_path,self.restored/'own-hardlink')
        self.assertEqual(self.valid(S._stage_diagnostic())['diagnostic_code'],'RESTORE_RECEIPT_UNTRUSTED')

    def test_wrong_root_owner_is_untrusted_before_content_read(self):
        inode=self.receipt_path.stat().st_ino
        with patch.object(S,'_owned',side_effect=lambda info:info.st_ino!=inode):value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['diagnostic_code'],'RESTORE_RECEIPT_UNTRUSTED')

    def test_receipt_symlink_is_not_followed(self):
        self.receipt_path.rename(self.restored/'own-preserved')
        self.receipt_path.symlink_to('own-preserved')
        self.assertEqual(self.valid(S._stage_diagnostic())['diagnostic_code'],'RESTORE_RECEIPT_UNTRUSTED')

    def test_parent_symlink_is_not_followed(self):
        self.restored.rename(self.restored.parent/'own-preserved-root')
        self.restored.symlink_to('own-preserved-root',target_is_directory=True)
        self.assertEqual(self.valid(S._stage_diagnostic())['diagnostic_code'],'RESTORE_RECEIPT_UNTRUSTED')

    def test_one_nanosecond_metadata_drift_is_unknown(self):
        inode=self.receipt_path.stat().st_ino;original=os.read;changed=[]
        def read(fd,size):
            data=original(fd,size)
            if data and os.fstat(fd).st_ino==inode and not changed:
                before=self.receipt_path.stat();os.utime(self.receipt_path,ns=(before.st_atime_ns,before.st_mtime_ns+1));changed.append(True)
            return data
        with patch.object(S.os,'read',side_effect=read):value=self.valid(S._stage_diagnostic())
        self.assertTrue(changed);self.assertEqual(value['diagnostic_code'],'RESTORE_RECEIPT_UNTRUSTED')

    def test_unknown_private_code_is_hashed_but_never_echoed(self):
        self.receipt['code']=PRIVATE;raw=self.save(self.receipt_path,self.receipt)
        value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['diagnostic_code'],'RESTORE_RECEIPT_INVALID')
        self.assertEqual(value['receipt_sha256'],hashlib.sha256(raw).hexdigest())
        self.assertIsNone(value['restore_code']);self.assertIsNone(value['actual_bytes'])

    def test_malformed_json_and_nonfinite_constants_are_unknown(self):
        for raw in (b'{}'+PRIVATE.encode(),b'{"a":NaN}',b'{"a":1,"a":2}',b''):
            self.receipt_path.write_bytes(raw)
            value=self.valid(S._stage_diagnostic())
            self.assertEqual(value['diagnostic_code'],'RESTORE_RECEIPT_INVALID')
            self.assertIsNone(value['actual_file_count'])

    def test_saved_zero_verified_files_does_not_become_stage_success(self):
        self.receipt.update(actual_files=[],actual_file_count=0,actual_bytes=0,remaining_entries=1866,
                            unverified_entries=[PRIVATE]*1866)
        self.save(self.receipt_path,self.receipt);value=self.valid(S._stage_diagnostic())
        self.assertEqual(value['state'],'RECORDED');self.assertEqual(value['restore_status'],'FAIL_KEEP_STATE_NO_RETRY')
        self.assertEqual(value['partial_file_state'],'UNKNOWN');self.assertIsNone(value['last_verified_member_name_sha256'])

    def test_saved_complete_restore_still_does_not_qualify_the_failed_stage(self):
        rows=[{'archiveMember':'files/workspace/synthetic-'+str(i),'bytes':2865680705 if i==0 else 0}
              for i in range(1767)]
        self.receipt.update(ok=True,status='BYTES_RESTORED_NOT_NATIVE_QUALIFIED',actual_files=rows,
            actual_file_count=1767,actual_bytes=2865680705,remaining_entries=0,unverified_entries=[],
            metadata_state='VERIFIED',partial_file_state='NONE')
        del self.receipt['code'];self.save(self.receipt_path,self.receipt)
        value=self.valid(S._stage_diagnostic());self.assertEqual(value['stage_code'],'STAGE_RESTORE')
        self.assertIsNone(value['restore_code']);self.assertNotIn('native_qualified',value)

    def test_client_rejects_private_extra_fields_unknown_codes_and_fabricated_zero(self):
        value=S._stage_diagnostic()
        for key,item in (('private_paths',PRIVATE),('restore_code',PRIVATE),('actual_file_count',True),
                         ('last_verified_member_name_sha256',PRIVATE)):
            changed=copy.deepcopy(value);changed[key]=item
            with self.assertRaises(ValueError):C.validate_stage_diagnostic(changed)
        unknown=S._stage_diag_empty('ABSENT','RESTORE_RECEIPT_ABSENT','STAGE_RESTORE')
        unknown['actual_bytes']=0
        with self.assertRaises(ValueError):C.validate_stage_diagnostic(unknown)

    def test_status_accepts_optional_new_diagnostic_and_old_recipient_status_unchanged(self):
        recipient={'recipient':{'state':'ABSENT','sha256':None,'phase':None,'code':None},
                   'gpg':{'state':'ABSENT','sha256':None,'code':None,'stderr_classes':[]}}
        context={'base':str(self.base),'source_sha256':'a'*64,'deadline':time.monotonic()+30}
        with patch.object(S,'_recipient_diagnostic',return_value=recipient):result=S.handle({'operation':'status'},context)
        C.validate_result(result,'status','a'*64);self.assertEqual(result['recipient_diagnostic'],recipient)
        old=copy.deepcopy(result);del old['stage_diagnostic'];C.validate_result(old,'status','a'*64)
        with patch.object(S,'_recipient_ready',return_value={'status':'RECIPIENT_READY'}) as ready,\
             patch.object(S,'_stage_diagnostic') as diag:
            self.assertEqual(S.handle({'operation':'recipient'},context),{'status':'RECIPIENT_READY'})
        ready.assert_called_once_with(True);diag.assert_not_called()

    def test_restore_code_enum_matches_exact_reviewed_restore_source(self):
        raw=read_noatime(ROOT/'scripts/hetzner-native-stage-restore.py')
        self.assertEqual(hashlib.sha256(raw).hexdigest(),'c77dba4fe7fcbe34b419a668c19d55262af30eeaaad6c43650290e38cf39bd88')
        codes={'FILESYSTEM_OR_FORMAT_FAILURE'}
        for node in ast.walk(ast.parse(raw)):
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id in ('_sr_need','_SRStop'):
                value=node.args[-1] if node.func.id=='_sr_need' else node.args[0]
                if isinstance(value,ast.Constant) and isinstance(value.value,str):codes.add(value.value)
        self.assertEqual(set(S.STAGE_RESTORE_CODES),codes);self.assertEqual(S.STAGE_RESTORE_CODES,C.STAGE_RESTORE_CODES)
        self.assertEqual(S.STAGE_DIAG_CODES,C.STAGE_DIAG_CODES)


if __name__=='__main__':unittest.main(verbosity=2)
