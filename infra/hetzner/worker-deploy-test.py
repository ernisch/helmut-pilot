"""Offline tests for release approval and recovery."""
import datetime as dt
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("worker_deploy", Path(__file__).with_name("worker-deploy.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

OLD = "a" * 40
TARGET = "b" * 40
OLD_IMAGE = "sha256:" + "c" * 64
NEW_IMAGE = "sha256:" + "d" * 64
CURRENT = {"id": "old-container", "state": "running", "restarts": 0, "commit": OLD, "image": OLD_IMAGE}
READY = f'{{"dienst":"quellenworker","ereignis":"bereit","ort":"hetzner-de","commit":"{TARGET}"}}'
COMPOSE = ("docker", "compose")


class ApprovalTest(unittest.TestCase):
    def test_exact_completed_push_and_merge(self):
        run = {"head_sha": TARGET, "head_branch": "main", "event": "push", "run_number": 12,
               "status": "completed", "conclusion": "success", "id": 42, "run_attempt": 2}
        jobs = [{"name": name, "status": "completed", "conclusion": "success"}
                for name in sorted(deploy.REQUIRED)]
        pull = {"merge_commit_sha": TARGET, "merged_at": "timestamp", "base": {"ref": "main"}}
        first_call = f"actions/workflows/ci.yml/runs?head_sha={TARGET}&branch=main&event=push&per_page=10"

        def result(runs, check_jobs, associated_pull):
            with patch.object(deploy, "api", side_effect=[
                {"workflow_runs": runs}, {"jobs": check_jobs}, [associated_pull]
            ]) as api:
                approved = deploy.approved(TARGET)
                self.assertEqual(api.call_args_list[0].args, (first_call,))
                if approved:
                    self.assertEqual(api.call_args_list[1].args,
                                     ("actions/runs/42/attempts/2/jobs?per_page=100",))
                return approved

        self.assertTrue(result([run], jobs, pull))
        for bad_run in ({"head_sha": OLD}, {"event": "pull_request"}, {"head_branch": "dev"},
                        {"status": "in_progress"}, {"conclusion": "cancelled"}):
            self.assertFalse(result([dict(run, **bad_run)], jobs, pull))
        self.assertFalse(result([run, dict(run, run_number=13, status="queued")], jobs, pull))
        self.assertFalse(result([run], jobs[:-1], pull))
        self.assertFalse(result([run], [jobs[0], dict(jobs[1], conclusion="skipped")], pull))
        self.assertFalse(result([run], jobs, dict(pull, merge_commit_sha=OLD)))
        self.assertFalse(result([run], jobs, dict(pull, merged_at=None)))

    def test_scoped_windows_and_structured_receipt(self):
        for hour, minute, allowed in [(5, 9, False), (5, 10, True), (6, 40, False),
                                      (7, 25, False), (7, 40, True), (7, 42, True), (7, 43, False)]:
            with self.subTest(hour=hour, minute=minute):
                self.assertEqual(deploy.deployment_window(dt.datetime(2026, 11, 25, hour, minute,
                                                                      tzinfo=deploy.BERLIN)), allowed)
        self.assertTrue(deploy.ready(READY, TARGET))
        self.assertFalse(deploy.ready(READY, OLD))
        run = ('{"dienst":"quellenworker","ereignis":"quellenfenster","gestartet":true,'
               '"laufId":"cron-crawl-1","status":"partial","quittungGespeichert":true}')
        self.assertEqual(deploy.regular_run(f"prefix\n{READY}\n{run}"), ("cron-crawl-1", "partial"))
        self.assertIsNone(deploy.regular_run(run.replace('"quittungGespeichert":true', '"quittungGespeichert":false')))


class DeploymentTest(unittest.TestCase):
    def setUp(self):
        temporary = self.enterContext(tempfile.TemporaryDirectory())
        self.worker = deploy.Deployment(Path(temporary))
        self.old = self.enterContext(patch.object(deploy, "container", return_value=CURRENT.copy()))
        self.approval = self.enterContext(patch.object(deploy, "approved", return_value=True))
        self.cmd = self.enterContext(patch.object(deploy, "command", side_effect=self.docker_command))
        self.images = self.enterContext(patch.object(deploy, "image_id", return_value=NEW_IMAGE))
        self.started = self.enterContext(patch.object(deploy, "wait_ready"))
        self.enterContext(patch.object(deploy, "deployment_window", return_value=True))
        self.enterContext(patch.object(self.worker, "fetch", return_value=TARGET))
        self.main = self.enterContext(patch.object(self.worker, "main_commit", return_value=TARGET))
        self.enterContext(patch.object(self.worker, "prepare", return_value=COMPOSE))
        self.diff = self.enterContext(patch.object(self.worker, "changed", side_effect=lambda old, new, *paths:
                                                 old != new and paths != ("compose.yaml",)))
        self.enterContext(patch.object(self.worker, "git", return_value=subprocess.CompletedProcess([], 0)))
        self.probe = READY

    def docker_command(self, *args, **kwargs):
        return subprocess.CompletedProcess(args, 0, self.probe if "run" in args else "", "")

    def test_update_records_commit_and_waits_for_regular_run(self):
        self.worker.run()
        self.started.assert_called_once_with(TARGET, NEW_IMAGE, CURRENT["id"])
        self.assertEqual(self.worker.read("awaiting-run"), {"commit": TARGET})
        self.assertIsNone(self.worker.read("pending"))
        self.assertIsNone(self.worker.read("failed"))
        self.assertEqual(self.approval.call_count, 2)

    def test_documentation_does_not_touch_docker(self):
        self.diff.side_effect = None
        self.diff.return_value = False
        self.worker.run()
        self.approval.assert_not_called()
        self.cmd.assert_not_called()

    def test_compose_edit_requires_manual_release(self):
        self.diff.side_effect = None
        self.diff.return_value = True
        with self.assertRaisesRegex(deploy.DeployError, "Compose"):
            self.worker.run()
        self.cmd.assert_not_called()

    def test_unapproved_release_does_not_touch_docker(self):
        self.approval.return_value = False
        self.worker.run()
        self.cmd.assert_not_called()

    def test_preflight_requires_exact_readiness_and_preserves_incumbent(self):
        self.probe = READY.replace(TARGET, OLD)
        with self.assertRaisesRegex(deploy.DeployError, "Vorabprüfung"):
            self.worker.run()
        self.assertFalse(any("up" in call.args for call in self.cmd.call_args_list))
        self.assertIsNone(self.worker.read("pending"))

    def test_moved_main_or_revoked_ci_does_not_switch(self):
        self.main.return_value = OLD
        self.worker.run()
        self.assertFalse(any("up" in call.args for call in self.cmd.call_args_list))
        self.main.return_value = TARGET
        self.approval.side_effect = [True, False]
        self.worker.run()
        self.assertFalse(any("up" in call.args for call in self.cmd.call_args_list))

    def test_failed_start_restores_pinned_image_and_blocks_same_release(self):
        candidate = dict(CURRENT, id="candidate", image=NEW_IMAGE, commit=TARGET)
        self.old.side_effect = [CURRENT, CURRENT, candidate]
        self.images.side_effect = [NEW_IMAGE, OLD_IMAGE]
        self.started.side_effect = [deploy.DeployError("Startfehler"), CURRENT]
        with self.assertRaisesRegex(deploy.DeployError, "Startfehler"):
            self.worker.run()
        self.assertEqual([call.args[0] for call in self.started.call_args_list], [TARGET, OLD])
        self.assertEqual(sum("up" in call.args for call in self.cmd.call_args_list), 2)
        self.assertEqual(self.worker.read("failed"), {"commit": TARGET})
        self.assertIsNone(self.worker.read("pending"))
        self.old.side_effect = None
        self.cmd.reset_mock()
        self.worker.run()
        self.cmd.assert_not_called()

    def test_documentation_after_rollback_does_not_restart_failed_worker(self):
        failed = "e" * 40
        self.worker.record("failed", {"commit": failed})
        self.diff.side_effect = lambda old, new, *paths: (
            old != failed and old != new and paths != ("compose.yaml",)
        )
        self.worker.run()
        self.approval.assert_not_called()
        self.cmd.assert_not_called()

    def test_interruption_before_swap_keeps_incumbent(self):
        self.worker.record("pending", {"previous": CURRENT, "target": TARGET})
        self.worker.run()
        self.assertIsNone(self.worker.read("pending"))
        self.assertEqual(self.worker.read("failed"), {"commit": TARGET})
        self.cmd.assert_not_called()

    def test_wrong_rollback_image_keeps_recovery_journal(self):
        self.old.return_value = None
        self.worker.record("pending", {"previous": CURRENT, "target": TARGET})
        with self.assertRaisesRegex(deploy.DeployError, "Rückweg-Image"):
            self.worker.run()
        self.assertIsNotNone(self.worker.read("pending"))
        self.cmd.assert_not_called()


if __name__ == "__main__":
    unittest.main()
