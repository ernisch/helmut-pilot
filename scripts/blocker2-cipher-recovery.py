#!/usr/bin/env python3
"""Einmaliger Cipher-Transport des fest gebundenen alten Belegs. Kein Production-Zugriff."""
import hashlib
import json
import os
import pathlib
import re
import stat
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile

REPO = "ernisch/helmut-pilot"
RUN = 37681748370
ARTIFACT = 11511389020
COMMIT = "38a0b6a9684eee24760566c6494e78ffbb4b84ce"
DIGEST = "529e484cb8ec71ae23227ee024a601b3a93e3dbd81310dd38154469930dbbcdc"
SIZE = 310370018
NAMES = {f"{i:04}.json" for i in range(1, 501)} | {"manifest.json"}
MAX_FILE = 12 * 1024 * 1024
MAX_TOTAL = 32 * 20 * 1024 * 1024
ROOT = pathlib.Path(__file__).resolve().parent.parent / "tmp"


def require(ok):
    if not ok:
        raise ValueError("b2-cipher-transport-invalid")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def source_metadata(run, artifact):
    require(run.get("id") == RUN and run.get("head_sha") == COMMIT
            and run.get("head_branch") == "main" and run.get("event") == "workflow_dispatch"
            and run.get("run_attempt") == 1 and run.get("status") == "completed"
            and run.get("conclusion") == "failure"
            and run.get("path") == ".github/workflows/blocker2-readonly500.yml")
    require(artifact.get("id") == ARTIFACT and artifact.get("name") == f"blocker2-readonly500-{RUN}"
            and artifact.get("size_in_bytes") == SIZE and artifact.get("expired") is False
            and artifact.get("digest") == "sha256:" + DIGEST)
    origin = artifact.get("workflow_run", {})
    require(origin.get("id") == RUN and origin.get("head_sha") == COMMIT and origin.get("head_branch") == "main")


def storage_url(url):
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.username is None and parsed.password is None
            and parsed.port in (None, 443) and parsed.fragment == ""
            and (re.fullmatch(r"productionresultssa[a-z0-9]+\.blob\.core\.windows\.net", parsed.hostname or "")
                 or re.fullmatch(r"[a-z0-9-]+\.actions\.githubusercontent\.com", parsed.hostname or "")))


def extract(archive, dest):
    require(not dest.exists())
    with zipfile.ZipFile(archive) as z:
        infos = z.infolist()
        require(len(infos) == 501 and {i.filename for i in infos} == NAMES)
        require(sum(i.file_size for i in infos) <= MAX_TOTAL)
        for i in infos:
            mode = i.external_attr >> 16
            require(not i.is_dir() and not stat.S_ISLNK(mode)
                    and stat.S_IFMT(mode) in (0, stat.S_IFREG)
                    and 0 < i.file_size <= MAX_FILE and not (i.flag_bits & 1))
        # Keine Dateipfade aus dem Archiv verwenden, nur die geschlossenen Namen.
        dest.mkdir(mode=0o700)
        for name in sorted(NAMES):
            raw = z.read(name)
            require(len(raw) == z.getinfo(name).file_size)
            with (dest / name).open("xb") as f:
                os.chmod(f.name, 0o600)
                f.write(raw)


def main(env=os.environ):
    require(env.get("GITHUB_REPOSITORY") == REPO and env.get("GITHUB_REF") == "refs/heads/main"
            and env.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and env.get("GITHUB_RUN_ATTEMPT") == "1")
    require(re.fullmatch(r"[a-f0-9]{40}", env.get("GITHUB_SHA", "")) is not None)
    token = env.get("GITHUB_TOKEN")
    require(bool(token))
    api = urllib.request.build_opener(NoRedirect())

    def request(path):
        return urllib.request.Request("https://api.github.com/repos/" + REPO + path,
                                      headers={"Authorization": "Bearer " + token,
                                               "Accept": "application/vnd.github+json",
                                               "X-GitHub-Api-Version": "2022-11-28"})

    def metadata(path):
        with api.open(request(path), timeout=60) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            require(len(raw) <= 2 * 1024 * 1024)
            return json.loads(raw)

    source_metadata(metadata(f"/actions/runs/{RUN}"), metadata(f"/actions/artifacts/{ARTIFACT}"))
    try:
        api.open(request(f"/actions/artifacts/{ARTIFACT}/zip"), timeout=60).close()
        raise ValueError("missing-artifact-redirect")
    except urllib.error.HTTPError as error:
        require(error.code == 302)
        location = error.headers.get("Location", "")
        error.close()
    storage_url(location)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    archive = ROOT / "blocker2-source-cipher.zip"
    digest = hashlib.sha256()
    size = 0
    # Neuer Request OHNE GitHub Authorization. Auch der signierte URL bleibt
    # ausschliesslich im Speicher; keine automatischen weiteren Redirects.
    with api.open(urllib.request.Request(location), timeout=60) as response, archive.open("xb") as out:
        os.chmod(out.name, 0o600)
        while True:
            raw = response.read(1024 * 1024)
            if not raw:
                break
            size += len(raw)
            require(size <= SIZE)
            digest.update(raw)
            out.write(raw)
    require(size == SIZE and digest.hexdigest() == DIGEST)
    extract(archive, ROOT / "blocker2-recovered-cipher")
    print(json.dumps({"encryptedOnly": True, "sourceRun": RUN, "sourceArtifact": ARTIFACT,
                      "sourceZIPsha256": DIGEST, "productionReads": 0, "productionWrites": 0,
                      "modelCalls": 0, "all500InputAcceptance": False}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("B2 Cipher-Rettung gestoppt; keine Klartexte oder neuen Production-Abrufe.", file=sys.stderr)
        sys.exit(1)
