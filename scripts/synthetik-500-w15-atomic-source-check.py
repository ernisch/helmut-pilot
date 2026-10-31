#!/usr/bin/env python3
"""Scoped reuse of the existing500-source PASS; no constructor rerun or DB work."""
import hashlib,json,os,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path('/workspace/shared/helmut-w15-atomic-integration-source-20261028')
QUAL=pathlib.Path('/workspace/shared/helmut-w15-current-source-update-20261028/qualification-b/ALL500_MOCK_BINDINGS_CHECK.SAFE.json')
def sha(b):return hashlib.sha256(b).hexdigest()
def pin(p):
    b=p.read_bytes();return {'path':str(p),'bytes':len(b),'sha256':sha(b)}
def old(name):return subprocess.run(['git','show','c36bd427:'+name],cwd=ROOT,check=True,stdout=subprocess.PIPE).stdout

def main():
    assert not OUT.exists(),'atomic-source-report-already-exists';os.umask(0o077);OUT.mkdir(mode=0o700)
    qb=QUAL.read_bytes();assert sha(qb)=='d2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d'
    q=json.loads(qb);assert q['qualifiedOwners']==500 and q['failedOwners']==0 and q['profileActivations']==0
    unchanged=[];rebound=[]
    for p in q['sourceCodePins']:
        n=p['path'];b=(ROOT/n).read_bytes()
        if len(b)==p['bytes']and sha(b)==p['sha256']:unchanged.append(p);continue
        assert n in ['lib/helmut/ai.js','lib/helmut/storage.js'],'unexpected-source-drift'
        original=old(n);assert len(original)==p['bytes']and sha(original)==p['sha256']
        candidate=subprocess.run(['git','show','fa506939:'+n],cwd=ROOT,check=True,stdout=subprocess.PIPE).stdout
        assert b==candidate,'integration-must-not-modify-qualified-constructor-files'
        if n.endswith('/ai.js'):
            marker=b'const LAGE_BRIEFING_SCHEMA =';segment=b[b.index(marker):];prior=original[original.index(marker):]
            assert segment==prior and len(segment)==24332 and sha(segment)=='e85b1fefaf8bb0b85add4598aa150ded282ff1e2651b8940179074ce9ad977d1'
            scope='Exact entire schema/prompt/D/R-constructor/generation tail unchanged; only provider receipt confirmation updated in973.'
        else:
            marker=b'async function getPublicationSourceIdentities('
            def function(raw):
                at=raw.index(marker);end=raw.index(b'\nasync function ',at+len(marker));return raw[at:end]
            segment=function(b);assert segment==function(original)
            scope='Exact publication candidate/source-identity function unchanged;973 Auth/usage storage changes tested separately.'
        rebound.append({'oldPin':p,'currentPin':pin(ROOT/n),'unchangedSegmentBytes':len(segment),'unchangedSegmentSHA256':sha(segment),'scope':scope})
    assert len(unchanged)==16 and len(rebound)==2
    manifest=json.loads((ROOT/'lib/helmut/synthetik-500-cpu-source-pins.json').read_text())
    for p in manifest['sources']:
        b=(ROOT/p['path']).read_bytes();assert len(b)==p['bytes']and sha(b)==p['sha256'],'cpu-source-drift'
    names={p['path']for p in manifest['sources']};assert {'lib/helmut/auth-store-cas.js','lib/helmut/llm-usage-atomic.js'}<=names
    result={'status':'PASS_SCOPED_REUSE_NOT_NEW_ALL500_RUN','qualificationPin':pin(QUAL),'unchangedSourcePins':unchanged,'reboundSourcePins':rebound,
      'cpuManifestPin':pin(ROOT/'lib/helmut/synthetik-500-cpu-source-pins.json'),'original500PassRetained':True,'freshWorkerAndAtomicAuthRequired':True,
      'sourcesReimported':False,'constructorChecksRepeated':False,'independentReviewPending':True}
    with (OUT/'SOURCE_COMPATIBILITY.SAFE.json').open('x')as f:json.dump(result,f,indent=2);f.write('\n')
    print(json.dumps({'status':result['status'],'unchangedSources':len(unchanged),'scopedRebindings':len(rebound)}))
if __name__=='__main__':main()
