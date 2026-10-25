"""Synthetic boundary tests; no SSH, Docker daemon, credentials or native workload."""
import base64
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import types
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("bridge", Path(__file__).with_name("hetzner-ci-bridge.py"))
B = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(B)
NONCE = "a" * 32
DIGEST = "b" * 64


def reply():
    return {"protocol": B.PROTOCOL, "nonce": NONCE, "bridge_sha256": DIGEST,
            "user": "helmut-ci", "os": "ubuntu-24.04", "arch": "x86_64",
            "memory_bytes": 16 * 1024**3, "disk_free_bytes": 100 * 1024**3,
            "cgroup_v2": True, "rootless_docker_version": None,
            "native_execution_enabled": False}


class Boundaries(unittest.TestCase):
    def test_only_exact_probe_command(self):
        self.assertEqual(B.parse_command("helmut-ci-probe-v1 " + NONCE), NONCE)
        for value in ("", "bash", "scp -t /tmp", "internal-sftp", "helmut-ci-test " + NONCE,
                      "helmut-ci-probe-v1 " + NONCE + "\n", "helmut-ci-probe-v1 " + NONCE + "; id",
                      "helmut-ci-probe-v1 " + "A" * 32, "helmut-ci-probe-v1 " + "a" * 31):
            with self.subTest(command=value), self.assertRaises(ValueError):
                B.parse_command(value)

    def test_only_tailnet_literal_ip(self):
        self.assertEqual(B.tailscale_ip("100.64.0.1"), "100.64.0.1")
        for value in ("127.0.0.1", "203.0.113.1", "100.63.255.255", "100.128.0.1",
                      "host.example", "-oProxyCommand=id", "::1", "100.64.0.1\n"):
            with self.subTest(host=value), self.assertRaises(ValueError):
                B.tailscale_ip(value)

    def test_reply_requires_exact_binding_and_closed_schema(self):
        self.assertEqual(B.validate_reply(json.dumps(reply()).encode(), NONCE, DIGEST), reply())
        mutations = {"protocol": "other", "nonce": "c" * 32, "bridge_sha256": "c" * 64,
                     "user": "root", "os": "other", "arch": "other",
                     "memory_bytes": True, "disk_free_bytes": -1,
                     "cgroup_v2": 1, "rootless_docker_version": "log\n::error::oops",
                     "native_execution_enabled": True, "extra": "private"}
        for key, value in mutations.items():
            item = dict(reply(), **{key: value})
            with self.subTest(field=key), self.assertRaises(ValueError):
                B.validate_reply(json.dumps(item).encode(), NONCE, DIGEST)
        for key in B.FIELDS:
            item = reply()
            del item[key]
            with self.subTest(missing=key), self.assertRaises(ValueError):
                B.validate_reply(json.dumps(item).encode(), NONCE, DIGEST)

    def test_reply_rejects_duplicate_nonfinite_large_and_nonobject_json(self):
        original = json.dumps(reply())
        for raw in (original[:-1] + ', "user":"helmut-ci"}',
                    original.replace(str(16 * 1024**3), "NaN"), "[]", " " * 4097):
            with self.subTest(raw=raw[:40]), self.assertRaises(ValueError):
                B.validate_reply(raw.encode(), NONCE, DIGEST)

    def test_ssh_options_pin_identity_host_and_prevent_forwarding(self):
        args = B.ssh_arguments("100.64.0.1", "/tmp/key", "/tmp/hosts", NONCE)
        for option in ("StrictHostKeyChecking=yes", "IdentitiesOnly=yes", "IdentityAgent=none",
                       "ForwardAgent=no", "ClearAllForwardings=yes", "BatchMode=yes",
                       "GlobalKnownHostsFile=/dev/null", "ConnectionAttempts=1"):
            self.assertIn(option, args)
        self.assertEqual(args[-2:], ["helmut-ci@100.64.0.1", "helmut-ci-probe-v1 " + NONCE])
        self.assertEqual(args[1:3], ["-F", "/dev/null"])

    def test_root_and_privileged_groups_rejected_before_probing(self):
        with patch.object(B.os, "geteuid", return_value=0), self.assertRaises(ValueError):
            B.probe(NONCE)
        account = types.SimpleNamespace(pw_name="helmut-ci", pw_gid=1000)
        with patch.object(B.os, "geteuid", return_value=1000), \
             patch.object(B.pwd, "getpwuid", return_value=account), \
             patch.object(B.os, "getgroups", return_value=[1000]), \
             patch.object(B.grp, "getgrgid", return_value=types.SimpleNamespace(gr_name="docker")), \
             self.assertRaises(ValueError):
            B.probe(NONCE)

    def test_public_ssh_endpoint_rejected(self):
        account = types.SimpleNamespace(pw_name="helmut-ci", pw_gid=1000)
        for connection in ("", "100.64.0.1 1234 203.0.113.1 22", "203.0.113.1 1234 100.64.0.1 22"):
            with self.subTest(connection=connection), \
                 patch.object(B.os, "geteuid", return_value=1000), \
                 patch.object(B.pwd, "getpwuid", return_value=account), \
                 patch.object(B.os, "getgroups", return_value=[1000]), \
                 patch.object(B.grp, "getgrgid", return_value=types.SimpleNamespace(gr_name="helmut-ci")), \
                 patch.dict(B.os.environ, {"SSH_CONNECTION": connection}), \
                 self.assertRaises(ValueError):
                B.probe(NONCE)

    def test_no_root_docker_fallback(self):
        with patch.object(B.Path, "lstat", side_effect=FileNotFoundError), \
             patch.object(B.subprocess, "run") as run:
            self.assertIsNone(B.rootless_version(1000))
            run.assert_not_called()
        socket = types.SimpleNamespace(st_mode=0o140600, st_uid=1000)
        with patch.object(B.Path, "lstat", return_value=socket), \
             patch.object(B.subprocess, "run", return_value=types.SimpleNamespace(stdout=b'[]')) as run:
            self.assertIsNone(B.rootless_version(1000))
            self.assertIn("--host=unix:///run/user/1000/docker.sock", run.call_args.args[0])
            self.assertNotIn("/var/run/docker.sock", " ".join(run.call_args.args[0]))

    def test_client_uses_clean_env_and_deletes_temporary_keys(self):
        wire_key = b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20" + b"x" * 32
        env = {"HELMUT_CI_HOST": "100.64.0.1", "HELMUT_CI_HOST_PUBLIC_KEY":
               "ssh-ed25519 " + base64.b64encode(wire_key).decode(),
               "HELMUT_CI_GATE_SHA256": DIGEST, "HELMUT_CI_SSH_KEY":
               "-----BEGIN OPENSSH PRIVATE KEY-----\nsynthetic-only\n",
               "UNRELATED_PRODUCTION_SECRET": "synthetic-sentinel"}
        paths = []
        def fake_run(args, **kwargs):
            key = Path(args[args.index("-i") + 1])
            self.assertEqual(key.stat().st_mode & 0o777, 0o600)
            self.assertEqual(kwargs["env"], {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
            self.assertEqual(kwargs["timeout"], 40)
            paths.append(key)
            return types.SimpleNamespace(returncode=0, stdout=json.dumps(reply()).encode())
        output = io.StringIO()
        with patch.dict(B.os.environ, env, clear=True), \
             patch.object(B.secrets, "token_hex", return_value=NONCE), \
             patch.object(B.subprocess, "run", side_effect=fake_run), contextlib.redirect_stdout(output):
            B.client()
        self.assertEqual(json.loads(output.getvalue()), reply())
        self.assertTrue(all(not path.exists() for path in paths))
        self.assertNotIn("synthetic-sentinel", output.getvalue())

    def test_invalid_host_keys_stop_before_ssh(self):
        for key in ("", "ssh-rsa ZmFrZQ==", "ssh-ed25519 ZmFrZQ==",
                    "ssh-ed25519 ZmFrZQ==\nother-host ssh-ed25519 ZmFrZQ=="):
            with self.subTest(key=key), \
                 patch.dict(B.os.environ, {"HELMUT_CI_HOST": "100.64.0.1",
                                         "HELMUT_CI_HOST_PUBLIC_KEY": key}, clear=True), \
                 patch.object(B.subprocess, "run") as run, self.assertRaises(ValueError):
                B.client()
            run.assert_not_called()

    def test_rootless_identity_must_be_observed(self):
        socket = types.SimpleNamespace(st_mode=0o140600, st_uid=1000)
        results = [types.SimpleNamespace(stdout=b'["name=rootless", "name=seccomp"]'),
                   types.SimpleNamespace(stdout=b'29.1.3\n')]
        with patch.object(B.Path, "lstat", return_value=socket), \
             patch.object(B.subprocess, "run", side_effect=results) as run:
            self.assertEqual(B.rootless_version(1000), "29.1.3")
            self.assertEqual(run.call_count, 2)
        socket.st_uid = 0
        with patch.object(B.Path, "lstat", return_value=socket), \
             patch.object(B.subprocess, "run") as run:
            self.assertIsNone(B.rootless_version(1000))
            run.assert_not_called()

    def test_errors_do_not_print_exception_or_remote_output(self):
        output = io.StringIO()
        with patch.object(B.sys, "argv", ["bridge", "client"]), \
             patch.object(B, "client", side_effect=ValueError("synthetic-secret ::error::bad")), \
             contextlib.redirect_stderr(output):
            self.assertEqual(B.main(), 1)
        self.assertNotIn("synthetic-secret", output.getvalue())
        self.assertNotIn("::error::", output.getvalue())

    def test_ssh_failures_emit_closed_codes_without_raw_stderr(self):
        cases = [
            (b'Load key /tmp/key: error in libcrypto', 'ssh-key-load-failed'),
            (b'Host key verification failed.', 'ssh-host-verification-failed'),
            (b'Permission denied (publickey).', 'ssh-authentication-failed'),
            (b'Network is unreachable', 'ssh-network-unreachable'),
            (b'Connection timed out', 'ssh-connect-timeout'),
            (b'Connection refused', 'ssh-connection-refused'),
            (b'helmut-ci: probe rejected; check configuration privately', 'remote-probe-rejected'),
            (b'private-sentinel ::error:: arbitrary text', 'ssh-probe-failed'),
        ]
        for raw, expected in cases:
            with self.subTest(expected=expected):
                code = B.ssh_failure_code(raw)
                self.assertEqual(code, expected)
                output = io.StringIO()
                with patch.object(B.sys, 'argv', ['bridge', 'client']), \
                     patch.object(B, 'client', side_effect=ValueError(code)), \
                     contextlib.redirect_stderr(output):
                    self.assertEqual(B.main(), 1)
                self.assertEqual(output.getvalue(), 'helmut-ci: probe rejected: ' + expected + '\n')
                self.assertNotIn('private-sentinel', output.getvalue())
                self.assertNotIn('::error::', output.getvalue())

    def test_local_failures_never_log_exception_details(self):
        cases = [
            (ValueError('ssh-key-required'), 'ssh-key-required'),
            (ValueError('private-sentinel'), 'validation-failed'),
            (OSError('private-sentinel'), 'local-io-error'),
            (subprocess.TimeoutExpired('private-sentinel', 5), 'local-process-timeout'),
        ]
        for error, expected in cases:
            with self.subTest(expected=expected):
                output = io.StringIO()
                with patch.object(B.sys, 'argv', ['bridge', 'client']), \
                     patch.object(B, 'client', side_effect=error), \
                     contextlib.redirect_stderr(output):
                    self.assertEqual(B.main(), 1)
                self.assertEqual(output.getvalue(), 'helmut-ci: probe rejected: ' + expected + '\n')
                self.assertNotIn('private-sentinel', output.getvalue())


if __name__ == "__main__":
    unittest.main()
