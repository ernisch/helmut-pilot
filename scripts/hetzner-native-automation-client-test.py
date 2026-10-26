#!/usr/bin/env python3
"""Synthetic, local-only control-client tests; no SSH, GitHub writes or real keys."""
import base64
import contextlib
import hashlib
import io
import inspect
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from helmut_native_test_support import (ROOT, load_source, read_noatime, source,
                                        SOURCE_SHA256)

CLIENT = load_source('client')
WORKFLOW = ROOT / '.github/workflows/hetzner-native-automation.yml'
PLAN, PAYLOAD, NONCE = "1" * 64, "2" * 64, "3" * 64


def environment(operation="status"):
    return {
        "GITHUB_REPOSITORY": CLIENT.REPOSITORY, "GITHUB_REPOSITORY_OWNER": "ernisch",
        "GITHUB_REF": CLIENT.BRANCH, "GITHUB_WORKFLOW_REF": CLIENT.WORKFLOW_REF,
        "GITHUB_EVENT_NAME": "workflow_dispatch", "HELMUT_NATIVE_OPERATION": operation,
        "HELMUT_NATIVE_PLAN_SHA256": PLAN, "HELMUT_NATIVE_PAYLOAD_SHA256": PAYLOAD,
    }


def result_status():
    return {"status": "CONTROL_READY", "enabled_operations": ["status", "recipient", "stage"],
            "native_enabled": False, "source_sha256": PAYLOAD,
            "recipient_diagnostic": {
                "recipient": {"state": "ABSENT", "sha256": None, "phase": None, "code": None},
                "gpg": {"state": "ABSENT", "sha256": None, "code": None, "stderr_classes": []}}}


def response(result=None, operation="status"):
    sent = CLIENT.request(operation, PLAN, PAYLOAD, NONCE)
    reply = dict(sent, schema="helmut-native-control-response-v1")
    reply["result"] = result if result is not None else result_status()
    reply["result_sha256"] = CLIENT.digest(CLIENT.canonical(reply["result"]))
    return sent, reply


def synthetic_recipient(packet=b"\xc6\x01\x04"):
    # A deliberately non-cryptographic packet fixture. GnuPG is mocked below.
    # No public/private key is generated, fetched, imported or used for transport.
    public = ("-----BEGIN PGP PUBLIC KEY BLOCK-----\n\n" +
              base64.b64encode(packet).decode() + "\n=AAAA\n" +
              "-----END PGP PUBLIC KEY BLOCK-----\n").encode()
    return {"fingerprint": "A" * 40, "public_key_base64": base64.b64encode(public).decode(),
            "public_sha256": CLIENT.digest(public)}


class ProtocolTests(unittest.TestCase):
    def rejected(self, call, code):
        with self.assertRaisesRegex(ValueError, "^" + code + "$"):
            call()

    def test_context_and_exact_input_pins(self):
        self.assertEqual(CLIENT.validate_context(environment()), ("status", PLAN, PAYLOAD))
        for key, value in (("GITHUB_REF", "refs/heads/codex/hetzner-native-automation-20261026"),
                           ("GITHUB_REPOSITORY", "foreign/helmut-pilot"),
                           ("GITHUB_REPOSITORY_OWNER", "foreign"),
                           ("GITHUB_EVENT_NAME", "pull_request"),
                           ("GITHUB_WORKFLOW_REF", CLIENT.WORKFLOW_REF + "-different")):
            changed = environment()
            changed[key] = value
            self.rejected(lambda: CLIENT.validate_context(changed), "execution-context-denied")
        for pin in ("", "A" * 64, "a" * 63, PLAN + "\n", "$(false)"):
            changed = environment()
            changed["HELMUT_NATIVE_PLAN_SHA256"] = pin
            self.rejected(lambda: CLIENT.validate_context(changed), "pin-required")

    def test_unqualified_operations_fail_before_transport_or_secrets(self):
        for operation in ("four-tx",):
            with patch.object(CLIENT, "transport_configuration") as transport:
                self.rejected(lambda: CLIENT.client(environment(operation)), "operation-not-qualified")
                transport.assert_not_called()
        self.rejected(lambda: CLIENT.validate_context(environment("shell")), "operation-denied")

    def test_valid_status_response_and_sha(self):
        sent, reply = response()
        self.assertEqual(CLIENT.validate_response(CLIENT.canonical(reply), sent), reply)
        expected = hashlib.sha256(json.dumps(reply["result"], sort_keys=True,
                                            separators=(",", ":")).encode()).hexdigest()
        self.assertEqual(reply["result_sha256"], expected)

    def test_replay_plan_payload_operation_and_result_hash_drift(self):
        for field, value in (("nonce", "a" * 64), ("plan_sha256", "b" * 64),
                             ("payload_sha256", "c" * 64), ("operation", "recipient"),
                             ("schema", "another-response")):
            sent, reply = response()
            reply[field] = value
            self.rejected(lambda: CLIENT.validate_response(CLIENT.canonical(reply), sent),
                          "response-binding")
        sent, reply = response()
        reply["result_sha256"] = "0" * 64
        self.rejected(lambda: CLIENT.validate_response(CLIENT.canonical(reply), sent), "response-hash")

    def test_public_allowlist_native_execution_and_fake_pass_rejected(self):
        for field, value, code in (("native_enabled", True, "native-enabled-denied"),
                                   ("enabled_operations", ["status", "recipient", "stage", "admit", "four-tx"],
                                    "enabled-operations-denied"),
                                   ("status", "PASS", "result-status"),
                                   ("source_sha256", "4" * 64, "source-pin-drift")):
            result = result_status()
            result[field] = value
            sent, reply = response(result)
            self.rejected(lambda: CLIENT.validate_response(CLIENT.canonical(reply), sent), code)
        for extra in ("private_logs", "secret", "arbitrary_output"):
            result = result_status()
            result[extra] = "SYNTHETIC_PRIVATE_MARKER"
            sent, reply = response(result)
            self.rejected(lambda: CLIENT.validate_response(CLIENT.canonical(reply), sent), "result-fields")

    def test_invalid_json_duplicate_keys_and_output_bounds(self):
        sent, _ = response()
        self.rejected(lambda: CLIENT.validate_response(b"x" * (CLIENT.MAX_RESPONSE + 1), sent),
                      "response-size")
        self.rejected(lambda: CLIENT.validate_response(b'{"nonce":"a","nonce":"b"}', sent),
                      "duplicate-key")
        for raw in (b"not-json", b"\xff", b'{"value":NaN}', b"[" * 5000):
            self.rejected(lambda: CLIENT.validate_response(raw, sent), "response-json")
        sent, reply = response()
        reply["private_log"] = "SYNTHETIC_PRIVATE_MARKER"
        self.rejected(lambda: CLIENT.validate_response(CLIENT.canonical(reply), sent), "response-fields")

    def test_recipient_public_only_and_gpg_fingerprint_validation(self):
        recipient = synthetic_recipient()
        mock_output = b"pub:-:255:22:0000000000000000:::::::\nfpr:::::::::" + b"A" * 40 + b":\n"
        completed = subprocess.CompletedProcess([], 0, mock_output, b"")
        with patch.object(CLIENT.subprocess, "run", return_value=completed) as run:
            sent, reply = response({"status": "RECIPIENT_READY", "recipient": recipient}, "recipient")
            self.assertEqual(CLIENT.validate_response(CLIENT.canonical(reply), sent), reply)
            arguments = run.call_args.args[0]
            self.assertIn("--no-auto-key-retrieve", arguments)
            self.assertIn("show-only", arguments)
            self.assertEqual(run.call_args.kwargs["stderr"], subprocess.DEVNULL)
        for packet in (b"\xc5\x01\x04", b"\xc7\x01\x04"):
            with patch.object(CLIENT.subprocess, "run") as run:
                self.rejected(lambda: CLIENT.validate_recipient(synthetic_recipient(packet)),
                              "recipient-private-material")
                run.assert_not_called()
        with patch.object(CLIENT.subprocess, "run", return_value=
                          subprocess.CompletedProcess([], 2, b"", b"")):
            self.rejected(lambda: CLIENT.validate_recipient(recipient), "recipient-validation")
        with patch.object(CLIENT.subprocess, "run", return_value=
                          subprocess.CompletedProcess([], 0, mock_output.replace(b"A" * 40, b"B" * 40), b"")):
            self.rejected(lambda: CLIENT.validate_recipient(recipient), "recipient-fingerprint")

    def test_fixed_forced_command_and_host_fingerprint_fail_closed(self):
        args = CLIENT.ssh_arguments("100.64.0.1", Path("/fixed/key"), Path("/fixed/hosts"))
        self.assertEqual(args[-2:], ["root@100.64.0.1", "helmut-native-control-v1"])
        self.assertIn("StrictHostKeyChecking=yes", args)
        self.assertIn("IdentityAgent=none", args)
        self.assertNotIn("sudo", args)
        for host in ("example.com", "127.0.0.1", "-oProxyCommand=anything", "100.64.0.1;false"):
            self.rejected(lambda: CLIENT.transport_configuration({"HELMUT_CI_HOST": host}), "host-denied")
        blob = b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20" + b"\x01" * 32
        self.rejected(lambda: CLIENT.transport_configuration({
            "HELMUT_CI_HOST": "100.64.0.1", "HELMUT_CI_HOST_PUBLIC_KEY":
            "ssh-ed25519 " + base64.b64encode(blob).decode()}), "host-key-denied")

    def test_real_local_process_response_bound_timeout_and_stderr_discard(self):
        command = [sys.executable, "-I", "-c"]
        raw = CLIENT.bounded_exchange(command + [
            "import sys; sys.stdin.buffer.read(); sys.stderr.write('PRIVATE_MARKER'); print('{}')"], b"{}\n")
        self.assertEqual(raw, b"{}\n")
        self.rejected(lambda: CLIENT.bounded_exchange(command + [
            "import sys; sys.stdin.buffer.read(); sys.stdout.buffer.write(b'x'*300000)"], b"{}\n"),
            "response-size")
        self.rejected(lambda: CLIENT.bounded_exchange(command + [
            "import time; time.sleep(2)"], b"{}\n", timeout=0.05), "ssh-timeout")

    def test_only_two_public_files_are_written_with_verified_digest(self):
        _, reply = response()
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "public"
            CLIENT.write_public_artifact(output, reply)
            self.assertEqual(sorted(path.name for path in output.iterdir()),
                             ["RESPONSE.SAFE.json", "RESPONSE.SAFE.sha256"])
            raw = read_noatime((output / "RESPONSE.SAFE.json"))
            self.assertEqual(read_noatime((output / "RESPONSE.SAFE.sha256")).decode("utf-8"),
                             CLIENT.digest(raw) + "  RESPONSE.SAFE.json\n")
            for path in output.iterdir():
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.rejected(lambda: CLIENT.write_public_artifact(output, reply), "public-output-exists")

    def test_failure_output_never_includes_exception_or_private_marker(self):
        stderr = io.StringIO()
        with patch.object(CLIENT.sys, "argv", ["client.py", "client"]), \
                patch.object(CLIENT, "client", side_effect=ValueError("PRIVATE_MARKER")), \
                contextlib.redirect_stderr(stderr):
            self.assertEqual(CLIENT.main(), 1)
        self.assertEqual(stderr.getvalue(), "helmut-native-control: rejected: validation-failed\n")


class WorkflowTests(unittest.TestCase):
    def test_public_client_requires_exact_protected_main_ref(self):
        self.assertEqual(CLIENT.BRANCH, "refs/heads/main")
        self.assertEqual(CLIENT.digest(source('client')), SOURCE_SHA256['client'])
        self.assertEqual(CLIENT.validate_context(environment()), ("status", PLAN, PAYLOAD))
        branch_environment = environment()
        branch_environment["GITHUB_REF"] = "refs/heads/codex/hetzner-native-automation-20261026"
        with self.assertRaisesRegex(ValueError, "^execution-context-denied$"):
            CLIENT.validate_context(branch_environment)
        main_workflow = read_noatime(WORKFLOW).decode('utf-8')
        self.assertEqual(main_workflow.count(SOURCE_SHA256['client']), 2)
        self.assertNotIn("codex/hetzner-native-automation-20261026", main_workflow)
        self.assertIn('test "$GITHUB_REF" = refs/heads/main', main_workflow)
        self.assertIn("github.ref == 'refs/heads/main'", main_workflow)

    def test_workflow_client_pin_transport_pin_no_checkout_and_fixed_artifact(self):
        text = read_noatime(WORKFLOW).decode('utf-8')
        client_sha = CLIENT.digest(source('client'))
        self.assertEqual(text.count(client_sha), 2)
        self.assertIn("tailscale/github-action@99a8333667fff04fdd6cffb46dfd409f8329a7bf", text)
        self.assertIn("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02", text)
        self.assertNotIn("actions/checkout@", text)
        self.assertNotIn("pull_request", text)
        self.assertIn("case \"$HELMUT_NATIVE_OPERATION\" in status|recipient|stage|admit)", text)
        self.assertIn("contents/scripts/hetzner-native-automation-client.py?ref=$GITHUB_SHA", text)
        self.assertEqual(text.count("${{ secrets."), 1)
        self.assertIn("${{ secrets.HELMUT_CI_SSH_KEY }}", text)
        self.assertIn("${{ runner.temp }}/helmut-native-public/RESPONSE.SAFE.json", text)
        self.assertIn("${{ runner.temp }}/helmut-native-public/RESPONSE.SAFE.sha256", text)
        upload = text.split("- name: Publish validated public JSON", 1)[1]
        self.assertNotIn("env:", upload)
        self.assertNotIn("secrets.", upload)


class FinalIntegrationTests(unittest.TestCase):
    def test_exact_final_client_source_and_dedicated_workflow_contract(self):
        # Bind the published FINAL bytes without copying obsolete client variants.
        raw = source('client')
        self.assertEqual(CLIENT.digest(raw), SOURCE_SHA256['client'])
        self.assertEqual(CLIENT.BRANCH, 'refs/heads/main')
        self.assertEqual(raw.count(
            b'WORKFLOW_REF = REPOSITORY + "/.github/workflows/hetzner-native-automation.yml@" + BRANCH'), 1)
        self.assertEqual(raw.count(
            b'def bounded_exchange(arguments, raw_request, timeout=360, include_returncode=False):'), 1)

    def test_control_deadline_360_seconds_and_explicit_bound_still_enforced(self):
        self.assertEqual(inspect.signature(CLIENT.bounded_exchange).parameters['timeout'].default, 360)
        with self.assertRaisesRegex(ValueError, '^ssh-timeout$'):
            CLIENT.bounded_exchange([sys.executable, '-I', '-c', 'import time; time.sleep(2)'],
                                    b'{}\n', timeout=0.05)

    def test_exact_dedicated_main_workflow_and_owner_required(self):
        expected = "ernisch/helmut-pilot/.github/workflows/hetzner-native-automation.yml@refs/heads/main"
        self.assertEqual(CLIENT.WORKFLOW_REF, expected)
        self.assertEqual(CLIENT.validate_context(environment()), ("status", "1" * 64, "2" * 64))
        for key, value in (("GITHUB_REF", "refs/heads/codex/hetzner-native-automation-20261026"),
                           ("GITHUB_REPOSITORY", "foreign/helmut-pilot"),
                           ("GITHUB_REPOSITORY_OWNER", "foreign"),
                           ("GITHUB_EVENT_NAME", "pull_request"),
                           ("GITHUB_WORKFLOW_REF", expected.replace("hetzner-native-automation", "hetzner-ci")),
                           ("GITHUB_WORKFLOW_REF", expected + "-other")):
            altered = environment()
            altered[key] = value
            with self.assertRaisesRegex(ValueError, "^execution-context-denied$"):
                CLIENT.validate_context(altered)

    def test_root_transport_uses_exact_command_and_original_host_pin(self):
        arguments = CLIENT.ssh_arguments("100.64.0.1", "/fixed/key", "/fixed/known_hosts")
        self.assertEqual(arguments[-2:], ["root@100.64.0.1", "helmut-native-control-v1"])
        for option in ("StrictHostKeyChecking=yes", "IdentitiesOnly=yes", "ForwardAgent=no",
                       "IdentityAgent=none", "ClearAllForwardings=yes"):
            self.assertIn(option, arguments)
        self.assertEqual(CLIENT.HOST_FINGERPRINT,
                         "SHA256:u48IkPIpHilVGYw2MwJuE1pv4XMjlJ88cQjUzN4Lh1c")
        self.assertNotIn("sudo", arguments)
        self.assertNotIn("bash", arguments)

    def test_all_unqualified_operations_fail_before_root_transport(self):
        for operation in ("four-tx",):
            with patch.object(CLIENT, "transport_configuration") as transport:
                with self.assertRaisesRegex(ValueError, "^operation-not-qualified$"):
                    CLIENT.client(environment(operation))
                transport.assert_not_called()
        for operation in ("update", "shell", "sudo", "install", "status;id"):
            with self.assertRaisesRegex(ValueError, "^operation-denied$"):
                CLIENT.validate_context(environment(operation))

    def test_nonce_plan_payload_and_loaded_runtime_source_remain_bound(self):
        sent = CLIENT.request("status", "1" * 64, "2" * 64, "3" * 64)
        result = result_status()
        reply = dict(sent, schema="helmut-native-control-response-v1", result=result,
                     result_sha256=CLIENT.digest(CLIENT.canonical(result)))
        self.assertEqual(CLIENT.validate_response(CLIENT.canonical(reply), sent), reply)
        for field in ("nonce", "plan_sha256", "payload_sha256"):
            changed = dict(reply)
            changed[field] = "f" * 64
            with self.assertRaisesRegex(ValueError, "^response-binding$"):
                CLIENT.validate_response(CLIENT.canonical(changed), sent)
        result["source_sha256"] = "a" * 64
        reply["result_sha256"] = CLIENT.digest(CLIENT.canonical(result))
        with self.assertRaisesRegex(ValueError, "^source-pin-drift$"):
            CLIENT.validate_response(CLIENT.canonical(reply), sent)

    def test_final_workflow_gate_deadline_and_exact_client_hash_pin(self):
        after = read_noatime(WORKFLOW).decode('utf-8')
        self.assertEqual(after.count(SOURCE_SHA256['client']), 2)
        self.assertEqual(after.count('timeout-minutes:'), 1)
        self.assertIn("timeout-minutes: ${{ inputs.controlMode == 'development-v1' && 30 || 10 }}", after)
        self.assertIn("github.workflow_ref == '" + CLIENT.WORKFLOW_REF + "'", after)
        self.assertIn('test "$GITHUB_WORKFLOW_REF" = ' + CLIENT.WORKFLOW_REF, after)
        self.assertIn("HELMUT_NATIVE_CONTROL_MODE: ${{ inputs.controlMode }}", after)
        self.assertIn('case "$HELMUT_NATIVE_CONTROL_MODE" in', after)
        self.assertIn('options: [disabled, control-v1, setup-inspect-v1, setup-successor-v1, runtime-metadata-v1, context-continuation-v1, development-v1]', after)
        self.assertIn('HELMUT_NATIVE_SETUP_CAPSULE: ${{ inputs.setupCapsule }}', after)
        self.assertIn('default: disabled', after)
        self.assertNotIn('HELMUT_HETZNER_NATIVE_ENABLED', after)
        self.assertNotIn("vars.HELMUT_HETZNER_CI_ENABLED", after)
        self.assertNotIn("probe-only-v1", after)
        self.assertEqual(after.count("${{ secrets."), 1)
        self.assertIn("${{ secrets.HELMUT_CI_SSH_KEY }}", after)
        self.assertIn('case "$HELMUT_NATIVE_OPERATION" in status|recipient|stage|admit)', after)
        self.assertNotIn("actions/checkout@", after)

    def test_dispatch_guard_rejects_disabled_missing_and_injected_mode(self):
        workflow=read_noatime(WORKFLOW).decode('utf-8')
        start=workflow.index('      - name: Exact branch, registered workflow and public input pins')
        block=workflow[start:workflow.index('\n      - name:',start+10)]
        script=block.split('        run: |\n',1)[1]
        script='\n'.join(line[10:] for line in script.splitlines())
        environment={'PATH':'/usr/bin:/bin','GITHUB_REPOSITORY':CLIENT.REPOSITORY,
            'GITHUB_REPOSITORY_OWNER':'ernisch','GITHUB_REF':CLIENT.BRANCH,
            'GITHUB_EVENT_NAME':'workflow_dispatch','GITHUB_WORKFLOW_REF':CLIENT.WORKFLOW_REF,
            'GITHUB_SHA':'a'*40,'HELMUT_NATIVE_OPERATION':'status',
            'HELMUT_NATIVE_PLAN_SHA256':'b'*64,'HELMUT_NATIVE_PAYLOAD_SHA256':'c'*64,
            'HELMUT_NATIVE_SETUP_CAPSULE':''}
        for mode in (None,'disabled','control-v2','control-v1; false','control-v1'):
            values=dict(environment)
            if mode is not None:values['HELMUT_NATIVE_CONTROL_MODE']=mode
            result=subprocess.run(['/bin/bash','-c',script],env=values,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
            self.assertEqual(result.returncode==0,mode=='control-v1')
        for mode, operation, capsule, allowed in (
                ('control-v1','status','synthetic',False),
                ('setup-inspect-v1','status','',False),
                ('setup-inspect-v1','status','synthetic',True),
                ('setup-inspect-v1','admit','synthetic',False),
                ('setup-successor-v1','admit','',False),
                ('setup-successor-v1','admit','synthetic',True),
                ('setup-successor-v1','status','synthetic',False),
                ('setup-successor-v1','four-tx','synthetic',False),
                ('runtime-metadata-v1','status','',False),
                ('runtime-metadata-v1','status','synthetic',True),
                ('runtime-metadata-v1','admit','synthetic',False),
                ('runtime-metadata-v1','four-tx','synthetic',False)):
            values={**environment,'HELMUT_NATIVE_CONTROL_MODE':mode,
                    'HELMUT_NATIVE_OPERATION':operation,'HELMUT_NATIVE_SETUP_CAPSULE':capsule}
            with self.subTest(mode=mode,operation=operation,capsule=capsule):
                result=subprocess.run(['/bin/bash','-c',script],env=values,
                    stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
                self.assertEqual(result.returncode==0,allowed)


if __name__ == "__main__":
    unittest.main(verbosity=2)
