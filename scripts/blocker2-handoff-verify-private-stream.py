import pathlib,json,hashlib,base64,io,tarfile,datetime
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes
root=pathlib.Path(__file__).parent
c=json.loads((root/'FRESH_ALL58_CONTEXT.json').read_text())
mp=pathlib.Path(c['manifest']['path'])
assert hashlib.sha256(mp.read_bytes()).hexdigest()==c['manifestSHA256']
m=json.loads(mp.read_text());actual={r['name']:r for r in c['parts']}
assert len(actual)==58 and all(r['ownerOnly'] for r in actual.values())
def sha(p):
 with pathlib.Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
paths=[]
for i,row in enumerate(m['parts'],1):
 assert row['name']==f'continuity-{i:04}.cipher'
 r=actual[row['name']];p=pathlib.Path(r['path']);assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256'];paths.append(p)
key=serialization.load_pem_private_key(pathlib.Path(c['privateKey']['path']).read_bytes(),None)
finger=hashlib.sha256(key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)).hexdigest()
assert finger==m['meta']['recipient']=='8d665b71487b557f9cbdedb7e5da848022f3f80f820f9fc6233353658ffd41e7'
aad=json.dumps(m['meta'],sort_keys=True,separators=(',',':')).encode();assert aad==base64.b64decode(m['aadBase64'],validate=True)
aes=key.decrypt(base64.b64decode(m['wrappedKey'],validate=True),padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),algorithm=hashes.SHA256(),label=None))
d=Cipher(algorithms.AES(aes),modes.GCM(base64.b64decode(m['nonce'],validate=True),base64.b64decode(m['authenticationTag'],validate=True))).decryptor();d.authenticate_additional_data(aad)
class Reader(io.RawIOBase):
 def __init__(self):self.paths=iter(paths);self.file=None;self.buffer=b'';self.ended=False;self.hash=hashlib.sha256();self.bytes=0
 def readable(self):return True
 def read(self,n=-1):
  while not self.ended and (n<0 or len(self.buffer)<n):
   if self.file is None:
    try:self.file=next(self.paths).open('rb')
    except StopIteration:
     raw=d.finalize();self.ended=True
     self.hash.update(raw);self.bytes+=len(raw);self.buffer+=raw;break
   raw=self.file.read(1024*1024)
   if not raw:self.file.close();self.file=None;continue
   plain=d.update(raw);self.hash.update(plain);self.bytes+=len(plain);self.buffer+=plain
  if n<0:out=self.buffer;self.buffer=b'';return out
  out=self.buffer[:n];self.buffer=self.buffer[n:];return out
reader=Reader();seen=set();manifest=None
with tarfile.open(fileobj=reader,mode='r|gz') as t:
 for entry in t:
  assert entry.isfile() and not entry.name.startswith('/') and '..' not in pathlib.PurePosixPath(entry.name).parts
  f=t.extractfile(entry)
  if entry.name=='PRIVATE_MANIFEST.json':
   assert manifest is None;raw=f.read();assert hashlib.sha256(raw).hexdigest()==c['privateManifestSHA256'];manifest=json.loads(raw);expected={r['name']:r for r in manifest['files']};assert len(expected)==1896;continue
  assert manifest and entry.name in expected and entry.name not in seen and not entry.name.endswith('blocker2-readonly500-recipient-private.pem')
  h=hashlib.file_digest(f,'sha256').hexdigest();r=expected[entry.name];assert entry.size==r['bytes'] and h==r['sha256'];seen.add(entry.name)
  if len(seen)%400==0:print(json.dumps({'privateOriginalsVerified':len(seen),'total':1896}),flush=True)
while reader.read(1024*1024):pass
assert len(seen)==1896 and reader.ended and reader.bytes==m['meta']['sourceBytes'] and reader.hash.hexdigest()==m['meta']['sourceSHA256']
proof={'status':'PASS','freshAccessPath':'Authenticated Drive metadata+raw fetch+download_file from server; source key/manifest/all58parts fetched anew','oldWorkspaceOriginalFilesRead':0,'freshCipherParts':58,'allPartsOwnerOnly':True,'allCipherPartNamesSizesSHA256Verified':True,'RSARecipientMatched':finger,'AEADAuthenticationPassed':True,'encryptedManifestSHA256':c['manifestSHA256'],'privateManifestSHA256':c['privateManifestSHA256'],'archiveBytes':reader.bytes,'archiveSHA256':reader.hash.hexdigest(),'allPrivateOriginalNamesSizesSHA256Verified':len(seen),'privateKeyExcludedFromArchive':True,'plaintextPersistedByThisVerification':False,'ProductionRequests':0,'paidHelmutModels':0,'observedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
p=root/'PRIVATE_FRESH_RECOVERY_PROOF.json';p.write_text(json.dumps(proof,indent=2)+'\n');p.chmod(0o600);print(json.dumps(proof),flush=True)
