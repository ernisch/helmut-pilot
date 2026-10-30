"""Reuse the fixed private functional evidence, never a legacy RAM acceptance.

The sender alone reads the private evidence before READY. Workflow declarations
contain only the separately approved public reference and code-review digest.
No original, receipt body, artifact identifier or credential is published here.
"""
import sys
sys.dont_write_bytecode = True
import hashlib
import importlib.util
import json
from pathlib import Path
import re

spec = importlib.util.spec_from_file_location('restore_function_phase_contract', Path(__file__).with_name('phase_contract.py'))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)
SCHEMA = 'helmut-w15-private-restore-function-evidence/1'
COMPATIBILITY = 'helmut-w15-restore-function-compatibility/1'


class FunctionRejected(ValueError):
    phase = 'restore-acceptance'
    def __init__(self):
        super().__init__('RESTORE_FUNCTION_EVIDENCE_REJECTED')


def need(value):
    if not value:
        raise FunctionRejected()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False).encode('ascii')


def reference(value, target):
    need(type(value) is dict and set(value) == set(P.FUNCTION_REFERENCE) | {'targetCommit', 'compatibilityReviewSHA256'}
         and all(value[k] == v for k, v in P.FUNCTION_REFERENCE.items())
         and value['legacyRestoreAccepted'] is False and value['targetCommit'] == target
         and type(target) is str and re.fullmatch('[a-f0-9]{40}', target)
         and type(value['compatibilityReviewSHA256']) is str
         and re.fullmatch('[a-f0-9]{64}', value['compatibilityReviewSHA256']))
    return value


def verify(packet, public_reference, target, source_qualification_sha, review_sha, *, git, api):
    reference(public_reference, target)
    need(type(packet) is dict and set(packet) == {'schema', 'receipt', 'independentReview', 'compatibility'}
         and packet['schema'] == SCHEMA and len(canonical(packet)) <= 65535)
    receipt, review, compatibility = (packet[k] for k in ('receipt', 'independentReview', 'compatibility'))
    need(type(receipt) is dict and type(review) is dict)
    need(hashlib.sha256(canonical(receipt) + b'\n').hexdigest() == P.FUNCTION_REFERENCE['receiptSHA256']
         and hashlib.sha256(canonical(review) + b'\n').hexdigest() == P.FUNCTION_REFERENCE['independentReviewSHA256'])
    need(receipt.get('status') == 'COMPLETED_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY'
         and receipt.get('exactCommit') == P.FUNCTION_REFERENCE['exactCommit']
         and receipt.get('runId') == P.FUNCTION_REFERENCE['runId']
         and receipt.get('legacyRestoreAccepted') is False
         and receipt.get('commonLifetimeMemoryAccepted') is False
         and receipt.get('ownedChildrenExited') is True
         and receipt.get('workerResult', {}).get('backupRoundtripVerified') is True)
    need(review.get('independentOfOriginalExecution') is True
         and review.get('remainingCriticalOrHighFindings') == 0
         and review.get('legacyContractAccepted') is False
         and review.get('legacyRestoreAccepted') is False
         and review.get('commonLifetimeMemoryAccepted') is False
         and review.get('restoreAndBackup', {}).get('fullAuthenticatedRemoteReadbackCompleted') is True
         and review.get('restoreAndBackup', {}).get('secondFreshIsolatedRecoveryCompleted') is True
         and review.get('restoreAndBackup', {}).get('allTableDataAndSequenceInventoryAndRoleSemanticsCompared') is True)
    keys = {'schema', 'status', 'baselineCommit', 'targetCommit', 'sourceQualificationSHA256',
            'publicCodeDiffSHA256', 'functionReceiptSHA256', 'functionReviewSHA256',
            'independentOfImplementation', 'remainingCriticalOrHighFindings', 'functionalAlgorithmsUnchanged',
            'resourceAndGateChangesReviewed', 'executionAuthority'}
    need(type(compatibility) is dict and set(compatibility) == keys
         and compatibility['schema'] == COMPATIBILITY
         and compatibility['status'] == 'PASS_INDEPENDENT_RESTORE_FUNCTION_COMPATIBILITY'
         and compatibility['baselineCommit'] == P.FUNCTION_REFERENCE['exactCommit']
         and compatibility['targetCommit'] == target
         and compatibility['sourceQualificationSHA256'] == source_qualification_sha
         and compatibility['functionReceiptSHA256'] == P.FUNCTION_REFERENCE['receiptSHA256']
         and compatibility['functionReviewSHA256'] == P.FUNCTION_REFERENCE['independentReviewSHA256']
         and compatibility['independentOfImplementation'] is True
         and type(compatibility['remainingCriticalOrHighFindings']) is int
         and compatibility['remainingCriticalOrHighFindings'] == 0
         and compatibility['functionalAlgorithmsUnchanged'] is True
         and compatibility['resourceAndGateChangesReviewed'] is True
         and compatibility['executionAuthority'] is False)
    need(hashlib.sha256(canonical(compatibility)).hexdigest() == review_sha == public_reference['compatibilityReviewSHA256'])
    diff = git.command(['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--binary',
                        P.FUNCTION_REFERENCE['exactCommit'], target, '--']).stdout
    need(hashlib.sha256(diff).hexdigest() == compatibility['publicCodeDiffSHA256'])
    run = api('GET', '/actions/runs/' + P.FUNCTION_REFERENCE['runId'])
    need(type(run) is dict and str(run.get('id')) == P.FUNCTION_REFERENCE['runId']
         and run.get('head_sha') == P.FUNCTION_REFERENCE['exactCommit']
         and run.get('head_branch') == 'codex/w15-github-end500-preparation-20261028'
         and run.get('event') == 'workflow_dispatch' and run.get('status') == 'completed'
         and run.get('conclusion') == 'success' and type(run.get('run_attempt')) is int
         and run['run_attempt'] == 1 and run.get('workflow_id') == 313506164)
    return {'status': 'VERIFIED_RESTORE_FUNCTION_ONLY_LEGACY_RAM_FAILED',
            'legacyRestoreAccepted': False, 'executionAuthority': False}
