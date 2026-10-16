#!/usr/bin/env python3
"""Pure new connection guards: no Docker, DB, live GO or500 workflow."""
import hashlib,importlib.util,json,secrets
from pathlib import Path

s=importlib.util.spec_from_file_location('I',Path(__file__).with_name('isolation.py'));I=importlib.util.module_from_spec(s);s.loader.exec_module(I)
area=Path('/workspace/helmut-parallel-20261015/wave20-resource-integration');case=area/('attempt-guard-'+secrets.token_hex(4));case.mkdir(mode=0o700)
f=case/'TEST_ONLY_INPUT.txt';f.write_text('NO_OWNER_AUTHORITY_TEST_ONLY\n')
def pin(p):
 b=p.read_bytes();return{'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
fixture={'caseDirectory':str(case),'applicationReadOnlyPins':[pin(f)],'databaseReadOnlyPins':[]};cases=[]
args=I.fixture_mounts(fixture,'application');assert args[-1].endswith(',dst='+str(case));assert ',readonly' in args[1];cases.append('only own directory writable; exact selected file readonly')
def reject(name,fn):
 try:fn()
 except RuntimeError:cases.append(name);return
 raise AssertionError('accepted negative: '+name)
reject('unknown mount role',lambda:I.fixture_mounts(fixture,'unknown'))
reject('unapproved database binary',lambda:I.fixture_mounts(fixture,'database'))
bad={**fixture,'caseDirectory':'/tmp/foreign'};reject('foreign writable directory',lambda:I.fixture_mounts(bad,'application'))
bad={**fixture,'applicationReadOnlyPins':[{**pin(f),'sha256':'0'*64}]};reject('input byte drift',lambda:I.fixture_mounts(bad,'application'))
old=case/'OWNER_LOCAL_GO.PRIVATE.json';old.write_text('{"TEST_ONLY":"NOT_A_GO"}');bad={**fixture,'applicationReadOnlyPins':[pin(old)]};reject('historical GO filename excluded',lambda:I.fixture_mounts(bad,'application'))
link=case/'alias.txt';link.symlink_to(f);bad={**fixture,'applicationReadOnlyPins':[{**pin(f),'path':str(link)}]};reject('symlink input',lambda:I.fixture_mounts(bad,'application'))
comma=case/'invalid,option.txt';comma.write_text('TEST_ONLY');bad={**fixture,'applicationReadOnlyPins':[pin(comma)]};reject('mount option injection',lambda:I.fixture_mounts(bad,'application'))
before=I.ONCE.exists();assert not before
r={'pass':True,'pureCases':len(cases),'cases':cases,'DockerCalls':0,'databaseCalls':0,'validOwnerGOCreated':False,'full500Runs':0,'resourceGOConsumed':False}
p=area/'CONNECTION_PURE_GUARDS.SAFE.json'
with p.open('x') as f:json.dump(r,f,indent=2)
assert I.ONCE.exists()==before;print(json.dumps(r))
