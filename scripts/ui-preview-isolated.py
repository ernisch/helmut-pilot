"""Fail-closed network namespace launcher for UI-only tests (no server/motor).

Run through scripts/lokal.js. No app starts until the child proves its own
network namespace, loopback-only interfaces and absent IPv4/IPv6 routes.
"""
import ctypes
from datetime import datetime, timezone
import errno
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent

if "--inside" not in sys.argv:
    parent_ns = os.readlink("/proc/self/ns/net")
    import shutil
    node = shutil.which("node")
    assert node, "Node unavailable; no install attempted"
    clean = {"PATH": os.environ["PATH"], "HELMUT_SOURCE_MODE": "off"}
    result = subprocess.run([
        "unshare", "--user", "--map-root-user", "--net", sys.executable,
        "-I", str(Path(__file__).resolve()), "--inside", parent_ns, node, *sys.argv[1:],
    ], cwd=ROOT, env=clean)
    raise SystemExit(result.returncode)

pos = sys.argv.index("--inside")
parent_ns, node = sys.argv[pos+1:pos+3]
own_ns = os.readlink("/proc/self/ns/net")
assert own_ns != parent_ns, "Network namespace isolation absent"
assert socket.if_nameindex() == [(1, "lo")], "Non-loopback interface found"
v4 = [line for line in Path("/proc/net/route").read_text().splitlines() if line and not line.startswith("Iface")]
assert not v4, "IPv4 route found"
v6 = [line.split() for line in Path("/proc/net/ipv6_route").read_text().splitlines() if line.strip()]
# A fresh Linux namespace can publish loopback REJECT sentinel routes. These
# explicitly reject traffic; no usable IPv6 route is accepted by this gate.
assert all(row[-1] == "lo" and int(row[-2], 16) & 0x200 for row in v6), "Usable IPv6 route found"
with socket.socket(socket.AF_INET6) as probe6:
    probe6.settimeout(1)
    code6 = probe6.connect_ex(("2001:db8::1", 443))
assert code6 in (errno.ENETUNREACH, errno.EADDRNOTAVAIL), "IPv6 external route probe did not fail closed"
with socket.socket() as probe:
    probe.settimeout(1)
    code = probe.connect_ex(("192.0.2.1", 443))
assert code == errno.ENETUNREACH, "External route probe did not fail closed"
proof = {"parentNetNS": parent_ns, "testNetNS": own_ns,
         "interfaces": ["lo"], "ipv4Routes": 0, "ipv6Routes": 0,
         "reservedAddressProbeErrno": code, "ipv6ProbeErrno": code6, "ipv6RejectSentinels": len(v6), "verifiedBeforeAppStart": True,
         "verifiedAtUtc": datetime.now(timezone.utc).isoformat(),
         "networkDevicesBefore": Path("/proc/net/dev").read_text(), "completedScripts": []}
out = ROOT / "tmp" / "ui-preview-artifacts"
out.mkdir(parents=True, exist_ok=True)
proof_path = out / "NETWORK_PROOF.json"
proof_path.write_text(json.dumps(proof, indent=2) + "\n")
print("PASS network namespace verified BEFORE app start", flush=True)

# Adopt/reap only our own orphaned Chromium children, never unrelated tasks.
assert ctypes.CDLL(None).prctl(36, 1, 0, 0, 0) == 0, "Subreaper unavailable"

with tempfile.TemporaryDirectory(prefix="ui-browser-", dir=out) as home:
    clean = {"PATH": os.environ["PATH"], "HOME": home,
             "HELMUT_SOURCE_MODE": "off", "UI_NETWORK_PROOF": str(proof_path),
             "HELMUT_STORAGE_BACKEND": "local"}
    scripts = ["helmut-tab-ui-test.js", "radar-ui-test.js", "buero-ehrlichkeit-test.js",
               "ehrlichkeit-ui-test.js", "ui-preview-browser-check.js"]
    if "--only" in sys.argv:
        selected = sys.argv[sys.argv.index("--only") + 1]
        assert selected in scripts, "Unsupported test selection"
        scripts = [selected]
    for script in scripts:
        print("UI CHECK", script, flush=True)
        process = subprocess.Popen([node, "scripts/lokal.js", "--", node, "scripts/" + script],
                                   cwd=ROOT, env=clean, start_new_session=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        try:
            log, _ = process.communicate(timeout=180)
            result = process.returncode
            (out / (script + ".log")).write_text(log)
            print(log, flush=True)
        except BaseException:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            raise
        while True:
            try:
                child, _ = os.waitpid(-1, os.WNOHANG)
                if not child:
                    break
            except ChildProcessError:
                break
        if result:
            proof["failedScript"] = script
            proof["networkDevicesAfter"] = Path("/proc/net/dev").read_text()
            proof_path.write_text(json.dumps(proof, indent=2) + "\n")
            raise SystemExit(result)
        proof["completedScripts"].append({"script": script, "exitCode": result})
proof["networkDevicesAfter"] = Path("/proc/net/dev").read_text()
proof["ipv4RoutesAfter"] = Path("/proc/net/route").read_text()
proof["ipv6RoutesAfter"] = Path("/proc/net/ipv6_route").read_text()
proof["interfacesAfter"] = [name for _, name in socket.if_nameindex()]
proof_path.write_text(json.dumps(proof, indent=2) + "\n")
