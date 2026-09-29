#!/usr/bin/env python3
import importlib.util, os, subprocess, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("agent_worktree", HERE / "worktree.py")
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)


def git(cwd, *args):
    return subprocess.check_output(["git", *args], cwd=cwd, text=True).strip()


class WorktreeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        subprocess.check_call(["git", "init", "-b", "main"], cwd=self.repo, stdout=subprocess.DEVNULL)
        subprocess.check_call(["git", "config", "user.email", "test@example.invalid"], cwd=self.repo)
        subprocess.check_call(["git", "config", "user.name", "Helmut Test"], cwd=self.repo)
        (self.repo / "a.txt").write_text("a\n")
        subprocess.check_call(["git", "add", "a.txt"], cwd=self.repo)
        subprocess.check_call(["git", "commit", "-m", "base"], cwd=self.repo, stdout=subprocess.DEVNULL)
        self.base = git(self.repo, "rev-parse", "HEAD")
        subprocess.check_call(["git", "remote", "add", "origin", str(self.repo)], cwd=self.repo)
        subprocess.check_call(["git", "update-ref", "refs/remotes/origin/main", self.base], cwd=self.repo)
        self.wtroot = Path(self.tmp.name) / "worktrees"
        self.cwd = os.getcwd()
        os.chdir(self.repo)
        self.env = patch.dict(os.environ, {"HELMUT_WORKTREE_ROOT": str(self.wtroot)})
        self.env.start()

    def tearDown(self):
        os.chdir(self.cwd)
        self.env.stop()
        self.tmp.cleanup()

    def test_create_isolated_worktree_from_exact_main(self):
        W.create("berlin", self.base)
        target = self.wtroot / "berlin"
        self.assertTrue(target.exists())
        self.assertEqual(git(target, "branch", "--show-current"), "codex/parallel-berlin")
        self.assertEqual(git(target, "rev-parse", "HEAD"), self.base)

    def test_wrong_base_is_rejected(self):
        with self.assertRaises(RuntimeError):
            W.create("badbase", "0" * 40)

    def test_dirty_main_is_rejected(self):
        (self.repo / "dirty.txt").write_text("x")
        with self.assertRaises(RuntimeError):
            W.create("dirty", self.base)

    def test_remove_refuses_dirty_worker(self):
        W.create("worker", self.base)
        target = self.wtroot / "worker"
        (target / "a.txt").write_text("changed\n")
        with self.assertRaises(RuntimeError):
            W.remove("worker")


if __name__ == "__main__":
    unittest.main()
