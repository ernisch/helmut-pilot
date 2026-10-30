"""Same-job receiver/cache/controller connection for a later authorized run.

No CLI, workflow dispatch, download, container or database action on import.
prepare_same_job and restore_only are separate explicit calls. Current tests
use synthetic adapters; this module creates no original-data authorization.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import time

HERE = Path(__file__).absolute().parent
SPEC = importlib.util.spec_from_file_location('w15_same_job_receiver', HERE / 'receive_existing_inputs.py')
E = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(E)
PHASES = {'binding', 'receive', 'input-binding', 'cache', 'prepare', 'restore', 'closure',
          'prepared-check', 'materialization', 'container-start', 'readiness', 'native-restore', 'backup'}
BACKUP_PHASES = {'backup-export', 'backup-freeze', 'backup-collect', 'backup-seal',
                 'backup-transport', 'backup-authenticate', 'backup-recovery', 'backup-postcheck'}
EXPORT_ACTIONS = frozenset(('backup-before', 'backup-dump', 'backup-roles', 'backup-after'))
RESTORE_ACTIONS = frozenset(('restore-create', 'restore-roles', 'restore-render', 'restore-apply', 'restore-check'))
PHASES |= BACKUP_PHASES | {'export-' + action for action in EXPORT_ACTIONS} | RESTORE_ACTIONS


class RestoreConnectionError(RuntimeError):
    def __init__(self, phase):
        self.phase = phase if phase in PHASES else 'binding'
        super().__init__('SAME_JOB_RESTORE_CONNECTION_REJECTED')


def need(value):
    if not value:
        raise ValueError('SAME_JOB_RESTORE_CONNECTION_REJECTED')


def _observe(resources, name):
    observer = getattr(resources, 'phase_observer', None)
    if observer is not None:
        observer('connection-' + name)


def prepare_same_job(forward, context, common_resources, *, source_review_raw=None,
                     source_review_sha256=None, node_source, postgrest_source,
                     source_qualification_raw=None, source_qualification_sha256=None,
                     observed_context=None, private_payload=None, disk_guard=None):
    """Receive once and preserve live private inputs in this SAME process/job.

    A later separately approved job must supply its fresh limited parent,
    source review, image binding and readable pinned binaries before calling.
    No receipt from a past ephemeral runner substitutes for the live inputs.
    """
    phase = 'binding'
    try:
        _observe(common_resources, phase)
        need(isinstance(context, dict) and common_resources is not None)
        if disk_guard is not None:
            disk_guard()
        need(os.environ.get('GITHUB_ACTIONS') == 'true'
             and os.environ.get('GITHUB_REF') == E.V.BRANCH
             and os.environ.get('GITHUB_SHA') == context['exactCommit']
             and os.environ.get('GITHUB_RUN_ID') == context['runId']
             and os.environ.get('GITHUB_RUN_ATTEMPT') == '1' and context['runAttempt'] == 1)
        resources_module = forward._runtime_module('common_resources')
        need(type(common_resources) is resources_module.CommonResources)
        common_resources.check_context(context)
        runtime = forward._runtime_module('runtime_inputs')
        if source_qualification_raw is not None:
            need(source_review_raw is None and source_review_sha256 is None
                 and isinstance(private_payload, dict) and isinstance(observed_context, dict))
            source_review_raw, source_review_sha256 = runtime.observe_source_qualification(
                context, source_qualification_raw, source_qualification_sha256, observed_context, forward.ROOT)
        # All freshness checks precede runRoot creation. Do not weaken the
        # existing context contract merely to accommodate a cache directory.
        runtime.validate_source_review(context, source_review_raw, source_review_sha256, forward.ROOT)
        runtime.C.apply_context(forward, context, repo=forward.ROOT)
        phase = 'receive'
        _observe(common_resources, phase)
        observer = getattr(common_resources, 'phase_observer', None)
        phase_options = {} if observer is None else {'phase_observer': observer}
        if private_payload is None:
            received_root, receipt = E._receive_existing_verified(context['exactCommit'], context['runnerTemp'], **phase_options)
        else:
            received_root, receipt = E._receive_existing_verified(context['exactCommit'], context['runnerTemp'],
                private_payload=private_payload, mode=observed_context['mode'], guard=disk_guard, **phase_options)
        need(receipt['exactCommit'] == context['exactCommit'] and receipt['runId'] == context['runId']
             and receipt['runAttempt'] == 1 and receipt['verifiedFiles'] == 12
             and receipt['verifiedBytes'] == 242570240 and receipt['relocationVerified'] is True)
        common_resources.check_context(context)
        phase = 'input-binding'
        _observe(common_resources, phase)
        if disk_guard is not None:
            disk_guard()
        # Use forward's canonical loader: a separately loaded RuntimeInputs
        # class would fail its intentional exact type check.
        inputs = forward.open_runtime_inputs(str(received_root), context=context,
                    expected_transfer_context=E.SOURCE, expected_sealed_manifest_sha256=E.SEALED_SHA,
                    source_review_raw=source_review_raw, source_review_sha256=source_review_sha256)
        need(inputs is not None)
        forward._checked_runtime_inputs(inputs)
        forward._checked_common_resources(inputs, common_resources)
        phase = 'cache'
        _observe(common_resources, phase)
        cache = forward._runtime_module('runtime_cache').stage_cache(
            forward, inputs, common_resources, node_source=node_source, postgrest_source=postgrest_source)
        phase = 'prepare'
        _observe(common_resources, phase)
        forward.prepare(inputs, common_resources)
        if disk_guard is not None:
            disk_guard()
        connection = RestoreConnection(forward, inputs, common_resources, receipt, cache)
        connection._disk_guard = disk_guard
        return connection
    except (Exception, KeyboardInterrupt):
        raise RestoreConnectionError(phase) from None


class RestoreConnection:
    """Live private binding; never serialize this object or its input paths."""
    def __init__(self, forward, inputs, resources, reception, cache):
        self._forward, self._inputs, self._resources = forward, inputs, resources
        self._reception = json.loads(json.dumps(reception))
        self._cache = json.loads(json.dumps(cache))
        self._used = False
        self._disk_guard = None

    def controller_inputs(self):
        self._forward._checked_runtime_inputs(self._inputs)
        self._forward._checked_common_resources(self._inputs, self._resources)
        return self._inputs

    def safe_summary(self):
        return {'status': 'PASS_SAME_JOB_INPUT_AND_CONTROLLER_PREPARATION_ONLY',
                'verifiedFiles': self._reception['verifiedFiles'], 'verifiedBytes': self._reception['verifiedBytes'],
                'sameJobInputsRetained': True, 'crossJobPlaintextTransfer': False,
                'databaseStarted': False, 'restoreObserved': False, 'fullRestoreAccepted': False,
                'executionAuthority': False, 'readiness': 'SEPARATE_RECEIVE_AND_RESTORE_GO_REQUIRED'}

    def restore_only(self, *, backup_completion=None, export_diagnostic=False):
        need(not self._used)
        self._used = True
        return _restore_prepared(self._forward, self.controller_inputs(), self._resources,
                                 backup_completion=backup_completion, disk_guard=self._disk_guard, export_diagnostic=export_diagnostic)


def _labels(context):
    return {'helmut.w15.scope': 'isolated-restore-only', 'helmut.w15.run': context['runId'],
            'helmut.w15.nonce': context['nonce'], 'helmut.w15.commit': context['exactCommit']}


def _owned(info, context, image, parent, expected_id=None):
    need(isinstance(info, dict) and re.fullmatch('[a-f0-9]{64}', info.get('Id', '')))
    need(info['Config']['Labels'] == _labels(context) and info['Image'] == image
         and info['HostConfig']['CgroupParent'] == parent)
    if expected_id is not None:
        need(info['Id'] == expected_id)


def _inspect(controller, container):
    value = json.loads(controller.docker('inspect', container))
    need(isinstance(value, list) and len(value) == 1)
    return value[0]


def _restore_prepared(forward, inputs, resources, *, backup_completion=None, disk_guard=None, export_diagnostic=False):
    """Restore only; never seed, call fullmain, Auth CAS, provider or backup closure."""
    need(type(export_diagnostic) is bool and (not export_diagnostic or callable(backup_completion)))
    phase, failure, attempted, watch, owned_id, restored = 'prepared-check', None, False, None, None, None
    backup_receipt = None
    context = inputs.controller_context()
    m = forward.M
    try:
        _observe(resources, phase)
        forward._checked_prepared(inputs, resources)
        resources.check_context(context)
        need(not forward.WORK.exists())
        phase = 'container-start'
        _observe(resources, phase)
        need(json.loads(m.docker('image', 'inspect', m.IMAGE))[0]['Id'] == m.IMAGE)
        need(not m.docker('ps', '-a', '--filter', 'name=^/' + forward.CONTAINER + '$', '--format', '{{.ID}}').strip())
        phase = 'materialization'
        _observe(resources, phase)
        forward.WORK.mkdir(mode=0o700)
        for name in ('pgdata', 'state'):
            (forward.WORK / name).mkdir(mode=0o700)
        state = forward.WORK / 'state'
        for name, data in (
                ('CURRENT_SOURCE_REVIEW.SAFE.json', inputs.source_review_bytes()),
                ('CURRENT_RUNTIME_CONTEXT.SAFE.json', (json.dumps(context, sort_keys=True) + '\n').encode())):
            with os.fdopen(E.A._file(forward.WORK, name), 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
        command = inputs.path('currentCommand')
        raw = command.read_bytes()
        m.save('CURRENT_COMMAND_BINDING.SAFE.json', {'path': str(command), 'bytes': len(raw),
               'sha256': hashlib.sha256(raw).hexdigest(), 'executionAuthority': False})
        mounts = forward._runtime_module('runtime_materialization').materialize(
            forward.PREP / 'runtime-files', app=forward.PREP / 'app', node=forward.CACHE / 'node',
            postgrest=forward.CACHE / 'postgrest', roles=inputs.path('localRoles'), dump=inputs.path('frozenSourceDump'),
            state=state, command=command, command_binding=forward.WORK / 'CURRENT_COMMAND_BINDING.SAFE.json',
            bound=inputs.path('bound'), guard=resources.sample)
        seed = forward.check_seed(inputs)
        labels = tuple(item for key, value in _labels(context).items() for item in ('--label', key + '=' + value))
        phase = 'container-start'
        _observe(resources, phase)
        attempted = True
        m.docker('create', '--name', forward.CONTAINER, '--pull=never', '--network=none', '--restart=no',
                 '--memory=' + str(m.LIMIT), '--memory-swap=' + str(m.LIMIT), '--cgroup-parent=' + resources.unit,
                 *labels, '--mount', 'type=bind,src=' + str(forward.WORK / 'pgdata') + ',dst=/var/lib/postgresql/data',
                 '--mount', 'type=bind,src=' + str(seed) + ',dst=' + forward.SEED_MOUNT + ',readonly',
                 '--mount', 'type=bind,src=' + str(state) + ',dst=' + forward.BASE + '/state', *mounts,
                 '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', m.IMAGE, 'postgres', '-c', 'helmut.local_usage_experiment=on',
                 '-c', 'max_wal_size=' + str(forward.BUDGET['postgresMaxWalMiB']) + 'MB',
                 '-c', 'work_mem=' + str(forward.BUDGET['postgresWorkMemMiB']) + 'MB',
                 '-c', 'autovacuum_naptime=' + str(forward.BUDGET['postgresAutovacuumNaptimeSeconds']) + 's')
        info = _inspect(m, forward.CONTAINER)
        _owned(info, context, m.IMAGE, resources.unit)
        owned_id = info['Id']
        m.docker('start', owned_id)
        info = _inspect(m, owned_id)
        _owned(info, context, m.IMAGE, resources.unit, owned_id)
        need(info['HostConfig']['NetworkMode'] == 'none' and info['HostConfig']['Memory'] == m.LIMIT
             and info['HostConfig']['MemorySwap'] == m.LIMIT and info['State']['Running'] is True)
        forward._runtime_module('runtime_materialization').verify_mounts(info['Mounts'], forward.PREP / 'runtime-files')
        seed_mounts = [row for row in info['Mounts'] if row['Destination'] == forward.SEED_MOUNT]
        need(len(seed_mounts) == 1 and seed_mounts[0]['Source'] == str(seed) and seed_mounts[0]['RW'] is False)
        resources.check_pid(info['State']['Pid'], owned_id)
        watch = forward.Watch(resources.path)
        watch.common_resources = resources
        watch.phase_observer = getattr(resources, 'phase_observer', None)
        watch.disk_guard = disk_guard
        watch.backup_runner = forward._runtime_module('runtime_owned_backup').OwnedBackupRunner(
            watch, m, base=forward.BASE, container=forward.CONTAINER, database=forward.DB, scope='end500-restore')
        watch.sample()
        watch.thread.start()
        # Reuse the controller's bounded read-only readiness polling. No
        # restore action is retried. A timed-out client fails into owned
        # container closure rather than being treated as a completed restore.
        phase = 'readiness'
        _observe(resources, phase)
        for _ in range(100):
            watch.sample()
            # The entrypoint's temporary init server accepts Unix sockets only.
            ready = subprocess.run(m.DOCKER + ['exec', owned_id, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '--timeout=1'],
                                   env=m.ENV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            if ready.returncode == 0:
                break
            time.sleep(.2)
        need(ready.returncode == 0)
        phase = 'native-restore'
        _observe(resources, phase)
        m.docker('exec', owned_id, 'mkdir', '-p', forward.BASE)
        m.docker('exec', owned_id, 'chmod', '700', forward.BASE)
        m.docker('exec', owned_id, 'chown', '1000:1000', forward.BASE)
        restored = forward._runtime_module('runtime_restore').restore_owned(m, watch, run_owned=watch.backup_runner.run_owned)
        need(restored['profiles'] == 500 and restored['active'] == 0)
        if backup_completion is not None:
            phase = 'backup'
            _observe(resources, phase)
            backup_receipt = backup_completion(forward=forward, inputs=inputs, resources=resources, watch=watch, restored=restored)
            phase = 'backup-postcheck'
            _observe(resources, phase)
            if export_diagnostic:
                need(type(backup_receipt) is dict and backup_receipt.get('status') == 'PASS_FOUR_RESTORE_EXPORT_ACTIONS_ONLY'
                     and type(backup_receipt.get('exportActions')) is int and backup_receipt['exportActions'] == 4
                     and backup_receipt.get('watchClosed') is False and backup_receipt.get('remoteReadbackObserved') is False
                     and backup_receipt.get('databaseRestoreObserved') is False and backup_receipt.get('acceptedAsCompleteBackup') is False)
            else:
                need(isinstance(backup_receipt, dict) and backup_receipt.get('watchClosed') is True
                     and backup_receipt.get('remoteReadbackObserved') is True
                     and backup_receipt.get('databaseRestoreObserved') is True)
        forward.check_seed(inputs)
        inputs.path('localRoles')
        inputs.path('frozenSourceDump')
        resources.sample()
    except (Exception, KeyboardInterrupt) as error:
        nested = getattr(error, 'phase', None)
        failure = nested if phase == 'backup' and type(nested) is str and nested in BACKUP_PHASES else phase
        action = getattr(error, 'actionName', None)
        if phase == 'backup' and action in EXPORT_ACTIONS:
            failure = 'export-' + action
        if phase == 'native-restore' and action in RESTORE_ACTIONS:
            failure = action
    finally:
        phase = 'closure'
        if attempted:
            try:
                info = _inspect(m, owned_id or forward.CONTAINER)
                _owned(info, context, m.IMAGE, resources.unit, owned_id)
                owned_id = info['Id']
                if info['State']['Running']:
                    m.docker('stop', '--time', '5', owned_id, timeout=12)
                final = _inspect(m, owned_id)
                _owned(final, context, m.IMAGE, resources.unit, owned_id)
                need(final['State']['Running'] is False and final['State']['Pid'] == 0
                     and final['State'].get('OOMKilled') is False and final['State'].get('ExitCode') == 0)
                resources.sample()
            except (Exception, KeyboardInterrupt):
                failure = failure or phase
        if watch is not None:
            operations = () if backup_receipt and backup_receipt.get('watchClosed') else (watch.sample, watch.stop)
            for operation in operations:
                try:
                    operation()
                except (Exception, KeyboardInterrupt):
                    failure = failure or phase
            if watch.failure is not None or watch.stop_failure is not None:
                failure = failure or phase
            if (export_diagnostic or not operations) and (not watch.finished.is_set() or watch.thread.is_alive() or watch.reporter.is_alive()):
                failure = failure or phase
    if failure:
        raise RestoreConnectionError(failure) from None
    # Keep the existing full-End500 backup closure gate intact. Inputs and
    # provenance remain connected for that later qualified controller path.
    try:
        resources.sample()
        backup_inputs = inputs.backup_input_files()
        backup_provenance = inputs.backup_provenance_files()
        need(len(backup_inputs) == 12 and len(backup_provenance) == len(E.IP.PUBLIC_PROVENANCE))
        resources.sample()
    except (Exception, KeyboardInterrupt):
        raise RestoreConnectionError('input-binding') from None
    return {**({'diagnosticExportOnly': True, 'exportActions': 4, 'watchStopped': True} if export_diagnostic else {}),
            'status': 'PASS_RESTORE_EXPORT_DIAGNOSTIC_ONLY' if export_diagnostic else 'PASS_ISOLATED_RESTORE_ONLY_END500_BLOCKED', 'profiles': 500, 'active': 0,
            'restoreSteps': restored['steps'], 'ownedContainerStopped': True,
            'backupInputBindings': len(backup_inputs), 'backupProvenanceBindings': len(backup_provenance),
            'originalInputsModified': False, 'authCalls': 0, 'units': 0, 'providerCalls': 0,
            'fullRestoreAccepted': False, 'acceptedAsCompleteBackup': False,
            'commonLifetimeMemoryAccepted': False, 'end500Acceptance': False, 'mock500Acceptance': False,
            'remoteReadbackObserved': bool(backup_receipt and backup_receipt.get('remoteReadbackObserved')),
            'databaseRestoreObserved': bool(backup_receipt and backup_receipt.get('databaseRestoreObserved')),
            'executionAuthority': False, 'readiness': 'FURTHER_RUNTIME_AND_BACKUP_ACCEPTANCE_REQUIRED'}
