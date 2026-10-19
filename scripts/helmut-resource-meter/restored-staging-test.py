#!/usr/bin/env python3
"""Local staging regressions only. Synthetic material/preflight fixtures are NOT authority."""
import copy, hashlib, importlib.util, json, secrets, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

BIN=Path(__file__).resolve().parent
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,BIN/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
C=load('restored_staging_connector','connect-local500.py')
F=load('restored_staging_finisher','finish-connection.py')
P=load('restored_staging_preflight','start-preflight.py')

class RestoredStagingTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='TEST_ONLY_restore_staging_',dir=C.BASE)
        self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.case=self.root/'attempt-0123456789ab'
        self.secret='a'*64
        self.secret_pin=self.save('jwt-secret.PRIVATE.txt',self.secret)
        self.config=self.config_text()
        self.config_pin=self.save('postgrest.PRIVATE.conf',self.config)
        # Explicit synthetic shape fixture. Never supplied to a controller,
        # claimed as a native observation, or retained as operational acceptance.
        self.preflight=self.save('TEST_ONLY_PREFLIGHT.json',{
            'schema':'helmut-restored-original-resource-preflight/1',
            'status':'ACTUAL_RESTORED_FROZEN_SOURCE_READONLY_VERIFIED',
            'TEST_ONLY_NOT_AUTHORITY':True,
            'verifiedReadOnly':{'originalInputPins':[self.secret_pin],
                                'frozenSourceDatabase':{'TEST_ONLY':True}}})
        self.inputs={'schema':C.RESTORE_SCHEMA,'originalPreflight':self.preflight,
                     'jwtSecret':self.secret_pin,'sourcePostgrestConfig':self.config_pin}
        for key,(name,size,digest)in C.RESTORE_TEMPLATES.items():
            self.inputs[key]={'path':str(C.BASE/'wave20-resource-integration/attempt-a2521b52a505'/name),
                              'bytes':size,'sha256':digest}
        self.manifest=self.save('RESTORED_INPUTS.SAFE.json',self.inputs)
        self.args={'target':'helmut_resource_fixture_20261019_0123456789ab',
            'container':'helmut-meter-db-w20-0123456789ab','operation':'synthetik500-resources19-0123456789ab',
            'day_rows_pin':{'path':str(self.root/'NOT_CREATED_ROWS')},
            'owner_go_pin':{'path':str(self.root/'NEVER_CREATED_GO')}}

    def save(self,name,value):
        p=self.root/name
        p.write_text(value if isinstance(value,str)else json.dumps(value))
        p.chmod(0o600);return C.pin(p)

    def config_text(self):
        return ('db-uri = "postgresql://authenticator@/helmut_u_start_fixture_005821f5?host=/var/run/postgresql"\n'
            'db-schemas = "public"\ndb-anon-role = "anon"\nserver-host = "0.0.0.0"\nserver-port = 38410\n'
            'db-pool = 2\nlog-level = "error"\njwt-secret = '+json.dumps(self.secret)+'\n')

    def manifest_for(self,changes):
        return self.save('RESTORED_INPUTS.SAFE.json',{**self.inputs,**changes})

    def test_all26_real_templates_replay_and_preserve_guards(self):
        plain=C.render_templates(self.case,**self.args)
        rows=C.render_templates(self.case,**self.args,restore_staging_inputs=self.manifest)
        self.assertEqual(len(rows),26)
        modified={Path(a['destination']).relative_to(self.case).as_posix()for a,b in zip(rows,plain)if a['text']!=b['text']}
        self.assertEqual(modified,{'assemble-after-activation.js','native-end-preparation/runtime-candidates/start-services.candidate.js'})
        for row in rows:
            source=Path(row['original']['path']).read_text()
            for delta in row['replacements']:
                self.assertEqual(source.count(delta['from']),delta['count']);source=source.replace(delta['from'],delta['to'])
            self.assertEqual(source,row['text']);self.assertEqual(C.pin(row['original']['path']),row['original'])
        files={Path(row['destination']).relative_to(self.case).as_posix():row['text']for row in rows}
        assembly=files['assemble-after-activation.js'];service=files['native-end-preparation/runtime-candidates/start-services.candidate.js']
        for pin in [self.secret_pin,self.config_pin]:self.assertIn(pin['path'],assembly)
        self.assertNotIn("B+'/wave2/db_proof_path/jwt-secret.PRIVATE.txt'",assembly)
        self.assertNotIn("B+'/wave9/native-fixture/postgrest.PRIVATE.conf'",assembly)
        self.assertIn(self.config_pin['sha256'],service)
        for guard in ['helmut_u_start_fixture_005821f5','server-port = 38410','server-port = 38414',
                      '870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617','/^172\\.']:
            self.assertIn(guard,service)
        self.assertNotIn(self.secret,assembly);self.assertNotIn(self.secret,service)
        result=subprocess.run(['node','-e',"for(const s of JSON.parse(require('fs').readFileSync(0,'utf8')))new(require('vm').Script)(s)"],
            input=json.dumps([r['text']for r in rows if r['destination'].endswith('.js')]),text=True,capture_output=True)
        self.assertEqual(result.returncode,0)
        self.assertFalse(self.case.exists())

    def test_manifest_drift_extra_fields_template_and_preflight_are_rejected(self):
        for changes in [{'extra':True},{'runtimeRequestTemplate':{**self.inputs['runtimeRequestTemplate'],'sha256':'0'*64}},
                        {'originalPreflight':self.save('BAD_PREFLIGHT.json',{'verifiedReadOnly':{}})}]:
            with self.subTest(changes=tuple(changes)),self.assertRaises(RuntimeError):
                C.read_restored_staging_inputs(self.manifest_for(changes),self.case)
        self.manifest=self.manifest_for({})
        with self.assertRaises(RuntimeError):C.read_restored_staging_inputs({**self.manifest,'sha256':'0'*64},self.case)

    def test_control_descriptor_and_restored_materials_combine_in_all26(self):
        code="process.stdout.write(JSON.stringify(require(process.argv[1]).descriptor({stateStorage:'merkle-auth-v1',historyReadReuse:'verified-history-reuse-v1',controlRead:'verified-control-view-v1'})))"
        descriptor=json.loads(subprocess.check_output(['node','-e',code,str(BIN/'atomic-usage-integration.js')],text=True))
        candidate=self.save('ATOMIC_CONTROL.SAFE.json',descriptor)
        rows=C.render_templates(self.case,**self.args,atomic_usage_pin=candidate,restore_staging_inputs=self.manifest)
        self.assertEqual(len(rows),26)
        for row in rows:
            source=Path(row['original']['path']).read_text()
            for delta in row['replacements']:
                self.assertEqual(source.count(delta['from']),delta['count']);source=source.replace(delta['from'],delta['to'])
            self.assertEqual(source,row['text'])
        files={Path(row['destination']).relative_to(self.case).as_posix():row['text']for row in rows}
        self.assertIn("process.env.HELMUT_AUTH_CONTROL_READ='verified-control-view-v1'",files['assemble-after-activation.js'])
        self.assertIn(self.secret_pin['path'],files['assemble-after-activation.js'])
        self.assertIn(self.config_pin['sha256'],files['native-end-preparation/runtime-candidates/start-services.candidate.js'])
        proc=subprocess.run(['node','-e',"for(const s of JSON.parse(require('fs').readFileSync(0,'utf8')))new(require('vm').Script)(s)"],
            input=json.dumps([r['text']for r in rows if r['destination'].endswith('.js')]),text=True,capture_output=True)
        self.assertEqual(proc.returncode,0)

    def test_private_canonical_outside_case_inputs_are_required(self):
        for mode in [0o644,0o660]:
            Path(self.secret_pin['path']).chmod(mode)
            with self.assertRaises(RuntimeError):C.read_restored_staging_inputs(self.manifest,self.case)
        Path(self.secret_pin['path']).chmod(0o600)
        with self.assertRaises(RuntimeError):C.read_restored_staging_inputs(self.manifest,self.root)
        link=self.root/'alias';link.symlink_to(self.root)
        bad={**self.secret_pin,'path':str(link/'jwt-secret.PRIVATE.txt')}
        with self.assertRaises(RuntimeError):C.read_restored_staging_inputs(self.manifest_for({'jwtSecret':bad}),self.case)

    def test_wrong_secret_uri_port_and_unexpected_config_fail_closed(self):
        for text in [self.config.replace(self.secret,'b'*64),self.config.replace('38410','38414'),
                     self.config.replace('postgresql://authenticator@/','postgresql://authenticator@external/'),
                     self.config.replace('db-pool = 2\n',''),self.config.replace('log-level = "error"\n',''),
                     self.config+'db-pre-request = "unexpected"\n',self.config+'server-port = 38410\n']:
            bad=self.save('postgrest.PRIVATE.conf',text)
            with self.subTest(case=hashlib.sha256(text.encode()).hexdigest()),self.assertRaises(RuntimeError):
                C.read_restored_staging_inputs(self.manifest_for({'sourcePostgrestConfig':bad}),self.case)
        self.save('postgrest.PRIVATE.conf',self.config)
        bad=self.save('jwt-secret.PRIVATE.txt','short')
        with self.assertRaises(RuntimeError):C.read_restored_staging_inputs(self.manifest_for({'jwtSecret':bad}),self.case)

    def test_optional_environment_and_jwt_header_signature_binding(self):
        code="const c=require('crypto'),b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const u=b({alg:'HS256',typ:'JWT'})+'.'+b({role:'service_role'});process.stdout.write(u+'.'+c.createHmac('sha256',process.argv[1]).update(u).digest('base64url'));"
        token=subprocess.check_output(['node','-e',code,self.secret],text=True)
        env={'scope':'FICTIONAL_LOCAL_ONLY','HELMUT_TESTLAUF_KOMMUNIKATION':'gesperrt','SUPABASE_SERVICE_ROLE_KEY':token}
        ep=self.save('EXECUTION_ENV.PRIVATE.json',env)
        mp=self.manifest_for({'executionEnvironment':ep})
        C.read_restored_staging_inputs(mp,self.case)
        rows=C.render_templates(self.case,**self.args,restore_staging_inputs=mp)
        self.assertTrue(any(ep['path']in row['text']for row in rows))
        signature=token.split('.')[2];bad_signature=('A'if signature[0]!='A'else'B')+signature[1:]
        for changed in [token.rsplit('.',1)[0]+'.'+bad_signature,'bad',token.replace(token.split('.')[0],'e30')]:
            ep=self.save('EXECUTION_ENV.PRIVATE.json',{**env,'SUPABASE_SERVICE_ROLE_KEY':changed})
            with self.assertRaises(RuntimeError):C.read_restored_staging_inputs(self.manifest_for({'executionEnvironment':ep}),self.case)

    def test_runtime_service_consumer_uses_same_new_pin_and_secret(self):
        capture=C.read_pin(C.pin(C.A.CORRECTED_CAPTURE))
        plan={'restoreStagingInputs':self.manifest,'applicationReadOnlyPins':[self.config_pin,self.secret_pin],
              'databaseReadOnlyPins':[capture['postgrestBinary']],'targetDatabase':self.args['target'],
              'workflowDirectory':str(self.case/'native-end-preparation')}
        code="require(process.argv[1]).servicesInputs(JSON.parse(require('fs').readFileSync(0,'utf8')));"
        proc=subprocess.run(['node','-e',code,str(BIN/'start-input-checks.js')],input=json.dumps(plan),text=True,capture_output=True)
        self.assertEqual(proc.returncode,0)
        bad=copy.deepcopy(plan);bad['applicationReadOnlyPins'][0]['sha256']='0'*64
        proc=subprocess.run(['node','-e',code,str(BIN/'start-input-checks.js')],input=json.dumps(bad),text=True,capture_output=True)
        self.assertNotEqual(proc.returncode,0)

    def test_actual_unauthorized_stage_finish_and_preflight_replay(self):
        suffix=self.case.name.removeprefix('attempt-')
        capture=C.pin(C.A.CORRECTED_CAPTURE)
        owner={'schema':'helmut-owner-local-fixture-intent/1','authorized':False,
            'allowDispose':False,'production':False,'syntheticProfiles':500,'paidProviderCallsAllowed':False,
            'exactlyOneResourceAttempt':True,'resourceOnly':True,'authorizationId':C.A.AUTHORIZATION,
            'targetDatabase':self.args['target'],'operationId':self.args['operation'],'caseDirectory':str(self.case),
            'sourceCapturePin':capture,'correctedSourceCapturePath':capture['path'],
            'previousConsumedMarkers':C.A.PRESERVED_MARKER_PINS,
            'finalOwnerGOPath':str(C.A.METER/f'OWNER_RESOURCE19_V{C.A.SLOT_VERSION}_{suffix}.PRIVATE.json'),
            'requiredConfirmation':'GO_LOCAL_ONLY_CREATE_'+self.args['target']+'_AND_ACTIVATE_EXACTLY500_SYNTHETIC_ONCE'}
        intent=self.save('TEST_ONLY_UNAUTHORIZED_INTENT.json',owner)
        day=C.pin(C.BASE/'wave38-resource-readiness/ROOT_DAY19_RUNTIME_BINDING_ACCEPTANCE.SAFE.json')
        day_doc=C.read_pin(day);args={**self.args,'owner_go_pin':intent,'day_rows_pin':day_doc['adoptedRowsPin']}
        with patch.object(C,'AREA',self.root):
            staged=C.stage(self.case,**args,day_acceptance_pin=day,prepare_only=True,restore_staging_inputs=self.manifest)
        self.assertTrue(staged['preparedWithoutGO']);self.assertEqual(staged['restoreStagingInputs'],self.manifest)
        finished=F.finish(C.pin(self.case/'STAGED_CONNECTION.SAFE.json'))
        connection=C.read_pin(finished['connection']);request=C.read_pin(connection['runtimeRequest'])
        self.assertEqual(connection['restoreStagingInputs'],self.manifest)
        self.assertEqual(connection['originalPreflightPin'],self.preflight)
        self.assertNotIn('atomicUsageInput',request)
        assets={p['path']:p for p in connection['applicationReadOnlyPins']}
        for pin in [self.manifest,self.preflight,self.secret_pin,self.config_pin]:self.assertEqual(assets[pin['path']],pin)
        self.assertNotIn(str(C.BASE/'wave2/db_proof_path/jwt-secret.PRIVATE.txt'),assets)
        self.assertFalse(Path(owner['finalOwnerGOPath']).exists())
        self.assertFalse(connection['resourceGOConsumed']);self.assertFalse(connection['full500RunStarted'])
        self.assertEqual(P.template_replay(connection),{'exactReplayedConsumers':26})
        with self.assertRaises(RuntimeError):P.template_replay({**connection,'restoreStagingInputs':{**self.manifest,'sha256':'0'*64}})
        with self.assertRaises(RuntimeError):F.finish(C.pin(self.case/'STAGED_CONNECTION.SAFE.json'))

if __name__=='__main__':unittest.main()
