#!/usr/bin/env python3
"""Explicit original-PG source on the existing tiny carrier; no default action.

This authenticates a persistent original closure, never restores it. Original
archives, runtime payloads and databases are not copied or started on import.
The caller must separately adopt the exact genuine post-restore binding SHA.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

SOURCE_IMAGE = 'sha256:567d5d704a3e5a4864393b623a0d50eb1b5a4ad134cdac7cf19555cb2d8ffe9e'
CARRIER_IMAGE = 'sha256:34e72f77a5fa0728d44b75766cdfdb1851aea196b3ba6c4fb9242f5d339a678b'
CARRIER_BYTES = 794376
ARCH = Path('/workspace/helmut-ram-fix-20261020/architecture-correction-20261020')
JIT = Path('/workspace/helmut-ram-fix-20261020/auth-working-set-20261020/jit-closure-v2')
ORIGINAL_BINDINGS = {'path':str(ARCH/'native-auth-input-preparation/READONLY_RUNTIME_BINDINGS.SAFE.json'),
                     'bytes':207733,'sha256':'71e661eeaa3a71c74a7dc9aa7d5cf6568e12f728365f2a3b97fa08c1e8076475'}
JIT_PLAN = {'path':str(JIT/'JIT_CLOSURE_PLAN.SAFE.json'),'bytes':398471,
            'sha256':'556be080d95fbe11dc1c001eabe2f3551bbe65c713f0ef3453cfae3a9779db7a'}
ELF_PROOF = {'path':str(JIT/'ELF_NEEDED_PROOF.SAFE.json'),'bytes':13504,
             'sha256':'9d348c2c571b248d6399634e0c1cdbbf0f18c99b5e83bb9fab42464ddcc8a84f'}
RUNTIME = {'path':str(ARCH/'native-budget-implementation-qualification-v2/runtime/RUNTIME.SAFE.json'),
           'bytes':481,'sha256':'a16d045b223ef8b9f7525d97ede4596468501510f0ce71263a5ce2bddf42127e'}
DATABASES = ['helmut_fresh_input_fixture_d2e98984','helmut_resource_input_20261017_64a99d4ac9fb',
             'helmut_resource_input_20261018_ab76c911dac8','helmut_resource_input_20261019_e400dff25393',
             'helmut_resource_input_20261020_4d77e2fe6616','helmut_resource_input_20261021_73c17fa1af90']
FD_FIELDS = ('st_dev','st_ino','st_mode','st_uid','st_gid','st_nlink','st_size','st_mtime_ns','st_ctime_ns')
PATH_ENV = '/usr/lib/postgresql/17/bin:/usr/bin:/bin'
LIB_ENV = '/original-jit/usr/lib/x86_64-linux-gnu:/usr/lib/x86_64-linux-gnu'
PGHOST = '/var/lib/postgresql/data/socket'
MEMORY_BYTES = 768*1024**2
READONLY_ROLES = ['anon','authenticated','authenticator','postgres','service_role']


def exact_inventory(root, targets):
    """Reject unmanifested files, directories and links; never follow links."""
    expected = dict(targets)
    for name in list(expected):
        for parent in Path(name).parents:
            if str(parent) != '.':
                expected.setdefault(str(parent), {'type':'5'})
    actual = {}
    for directory, folders, files in os.walk(root, followlinks=False):
        for name in folders+files:
            path = Path(directory)/name;mode = path.lstat().st_mode
            kind = '2' if stat.S_ISLNK(mode) else '5' if stat.S_ISDIR(mode) else '0' if stat.S_ISREG(mode) else 'unsupported'
            actual[str(path.relative_to(root))] = kind
        need(len(actual) <= len(expected), 'extra-persistent-member')
    need(actual == {name:row['type'] for name,row in expected.items()}, 'exact-persistent-inventory')


def need(value, reason):
    if not value:
        raise RuntimeError('tiny-source-' + reason)


def fd9(info):
    return [getattr(info, field) for field in FD_FIELDS]


def stable_file(path, *, keep=False, cap=4*1024**2):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path, 'canonical-file')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink >= 1, 'regular-file')
        digest, parts, size = hashlib.sha256(), [], 0
        while block := os.read(fd, 128*1024):
            size += len(block);digest.update(block)
            if keep:
                need(size <= cap, 'metadata-cap');parts.append(block)
        need(size == before.st_size and fd9(before) == fd9(os.fstat(fd)) == fd9(path.lstat()), 'file-drift')
        return ({'path':str(path),'bytes':size,'sha256':digest.hexdigest()}, fd9(before), b''.join(parts))
    finally:
        os.close(fd)


def document(pin):
    actual, identity, raw = stable_file(pin['path'], keep=True)
    need(actual == pin, 'metadata-pin')
    def pairs(items):
        out = {}
        for key, value in items:
            need(key not in out, 'duplicate-json-key');out[key] = value
        return out
    return json.loads(raw, object_pairs_hook=pairs), identity


def original_metadata():
    bindings, _ = document(ORIGINAL_BINDINGS)
    plan, _ = document(JIT_PLAN)
    proof, _ = document(ELF_PROOF)
    runtime, _ = document(RUNTIME)
    need(len(bindings['bindings']) == 548 and all(r['readonly'] is True for r in bindings['bindings']), '548-original-bindings')
    need(plan['imageConfigSHA256'] == SOURCE_IMAGE.split(':')[1] and plan['regularFiles'] == 974
         and plan['regularBytes'] == 176281648 and plan['symlinks'] == 4, 'original-jit-plan')
    need(proof['allNeededNamesInInspectedELFsResolveToTheNewClosureOrExistingOriginalBindings'] is True
         and proof['eachInspectedELFVerifiedAgainstOriginalSizeAndSHA256InBothPasses'] is True, 'original-elf-proof')
    need(runtime['imageId'] == CARRIER_IMAGE and runtime['imageBytes'] == CARRIER_BYTES
         and runtime['helperSHA256'] == 'a736cae4524b940e8bb8743b9436adbb9344593967a49a14d47402002c82f9fa', 'existing-carrier-provenance')
    return bindings['bindings'], plan


def persistent_profile(profile_pin, *, verify_payload=True):
    """Consume a GENUINE future persistent manifest; no manifest fabrication."""
    profile, identity = document(profile_pin)
    need(set(profile) == {'schema','sourceImageId','carrierImageId','originalBindingsPin','jitPlanPin',
                         'elfProofPin','runtimeReceiptPin','persistentRoot','runtimeFiles','persistentFiles','symlinks'}, 'profile-fields')
    need(profile['schema'] == 'helmut-authentic-persistent-source-closure-fd9/1'
         and profile['sourceImageId'] == SOURCE_IMAGE and profile['carrierImageId'] == CARRIER_IMAGE
         and profile['originalBindingsPin'] == ORIGINAL_BINDINGS and profile['jitPlanPin'] == JIT_PLAN
         and profile['elfProofPin'] == ELF_PROOF and profile['runtimeReceiptPin'] == RUNTIME, 'profile-provenance')
    root = Path(profile['persistentRoot'])
    need(root.is_absolute() and root.resolve() == root and root.is_dir()
         and root.is_relative_to('/workspace') and not any('pgdata' in x.lower() for x in root.parts), 'persistent-original-closure-root')
    # Reject RAM-backed closure storage using the actual containing mount.
    matches = []
    for line in Path('/proc/self/mountinfo').read_text().splitlines():
        left, right = line.split(' - ', 1);point = re.sub(r'\\([0-7]{3})',lambda m:chr(int(m[1],8)),left.split()[4])
        if str(root) == point or str(root).startswith(point.rstrip('/')+'/'):
            matches.append((len(point),right.split()[0]))
    need(matches and max(matches)[1] not in ['tmpfs','ramfs'], 'persistent-storage-not-ram')
    originals, plan = original_metadata()
    exact_inventory(root,plan['targets'])
    expected = {row['imagePath']:row['source'] for row in originals}
    runtime_rows = profile['runtimeFiles']
    need(len(runtime_rows) == 548 and {r['imagePath']:r['pin'] for r in runtime_rows} == expected, 'complete-runtime-files')
    regular = {name:row for name,row in plan['targets'].items() if row['type'] == '0'}
    files = profile['persistentFiles']
    need(len(files) == 974 and {r['relative'] for r in files} == set(regular), 'complete-persistent-jit')
    witnesses = []
    for row in runtime_rows:
        need(set(row) == {'imagePath','pin','fd9'}, 'runtime-fd9-fields')
        witnesses.append((row['pin'],row['fd9']))
    for row in files:
        need(set(row) == {'relative','pin','fd9'}, 'persistent-fd9-fields')
        wanted = regular[row['relative']]
        need(row['pin'] == {'path':str(root/row['relative']),'bytes':wanted['size'],'sha256':wanted['sha256']}, 'original-persistent-file-pin')
        witnesses.append((row['pin'],row['fd9']))
    for pin, expected_fd9 in witnesses:
        need(type(expected_fd9) is list and len(expected_fd9) == 9 and all(type(v) is int for v in expected_fd9), 'fd9-shape')
        if verify_payload:
            actual, observed, _ = stable_file(pin['path'])
            need(actual == pin and observed == expected_fd9, 'original-runtime-payload')
        else:
            path = Path(pin['path'])
            need(path.resolve() == path and fd9(path.lstat()) == expected_fd9, 'runtime-fd9-drift')
    links = {name:row['linkname'] for name,row in plan['targets'].items() if row['type'] == '2'}
    need(len(profile['symlinks']) == 4 and {r['relative']:r['target'] for r in profile['symlinks']} == links, 'original-jit-symlinks')
    for row in profile['symlinks']:
        path = root/row['relative'];info = path.lstat()
        need(stat.S_ISLNK(info.st_mode) and os.readlink(path) == row['target'] and fd9(info) == row['fd9']
             and path.resolve().is_relative_to(root), 'jit-symlink-drift')
    mounts = [(r['pin']['path'],r['imagePath']) for r in runtime_rows]
    mounts += [(str(root),'/original-jit')]
    mounts += [(str(root/'usr/lib/postgresql/17/lib'/name),'/usr/lib/postgresql/17/lib/'+name)
               for name in ['llvmjit.so','llvmjit_types.bc','bitcode']]
    need(len({target for _,target in mounts}) == len(mounts), 'duplicate-runtime-mount')
    return profile, identity, mounts


def validate_container(row, binding, expected_mounts):
    need(row['Id'] == binding['containerId'] and row['Name'] == '/'+binding['containerName']
         and row['Image'] == CARRIER_IMAGE and row['State']['Running'] is True and row['State']['Pid'] > 0, 'actual-live-carrier')
    host = row['HostConfig']
    need(host['NetworkMode'] == 'none' and not host.get('PortBindings') and host['ReadonlyRootfs'] is True
         and host['CapDrop'] == ['ALL'] and host['SecurityOpt'] == ['no-new-privileges']
         and host['Privileged'] is False and not host.get('Devices') and not host.get('DeviceRequests')
         and host['PidMode'] == '' and host['IpcMode'] == 'private'
         and row['Config']['User'] == '1000:1000', 'carrier-isolation')
    need(host['Memory'] == host['MemorySwap'] == MEMORY_BYTES and host['PidsLimit'] == 64
         and host['NanoCpus'] == 1000000000 and not host.get('Tmpfs'), '768m-no-extra-swap-or-ram-mount')
    entries = row['Config']['Env']
    env = dict(item.split('=',1) for item in entries)
    need(len(env) == len(entries), 'duplicate-environment')
    need(env == {'PATH':PATH_ENV,'LD_LIBRARY_PATH':LIB_ENV,'PGHOST':PGHOST,'LANG':'C.UTF-8','LC_ALL':'C.UTF-8'}, 'closed-source-environment')
    binds = {m['Destination']:(m['Source'],m['RW']) for m in row['Mounts'] if m['Type'] == 'bind'}
    wanted = {target:(source,False) for source,target in expected_mounts}
    need(len(wanted) == len(expected_mounts), 'duplicate-expected-mount')
    # Read-only executor/Python mounts and the one fresh PGDATA volume are
    # explicitly bound by the genuine post-restore receipt, never inferred.
    extra = binding['additionalReadonlyMounts']
    need(len({r['target'] for r in extra}) == len(extra) and all(
        set(r) == {'source','target'} and r['target'] not in wanted for r in extra), 'additional-mount-overrides-runtime')
    wanted.update({r['target']:(r['source'],False) for r in extra})
    need(binds == wanted, 'exact-runtime-mount-closure')
    volumes = [m for m in row['Mounts'] if m['Type'] == 'volume']
    need(len(row['Mounts']) == len(binds)+1 and len(volumes) == 1
         and volumes[0]['Name'] == binding['sourceVolume'] and volumes[0]['Destination'] == '/var/lib/postgresql/data'
         and volumes[0]['RW'] is True and binding['sourceVolume'] != 'helmut-target-pgdata-01a15550c862', 'fresh-source-volume')


def validate_volume(row, binding):
    need(row['Name'] == binding['sourceVolume'] and row['Driver'] == 'local'
         and row['Options'] == {'type':'none','o':'bind','device':binding['sourceDataDirectory']}, 'exact-persistent-source-volume-options')
    need(row['Mountpoint'] == '/var/lib/docker/volumes/'+binding['sourceVolume']+'/_data', 'source-volume-mountpoint')


def validate_restore_receipt(receipt, value):
    need(receipt['schema'] == 'helmut-authentic-six-db-tiny-source-restore/1'
         and receipt['status'] == 'ACTUAL_VERIFIED_READONLY_SOURCE_RESTORED_CLEANLY_STOPPED'
         and receipt['newSource']['id'] == value['containerId'] and receipt['persistentClosurePin'] == value['persistentClosurePin']
         and receipt['runtimeAdapterPin'] == value['runtimeAdapterPin']
         and receipt['sourceDataDirectory'] == value['sourceDataDirectory']
         and receipt['additionalReadonlyMounts'] == value['additionalReadonlyMounts']
         and receipt['sourceDatabaseReadonlyDefaults'] == [{'database':db,'readonly':True} for db in sorted(DATABASES)]
         and receipt['sourceRolesReadonly'] == [{'role':role,'readonly':True} for role in READONLY_ROLES]
         and receipt['freshAutocommitReadonlySessions'] == [
             {'database':db,'defaultReadonly':True,'transactionReadonly':True} for db in sorted(DATABASES)]
         and receipt['rolesExactlyRestoredBeforeReadonlySettings'] is True
         and receipt['originalInputsHashUnchanged'] is True and receipt['originalContainerMetadataUnchanged'] is True
         and receipt['sourceWritesOnlyToFreshOwnedVolume'] is True and receipt['originalWrites'] == 0
         and receipt['providerCalls'] == 0 and receipt['full500'] is False and receipt['production'] is False,
         'genuine-six-db-restore-receipt')
    rows = receipt['databases']
    need(len(rows) == 6 and [r['database'] for r in rows] == DATABASES and all(
        r['financialTextExactlyEqual'] is True and r['sourceDefaultReadonly'] is True
        and r['nativeEquality'] == {'kos':6,'rawDocumentsRows':7,'links':7}
        and r['sourceCatalogReady'] is True for r in rows), 'complete-six-db-proof')


class Binding:
    def __init__(self, pin, binding):
        self.pin, self.value, self.checked_payload = pin, binding, False
        need(set(binding) == {'schema','scope','containerId','containerName','imageId','sourceImageId','sourceDatabase',
                             'databases','runtimeAdapterPin','persistentClosurePin','restoreReceiptPin','sourceVolume','sourceDataDirectory','additionalReadonlyMounts'}, 'binding-fields')
        need(binding['schema'] == 'helmut-authentic-tiny-local-source-runtime-binding/1'
             and binding['scope'] == 'READ_ONLY_RESTORED_FROZEN_INPUT_PROVENANCE_ONLY'
             and binding['imageId'] == CARRIER_IMAGE and binding['sourceImageId'] == SOURCE_IMAGE
             and binding['sourceDatabase'] == DATABASES[0] and binding['databases'] == DATABASES
             and re.fullmatch('[a-f0-9]{64}',binding['containerId']) is not None, 'explicit-six-db-original-binding')
        need(re.fullmatch('helmut-authentic-tiny-source-pgdata-[a-f0-9]{12}',binding['sourceVolume']) is not None
             and re.fullmatch('helmut-authentic-tiny-source-[a-f0-9]{12}',binding['containerName']) is not None,
             'fresh-tiny-source-namespace')
        directory = Path(binding['sourceDataDirectory'])
        need(directory.is_absolute() and directory.resolve() == directory and directory.name == 'PGDATA_TINY_SOURCE_NOT_ORIGINAL'
             and directory.is_relative_to('/workspace/helmut-native-integration-checks-20261022'), 'own-persistent-pgdata')

    def verify(self, docker):
        value, _ = document(self.pin);need(value == self.value, 'binding-drift')
        need(stable_file(Path(__file__).resolve())[0] == value['runtimeAdapterPin'], 'runtime-verifier-drift')
        profile, _, mounts = persistent_profile(value['persistentClosurePin'], verify_payload=not self.checked_payload)
        receipt, _ = document(value['restoreReceiptPin'])
        validate_restore_receipt(receipt,value)
        result = subprocess.run(docker+['inspect',value['containerId']],capture_output=True,text=True,check=True,timeout=15)
        actual = json.loads(result.stdout);need(len(actual) == 1, 'single-carrier-inspection')
        validate_container(actual[0],value,mounts)
        result = subprocess.run(docker+['volume','inspect',value['sourceVolume']],capture_output=True,text=True,check=True,timeout=15)
        volumes = json.loads(result.stdout);need(len(volumes) == 1, 'single-volume-inspection')
        validate_volume(volumes[0],value)
        self.checked_payload = True
        return self.pin
