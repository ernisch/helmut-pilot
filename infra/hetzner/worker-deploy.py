#!/usr/bin/python3
"""Release the CI-approved HELMUT worker from the production host."""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

REPO = "ernisch/helmut-pilot"
REMOTE = f"https://github.com/{REPO}.git"
PROJECT = "helmut-quellenworker"
IMAGE = f"{PROJECT}-worker"
SHA = re.compile(r"[0-9a-f]{40}")
IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}")
INPUTS = (
    "Dockerfile", ".dockerignore", "compose.yaml", "package.json", "package-lock.json",
    "worker.js", "server.js", "helmut-flags.json", "lib",
    "scripts/bb-nachweis-importpaket-generator.js",
)
REQUIRED = {"Syntax + Offline-Suiten", "Browser-/Mobile-Smoke (Chromium)"}
BERLIN = ZoneInfo("Europe/Berlin")


class DeployError(Exception):
    pass


def command(*args, allowed=(0,), timeout=60, **kwargs):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                                **kwargs)
    except (OSError, subprocess.TimeoutExpired):
        raise DeployError(f"{args[0]} {args[1]} nicht verfügbar oder Zeitlimit erreicht") from None
    if result.returncode not in allowed:
        raise DeployError(f"{args[0]} {args[1]} fehlgeschlagen ({result.returncode})")
    return result


def api(path):
    request = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/{path}",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "helmut-worker-deploy",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except (OSError, ValueError) as error:
        detail = f" (HTTP {error.code})" if isinstance(error, urllib.error.HTTPError) else ""
        raise DeployError(f"GitHub-Freigabe konnte nicht gelesen werden{detail}") from None


def approved(commit):
    runs = api(f"actions/workflows/ci.yml/runs?head_sha={commit}&branch=main&event=push&per_page=10")
    exact = [run for run in runs["workflow_runs"] if run["head_sha"] == commit
             and run["head_branch"] == "main" and run["event"] == "push"]
    if not exact:
        return False
    latest = max(exact, key=lambda run: run["run_number"])
    if latest["status"] != "completed" or latest["conclusion"] != "success":
        return False
    run_id, attempt = int(latest["id"]), int(latest["run_attempt"])
    jobs = api(f"actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100")["jobs"]
    for name in REQUIRED:
        checks = [job for job in jobs if job["name"] == name]
        if len(checks) != 1 or checks[0]["status"] != "completed" or checks[0]["conclusion"] != "success":
            return False
    return any(pr["merge_commit_sha"] == commit and pr["merged_at"] and pr["base"]["ref"] == "main"
               for pr in api(f"commits/{commit}/pulls"))


def deployment_window(now):
    # A source slot can start in minutes 0–4 and runs up to 290 seconds.
    return 10 <= now.minute % 15 <= 12 and not (
        dt.time(6, 30) <= now.time() < dt.time(7, 35)
    )


def events(output):
    for line in output.splitlines():
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        if isinstance(entry, dict) and entry.get("dienst") == "quellenworker":
            yield entry


def ready(output, commit):
    return any(entry.get("ereignis") == "bereit" and entry.get("ort") == "hetzner-de"
               and entry.get("commit") == commit for entry in events(output))


def regular_run(output):
    for entry in events(output):
        run_id, status = entry.get("laufId"), entry.get("status")
        if (entry.get("ereignis") == "quellenfenster" and entry.get("gestartet") is True
                and entry.get("quittungGespeichert") is True
                and isinstance(run_id, str) and re.fullmatch(r"[A-Za-z0-9_:-]{1,120}", run_id)
                and status in ("success", "partial", "failed")):
            return run_id, status
    return None


def container():
    lines = command("docker", "ps", "-a", "--no-trunc",
                    "--filter", f"label=com.docker.compose.project={PROJECT}",
                    "--filter", "label=com.docker.compose.service=worker",
                    "--format", '{{.ID}} {{.Label "com.docker.compose.oneoff"}}').stdout.splitlines()
    ids = [line.split()[0] for line in lines if line.lower().endswith(" false")]
    if len(ids) > 1:
        raise DeployError("Mehrere reguläre Worker-Container gefunden")
    if not ids:
        return None
    image, state, restarts, *commit_config = command(
        "docker", "inspect", "--format",
        '{{.Image}} {{.State.Status}} {{println .RestartCount}}'
        '{{range .Config.Env}}{{if eq (index (split . "=") 0) "HELMUT_COMMIT_SHA"}}'
        '{{println .}}{{end}}{{end}}',
        ids[0],
    ).stdout.split()
    commit = commit_config[0].partition("=")[2] if len(commit_config) == 1 else ""
    if not IMAGE_ID.fullmatch(image):
        raise DeployError("Worker-Image unlesbar")
    return {"id": ids[0], "image": image, "state": state, "restarts": int(restarts), "commit": commit}


def image_id(tag):
    result = command("docker", "image", "inspect", "--format", "{{.Id}}", tag)
    value = result.stdout.strip()
    if not IMAGE_ID.fullmatch(value):
        raise DeployError("Image-Kennung unlesbar")
    return value


def logs(container_id):
    return command("docker", "logs", "--tail", "160", container_id)


def wait_ready(commit, image, previous_id):
    deadline = time.monotonic() + 75
    while time.monotonic() < deadline:
        current = container()
        if current and current["id"] != previous_id:
            if current["image"] != image or current["restarts"]:
                break
            if current["state"] == "running" and current["commit"] == commit:
                output = logs(current["id"])
                if ready(output.stdout + output.stderr, commit):
                    time.sleep(3)
                    if container() == current:
                        return current
                    break
        time.sleep(2)
    raise DeployError(f"Worker {commit} hat den Start nicht bestätigt")


class Deployment:
    def __init__(self, state):
        self.state = state
        self.repo = state / "repo.git"

    def git(self, *args, **kwargs):
        env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_CONFIG_GLOBAL="/dev/null",
                   GIT_CONFIG_SYSTEM="/dev/null")
        return command("git", f"--git-dir={self.repo}", *args, env=env, **kwargs)

    def main_commit(self):
        value = self.git("ls-remote", "--exit-code", REMOTE, "refs/heads/main").stdout.split()
        if len(value) != 2 or value[1] != "refs/heads/main" or not SHA.fullmatch(value[0]):
            raise DeployError("main-Kennung unlesbar")
        return value[0]

    def fetch(self):
        if not self.repo.is_dir():
            self.git("init", "--bare")
        self.git("fetch", "--no-tags", REMOTE, "+refs/heads/main:refs/heads/main", timeout=240)
        commit = self.git("rev-parse", "refs/heads/main").stdout.strip()
        if not SHA.fullmatch(commit):
            raise DeployError("main-Kennung unlesbar")
        return commit

    def read(self, name):
        path = self.state / f"{name}.json"
        return json.loads(path.read_text()) if path.exists() else None

    def record(self, name, data):
        path = self.state / f"{name}.json"
        scratch = path.with_suffix(".tmp")
        with scratch.open("w") as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        scratch.replace(path)
        directory = os.open(self.state, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def forget(self, name):
        (self.state / f"{name}.json").unlink(missing_ok=True)

    def prepare(self, commit, tag, root):
        release = root / commit
        release.mkdir()
        archive = root / f"{commit}.tar"
        self.git("archive", f"--output={archive}", commit, "--", *INPUTS)
        command("tar", "-xf", archive, "-C", release)
        override = release / "deploy-image.yaml"
        override.write_text(f"services:\n  worker:\n    image: {tag}\n    pull_policy: never\n")
        return ("docker", "compose", "--env-file", "/dev/null", "-p", PROJECT,
                "-f", str(release / "compose.yaml"), "-f", str(override))

    def changed(self, current, target, *paths):
        return self.git("diff", "--quiet", current, target, "--", *paths,
                        allowed=(0, 1)).returncode == 1

    def observe(self, current):
        proof = self.read("awaiting-run")
        if not proof or not current or current["state"] != "running":
            return
        if current["commit"] != proof["commit"]:
            self.forget("awaiting-run")
            print(f"Laufbeleg für {proof['commit']} offen. Worker-Stand hat gewechselt.", flush=True)
            return
        output = logs(current["id"])
        result = regular_run(output.stdout + output.stderr)
        if result:
            run_id, status = result
            print(f"Regulärer Lauf bestätigt: {proof['commit']} {run_id} {status}", flush=True)
            self.forget("awaiting-run")
        else:
            print(f"Regulärer Lauf auf {proof['commit']} noch offen", flush=True)

    def rollback(self, pending):
        previous, target = pending["previous"], pending["target"]
        current = container()
        # Commands killed between writing the journal and switching leave the old container in place.
        if not (current and current["state"] == "running" and current["id"] == previous["id"]
                and current["image"] == previous["image"] and current["commit"] == previous["commit"]):
            if image_id(f"{IMAGE}:rollback") != previous["image"]:
                raise DeployError("Gesichertes Rückweg-Image stimmt nicht")
            with tempfile.TemporaryDirectory(dir=self.state) as root:
                compose = self.prepare(previous["commit"], f"{IMAGE}:rollback", Path(root))
                command(*compose, "up", "-d", "--no-deps", "--no-build", "--force-recreate", "worker",
                        timeout=360)
                wait_ready(previous["commit"], previous["image"], previous["id"])
            command("docker", "tag", previous["image"], f"{IMAGE}:latest")
        self.record("failed", {"commit": target})
        self.forget("pending")
        print(f"Rückweg bestätigt: {previous['commit']}. Update {target} zurückgestellt.", flush=True)

    def run(self):
        pending = self.read("pending")
        if pending:
            self.rollback(pending)
            return
        current = container()
        self.observe(current)
        if not current or current["state"] != "running":
            raise DeployError("Kein laufender regulärer Worker. Automatischer Wechsel ausgesetzt.")
        if not SHA.fullmatch(current["commit"]):
            raise DeployError("Worker-Commit unlesbar")
        target = self.fetch()
        if current["commit"] == target:
            print(f"Worker auf {target}. Kein Update.", flush=True)
            return
        if self.git("merge-base", "--is-ancestor", current["commit"], target, allowed=(0, 1)).returncode:
            raise DeployError("Laufender Worker-Commit liegt außerhalb von main")
        if not self.changed(current["commit"], target, *INPUTS):
            print(f"Worker auf {current['commit']}. Keine Worker-Änderung bis {target}.", flush=True)
            return
        if self.changed(current["commit"], target, "compose.yaml"):
            raise DeployError("Geänderte Compose-Datei erfordert eine manuelle Freigabe auf Hetzner")
        if self.read("failed") == {"commit": target}:
            print(f"Update {target} nach Rückweg zurückgestellt", flush=True)
            return
        if not deployment_window(dt.datetime.now(BERLIN)):
            print("Nächstes geeignetes Updatefenster abwarten", flush=True)
            return
        if not approved(target):
            print(f"GitHub-Freigabe für {target} offen", flush=True)
            return

        with tempfile.TemporaryDirectory(dir=self.state) as root:
            tag = f"{IMAGE}:candidate"
            compose = self.prepare(target, tag, Path(root))
            env = dict(os.environ, HELMUT_COMMIT_SHA=target)
            command(*compose, "build", "worker", env=env, timeout=480)
            candidate = image_id(tag)
            output = command(*compose, "run", "-T", "--rm", "--no-deps", "worker", "node",
                             "worker.js", "--check", env=env, timeout=90)
            if not ready(output.stdout, target):
                raise DeployError(f"Vorabprüfung für {target} ohne passende Bereitschaft")
            if (self.main_commit() != target or not approved(target)
                    or not deployment_window(dt.datetime.now(BERLIN))):
                print(f"Wechsel auf {target} vertagt. Stand, Freigabe oder Zeitfenster hat sich geändert.",
                      flush=True)
                return
            if container() != current:
                raise DeployError("Laufender Worker hat sich während der Vorbereitung geändert")
            command("docker", "tag", current["image"], f"{IMAGE}:rollback")
            pending = {"previous": current, "target": target}
            self.record("pending", pending)
            try:
                command(*compose, "up", "-d", "--no-deps", "--no-build", "--force-recreate", "worker",
                        env=env, timeout=360)
                wait_ready(target, candidate, current["id"])
                command("docker", "tag", candidate, f"{IMAGE}:latest")
                self.record("awaiting-run", {"commit": target})
                self.forget("pending")
            except (DeployError, OSError):
                self.rollback(pending)
                raise
        print(f"Worker {target} bereit. Regulärer Lauf noch offen.", flush=True)


def main():
    state = Path("/var/lib/helmut-worker-deploy")
    try:
        with (state / "deploy.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            Deployment(state).run()
    except BlockingIOError:
        print("Worker-Update läuft bereits", flush=True)
    except DeployError as error:
        print(f"Worker-Update: {error}", file=sys.stderr, flush=True)
        return 1
    except (OSError, ValueError, KeyError, TypeError):
        print("Worker-Update: Betriebszustand konnte nicht sicher geprüft werden",
              file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
