"""Read existing Mock500 files and pinned metadata only; never acquire/qualify.

Explicit CLI: --inventory-existing-only [--qualification-report ABSOLUTE_PATH]
[--original-reception ABSOLUTE_PATH] [--publication-policy ABSOLUTE_PATH]
[--builder-archive ABSOLUTE_PATH]. No contents, credentials or exceptions print.
"""
import sys
sys.dont_write_bytecode = True
import hashlib
import json
import os
from pathlib import Path
import re
import stat

QUALIFICATION = '/workspace/shared/helmut-w15-current-source-update-20261028/qualification-b/ALL500_MOCK_BINDINGS_CHECK.SAFE.json'
RECEPTION = '/workspace/shared/helmut-w15-receipt-20261027/reports/W15_RECEPTION_REPORT.SAFE.json'
POLICY = '/workspace/shared/helmut-w15-development-20261027/publication-policy.PRIVATE.json'
ARCHIVE = '/workspace/attachments/1ba8d4a9-bf54-4cbe-b89b-2fb3f2b7518b/HELMUT_HANDOFF_20261016_MINIMAL.zip'
PINS = {
    'qualificationReport': {'bytes': 13706128, 'sha256': 'd2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d'},
    'originalReception': {'bytes': 12357, 'sha256': '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'},
    'package': {'bytes': 631359, 'sha256': '52b4a49c334a2d537f642cddf3f95d3eb6e6830e0f3b1b7280c8bd8fd3812f10'},
    'normalizedCurrentPolicy': {'bytes': 89982254, 'sha256': '90e11a4228e2e568edf03c3feb9ea2c79e71449e68fdc6c563a3355f1fbaaa14'},
    'originalUPacket': {'bytes': 53018, 'sha256': '8d732cb88dc6df457b66682a45831e60b8ecdb28d92b35d4c1db4440991f2ed2'},
    'publicationPolicy': {'bytes': 493, 'sha256': '274033cdfdd5f1527d0e961a6c00482d61b7be317eeea03e736a6a5948aa6a04'},
    'originalBuilderArchive': {'bytes': 269598, 'sha256': 'c979e18775f285ddf7af4328c8efc8f0642954eb6d0e52e50636d3b4ab902d15'},
}
QUALIFIED = {'qualifiedRows': 'rows', 'qualifiedFixtures': 'fixtures', 'qualifiedNative': 'native',
             'qualifiedDerivations': 'derivations', 'currentReplacements': None}
REQUIRED = ('package', 'normalizedCurrentPolicy', 'originalUPacket', 'qualificationReport',
            *QUALIFIED, 'publicationPolicy', 'originalBuilderArchive')
MAX_FILE, CHUNK = 256 * 1024 * 1024, 1024 * 1024


def need(value):
    if not value: raise ValueError('EXISTING_INVENTORY_REJECTED')


def _path(value):
    need(type(value) is str and value.startswith('/') and value != '/' and str(Path(value)) == value
         and all(part not in ('', '.', '..') for part in value[1:].split('/'))
         and all(ord(c) >= 32 and ord(c) != 127 for c in value))
    return value


def _pin(value):
    need(type(value) is dict and type(value.get('bytes')) is int and 0 < value['bytes'] <= MAX_FILE
         and type(value.get('sha256')) is str and re.fullmatch('[a-f0-9]{64}', value['sha256']))
    return {key: value[key] for key in ('bytes', 'sha256')}


def _row(key, path=None, pin=None):
    return {'key': key, 'path': path, 'bytes': None if pin is None else pin['bytes'],
        'sha256': None if pin is None else pin['sha256'], 'present': None, 'equal': None,
        'observedBytes': None, 'observedSHA256': None, 'status': 'PIN_OR_PATH_UNRESOLVED'}


def _stream(key, path, pin, *, capture=False):
    """No-follow descriptors and read-only flags; never create or change files."""
    path, pin = _path(path), _pin(pin)
    result = _row(key, path, pin)
    directory = child = None
    try:
        directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
        parts = path[1:].split('/')
        for part in parts[:-1]:
            opened = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory); directory = opened
        value = os.stat(parts[-1], dir_fd=directory, follow_symlinks=False)
        result['present'] = True
        if not stat.S_ISREG(value.st_mode):
            result.update(status='REJECTED_NONREGULAR_FILE', equal=False)
            return result, None
        result['observedBytes'] = value.st_size
        if value.st_size > MAX_FILE:
            result.update(status='REJECTED_SIZE_LIMIT', equal=False)
            return result, None
        child = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
        before = os.fstat(child)
        need(stat.S_ISREG(before.st_mode) and (before.st_dev, before.st_ino) == (value.st_dev, value.st_ino))
        digest, size, blocks = hashlib.sha256(), 0, []
        while block := os.read(child, CHUNK):
            size += len(block); need(size <= MAX_FILE); digest.update(block)
            if capture: blocks.append(block)
        after = os.fstat(child)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns', 'st_mode', 'st_uid', 'st_nlink')
        stable = size == before.st_size and all(getattr(before, k) == getattr(after, k) for k in fields)
        result.update(observedBytes=size, observedSHA256=digest.hexdigest(),
            equal=stable and size == pin['bytes'] and digest.hexdigest() == pin['sha256'])
        result['status'] = 'PASS_EQUAL_BYTES' if result['equal'] else 'MISMATCH_OR_CHANGED_DURING_READ'
        return result, b''.join(blocks) if capture and result['equal'] else None
    except FileNotFoundError:
        result.update(present=False, equal=False, status='MISSING_EXISTING_FILE')
    except (OSError, ValueError):
        result.update(equal=False, status='READ_OR_PATH_UNAVAILABLE')
    finally:
        if child is not None: os.close(child)
        if directory is not None: os.close(directory)
    return result, None


def _decode(raw):
    def unique(rows):
        result = {}
        for key, value in rows:
            need(key not in result); result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique, parse_constant=lambda _: need(False))


def inventory_existing(*, qualification_report=QUALIFICATION, original_reception=RECEPTION,
                       publication_policy=POLICY, builder_archive=ARCHIVE):
    controls = {}
    controls['qualificationReport'], qualified_raw = _stream('qualificationReport', qualification_report,
        PINS['qualificationReport'], capture=True)
    controls['originalReception'], reception_raw = _stream('originalReception', original_reception,
        PINS['originalReception'], capture=True)
    resolved = {'qualificationReport': (qualification_report, PINS['qualificationReport']),
                'publicationPolicy': (publication_policy, PINS['publicationPolicy']),
                'originalBuilderArchive': (builder_archive, PINS['originalBuilderArchive'])}
    accepted = {'qualificationReport': False, 'originalReception': False}
    if qualified_raw is not None:
        try:
            report = _decode(qualified_raw)
            need(report['status'] == 'PASS_ALL500_CURRENT_ORIGINAL_MOCK_BINDINGS'
                 and all(type(report[k]) is int and report[k] == expected for k, expected in (
                     ('completedOwners', 500), ('qualifiedOwners', 500), ('failedOwners', 0)))
                 and report['qualifiedAssetsPinned'] is True and report['sourceDatesRewritten'] is False)
            for key, old in QUALIFIED.items():
                try:
                    entry = report['currentNativeReplacementsPin'] if old is None else report['qualifiedAssets'][old]
                    resolved[key] = (_path(entry['path']), _pin(entry))
                except (KeyError, TypeError, ValueError): pass
            accepted['qualificationReport'] = all(key in resolved for key in QUALIFIED)
        except (KeyError, TypeError, ValueError, UnicodeError): pass
    if reception_raw is not None:
        try:
            receipt = _decode(reception_raw)
            need(receipt['actualFileCount'] == 11 and receipt['actualPayloadBytes'] == 96530256
                 and type(receipt['files']) is list)
            for key in ('package', 'normalizedCurrentPolicy', 'originalUPacket'):
                entries = [row for row in receipt['files'] if row.get('key') == key]
                need(len(entries) == 1)
                entry = entries[0]; need(entry['status'] == 'PASS')
                pin = {'bytes': entry['expectedBytes'], 'sha256': entry['expectedSHA256']}
                need(_pin(pin) == PINS[key])
                resolved[key] = (_path(entry['receivedPath']), pin)
            accepted['originalReception'] = True
        except (KeyError, TypeError, ValueError, UnicodeError): pass
    rows = []
    for key in REQUIRED:
        if key == 'qualificationReport': rows.append(controls[key]); continue
        if key not in resolved: rows.append(_row(key, pin=PINS.get(key))); continue
        path, pin = resolved[key]; rows.append(_stream(key, path, pin)[0])
    success = all(accepted.values()) and all(row['equal'] is True for row in rows)
    try: tool_sha = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    except (OSError, NameError): tool_sha = None
    return {'schema': 'helmut-w15-existing-mock500-inventory/1',
        'status': 'PASS_EXISTING_REQUIRED_BYTES_ONLY' if success else 'BLOCKED_EXISTING_FILES_OR_PINS',
        'scope': 'Existing local source files only; receiver availability and transfer authority are not assessed.',
        'toolSourceSHA256': tool_sha, 'controls': controls, 'controlMetadataAccepted': accepted,
        'requiredFiles': 11, 'files': rows,
        'declaredRequiredBytes': sum(row['bytes'] for row in rows) if all(type(row['bytes']) is int for row in rows) else None,
        'presentMatchingKeys': [row['key'] for row in rows if row['equal'] is True],
        'missingExistingKeys': [row['key'] for row in rows if row['present'] is False],
        'mismatchedExistingKeys': [row['key'] for row in rows if row['present'] is True and row['equal'] is False],
        'unresolvedMetadataKeys': [row['key'] for row in rows if row['path'] is None or row['bytes'] is None or row['sha256'] is None],
        'filesWritten': 0, 'qualificationRepeated': False, 'constructorsExecuted': False,
        'networkUsed': False, 'GPGUsed': False, 'receiverAvailabilityObserved': False,
        'executionAuthority': False, 'transferAllowed': False}


def main(argv=None):
    args = sys.argv[1:] if argv is None else list(argv)
    if args in ([], ['--plan']):
        print(json.dumps({'status': 'BLOCKED_EXPLICIT_READONLY_INVENTORY_FLAG_REQUIRED',
            'filesWritten': 0, 'networkUsed': False, 'transferAllowed': False, 'executionAuthority': False}))
        return 0
    try:
        need(args[0] == '--inventory-existing-only' and (len(args) - 1) % 2 == 0)
        names = {'--qualification-report': 'qualification_report', '--original-reception': 'original_reception',
                 '--publication-policy': 'publication_policy', '--builder-archive': 'builder_archive'}
        options = {}
        for index in range(1, len(args), 2):
            name = names.get(args[index]); need(name is not None and name not in options)
            options[name] = _path(args[index + 1])
        result = inventory_existing(**options)
        print(json.dumps(result, sort_keys=True, ensure_ascii=True, allow_nan=False))
        return 0 if result['status'] == 'PASS_EXISTING_REQUIRED_BYTES_ONLY' else 1
    except (Exception, KeyboardInterrupt):
        print(json.dumps({'status': 'FAIL_EXISTING_INVENTORY_ARGUMENTS_OR_METADATA',
            'filesWritten': 0, 'transferAllowed': False, 'executionAuthority': False}))
        return 2


if __name__ == '__main__': raise SystemExit(main())
