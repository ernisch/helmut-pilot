"""Pure private index assembly for the retained 15+1 Mock500 cipher sources.

No CLI, HTTP, GPG, GO, run-id creation or dispatch. The returned index is PRIVATE:
never log it or expose it as a plaintext workflow input. This producer does not
grant Mock500 readiness, qualify sources or manufacture a preceding acceptance.
"""
import sys
sys.dont_write_bytecode = True
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
from pathlib import Path
import re

HERE = Path(__file__).absolute().parent


def _load(name):
    spec = importlib.util.spec_from_file_location('w15_mock_index_builder_' + name, HERE / (name + '.py'))
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


MR, SIGNED, ARCHIVE, HANDOFF = [_load(name) for name in (
    'mock500_receive', 'mock500_receive_dispatch', 'mock500_original_archive', 'mock500_archive_receive')]
SOURCE_CODES = tuple('end500.gpg.part-' + str(index).zfill(3) for index in range(1, 16)) + (
    'HELMUT_MOCK500_ORIGINALS_20261030.tar.gz.gpg',)
PHASES = {'arguments', 'sources', 'freshness', 'input-binding', 'receiver-format'}


class MockIndexBuildError(ValueError):
    def __init__(self, phase='arguments'):
        self.phase = phase if phase in PHASES else 'arguments'
        super().__init__('MOCK500_PRIVATE_INDEX_BUILD_REJECTED')


def need(value, phase):
    if not value: raise MockIndexBuildError(phase)


def _utc(value):
    return value.astimezone(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


def build_index(sources, *, input_binding_raw, input_binding_sha256, expected_commit, now):
    """Build one versioned gzip-index from exact ordered, already obtained URLs.

    ``sources`` is exactly16 dictionaries ``{sourceCode,url}`` in SOURCE_CODES
    order. ``input_binding_raw`` is the independently reviewed canonical public
    binding for expected_commit. Its review is consumed, never produced here.
    ``now`` is the caller's aware clock observation. The caller must recheck all
    actual expiries immediately before any separately approved future dispatch.
    """
    phase = 'arguments'
    try:
        need(type(expected_commit) is str and re.fullmatch('[a-f0-9]{40}', expected_commit), phase)
        need(isinstance(now, datetime) and now.tzinfo is not None and now.utcoffset() is not None, phase)
        now = now.astimezone(timezone.utc)
        phase = 'sources'
        need(type(sources) is list and len(sources) == len(SOURCE_CODES)
             and all(type(row) is dict and set(row) == {'sourceCode', 'url'} for row in sources)
             and tuple(row['sourceCode'] for row in sources) == SOURCE_CODES, phase)
        phase = 'freshness'
        checked = [SIGNED.signed_link(row['url'], now) for row in sources]
        urls = [row[0] for row in checked]
        # Two signatures for the same blob are still one source, not two parts.
        blobs = [(parsed.netloc, parsed.path) for parsed in map(MR.E.urllib.parse.urlsplit, urls)]
        need(len(set(urls)) == len(SOURCE_CODES) and len(set(blobs)) == len(SOURCE_CODES), phase)
        earliest = min(row[1] for row in checked)
        expires = min(earliest, now + timedelta(minutes=30))
        need((earliest - now).total_seconds() > SIGNED.MIN_LINK_SECONDS, phase)
        phase = 'input-binding'
        need(type(input_binding_raw) is bytes and 0 < len(input_binding_raw) <= 32768
             and type(input_binding_sha256) is str and re.fullmatch('[a-f0-9]{64}', input_binding_sha256)
             and hashlib.sha256(input_binding_raw).hexdigest() == input_binding_sha256, phase)
        binding = MR.P.decode(input_binding_raw)
        need(type(binding) is dict and MR.canonical(binding) == input_binding_raw, phase)
        phase = 'receiver-format'
        original = {'schema': 'helmut-w15-private-cipher-url-index/1', 'expectedCommit': expected_commit,
            'createdAtUTC': _utc(now), 'expiresAtUTC': _utc(expires),
            'parts': [{'index': index, 'url': url} for index, url in enumerate(urls[:15], 1)]}
        archive = {'format': HANDOFF.FORMAT, 'driveId': HANDOFF.DRIVE_ID,
            'cipherBytes': ARCHIVE.CIPHER['bytes'], 'cipherSHA256': ARCHIVE.CIPHER['sha256'],
            'manifestSHA256': ARCHIVE.MANIFEST['sha256'], 'url': urls[15]}
        value = {'schema': 'helmut-w15-mock500-private-url-index/1', 'expectedCommit': expected_commit,
            'createdAtUTC': _utc(now), 'expiresAtUTC': _utc(expires), 'original': original,
            'assets': archive, 'inputBinding': input_binding_raw.decode('utf-8')}
        raw = MR.canonical(value).decode('ascii')
        # The existing consumer remains the authority for all11 asset pins,
        # originalReception, SourceComparison, fixed archive format and totals.
        observed = MR.checked_index(raw, expected_commit, input_binding_sha256=input_binding_sha256,
            additional_asset_bytes=ARCHIVE.TOTAL, now=now)
        need(observed['archive_format'] == HANDOFF.FORMAT and observed['binding_raw'] == input_binding_raw
             and observed['original_urls'] == urls[:15] and observed['archive']['url'] == urls[15], phase)
        return {'index_raw': raw, 'safe_plan': {
            'schema': 'helmut-w15-mock500-private-index-plan/1',
            'status': 'PASS_PRIVATE_INDEX_ASSEMBLY_ONLY_START_BLOCKED', 'expectedCommit': expected_commit,
            'sourceCount': 16, 'originalParts': 15, 'additionalArchives': 1, 'additionalFiles': 11,
            'additionalAssetBytes': ARCHIVE.TOTAL, 'createdAtUTC': _utc(now), 'expiresAtUTC': _utc(expires),
            'privateIndexBytes': len(raw.encode('utf-8')), 'inputBindingSHA256': input_binding_sha256,
            'minimumActualLinkSecondsExclusive': SIGNED.MIN_LINK_SECONDS,
            'finalDispatchFreshnessCheckRequired': True, 'fullWorkflowParameterSizeChecked': False,
            'maximumWorkflowInputChars': 65535, 'sourceQualificationProduced': False,
            'end500Acceptance': False, 'mock500Readiness': False, 'mock500Acceptance': False,
            'executionAuthority': False, 'testStarted': False, 'originalDataRead': False}}
    except BaseException:
        raise MockIndexBuildError(phase) from None
