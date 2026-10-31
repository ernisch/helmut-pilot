"""Publish only the closed numeric diagnostic receipt as a neutral CI check.

No artifact, original data, repository write, model request or approval channel.
The existing Actions token stays in the environment/header, never argv/output.
"""
import sys
sys.dont_write_bytecode = True
import json
import os
from pathlib import Path
import re
import stat
import urllib.request
import urllib.error

PUBLICATION_PHASE = 'receipt-read'
SCHEMA = 'helmut-w15-synthetic-resource-diagnostic-result/1'
REF = 'refs/heads/codex/w15-separated-resource-metering-20261031'
FALSE_FLAGS = ('executionAuthority', 'retryAllowed', 'providerParityAccepted',
               'resourceContractAccepted', 'end500Acceptance', 'mock500Acceptance',
               'productionAccepted', 'originalsAccessed')


# Finite reviewed metric-field and enum vocabulary, fixed at development time.
# Numeric/boolean observations and these enums only: arbitrary string contents
# never enter the public check, even if an extra producer field is introduced.
METRIC_KEYS = frozenset('responseFailure exceptionType sourceLine diagnostic-required-schema-migration-missing diagnostic-schema-migration-list-unique common-parent abgewiesenWegenObergrenze absolutePath action activate activationEnabled activeClients activeCohortReadbacks activePolling actualPaidProviderUsage actualProviderBytes actualSecondsIncludingOwnedCleanup actualSystemSafetyReserveBytes actualTotalSecondsIncludingOuterCleanup add_help alg allDeclaredProcessesObserved allObservedProcessesBound allow_abbrev allow_nan allowed_owner ambiguous ancestorHeadroomBytes anon application applicationExitAttestedBeforeServiceStop args arguments assertion assignment assignmentBasis attempt attestedBeforeRelease aufrufe ausgabeBytes ausgabeTokenGeschaetzt authCalls authClients availableBeyondDiagnosticHardLimitBytes avg10 avg300 avg60 backgroundBackends backup barrier barrierBeforeNodeImport binding bindings bound boundProcessIdentities bund bytesJeGeschaetztemToken ca_path cacheProducerAttribution callerUID capacityAt500Profiles capacityDiagnostic capacityMeasurement capacity_diagnostic caseCount categoryMaxima check childExit choices classifiedRole cleanup cleanupFailureDetail clientBackends clientStateCoverageComplete close_fds closed closure code common commonFailureMemory commonIsWholeGitHubHostConsumption commonLifetimeMemoryAccepted comparisonBudgetBytes completeComponentPSSBytes completedScenarios componentGroupsEmpty componentUnitsRemoved components configuration configuredLimit configuredLimitBytes connectionsHighestSampled connectionsTruePeak containerInitPID containerMemoryLimitBytes context contractSHA256 controller-helpers controllerStarted count counterDeltas counterIdentityDrift counters cpuCounterUnit cpuInterval cpuMaximum cpuPressure cpuStat cpuTimeParityWithMicro cpuUsageUsec createdb current currentBytes daemon-reload database databaseCPUQuotaIsLabChoiceNotSupabaseGuarantee databaseGroupIncludesPostgRESTAndTransientSQLObserverClients databasePort databaseStarted databaseStopped databaseURL dataset datasetEpochUTC dauerMs deactivate declaredRole description device diagnostic-ca-required-before-node-start diagnostic-cleanup-only-newly-owned-profiles diagnostic-exact-active-cohort-required diagnostic-fresh-database-required diagnostic-initial-zero-required diagnostic-local-preload-required diagnostic-native-decisions-required diagnostic-native-matches-required diagnostic-positive-current-briefing-required diagnostic-positive-native-understanding-required diagnostic-provision-refused diagnostic-stop-or-deadline diagnostic-synthetic-profile-selector-required diagnosticHardLimitBytes diagnosticOnly differentPeaksAdditive differentTimeMaximaAdditive dir_fd disabled dockerClientPID dockerSocketGID drift duplex effectiveAvailableBytes effectiveCpuset eingabeBytes eingabeTokenGeschaetzt elapsedNS empty end500 end500Acceptance end500CapacityTrace end500_capacity_roles end500_capacity_trace end_capacity_diagnostic ensure_ascii env epoch erfolgreich events exactCommit exec executedCaseCount executedProfileCount executedSourceCount executionAuthority exitCode exit_code exp expectedCommit failed failure failureDetail fehler file fileCacheAdditiveToPSS file_dirty file_writeback finalActiveProfiles finalCommonParentAfterOwnedExits finalReceiptWritten first firstFailure firstFailureDetail firstFailurePhase firstObservedMonotonicNS fixtureRequiredSelectors follow_symlinks formal1500Acceptance freeNonReservedClientSlotsAtSample full full500Completed full500ReleaseAttempted full500_release fullLifetimeClosureAccepted fullRestoreCapacityAccepted fullScenarioAccepted geo-bund geo-land-berlin geo-land-brandenburg geographyIDs github-entry-pin github-environment github-head gleichzeitigSpitze groups hardMemoryBytes helmut-node high host hostAvailableBytes hostMemoryPressure hostPID hostTotalBytes http https hugetlbIncludedInPSS id identity idleClients idleTransactionClients image imageId initialCommonParent inode input inspect instanceId iss kernel kernelLifetimePeakBytes kernelLifetimePeakMonotonic kernelPageBytes kernelPeakFirstObserved kernelPeakScope kiPort kiURL labels land last lastCommonKernel lastCommonParent lastConnectionSample lastObservedKernelSample lastObservedMonotonicNS lastReadbackValid lastWorkPhase legacyAcceptanceUnchanged legacyContractAccepted legacyPeakExceeded legacyPeakLimitBytes localSimulatedAI logs low ls-tree max maxConnections maxParallelWorkers maxSeconds maxWallSeconds maximum maximumActualCommonLifetimePeakBytes maximumBytes maximumCgroups maximumConsumptionBytes maximumKernelPeakBytes maximumObservedCurrentBytes maximumPids maximumReadBytes maximumSourceTextBytes maximumTotalSeconds maximumWorkingSecondsIncludingPreparation maxlength maxsize meaning memory memoryEvents memoryPressure memoryStat memoryUnit memory_components min minimumSourceTextBytes minimumUnallocatedHostReserveBytes mittel mock500 mock500Acceptance mode monotonicNS n name namespacePID nativeStatus network node nodeSource nonce none nr_periods nr_throttled object_pairs_hook observationElapsedNanoseconds observedAfterFailure observedCurrentBytes observedImageId observedKernel observedKernelPeakBytes observedMonotonicNS observedPSSBytes observerClients observerIncludedInTotal observerOverheadBytes oom oom_group_kill oom_kill originalDataUsed originalEquivalent originalQualificationClaimed originalsAccessed otherClients outer-final-readback outer-image outer-initial-readback outer-parent-stop outer-prepare outer-socket outer-supervisor outerCommonFailureMemory outerOwnedContainerStop outsideOuterLauncherMemoryBytes ownedChildrenExited p50 p95 pageSizeBytes parent parent-daemon-reload parent-entry parent-readback parent-remove parent-start parent-unit-write parentIdentity parentStoppedAndRemoved parent_identity parse_constant parts path peak peakCompositionKnown periodUsec pg_isready phase phaseMeasurements phaseObservations pid pidInventoryStable pidfd politicalLevels poolQueueDepth populated port positiveProfileResults postFailureMemoryStat postgres postgresql postgrest postgrestClients postgrestSource postgrestURL preexistingSharedPageChargeCompleteness preflight preflight-small preflightOnly preflightProfileIndices prepare prepare-database pressureAverageUnit process processBindings processing processingBackupPhase processingBackupStage processing_backup_stage productionAccepted productionProof professionalAcceptance profileCount profileSelectorCoverage profileSpecsSHA256 profiles providerCalls providerFacts providerParityAccepted provision provisionedProfiles psql pssBytes pureApplicationBytes pureApplicationConsumption pythonOrchestratorInsideParent quotaUsec readback readiness ready reason record referenceLabProposal released remove request requestedProfiles required requiredReserveBytes reservedConnections resourceContract resourceContractAccepted resourceDiagnosticNonce resourceGuardAccepted resourceGuardsChanged resultRoot results retryAllowed rev-parse role roleBindingCollisions roles rootSupervisorPID rssPort rssURL run runAttempt runId runner_diagnostics running sameKernelParentIdentity sameParentIdentityObserved sample sampleCount sampleWhileAllRolesLive saved schema scope scopeMeaning seconds separators sequence services servicesResults sharedBuffersBytes sharedPlatformClients shell shmem simulatedProviderOnly skipped slot snapshotAtomic some sort_keys sourceDatasetSHA256 sourceDocumentCount sourceTextBytes sqlstate staging start startGateAccepted startTicks startedMonotonicNS state stateRoot status stdin stop stop_latch storageClients superuserReservedConnections supervise supervisor-container-stop supervisor-entry supervisor-image supervisor-readback supervisor-worker swap swapBytes swapCurrentBytes swapMaximum swapMaximumBytes synthetic500 syntheticDatasetCoverage syntheticOnly system_usec systemdReload target test-tools throttled_usec time timeout timespec tokensAreEstimates tools tools-start total typ uid1000WorkerPID unassignedParentProcessCount unboundRoles understanding understoodCases uniqueObservedPids units unknown unknownStateClients usageLogicalCPUs usage_usec user user_usec value vercelActualConsumption vercelActualMemoryBytes via w15-bound-child w15ParentProbeFailure wait wholeSupabaseMicroConsumption work workMemBytes worker-client worker-container-bind worker-container-start worker-container-stop worker-entry worker-image worker-load workerSupplementaryGroups workloadFailure workloadResults'.split())
PUBLIC_ENUMS = frozenset('diagnostic-mock-schema-required diagnostic-one-explicit-case diagnostic-mock-case-binding diagnostic-mock-current-understanding-schema LLM_USAGE_NOT_CONFIRMED AI_REQUEST_TIMEOUT AI_REQUEST_SEND_ERROR AI_RESPONSE_TOO_LARGE AI_RESPONSE_ABORTED AI_RESPONSE_STREAM_ERROR AI_RESPONSE_INVALID_JSON AI_RESPONSE_NOT_COMPLETED AI_REQUEST_BUILD_FAILED AI_TLS_ERROR AI_PROVIDER_HTTP_4XX AI_PROVIDER_HTTP_5XX AI_PROVIDER_HTTP_400 AI_PROVIDER_HTTP_401 AI_PROVIDER_HTTP_403 AI_PROVIDER_HTTP_404 AI_PROVIDER_HTTP_408 AI_PROVIDER_HTTP_422 AI_PROVIDER_HTTP_429 AI_PROVIDER_HTTP_500 AI_PROVIDER_HTTP_502 AI_PROVIDER_HTTP_503 AI_PROVIDER_HTTP_504 saved skipped failed disabled unknown duplicate merged skipped-artikelkontext skipped-ausgang-unbekannt skipped-bestandslesefehler skipped-budget skipped-cluster-belegt skipped-error skipped-failed skipped-gate-geparkt skipped-invalid skipped-modellstart-unklar skipped-no-cluster skipped-no-vorgang skipped-production-admission skipped-store skipped-terminal skipped-update-final skipped-veraltet skipped-zeitbudget AssertionError JSONDecodeError ValueError TypeError KeyError AttributeError ResourceError StopIteration diagnostic-required-schema-migration-missing diagnostic-schema-migration-list-unique A ACTION_ALLOWLIST AND APPLICATION_WITH_INSEPARABLE_HARNESS_CHARGED_GROUP APP_RESULT BARRIER_FRAME BARRIER_NOT_READY BLOCKED BOUND_PROCESS_EXIT_UNKNOWN BYTES CALLER_DECLARATION_AND_KERNEL_MEMBERSHIP_NOT_CODE_SEMANTICS CANCELLED CAPACITY_DIAGNOSTIC_CURRENT_SAMPLE_ONLY CA_FILE CA_PATH CHECK_REJECTED CHILD_EXIT_WITHOUT_REPORT CLI COMMAND_FAILED COMMAND_TIMEOUT COMMAND_UNAVAILABLE COMMON_LIMIT COMMON_PARENT_REJECTED COMMON_TEST_RESOURCE_BINDING_REJECTED COMPONENT_LIMIT_OR_EVENT COMPONENT_RESOURCE_OBSERVATION_UNKNOWN COMPONENT_SNAPSHOT_UNAVAILABLE CONNECTION_READBACK CONTAINER_IDENTITY CONTAINER_READBACK COUNTER_DECREASED CPU DATABASE_NOT_READY DATABASE_OOM_UNKNOWN DATABASE_STOP DB DECLARED_SEPARATE_GROUP_OBSERVED DISK_RESERVE EACCES ECONNREFUSED ECONNRESET EEXIST ENOENT ENOTFOUND EPERM EPIPE ERR_ASSERTION ERR_MODULE_NOT_FOUND ETIMEDOUT EXISTING EXPECTED_COMMIT FAIL_OR_UNKNOWN FAIL_OR_UNKNOWN_DIAGNOSTIC FAIL_OR_UNKNOWN_PARENT_PROBE_START_BLOCKED FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC FILESYSTEM_ACCESS_DENIED FILESYSTEM_ENTRY_MISSING FILESYSTEM_ERROR FIRST_OBSERVATION_NOT_KERNEL_PEAK_OCCURRENCE_TIME FRESH_DATABASE_PROOF GITHUB_ACTIONS GITHUB_EVENT_NAME GITHUB_HEAD_REF GITHUB_REF GITHUB_RUN_ATTEMPT GITHUB_RUN_ID GITHUB_SHA GO GROUP_NOT_EMPTY HEAD HS256 HUNDREDTH_PERCENT IDENTITY_CHANGED IMAGE_IDENTITY INACTIVE_RESOURCE_PROPOSAL_REJECTED INERT_OPTIONAL_COMPONENT_DIAGNOSTIC_NOT_CONNECTED INNER_DIAGNOSTIC_FAILED ISOLATED_GITHUB_FULL_RESTORE_CAPACITY_DIAGNOSTIC_ONLY JWT KERNEL_PEAK_DECREASED LANG LC_ALL LEAF_IDENTITY MICROSECONDS MOCK_BINDING MOCK_SERVICES_NOT_READY MOCK_SERVICES_STOP_UNKNOWN MODULE_NOT_FOUND NAMESPACE_PID_UNKNOWN NONE_OBSERVED NOT_GUARANTEED NOT_STARTED NO_ACCEPTANCE OBSERVED_CLIENT_CONNECTIONS_ONLY OBSERVED_OPTIONAL_MEMORY_DIAGNOSTIC OBSERVED_SEPARATE_CGROUP_COUNTERS_ONLY ORIGINAL_FREE_SYNTHETIC_3_PROFILE_CONNECTION_QUALIFICATION_ONLY ORIGINAL_FREE_SYNTHETIC_500_CAPACITY_ONLY OUTPUT_REJECTED OWNED_CLEANUP_UNKNOWN OWNED_COMMAND_FAILED OWNED_COMMAND_TIMEOUT OWNED_OUTPUT_BOUND PARENT_IDENTITY PARENT_STOP_UNKNOWN PARTIAL_COMPONENT_RESOURCE_OBSERVATION PARTIAL_OPTIONAL_MEMORY_DIAGNOSTIC PASS PASS_ACTUAL_HOST_CAPACITY_ADMISSION_ONLY PASS_OBSERVED_COMMON_PARENT_CURRENT_SAMPLE_ONLY PASS_PARENT_TOPOLOGY_ONLY_START_BLOCKED PASS_SYNTHETIC_DIAGNOSTIC_WORKLOAD_ONLY PASS_SYNTHETIC_RESOURCE_DIAGNOSTIC_ONLY PATH PHASED_PARENT_CURRENT_SAMPLE_ONLY PHASE_ENUM PID PINNED_BINARY PLACEMENT_READBACK PLACEMENT_WRITE POSTGREST_EXITED POSTGREST_NOT_READY PREPARED_EMPTY_SYNTHETIC_DATABASE_ONLY PREPARED_INACTIVE_REFERENCE_MEASUREMENT_ONLY PROPOSED_REFERENCE_LAB_ONLY PSS PUBLIC_RECEIPT_BOUND PUBLIC_RECEIPT_WRITE PYTHONDONTWRITEBYTECODE RAM REFERENCE_CURRENT_SNAPSHOT_FIT_ONLY REFERENCE_NUMERICS_REJECTED REFERENCE_PAGE_ASSUMPTION_CHANGED REFERENCE_PLAN_ONLY_NO_EXECUTION REFERENCE_SNAPSHOT_FIT_ONLY REFERENCE_SNAPSHOT_OUTSIDE_PROPOSAL RESTORE_CAPACITY_DIAGNOSTIC_REJECTED RESULT_BINDING RESULT_BOUND ROOT_NO_MEMORY_MAX RUNNER_PARENT_ARGUMENTS_REJECTED RUNNER_PARENT_PROBE_REJECTED RUNNER_TEMP RUNTIME_REJECTED SC_PAGE_SIZE SEPARATE_RUN_GO_AND_COMPLETE_CLOSURE_REQUIRED SYNTHETIC_RESOURCE_DIAGNOSTIC_REJECTED SYSTEMD_RELOAD TERM TOOLS_MEMBERSHIP UID UNBOUND_OR_UNREADABLE UNDERSTOOD_CASE_COUNT UNIT_IDENTITY UNKNOWN UNKNOWN_COMPONENT_RESOURCE_OBSERVATION UNKNOWN_GROUP_READBACK UNKNOWN_NOT_IN_COMMON_PARENT UNKNOWN_OPTIONAL_MEMORY_DIAGNOSTIC UNKNOWN_REFERENCE_COMPONENT_BUDGET UNLIMITED UNLIMITED_ROOT W15 W15_DIAGNOSTIC_REQUEST W15_IMAGE_ID W15_NODE_SOURCE W15_POSTGREST_SOURCE WALL_LIMIT WHOLE_GROUP_LIFETIME_INCLUDING_SMALL_PREFLIGHT_NO_RESET WORKER_SOURCE_UNAVAILABLE WORKLOAD_FAILURE_SCHEMA WORKLOAD_PROCESS_FAILED XX000 Z activate already-local application barrier binding bund cgroup-v2 closed closure common-parent configuration container-only controller-helpers daemon-reload database dataset db-anon-role db-pool db-schemas db-uri deactivate diagnostic-ca-required-before-node-start diagnostic-cleanup-only-newly-owned-profiles diagnostic-exact-active-cohort-required diagnostic-fresh-database-required diagnostic-initial-zero-required diagnostic-local-preload-required diagnostic-native-decisions-required diagnostic-native-matches-required diagnostic-positive-current-briefing-required diagnostic-positive-native-understanding-required diagnostic-provision-refused diagnostic-stop-or-deadline diagnostic-synthetic-profile-selector-required disabled failed full full-restore geo-bund geo-land-berlin geo-land-brandenburg github-entry-pin github-environment github-head groups helmut-node helmut-resource500-synthetic-dataset/1 helmut-synthetic500-resource-diagnostic/1 helmut-w15-synthetic-resource-diagnostic-result/1 identity-checked invented-fixture isolated-public-synthetic-fixture jwt-secret land ls-tree one-way original-free outer-final-readback outer-image outer-initial-readback outer-parent-stop outer-prepare outer-socket outer-supervisor parent parent-daemon-reload parent-entry parent-only parent-readback parent-remove parent-start parent-unit-write postgrest preflight-small prepare-database process-name provision read-only readback rev-parse saved schema secret-free server-host server-port services skipped some staging supervisor-container-stop supervisor-entry supervisor-image supervisor-readback supervisor-worker synthetic500 test-tools thread-group tools-start understanding unknown work worker-client worker-container-bind worker-container-start worker-container-stop worker-entry worker-image worker-load'.split())

def metric_projection(value, key='', depth=0):
    assert depth <= 16
    if value is None or type(value) is bool: return value
    if type(value) in (int, float):
        assert -2**53 < value < 2**53
        return value
    if type(value) is str:
        if value in PUBLIC_ENUMS: return value
        if key in ('exactCommit', 'sourceDatasetSHA256', 'profileSpecsSHA256'):
            assert re.fullmatch('[a-f0-9]{40}|[a-f0-9]{64}', value)
            return value
        if key == 'nonce':
            assert re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', value)
            return value
        if key in ('epoch', 'datasetEpochUTC') and re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z', value): return value
        if value.isdigit() and len(value) <= 16 and int(value) < 2**53: return value
        return 'UNKNOWN'
    if type(value) is list:
        assert len(value) <= 512
        return [metric_projection(item, key, depth+1) for item in value]
    assert type(value) is dict and len(value) <= 256
    if key == 'events':
        # Kernel event dictionaries may acquire new counters. Publish only the
        # reviewed six counters; the unchanged parent guard already assessed them.
        value={name:item for name,item in value.items() if name in ('low','high','max','oom','oom_kill','oom_group_kill')}
    assert set(value) <= METRIC_KEYS, ('METRIC_FIELD_SET', key)
    return {name: metric_projection(item, name, depth+1) for name,item in value.items()}



def prepare(report, env):
    assert env.get('GITHUB_ACTIONS') == 'true', 'ENV_ACTIONS'
    assert env.get('GITHUB_REPOSITORY') == 'ernisch/helmut-pilot', 'ENV_REPOSITORY'
    event = env.get('GITHUB_EVENT_NAME')
    assert (event == 'workflow_dispatch' and env.get('GITHUB_REF') == REF) or (
        event == 'pull_request' and env.get('GITHUB_HEAD_REF') == REF.removeprefix('refs/heads/')), 'ENV_EVENT_REF'
    commit, head, run = (env.get(k, '') for k in ('GITHUB_SHA', 'SOURCE_HEAD_SHA', 'GITHUB_RUN_ID'))
    assert re.fullmatch('[a-f0-9]{40}', commit) and re.fullmatch('[a-f0-9]{40}', head) and run.isdigit(), 'ENV_COMMIT_RUN'
    assert type(report) is dict and report.get('schema') == SCHEMA
    expected_scope = ('ORIGINAL_FREE_SYNTHETIC_500_CAPACITY_ONLY' if event == 'workflow_dispatch'
                      else 'ORIGINAL_FREE_SYNTHETIC_3_PROFILE_CONNECTION_QUALIFICATION_ONLY')
    assert report.get('scope') == expected_scope, 'REPORT_SCOPE'
    assert report.get('status') in ('PASS_SYNTHETIC_RESOURCE_DIAGNOSTIC_ONLY',
                                   'FAIL_OR_UNKNOWN_SYNTHETIC_RESOURCE_DIAGNOSTIC')
    assert report.get('runId', 'UNKNOWN') in (run, 'UNKNOWN'), 'REPORT_RUN'
    assert report.get('exactCommit', 'UNKNOWN') in (commit, 'UNKNOWN'), 'REPORT_COMMIT'
    assert all(report.get(key) is False for key in FALSE_FLAGS), 'REPORT_FLAGS'
    public = metric_projection(report)
    raw = json.dumps(public, sort_keys=True, ensure_ascii=True, allow_nan=False)
    assert len(raw) <= 60000
    token = env.get('GITHUB_TOKEN', '')
    assert token and token not in raw, 'TOKEN_BINDING'
    assert not re.search(r'(?i)bearer\s|BEGIN [A-Z ]*PRIVATE KEY|postgres(?:ql)?://|"(?:serviceToken|password|secret|caPath)"', raw)
    return {'name': 'Ressourcen-Diagnose SAFE (' + run + ')', 'head_sha': head,
        'status': 'completed', 'conclusion': 'neutral', 'external_id': 'resource-diagnostic-' + run,
        'details_url': 'https://github.com/ernisch/helmut-pilot/actions/runs/' + run,
        'output': {'title': 'Synthetische Ressourcenmessung — keine Anbieterabnahme',
            'summary': 'Geschlossene SAFE-Quittung; keine Original- oder Production-Freigabe.',
            'text': '```json\n' + raw + '\n```'}}


def compact_notice(report):
    """Existing Actions annotations keep first cause readable if Check POST fails."""
    keys=('scope','status','exactCommit','runId','nonce','lastWorkPhase','firstFailure',
          'cleanup','full500ReleaseAttempted','full500Completed')
    value=metric_projection({key:report[key] for key in keys if key in report})
    text=json.dumps(value,ensure_ascii=True,allow_nan=False,separators=(',',':'))
    assert len(text)<=8192
    return '::notice title=SAFE Ressourcen-Diagnose::'+text.replace('%','%25').replace('\r','%0D').replace('\n','%0A')


def main():
    global PUBLICATION_PHASE
    p = Path(os.environ['RUNNER_TEMP']) / 'resource-diagnostic.SAFE.json'
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        st = os.fstat(fd)
        assert stat.S_ISREG(st.st_mode) and st.st_uid == 0 and stat.S_IMODE(st.st_mode) == 0o600
        assert st.st_nlink == 1 and 0 < st.st_size <= 65536
        raw = os.read(fd, 65537); assert len(raw) == st.st_size
        report = json.loads(raw)
    finally:
        os.close(fd)
    PUBLICATION_PHASE='closed-projection'
    print(compact_notice(report), flush=True)
    data = json.dumps(prepare(report, os.environ), ensure_ascii=True).encode('ascii')
    req = urllib.request.Request('https://api.github.com/repos/ernisch/helmut-pilot/check-runs',
        data=data, method='POST', headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN'],
            'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
            'User-Agent': 'helmut-isolated-resource-receipt'})
    PUBLICATION_PHASE='check-post'
    with urllib.request.urlopen(req, timeout=20) as response:
        assert response.status == 201
    print('SAFE_RESOURCE_RECEIPT_CHECK_PUBLISHED')


if __name__ == '__main__':
    try: main()
    except Exception as error:
        allowed={'ENV_ACTIONS','ENV_REPOSITORY','ENV_EVENT_REF','ENV_COMMIT_RUN','REPORT_SCOPE','REPORT_RUN','REPORT_COMMIT','REPORT_FLAGS','TOKEN_BINDING','METRIC_FIELD_SET'}
        code=('HTTP_'+str(error.code) if isinstance(error,urllib.error.HTTPError) else
              error.args[0] if isinstance(error,AssertionError) and error.args and error.args[0] in allowed else 'CLOSED_PROJECTION_OR_IO_UNKNOWN')
        if isinstance(error,AssertionError) and error.args and type(error.args[0]) is tuple:
            detail=error.args[0]
            if len(detail)==2 and detail[0]=='METRIC_FIELD_SET' and detail[1] in METRIC_KEYS:code='METRIC_FIELD_SET_IN_'+detail[1]
        print('::error title=SAFE Messquittung::SAFE_RESOURCE_RECEIPT_PUBLICATION_UNKNOWN '+PUBLICATION_PHASE+' '+code, file=sys.stderr)
        raise SystemExit(1) from None
