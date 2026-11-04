"""Prepare-only variant of the existing diagnostic job; no execution on import."""
import sys
sys.dont_write_bytecode = True
import importlib.util
from pathlib import Path
import re

MODE = 'mock500-materials-diagnostic-gated'
CONTRACT = 'helmut-w15-mock500-prepare-diagnostic/1'
SCOPE = 'ISOLATED_GITHUB_MOCK500_PREPARE_DIAGNOSTIC_ONLY'
CONFIRMATION = 'GO_ONE_ISOLATED_PREPARE_DIAGNOSTIC_NO_ACTIVATION_UNITS_MODELS'
DIAGNOSTIC_OF = '41818696152'
WORKER_STATUS = 'PASS_PREPARE_DIAGNOSTIC_CLOSED_ONLY_NOT_MOCK500'
OUTER_STATUS = 'PASS_FRESH_PREPARE_DIAGNOSTIC_OWNED_LIFETIME_ONLY'
PROCESSING_SECONDS, WALL_SECONDS = 900, 1080


def load(name):
    spec = importlib.util.spec_from_file_location('prepare_contract_' + name,
        Path(__file__).with_name(name + '.py'))
    value = importlib.util.module_from_spec(spec); spec.loader.exec_module(value)
    return value


def selected(approval):
    return type(approval) is dict and approval.get('resourceContract') == CONTRACT


def need(value):
    if not value: raise ValueError('PREPARE_DIAGNOSTIC_REJECTED')


def validate_authorization(value, context, *, binding_sha=None, source_sha=None, approval_sha=None):
    keys={'schema','contract','scope','runId','runAttempt','nonce','exactCommit',
        'sourceQualificationSHA256','approvalSHA256','inputBindingSHA256','diagnosticOfRunId'}
    need(type(value)is dict and set(value)==keys
        and value['schema']=='helmut-w15-mock500-prepare-diagnostic-authorization/1'
        and value['contract']==CONTRACT and value['scope']==SCOPE and value['diagnosticOfRunId']==DIAGNOSTIC_OF
        and all(value[k]==context[k]for k in ('runId','runAttempt','nonce','exactCommit'))
        and type(value['runAttempt'])is int and value['runAttempt']==1
        and all(type(value[k])is str and re.fullmatch('[a-f0-9]{64}',value[k])for k in
            ('sourceQualificationSHA256','approvalSHA256','inputBindingSHA256')))
    for field, expected in [('inputBindingSHA256',binding_sha),('sourceQualificationSHA256',source_sha),('approvalSHA256',approval_sha)]:
        if expected is not None:need(value[field]==expected)
    return dict(value)


def validate_checks(value, context):
    keys = {'schema','status','contract','exactCommit','runId','runAttempt','nonce',
        'validatedProfiles','profileActivations','unitEntries','providerCalls',
        'authorityInstalled','fullCValidated','preactivationBindingsVerified'}
    need(type(value) is dict and set(value) == keys
        and value['schema'] == 'helmut-w15-mock500-prepare-checks/1'
        and value['status'] == 'PASS_PREPARE_CHECKS_BEFORE_ADMISSION_INSTALL'
        and value['contract'] == CONTRACT
        and all(value[k] == context[k] for k in ('exactCommit','runId','runAttempt','nonce'))
        and type(value['runAttempt']) is int and value['runAttempt'] == 1
        and all(type(value[k]) is int and value[k] == v for k,v in
            {'validatedProfiles':500,'profileActivations':0,'unitEntries':0,'providerCalls':0}.items())
        and value['authorityInstalled'] is False and value['fullCValidated'] is True
        and value['preactivationBindingsVerified'] is True)
    return value


def validate_result(value, manifest):
    keys = {'status','mode','contract','exactCommit','runId','runAttempt','nonce',
        'materialsCompleted','prepareCompleted','firstFailurePhase','prepareFailure',
        'materialsFailure','profiles','activeProfiles','profileFieldsUnchanged','nativeZeroState',
        'units','providerPhases','authorityInstalled','ownedContainerStopped','watchClosed',
        'evidence','executionAuthority','mock500Acceptance','end500Acceptance',
        'productionAcceptance','backupRoundtripVerified','retryAllowed'}
    need(type(value) is dict and set(value) == keys and manifest['mode'] == value['mode'] == MODE
        and selected(manifest.get('approval')) and manifest['approval'].get('scope') == SCOPE
        and value['status'] == WORKER_STATUS and value['contract'] == CONTRACT
        and all(value[k] == manifest[k] for k in ('exactCommit','runId','runAttempt','nonce'))
        and type(value['runAttempt']) is int and value['runAttempt'] == 1
        and type(value['materialsCompleted']) is bool and type(value['prepareCompleted']) is bool
        and all(type(value[k]) is int and value[k] == v for k,v in
            {'profiles':500,'activeProfiles':0,'units':0,'providerPhases':0}.items())
        and all(value[k] is True for k in ('profileFieldsUnchanged','ownedContainerStopped','watchClosed'))
        and value['nativeZeroState'] in ('BOUND_PREPARED_ZERO','NO_OWNED_NATIVE_SLOT','NO_NEW_NATIVE_SLOT_OBSERVED')
        and all(value[k] is False for k in ('authorityInstalled','executionAuthority','mock500Acceptance',
            'end500Acceptance','productionAcceptance','backupRoundtripVerified','retryAllowed')))
    d = load('runner_diagnostics')
    if value['prepareCompleted']:
        need(value['materialsCompleted'] and value['firstFailurePhase'] is None
            and value['prepareFailure'] is None and value['materialsFailure'] is None
            and value['nativeZeroState'] == 'BOUND_PREPARED_ZERO')
    else:
        need(type(value['firstFailurePhase']) is str and value['firstFailurePhase'] in d.MOCK_CONTROLLER_PHASES)
        if value['prepareFailure'] is not None:
            need(value['firstFailurePhase'] == 'mock500-controller-prepare'
                and d.prepare_failure(value['prepareFailure']) is not None)
        if value['materialsFailure'] is not None:
            need(value['firstFailurePhase'].startswith('mock500-controller-materials')
                and d.materials_failure(value['materialsFailure']) is not None)
    load('mock500_materials_contract').validate_evidence(value['evidence'])
    return value
