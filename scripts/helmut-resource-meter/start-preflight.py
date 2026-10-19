#!/usr/bin/env python3
"""ONE fail-closed, read-only entry precheck. Never starts or reserves a run.

Readiness is not authority and not a promise about future I/O. Consumer source
coverage and independent adoption are mandatory. Old claims are never reset.
Use the controller's --check-only flag, not the resource execution switch.
"""
import ast
import datetime
import hashlib
import importlib.util
import ipaddress
import json
import os
import re
import subprocess
import time
from pathlib import Path

BIN = Path(__file__).parent.resolve()
ROOT = BIN.parent.parent
REQUIRED_CHECKS = frozenset([
    'binding.acceptance','binding.connection','binding.recipeTemplate','acceptedMetadata','caseBinding',
    'unusedGO','outputFreshness','stageContract','dayPin','window','originals','financialData','financialAuthority',
    'reviewedTemplateReplay','consumerChecksProcess','consumer.preparationInputs','consumer.materialsInputs',
    'consumer.profileInputs','filesystemReserve','toolchain','resourceNamesAndSubnet','approvedLoopMinor',
    'consumer.ownerInputs','consumer.servicesInputs','consumer.initialSourceBinding','consumer.providerInputs',
    'consumer.staticInterfaces','allFilePins','preSetupAuthority','mountInputs','guardInventory','completeIndependentCoverage'])
LEGACY_MANIFEST_SHA256='3fc7944cd2bc67a29e3acefbf4423139e2c3f1609a6a49a25dea914e8a9a686d'


def module(name, file):
    s = importlib.util.spec_from_file_location(name, BIN / file)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def pin(file):
    p = Path(file)
    require(p.is_absolute() and p.resolve() == p and not p.is_symlink() and p.is_file(), 'canonical regular file required')
    b = p.read_bytes()
    return dict(path=str(p), bytes=len(b), sha256=hashlib.sha256(b).hexdigest())


def read(p):
    require(pin(p['path']) == p, 'pin drift')
    return json.loads(Path(p['path']).read_text())


def private_pin(p):
    require(Path(p['path']).stat().st_mode & 0o077 == 0, 'private file permissions required')
    return read(p)


class Report:
    def __init__(self):
        self.checks = []
        self.started = time.time()

    def check(self, id, consumer, purpose, fn):
        started=time.time()
        try:
            evidence = fn()
            status='BLOCKED' if isinstance(evidence,dict) and evidence.get('pass') is False else 'PASS'
            self.checks.append(dict(id=id, status=status, consumer=consumer, purpose=purpose, evidence=evidence,
                startedAtUnixSeconds=started,completedAtUnixSeconds=time.time()))
            return evidence
        except Exception as e:
            # Exceptions may contain private data/SQL/auth/assert operands.
            # Only static check descriptions and exception types leave here.
            self.checks.append(dict(id=id, status='BLOCKED', consumer=consumer, purpose=purpose, errorType=type(e).__name__,
                startedAtUnixSeconds=started,completedAtUnixSeconds=time.time()))
            return None


def python_inventory(file):
    b = file.read_bytes()
    tree = ast.parse(b, filename=str(file))
    guards, imports = [], []

    def walk(node, scope='<module>'):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            scope = node.name
        is_guard_call=isinstance(node,ast.Call)
        if isinstance(node, (ast.Assert, ast.Raise))or is_guard_call:
            code = ast.get_source_segment(b.decode(), node)
            guards.append(dict(line=node.lineno, endLine=node.end_lineno, function=scope,
                               kind=type(node).__name__, sha256=hashlib.sha256(code.encode()).hexdigest(), expression=code))
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            imports.append(dict(line=node.lineno, expression=ast.get_source_segment(b.decode(), node)))
        for child in ast.iter_child_nodes(node):
            walk(child, scope)
    walk(tree)
    return dict(**pin(file), guards=guards, requires=imports)


def inventory(connection, node):
    # Full immutable source closure, not just a list of selected error strings.
    # New source files or changed function bodies invalidate independent adoption.
    request = read(connection['runtimeRequest'])
    paths = set(p['path'] for p in request['sourcePins'] if Path(p['path']).suffix in ['.js', '.py'])
    paths.update(p['path'] for p in connection['immutableWorkflowPins'] if Path(p['path']).suffix in ['.js', '.py'])
    paths.update(str(p.resolve()) for p in BIN.iterdir() if p.suffix in ['.js', '.py'] and '-test.' not in p.name)
    paths.update(p['path'] for p in connection['applicationReadOnlyPins'] if Path(p['path']).suffix in ['.js', '.py'])
    js = sorted(p for p in paths if p.endswith('.js'))
    out = subprocess.run([str(node), str(BIN/'start-guard-inventory.js')], input=json.dumps(js),
                         capture_output=True, text=True, timeout=90, check=True)
    rows = json.loads(out.stdout) + [python_inventory(Path(p)) for p in sorted(paths) if p.endswith('.py')]
    return sorted(rows, key=lambda x:x['path'])


def template_replay(connection):
    staged=read(connection['stagedHarness'])
    baseline=BIN/'legacy-harness-pins.json'
    require(pin(baseline)['sha256']==LEGACY_MANIFEST_SHA256,'review-pinned legacy baseline drift')
    original={p['path']:p for p in json.loads(baseline.read_text())['files']}
    require(len(original)==26 and len(staged['templateDeltas'])==26 and
        {d['original']['path']for d in staged['templateDeltas']}==set(original),'complete exact26 original template set required')
    connector=module('pure_stage_renderer','connect-local500.py')
    owner=read(connection['freshOwnerGO'])
    require(staged['executionOwnerGOPath']==owner['finalOwnerGOPath'],'actual future owner path differs from intent/GO')
    rendered=connector.render_templates(connection['caseDirectory'],target=connection['targetDatabase'],
        container=connection['containerName'],operation=connection['operationId'],
        day_rows_pin=staged['dayRows'],owner_go_pin={'path':staged['executionOwnerGOPath']},atomic_usage_pin=staged.get('atomicUsageInput'))
    expected_render={r['original']['path']:r for r in rendered}
    for delta in staged['templateDeltas']:
        p=delta['original'];expected={k:original[p['path']][k] for k in ['path','bytes','sha256']}
        require(p==expected and pin(p['path'])==p,'unreviewed original consumer')
        code=Path(p['path']).read_text()
        for replacement in delta['replacements']:
            require(code.count(replacement['from'])==replacement['count'],'consumer replacement count drift')
            code=code.replace(replacement['from'],replacement['to'])
        r=expected_render[p['path']]
        require(delta['replacements']==r['replacements'] and code==r['text'] and delta['staged']['path']==r['destination'],
            'actual consumer differs from shared deterministic producer')
        b=code.encode();actual=delta['staged']
        require(len(b)==actual['bytes'] and hashlib.sha256(b).hexdigest()==actual['sha256']
                and pin(actual['path'])==actual,'actual staged consumer differs from exact reviewed transformation')
    return dict(exactReplayedConsumers=len(staged['templateDeltas']))


def all_file_pins(acceptance,connection):
    request=read(connection['runtimeRequest'])
    pins=acceptance['sourcePins']+connection['immutableWorkflowPins']+connection['applicationReadOnlyPins']+connection['databaseReadOnlyPins']+request['sourcePins']
    if 'atomicUsageInput' in connection:
        candidate=read(connection['atomicUsageInput']);pins+=[connection['atomicUsageInput']]+candidate['sourcePins']
    checked={};bad=[]
    for p in pins:
        key=(p['path'],p['bytes'],p['sha256'])
        if key in checked:continue
        try:require(pin(p['path'])==p,'pin drift');checked[key]=True
        except Exception:checked[key]=False;bad.append({'path':p['path'],'reason':'MISSING_NONCANONICAL_OR_HASH_DRIFT'})
    return {'pass':not bad,'distinctPinAssertions':len(checked),'invalidPins':bad}


def financial_data(C,connection):
    # Diagnose data separately from authority; old bad/consumed GO remains
    # BLOCKED. This branch cannot change, approve, capture, dump or repair input.
    template_replay(connection)
    actual=C.I.A.verify_preexisting_capture(connection['sourceCapture'])
    stage=str(Path(connection['workflowDirectory'])/'prepare-current-local-runtime.js')
    pins=[p for p in connection['immutableWorkflowPins']if p['path']==stage]
    require(len(pins)==1,'exact original financial implementation required')
    snapshot={'auth':json.loads(actual['nativeAuthText']),'nativeAuthText':actual['nativeAuthText'],
        'authSHA':actual['nativeAuthSHA'],'counter':0,'counterReadOK':True}
    # The shared historical-correction verifier requires the ENTIRE native table ==[].
    result=subprocess.run([str(C.I.K.NODE_ROOT/'bin/node'),str(BIN/'local-financial-preflight.js'),json.dumps(pins[0]),connection['day']],
        input=json.dumps(snapshot),capture_output=True,text=True,timeout=30)
    safe=json.loads(result.stdout)
    require(result.returncode==0 and safe.get('pass')is True,'actual original financial projection failed')
    if 'atomicUsageInput' in connection:
        # Read the actual still-frozen corrected INPUT catalog before any GO,
        # setup or schema write. The same predicate is repeated on the target.
        helper=str(BIN/'atomic-usage-integration.js')
        query=subprocess.check_output([str(C.I.K.NODE_ROOT/'bin/node'),'-e',
            "process.stdout.write(require(process.argv[1]).sourceReadySQL())",helper],text=True,env={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'},timeout=20)
        native=C.I.A.query_input(query)
        check=subprocess.run([str(C.I.K.NODE_ROOT/'bin/node'),'-e',
            "require(process.argv[1]).assertSourceReady(JSON.parse(require('fs').readFileSync(0,'utf8')))",helper],
            input=json.dumps(native),text=True,capture_output=True,env={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'},timeout=20)
        require(check.returncode==0,'actual corrected source cannot accept exact atomic schema')
        safe['actualAtomicSourceCatalogReady']=True
    return safe


def stage_contract(connection, recipe):
    require(connection['schema'] == 'helmut-pinned-full500-connection/1' and connection['production'] is False, 'local connection only')
    require(connection['profiles'] == 500 and connection['controlsPerUnit'] == 16, 'complete scope required')
    require(connection['phases'] == ['preparation', 'assembly', 'sequence'], 'stage closure required')
    require(all(connection.get(k) is True for k in ['originalUUnchangedAndRequired', 'noProfiler', 'noPaidProviderCalls']), 'fixed safety criteria required')
    require(connection['sourceCaptureIsPreexistingFixtureInputNotWorkflowCPU'] is True, 'input preparation boundary required')
    require(recipe['scope'] == 'owner-approved-local500-resources' and recipe['full500Attempts'] == 1, 'one local attempt only')
    require(recipe['freshOwnerGO'] == connection['freshOwnerGO'] and recipe['dayBindingAcceptance'] == connection['dayBindingAcceptance'], 'recipe binding differs')
    require(recipe['expectedFreshOperationId'] == connection['operationId'], 'operation differs')
    authority=module('stage_contract_authority','next-resource-authority.py')
    require(connection['resourceClaimPath']==str(authority.CLAIM) and connection['sourceInputDatabase']==authority.INPUT_DATABASE,
        'actual preparation claim/input binding differs from fixed next slot')
    require(recipe['databaseSampleIntervalSeconds'] == 1, 'continuous sampling unchanged')
    require(not set(recipe.get('localEnvironment', {}))-{'PATH', 'LANG', 'HELMUT_RESOURCE_METER_DIR'}, 'environment not allowed')
    n = Path(connection['workflowDirectory']); case = Path(connection['caseDirectory'])
    expected = [
        ['taskset','-c','0','node',str(BIN/'measured-preparation.js'),recipe['fixtureConnectionPin']['path']],
        ['taskset','-c','0','node',str(case/'assemble-after-activation.js'),'--after-reviewed-local-activation'],
        ['taskset','-c','0','node',str(n/'run-reviewed-sequence.js'),str(n/'runtime-candidates/FINAL_CONFIG.PRIVATE.json'),'root-approved-local-only']]
    require([s['name'] for s in recipe['stages']] == connection['phases'], 'original stages changed')
    for s, argv, timeout in zip(recipe['stages'], expected, [300,300,32400]):
        require(s['argv'] == argv and s.get('expectedExitCode',0) == 0 and s['timeoutSeconds'] == timeout, 'actual stage command/timeouts changed')
        for p in s['pins']:read(p) if p['path'].endswith('.json') else require(pin(p['path']) == p, 'stage code drift')
    config = json.loads((n/'CONFIG.TEMPLATE.json').read_text())
    require(config['schema']=='helmut-local-fresh-end-harness-config/1' and
        config['scope']=='CURATED_LOCAL_ONLY_NO_NATIVE_U_NO_PRODUCTION','actual base config schema/scope changed')
    require(config['mode'] == 'combined500' and config['worstCaseUnitIndexes'] == [0,499], 'worst cases missing')
    require(config['policy']['providerHardLimitMS'] == 20000 and config['policy']['profiler'] is False
            and config['policy']['activation'] is False and config['policy']['production'] is False, 'original test policy changed')
    require(connection['storageCapacityBytes'] == 8000000000 and connection['storageHoldSeconds'] == 33000, 'storage scope changed')
    staged=read(connection['stagedHarness'])
    require(connection.get('atomicUsageInput')==staged.get('atomicUsageInput'),'atomic storage candidate differs from actual renderer')
    if 'atomicUsageInput' in connection:
        descriptor=read(connection['atomicUsageInput'])
        day=read(connection['dayBindingAcceptance'])
        calendar=module('stage_calendar_binding','local-calendar-binding.py')
        local=calendar.admit(day,read,descriptor=descriptor,operation=connection['operationId'])
        require(descriptor['schema']=='helmut-local-atomic-usage-resource-input/1' and descriptor['mode']=='relational-atomic-v1'
            and descriptor['production']is False and (local is not None or descriptor['fullContractUnchanged']is True),'local atomic scope differs')
        for p in descriptor['sourcePins']:require(pin(p['path'])==p,'atomic storage source drift')
    return dict(stages=3, profiles=500, controlsPerUnit=16, profiler=False, paidProviderCalls=False)


def output_freshness(connection):
    case = Path(connection['caseDirectory']); n = Path(connection['workflowDirectory'])
    require(case.resolve() == case and n == case/'native-end-preparation', 'output path alias')
    # This is supplementary to the original exclusive writes, not their replacement.
    names = ['CONTROLLER_STARTED.SAFE.json', 'ACTUAL_RESOURCE_ATTEMPT_STARTED.SAFE.json', 'CONTROLLER_COMPLETE.SAFE.json',
             'COMPLETE_START_PREFLIGHT.SAFE.json',
             'FRESH_PACKET.PRIVATE.json', 'LOCAL_ASSEMBLY_RESULT.SAFE.json', 'LOCAL_ASSEMBLY_FAILURE.PRIVATE.txt',
             'SERVICES_REQUEST.PRIVATE.json', 'MATERIALS_REQUEST.PRIVATE.json', 'ROOT_EXECUTION_APPROVAL.PRIVATE.json',
             'ROOT_AUTHORITY_PURPOSES.PRIVATE.json', 'FINAL_BASE_CONFIG.PRIVATE.json', 'FINAL_CONFIG_REQUEST.PRIVATE.json',
             'NEW_PREPARED_REQUESTS.PRIVATE.json', 'BOUND_LOCAL_PROVIDER_FIXTURES.PRIVATE.json',
             'ALL500_ACTUAL_REQUEST_TEMPLATE_BINDINGS.SAFE.json', 'ROOT_FINAL_RUNTIME_INPUT_ACCEPTANCE.PRIVATE.json']
    n_names = ['LOCAL_ACTIVATION_STARTED.SAFE.json', 'LOCAL_ACTIVATION_RESULT.SAFE.json', 'LOCAL_ACTIVATION_FAILURE.SAFE.json',
               'NEW_FIXTURE_SOURCE_DUMP.PRIVATE.bin', 'ORIGINAL_PREPARE.PRIVATE.sql', 'ORIGINAL_ACTIVATE_LOCAL_ONLY.PRIVATE.sql',
               'CURRENT_LOCAL_RUNTIME_CONTEXT.PRIVATE.json', 'LOCAL_NEW_FIXTURE.PRIVATE.json',
               'runtime-candidates/generated-services', 'runtime-candidates/generated-materials', 'runtime-candidates/FINAL_CONFIG.PRIVATE.json',
               'run-combined500-'+connection['operationId']]
    outputs = [case/f for f in names]+[n/f for f in n_names]+[case/'application', case/'database']
    collisions = [str(p.relative_to(case)) for p in outputs if p.exists() or p.is_symlink()]
    require(not collisions, 'output already used')
    for parent in [case,n,n/'runtime-candidates']:
        require(parent.resolve() == parent and parent.is_dir() and os.access(parent,os.W_OK), 'output parent not writable/canonical')
    return dict(freshOutputDestinations=len(outputs))


def filesystem_ready(connection):
    stat = os.statvfs(connection['caseDirectory']); free = stat.f_bavail*stat.f_frsize
    required = connection['storageCapacityBytes']+8*1024**3
    return dict(**{'pass':free>=required},availableBytes=free,requiredBytes=required,
        shortageBytes=max(0,required-free))


def coverage_adopted(bindings, rows):
    # No self-declared complete flag. A separate reviewed artifact must bind
    # the entire inventory and explicitly resolve EVERY precomputable guard.
    review_pin = bindings['startPreflightIndependentAdoption']
    adoption = read(review_pin)
    raw = json.dumps(rows, sort_keys=True, separators=(',',':')).encode()
    require(adoption['consumerInventorySHA256'] == hashlib.sha256(raw).hexdigest(), 'consumer inventory not reviewed')
    require(adoption['status'] == 'ROOT_ADOPTED_PRO_HIGH_COMPLETE_START_PREFLIGHT', 'independent complete adoption missing')
    require(adoption['uncoveredPrecomputableConditions'] == [], 'uncovered conditions remain')
    reviews=adoption['independentReviews']
    require(set(reviews)=={'infrastructure','consumerInputs'},'both complete independent review scopes required')
    required={
        'infrastructure':{str(BIN/f)for f in ['start-preflight.py','full500-controller.py','isolation.py','connect-local500.py','start-guard-inventory.js','legacy-harness-pins.json','next-resource-authority.py','finish-connection.py','measured-preparation.js','process-runner.py']},
        'consumerInputs':{str(BIN/'start-input-checks.js'),str(BIN/'START_PREFLIGHT_COVERAGE.md')}}
    if str(BIN/'atomic-usage-integration.js') in {r['path'] for r in rows}:
        required['infrastructure'].add(str(BIN/'atomic-usage-integration.js'))
    for scope,review_pin in reviews.items():
        pro=read(review_pin)
        require(pro.get('model')=='deepseek-v4-pro' and pro.get('route',{}).get('effort')=='high'
            and pro.get('payload',{}).get('summary',{}).get('status')=='ok','independent Pro High acceptance missing')
        packet=read(pro['requestManifestPin'])
        supplied={p['path']:p for p in packet['explicitSourcePins']}
        require(required[scope]<=set(supplied),'review did not receive required actual source files')
        for p in supplied.values():require(pin(p['path'])==p,'reviewed actual code drifted')
    require(re.fullmatch('[a-f0-9]{64}',adoption['expectedInitialSourceBindingSHA256'])is not None,'initial source binding absent')
    return dict(inventorySHA256=hashlib.sha256(raw).hexdigest(),files=len(rows),independentReviews=reviews)


def assess(bindings,*,planning=False):
    C = module('precheck_controller', 'full500-controller.py')
    report = Report(); report.planning=planning; report.bindings={k:v for k,v in bindings.items() if k in ['acceptance','connection','recipeTemplate','startPreflightIndependentAdoption']}; data = {}
    for key in ['acceptance','connection','recipeTemplate']:
        data[key] = report.check('binding.'+key, 'controller.accepted_metadata', 'Exact immutable '+key,
            lambda key=key:(private_pin(bindings[key])if'.PRIVATE.'in Path(bindings[key]['path']).name else read(bindings[key])))
    connection, acceptance, recipe = [data[k] for k in ['connection','acceptance','recipeTemplate']]
    if not all(isinstance(v,dict) for v in [connection,acceptance,recipe]):
        return finish(report, None)
    report.check('acceptedMetadata', 'controller.accepted_metadata/isolation.verify_full_authority', 'All independent primitive/connection reviews and immutable source/asset pins',
                 lambda:C.accepted_metadata(bindings['acceptance'],bindings['connection'],bindings['recipeTemplate'],planning=planning) and {'exactMetadataAccepted':True})
    report.check('allFilePins','All original pinned() and read_pin() consumers','Check ALL pinned code/assets despite earlier failures; collect every drift',lambda:all_file_pins(acceptance,connection))
    planned_authority={**recipe,'sourcePins':acceptance['sourcePins'],'independentMeterAcceptance':bindings['acceptance'],'recipeTemplatePin':bindings['recipeTemplate']}
    report.check('preSetupAuthority','isolation.verify_pre_setup_authority / verify_full_authority',
        'Actual shared full authority predicates before setup; no fabricated reservation/CID/start receipt',
        lambda:C.I.verify_pre_setup_authority(planned_authority,planning=planning)and{'sharedActualAuthorityChecked':True})
    report.check('mountInputs','isolation.runtime_read_manifest / application_mounts / actual isolated container',
        'Open and SHA256-check EVERY shared runtime input inside the same application input mapping, read-only; no authority or activation',
        lambda:{**C.I.check_container_visibility(connection,planned_authority),
                'databaseMountArgs':len(C.I.fixture_mounts(connection,'database'))})
    report.check('caseBinding', 'connection.exact_case_binding', 'Exact local case/target/container/operation closure',
                 lambda:C.C.exact_case_binding(connection['caseDirectory'],connection['targetDatabase'],connection['containerName'],connection['operationId']) or {'exact':True})
    report.check('unusedGO', 'controller.no_previous_attempt', 'No consumed GO, setup reservation or entered case', lambda:C.no_previous_attempt(connection) or {'unused':True})
    report.check('outputFreshness', 'H.destination/save/mkdirFresh; preparation/assembly/sequence', 'Every planned output must remain unused; no continuation or replay', lambda:output_freshness(connection))
    report.check('stageContract', 'process-runner.main; measured-preparation.main; contracts.gates', 'Exact stages, all500/16, worst cases, local mock/no-profiler policy', lambda:stage_contract(connection,recipe))
    day = report.check('dayPin', 'controller.window/isolation.verify_full_authority', 'Independently accepted day and original day input bindings', lambda:read(connection['dayBindingAcceptance']))
    if day:
        report.check('window', 'controller.window; preparation.window', 'Full original workflow plus setup/close reserve inside actual UTC/Berlin day', lambda:window_evidence(C,day))
    report.check('originals', 'controller.original_preflight', 'All nine original input hashes, original full source state, physical KO/RAW/link equality', lambda:C.original_preflight(connection,check_financial=False))
    report.check('financialData', 'next_resource.verify_preexisting_capture; preparation.financialProposal; K.pruefeStart/auftragsStand', 'Read-only native complete counter/auth binding and all daybooks; NOT new authority', lambda:financial_data(C,connection))
    report.check('financialAuthority', 'next_resource.verify_preexisting_capture', 'Completed input-correction provenance only; new resource GO remains a separate authority gate', lambda:C.financial_preflight(connection))
    # Independently collect fixed consumer predicates even when an earlier check
    # failed. Do NOT execute the assembly or sequence entrypoint IIFEs.
    node = C.I.K.NODE_ROOT/'bin/node'
    templates=report.check('reviewedTemplateReplay','connection.stage / original consumer CODE','Exact review-pinned original functions and every staged transformation',lambda:template_replay(connection))
    expected_source=None
    if bindings.get('startPreflightIndependentAdoption'):
        try:expected_source=read(bindings['startPreflightIndependentAdoption'])['expectedInitialSourceBindingSHA256']
        except Exception:pass # Dedicated coverage/source checks remain BLOCKED.
    child = report.check('consumerChecksProcess', 'start-input-checks.js', 'Read-only fixed inputs for activation/materials/all500 request/profile scope', lambda:consumer_checks(node,connection,expected_source,planning=planning)) if templates else None
    if child:
        stamp=report.checks[-1]
        report.checks.extend(dict(id='consumer.'+r['id'],consumer=r['id'],purpose='Actual deterministic input requirement',
            startedAtUnixSeconds=stamp['startedAtUnixSeconds'],completedAtUnixSeconds=stamp['completedAtUnixSeconds'],
            **{k:v for k,v in r.items() if k!='id'}) for r in child['checks'])
    report.check('filesystemReserve', 'bounded-storage.create', '8GB new filesystem plus unchanged 8GiB free reserve', lambda:filesystem_ready(connection))
    report.check('toolchain', 'kernel-meter/create_database/runner/taskset', 'Exact local Node/Python/PG image, CPU affinity, kernel and formatter capabilities', lambda:toolchain(C))
    report.check('resourceNamesAndSubnet', 'controller.run/isolation.create_network', 'No reused container/network/cgroup/storage names or occupied private subnet', lambda:resource_names(C,connection))
    report.check('approvedLoopMinor', 'bounded-storage.create/LOOP_CONFIGURE', 'Approved exact loop minor currently unbound; setup still checks atomically', lambda:loop_ready(acceptance))
    rows = report.check('guardInventory', 'ALL actual consumer sources', 'AST inventory of assertions, throws and validator calls; full code closure hashes', lambda:inventory(connection,node))
    if rows is not None:
        report.check('completeIndependentCoverage', 'independent coverage adoption', 'No omitted precomputable guards; exact full inventory independently reviewed', lambda:coverage_adopted(bindings,rows))
    return finish(report, rows)


def window_evidence(C,day):
    valid,start,end = C.window(day)
    require(valid, 'reviewed day not started')
    return dict(qualifiedStartUTC=start.isoformat(), qualifiedEndUTC=end.isoformat(), requiredRemainingSeconds=8689.543088)


def consumer_checks(node,connection,expected_source=None,*,planning=False):
    inputs={**connection,'expectedInitialSourceBindingSHA256':expected_source,'planningWithoutGO':planning}
    p = subprocess.run([str(node),str(BIN/'start-input-checks.js')],input=json.dumps(inputs),capture_output=True,text=True,check=True,timeout=90,
        env={'PATH':os.environ['PATH'],'LANG':'C.UTF-8'})
    return json.loads(p.stdout)


def toolchain(C):
    K=C.I.K
    node=subprocess.run([str(K.NODE_ROOT/'bin/node'),'--version'],capture_output=True,text=True,check=True).stdout.strip()
    require(node=='v24.19.0','exact Node patch required')
    py=subprocess.run([str(K.PYTHON_ROOT/'bin/python'),'--version'],capture_output=True,text=True,check=True).stdout.strip()
    require(py=='Python 3.12.14','exact Python patch required')
    image=json.loads(K.docker(['image','inspect',K.IMAGE]).stdout)[0]
    require(image['Id']==K.IMAGE,'pinned PG image required')
    require(0 in os.sched_getaffinity(0),'original CPU0 must be available')
    require(Path('/sys/fs/cgroup/cgroup.controllers').is_file(),'cgroupv2 required')
    info=json.loads(K.docker(['info','--format','{{json .}}']).stdout)
    require(info['CgroupVersion']=='2' and info['Driver']=='vfs','reviewed Docker/cgroup driver required')
    for file in ['mke2fs','mke2fs.conf']:
        require((Path('/tmp/helmut-meter-filesystem-tools')/file).is_file(),'formatter absent')
    require(Path('/usr/bin/taskset').is_file(),'original taskset missing')
    return dict(node=node,python=py,cgroupVersion='2',imageId=image['Id'],storageDriver=info['Driver'])


def resource_names(C,connection):
    K=C.I.K; case=Path(connection['caseDirectory']); suffix=case.name.removeprefix('attempt-')
    network='helmut-meter-net-w20-'+suffix;parent='helmut-meter-resources'+C.I.A.DAY[-2:]+'-'+suffix
    db=connection['containerName'];names=[db,db.replace('helmut-meter-db-','helmut-meter-app-',1),db.replace('helmut-meter-db-','helmut-meter-app-',1)+'-broker']
    occupied=[n for n in names if K.docker(['inspect',n],check=False).returncode==0]
    network_exists=K.docker(['network','inspect',network],check=False).returncode==0
    cgroup_exists=(Path('/sys/fs/cgroup')/parent).exists()
    storage_exists=(C.I.ONCE.parent/('full500-owned-storage'+C.I.A.DAY[-2:]+'-'+suffix)).exists()
    subnet=connection['approvedInternalSubnet'];require(subnet==C.I.A.SUBNET,'approved subnet changed')
    ids=K.docker(['network','ls','-q']).stdout.split()
    networks=json.loads(K.docker(['network','inspect',*ids]).stdout) if ids else []
    overlaps=[n['Name']for n in networks if any(ipaddress.ip_network(subnet).overlaps(ipaddress.ip_network(p['Subnet']))
        for p in n['IPAM'].get('Config')or[]if p.get('Subnet')and':'not in p['Subnet'])]
    return dict(**{'pass':not(occupied or network_exists or cgroup_exists or storage_exists or overlaps)},
        occupiedContainerNames=occupied,networkExists=network_exists,cgroupExists=cgroup_exists,
        storageOutputExists=storage_exists,overlappingNetworkNames=overlaps,internalSubnet=subnet)


def loop_ready(acceptance):
    minor=acceptance['approvedFreshLoopMinor']
    require(type(minor)is int and 0<=minor<=4095,'exact reviewed minor required')
    device=Path('/sys/block')/('loop'+str(minor));exists=device.is_dir()
    bound=(device/'loop/backing_file').exists()
    # Read-only sysfs is a necessary observation, not a successful future ioctl.
    return dict(**{'pass':exists and not bound},minor=minor,deviceExists=exists,
        observedUnbound=not bound,atomicConfigureStillMandatory=True)


def finish(report,rows):
    # Remove large/private binding values from the public result; inventory has
    # CODE only but lives in a separate optional local report.
    checks=[]
    for c in report.checks:
        c=dict(c)
        if c['id'].startswith('binding.') or c['id']=='dayPin':
            if c['status']=='PASS':c['evidence']={'exactPinVerified':True}
        if c['id']=='guardInventory' and c['status']=='PASS':
            c['evidence']={'files':len(rows),'guardSites':sum(len(r['guards'])for r in rows)}
        checks.append(c)
    ids=[c['id']for c in checks]
    passed=set(ids)==REQUIRED_CHECKS and len(ids)==len(REQUIRED_CHECKS) and all(c['status']=='PASS' for c in checks)
    passed=passed and 0<=time.time()-report.started<=60
    technical_ready=passed
    planning=getattr(report,'planning',False)
    if planning:passed=False # A positive technical plan is NEVER an execution receipt.
    status=('TECHNICALLY_PREPARED_MISSING_NEW_OPERATOR_GO'if technical_ready else'BLOCKED_TECHNICAL_PREREQUISITES')if planning else('READY_FOR_SEPARATE_EXACT_LOCAL_GO'if passed else'BLOCKED_DO_NOT_CONSUME_GO')
    return dict(schema='helmut-complete-local-start-preflight/1',status=status,
        **{'pass':passed}, technicalReady=technical_ready,planningWithoutGO=planning,authorizationStatus='MISSING_NEW_OPERATOR_GO'if planning else('EXPLICIT_GO_VALIDATED'if technical_ready else'GO_NOT_VALIDATED'), checkedAtUnixSeconds=time.time(), startedAtUnixSeconds=report.started,
        checks=checks, consumerInventory=rows, oneTimeGOConsumed=False, activation=False, resourceRunStarted=False,
        bindings=getattr(report,'bindings',{}),
        runtimeOnlyRequired=['Atomic loop/storage/database setup and container identity',
          'Actual cloned inactive snapshot, original activation SQL transaction and genuine native 0-to500 receipt',
          'Generated signing key/public key isolation, service health, exact command and installed original U predecessor',
          'Offline90, installation, Unit60, Auth30, 16 fresh controls for each500, negative cases,500ACK/1500 results',
          'Actual simultaneous kernel memory/CPU, WAL/DB/network/HTTP/logs and final process exit'],
        noPredictionOfFutureRuntimeSuccess=True, production=False)


def assert_complete_shape(report):
    require(report.get('schema')=='helmut-complete-local-start-preflight/1' and report.get('pass') is True
            and report.get('status')=='READY_FOR_SEPARATE_EXACT_LOCAL_GO','complete start preflight is blocked; GO untouched')
    checks=report.get('checks',[]);ids=[c['id']for c in checks]
    require(set(ids)==REQUIRED_CHECKS and len(ids)==len(REQUIRED_CHECKS)
            and all(c['status']=='PASS' for c in checks), 'partial start report rejected')


def assert_ready(report):
    assert_complete_shape(report)
    require(0<=time.time()-report['checkedAtUnixSeconds']<=60,'complete preflight expired')
    require(0<=time.time()-report['startedAtUnixSeconds']<=60,'early observations expired')


def assert_reserved_ready(report,reservation):
    # The full immutable input assessment must be fresh when its ONE exclusive
    # setup reservation consumes it. Setup duration must not expire this proof.
    # Current mutable source/finance/window/DB identity still use the ORIGINAL
    # freshStartPreflight <=60s guard, unchanged, immediately before GO/launch.
    assert_complete_shape(report)
    reserved=datetime.datetime.fromisoformat(reservation['atUTC'].replace('Z','+00:00')).timestamp()
    require(0<=reserved-report['startedAtUnixSeconds']<=60,'complete precheck was stale when reserved')
    require(0<=reserved-report['checkedAtUnixSeconds']<=60,'complete precheck checked after reservation')
    require(report['startedAtUnixSeconds']<=report['checkedAtUnixSeconds']<=reserved<=time.time(),'invalid proof/reservation chronology')


def freeze_ready_report(report):
    """Keep all checked conditions/bindings, not megabytes of repeated AST text.

    Actual reviewed full inventory remains in the host assessment/adoption.
    Runtime gets genuine independently checked CODE bytes/sha, revalidated now,
    and verifies every source again before launch. No bare claimed hash suffices.
    """
    assert_ready(report)
    rows=report['consumerInventory'];require(bool(rows),'complete source inventory missing')
    source_pins=[]
    for row in rows:
        expected={k:row[k]for k in ['path','bytes','sha256']}
        require(pin(row['path'])==expected,'source drift while freezing completed assessment')
        source_pins.append(expected)
    require(len({p['path']for p in source_pins})==len(source_pins),'duplicate assessment source')
    out={k:v for k,v in report.items()if k!='consumerInventory'}
    out['consumerSourcePins']=source_pins
    digest=hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    coverage=next(c for c in report['checks']if c['id']=='completeIndependentCoverage')['evidence']
    require(digest==coverage['inventorySHA256'],'completed assessment differs from independently adopted inventory')
    out['consumerInventorySHA256']=digest
    return out


if __name__=='__main__':
    raise SystemExit('USE full500-controller.py --check-only --accepted-bindings FILE')
