#!/usr/bin/env python3
"""Pinned, standard-library-only client for the restricted HELMUT control account.

No remote log is printed or retained. Only a validated, public, nonce-bound
response and its SHA256 digest can enter the fixed public artifact directory.
"""
import base64
import binascii
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import subprocess
import sys
import tempfile
import time

REPOSITORY = "ernisch/helmut-pilot"
BRANCH = "refs/heads/main"
WORKFLOW_REF = REPOSITORY + "/.github/workflows/hetzner-native-automation.yml@" + BRANCH
HOST_FINGERPRINT = "SHA256:u48IkPIpHilVGYw2MwJuE1pv4XMjlJ88cQjUzN4Lh1c"
OPERATIONS = ("status", "recipient", "stage", "admit", "four-tx")
ENABLED_OPERATIONS = ("status", "recipient")
MAX_RESPONSE = 256 * 1024
MAX_PUBLIC_KEY = 64 * 1024
RESPONSE_FIELDS = {
    "schema", "operation", "nonce", "plan_sha256", "payload_sha256",
    "result", "result_sha256",
}
SAFE_CODES = {
    "execution-context-denied", "operation-denied", "operation-not-qualified",
    "pin-required", "host-denied", "host-key-denied", "ssh-key-required",
    "runner-temp-denied", "response-size", "response-json", "duplicate-key",
    "response-fields", "response-binding", "response-hash", "result-fields",
    "result-status", "native-enabled-denied", "enabled-operations-denied",
    "recipient-format", "recipient-hash", "recipient-private-material",
    "recipient-fingerprint", "recipient-validation", "ssh-failed",
    "ssh-timeout", "mode-denied", "public-output-exists", "source-pin-drift",
}


def require(condition, code):
    if not condition:
        raise ValueError(code)


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("ascii")


def pinned_sha(value):
    require(type(value) is str and re.fullmatch(r"[a-f0-9]{64}", value), "pin-required")
    return value


def validate_context(environment):
    require(environment.get("GITHUB_REPOSITORY") == REPOSITORY and
            environment.get("GITHUB_REPOSITORY_OWNER") == "ernisch" and
            environment.get("GITHUB_REF") == BRANCH and
            environment.get("GITHUB_WORKFLOW_REF") == WORKFLOW_REF and
            environment.get("GITHUB_EVENT_NAME") == "workflow_dispatch",
            "execution-context-denied")
    operation = environment.get("HELMUT_NATIVE_OPERATION")
    require(operation in OPERATIONS, "operation-denied")
    # No stage, admission or transaction implementation is qualified yet.
    # Fail before reading a private key or opening a network connection.
    require(operation in ENABLED_OPERATIONS, "operation-not-qualified")
    return operation, pinned_sha(environment.get("HELMUT_NATIVE_PLAN_SHA256")), \
        pinned_sha(environment.get("HELMUT_NATIVE_PAYLOAD_SHA256"))


def request(operation, plan_sha256, payload_sha256, nonce):
    require(operation in ENABLED_OPERATIONS, "operation-not-qualified")
    require(re.fullmatch(r"[a-f0-9]{64}", nonce), "response-binding")
    return {
        "schema": "helmut-native-control-request-v1", "operation": operation,
        "nonce": nonce, "plan_sha256": pinned_sha(plan_sha256),
        "payload_sha256": pinned_sha(payload_sha256),
    }


def json_unique(raw):
    def pairs(rows):
        result = {}
        for key, value in rows:
            require(key not in result, "duplicate-key")
            result[key] = value
        return result
    try:
        return json.loads(raw.decode("utf-8"), object_pairs_hook=pairs,
                          parse_constant=lambda _: require(False, "response-json"))
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError("response-json") from None


def public_packets(raw):
    """Reject secret and unknown OpenPGP packet types before invoking GnuPG."""
    position, primary = 0, 0
    while position < len(raw):
        header = raw[position]
        position += 1
        require(header & 128, "recipient-format")
        if header & 64:
            tag = header & 63
            require(position < len(raw), "recipient-format")
            length = raw[position]
            position += 1
            if 192 <= length <= 223:
                require(position < len(raw), "recipient-format")
                length = ((length - 192) << 8) + raw[position] + 192
                position += 1
            elif length == 255:
                require(position + 4 <= len(raw), "recipient-format")
                length = int.from_bytes(raw[position:position + 4], "big")
                position += 4
            else:
                require(length < 224, "recipient-format")
        else:
            tag, kind = (header >> 2) & 15, header & 3
            require(kind != 3, "recipient-format")
            width = (1, 2, 4)[kind]
            require(position + width <= len(raw), "recipient-format")
            length = int.from_bytes(raw[position:position + width], "big")
            position += width
        require(tag not in (5, 7), "recipient-private-material")
        require(tag in (2, 6, 13, 14, 17) and length > 0 and
                position + length <= len(raw), "recipient-format")
        primary += tag == 6
        position += length
    require(primary == 1, "recipient-format")


def validate_recipient(recipient):
    require(type(recipient) is dict and set(recipient) == {
        "fingerprint", "public_key_base64", "public_sha256"}, "result-fields")
    fingerprint = recipient["fingerprint"]
    require(type(fingerprint) is str and
            re.fullmatch(r"[A-F0-9]{40}", fingerprint), "recipient-fingerprint")
    encoded = recipient["public_key_base64"]
    require(type(encoded) is str and 0 < len(encoded) <= (MAX_PUBLIC_KEY + 2) // 3 * 4,
            "recipient-format")
    try:
        public = base64.b64decode(encoded, validate=True)
        text = public.decode("ascii")
    except (ValueError, binascii.Error, UnicodeError):
        raise ValueError("recipient-format") from None
    require(0 < len(public) <= MAX_PUBLIC_KEY and
            digest(public) == pinned_sha(recipient["public_sha256"]), "recipient-hash")
    lines = text.splitlines()
    require(len(lines) >= 5 and lines[0] == "-----BEGIN PGP PUBLIC KEY BLOCK-----" and
            lines[1] == "" and lines[-1] == "-----END PGP PUBLIC KEY BLOCK-----",
            "recipient-format")
    body = lines[2:-1]
    if body and re.fullmatch(r"=[A-Za-z0-9+/]{4}", body[-1]):
        body = body[:-1]
    require(body and all(re.fullmatch(r"[A-Za-z0-9+/]{1,76}={0,2}", line)
                        for line in body), "recipient-format")
    try:
        public_packets(base64.b64decode("".join(body), validate=True))
    except binascii.Error:
        raise ValueError("recipient-format") from None
    with tempfile.TemporaryDirectory(prefix="helmut-public-gpg-") as home:
        completed = subprocess.run([
            "/usr/bin/gpg", "--no-options", "--batch", "--no-tty", "--no-autostart",
            "--homedir", home, "--no-auto-key-retrieve", "--auto-key-locate", "clear",
            "--with-colons", "--import-options", "show-only", "--import",
        ], input=public, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}, timeout=10, check=False)
    require(completed.returncode == 0 and len(completed.stdout) <= MAX_RESPONSE,
            "recipient-validation")
    records = completed.stdout.decode("ascii").splitlines()
    require(sum(line.startswith("pub:") for line in records) == 1 and
            not any(line.startswith(("sec:", "ssb:")) for line in records),
            "recipient-private-material")
    fingerprints = [line.split(":")[9] for line in records if line.startswith("fpr:")]
    require(fingerprints and fingerprints[0] == fingerprint, "recipient-fingerprint")


DIAGNOSTIC_PHASES = ('preflight', 'attempt', 'home', 'generate', 'add-subkey',
    'verify-public', 'export-public', 'verify-private-metadata', 'write-public', 'write-result',
    'recovery-preflight', 'recovery-public-before', 'recovery-trust-refresh',
    'recovery-public-after', 'recovery-public-export', 'recovery-private-metadata',
    'recovery-write-public', 'recovery-write-result')
DIAGNOSTIC_CODES = ('BASE_IDENTITY_CHANGED', 'DIRECTORY_OWNER_OR_TYPE',
    'DIRECTORY_PERMISSIONS', 'EXECUTOR_REQUIRED', 'FILESYSTEM_OR_INTERNAL_FAILURE',
    'FILE_SIZE_OR_TYPE', 'FILE_WRITE_SHORT', 'HOME_IDENTITY_CHANGED', 'KEY_STATUS_INVALID',
    'NEW_FILE_METADATA', 'PRIVATE_DIRECTORY_CHANGED', 'PRIVATE_FILE_PERMISSIONS',
    'PRIVATE_KEY_COUNT', 'PRIVATE_KEY_METADATA', 'PRIVATE_OWNER', 'PRIVATE_SPECIAL_FILE',
    'PRIVATE_TREE_DEPTH', 'PRIVATE_TREE_LIMIT', 'PUBLIC_ALGORITHM_MISMATCH',
    'PUBLIC_ARMOR_INVALID', 'PUBLIC_EXPIRY_INVALID', 'PUBLIC_FINGERPRINT_MISMATCH',
    'PUBLIC_IDENTITY_OR_VALIDITY', 'PUBLIC_LIST_FIELDS', 'PUBLIC_LIST_INVALID',
    'PUBLIC_LIST_SHAPE', 'PUBLIC_USAGE_MISMATCH', 'RECIPIENT_ALREADY_ATTEMPTED',
    'ROOT_REQUIRED', 'TARGET_BASE_REJECTED', 'TOOL_EXECUTION_FAILED', 'TOOL_EXIT_NONZERO',
    'TOOL_OUTPUT_LIMIT', 'TOOL_RESULT_TYPE', 'RECOVERY_ORIGINAL_BINDING',
    'RECOVERY_ALREADY_ATTEMPTED', 'RECOVERY_CACHE_NOT_PROVEN',
    'RECOVERY_KEY_METADATA_CHANGED', 'RECOVERY_PUBLIC_RING_CHANGED')
DIAGNOSTIC_TOOL_CLASSES = ('AGENT_CONNECTION', 'AGENT_GENERATION', 'PERMISSION_DENIED',
    'MISSING_FILE', 'PINENTRY', 'UNSUPPORTED_OPTION', 'UNSUPPORTED_ALGORITHM', 'UNCLASSIFIED')


def validate_recipient_diagnostic(diagnostic):
    require(type(diagnostic) is dict and set(diagnostic) == {'recipient', 'gpg'}, 'result-fields')
    for name in ('recipient', 'gpg'):
        row = diagnostic[name]
        extra = {'phase'} if name == 'recipient' else {'stderr_classes'}
        require(type(row) is dict and set(row) == {'state', 'sha256', 'code'} | extra,
                'result-fields')
        state = row['state']
        require(type(state) is str and state in ('ABSENT', 'UNTRUSTED', 'UNRECOGNIZED', 'OBSERVED'),
                'result-fields')
        if state in ('ABSENT', 'UNTRUSTED'):
            require(row['sha256'] is None, 'result-fields')
        else:
            pinned_sha(row['sha256'])
        if state != 'OBSERVED':
            require(row['code'] is None and (row['phase'] is None if name == 'recipient'
                    else row['stderr_classes'] == []), 'result-fields')
        elif name == 'recipient':
            require(type(row['phase']) is str and row['phase'] in DIAGNOSTIC_PHASES
                    and type(row['code']) is str and row['code'] in DIAGNOSTIC_CODES, 'result-fields')
        else:
            code = row['code']
            require(type(code) is str, 'result-fields')
            number = re.fullmatch(r'EXIT_(-?[0-9]{1,3})', code)
            require(code in ('TOOL_TIMEOUT', 'TOOL_OUTPUT_LIMIT', 'TOOL_EXECUTION_FAILURE')
                    or number is not None and -64 <= int(number[1]) <= 255, 'result-fields')
            classes = row['stderr_classes']
            require(type(classes) is list and 0 < len(classes) <= len(DIAGNOSTIC_TOOL_CLASSES)
                    and all(type(value) is str and value in DIAGNOSTIC_TOOL_CLASSES for value in classes)
                    and classes == sorted(set(classes))
                    and ('UNCLASSIFIED' not in classes or classes == ['UNCLASSIFIED']), 'result-fields')


def validate_result(result, operation, payload_sha256):
    require(type(result) is dict, "result-fields")
    if operation == "status":
        require(set(result) == {"status", "enabled_operations", "native_enabled",
                               "source_sha256", "recipient_diagnostic"}, "result-fields")
        require(result["status"] == "CONTROL_READY", "result-status")
        require(result["enabled_operations"] == list(ENABLED_OPERATIONS),
                "enabled-operations-denied")
        require(result["native_enabled"] is False, "native-enabled-denied")
        require(pinned_sha(result["source_sha256"]) == payload_sha256, "source-pin-drift")
        validate_recipient_diagnostic(result['recipient_diagnostic'])
    elif operation == "recipient":
        require(set(result) in ({"status", "recipient"}, {"status", "recipient", "recovery"}), "result-fields")
        require(result["status"] == "RECIPIENT_READY", "result-status")
        validate_recipient(result["recipient"])
        if 'recovery' in result:
            validate_recovery_receipt(result['recovery'], result['recipient']['public_sha256'])
    else:
        raise ValueError("operation-not-qualified")


def validate_recovery_receipt(receipt, public_sha256):
    require(type(receipt) is dict and set(receipt) == {
        'original_error_sha256', 'receipt_sha256', 'before_validity', 'after_validity',
        'ownertrust', 'identity_matches', 'trust_cache_refreshed',
        'private_key_metadata_unchanged', 'pubring_sha256', 'public_sha256',
        'key_generation_attempts', 'subkey_add_attempts'}, 'result-fields')
    require(receipt['original_error_sha256'] ==
        '7d168d7defda650d313e152bd1b015b13becc24c9827eb411de775d6a6beae50', 'result-fields')
    for key in ('receipt_sha256', 'pubring_sha256', 'public_sha256'):
        pinned_sha(receipt[key])
    require(receipt['public_sha256'] == public_sha256, 'recipient-hash')
    before = receipt['before_validity']
    require(type(before) is list and len(before) == 3
            and all(type(value) is str and value in ('u', '-', 'o', 'q') for value in before),
            'result-fields')
    require(receipt['after_validity'] == ['u', 'u', 'u'] and receipt['ownertrust'] == 'u'
            and receipt['identity_matches'] is True and receipt['private_key_metadata_unchanged'] is True,
            'result-fields')
    require(type(receipt['trust_cache_refreshed']) is bool
            and receipt['trust_cache_refreshed'] == (before != ['u', 'u', 'u']), 'result-fields')
    require(all(type(receipt[key]) is int and receipt[key] == 0
                for key in ('key_generation_attempts', 'subkey_add_attempts')), 'result-fields')


def validate_response(raw, sent):
    require(type(raw) is bytes and 0 < len(raw) <= MAX_RESPONSE, "response-size")
    reply = json_unique(raw)
    require(type(reply) is dict and set(reply) == RESPONSE_FIELDS, "response-fields")
    require(reply["schema"] == "helmut-native-control-response-v1" and
            all(reply[key] == sent[key] for key in
                ("operation", "nonce", "plan_sha256", "payload_sha256")),
            "response-binding")
    require(pinned_sha(reply["result_sha256"]) == digest(canonical(reply["result"])),
            "response-hash")
    validate_result(reply["result"], sent["operation"], sent["payload_sha256"])
    return reply


def transport_configuration(environment):
    try:
        address = ipaddress.ip_address(environment.get("HELMUT_CI_HOST", ""))
    except ValueError:
        raise ValueError("host-denied") from None
    require(address.version == 4 and address in ipaddress.ip_network("100.64.0.0/10"),
            "host-denied")
    host = str(address)
    public = environment.get("HELMUT_CI_HOST_PUBLIC_KEY", "")
    require(re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]+={0,2}", public), "host-key-denied")
    try:
        blob = base64.b64decode(public.split()[1], validate=True)
    except (ValueError, binascii.Error):
        raise ValueError("host-key-denied") from None
    require(len(blob) == 51 and blob[:19] ==
            b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20" and
            "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")
            == HOST_FINGERPRINT, "host-key-denied")
    private = environment.get("HELMUT_CI_SSH_KEY", "")
    require(type(private) is str and 0 < len(private) <= 16384 and
            private.startswith("-----BEGIN OPENSSH PRIVATE KEY-----\n"), "ssh-key-required")
    return host, public, private


def ssh_arguments(host, key, known_hosts):
    return [
        "/usr/bin/ssh", "-F", "/dev/null", "-T", "-p", "22", "-i", str(key),
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
        "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={known_hosts}",
        "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ForwardAgent=no",
        "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no",
        "-o", "ConnectTimeout=15", "-o", "ConnectionAttempts=1", "-o", "LogLevel=ERROR",
        "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2",
        f"root@{host}", "helmut-native-control-v1",
    ]


def bounded_exchange(arguments, raw_request, timeout=360):
    require(0 < len(raw_request) <= 4096, "response-size")
    process = subprocess.Popen(arguments, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL,
                               env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
    deadline = time.monotonic() + timeout
    output = bytearray()
    try:
        process.stdin.write(raw_request)
        process.stdin.close()
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while selector.get_map():
                remaining = deadline - time.monotonic()
                require(remaining > 0, "ssh-timeout")
                require(selector.select(remaining), "ssh-timeout")
                chunk = os.read(process.stdout.fileno(), min(65536, MAX_RESPONSE + 1 - len(output)))
                if not chunk:
                    selector.unregister(process.stdout)
                    break
                output.extend(chunk)
                require(len(output) <= MAX_RESPONSE, "response-size")
        require(process.wait(timeout=max(0.01, deadline - time.monotonic())) == 0, "ssh-failed")
        return bytes(output)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdout.close()


def write_public_artifact(directory, reply):
    directory = Path(directory)
    require(not directory.exists(), "public-output-exists")
    directory.mkdir(mode=0o700)
    content = canonical(reply) + b"\n"
    for name, raw in (("RESPONSE.SAFE.json", content),
                      ("RESPONSE.SAFE.sha256", (digest(content) +
                       "  RESPONSE.SAFE.json\n").encode("ascii"))):
        descriptor = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)


def client(environment):
    operation, plan, payload = validate_context(environment)
    sent = request(operation, plan, payload, secrets.token_hex(32))
    host, public, private = transport_configuration(environment)
    temporary = Path(environment.get("RUNNER_TEMP", ""))
    require(temporary.is_absolute() and temporary.is_dir(), "runner-temp-denied")
    with tempfile.TemporaryDirectory(prefix="helmut-native-private-", dir=temporary) as directory:
        key, hosts = Path(directory) / "key", Path(directory) / "known_hosts"
        for path, value in ((key, private), (hosts, host + " " + public + "\n")):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as stream:
                stream.write(value)
        raw = bounded_exchange(ssh_arguments(host, key, hosts), canonical(sent) + b"\n")
        reply = validate_response(raw, sent)
    write_public_artifact(temporary / "helmut-native-public", reply)
    print("helmut-native-control: validated-public-response " + digest(canonical(reply) + b"\n"))


def main():
    try:
        if sys.argv[1:] == ["validate"]:
            validate_context(os.environ)
        elif sys.argv[1:] == ["client"]:
            client(os.environ)
        else:
            raise ValueError("mode-denied")
        return 0
    except (OSError, ValueError, TypeError, KeyError, IndexError,
            UnicodeError, RecursionError, subprocess.SubprocessError) as error:
        code = error.args[0] if isinstance(error, ValueError) and error.args else "validation-failed"
        if code not in SAFE_CODES:
            code = "validation-failed"
        print("helmut-native-control: rejected: " + code, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
