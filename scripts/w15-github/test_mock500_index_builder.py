"""Small fake16-SAS and public binding checks; no sources, GPG or API work."""
import sys
sys.dont_write_bytecode = True
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('w15_mock_index_builder_tested', Path(__file__).with_name('mock500_index_builder.py'))
M = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(M)
COMMIT, NOW = 'a' * 40, datetime(2026, 10, 30, 10, tzinfo=timezone.utc)
FICTIONAL = 'FICTIONAL_CAPABILITY_NOT_A_REAL_SIGNATURE'


def sources(margins=None):
    margins = margins or [240] * 16
    rows = []
    for index, (code, seconds) in enumerate(zip(M.SOURCE_CODES, margins, strict=True), 1):
        query = {'se': M._utc(NOW + timedelta(seconds=seconds)), 'sp': 'r', 'sr': 'b', 'sig': FICTIONAL}
        url = 'https://fictional.oaiusercontent.com/fake-part-' + str(index) + '?' + M.MR.E.urllib.parse.urlencode(query)
        rows.append({'sourceCode': code, 'url': url})
    return rows


def binding():
    assets = {key: {'bytes': row[1], 'sha256': row[2]} for key, row in M.ARCHIVE.FILES.items()}
    assets['originalReception'] = {'bytes': 12357, 'sha256': '2cee6eb467342cabbe28db958ac00cc6cd9699622c3a772796d68d2d6adb97f1'}
    return {'schema': 'helmut-w15-mock500-static-input-binding/1', 'scope': M.MR.SCOPE,
        'status': 'PASS_INDEPENDENT_MOCK500_INPUT_BINDING_ONLY', 'exactCommit': COMMIT,
        'assets': assets, 'executionAuthority': False, 'testStarted': False,
        'sourceComparison': {'status': 'PASS_INDEPENDENT_ORIGINAL16_CURRENT2_SOURCE_COMPARISON',
            'originalSourceChecks': 16, 'currentSourceChecks': 2,
            'qualificationSHA256': assets['qualificationReport']['sha256'],
            'sourceDatesRewritten': False, 'originalsUnchanged': True}}


class MockIndexChecks(unittest.TestCase):
    def build(self, rows=None, record=None, raw=None, digest=None, **changes):
        raw = M.MR.canonical(binding() if record is None else record) if raw is None else raw
        return M.build_index(sources() if rows is None else rows, input_binding_raw=raw,
            input_binding_sha256=digest or hashlib.sha256(raw).hexdigest(),
            expected_commit=changes.get('commit', COMMIT), now=changes.get('now', NOW))

    def test_actual_receiver_accepts_new_gzip_format_and16_exact_ordered_sources(self):
        with patch.object(M.MR, 'checked_index', wraps=M.MR.checked_index) as consumer:
            result = self.build()
        consumer.assert_called_once()
        index = json.loads(result['index_raw']); plan = result['safe_plan']
        self.assertEqual([r['index'] for r in index['original']['parts']], list(range(1, 16)))
        self.assertEqual([r['url'] for r in index['original']['parts']], [r['url'] for r in sources()[:15]])
        self.assertEqual(index['assets']['url'], sources()[15]['url'])
        self.assertEqual(index['assets']['format'], 'gpg-gzip-ustar-mock-originals/1')
        self.assertEqual(index['assets']['cipherBytes'], 17780398)
        self.assertEqual(plan['additionalAssetBytes'], 217563454)
        self.assertFalse(plan['executionAuthority'] or plan['testStarted'] or plan['mock500Readiness']
            or plan['end500Acceptance'] or plan['mock500Acceptance'] or plan['fullWorkflowParameterSizeChecked'])
        text = json.dumps(plan)
        for secret in (FICTIONAL, '.oaiusercontent.com', 'url', 'runId', 'nonce'):
            self.assertNotIn(secret, text)

    def test_missing_duplicate_extra_or_reordered_source_codes_are_rejected(self):
        for change in ('missing', 'extra', 'swap', 'duplicate-code', 'additional-key'):
            rows = sources()
            if change == 'missing': rows.pop()
            elif change == 'extra': rows.append(dict(rows[-1]))
            elif change == 'swap': rows[0], rows[1] = rows[1], rows[0]
            elif change == 'duplicate-code': rows[1]['sourceCode'] = rows[0]['sourceCode']
            else: rows[0]['extra'] = FICTIONAL
            with self.subTest(change=change), self.assertRaises(M.MockIndexBuildError) as got: self.build(rows)
            self.assertEqual(got.exception.phase, 'sources'); self.assertNotIn(FICTIONAL, str(got.exception))

    def test_actual_expiry_is_earliest_of16_never_shifted_and90_boundary_is_strict(self):
        for margin, accepted in [(90, False), (89, False), (-1, False), (90.001, True)]:
            with self.subTest(margin=margin):
                rows = sources([240] * 15 + [margin])
                if accepted:
                    result = self.build(rows); value = json.loads(result['index_raw'])
                    expiry = M._utc(NOW + timedelta(seconds=margin))
                    self.assertEqual(value['expiresAtUTC'], expiry)
                    self.assertEqual(value['original']['expiresAtUTC'], expiry)
                else:
                    with self.assertRaises(M.MockIndexBuildError) as got: self.build(rows)
                    self.assertEqual(got.exception.phase, 'freshness')
        result = self.build(sources([3600] * 16))
        self.assertEqual(json.loads(result['index_raw'])['expiresAtUTC'], M._utc(NOW + timedelta(minutes=30)))
        rows = sources([200, 110] + [240] * 14)
        result = self.build(rows)
        self.assertEqual(result['safe_plan']['expiresAtUTC'], M._utc(NOW + timedelta(seconds=110)))

    def test_all16_sas_policies_and_duplicate_blobs_are_checked(self):
        for position in range(16):
            rows = sources(); rows[position]['url'] = rows[position]['url'].replace('sp=r&', 'sp=rw&')
            with self.subTest(position=position), self.assertRaises(M.MockIndexBuildError): self.build(rows)
        for change in ('container', 'ip', 'missing-expiry', 'duplicate-query', 'duplicate-url', 'same-blob-other-signature', 'scheme', 'host', 'fragment'):
            rows = sources(); url = rows[-1]['url']
            if change == 'container': url = url.replace('sr=b', 'sr=c')
            elif change == 'ip': url += '&sip=127.0.0.1'
            elif change == 'missing-expiry': url = url.replace('se=', 'missing=')
            elif change == 'duplicate-query': url += '&sp=r'
            elif change == 'duplicate-url': url = rows[0]['url']
            elif change == 'same-blob-other-signature': url = rows[0]['url'].replace(FICTIONAL, 'FICTIONAL_OTHER_SIGNATURE')
            elif change == 'scheme': url = url.replace('https:', 'http:')
            elif change == 'host': url = url.replace('fictional.oaiusercontent.com', 'invalid.example')
            else: url += '#fragment'
            rows[-1]['url'] = url
            with self.subTest(change=change), self.assertRaises(M.MockIndexBuildError) as got: self.build(rows)
            self.assertEqual(got.exception.phase, 'freshness')

    def test_input_binding_hash_canonical_bytes_commit_and_all12_pins_remain_checked(self):
        raw = M.MR.canonical(binding())
        for changed_raw, digest in [(raw, '0' * 64), (raw + b'\n', hashlib.sha256(raw + b'\n').hexdigest())]:
            with self.assertRaises(M.MockIndexBuildError) as got: self.build(raw=changed_raw, digest=digest)
            self.assertEqual(got.exception.phase, 'input-binding')
        for key in binding()['assets']:
            record = binding(); record['assets'][key]['sha256'] = '0' * 64
            with self.subTest(asset=key), self.assertRaises(M.MockIndexBuildError) as got: self.build(record=record)
            self.assertEqual(got.exception.phase, 'receiver-format')
        for change in ('commit', 'source-checks', 'source-rewrite', 'authority', 'extra'):
            record = binding()
            if change == 'commit': record['exactCommit'] = 'b' * 40
            elif change == 'source-checks': record['sourceComparison']['originalSourceChecks'] = 15
            elif change == 'source-rewrite': record['sourceComparison']['sourceDatesRewritten'] = True
            elif change == 'authority': record['executionAuthority'] = True
            else: record['unknown'] = FICTIONAL
            with self.subTest(change=change), self.assertRaises(M.MockIndexBuildError): self.build(record=record)

    def test_private_index_size_and_arguments_fail_closed_without_leaking_inputs(self):
        for commit, now in [('A' * 40, NOW), (COMMIT, NOW.replace(tzinfo=None)), (COMMIT, 'invalid')]:
            with self.subTest(commit=commit, now=now), self.assertRaises(M.MockIndexBuildError) as got:
                self.build(commit=commit, now=now)
            self.assertEqual(got.exception.phase, 'arguments')
        rows = sources()
        # Individual existing URL bounds still allow these; combined plaintext
        # index exceeds the existing49151-byte consumer ceiling and is rejected.
        for row in rows: row['url'] += '&padding=' + 'x' * 3000
        with self.assertRaises(M.MockIndexBuildError) as got: self.build(rows)
        self.assertEqual(got.exception.phase, 'receiver-format')
        self.assertEqual(str(got.exception), 'MOCK500_PRIVATE_INDEX_BUILD_REJECTED')


if __name__ == '__main__': unittest.main()
