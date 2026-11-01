"""Private, hash-bound Mock500 inputs; neither acquisition nor start authority.

The historical 500/500 qualification is retained. A separate externally hashed
review binds the relocated private assets and the original16/current2 source
comparison. A later calendar derivation is explicitly different from that proof.
"""
import sys
sys.dont_write_bytecode = True
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

REPO = Path(__file__).absolute().parents[2]
ASSETS = frozenset(('originalReception', 'package', 'normalizedCurrentPolicy', 'originalUPacket',
    'qualificationReport', 'qualifiedRows', 'qualifiedFixtures', 'qualifiedNative',
    'qualifiedDerivations', 'currentReplacements', 'publicationPolicy', 'originalBuilderArchive'))
TOKEN = object()
MAX_FILE = 256 * 1024 * 1024
BASE, DATABASE = '/tmp/w15-full500-20261028d', 'helmut_w15_full500_20261028b'
ATOMIC = 'docs/betrieb/belege/w15-atomic-usage-integration-20261028/'


class MockInputError(RuntimeError):
    def __init__(self, code='MOCK500_PRIVATE_INPUT_BINDING_REJECTED'):
        super().__init__(code)


def need(value, code='MOCK500_PRIVATE_INPUT_BINDING_REJECTED'):
    if not value:
        raise MockInputError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def decode(raw):
    def pairs(rows):
        result = {}
        for key, value in rows:
            need(key not in result)
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False))


def _directory(path):
    value = Path(path)
    need(value.is_absolute() and str(value) == str(path) and '..' not in value.parts)
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in value.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd); fd = child
        return fd
    except BaseException:
        os.close(fd); raise


def file_bytes(path, pin, *, private=True, maximum=MAX_FILE):
    need(type(pin) is dict and set(pin) == {'bytes', 'sha256'} and type(pin['bytes']) is int
         and 0 < pin['bytes'] <= maximum and type(pin['sha256']) is str and re.fullmatch('[a-f0-9]{64}', pin['sha256']))
    path = Path(path)
    parent = _directory(str(path.parent))
    fd = None
    try:
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        before = os.fstat(fd)
        need(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and before.st_uid == os.getuid()
             and (stat.S_IMODE(before.st_mode) == 0o600 if private else before.st_mode & 0o022 == 0)
             and before.st_size == pin['bytes'])
        size, digest, blocks = 0, hashlib.sha256(), []
        while block := os.read(fd, 1024 * 1024):
            size += len(block); need(size <= pin['bytes']); digest.update(block); blocks.append(block)
        after = os.fstat(fd)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_mode', 'st_uid', 'st_nlink')
        need(size == pin['bytes'] and digest.hexdigest() == pin['sha256']
             and all(getattr(before, key) == getattr(after, key) for key in fields))
        return b''.join(blocks)
    finally:
        if fd is not None: os.close(fd)
        os.close(parent)


def namespace(context):
    need(type(context) is dict and context.get('schema') == 'helmut-w15-mock500-controller-context/1'
         and context.get('scope') == 'ISOLATED_GITHUB_MOCK500_BINDING_ONLY'
         and type(context.get('runId')) is str and re.fullmatch('[1-9][0-9]{4,19}', context['runId'])
         and type(context.get('runAttempt')) is int and context['runAttempt'] == 1
         and type(context.get('exactCommit')) is str and re.fullmatch('[a-f0-9]{40}', context['exactCommit'])
         and context.get('executionAuthority') is False and context.get('testStarted') is False)
    nonce = uuid.UUID(context['nonce'])
    need(str(nonce) == context['nonce'] and nonce.version == 4 and nonce.variant == uuid.RFC_4122)
    stem = 'w15-mock500-' + context['runId'] + '-' + nonce.hex
    root = context['runnerTemp'] + '/' + stem
    need(context['hostPaths'] == {'runRoot': root, 'work': root + '/work', 'prepare': root + '/prepare', 'cache': root + '/cache'})
    return {'work': Path(root) / 'work', 'container': stem, 'base': BASE, 'database': DATABASE}


def validate_atomic_auth(repo=REPO):
    """Read the already independently checked1+6+5 atomic ACKs, never rerun APIs."""
    repo = Path(repo)
    review = decode((repo / ATOMIC / 'D_RESULTS_INDEPENDENT_REVIEW.SAFE.json').read_bytes())
    need(review['status'] == 'PASS_PREPARED0_ATOMIC_AND_EU_COMPONENTS_ONLY_RAM_AND_FULL500_OPEN'
         and review['independentOfImplementation'] is True and review['testsRepeatedByReviewer'] is False)
    pins = {Path(pin['path']).name: {key: pin[key] for key in ('bytes', 'sha256')} for pin in review['evidencePins']}
    total = 0
    for filename, expected in (('PREPARE.SAFE.json', 1), ('ATOMIC_AUTH_PREPARED0.SAFE.json', 6), ('ATOMIC_EU.SAFE.json', 5)):
        raw = file_bytes(repo / ATOMIC / filename, pins[filename], private=False, maximum=1024 * 1024)
        evidence = decode(raw)
        need(evidence['authCoverage']['pass'] is True and len(evidence['casWrites']) == expected)
        expected_row = evidence['rowId'] if filename == 'ATOMIC_EU.SAFE.json' else 'main-auth'
        if filename == 'ATOMIC_EU.SAFE.json':
            need(type(expected_row) is str and re.fullmatch('w15-eu-component-[a-f0-9-]{36}', expected_row)
                 and evidence['originalMainAuthUnchanged'] is True)
        envelopes = evidence['authMutations'] + evidence['usageSinks']
        by_id = {row['id']: row for row in envelopes}
        need(len(by_id) == len(envelopes) == expected)
        used = set()
        for row in envelopes + evidence['casWrites']:
            need(row['acknowledged'] is True and all(type(row[k]) in (int, float) and math.isfinite(row[k])
                 for k in ('beginMS', 'ackMS', 'endMS', 'wallMs'))
                 and row['beginMS'] <= row['ackMS'] <= row['endMS']
                 and 0 <= row['wallMs'] < 30000 and row['endMS'] - row['beginMS'] < 30000)
        for row in evidence['casWrites']:
            need(row['storageMode'] == 'relational-atomic-v1' and row['rowId'] == expected_row)
            outer = by_id[row['envelopeId']]; used.add(row['envelopeId'])
            need(outer['beginMS'] <= row['beginMS'] <= row['ackMS'] <= outer['ackMS']
                 and row['endMS'] <= outer['endMS'])
        need(used == set(by_id))
        total += expected
    need(total == 12)
    return {'status': 'PASS_REUSED_INDEPENDENT_ATOMIC_12_ACK_BINDING_ONLY', 'atomicACKs': 12,
            'APIsRepeated': False, 'executionAuthority': False}


def validate_source_compatibility(qualification, repo=REPO):
    """Reuse16 exact source pins and the two already reviewed code segments.

    This reads code bytes only. It neither rebuilds a source candidate nor
    reruns any of the successful500 D/R constructor qualifications.
    """
    repo = Path(repo)
    old = decode((repo / ATOMIC / 'SOURCE_COMPATIBILITY.SAFE.json').read_bytes())
    need(old['status'] == 'PASS_SCOPED_REUSE_NOT_NEW_ALL500_RUN'
         and old['original500PassRetained'] is True and old['constructorChecksRepeated'] is False
         and len(old['unchangedSourcePins']) == 16 and len(old['reboundSourcePins']) == 2)
    def pin(row): return {key: row[key] for key in ('bytes', 'sha256')}
    need(pin(old['qualificationPin']) == {'bytes': 13706128,
         'sha256': 'd2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d'})
    expected = old['unchangedSourcePins'] + [row['oldPin'] for row in old['reboundSourcePins']]
    actual = qualification['sourceCodePins']
    need(sorted(actual, key=lambda row: row['path']) == sorted(expected, key=lambda row: row['path']))
    def public_path(relative):
        need(type(relative) is str and not relative.startswith('/')
             and all(part not in ('', '.', '..') for part in relative.split('/')))
        return repo / relative
    for row in old['unchangedSourcePins']:
        file_bytes(public_path(row['path']), pin(row), private=False, maximum=16 * 1024 * 1024)
    need({row['oldPin']['path'] for row in old['reboundSourcePins']} == {'lib/helmut/ai.js', 'lib/helmut/storage.js'})
    for row in old['reboundSourcePins']:
        name = row['oldPin']['path']
        raw = file_bytes(public_path(name), pin(row['currentPin']), private=False, maximum=16 * 1024 * 1024)
        if name == 'lib/helmut/ai.js':
            marker = b'const LAGE_BRIEFING_SCHEMA ='
            need(raw.count(marker) == 1); segment = raw[raw.index(marker):]
        else:
            marker = b'async function getPublicationSourceIdentities('
            need(raw.count(marker) == 1)
            start = raw.index(marker); end = raw.index(b'\nasync function ', start + len(marker))
            segment = raw[start:end]
        need(len(segment) == row['unchangedSegmentBytes']
             and hashlib.sha256(segment).hexdigest() == row['unchangedSegmentSHA256'])
    return {'status': 'PASS_REUSED_16_EXACT_SOURCES_AND_2_SCOPED_CODE_BINDINGS_ONLY',
            'unchangedSources': 16, 'scopedCodeBindings': 2, 'constructorChecksRepeated': False,
            'sourceDatesRewritten': False, 'executionAuthority': False}


def open_inputs(runtime_inputs, *, context, binding_raw, binding_sha256, asset_paths, observed_context, repo=REPO):
    """No file creation. Missing qualified/private assets are an explicit gate."""
    try:
        module = sys.modules.get('w15_github_runtime_inputs')
        need(module is not None and type(runtime_inputs) is module.RuntimeInputs)
        runtime_inputs.check_sources()
        need(runtime_inputs.controller_context() == context)
        need(Path(repo).absolute() == Path(runtime_inputs._repo).absolute())
        namespace(context)
        need(not Path(context['hostPaths']['runRoot']).exists())
        need(type(binding_raw) is bytes and 0 < len(binding_raw) <= 1024 * 1024
             and type(binding_sha256) is str and hashlib.sha256(binding_raw).hexdigest() == binding_sha256)
        record = decode(binding_raw)
        need(binding_raw == canonical(record) and set(record) == {'schema', 'scope', 'status', 'exactCommit',
            'assets', 'sourceComparison', 'executionAuthority', 'testStarted'})
        need(record['schema'] == 'helmut-w15-mock500-static-input-binding/1'
             and record['scope'] == 'ISOLATED_GITHUB_MOCK500_INPUTS_ONLY'
             and record['status'] == 'PASS_INDEPENDENT_MOCK500_INPUT_BINDING_ONLY'
             and record['exactCommit'] == context['exactCommit']
             and record['executionAuthority'] is False and record['testStarted'] is False)
        need(type(asset_paths) is dict and set(asset_paths) == ASSETS | {'node', 'postgrest'}
             and type(record['assets']) is dict and set(record['assets']) == ASSETS,
             'MOCK500_REQUIRED_PRIVATE_ASSETS_NOT_BOUND')
        need(Path(asset_paths['originalReception']) == runtime_inputs.path('reception'))
        comparison = record['sourceComparison']
        need(type(comparison) is dict and set(comparison) == {'status', 'originalSourceChecks', 'currentSourceChecks',
            'qualificationSHA256', 'sourceDatesRewritten', 'originalsUnchanged'}
             and comparison['status'] == 'PASS_INDEPENDENT_ORIGINAL16_CURRENT2_SOURCE_COMPARISON'
             and type(comparison['originalSourceChecks']) is int and comparison['originalSourceChecks'] == 16
             and type(comparison['currentSourceChecks']) is int and comparison['currentSourceChecks'] == 2
             and comparison['qualificationSHA256'] == record['assets']['qualificationReport']['sha256']
             and comparison['sourceDatesRewritten'] is False and comparison['originalsUnchanged'] is True)
        need(type(observed_context) is dict and observed_context.get('mode') in ('mock500-full-gated', 'mock500-full-phased-gated','mock500-full-functional-gated','mock500-full-host-functional-gated')
             and observed_context == {key: context[key] for key in ('exactCommit', 'runId', 'runAttempt', 'nonce')}
             | {'branch': 'refs/heads/codex/w15-github-end500-preparation-20261028', 'mode': observed_context['mode']})
        result = Mock500Inputs(TOKEN, runtime_inputs, context, record, asset_paths, Path(repo), binding_sha256)
        result.check_sources()
        return result
    except MockInputError:
        raise
    except (Exception, KeyboardInterrupt):
        raise MockInputError() from None


class Mock500Inputs:
    def __init__(self, token, received, context, record, paths, repo, digest):
        need(token is TOKEN)
        self._received, self._context, self._record = received, copy.deepcopy(context), copy.deepcopy(record)
        self._paths, self._repo, self._digest = dict(paths), repo, digest
        self._claimed = False

    def controller_context(self):
        return copy.deepcopy(self._context)

    def backup_context(self):
        return {'schema': 'helmut-w15-backup-context/1', 'scope': 'ISOLATED_GITHUB_MOCK500_BACKUP_ONLY',
                **{key: self._context[key] for key in ('nonce', 'exactCommit', 'runId', 'runAttempt')},
                'inputManifestSHA': self._context['inputManifestPin']['sha256'],
                'recipientFingerprint': '7E3998A6C2CB948C69A2EE51F4267ABF26796EDC', 'executionAuthority': False}

    def backup_input_files(self):
        return self._received.backup_input_files()

    def backup_provenance_files(self):
        return {**self._received.backup_provenance_files(),
                **{'mock500/' + key + '.PRIVATE': self.path(key) for key in ASSETS}}

    def path(self, key):
        if key in ('frozenSourceDump', 'localRoles'):
            return self._received.path(key)
        need(key in ASSETS)
        file_bytes(self._paths[key], self._record['assets'][key])
        return Path(self._paths[key])

    def check_sources(self):
        self._received.check_sources()
        for key in ASSETS:
            file_bytes(self._paths[key], self._record['assets'][key])
        reception = decode(file_bytes(self._paths['originalReception'], self._record['assets']['originalReception']))
        need(reception['actualFileCount'] == 11 and reception['actualPayloadBytes'] == 96530256)
        need(self._record['assets']['originalReception']['sha256'] == '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1')
        for key in ('package', 'normalizedCurrentPolicy', 'originalUPacket'):
            old = next(row for row in reception['files'] if row['key'] == key)
            need(old['status'] == 'PASS' and old['expectedBytes'] == self._record['assets'][key]['bytes']
                 and old['expectedSHA256'] == self._record['assets'][key]['sha256'])
        for key in ('frozenSourceDump', 'localRoles'):
            old = next(row for row in reception['files'] if row['key'] == key)
            need(old['status'] == 'PASS')
            file_bytes(self._received.path(key), {'bytes': old['expectedBytes'], 'sha256': old['expectedSHA256']})
        qualification = decode(file_bytes(self._paths['qualificationReport'], self._record['assets']['qualificationReport']))
        need(self._record['assets']['qualificationReport'] == {'bytes': 13706128,
             'sha256': 'd2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d'})
        need(qualification['status'] == 'PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS'
             and qualification['completedOwners'] == qualification['qualifiedOwners'] == 500
             and qualification['failedOwners'] == 0 and qualification['qualifiedAssetsPinned'] is True
             and qualification['sourceDatesRewritten'] is False and qualification['originalFilesWritten'] is False)
        for key, old in (('qualifiedRows', 'rows'), ('qualifiedFixtures', 'fixtures'), ('qualifiedNative', 'native'), ('qualifiedDerivations', 'derivations'), ('currentReplacements', None)):
            pin = qualification['currentNativeReplacementsPin'] if old is None else qualification['qualifiedAssets'][old]
            need({k: pin[k] for k in ('bytes', 'sha256')} == self._record['assets'][key])
        validate_source_compatibility(qualification, self._repo)
        need(self._record['assets']['publicationPolicy']['sha256'] == '274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04'
             and self._record['assets']['originalBuilderArchive'] == {'bytes': 269598, 'sha256': 'c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15'})
        validate_atomic_auth(self._repo)

    def claim(self, resources):
        need(not self._claimed)
        resources.check_context(self._context)
        self.check_sources()
        self._claimed = True

    def private_descriptor(self):
        self.check_sources()
        now = datetime.now(timezone.utc)
        return {'schema': 'helmut-w15-mock500-private-runtime/1', 'context': self.controller_context(),
            'bindingSHA256': self._digest, 'assets': {key: {'path': str(self._paths[key]), **self._record['assets'][key]} for key in ASSETS},
            'calendar': {'utcDay': now.date().isoformat(), 'berlinDay': now.astimezone(ZoneInfo('Europe/Berlin')).date().isoformat(),
                         'sourceDatesRewritten': False, 'signaturesReused': False}}

    def declared_additional_input_bytes(self):
        # The originalReception is the already verified12er `reception` file.
        # Every other retained private source is an additional charged copy.
        need(set(self._record['assets']) == ASSETS)
        amounts = [pin['bytes'] for key, pin in self._record['assets'].items() if key != 'originalReception']
        need(all(type(value) is int and 0 < value <= MAX_FILE for value in amounts))
        return sum(amounts)

    def stage_sources(self, destination, guard):
        """Copy committed code and the existing pinned binaries in the parent."""
        need(callable(guard))
        destination = Path(destination)
        destination.mkdir(mode=0o700)
        app = destination / 'app'; app.mkdir(mode=0o700)
        for folder in ('lib', 'scripts'):
            shutil.copytree(self._repo / folder, app / folder, symlinks=False)
            guard()
        for filename in ('server.js', 'package.json', 'package-lock.json'):
            shutil.copyfile(self._repo / filename, app / filename)
        for name in ('node', 'postgrest'):
            pin = {key: self._context['runtimePins'][name][key] for key in ('bytes', 'sha256')}
            raw = file_bytes(self._paths[name], pin, private=False)
            with (destination / name).open('xb') as output:
                os.fchmod(output.fileno(), 0o700); output.write(raw); output.flush(); os.fsync(output.fileno())
            guard()
        self.check_sources()
