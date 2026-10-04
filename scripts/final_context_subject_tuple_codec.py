"""Pure shape codec for finite final-context subject references.

No I/O, serialization, numeric coercion or business acceptance. Native numeric
tokens and opaque nested values stay untouched. The caller must independently
enforce the transport byte cap, provenance, types, hashes and completeness.
"""

VERSION = 'helmut-finite-final-context-native-component/1'
ENCODING = 'FINAL_CONTEXT_SUBJECT_TUPLES/1'
MAX_SUBJECTS = 1919
ARRAYS = (('exacts', ('subject', 'id'), 1407),
          ('reservations', ('subject', 'xmin', 'row'), 1919),
          ('memos', ('subject', 'xmin', 'row'), 1919))
FRAME_KEYS = frozenset(('version', 'counts', 'sourceParity', 'knowledgeObjects',
                       'prefixes', 'exacts', 'links', 'linkedSources',
                       'reservations', 'memos', 'logicalMissing', 'actualWAccepted'))


def _keys(value, expected):
    if type(value) is not dict or frozenset(value) != expected:
        raise ValueError('missing or unknown keys')


def _rows(value, maximum):
    if type(value) is not list or len(value) > maximum:
        raise ValueError('invalid array or row bound')


def _header(frame, encoded):
    extra = frozenset(('encoding', 'subjectDictionary')) if encoded else frozenset()
    _keys(frame, FRAME_KEYS | extra)
    if type(frame['version']) is not str or frame['version'] != VERSION:
        raise ValueError('wrong frame version')
    if frame['actualWAccepted'] is not False:
        raise ValueError('codec grants no W acceptance')
    if type(frame['counts']) is not dict:
        raise ValueError('counts must remain an object')
    for key in ('sourceParity', 'knowledgeObjects', 'prefixes', 'links',
                'linkedSources', 'logicalMissing'):
        if type(frame[key]) is not list:
            raise ValueError('invalid common array')
    if encoded and (type(frame['encoding']) is not str or frame['encoding'] != ENCODING):
        raise ValueError('wrong encoding')


def pack_frame(frame):
    """Return a new closed frame, retaining record order and opaque values."""
    _header(frame, False)
    result = dict(frame)
    dictionary, positions = [], {}
    for name, keys, maximum in ARRAYS:
        _rows(frame[name], maximum)
        packed = []
        for row in frame[name]:
            _keys(row, frozenset(keys))
            subject = row['subject']
            if type(subject) is not str or not subject:
                raise ValueError('invalid subject')
            if subject not in positions:
                if len(dictionary) >= MAX_SUBJECTS:
                    raise ValueError('subject dictionary bound')
                positions[subject] = len(dictionary)
                dictionary.append(subject)
            packed.append([positions[subject]] + [row[key] for key in keys[1:]])
        result[name] = packed
    result['encoding'] = ENCODING
    result['subjectDictionary'] = dictionary
    return result


def unpack_frame(frame, index_reader=None):
    """Expand exact references; an explicit reader may validate native index tokens.

    Its return must be a strict integer in range. No string/float conversion is
    performed here. All non-index numeric and string values retain their identity.
    """
    _header(frame, True)
    if index_reader is not None and not callable(index_reader):
        raise ValueError('index reader must be callable')
    dictionary = frame['subjectDictionary']
    _rows(dictionary, MAX_SUBJECTS)
    if any(type(s) is not str or not s for s in dictionary):
        raise ValueError('invalid dictionary subject')
    if len(set(dictionary)) != len(dictionary):
        raise ValueError('duplicate dictionary subject')
    result = {key: frame[key] for key in FRAME_KEYS}
    used = set()
    for name, keys, maximum in ARRAYS:
        _rows(frame[name], maximum)
        rows = []
        for row in frame[name]:
            if type(row) is not list or len(row) != len(keys):
                raise ValueError('invalid closed tuple')
            index = index_reader(row[0]) if index_reader is not None else row[0]
            if type(index) is not int or not 0 <= index < len(dictionary):
                raise ValueError('invalid subject reference')
            used.add(index)
            expanded = {'subject': dictionary[index]}
            expanded.update(zip(keys[1:], row[1:]))
            rows.append(expanded)
        result[name] = rows
    if len(used) != len(dictionary):
        raise ValueError('unused dictionary subject')
    return result
