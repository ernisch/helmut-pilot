"""Closed tuple codec for SOURCE23 rows.

Pure standard library only: no SQL, no I/O, no network, no CLI, no tests.
The module translates between the nine field row dicts (ROW_KEYS) and the
closed nine element JSON lists.  source23OriginalUtf8 is copied verbatim;
other primitive metadata is retained without coercion.

Only shapes are checked here.  Semantic, type, hash and identity validation
stay with the downstream private gate.
"""

ENCODING = 'SOURCE23_CLOSED_TUPLES/1'
MAX_ROWS = 67

ROW_KEYS = (
    'id',
    'scope',
    'source23OriginalUtf8',
    'nativeProjectionUtf8Bytes',
    'nativeProjectionSha256',
    'pk',
    'xmin',
    'rawKeyPresence',
    'rawProjectionNativeTypes',
)

RAW_KEYS = (
    'helmutQuellenkontext',
    'helmutDipQuellfelder',
    'helmutBundestagArtikelstand',
    'helmutBerlinArtikelstand',
    'helmutBrandenburgLandtagPresseArtikelstand',
)

RAW_TYPE_KEYS = ('q', 'dip', 'bt', 'be', 'bb')

_RAW_TYPES = frozenset(('object', 'array', 'string', 'number', 'boolean', 'null'))
_ROW_KEYS_SET = frozenset(ROW_KEYS)
_RAW_KEYS_SET = frozenset(RAW_KEYS)
_RAW_TYPE_KEYS_SET = frozenset(RAW_TYPE_KEYS)
_PK_KEYS_SET = frozenset(('id',))


def pack_rows(rows):
    """Pack row dicts into closed nine value lists without touching input."""
    _check_rows(rows)
    return [_pack_row(row, index) for index, row in enumerate(rows)]


def unpack_rows(rows):
    """Unpack closed nine value lists into new row dicts."""
    _check_rows(rows)
    return [_unpack_row(row, index) for index, row in enumerate(rows)]


def _check_rows(rows):
    if type(rows) is not list:
        raise ValueError('rows must be a list')
    if len(rows) > MAX_ROWS:
        raise ValueError('rows must not exceed %d entries' % MAX_ROWS)


def _check_keys(value, expected, what):
    if type(value) is not dict:
        raise ValueError('%s must be a dict' % what)
    if frozenset(value.keys()) != expected:
        raise ValueError('%s has missing or unknown keys' % what)


def _check_witness_list(packed, keys, what, label):
    if type(packed) is not list or len(packed) != len(keys):
        raise ValueError('%s %s must be a list of %d values' % (what, label, len(keys)))


def _check_original(value, what):
    if type(value) is not str:
        raise ValueError('%s source23OriginalUtf8 must be a str' % what)
    return value


def _pack_pk(pk, what):
    _check_keys(pk, _PK_KEYS_SET, '%s pk' % what)
    return {'id': pk['id']}


def _unpack_pk(pk, what):
    _check_keys(pk, _PK_KEYS_SET, '%s pk' % what)
    return {'id': pk['id']}


def _as_presence_list(presence, what):
    _check_keys(presence, _RAW_KEYS_SET, '%s rawKeyPresence' % what)
    packed = []
    for key in RAW_KEYS:
        value = presence[key]
        if type(value) is not bool:
            raise ValueError('%s rawKeyPresence[%s] must be a bool' % (what, key))
        packed.append(value)
    return packed


def _as_presence_dict(packed, what):
    _check_witness_list(packed, RAW_KEYS, what, 'rawKeyPresence')
    result = {}
    for key, value in zip(RAW_KEYS, packed):
        if type(value) is not bool:
            raise ValueError('%s rawKeyPresence[%s] must be a bool' % (what, key))
        result[key] = value
    return result


def _valid_native_type(value):
    return value is None or (type(value) is str and value in _RAW_TYPES)


def _as_native_types_list(types, what):
    _check_keys(types, _RAW_TYPE_KEYS_SET, '%s rawProjectionNativeTypes' % what)
    packed = []
    for key in RAW_TYPE_KEYS:
        value = types[key]
        if not _valid_native_type(value):
            raise ValueError(
                '%s rawProjectionNativeTypes[%s] is not a jsonb_typeof value' % (what, key)
            )
        packed.append(value)
    return packed


def _as_native_types_dict(packed, what):
    _check_witness_list(packed, RAW_TYPE_KEYS, what, 'rawProjectionNativeTypes')
    result = {}
    for key, value in zip(RAW_TYPE_KEYS, packed):
        if not _valid_native_type(value):
            raise ValueError(
                '%s rawProjectionNativeTypes[%s] is not a jsonb_typeof value' % (what, key)
            )
        result[key] = value
    return result


def _pack_row(row, index):
    what = 'row %d' % index
    _check_keys(row, _ROW_KEYS_SET, what)
    return [
        row['id'],
        row['scope'],
        _check_original(row['source23OriginalUtf8'], what),
        row['nativeProjectionUtf8Bytes'],
        row['nativeProjectionSha256'],
        _pack_pk(row['pk'], what),
        row['xmin'],
        _as_presence_list(row['rawKeyPresence'], what),
        _as_native_types_list(row['rawProjectionNativeTypes'], what),
    ]


def _unpack_row(row, index):
    what = 'row %d' % index
    _check_witness_list(row, ROW_KEYS, what, 'row')
    return {
        'id': row[0],
        'scope': row[1],
        'source23OriginalUtf8': _check_original(row[2], what),
        'nativeProjectionUtf8Bytes': row[3],
        'nativeProjectionSha256': row[4],
        'pk': _unpack_pk(row[5], what),
        'xmin': row[6],
        'rawKeyPresence': _as_presence_dict(row[7], what),
        'rawProjectionNativeTypes': _as_native_types_dict(row[8], what),
    }
