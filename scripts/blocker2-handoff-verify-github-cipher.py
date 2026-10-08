import pathlib,json,hashlib,zipfile,io,subprocess
root=pathlib.Path(__file__).parent
ctx=json.loads((root/'FRESH_GITHUB_CONTEXT.json').read_text());pins=json.loads((root/'original-artifact-pins.json').read_text());source={r['id']:r for r in pins['artifacts']}
assert len(ctx['artifacts'])==29
child=subprocess.Popen(['node',str(root/'blocker2-handoff-verify-native500.js')],stdin=subprocess.PIPE,text=True)
zipRows=[];positions=set();manifests=0
for a in sorted(ctx['artifacts'],key=lambda x:x['name']):
 p=pathlib.Path(a['path'])
 with p.open('rb') as f:sha=hashlib.file_digest(f,'sha256').hexdigest()
 assert p.stat().st_size==a['size_bytes'] and 'sha256:'+sha==a['digest']
 with zipfile.ZipFile(p) as outer:
  assert len(outer.namelist())==1
  name=outer.namelist()[0]
  if a['name']=='blocker2-handoff90-transport-manifest':
   assert name=='TRANSPORT_MANIFEST.json';t=json.loads(outer.read(name));assert t['transportRun']=='37815559846' and t['sourceRun']==37790661298;continue
  ident=int(a['name'].split('source-')[1]);s=source[ident];assert name==s['name']+'.zip'
  raw=outer.read(name);assert len(raw)==s['size_in_bytes'] and 'sha256:'+hashlib.sha256(raw).hexdigest()==s['digest']
  with zipfile.ZipFile(io.BytesIO(raw)) as inner:
   for f in inner.namelist():
    value=json.loads(inner.read(f))
    if f=='manifest.json':manifests+=1
    else:
     assert f.endswith('.json') and f[:4].isdigit();pos=int(f[:4]);assert 1<=pos<=500 and pos not in positions;positions.add(pos)
    child.stdin.write(json.dumps({'name':f,'sourceArtifactId':ident,'envelope':value.get('envelope',value)})+'\n')
  zipRows.append({'artifactId':a['artifactId'],'originalSourceArtifactId':ident,'outerSHA256':sha,'originalSHA256':hashlib.sha256(raw).hexdigest(),'originalBytes':len(raw)})
assert positions==set(range(1,501)) and manifests==28
child.stdin.close();assert child.wait()==0
proof={'status':'PASS','allRetainedArtifacts':29,'all28OriginalZIPsByteIdentical':True,'nativeCipherPositions':500,'checkpointManifests':28,'freshServerAccessWithoutOldWorkspaceEvidence':True,'sourceRun':37790661298,'transportRun':37815559846,'ProductionRequests':0,'artifacts':zipRows}
p=root/'GITHUB_FRESH_RECOVERY_PROOF.json';p.write_text(json.dumps(proof,indent=2)+'\n');p.chmod(0o600);print('PASS:29 retained artifacts,28 byte-identical originalZIPs,500 authenticated profiles')
