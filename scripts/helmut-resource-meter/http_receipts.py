"""Require an exit receipt for every started passive HTTP meter/thread."""
import json,re

START_KEYS=set(['schema','pid','threadId'])
EXIT_KEYS=set('''schema pid threadId requests finished aborted requestBodyBytes responseBodyBytes
serverConnectionsOpened serverConnectionsClosed clientConnectionsOpened clientConnectionsClosed
clientTCPBytesRead clientTCPBytesWritten serverTCPBytesRead serverTCPBytesWritten protocolErrors
responseTCPDeliveredBytes responseHeaderBytes responseFramingBytes responseBodyReceivedBytes responses
parseErrors unparsedResponseBytes incompleteResponses connectionResetErrors routes noPayloadOrCredentialRetention
openClientSockets openServerSockets unfinishedActiveHTTPParsers applicationCPU notKernelWholeGroupExitMeasurement
responseBodyBytesAreHandlerAttempts receivedResponseBodyBytesUsePassiveHTTPFraming'''.split())
FLAGS={'noPayloadOrCredentialRetention','notKernelWholeGroupExitMeasurement','responseBodyBytesAreHandlerAttempts','receivedResponseBodyBytesUsePassiveHTTPFraming'}
EXIT_KEYS_V2=EXIT_KEYS|{'idleConnectionResetErrors','incompleteConnectionResetErrors'}

class HTTPReceiptValidationError(RuntimeError):
    """Validated original counters remain evidence even when not accepted."""
    def __init__(self,message,rows,start_count):
        super().__init__(message)
        self.rows=rows
        self.start_count=start_count

def validate(directory,required=False,strict=False):
    rows=[];starts=[]
    for p in directory.glob('HTTP_*.SAFE.json'):
        m=re.fullmatch(r'HTTP_([0-9]+)_([0-9]+)(\.STARTED)?\.SAFE\.json',p.name)
        if not m:raise RuntimeError('HTTP receipt filename invalid')
        row=json.loads(p.read_text())
        if row.get('pid')!=int(m[1]) or row.get('threadId')!=int(m[2]):raise RuntimeError('HTTP receipt identity mismatch')
        expected=({'helmut-local-http-meter-start/1':START_KEYS} if m[3] else
                  {'helmut-local-http-meter/1':EXIT_KEYS,'helmut-local-http-meter/2':EXIT_KEYS_V2})
        if row.get('schema')not in expected:raise RuntimeError('HTTP receipt schema invalid')
        if set(row)!=expected[row['schema']]:raise RuntimeError('HTTP receipt unknown or missing fields')
        for k in set(row)-({'schema','routes','applicationCPU'}|FLAGS):
            if type(row[k]) is not int or row[k]<0:raise RuntimeError('HTTP counter invalid')
        if not m[3] and (any(row[k] is not True for k in FLAGS) or not isinstance(row['routes'],dict) or not isinstance(row['applicationCPU'],dict)):
            raise RuntimeError('HTTP receipt metadata invalid')
        (starts if m[3] else rows).append(row)
    key=lambda r:(r['pid'],r['threadId'])
    if (required and not rows) or len({key(r) for r in rows})!=len(rows) or len({key(r) for r in starts})!=len(starts) or {key(r) for r in rows}!={key(r) for r in starts}:
        raise HTTPReceiptValidationError('HTTP exit receipt missing or duplicated',rows,len(starts))
    for r in rows:
        reset_key='connectionResetErrors'
        if r['schema']=='helmut-local-http-meter/2':
            if r['idleConnectionResetErrors']+r['incompleteConnectionResetErrors']!=r['connectionResetErrors']:
                raise HTTPReceiptValidationError('HTTP reset classification inconsistent',rows,len(starts))
            reset_key='incompleteConnectionResetErrors'
        # Legacy receipts have no event-time proof of reset state. Their raw
        # reset errors remain strictly rejected, never inferred as idle later.
        for k in ['parseErrors','unparsedResponseBytes','unfinishedActiveHTTPParsers','incompleteResponses',reset_key]:
            if type(r[k]) is not int or r[k]<0:raise RuntimeError('HTTP counter invalid')
            if strict and r[k]:raise HTTPReceiptValidationError('HTTP incomplete or unknown measurement',rows,len(starts))
    return rows,len(starts)
