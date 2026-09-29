#!/usr/bin/env python3
import importlib.util, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("agent_lease", HERE / "lease.py")
L = importlib.util.module_from_spec(spec)
spec.loader.exec_module(L)


class LeaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"HELMUT_ROUTER_ROOT": self.tmp.name})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_second_owner_is_blocked(self):
        ok, _ = L.acquire("one", ttl=900, now=1000)
        self.assertTrue(ok)
        ok, lease = L.acquire("two", ttl=900, now=1100)
        self.assertFalse(ok)
        self.assertEqual(lease["owner"], "one")

    def test_expired_lease_can_be_replaced(self):
        L.acquire("one", ttl=300, now=1000)
        ok, lease = L.acquire("two", ttl=300, now=1400)
        self.assertTrue(ok)
        self.assertEqual(lease["owner"], "two")

    def test_owner_can_renew_and_release(self):
        L.acquire("one", ttl=300, now=1000)
        ok, lease = L.renew("one", ttl=600, now=1100)
        self.assertTrue(ok)
        self.assertEqual(lease["expires_at"], 1700)
        ok, _ = L.release("one", now=1200)
        self.assertTrue(ok)
        self.assertFalse(L.status(now=1200)["active"])


if __name__ == "__main__":
    unittest.main()
