"""Offline-Originalbindung und Archivschutz, keine Netzanfragen."""
import importlib.util
import pathlib
import sys
import tempfile
import unittest
import warnings
import zipfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("b2", pathlib.Path(__file__).with_name("blocker2-cipher-recovery.py"))
b2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b2)


class TestCipherRecovery(unittest.TestCase):
    def test_source_binding(self):
        run = dict(id=b2.RUN, head_sha=b2.COMMIT, head_branch="main", event="workflow_dispatch",
                   run_attempt=1, status="completed", conclusion="failure", path=".github/workflows/blocker2-readonly500.yml")
        artifact = dict(id=b2.ARTIFACT, name=f"blocker2-readonly500-{b2.RUN}", size_in_bytes=b2.SIZE,
                        expired=False, digest="sha256:" + b2.DIGEST,
                        workflow_run=dict(id=b2.RUN, head_sha=b2.COMMIT, head_branch="main"))
        b2.source_metadata(run, artifact)
        for field, value in [("head_sha", "a" * 40), ("run_attempt", 2), ("event", "push"), ("status", "in_progress")]:
            with self.assertRaises(ValueError):
                b2.source_metadata({**run, field: value}, artifact)
        for field, value in [("id", 123), ("expired", True), ("digest", "sha256:" + "f" * 64), ("size_in_bytes", 1)]:
            with self.assertRaises(ValueError):
                b2.source_metadata(run, {**artifact, field: value})

    def test_only_expected_https_storage(self):
        b2.storage_url("https://productionresultssa8.blob.core.windows.net/cipher?sig=not-a-real-secret")
        for url in ["http://productionresultssa8.blob.core.windows.net/a", "https://evil.invalid/a",
                    "https://productionresultssa8.blob.core.windows.net.evil.invalid/a",
                    "https://user:pass@productionresultssa8.blob.core.windows.net/a",
                    "https://productionresultssa8.blob.core.windows.net:444/a"]:
            with self.assertRaises(ValueError):
                b2.storage_url(url)

    def test_closed_files_and_no_zip_path_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            original = root / "original.zip"
            with zipfile.ZipFile(original, "w") as z:
                for name in sorted(b2.NAMES):
                    z.writestr(name, b'opaque encrypted fixture\n')
            b2.extract(original, root / "good")
            self.assertEqual({p.name for p in (root / "good").iterdir()}, b2.NAMES)
            for p in (root / "good").iterdir():
                self.assertEqual(p.read_bytes(), b'opaque encrypted fixture\n')
            for case in ["missing", "duplicate", "escape", "symlink", "large"]:
                archive = root / (case + ".zip")
                with zipfile.ZipFile(archive, "w") as z:
                    for name in sorted(b2.NAMES):
                        if case == "missing" and name == "0500.json":
                            continue
                        info = zipfile.ZipInfo(name)
                        if case == "symlink" and name == "0500.json":
                            info.external_attr = 0o120777 << 16
                        z.writestr(info, b"x")
                    if case == "duplicate":
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore")
                            z.writestr("0001.json", b"second")
                    if case == "escape":
                        z.writestr("../escape.json", b"escape")
                if case == "large":
                    old = b2.MAX_TOTAL
                    b2.MAX_TOTAL = 500
                try:
                    with self.assertRaises(ValueError):
                        b2.extract(archive, root / case)
                    self.assertFalse((root / case).exists())
                    self.assertFalse((root.parent / "escape.json").exists())
                finally:
                    if case == "large":
                        b2.MAX_TOTAL = old


if __name__ == "__main__":
    unittest.main()
