"""Read-only LOCAL MOCK calendar admission shared by all resource entrypoints.

This changes neither clocks nor accounting days. A separate source-view proof
is mandatory; a source-day proof never proves freshness at an execution end.
"""
import datetime, hashlib, json, re
from zoneinfo import ZoneInfo

STATUS = 'ROOT_AND_INDEPENDENT_ACCEPTED_LOCAL_MOCK_FIXTURE_CALENDAR'
VERSION = 'helmut-local-mock-utc-fixture-calendar/1'
UTC = datetime.timezone.utc

def need(ok, reason):
    if not ok: raise RuntimeError('local fixture calendar: ' + reason)

def instant(s):
    need(isinstance(s, str), 'timestamp missing')
    value = datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
    need(value.tzinfo == UTC and value.isoformat(timespec='milliseconds').replace('+00:00', 'Z') == s, 'noncanonical timestamp')
    return value

def validate_policy(p):
    need(isinstance(p, dict) and set(p) == {'version','operationId','sourceDay','sourceViewAtUTC',
        'sourceInputsHash','executionDayUTC','startsAtUTC','endsAtUTC'}, 'exact policy fields required')
    need(p['version'] == VERSION and re.fullmatch(r'synthetik500-resources\d{2}-[a-f0-9]{12}', p['operationId']) is not None,
        'unknown mode or operation')
    source, start, end = map(instant, [p['sourceViewAtUTC'], p['startsAtUTC'], p['endsAtUTC']])
    need(p['sourceDay'] == p['executionDayUTC'] == source.date().isoformat() == source.astimezone(ZoneInfo('Europe/Berlin')).date().isoformat()
        == start.date().isoformat() == end.date().isoformat(), 'UTC/source day mismatch')
    need(0 < (end-start).total_seconds() <= 32400 and re.fullmatch('[a-f0-9]{64}', p['sourceInputsHash']) is not None,
        'window or input binding invalid')
    return p

def admit(day, read, *, descriptor=None, operation=None, rows_pin=None):
    if day.get('status') != STATUS:
        need('localCalendar' not in day and (descriptor is None or 'localCalendar' not in descriptor), 'mode/day proof mismatch')
        return None
    p = validate_policy(day.get('localCalendar'))
    need(day['day'] == p['executionDayUTC'] and day['startsAtUTC'] == p['startsAtUTC'] and day['endsAtUTC'] == p['endsAtUTC'], 'execution binding drift')
    need(operation is None or p['operationId'] == operation, 'operation drift')
    if descriptor is not None:
        need(descriptor.get('localCalendar') == p and descriptor.get('production') is False
            and descriptor.get('fullContractUnchanged') is False
            and descriptor.get('timingMemoryAndLiveSecurityContractUnchanged') is True, 'descriptor differs')
    if rows_pin is not None: need(day['adoptedRowsPin'] == rows_pin, 'input pin drift')
    source = read(day['sourceDayAcceptance'])
    need(source.get('status') == 'ROOT_AND_INDEPENDENT_ACCEPTED_EXACT_CURRENT_DAY_TRANSFER'
        and source['day'] == p['sourceDay'] and source['adoptedRowsPin'] == day['adoptedRowsPin']
        and source.get('positiveOriginalA') == 500 and source.get('positiveOriginalF') == 500
        and source.get('positiveOriginalLAtBothWindowEnds') == 500, 'original source acceptance missing')
    need(instant(source['startsAtUTC']) <= instant(p['sourceViewAtUTC']) <= instant(source['endsAtUTC']), 'source view outside accepted source window')
    need(day.get('positiveOriginalA') == 500 and day.get('positiveOriginalF') == 500
        and day.get('positiveOriginalLAtSourceView') == 500 and day.get('profiles') == 500
        and day.get('allPositionsReviewed') is True and day.get('currentTemporalJudgmentAccepted') is True
        and day.get('rootAdoptsExactIndependentScope') is True and day.get('realExecutionClockPreserved') is True
        and day.get('freshSecurityChecksPreserved') is True, 'exact local scope not adopted')
    need('positiveOriginalLAtBothWindowEnds' not in day, 'source proof mislabeled as execution-end proof')
    review = read(day['independentReview'])
    need(review.get('model') == 'deepseek-v4-pro' and review.get('route', {}).get('effort') == 'high'
        and review.get('payload', {}).get('summary', {}).get('status') == 'ok', 'independent local-mode acceptance missing')
    rows = read(day['adoptedRowsPin'])
    need(len(rows) == 500, '500 inputs required')
    hashes = [r['briefingEingabe']['eingabe']['eingabeHash'] for r in rows]
    need(hashlib.sha256(json.dumps(hashes, separators=(',', ':')).encode()).hexdigest() == p['sourceInputsHash'], 'actual input hash set drift')
    return p

def current_window(day, *, now=None):
    now = now or datetime.datetime.now(UTC)
    start, end = map(instant, [day['startsAtUTC'], day['endsAtUTC']])
    local = day.get('status') == STATUS
    if local:
        p = validate_policy(day['localCalendar'])
        need(day['day'] == p['executionDayUTC'] and day['startsAtUTC'] == p['startsAtUTC'] and day['endsAtUTC'] == p['endsAtUTC'], 'execution window drift')
        need(now.date().isoformat() == day['day'] == end.date().isoformat(), 'real UTC accounting day expired')
    else:
        need(now.date().isoformat() == day['day'] == end.date().isoformat()
            and now.astimezone(ZoneInfo('Europe/Berlin')).date().isoformat() == day['day']
            == end.astimezone(ZoneInfo('Europe/Berlin')).date().isoformat(), 'real UTC/Berlin day mismatch')
    return now >= start, start, end
