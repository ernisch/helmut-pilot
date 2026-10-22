#!/usr/bin/env python3
"""TEST_ONLY fixtures: no GitHub requests, real review grants, private inputs or GO."""
import copy
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('private_ci_channel', HERE / 'private_ci_channel.py')
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)


def fixtures():
    ctx = dict(repository=C.REPO, event='pull_request', runID=123, runAttempt=1,
        ref='refs/pull/1/merge', headSHA='d' * 40, checkoutSHA='c' * 40,
        workflowSHA='c' * 40, prNumber=1, manifestSHA256=C.MANIFEST_SHA,
        transportSHA256='TEST_ONLY_NOT_A_TRANSPORT_PIN')
    run = dict(id=123, head_sha='d' * 40, event='pull_request', run_attempt=1,
               path='.github/workflows/ci.yml')
    reviews = [dict(state='approved', user=dict(login=C.REVIEWER, id=C.REVIEWER_ID),
                    environments=[dict(name=C.ENVIRONMENT, id=42)])]
    pr = dict(state='open', number=1, head=dict(sha='d' * 40, repo=dict(full_name=C.REPO)),
              merge_commit_sha='c' * 40)
    return ctx, run, reviews, pr


def owner_fixtures():
    ctx, run, _, pr = fixtures()
    repo = dict(full_name=C.REPO, id=C.REPO_ID, fork=False)
    actor = dict(login=C.REVIEWER, id=C.REVIEWER_ID)
    run.update(repository=copy.deepcopy(repo), head_repository=copy.deepcopy(repo),
               actor=copy.deepcopy(actor), triggering_actor=copy.deepcopy(actor),
               head_branch='feature/TEST_ONLY_owner')
    pr.update(user=copy.deepcopy(actor), base=dict(repo=copy.deepcopy(repo)))
    pr['head'].update(repo=copy.deepcopy(repo), ref=run['head_branch'])
    return ctx, run, pr


class OwnerAccessTests(unittest.TestCase):
    def test_default_automatic_policy_and_explicit_manual_policy(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(C.access_policy(), C.AUTOMATIC_POLICY)
        with mock.patch.dict(os.environ, {'HELMUT_CI_ORIGINALS_ACCESS_POLICY': 'manual'}, clear=True):
            self.assertEqual(C.access_policy(), 'manual')

    def test_automatic_check_uses_actual_run_and_pr_api_without_review_api(self):
        ctx, run, pr = owner_fixtures()
        responses = {'/actions/runs/123': run, '/pulls/1': pr}
        with tempfile.TemporaryDirectory() as directory, \
                mock.patch.dict(os.environ, {}, clear=True), \
                mock.patch.object(C, 'context', return_value=ctx), \
                mock.patch.object(C, 'load_transport'), \
                mock.patch.object(C, 'api', side_effect=lambda path: responses[path]) as api:
            receipt = Path(directory) / 'TEST_ONLY_receipt.json'
            result = C.check_approval(receipt)
            self.assertEqual([call.args[0] for call in api.call_args_list], list(responses))
            self.assertEqual(json.loads(receipt.read_text()), result)
            self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError): C.check_approval(receipt)
        self.assertNotIn('reviewer', result)
        self.assertNotIn('environmentID', result)
        self.assertEqual(result['accessPolicy'], C.AUTOMATIC_POLICY)
        self.assertIs(result['executionGO'], False)
        self.assertIs(result['ciPassed'], False)

    def test_explicit_manual_check_still_requires_actual_personal_review(self):
        ctx, run, reviews, pr = fixtures()
        responses = {'/actions/runs/123': run, '/actions/runs/123/approvals': [], '/pulls/1': pr}
        with mock.patch.dict(os.environ, {'HELMUT_CI_ORIGINALS_ACCESS_POLICY': 'manual'}, clear=True), \
                mock.patch.object(C, 'context', return_value=ctx), \
                mock.patch.object(C, 'load_transport'), \
                mock.patch.object(C, 'api', side_effect=lambda path: responses[path]), \
                mock.patch.object(C, 'save') as save:
            with self.assertRaises(RuntimeError): C.check_approval(Path('/TEST_ONLY_receipt'))
            save.assert_not_called()
            responses['/actions/runs/123/approvals'] = reviews
            result = C.check_approval(Path('/TEST_ONLY_receipt'))
            self.assertEqual(result['schema'], 'helmut-private-ci-reviewed-access/1')
            self.assertEqual(result['reviewer'], C.REVIEWER)

    def test_unknown_policy_rejects_before_any_api_or_provisioning(self):
        for value in ['', ' ', 'automatic', 'OWNER-AUTOMATIC-V1', 'TEST_ONLY_PRIVATE_VALUE']:
            with self.subTest(value=value), \
                    mock.patch.dict(os.environ, {'HELMUT_CI_ORIGINALS_ACCESS_POLICY': value}, clear=True), \
                    mock.patch.object(C, 'context') as context, \
                    mock.patch.object(C, 'read_file') as read, \
                    mock.patch.object(C, 'api') as api:
                with self.assertRaises(RuntimeError): C.check_approval(Path('/TEST_ONLY_receipt'))
                with self.assertRaises(RuntimeError): C.provision(Path('/TEST_ONLY_receipt'))
                context.assert_not_called(); read.assert_not_called(); api.assert_not_called()

    def test_other_actor_trigger_repository_run_and_branch_are_rejected(self):
        mutations = [
            lambda r: r['actor'].update(login='TEST_ONLY_other'),
            lambda r: r['actor'].update(id=1),
            lambda r: r['triggering_actor'].update(login='TEST_ONLY_other'),
            lambda r: r['triggering_actor'].update(id=1),
            lambda r: r['repository'].update(full_name='TEST_ONLY/fork'),
            lambda r: r['repository'].update(id=1),
            lambda r: r['head_repository'].update(full_name='TEST_ONLY/fork'),
            lambda r: r['head_repository'].update(id=1),
            lambda r: r.update(id=124), lambda r: r.update(run_attempt=2),
            lambda r: r.update(head_sha='e' * 40), lambda r: r.update(event='push'),
            lambda r: r.update(path='.github/workflows/other.yml'),
            lambda r: r.update(head_branch='TEST_ONLY_other')]
        for index, change in enumerate(mutations):
            with self.subTest(case=index):
                ctx, run, pr = owner_fixtures(); change(run)
                with self.assertRaises(RuntimeError): C.validate_owner_access(ctx, run, pr)

    def test_fork_foreign_author_closed_or_advanced_pr_are_rejected(self):
        mutations = [
            lambda p: p['user'].update(login='TEST_ONLY_other'),
            lambda p: p['user'].update(id=1),
            lambda p: p['head']['repo'].update(full_name='TEST_ONLY/fork'),
            lambda p: p['head']['repo'].update(id=1),
            lambda p: p['head']['repo'].update(fork=True),
            lambda p: p['head']['repo'].pop('fork'),
            lambda p: p['base']['repo'].update(full_name='TEST_ONLY/fork'),
            lambda p: p['base']['repo'].update(id=1),
            lambda p: p.update(state='closed'), lambda p: p.update(number=2),
            lambda p: p.update(number=True), lambda p: p['head'].update(sha='e' * 40),
            lambda p: p.update(merge_commit_sha='e' * 40),
            lambda p: p['head'].update(ref='TEST_ONLY_other'), lambda p: p['head'].update(ref='')]
        for index, change in enumerate(mutations):
            with self.subTest(case=index):
                ctx, run, pr = owner_fixtures(); change(pr)
                with self.assertRaises(RuntimeError): C.validate_owner_access(ctx, run, pr)

    def test_missing_or_malformed_owner_metadata_is_rejected(self):
        for key in ['actor', 'triggering_actor', 'repository', 'head_repository',
                    'head_branch', 'path', 'head_sha', 'event', 'run_attempt', 'id']:
            with self.subTest(runKey=key):
                ctx, run, pr = owner_fixtures(); run.pop(key)
                with self.assertRaises(RuntimeError): C.validate_owner_access(ctx, run, pr)
        for key in ['user', 'head', 'base', 'number', 'merge_commit_sha']:
            with self.subTest(prKey=key):
                ctx, run, pr = owner_fixtures(); pr.pop(key)
                with self.assertRaises(RuntimeError): C.validate_owner_access(ctx, run, pr)
        for key, value in [('repository', 'TEST_ONLY/fork'), ('ref', 'refs/pull/2/merge'),
                           ('runAttempt', True), ('prNumber', True), ('workflowSHA', 'e' * 40),
                           ('headSHA', 'g' * 40), ('event', 'pull_request_target')]:
            with self.subTest(contextKey=key):
                ctx, run, pr = owner_fixtures(); ctx[key] = value
                with self.assertRaises(RuntimeError): C.validate_owner_access(ctx, run, pr)

    def test_only_main_push_and_dispatch_have_automatic_access(self):
        for event in ['push', 'workflow_dispatch']:
            ctx, run, _ = owner_fixtures()
            ctx.update(event=event, prNumber=None, ref='refs/heads/main', headSHA=ctx['checkoutSHA'])
            run.update(event=event, head_branch='main', head_sha=ctx['headSHA'])
            self.assertEqual(C.validate_owner_access(ctx, run)['accessPolicy'], C.AUTOMATIC_POLICY)
            for update in [{'ref': 'refs/heads/TEST_ONLY_other'}, {'headSHA': 'e' * 40}, {'prNumber': 1}]:
                changed = {**ctx, **update}
                observed = {**run, 'head_sha': changed['headSHA']}
                with self.subTest(event=event, update=update), self.assertRaises(RuntimeError):
                    C.validate_owner_access(changed, observed)
            with self.assertRaises(RuntimeError): C.validate_owner_access(ctx, {**run, 'head_branch': 'TEST_ONLY_other'})

    def test_manual_and_automatic_receipts_are_not_interchangeable(self):
        ctx, run, pr = owner_fixtures()
        automatic = C.validate_owner_access(ctx, run, pr)
        manual = C.validate_review(*fixtures())
        self.assertEqual(C.validate_receipt(automatic, ctx, C.AUTOMATIC_POLICY), automatic)
        self.assertEqual(C.validate_receipt(manual, ctx, 'manual'), manual)
        for receipt, policy in [(automatic, 'manual'), (manual, C.AUTOMATIC_POLICY)]:
            with self.assertRaises(RuntimeError): C.validate_receipt(receipt, ctx, policy)

    def test_receipt_drift_rejected_before_transport_import_or_key_consumption(self):
        ctx, run, pr = owner_fixtures(); approved = C.validate_owner_access(ctx, run, pr)
        changes = [{'runID': 124}, {'runAttempt': 2}, {'runAttempt': True},
                   {'headSHA': 'e' * 40}, {'checkoutSHA': 'e' * 40}, {'environment': 'TEST_ONLY_other'},
                   {'authorizedActor': 'TEST_ONLY_other'}, {'authorizedActorID': 1},
                   {'accessPolicy': 'manual'}, {'executionGO': True}, {'ciPassed': True},
                   {'reviewer': C.REVIEWER}, {'schema': 'helmut-private-ci-reviewed-access/1'}]
        for update in changes:
            with self.subTest(update=update), \
                    mock.patch.dict(os.environ, {'HELMUT_CI_ORIGINALS_KEY': 'TEST_ONLY_NOT_A_KEY'}, clear=True), \
                    mock.patch.object(C, 'context', return_value=ctx), \
                    mock.patch.object(C, 'read_file', return_value=json.dumps({**approved, **update}).encode()), \
                    mock.patch.object(C, 'load_transport') as transport, \
                    mock.patch.object(C.subprocess, 'run') as child:
                with self.assertRaises(RuntimeError): C.provision(Path('/TEST_ONLY_receipt'))
                transport.assert_not_called(); child.assert_not_called()
                self.assertEqual(os.environ['HELMUT_CI_ORIGINALS_KEY'], 'TEST_ONLY_NOT_A_KEY')

    def test_workflow_binds_same_policy_before_check_and_decryption(self):
        text = (HERE.parents[1] / '.github/workflows/ci.yml').read_text()
        offline = text.split('  offline-suite:', 1)[1].split('  browser-smoke:', 1)[0]
        bound = [block for block in offline.split('      - name:')
                 if 'HELMUT_CI_ORIGINALS_ACCESS_POLICY' in block]
        self.assertEqual(len(bound), 2)
        for block in bound:
            self.assertIn("HELMUT_CI_ORIGINALS_ACCESS_POLICY: ${{ vars.HELMUT_CI_ORIGINALS_ACCESS_POLICY || 'owner-automatic-v1' }}", block)
        self.assertIn('check-approval', bound[0])
        self.assertIn('provision --receipt', bound[1])


class ReviewTests(unittest.TestCase):
    def test_test_only_binding_has_no_execution_or_ci_verdict(self):
        result = C.validate_review(*fixtures())
        self.assertEqual(result['headSHA'], 'd' * 40)
        self.assertEqual(result['checkoutSHA'], 'c' * 40)
        self.assertEqual(result['reviewer'], C.REVIEWER)
        self.assertIs(result['executionGO'], False)
        self.assertIs(result['ciPassed'], False)

    def test_missing_review_is_rejected(self):
        ctx, run, _, pr = fixtures()
        with self.assertRaises(RuntimeError): C.validate_review(ctx, run, [], pr)

    def test_rejected_review_cannot_be_replayed(self):
        ctx, run, reviews, pr = fixtures()
        reviews.append({**reviews[0], 'state': 'rejected'})
        with self.assertRaises(RuntimeError): C.validate_review(ctx, run, reviews, pr)

    def test_review_identity_environment_and_state_are_bound(self):
        mutations = [lambda r: r.update(state='pending'),
            lambda r: r['user'].update(login='another-reviewer'),
            lambda r: r['user'].update(id=1),
            lambda r: r['environments'][0].update(name='unprotected'),
            lambda r: r['environments'][0].update(id=0),
            lambda r: r.update(environments=[])]
        for change in mutations:
            with self.subTest(change=mutations.index(change)):
                ctx, run, reviews, pr = fixtures(); change(reviews[0])
                with self.assertRaises(RuntimeError): C.validate_review(ctx, run, reviews, pr)

    def test_run_and_attempt_are_bound(self):
        for key, value in [('id', 124), ('run_attempt', 2), ('event', 'push'),
                           ('head_sha', 'e' * 40), ('path', '.github/workflows/another.yml')]:
            with self.subTest(key=key):
                ctx, run, reviews, pr = fixtures(); run[key] = value
                with self.assertRaises(RuntimeError): C.validate_review(ctx, run, reviews, pr)

    def test_pr_number_state_head_checkout_and_repository_are_bound(self):
        mutations = [lambda p: p.update(number=2), lambda p: p.update(state='closed'),
            lambda p: p['head'].update(sha='e' * 40),
            lambda p: p.update(merge_commit_sha='e' * 40),
            lambda p: p['head']['repo'].update(full_name='untrusted/fork')]
        for change in mutations:
            with self.subTest(change=mutations.index(change)):
                ctx, run, reviews, pr = fixtures(); change(pr)
                with self.assertRaises(RuntimeError): C.validate_review(ctx, run, reviews, pr)

    def test_host_execution_rejects_before_api(self):
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(C, 'api') as api:
            with self.assertRaises(RuntimeError): C.check_approval(Path('/not-written.json'))
            api.assert_not_called()

    def test_failure_diagnostic_exposes_only_public_source_coordinates(self):
        out = io.StringIO()
        with mock.patch.dict(os.environ, {}, clear=True), \
             mock.patch.object(sys, 'argv', ['channel', 'check-approval', '--receipt', '/not-written.json']), \
             mock.patch.object(C, 'api') as api, redirect_stdout(out):
            self.assertEqual(C.main(), 1)
        value = json.loads(out.getvalue())
        self.assertEqual(value['location']['function'], 'context')
        self.assertGreater(value['location']['line'], 0)
        self.assertEqual(set(value['location']), {'function', 'line'})
        self.assertIs(value['ciPassed'], False)
        api.assert_not_called()
        out = io.StringIO()
        with mock.patch.object(sys, 'argv', ['channel', 'check-approval', '--receipt', '/not-written.json']), \
             mock.patch.object(C, 'check_approval', side_effect=RuntimeError('TEST_ONLY_PRIVATE_MESSAGE')), \
             redirect_stdout(out):
            self.assertEqual(C.main(), 1)
        self.assertNotIn('TEST_ONLY_PRIVATE_MESSAGE', out.getvalue())
        self.assertEqual(json.loads(out.getvalue())['location']['function'], 'main')

    def test_public_context_inspection_has_no_api_or_approval_receipt(self):
        out = io.StringIO()
        with mock.patch.object(sys, 'argv', ['channel', 'inspect-context']), \
             mock.patch.object(C, 'context', return_value={'TEST_ONLY': True}), \
             mock.patch.object(C, 'load_transport') as transport, mock.patch.object(C, 'api') as api, \
             mock.patch.object(C, 'save') as save, redirect_stdout(out):
            self.assertEqual(C.main(), 0)
        transport.assert_called_once()
        api.assert_not_called()
        save.assert_not_called()
        value = json.loads(out.getvalue())
        self.assertIs(value['ciPassed'], False)
        self.assertIs(value['executionGO'], False)

    def test_real_public_transport_pin(self):
        value = C.load_transport()
        self.assertEqual(value['files'], 84)
        self.assertEqual(value['manifestSHA256'], C.MANIFEST_SHA)

    def test_transport_pin_drift_rejected(self):
        with mock.patch.object(C, 'TRANSPORT_SHA', '0' * 64):
            with self.assertRaises(RuntimeError): C.load_transport()

    def test_public_cipher_matches_transport_pin(self):
        pin = C.load_transport()['cipher']
        data = C.read_file(HERE.parents[1] / pin['path'], C.MAX_BYTES)
        self.assertEqual(len(data), pin['bytes'])
        self.assertEqual(C.sha(data), pin['sha256'])

    def test_workflow_covers_private_steps_and_preserves_required_job(self):
        text = (HERE.parents[1] / '.github/workflows/ci.yml').read_text()
        offline = text.split('  offline-suite:', 1)[1].split('  browser-smoke:', 1)[0]
        private = offline.split('      - name: Ressourcenstart und Originalbindungen', 1)[1].split('      - name: Private Diagnoseausgaben', 1)[0]
        self.assertEqual(private.count('        shell:'), private.count('        run:'))
        self.assertEqual(private.count('        shell:'), 21)
        shell_lines = [line for line in private.splitlines() if line.startswith('        shell:')]
        self.assertEqual(len(shell_lines), 21)
        for line in shell_lines:
            self.assertEqual(line.strip(), "shell: 'python3 scripts/helmut-resource-meter/private_ci_shell.py {0}'")
        self.assertNotIn('shell: ${{', text)
        self.assertIn('HELMUT_CI_PRIVATE_LOGS: ${{ needs.plan.outputs.standard }}', offline)
        self.assertIn('name: Syntax + Offline-Suiten', offline)
        self.assertIn('if: ${{ !cancelled() }}', offline)
        self.assertNotIn('if: ${{ always() }}', offline.split('    steps:', 1)[0])
        self.assertIn('run: test "$PLAN_RESULT" = success', offline)
        self.assertIn("needs.plan.result == 'success' && needs.plan.outputs.standard", offline)
        self.assertIn('private_ci_channel.py inspect-context', text.split('  offline-suite:')[0])
        public = text.split('  offline-suite:')[0]
        self.assertIn('Oeffentliche Codebindungen vor privater Freigabe pruefen', public)
        self.assertIn('scripts/synthetik-500-runtime-artifact-attestation-test.js', public)
        self.assertIn("require('./scripts/helmut-resource-meter/atomic-usage-integration.js').CONTROL_SOURCE_ACCEPTANCE", public)
        self.assertNotIn('.descriptor(', public)
        self.assertIn('fs.openSync=function', public)
        self.assertIn('untracked read descriptor', public)
        self.assertNotIn('secrets.HELMUT_CI_ORIGINALS_KEY', public)
        self.assertIn('fs.realpathSync(p)===p', public)
        self.assertEqual(text.count('secrets.HELMUT_CI_ORIGINALS_KEY'), 2)
        self.assertIn('path: ${{ runner.temp }}/helmut-ci-private-logs.tar.gz.gpg', offline)
        self.assertNotIn('.PRIVATE.txt', text)

    def test_actual_public_preflight_rejects_leaf_parent_symlinks_and_untracked_descriptors(self):
        repo = HERE.parents[1]
        public = (repo / '.github/workflows/ci.yml').read_text().split('  offline-suite:')[0]
        raw = public.split("          node - <<'JS'\n", 1)[1].split('          JS\n', 1)[0]
        code = '\n'.join(line[10:] for line in raw.splitlines()) + '\n'
        with tempfile.TemporaryDirectory(prefix='helmut-public-outside-') as outside, \
                tempfile.TemporaryDirectory(prefix='.helmut-public-scope-', dir=repo) as inside:
            marker = Path(outside) / 'marker'
            marker.write_text('TEST_ONLY_SCOPE_SENTINEL')
            leaf = Path(inside) / 'leaf'
            leaf.symlink_to(marker)
            parent = Path(inside) / 'parent'
            parent.symlink_to(outside, target_is_directory=True)
            negative = """
for(const file of process.argv.slice(2)){
 assert.throws(()=>fs.readFileSync(file),/public checkout regular files only/);
 assert.throws(()=>fs.openSync(file,'r'),/public checkout regular files only/);
}
assert.throws(()=>fs.readFileSync(0),/untracked read descriptor/);
"""
            result = subprocess.run(['node', '-', str(leaf), str(parent / 'marker')],
                                    input=code + negative, cwd=repo, env=C.child_env(),
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn('TEST_ONLY_SCOPE_SENTINEL', result.stdout + result.stderr)

    def test_children_cannot_inherit_key_or_github_token(self):
        with mock.patch.dict(os.environ, {'HELMUT_CI_ORIGINALS_KEY': 'TEST_ONLY',
                                         'GITHUB_TOKEN': 'TEST_ONLY', 'SUPABASE_SERVICE_ROLE_KEY': 'TEST_ONLY'}):
            values = C.child_env()
            self.assertNotIn('HELMUT_CI_ORIGINALS_KEY', values)
            self.assertNotIn('GITHUB_TOKEN', values)
            self.assertNotIn('SUPABASE_SERVICE_ROLE_KEY', values)


class FileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='helmut-private-ci-test-')
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def test_private_regular_read(self):
        file = self.root / 'input'; file.write_bytes(b'TEST_ONLY'); file.chmod(0o600)
        self.assertEqual(C.read_file(file, 10, private=True), b'TEST_ONLY')

    def test_test_only_dispatch_context_permits_only_main(self):
        event = self.root / 'TEST_ONLY-event.json'; event.write_text('{}')
        for ref in ['refs/heads/main', 'refs/heads/codex/fixture', 'refs/tags/fixture']:
            env = dict(GITHUB_ACTIONS='true', GITHUB_REPOSITORY=C.REPO,
                GITHUB_API_URL='https://api.github.com', GITHUB_EVENT_NAME='workflow_dispatch',
                GITHUB_RUN_ID='123', GITHUB_RUN_ATTEMPT='1', GITHUB_SHA='c'*40,
                GITHUB_WORKFLOW_SHA='c'*40, GITHUB_REF=ref, GITHUB_EVENT_PATH=str(event),
                GITHUB_WORKFLOW_REF=C.REPO+'/.github/workflows/ci.yml@'+ref)
            with self.subTest(ref=ref), mock.patch.dict(os.environ, env, clear=True), \
                 mock.patch.object(C.subprocess, 'run', return_value=SimpleNamespace(stdout='c'*40+'\n')), \
                 mock.patch.object(C, 'api') as api:
                if ref == 'refs/heads/main': self.assertEqual(C.context()['ref'], ref)
                else:
                    with self.assertRaises(RuntimeError): C.context()
                api.assert_not_called()

    def pr_context_fixture(self, event_merge, parents):
        event = self.root / 'TEST_ONLY-pr-event.json'
        event.write_text(json.dumps({'number': 7, 'pull_request': {
            'head': {'sha': 'd'*40, 'repo': {'full_name': C.REPO}},
            'base': {'sha': 'b'*40, 'repo': {'full_name': C.REPO}},
            'merge_commit_sha': event_merge}}))
        env = dict(GITHUB_ACTIONS='true', GITHUB_REPOSITORY=C.REPO,
            GITHUB_API_URL='https://api.github.com', GITHUB_EVENT_NAME='pull_request',
            GITHUB_RUN_ID='123', GITHUB_RUN_ATTEMPT='1', GITHUB_SHA='c'*40,
            GITHUB_WORKFLOW_SHA='c'*40, GITHUB_REF='refs/pull/7/merge', GITHUB_EVENT_PATH=str(event),
            GITHUB_WORKFLOW_REF=C.REPO+'/.github/workflows/ci.yml@refs/pull/7/merge')
        def git_result(command, **kwargs):
            if command == ['git', 'rev-parse', 'HEAD']:
                return SimpleNamespace(stdout='c'*40+'\n')
            self.assertEqual(command, ['git', 'rev-list', '--parents', '-n', '1', 'c'*40])
            return SimpleNamespace(stdout=' '.join(parents)+'\n')
        with mock.patch.dict(os.environ, env, clear=True), \
             mock.patch.object(C.subprocess, 'run', side_effect=git_result), mock.patch.object(C, 'api') as api:
            try:
                return C.context()
            finally:
                api.assert_not_called()

    def test_exact_merge_parents_bind_context_with_stale_or_null_webhook_merge(self):
        for event_merge in ['e'*40, None]:
            with self.subTest(event_merge=event_merge):
                result = self.pr_context_fixture(event_merge, ['c'*40, 'b'*40, 'd'*40])
                self.assertEqual(result['checkoutSHA'], 'c'*40)
                self.assertEqual(result['headSHA'], 'd'*40)

    def test_wrong_base_head_nonmerge_or_other_commit_rejects_before_api(self):
        for parents in [['c'*40, 'e'*40, 'd'*40], ['c'*40, 'b'*40, 'e'*40],
                        ['c'*40, 'd'*40], ['e'*40, 'b'*40, 'd'*40]]:
            with self.subTest(parents=parents):
                with self.assertRaises(RuntimeError):
                    self.pr_context_fixture('c'*40, parents)

    def test_private_file_permissions_hardlink_and_symlink_rejected(self):
        file = self.root / 'input'; file.write_bytes(b'TEST_ONLY'); file.chmod(0o644)
        with self.assertRaises(RuntimeError): C.read_file(file, 10, private=True)
        file.chmod(0o600); os.link(file, self.root / 'hard')
        with self.assertRaises(RuntimeError): C.read_file(file, 10, private=True)
        (self.root / 'hard').unlink(); (self.root / 'link').symlink_to(file)
        with self.assertRaises(RuntimeError): C.read_file(self.root / 'link', 10, private=True)

    def test_parent_symlink_rejected(self):
        folder = self.root / 'actual'; folder.mkdir(); (folder / 'file').write_bytes(b'fixture')
        (self.root / 'linkdir').symlink_to(folder, target_is_directory=True)
        with self.assertRaises(RuntimeError): C.read_file(self.root / 'linkdir/file', 20)

    def test_read_limit_and_exclusive_receipt(self):
        file = self.root / 'receipt'; file.write_bytes(b'TEST_ONLY'); file.chmod(0o600)
        with self.assertRaises(RuntimeError): C.read_file(file, 2, private=True)
        with self.assertRaises(FileExistsError): C.save(file, {'TEST_ONLY': True})
        self.assertEqual(file.read_bytes(), b'TEST_ONLY')

    def run_shell_fixture(self):
        script = self.root / 'script.sh'
        script.write_text('test -z "${HELMUT_CI_ORIGINALS_KEY:-}"\ntest -z "${GITHUB_TOKEN:-}"\ntest -z "${GITHUB_STEP_SUMMARY:-}"\ntest -z "${GITHUB_OUTPUT:-}"\ntest -z "${ACTIONS_RUNTIME_TOKEN:-}"\nprintf TEST_ONLY_PRIVATE_SENTINEL\nprintf TEST_ONLY_STDERR >&2\nexit 7\n')
        env = dict(os.environ, RUNNER_TEMP=str(self.root), HELMUT_CI_ORIGINALS_KEY='a' * 64,
                   GITHUB_TOKEN='TEST_ONLY', GITHUB_STEP_SUMMARY='TEST_ONLY',
                   GITHUB_OUTPUT='TEST_ONLY', ACTIONS_RUNTIME_TOKEN='TEST_ONLY')
        result = subprocess.run([sys.executable, str(HERE / 'private_ci_shell.py'), str(script)],
                                 env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 7)
        self.assertNotIn('TEST_ONLY_PRIVATE_SENTINEL', result.stdout + result.stderr)
        metadata = json.loads(result.stdout)
        self.assertEqual(metadata['exitCode'], 7)
        log = self.root / 'helmut-ci-private-logs' / metadata['log']
        self.assertEqual(log.stat().st_mode & 0o777, 0o600)
        self.assertIn(b'TEST_ONLY_PRIVATE_SENTINEL', log.read_bytes())
        self.assertEqual(metadata['sha256'], hashlib.sha256(log.read_bytes()).hexdigest())
        return log

    def test_shell_retains_exit_and_hides_test_only_private_values(self):
        self.run_shell_fixture()

    def test_explicit_public_shell_retains_output_and_exit_without_private_files(self):
        script = self.root / 'public.sh'
        script.write_text('test -z "${HELMUT_CI_ORIGINALS_KEY:-}"\ntest -z "${GITHUB_TOKEN:-}"\n'
                          'test -z "${GITHUB_OUTPUT:-}"\ntest -z "${ACTIONS_RUNTIME_TOKEN:-}"\n'
                          'printf TEST_ONLY_PUBLIC_STDOUT\nprintf TEST_ONLY_PUBLIC_STDERR >&2\nexit 7\n')
        env = dict(os.environ, HELMUT_CI_PRIVATE_LOGS='false', HELMUT_CI_ORIGINALS_KEY='TEST_ONLY',
                   GITHUB_TOKEN='TEST_ONLY', GITHUB_OUTPUT='TEST_ONLY', ACTIONS_RUNTIME_TOKEN='TEST_ONLY')
        env.pop('RUNNER_TEMP', None)
        result = subprocess.run([sys.executable, str(HERE / 'private_ci_shell.py'), str(script)],
                                env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 7)
        self.assertEqual(result.stdout, 'TEST_ONLY_PUBLIC_STDOUT')
        self.assertEqual(result.stderr, 'TEST_ONLY_PUBLIC_STDERR')
        self.assertFalse((self.root / 'helmut-ci-private-logs').exists())

    def test_unknown_shell_output_mode_rejects_before_running_child(self):
        script = self.root / 'rejected.sh'
        script.write_text('printf TEST_ONLY_CHILD_MUST_NOT_RUN\n')
        env = dict(os.environ, HELMUT_CI_PRIVATE_LOGS='unknown', RUNNER_TEMP=str(self.root))
        result = subprocess.run([sys.executable, str(HERE / 'private_ci_shell.py'), str(script)],
                                env=env, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn('TEST_ONLY_CHILD_MUST_NOT_RUN', result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)['code'], 'PRIVATE_CI_LOG_REJECTED')

    def test_test_only_log_encryption_and_real_gpg_decryption(self):
        log = self.run_shell_fixture()
        fixture_key = 'c' * 64
        with mock.patch.dict(os.environ, {'RUNNER_TEMP': str(self.root), 'HELMUT_CI_ORIGINALS_KEY': fixture_key+'\n'}):
            result = C.encrypt_logs()
        self.assertIs(result['ciPassed'], False)
        self.assertEqual(result['encryptedLogs'], 1)
        home = self.root / 'test-decrypt-home'; home.mkdir(mode=0o700)
        output = self.root / 'TEST_ONLY-decrypted.tar.gz'
        command = ['/usr/bin/gpg', '--no-options', '--batch', '--homedir', str(home),
                   '--pinentry-mode', 'loopback', '--no-symkey-cache', '--disable-dirmngr',
                   '--passphrase-fd', '0', '--output', str(output), '--decrypt',
                   str(self.root / 'helmut-ci-private-logs.tar.gz.gpg')]
        decrypted = subprocess.run(command, input=(fixture_key + '\n').encode(),
                                   capture_output=True, env=C.child_env(), timeout=20)
        self.assertEqual(decrypted.returncode, 0)
        with tarfile.open(output, 'r:gz') as tar:
            self.assertEqual(tar.getnames(), [log.name])
            self.assertEqual(tar.extractfile(log.name).read(), log.read_bytes())

    def archive(self, members):
        archive = self.root / 'fixture.tar.gz'
        with tarfile.open(archive, 'w:gz', format=tarfile.USTAR_FORMAT) as tar:
            for name, data, kind in members:
                entry = tarfile.TarInfo(name); entry.mode = 0o600; entry.type = kind
                entry.size = len(data) if kind == tarfile.REGTYPE else 0
                if kind == tarfile.SYMTYPE: entry.linkname = 'foreign'
                tar.addfile(entry, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
        return archive

    def rows(self):
        return [dict(path='/workspace/synthetic/fixture', bytes=4, sha256=hashlib.sha256(b'test').hexdigest())]

    def test_exact_synthetic_archive_extracted_privately(self):
        archive = self.archive([('synthetic/fixture', b'test', tarfile.REGTYPE)])
        dest = self.root / 'bundle'; C.extract_archive(archive, dest, self.rows())
        self.assertEqual((dest / 'synthetic/fixture').read_bytes(), b'test')
        self.assertEqual((dest / 'synthetic/fixture').stat().st_mode & 0o777, 0o600)
        self.assertEqual((dest / 'synthetic').stat().st_mode & 0o777, 0o700)

    def test_traversal_extra_duplicate_link_wrong_hash_and_missing_rejected(self):
        cases = [
            [('../foreign', b'test', tarfile.REGTYPE)],
            [('synthetic/fixture', b'test', tarfile.REGTYPE), ('extra', b'x', tarfile.REGTYPE)],
            [('synthetic/fixture', b'test', tarfile.REGTYPE)] * 2,
            [('synthetic/fixture', b'', tarfile.SYMTYPE)],
            [('synthetic/fixture', b'nope', tarfile.REGTYPE)], []]
        for i, members in enumerate(cases):
            with self.subTest(case=i):
                archive = self.archive(members)
                with self.assertRaises(RuntimeError): C.extract_archive(archive, self.root / f'bad-{i}', self.rows())
                self.assertFalse((self.root / 'foreign').exists())

    def test_occupied_destination_rejected(self):
        archive = self.archive([('synthetic/fixture', b'test', tarfile.REGTYPE)])
        dest = self.root / 'bundle'; dest.mkdir()
        with self.assertRaises(FileExistsError): C.extract_archive(archive, dest, self.rows())


if __name__ == '__main__':
    unittest.main()
