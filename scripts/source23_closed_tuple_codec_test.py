"""Fictional, offline regression cases for the closed metadata transport."""
import copy
import hashlib
import json
import unittest

import source23_closed_tuple_codec as codec


def fictional_row(index=0):
    original = '{"fictional":true,"n":123456789012345678901234567890,"d":1.2300e-9,"z":-0,"text":"ä😀\\n\\\""}'
    identifier = 'fictional-%03d' % index
    return {
        'id': identifier, 'scope': ('BT', 'BE', 'BB')[index % 3],
        'source23OriginalUtf8': original,
        'nativeProjectionUtf8Bytes': len(original.encode('utf8')),
        'nativeProjectionSha256': hashlib.sha256(original.encode('utf8')).hexdigest(),
        'pk': {'id': identifier}, 'xmin': str(index + 1),
        'rawKeyPresence': dict(zip(codec.RAW_KEYS, (False, True, True, False, True))),
        'rawProjectionNativeTypes': dict(zip(codec.RAW_TYPE_KEYS, (None, 'null', 'object', None, 'object'))),
    }


class ClosedTupleTests(unittest.TestCase):
    def test_67_rows_lossless_and_metadata_savings(self):
        rows = [fictional_row(i) for i in range(67)]
        before = copy.deepcopy(rows)
        packed = codec.pack_rows(rows)
        restored = codec.unpack_rows(packed)
        self.assertEqual(restored, before)
        self.assertEqual(rows, before)
        for source, result in zip(rows, restored):
            self.assertEqual(source['source23OriginalUtf8'].encode(), result['source23OriginalUtf8'].encode())
        serialize = lambda value: json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()
        self.assertEqual(len(serialize(rows)) - len(serialize(packed)), 21306)
        restored[0]['pk']['id'] = 'changed'
        restored[0]['rawKeyPresence'][codec.RAW_KEYS[0]] = True
        restored[0]['rawProjectionNativeTypes']['q'] = 'object'
        self.assertEqual(rows, before)
        self.assertEqual(codec.unpack_rows(packed), before)

    def test_opaque_metadata_and_all_native_type_witnesses(self):
        class NumberToken(str):
            pass
        row = fictional_row()
        token = NumberToken('123456789012345678901234567890')
        row['nativeProjectionUtf8Bytes'] = token
        restored = codec.unpack_rows(codec.pack_rows([row]))[0]
        self.assertIs(restored['nativeProjectionUtf8Bytes'], token)
        for witness in (None, 'object', 'array', 'string', 'number', 'boolean', 'null'):
            row['rawProjectionNativeTypes']['q'] = witness
            self.assertEqual(codec.unpack_rows(codec.pack_rows([row])), [row])
        self.assertEqual(codec.pack_rows([]), [])
        self.assertEqual(codec.unpack_rows([]), [])

    def test_closed_keys_cannot_hide_missing_fields(self):
        for path, key in (((), 'scope'), (('pk',), 'id'),
                          (('rawKeyPresence',), codec.RAW_KEYS[0]),
                          (('rawProjectionNativeTypes',), 'q')):
            for alteration in ('missing', 'extra', 'both'):
                with self.subTest(path=path, alteration=alteration):
                    row = fictional_row()
                    target = row if not path else row[path[0]]
                    if alteration in ('missing', 'both'):
                        del target[key]
                    if alteration in ('extra', 'both'):
                        target['unknown'] = None
                    with self.assertRaises(ValueError):
                        codec.pack_rows([row])
        for index in (5,):
            row = codec.pack_rows([fictional_row()])[0]
            row[index] = {'unknown': 'fictional-000'}
            with self.assertRaises(ValueError):
                codec.unpack_rows([row])

    def test_wrong_arity_types_and_values_stop(self):
        class ListSubclass(list):
            pass
        class DictSubclass(dict):
            pass
        class StringSubclass(str):
            pass
        for bad in (None, {}, (), 'rows', ListSubclass(), [fictional_row()] * 68):
            for function in (codec.pack_rows, codec.unpack_rows):
                with self.subTest(top=type(bad), function=function.__name__):
                    with self.assertRaises(ValueError):
                        function(bad)
        for bad in (None, [], DictSubclass(fictional_row())):
            with self.assertRaises(ValueError):
                codec.pack_rows([bad])
        packed = codec.pack_rows([fictional_row()])[0]
        for bad in (None, {}, tuple(packed), packed[:-1], packed + [None], ListSubclass(packed)):
            with self.assertRaises(ValueError):
                codec.unpack_rows([bad])
        for index in (7, 8):
            for bad in (None, {}, packed[index][:-1], packed[index] + [None], ListSubclass(packed[index])):
                row = copy.deepcopy(packed)
                row[index] = bad
                with self.assertRaises(ValueError):
                    codec.unpack_rows([row])
        for field, key, values in (
            ('rawKeyPresence', codec.RAW_KEYS[0], (None, 0, 1, 'false')),
            ('rawProjectionNativeTypes', 'q', (False, 1, [], 'unknown', StringSubclass('object'))),
        ):
            for bad in values:
                row = fictional_row()
                row[field][key] = bad
                with self.assertRaises(ValueError):
                    codec.pack_rows([row])
                array = copy.deepcopy(packed)
                array[7 if field == 'rawKeyPresence' else 8][0] = bad
                with self.assertRaises(ValueError):
                    codec.unpack_rows([array])
        for bad in (None, 1, StringSubclass('text')):
            row = fictional_row()
            row['source23OriginalUtf8'] = bad
            with self.assertRaises(ValueError):
                codec.pack_rows([row])
            array = copy.deepcopy(packed)
            array[2] = bad
            with self.assertRaises(ValueError):
                codec.unpack_rows([array])
        for field in ('pk', 'rawKeyPresence', 'rawProjectionNativeTypes'):
            row = fictional_row()
            row[field] = DictSubclass(row[field])
            with self.assertRaises(ValueError):
                codec.pack_rows([row])


if __name__ == '__main__':
    unittest.main()
