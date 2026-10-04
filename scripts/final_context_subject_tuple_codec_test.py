"""Synthetic checks only; no database, network, provider, secrets or real IDs."""
import copy
import json
import re
import unittest

from final_context_subject_tuple_codec import (
    VERSION, MAX_SUBJECTS, pack_frame, unpack_frame,
)


class NativeNumberToken(str):
    pass


def base(subjects=()):
    return {'version': VERSION, 'counts': {}, 'sourceParity': [],
            'knowledgeObjects': [], 'prefixes': [], 'links': [],
            'linkedSources': [], 'logicalMissing': [], 'actualWAccepted': False,
            'exacts': [{'subject': s, 'id': None} for s in subjects],
            'reservations': [{'subject': s, 'xmin': None, 'row': None} for s in subjects],
            'memos': [{'subject': s, 'xmin': None, 'row': None} for s in subjects]}


class CodecTest(unittest.TestCase):
    def test_concrete_scope_size_and_lossless_absence(self):
        original = base(['synthetischer-vorgang-%04d-abcdefghij' % i for i in range(966)])
        before = copy.deepcopy(original)
        packed = pack_frame(original)
        self.assertGreater(len(json.dumps(original, separators=(',', ':')).encode()), 131072)
        self.assertLess(len(json.dumps(packed, separators=(',', ':')).encode()), 131072)
        self.assertEqual(unpack_frame(packed), original)
        self.assertEqual(original, before)
        self.assertEqual(len(packed['subjectDictionary']), 966)

    def test_shared_dictionary_order_duplicates_and_positive_rows(self):
        original = base(['zweiter', 'erster', 'zweiter'])
        original['memos'].append({'subject': 'dritter', 'xmin': '123', 'row': {'n': 0}})
        packed = pack_frame(original)
        before = copy.deepcopy(packed)
        self.assertEqual(packed['subjectDictionary'], ['zweiter', 'erster', 'dritter'])
        self.assertEqual(unpack_frame(packed), original)
        self.assertEqual(packed, before)

    def test_native_numeric_tokens_and_raw_unicode_stay_opaque(self):
        original = base(['ü-ß-é', 'e\u0301'])
        token = NativeNumberToken('9007199254740993.1234567890')
        value = {'number': token, 'scale': NativeNumberToken('1.2300'),
                 'raw': '"quote" \\ slash\nü', 'string': '1.2300', 'null': None}
        original['counts']['n'] = NativeNumberToken('966')
        original['memos'][0].update(xmin='4294967295', row=value)
        decoded = unpack_frame(pack_frame(original))
        self.assertIs(decoded['memos'][0]['row'], value)
        self.assertIs(decoded['memos'][0]['row']['number'], token)
        self.assertEqual(str(token), '9007199254740993.1234567890')
        self.assertIs(type(decoded['memos'][0]['row']['scale']), NativeNumberToken)
        self.assertIs(type(decoded['memos'][0]['row']['string']), str)
        self.assertEqual(decoded, original)

    def test_explicit_native_index_reader(self):
        packed = pack_frame(base(['eins']))
        for key in ('exacts', 'reservations', 'memos'):
            packed[key][0][0] = NativeNumberToken('0')
        def reader(value):
            if type(value) is not NativeNumberToken or not re.fullmatch(r'0|[1-9][0-9]*', value):
                raise ValueError('not native integral token')
            return int(value)
        with self.assertRaises(ValueError):
            unpack_frame(packed)
        self.assertEqual(unpack_frame(packed, index_reader=reader), base(['eins']))
        for wrong in (True, '0', 0.0):
            with self.assertRaises(ValueError):
                unpack_frame(packed, index_reader=lambda _: wrong)

    def test_bad_default_indices(self):
        for wrong in (True, False, -1, 1, 0.5, '0', None):
            packed = pack_frame(base(['eins']))
            packed['exacts'][0][0] = wrong
            with self.assertRaises(ValueError):
                unpack_frame(packed)

    def test_dictionary_closedness_and_bounds(self):
        for dictionary in ([], ['eins', 'unused'], ['eins', 'eins'], [None], [''],
                           ['x%d' % i for i in range(MAX_SUBJECTS + 1)]):
            packed = pack_frame(base(['eins']))
            packed['subjectDictionary'] = dictionary
            with self.assertRaises(ValueError):
                unpack_frame(packed)

    def test_headers_stop_and_w_are_not_success(self):
        for encoded in (False, True):
            f = pack_frame(base()) if encoded else base()
            operation = unpack_frame if encoded else pack_frame
            for mutate in (lambda x: x.update(extra=0), lambda x: x.pop('counts'),
                           lambda x: x.update(version='other'),
                           lambda x: x.update(actualWAccepted=True),
                           lambda x: x.update(actualWAccepted=0)):
                changed = copy.deepcopy(f); mutate(changed)
                with self.assertRaises(ValueError):
                    operation(changed)
        with self.assertRaises(ValueError):
            pack_frame({'stop': 'unknown', 'actualWAccepted': False})
        with self.assertRaises(ValueError):
            pack_frame(pack_frame(base()))
        packed = pack_frame(base()); packed['encoding'] = 'unknown'
        with self.assertRaises(ValueError):
            unpack_frame(packed)

    def test_record_shapes_and_tuple_lengths(self):
        for row in ({'subject': 'eins'}, {'subject': 'eins', 'id': None, 'extra': 0},
                    {'subject': None, 'id': None}):
            f = base(); f['exacts'] = [row]
            with self.assertRaises(ValueError):
                pack_frame(f)
        for row in ([0], [0, None, None], {'subject': 0, 'id': None}):
            f = pack_frame(base(['eins'])); f['exacts'] = [row]
            with self.assertRaises(ValueError):
                unpack_frame(f)

    def test_each_family_row_bound(self):
        for key, maximum in (('exacts', 1407), ('reservations', 1919), ('memos', 1919)):
            f = base(); f[key] = [None] * (maximum + 1)
            with self.assertRaises(ValueError):
                pack_frame(f)
            f = pack_frame(base()); f[key] = [None] * (maximum + 1)
            with self.assertRaises(ValueError):
                unpack_frame(f)

    def test_empty_explicit_arrays_roundtrip(self):
        self.assertEqual(unpack_frame(pack_frame(base())), base())


if __name__ == '__main__':
    unittest.main()
