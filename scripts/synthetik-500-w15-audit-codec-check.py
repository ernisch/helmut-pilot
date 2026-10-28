"""One file-only check of the new lossless native-audit adapter. No SQL."""
import decimal,hashlib,importlib.util,json,os,pathlib,time,zlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028/RAM_C_NATIVE_FINAL_PRIVATE.jsonl')
TARGET=pathlib.Path('/tmp/w15-audit-codec-check-20261028d')
REPORT=SOURCE.parent/'AUDIT_CODEC_CHECK_D.SAFE.json'
SOURCE_SHA='e3111216d4fa6e57c99f747e970cc853609f4f07fa01e0b44d895d570ae7ef6c'
def sha_file(p):
    h=hashlib.sha256()
    with p.open('rb')as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def main():
    assert not TARGET.exists()and not REPORT.exists(),'w15-codec-once-only'
    s=SOURCE.lstat();assert SOURCE.is_file()and not SOURCE.is_symlink()and s.st_mode&0o777==0o600
    assert s.st_size==120268457 and sha_file(SOURCE)==SOURCE_SHA
    spec=importlib.util.spec_from_file_location('new_audit_codec',ROOT/'scripts/synthetik-500-w15-memory-final-audit.py')
    audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    os.umask(0o077);TARGET.mkdir(mode=0o700)
    error=None;result=None;raw_bytes=packed_bytes=0;raw_hash=hashlib.sha256();deadline=time.monotonic()+300
    archive=TARGET/'C_NATIVE_AUDIT.PRIVATE.jsonl.gz'
    try:
        assert not audit._deep_equal(decimal.Decimal('0.12345678901234567890'),decimal.Decimal('0.12345678901234567891'))
        assert not audit._deep_equal(True,1)and audit._deep_equal(1,decimal.Decimal('1.0'))
        compressor=zlib.compressobj(6,zlib.DEFLATED,31)
        with SOURCE.open('rb')as source,archive.open('xb')as target:
            for b in iter(lambda:source.read(1024*1024),b''):
                assert time.monotonic()<deadline,'w15-codec-deadline'
                raw_hash.update(b);raw_bytes+=len(b);packed=compressor.compress(b)
                target.write(packed);packed_bytes+=len(packed)
                assert packed_bytes<=audit.MAX_ARCHIVE,'w15-codec-archive-size'
            packed=compressor.flush();target.write(packed);packed_bytes+=len(packed)
            target.flush();os.fdatasync(target.fileno())
        assert raw_bytes==120268457 and raw_hash.hexdigest()==SOURCE_SHA and packed_bytes<=audit.MAX_ARCHIVE
        def guard(_):assert time.monotonic()<deadline,'w15-codec-deadline'
        result=audit.verify_capture(archive,database='helmut_w15_memory_atomic_20261028c',expectedProbe=368,guard=guard)
        assert result['rawBytes']==raw_bytes and result['rawSHA256']==SOURCE_SHA
        assert result['totalExactPostimages']==3501 and result['fullLogicalUsageRows']==6000
    except BaseException as e:error={'type':type(e).__name__,'reason':'file-codec-failed-or-unknown'}
    data={'status':'FAIL_OR_UNKNOWN'if error else'PASS_FILE_ONLY_LOSSLESS_GZIP_AND_EXACT_DECIMAL',
      'error':error,'historicalSourcePin':{'bytes':s.st_size,'sha256':SOURCE_SHA},
      'newArchivePin':{'path':str(archive),'bytes':archive.stat().st_size,'sha256':sha_file(archive)}if archive.exists()else None,
      'newAdapterVerification':result,'rawBytes':raw_bytes,'sourceOriginalPreserved':True,
      'historicalCOutcome':'UNCHANGED_FAIL_AT369_NOT_A_NEW_DATABASE_RESULT',
      'temporaryFileIsSeparateFromEnd500RAMContainer':True,'HTTP':0,'databaseCalls':0,
      'AuthCalls':0,'profileActivations':0,'UnitCalls':0,'retryAllowed':False,
      'sourcePins':{p:sha_file(ROOT/p)for p in ['scripts/synthetik-500-w15-audit-codec-check.py','scripts/synthetik-500-w15-memory-final-audit.py']}}
    with REPORT.open('x')as f:os.chmod(REPORT,0o600);json.dump(data,f,indent=2);f.write('\n');f.flush();os.fdatasync(f.fileno())
    print(json.dumps({'status':data['status'],'archiveBytes':packed_bytes,'postimages':result.get('totalExactPostimages')if result else None}))
    if error:raise SystemExit(1)
if __name__=='__main__':main()
