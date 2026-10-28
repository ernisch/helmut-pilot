#!/usr/bin/env python3
"""Bounded synthetic storage checks. No motor, profiles, provider or external network.

One fresh container per invocation contains PostgreSQL, PostgREST and Node.
Its cgroup lifetime peak includes setup/bootstrap and is never baseline-subtracted.
The image must already exist locally; this tool never builds or pulls an image.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
DOCKER = ["docker", "--host=unix:///var/run/docker.sock"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=["native", "old", "new"], required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--image", default="helmut-auth-usage-component:20261028")
    args = parser.parse_args()
    out = args.output.resolve()
    out.mkdir(mode=0o700, parents=True, exist_ok=False)
    env = os.environ.copy()
    for key in ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"):
        env.pop(key, None)

    def docker(*words, input=None, check=True, timeout=60):
        result = subprocess.run(DOCKER + list(words), input=input, text=True,
                                capture_output=True, env=env, timeout=timeout)
        if check and result.returncode:
            raise RuntimeError("Local Docker command failed: " + result.stderr[-1800:])
        return result

    def save(name, value):
        with os.fdopen(os.open(out / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as f:
            json.dump(value, f, indent=2)
            f.write("\n")

    image = json.loads(docker("image", "inspect", args.image).stdout)[0]
    tag = uuid.uuid4().hex[:12]
    name = "helmut-usage-split-" + tag
    database = "helmut_usage_split_" + tag
    config = {"database": database, "containerName": name,
              "apiBase": "http://127.0.0.1:3000", "jwtSecret": secrets.token_hex(32),
              "sqlCommand": ["psql", "-X", "-q", "-U", "postgres", "-d", database,
                             "-tA", "-v", "ON_ERROR_STOP=1"],
              "mode": args.case, "resultFile": "/evidence/RESULT.SAFE.json"}
    save("config.PRIVATE.json", config)  # Contains only newly generated local fixture keys.
    start = time.monotonic()
    cid = None
    failure = None
    try:
        cid = docker("run", "-d", "--name", name, "--network", "none",
                     "--memory", "2048000000", "--memory-swap", "2048000000", "--cpus", "2",
                     "--security-opt", "no-new-privileges",
                     "--mount", "type=bind,src=" + str(ROOT) + ",dst=/repo,readonly",
                     "--mount", "type=bind,src=" + str(out) + ",dst=/evidence",
                     "-e", "POSTGRES_PASSWORD=local-component-only",
                     "-e", "POSTGRES_DB=" + database,
                     image["Id"], "postgres", "-c", "helmut.local_usage_experiment=on",
                     "-c", "shared_buffers=128MB", "-c", "work_mem=4MB",
                     "-c", "maintenance_work_mem=64MB", "-c", "wal_buffers=4MB",
                     "-c", "max_connections=20", "-c", "jit=off",
                     "-c", "full_page_writes=on", "-c", "fsync=on",
                     "-c", "synchronous_commit=on", "-c", "wal_compression=off").stdout.strip()
        save("START.SAFE.json", {"scope": "synthetic-storage-component-only", "case": args.case,
             "container": name, "id": cid, "image": image["Id"], "networkMode": "none",
             "memoryMaxBytes": 2048000000, "cpus": 2, "profiles": 0, "providerCalls": 0,
             "launcherSHA256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()})
        ready = False
        until = time.monotonic() + 30
        while time.monotonic() < until:
            logs = docker("logs", name)
            if "PostgreSQL init process complete" in logs.stdout + logs.stderr:
                r = docker("exec", name, "pg_isready", "-U", "postgres", "-d", database, check=False)
                if r.returncode == 0:
                    ready = True
                    break
            time.sleep(0.2)
        if not ready:
            raise RuntimeError("Local fixture did not become ready")
        docker("exec", "-i", name, *config["sqlCommand"], input="""
            CREATE ROLE service_role NOLOGIN BYPASSRLS;
            CREATE ROLE anon NOLOGIN;
            CREATE ROLE authenticated NOLOGIN;
            CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'local-component-only';
            GRANT service_role,anon,authenticated TO authenticator;
        """)
        docker("exec", "-d", "-e", "PGRST_DB_URI=postgresql://authenticator:local-component-only@127.0.0.1:5432/" + database,
               "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon",
               "-e", "PGRST_JWT_SECRET=" + config["jwtSecret"],
               "-e", "PGRST_SERVER_HOST=127.0.0.1", "-e", "PGRST_SERVER_PORT=3000",
               "-e", "PGRST_DB_POOL=2", "-e", "PGRST_LOG_LEVEL=crit", name, "postgrest")
        script = "native-check.js" if args.case == "native" else "component-workload.js"
        executed = docker("exec", "-u", str(os.getuid()) + ":" + str(os.getgid()),
                          "-w", "/repo", "-e", "HELMUT_SOURCE_MODE=off",
                          name, "node", "scripts/lokal.js", "--", "node",
                          "scripts/auth-usage-split/" + script,
                          "/evidence/config.PRIVATE.json", timeout=180, check=False)
        save("DRIVER.SAFE.json", {"exitCode": executed.returncode,
                                 "stdout": executed.stdout, "stderr": executed.stderr})
        if executed.returncode:
            raise RuntimeError("Component driver failed; original output retained in DRIVER.SAFE.json")
        save("VERSIONS.SAFE.json", {"node": docker("exec", name, "node", "--version").stdout.strip(),
             "postgres": docker("exec", name, "postgres", "--version").stdout.strip(),
             "postgrest": docker("exec", name, "postgrest", "--version").stdout.strip(),
             "cgroup": docker("exec", name, "cat", "/proc/self/cgroup").stdout.strip(),
             "peakScope": "PostgreSQL, PostgREST, Node driver, their children and setup in one container cgroup"})
    except Exception as error:
        failure = str(error)
        save("FAILURE.SAFE.json", {"error": failure})
    finally:
        if cid:
            logs = docker("logs", name, check=False)
            save("POSTGRES_LOG.SAFE.json", {"stdout": logs.stdout, "stderr": logs.stderr})
            cgroup = docker("exec", name, "sh", "-c", "cat /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.current /sys/fs/cgroup/cpu.stat", check=False)
            save("COMMON_CGROUP.SAFE.json", {"output": cgroup.stdout, "exitCode": cgroup.returncode})
            docker("exec", name, "pkill", "-TERM", "-x", "postgrest", check=False)
            stopped = docker("stop", "--time", "15", name, check=False, timeout=25)
            state = json.loads(docker("inspect", name).stdout)[0]["State"]
            save("CLOSE.SAFE.json", {"stopExitCode": stopped.returncode, "state": state,
                                    "elapsedMs": (time.monotonic() - start) * 1000})
            # Disposable synthetic data only. Evidence stays in the host output directory.
            if state["Running"]:
                raise RuntimeError("Owned component container did not stop; retained for diagnosis")
            docker("rm", "-v", name)
    print(json.dumps({"case": args.case, "output": str(out), "status": "FAIL" if failure else "PASS"}))
    if failure:
        raise SystemExit(failure)


if __name__ == "__main__":
    main()
