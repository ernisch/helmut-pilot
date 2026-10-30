"""Use the existing stage supervisor for fixed End500 backup or restore actions.

No action on import. The original Full500 supervisor is unchanged. The caller
connects first_failure only for these actions; all other stages retain their
existing handling. An inner stop is attempted once before the outer fallback.
"""
import sys
sys.dont_write_bytecode = True

import os
import re
import signal
import subprocess
import threading

ACTIONS = ('backup-before', 'backup-dump', 'backup-roles', 'backup-after')
RESTORE_ACTIONS = ('restore-create', 'restore-roles', 'restore-render', 'restore-apply', 'restore-check')


class OwnedBackupError(RuntimeError):
    pass


def require(value):
    if not value:
        raise OwnedBackupError('OWNED_BACKUP_STAGE_FAILED_OR_UNKNOWN')


class OwnedBackupRunner:
    def __init__(self, supervisor, controller, *, base, container, database, scope='end500-backup'):
        require(scope in ('end500-backup', 'end500-restore'))
        require(base == '/tmp/w15-memory-atomic-20261028d'
                and database == 'helmut_w15_memory_atomic_20261028d'
                and re.fullmatch(r'w15-end500-[1-9][0-9]{4,19}-[a-f0-9]{32}', container))
        require(controller.BASE == base and controller.DB == database
                and controller.CONTAINER == container
                and controller.DOCKER == ['docker', '--host=unix:///var/run/docker.sock'])
        self.watch, self.controller = supervisor, controller
        self.base, self.container, self.database = base, container, database
        self.scope = scope
        self.actions = ACTIONS if scope == 'end500-backup' else RESTORE_ACTIONS
        self.failure_reason = ('end500-owned-backup-stage-failed' if scope == 'end500-backup'
                               else 'end500-owned-restore-stage-failed')
        self.stop_reason = ('owned-backup-stop-unconfirmed' if scope == 'end500-backup'
                            else 'owned-restore-stop-unconfirmed')
        self.started, self.stops = set(), {}
        self.lock = threading.Lock()

    def stop_once(self, action):
        require(action in self.actions and action in self.started)
        with self.lock:
            record = self.stops.get(action)
            first = record is None
            if first:
                record = {'event': threading.Event(), 'confirmed': False}
                self.stops[action] = record
        if first:
            try:
                self.controller.docker('exec', '--user', '1000:1000', self.container,
                    self.base + '/node', self.base + '/app/scripts/fixtures/w15-owned-process-stop.js',
                    self.base, action, self.database, 'active', self.scope, timeout=35)
                record['confirmed'] = True
            except BaseException:
                record['confirmed'] = False
            finally:
                record['event'].set()
        else:
            require(record['event'].wait(timeout=40))
        require(record['confirmed'])

    def first_failure(self, error):
        """Called only while an action from this runner's fixed scope is current."""
        w = self.watch
        require(w.stage_name in self.actions)
        with w.failure_lock:
            first = w.failure is None
            w.failure = w.failure or {'type': type(error).__name__,
                                     'reason': self.failure_reason}
            process, action = w.process, w.stage_name
            dispatch = process is not None and process.poll() is None and not w.stop_dispatched
            if dispatch:
                w.stop_dispatched = True
        if dispatch:
            def signal_inner():
                try:
                    self.stop_once(action)
                except BaseException:
                    w.stop_failure = {'type': 'OwnedBackupError',
                                      'reason': self.stop_reason,
                                      'innerStopConfirmed': False}
                    try:
                        self.controller.save('INNER_STOP_UNKNOWN.SAFE.json', w.stop_failure)
                    except BaseException:
                        w.stop_failure['failureReceiptWriteUnknown'] = True
                finally:
                    # Only after the real inner stop attempt, including UNKNOWN.
                    try:
                        process.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        try:
                            os.killpg(process.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
            w.inner_stop_thread = threading.Thread(target=signal_inner, daemon=True)
            w.inner_stop_thread.start()
        if first:
            try:
                w.publish('supervisor-first-failure', status='FAIL')
            except BaseException:
                pass

    def run_owned(self, argv, action, seconds):
        w = self.watch
        require(action in self.actions and action not in self.started
                and type(seconds) is int and 10 < seconds <= 600
                and type(argv) is list and len(argv) == 9
                and argv[:8] == self.controller.DOCKER + ['exec', '--user', '1000:1000',
                                                         self.container, 'sh', '-c']
                and isinstance(argv[-1], str))
        require(w.backup_runner is self and w.thread.is_alive() and not w.finished.is_set()
                and w.failure is None and w.stop_failure is None and w.process is None)
        observer = getattr(w, 'phase_observer', None)
        if observer is not None:
            observer(('connection-' if action.startswith('restore-') else 'connection-export-') + action)
        previous = w.closure_mode
        self.started.add(action)
        w.closure_mode = False  # Existing stage timeout/first-failure checks stay on.
        try:
            w.stage(argv, action, seconds)
            require(type(w.last_stage_exit_code) is int and w.last_stage_exit_code == 0
                    and w.failure is None and w.stop_failure is None and w.process is None)
            return subprocess.CompletedProcess(argv, w.last_stage_exit_code)
        except BaseException as error:
            # A departed Docker client is not evidence that its inner exited.
            with w.failure_lock:
                w.failure = w.failure or {'type': type(error).__name__,
                                         'reason': self.failure_reason}
            try:
                self.stop_once(action)
            except BaseException:
                w.stop_failure = w.stop_failure or {'type': 'OwnedBackupError',
                    'reason': self.stop_reason, 'innerStopConfirmed': False}
            raise OwnedBackupError('OWNED_BACKUP_STAGE_FAILED_OR_UNKNOWN') from None
        finally:
            w.closure_mode = previous
