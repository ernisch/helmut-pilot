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

def validate(directory,required=False,strict=False):
    rows=[];starts=[]
    for p in directory.glob('HTTP_*.SAFE.json'):
        m=re.fullmatch(r'HTTP_([0-9]+)_([0-9]+)(\.STARTED)?\.SAFE\.json',p.name)
        if not m:raise RuntimeError('HTTP receipt filename invalid')
        row=json.loads(p.read_text())
        if row.get('pid')!=int(m[1]) or row.get('threadId')!=int(m[2]):raise RuntimeError('HTTP receipt identity mismatch')
        expected='helmut-local-http-meter-start/1' if m[3] else 'helmut-local-http-meter/1'
        if row.get('schema')!=expected:raise RuntimeError('HTTP receipt schema invalid')
        if set(row)!=(START_KEYS if m[3] else EXIT_KEYS):raise RuntimeError('HTTP receipt unknown or missing fields')
        for k in set(row)-({'schema','routes','applicationCPU'}|FLAGS):
            if type(row[k]) is not int or row[k]<0:raise RuntimeError('HTTP counter invalid')
        if not m[3] and (any(row[k] is not True for k in FLAGS) or not isinstance(row['routes'],dict) or not isinstance(row['applicationCPU'],dict)):
            raise RuntimeError('HTTP receipt metadata invalid')
        (starts if m[3] else rows).append(row)
    key=lambda r:(r['pid'],r['threadId'])
    if (required and not rows) or {key(r) for r in rows}!={key(r) for r in starts}:
        raise RuntimeError('HTTP exit receipt missing')
    for r in rows:
        for k in ['parseErrors','unparsedResponseBytes','unfinishedActiveHTTPParsers','incompleteResponses','connectionResetErrors']:
            if type(r[k]) is not int or r[k]<0:raise RuntimeError('HTTP counter invalid')
            if strict and r[k]:raise RuntimeError('HTTP incomplete or unknown measurement')
    return rows,len(starts)
