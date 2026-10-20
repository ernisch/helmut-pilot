"""Pure lifecycle qualification: fake children/logs only; no native admission."""
import copy
import signal
import subprocess
import unittest
from unittest.mock import patch

from postgrest_lifecycle import TAIL_BYTES, stop_postgrest


PINS = {'binary': {'path': '/readonly/postgrest-pinned', 'bytes': 17309560, 'sha256': 'a' * 64},
        'config': {'path': '/ram/postgrest.conf', 'bytes': 234, 'sha256': 'b' * 64}}


class FakeChild:
    def __init__(self, events, outcomes=None, initial=None, poll_error=None,
                 signal_error=None, kill_error=None):
        self.events, self.pid = events, 1234
        self.args = [PINS['binary']['path'], PINS['config']['path']]
        self.outcomes = list(outcomes if outcomes is not None else [0])
        self.returncode, self.poll_error = initial, poll_error
        self.signal_error, self.kill_error = signal_error, kill_error

    def poll(self):
        self.events.append('poll')
        if self.poll_error:
            raise self.poll_error
        return self.returncode

    def send_signal(self, number):
        self.events.append(('signal', number))
        if self.signal_error:
            raise self.signal_error

    def wait(self, timeout):
        self.events.append(('wait', timeout))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        self.returncode = outcome
        return outcome

    def kill(self):
        self.events.append('kill')
        if self.kill_error:
            raise self.kill_error


class FakeLog:
    name = '/ram/postgrest.log'

    def __init__(self, events, data=b'normal startup\n', close_error=None, read_error=None):
        self.events, self.data, self.closed = events, data, False
        self.close_error, self.read_error = close_error, read_error

    def close(self):
        self.events.append('log-close')
        if self.close_error:
            raise self.close_error
        self.closed = True

    def read_tail(self, path, limit):
        self.events.append('log-tail')
        if self.read_error:
            raise self.read_error
        assert path == self.name and limit == TAIL_BYTES
        return len(self.data), self.data[-limit:]


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        # Any accidental real process start or OS signal fails the pure suite.
        for target in ('subprocess.Popen', 'os.kill', 'os.killpg'):
            blocker = patch(target, side_effect=AssertionError('real process/signal forbidden'))
            blocker.start()
            self.addCleanup(blocker.stop)
        self.events, self.saved = [], []

    def persist(self, receipt):
        self.events.append('persist')
        self.saved.append(copy.deepcopy(receipt))

    def stop(self, child=None, log=None, **kwargs):
        child = child if child is not None else FakeChild(self.events)
        log = log if log is not None else FakeLog(self.events)
        values = dict(known_pid=1234, pins=copy.deepcopy(PINS), persist=self.persist,
                      read_tail=log.read_tail)
        values.update(kwargs)
        result = stop_postgrest(child, log, **values)
        self.events.append('caller-check')
        return result

    def test_expected_signed_statuses_persist_before_caller_check(self):
        for code in (0, -signal.SIGTERM):
            with self.subTest(code=code):
                pins = copy.deepcopy(PINS)
                result = self.stop(FakeChild(self.events, [code]), pins=pins)
                self.assertTrue(result['pass'])
                self.assertEqual(result['returnCode'], code)
                self.assertEqual(result, self.saved[-1])
                self.assertEqual(pins, PINS)
                self.assertEqual(self.events[-4:], ['log-close', 'log-tail', 'persist', 'caller-check'])
                self.assertIn(('signal', signal.SIGTERM), self.events)

    def test_unqualified_or_invalid_statuses_never_pass(self):
        for code in (1, 143, -signal.SIGINT, -signal.SIGKILL, True, None):
            with self.subTest(code=code):
                result = self.stop(FakeChild(self.events, [code]))
                self.assertFalse(result['pass'])
                self.assertEqual(result['returnCode'], code)
                self.assertEqual(self.saved[-1]['returnCode'], code)

    def test_already_exited_child_is_not_signaled_or_accepted(self):
        for code in (0, -signal.SIGTERM, 1):
            with self.subTest(code=code):
                self.events.clear()
                result = self.stop(FakeChild(self.events, initial=code))
                self.assertFalse(result['pass'])
                self.assertEqual(result['preStopReturnCode'], code)
                self.assertEqual(self.events, ['poll', 'log-close', 'log-tail', 'persist', 'caller-check'])

    def test_pid_pin_and_argv_binding_fail_without_signaling(self):
        variants = [dict(known_pid=999), dict(known_pid=True)]
        for change in ({'sha256': 'z' * 64}, {'path': '/a/../b'}, {'bytes': True}):
            pins = copy.deepcopy(PINS)
            pins['binary'].update(change)
            variants.append(dict(pins=pins))
        for kwargs in variants + [dict(pins={})]:
            with self.subTest(kwargs=kwargs):
                self.events.clear()
                result = self.stop(**kwargs)
                self.assertFalse(result['pass'])
                self.assertNotIn('poll', self.events)
                self.assertEqual(self.events, ['log-close', 'log-tail', 'persist', 'caller-check'])
        child = FakeChild(self.events)
        child.args = ['/other/postgrest', PINS['config']['path']]
        self.assertFalse(self.stop(child)['pass'])

    def test_second_call_never_signals_again_or_passes(self):
        child = FakeChild(self.events)
        self.assertTrue(self.stop(child)['pass'])
        self.assertFalse(self.stop(child)['pass'])
        self.assertEqual(self.events.count(('signal', signal.SIGTERM)), 1)
        self.assertEqual(len(self.saved), 2)
        self.assertEqual(self.saved[-1]['errors'][0]['stage'], 'binding-or-poll')

    def test_timeout_kills_reaps_records_raw_status_and_rejects(self):
        child = FakeChild(self.events, [subprocess.TimeoutExpired('postgrest', 10), -signal.SIGKILL])
        result = self.stop(child)
        self.assertFalse(result['pass'])
        self.assertTrue(result['timedOut'] and result['killRequested'] and result['killSent'] and result['reaped'])
        self.assertEqual(result['returnCode'], -signal.SIGKILL)
        self.assertIn('kill', self.events)
        self.assertEqual(self.events.count(('wait', 10)), 2)

    def test_wait_kill_and_kill_wait_exceptions_remain_visible(self):
        for kill_error, second in ((None, 0), (OSError(), 0), (None, OSError())):
            with self.subTest(kill_error=kill_error, second=second):
                child = FakeChild(self.events, [OSError(), second], kill_error=kill_error)
                result = self.stop(child)
                self.assertFalse(result['pass'])
                stages = {entry['stage'] for entry in self.saved[-1]['errors']}
                self.assertIn('wait', stages)
                if kill_error:
                    self.assertIn('kill', stages)
                if isinstance(second, Exception):
                    self.assertIn('kill-wait', stages)
                    self.assertFalse(result['reaped'])

    def test_log_close_read_or_unproved_close_prevents_acceptance(self):
        logs = [FakeLog(self.events, close_error=OSError()), FakeLog(self.events, read_error=OSError())]
        unproved = FakeLog(self.events)
        unproved.close = lambda: None
        for log in logs + [unproved]:
            with self.subTest(log=log):
                result = self.stop(log=log)
                self.assertFalse(result['pass'])
                self.assertTrue(result['errors'])
                self.assertEqual(self.saved[-1], result)

    def test_log_tail_is_bounded_truncated_and_utf8_safe(self):
        for data in (b'', b'normal startup\n', b'x' * (TAIL_BYTES + 5), b'\xff' * TAIL_BYTES):
            with self.subTest(bytes=len(data)):
                result = self.stop(log=FakeLog(self.events, data=data))
                self.assertTrue(result['pass'])
                self.assertEqual(result['log']['retainedTailBytes'], min(len(data), TAIL_BYTES))
                self.assertEqual(result['log']['truncated'], len(data) > TAIL_BYTES)
        self.assertFalse(self.stop(read_tail=lambda path, limit: (limit + 1, b'x' * (limit + 1)))['pass'])

    def test_persist_exception_never_returns_success(self):
        def failed_persist(receipt):
            self.persist(receipt)
            raise OSError('even a partial receipt must not authorize acceptance')
        result = self.stop(persist=failed_persist)
        self.assertFalse(result['pass'])
        self.assertEqual(result['persistError'], 'OSError')
        self.assertEqual(self.events[-2:], ['persist', 'caller-check'])

    def test_poll_and_signal_exceptions_retain_evidence(self):
        for child in (FakeChild(self.events, poll_error=OSError()),
                      FakeChild(self.events, signal_error=ProcessLookupError())):
            with self.subTest(child=child):
                result = self.stop(child)
                self.assertFalse(result['pass'])
                self.assertTrue(result['errors'])
                self.assertTrue(result['parentLogClosed'])
                self.assertEqual(self.saved[-1], result)

    def test_unbounded_or_invalid_deadline_is_rejected_before_signal(self):
        for kwargs in (dict(timeout=0), dict(timeout=31), dict(timeout=float('inf')),
                       dict(timeout=True), dict(kill_timeout=11), dict(kill_timeout=-1)):
            with self.subTest(kwargs=kwargs):
                self.events.clear()
                result = self.stop(**kwargs)
                self.assertFalse(result['pass'])
                self.assertNotIn('poll', self.events)


if __name__ == '__main__':
    unittest.main(verbosity=2)
