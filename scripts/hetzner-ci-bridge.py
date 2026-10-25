#!/usr/bin/env python3
"""Bounded OpenSSH transport probe. No checkout, uploads or test execution on the host."""
import base64
import grp
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import platform
import pwd
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile

PROTOCOL = "helmut-hetzner-probe/1"
NETWORK = ipaddress.ip_network("100.64.0.0/10")
FIELDS = {
    "protocol", "nonce", "bridge_sha256", "user", "os", "arch",
    "memory_bytes", "disk_free_bytes", "cgroup_v2", "rootless_docker_version",
    "native_execution_enabled",
}


def require(condition, code):
    if not condition:
        raise ValueError(code)


def tailscale_ip(value):
    address = ipaddress.ip_address(value)
    require(address.version == 4 and address in NETWORK, "tailscale-ip-required")
    return str(address)


def parse_command(value):
    match = re.fullmatch(r"helmut-ci-probe-v1 ([a-f0-9]{32})", value)
    require(match is not None, "command-denied")
    return match.group(1)


def json_unique(raw):
    def pairs(rows):
        result = {}
        for key, value in rows:
            require(key not in result, "duplicate-key")
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: require(False, "nonfinite-json"))


def validate_reply(raw, nonce, digest):
    require(len(raw) <= 4096, "reply-size")
    reply = json_unique(raw)
    require(type(reply) is dict and set(reply) == FIELDS, "reply-fields")
    require(reply["protocol"] == PROTOCOL and reply["nonce"] == nonce, "reply-binding")
    require(reply["bridge_sha256"] == digest, "gate-source-drift")
    require(reply["user"] == "helmut-ci", "reply-user")
    require(reply["os"] == "ubuntu-24.04" and reply["arch"] == "x86_64", "host-platform")
    for key in ("memory_bytes", "disk_free_bytes"):
        require(type(reply[key]) is int and 0 <= reply[key] < 2**60, "reply-resource")
    require(type(reply["cgroup_v2"]) is bool, "reply-cgroup")
    version = reply["rootless_docker_version"]
    require(version is None or (type(version) is str and
            re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version)), "reply-docker")
    require(reply["native_execution_enabled"] is False, "execution-not-authorized")
    return reply


def rootless_version(uid):
    """Never try the host's rootful Docker socket, even as a fallback."""
    socket = Path(f"/run/user/{uid}/docker.sock")
    try:
        info = socket.lstat()
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != uid:
            return None
        prefix = ["/usr/bin/docker", f"--host=unix://{socket}"]
        environment = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
        options = subprocess.run(prefix + ["info", "--format", "{{json .SecurityOptions}}"],
                                 env=environment, capture_output=True, timeout=5, check=True)
        security = json.loads(options.stdout)
        if type(security) is not list or "name=rootless" not in security:
            return None
        result = subprocess.run(prefix + ["version", "--format", "{{.Server.Version}}"],
                                env=environment, capture_output=True, timeout=5, check=True)
        value = result.stdout.decode("ascii").strip()
        return value if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value) else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def probe(nonce):
    uid = os.geteuid()
    account = pwd.getpwuid(uid)
    require(uid != 0 and account.pw_name == "helmut-ci", "ci-user-required")
    names = {grp.getgrgid(gid).gr_name for gid in set(os.getgroups()) | {account.pw_gid}}
    require(not names & {"sudo", "docker", "root", "adm"}, "privileged-group-denied")
    connection = os.environ.get("SSH_CONNECTION", "").split()
    require(len(connection) == 4, "ssh-required")
    tailscale_ip(connection[0])
    tailscale_ip(connection[2])
    release = platform.freedesktop_os_release()
    require(release.get("ID") == "ubuntu" and release.get("VERSION_ID") == "24.04", "host-os")
    memory = re.search(r"^MemTotal:\s+(\d+) kB$", Path("/proc/meminfo").read_text(), re.M)
    require(memory is not None, "memory-unavailable")
    return {
        "protocol": PROTOCOL, "nonce": nonce,
        "bridge_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "user": account.pw_name, "os": "ubuntu-24.04", "arch": platform.machine(),
        "memory_bytes": int(memory.group(1)) * 1024,
        "disk_free_bytes": shutil.disk_usage("/var/lib/helmut-ci").free,
        "cgroup_v2": Path("/sys/fs/cgroup/cgroup.controllers").is_file(),
        "rootless_docker_version": rootless_version(uid),
        "native_execution_enabled": False,
    }


def ssh_arguments(host, key, known_hosts, nonce):
    return [
        "/usr/bin/ssh", "-F", "/dev/null", "-T", "-p", "22", "-i", str(key),
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "IdentityAgent=none",
        "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={known_hosts}",
        "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ForwardAgent=no",
        "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no",
        "-o", "ConnectTimeout=15", "-o", "ConnectionAttempts=1", "-o", "LogLevel=ERROR",
        "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2",
        f"helmut-ci@{tailscale_ip(host)}", f"helmut-ci-probe-v1 {nonce}",
    ]


SAFE_FAILURE_CODES = {
    "tailscale-ip-required", "host-key-required", "host-key-format", "gate-pin-required",
    "ssh-key-required", "ssh-probe-failed", "reply-size", "reply-fields", "reply-binding",
    "gate-source-drift", "reply-user", "host-platform", "reply-resource", "reply-cgroup",
    "reply-docker", "execution-not-authorized", "duplicate-key", "nonfinite-json",
    "ssh-key-load-failed", "ssh-host-verification-failed", "ssh-authentication-failed",
    "ssh-network-unreachable", "ssh-connect-timeout", "ssh-connection-refused",
    "remote-probe-rejected",
}


def ssh_failure_code(stderr):
    text = stderr.decode("utf-8", errors="replace").lower()
    for patterns, code in (
        (("error in libcrypto", "invalid format", "load key"), "ssh-key-load-failed"),
        (("host key verification failed", "remote host identification has changed"), "ssh-host-verification-failed"),
        (("permission denied",), "ssh-authentication-failed"),
        (("network is unreachable", "no route to host"), "ssh-network-unreachable"),
        (("connection timed out", "operation timed out"), "ssh-connect-timeout"),
        (("connection refused",), "ssh-connection-refused"),
        (("helmut-ci: probe rejected",), "remote-probe-rejected"),
    ):
        if any(pattern in text for pattern in patterns):
            return code
    return "ssh-probe-failed"


def safe_failure_code(error):
    if isinstance(error, ValueError) and error.args and error.args[0] in SAFE_FAILURE_CODES:
        return error.args[0]
    if isinstance(error, subprocess.TimeoutExpired):
        return "local-process-timeout"
    if isinstance(error, OSError):
        return "local-io-error"
    return "validation-failed"


def client():
    host = tailscale_ip(os.environ.get("HELMUT_CI_HOST", ""))
    public = os.environ.get("HELMUT_CI_HOST_PUBLIC_KEY", "")
    require(re.fullmatch(r"ssh-ed25519 [A-Za-z0-9+/]+={0,2}", public) is not None, "host-key-required")
    decoded = base64.b64decode(public.split()[1], validate=True)
    require(len(decoded) == 51 and decoded[:19] == b"\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20", "host-key-format")
    digest = os.environ.get("HELMUT_CI_GATE_SHA256", "")
    require(re.fullmatch(r"[a-f0-9]{64}", digest) is not None, "gate-pin-required")
    private = os.environ.get("HELMUT_CI_SSH_KEY", "")
    require(0 < len(private) <= 16384 and private.startswith("-----BEGIN OPENSSH PRIVATE KEY-----\n"),
            "ssh-key-required")
    nonce = secrets.token_hex(16)
    with tempfile.TemporaryDirectory(prefix="helmut-ci-", dir=os.environ.get("RUNNER_TEMP")) as directory:
        key, hosts = Path(directory) / "key", Path(directory) / "known_hosts"
        for path, content in ((key, private), (hosts, f"{host} {public}\n")):
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as stream:
                stream.write(content)
        result = subprocess.run(ssh_arguments(host, key, hosts, nonce),
                                stdin=subprocess.DEVNULL, capture_output=True, timeout=40,
                                env={"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
        if result.returncode != 0:
            raise ValueError(ssh_failure_code(result.stderr))
        reply = validate_reply(result.stdout, nonce, digest)
    # No remote stdout/stderr is forwarded. Only the validated closed schema is printed.
    print(json.dumps(reply, sort_keys=True))


def main():
    try:
        if sys.argv[1:] == ["client"]:
            client()
        elif sys.argv[1:] == ["gate"]:
            nonce = parse_command(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
            print(json.dumps(probe(nonce), sort_keys=True))
        else:
            raise ValueError("mode-denied")
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        # Emit only closed constant codes, never exception strings or remote logs.
        print("helmut-ci: probe rejected: " + safe_failure_code(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
