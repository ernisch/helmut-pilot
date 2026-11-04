"""Bounded private Materials evidence through the existing cipher-only channel.

No original download, database, GPG or network work occurs on import. This is
diagnostic evidence, never a complete backup or a Mock500 acceptance.
"""
import sys
sys.dont_write_bytecode = True

from functools import lru_cache
from decimal import Decimal
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re

SCOPE = 'ISOLATED_GITHUB_MOCK500_MATERIALS_DIAGNOSTIC_ONLY'
FINGERPRINT = '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC'
PUBLIC_KEY_SHA256 = '3075683711733f6c7fc5836c9b4f5f1d94eaf35dec7f9a401132f52995122443'
MAX_FILE, MAX_TOTAL, MAX_CIPHER = 65536, 262144, 1048576
SOURCES = ('MATERIALS_FIRST_FAILURE.SAFE.json',
           'MATERIALS_CONTROLLER_FIRST_FAILURE.PRIVATE.json', 'materials.PRIVATE.log')


class EvidenceRejected(RuntimeError):
    def __init__(self):
        super().__init__('MATERIALS_PRIVATE_EVIDENCE_FAILED_OR_UNKNOWN')


def need(value):
    if not value:
        raise EvidenceRejected()


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'),
                       ensure_ascii=True, allow_nan=False) + '\n').encode('ascii')


@lru_cache(maxsize=1)
def modules():
    def load(name):
        spec = importlib.util.spec_from_file_location('w15_materials_evidence_' + name,
                                                    Path(__file__).with_name(name + '.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module
    closure = load('restore_backup')
    return closure, closure.S, load('artifact_transport')


def _write(directory, name, raw):
    need(type(raw) is bytes and len(raw) <= MAX_FILE)
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600,
                 dir_fd=directory)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(os.dup(fd), 'wb') as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
    finally:
        os.close(fd)
    return {'path': name, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def _bounded_source(seal, directory, name, guard, maximum=MAX_FILE):
    try:
        fd, before = seal._file(directory, name)
    except FileNotFoundError:
        return None, {'path': name, 'present': False}
    try:
        guard()
        size = before[2]
        if size <= maximum:
            raw = os.pread(fd, maximum, 0)
            need(len(raw) == size)
            strategy = 'COMPLETE'
        else:
            half = maximum // 2
            raw = os.pread(fd, half, 0) + os.pread(fd, half, size - half)
            need(len(raw) == maximum)
            strategy = 'FIRST_AND_LAST_32768_BYTES_NOT_COMPLETE' if maximum==MAX_FILE else 'BOUNDED_FIRST_AND_LAST_NOT_COMPLETE'
        guard()
        need(seal._snapshot(os.fstat(fd)) == before)
        return raw, {'path': name, 'present': True, 'originalBytes': size,
                     'retainedBytes': len(raw), 'strategy': strategy,
                     'truncated': size > maximum}
    finally:
        os.close(fd)


def preserve(manifest, private_payload, inputs, controller, guard, outcome):
    """Exactly one private capsule; any failure preserves partials without retry.

    The outer controller must already retain the first exception and perform
    its own bound zero-activity/process closure. An evidence receipt does not
    assert either condition and never publishes the private outcome or log pins.
    """
    try:
        need(callable(guard) and type(outcome) is dict)
        private_outcome = canonical(outcome)
        need(len(private_outcome) <= 16384)
        closure, seal, transport = modules()
        context = {**inputs.backup_context(), 'scope': SCOPE}
        closure._context(context, expected_scope=SCOPE)
        need(all(context[key] == manifest[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce'))
             and context['recipientFingerprint'] == FINGERPRINT)
        guard()
        parent = seal._directory(str(Path(manifest['backupRoot'])), private=True)
        try:
            # Exclusive directory is also the one-shot marker; never reuse it.
            os.mkdir('materials-evidence', 0o700, dir_fd=parent); os.fsync(parent)
        finally:
            os.close(parent)
        root = Path(manifest['backupRoot']) / 'materials-evidence'
        selection = root / 'selection'; selection.mkdir(mode=0o700)
        target = seal._directory(str(selection), private=True)
        work = None
        try:
            work = seal._directory(str(controller.WORK), private=True)
            entries, observed = [], []
            prepare_only=manifest.get('approval',{}).get('resourceContract')=='helmut-w15-mock500-prepare-diagnostic/1'
            sources=(('materials.PRIVATE.log',MAX_FILE),('prepare.PRIVATE.log',MAX_FILE),
                ('MATERIALS_CONTROLLER_FIRST_FAILURE.PRIVATE.json',MAX_FILE),('MATERIALS_DIAGNOSTIC_FAILURE.SAFE.json',4096)) if prepare_only else tuple((n,MAX_FILE)for n in SOURCES)
            for name,maximum in sources:
                raw, record = _bounded_source(seal, work, name, guard,maximum)
                observed.append(record)
                if raw is not None:
                    entries.append(_write(target, name, raw))
            if prepare_only:
                state=seal._directory(str(controller.WORK/'state'),private=True)
                try:
                    for name in ('prepare-FIRST-FAILURE.SAFE.json','PREPARE_DIAGNOSTIC_CHECKS.SAFE.json'):
                        raw,record=_bounded_source(seal,state,name,guard,4096)
                        observed.append({**record,'path':'state/'+name})
                        if raw is not None:entries.append(_write(target,name,raw))
                finally:os.close(state)
            entries.append(_write(target, 'MATERIALS_DIAGNOSTIC_OUTCOME.PRIVATE.json', private_outcome))
            metadata = canonical({'scope': SCOPE, 'sources': observed,
                                  'privateSelectionOnly': True, 'completeBackup': False})
            need(len(metadata) <= 16384)
            entries.append(_write(target, 'MATERIALS_COLLECTION.PRIVATE.json', metadata))
            need(sum(row['bytes'] for row in entries) <= MAX_TOTAL)
            archive_manifest = {'version': 1, **{key: context[key] for key in (
                'exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint')},
                'files': sorted(entries, key=lambda row: row['path'])}
            raw_manifest = canonical(archive_manifest)
            need(sum(row['bytes'] for row in entries) + len(raw_manifest) <= MAX_TOTAL)
            manifest_sha = hashlib.sha256(raw_manifest).hexdigest()
            _write(target, 'manifest.PRIVATE.json', raw_manifest); os.fsync(target)
        finally:
            if work is not None:
                os.close(work)
            os.close(target)
        public_key = Path(__file__).resolve().parents[2] / 'docs/betrieb/belege/w15-end500-transfer-20261029/receiver-public.asc'
        need(hashlib.sha256(public_key.read_bytes()).hexdigest() == PUBLIC_KEY_SHA256)
        cipher = root / 'mock500-materials-diagnostic.PRIVATE.gpg'
        def bounded():
            guard()
            if cipher.exists():
                need(cipher.lstat().st_size <= MAX_CIPHER)
        sealed = seal.seal(root=str(selection), manifest='manifest.PRIVATE.json',
            manifest_sha256=manifest_sha, public_key=str(public_key),
            recipient_fingerprint=FINGERPRINT, commit=context['exactCommit'], run_id=context['runId'],
            input_manifest_sha256=context['inputManifestSHA'], output=str(cipher), guard=bounded)
        need(type(sealed['cipherBytes']) is int and 0 < sealed['cipherBytes'] <= MAX_CIPHER
             and type(sealed['cipherSHA256']) is str and re.fullmatch('[a-f0-9]{64}', sealed['cipherSHA256'])
             and sealed['manifestSHA256'] == manifest_sha
             and all(sealed[key] == context[key] for key in (
                 'exactCommit', 'runId', 'runAttempt', 'inputManifestSHA', 'recipientFingerprint')))
        # Same existing one-day artifact price bound, including one rounded hour.
        price = Decimal(sealed['cipherBytes']) / Decimal(10**9) * Decimal('0.25') * Decimal(25) / Decimal(28 * 24)
        need(price <= Decimal('0.05'))
        node = Path(manifest['binaries']['node']['path'])
        node_pin = closure.R._source_pin(node, False, bounded)
        need(all(node_pin[key] == manifest['binaries']['node'][key]
                 == inputs.controller_context()['runtimePins']['node'][key] for key in ('bytes', 'sha256')))
        returned = transport.roundtrip(cipher, destination=root / 'remote', node=node,
            credentials=private_payload['artifactCredentials'], guard=bounded)
        need(returned.get('remoteReadbackObserved') is True and returned.get('retentionDays') == 1
             and type(returned.get('artifactId')) is int and 0 < returned['artifactId'] < 2**63
             and all(returned[key] == sealed[key] for key in ('cipherBytes', 'cipherSHA256')))
        receive_root = Path(inputs.backup_input_files()['auth']).parent.parent.parent
        authenticated = closure.authenticated_readback(returned['cipher'], cipher_bytes=sealed['cipherBytes'],
            cipher_sha256=sealed['cipherSHA256'], expected_manifest=archive_manifest,
            expected_manifest_sha256=manifest_sha, context=context, destination=str(root / 'authenticated'),
            private_home=str(receive_root / 'gnupg'),
            passphrase_file=str(receive_root / 'receiver-passphrase.PRIVATE'),
            guard=bounded, backup_scope=SCOPE)
        need(authenticated.get('localAuthenticatedReadbackObserved') is True
             and authenticated.get('verifiedFiles') == len(entries)
             and authenticated.get('verifiedBytes') == sum(row['bytes'] for row in entries)
             and authenticated.get('cipherBytes') == sealed['cipherBytes']
             and authenticated.get('cipherSHA256') == sealed['cipherSHA256'])
        bounded()
        return {'schema': 'helmut-w15-materials-diagnostic-evidence/1',
            'status': 'PASS_PRIVATE_MATERIALS_EVIDENCE_ONLY', 'scope': SCOPE,
            'artifactId': returned['artifactId'], 'cipherBytes': sealed['cipherBytes'],
            'cipherSHA256': sealed['cipherSHA256'], 'retentionDays': 1,
            'maximumStorageUSD': '0.05', 'remoteReadbackObserved': True,
            'authenticatedReadbackObserved': True, 'acceptedAsCompleteBackup': False,
            'mock500Acceptance': False, 'productionAcceptance': False,
            'executionAuthority': False, 'retryAllowed': False}
    except BaseException:
        raise EvidenceRejected() from None
