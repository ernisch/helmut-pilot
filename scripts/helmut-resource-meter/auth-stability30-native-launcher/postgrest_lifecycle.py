"""For NEW owned diagnostics only; this module never starts a process.

The caller verifies file contents before launch and supplies the same Popen,
known PID, binary/config pin metadata and parent log handle. The persister must
commit its receipt or raise; callers must check the RETURNED receipt's pass.
Unexpected statuses remain failures, including 143 and 1. The additional -2
classification is bound to the exact original12.2.3 binary/config/version and
locally pinned upstream evidence; it never changes the raw signed status. No historical status
is inferred. A failed persister always returns failure, even after a partial write.
"""
import re
import signal
import subprocess
import time
from pathlib import PurePosixPath

TAIL_BYTES = 16 * 1024


ORIGINAL_SIGINT_POLICY = {'schema': 'helmut-original-postgrest-12.2.3-sigterm-policy/1', 'postgrestVersion': '12.2.3', 'originalBinarySHA256': '870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617', 'originalBinaryBytes': 17309560, 'configSHA256': '47a9c99a305e9975a479bc1da8f30cdd6664dddf8fb279df1c15bc5b17c63f60', 'configBytes': 236, 'upstreamEvidenceSHA256': '218646bd1d3e415348dedefd8b7920bd7e09bf293c94f407bf83ddbef7fd9884', 'requestedSignal': 'SIGTERM', 'additionalSignedExitCode': -2}
ORIGINAL_BINARY_PATH = '/workspace/helmut-parallel-20261015/wave20-resource-integration/source-capture/postgrest-pinned'

def _qualified_original_sigint(receipt, pins, policy):
    return bool(policy == ORIGINAL_SIGINT_POLICY and _valid_pins(pins)
        and pins['binary']['path'] == ORIGINAL_BINARY_PATH
        and pins['binary']['bytes'] == policy['originalBinaryBytes']
        and pins['binary']['sha256'] == policy['originalBinarySHA256']
        and pins['config']['path'] == '/ram/postgrest.conf'
        and pins['config']['bytes'] == policy['configBytes']
        and pins['config']['sha256'] == policy['configSHA256']
        and receipt['signalRequested'] == 'SIGTERM' and receipt['signalSent']
        and type(receipt['logEOFProof']) is dict
        and receipt['logEOFProof'].get('versionSeen') is True)


def _valid_pins(pins):
    if not isinstance(pins, dict) or set(pins) != {'binary', 'config'}:
        return False
    for pin in pins.values():
        if not isinstance(pin, dict) or set(pin) != {'path', 'bytes', 'sha256'}:
            return False
        path = pin['path']
        if (not isinstance(path, str) or not path.startswith('/') or path.startswith('//')
                or str(PurePosixPath(path)) != path or '..' in PurePosixPath(path).parts
                or type(pin['bytes']) is not int or pin['bytes'] < 1
                or not isinstance(pin['sha256'], str) or not re.fullmatch('[a-f0-9]{64}', pin['sha256'])):
            return False
    return True


def _read_tail(path, limit):
    with open(path, 'rb') as stream:
        total = stream.seek(0, 2)
        stream.seek(max(0, total - limit))
        return total, stream.read(limit)


def stop_postgrest(child, parent_log, *, known_pid, pins, persist,
                   timeout=10, kill_timeout=10, read_tail=_read_tail, prove_log_eof=None, shutdown_policy=None):
    """Stop only the bound child; collect/persist before the caller can accept it.

Cleanup escalation is evidence of failure, never a successful shutdown. Pins are
validated as metadata only; no executable or source file is read or executed.
The private child marker prevents a second call from signaling it again.
"""
    started = time.monotonic()
    receipt = {'schema': 'helmut-owned-postgrest-stop/3', 'pass': False,
        'shutdownPolicy': dict(shutdown_policy) if type(shutdown_policy) is dict else None,
        'acceptedExpectedTranslation': False, 'returnCodeClassification': 'UNQUALIFIED',
        'knownPID': known_pid, 'observedPID': None, 'pins': None,
        'pinContentsVerified': False, 'preStopReturnCode': None, 'returnCode': None,
        'signalRequested': None, 'signalSent': False, 'signalAtUnixSeconds': None,
        'waitTimeoutSeconds': timeout, 'killWaitTimeoutSeconds': kill_timeout,
        'timedOut': False, 'killRequested': False, 'killSent': False, 'reaped': False,
        'parentLogClosed': False, 'logEOFProof': None, 'log': None, 'errors': [], 'persistError': None}

    def error(stage, exception):
        receipt['errors'].append({'stage': stage, 'type': type(exception).__name__})

    try:
        receipt['observedPID'] = child.pid
        if (type(known_pid) is not int or known_pid < 1 or child.pid != known_pid
                or type(child.pid) is not int or not _valid_pins(pins)):
            raise ValueError('known PID or binary/config pin metadata differs')
        receipt['pins'] = {name: dict(pin) for name, pin in pins.items()}
        if child.args != [pins['binary']['path'], pins['config']['path']]:
            raise ValueError('bound direct argv differs from pin metadata')
        if (type(timeout) not in (int, float) or not 0 < timeout <= 30
                or type(kill_timeout) not in (int, float) or not 0 < kill_timeout <= 10):
            raise ValueError('bounded shutdown deadlines required')
        if getattr(child, '_helmut_postgrest_stop_attempted', False):
            raise ValueError('shutdown already attempted for this child')
        child._helmut_postgrest_stop_attempted = True
        receipt['preStopReturnCode'] = child.poll()
        if receipt['preStopReturnCode'] is None:
            receipt['signalRequested'] = 'SIGTERM'
            receipt['signalAtUnixSeconds'] = time.time()
            try:
                child.send_signal(signal.SIGTERM)
                receipt['signalSent'] = True
            except Exception as exception:
                error('sigterm', exception)
            try:
                receipt['returnCode'] = child.wait(timeout=timeout)
                receipt['reaped'] = True
            except Exception as exception:
                receipt['timedOut'] = isinstance(exception, subprocess.TimeoutExpired)
                error('wait', exception)
                receipt['killRequested'] = True
                try:
                    child.kill()
                    receipt['killSent'] = True
                except Exception as exception:
                    error('kill', exception)
                try:
                    receipt['returnCode'] = child.wait(timeout=kill_timeout)
                    receipt['reaped'] = True
                except Exception as exception:
                    error('kill-wait', exception)
        else:
            receipt['returnCode'] = receipt['preStopReturnCode']
            receipt['reaped'] = True
    except Exception as exception:
        error('binding-or-poll', exception)
    try:
        if not callable(prove_log_eof):
            raise ValueError('explicit pipe EOF/drain proof callback required')
        proof=prove_log_eof()
        receipt['logEOFProof']=proof
        if (not isinstance(proof,dict) or proof.get('eofObserved') is not True
                or proof.get('drainEnded') is not True or proof.get('overflow') is not False
                or proof.get('errors') != []):
            raise ValueError('complete bounded PostgREST pipe log EOF unproved')
    except Exception as exception:
        error('log-eof',exception)
    try:
        parent_log.close()
        receipt['parentLogClosed'] = parent_log.closed is True
        if not receipt['parentLogClosed']:
            raise OSError('parent log close unproved')
    except Exception as exception:
        error('log-close', exception)
    try:
        total, tail = read_tail(parent_log.name, TAIL_BYTES)
        if (type(total) is not int or total < 0 or not isinstance(tail, bytes)
                or len(tail) != min(total, TAIL_BYTES)):
            raise ValueError('bounded complete log tail required')
        receipt['log'] = {'totalBytes': total, 'retainedTailBytes': len(tail),
            'tail': tail.decode('utf8', errors='replace'), 'truncated': total > len(tail)}
    except Exception as exception:
        error('log-tail', exception)
    receipt['elapsedSeconds'] = time.monotonic() - started
    closure_ok = bool(receipt['preStopReturnCode'] is None and receipt['signalSent']
        and receipt['reaped'] and not receipt['timedOut'] and not receipt['killRequested']
        and receipt['parentLogClosed'] and not receipt['errors'])
    receipt['acceptedExpectedTranslation'] = bool(closure_ok and type(receipt['returnCode']) is int
        and receipt['returnCode'] == -signal.SIGINT
        and _qualified_original_sigint(receipt,pins,shutdown_policy))
    accepted_status = bool(type(receipt['returnCode']) is int and
        (receipt['returnCode'] in (0,-signal.SIGTERM) or receipt['acceptedExpectedTranslation']))
    if accepted_status:
        receipt['returnCodeClassification'] = ('expected-original-12.2.3-sigterm-userinterrupt-sigint'
            if receipt['acceptedExpectedTranslation'] else 'standard-signed-status')
    receipt['pass'] = bool(closure_ok and accepted_status)
    try:
        persist(receipt)
    except Exception as exception:
        receipt['pass'] = False
        receipt['acceptedExpectedTranslation'] = False
        receipt['persistError'] = type(exception).__name__
    return receipt
