#!/usr/bin/env python3
"""Small local lease preventing overlapping autonomous Helmut waves."""
import argparse, fcntl, json, os, re, sys, time, uuid
from pathlib import Path

OWNER = re.compile(r"^[A-Za-z0-9._:-]{1,120}$")
BUSY_EXIT = 75


def paths():
    root = Path(os.environ.get("HELMUT_ROUTER_ROOT", Path.home() / ".helmut-router")).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root / "auto-run-lease.json", root / "auto-run-lease.lock"


def read(path):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return None


def valid(lease, now):
    return bool(lease and lease.get("owner") and float(lease.get("expires_at", 0)) > now)


def with_lock(fn):
    lease_path, lock_path = paths()
    with lock_path.open("a+") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        return fn(lease_path)


def acquire(owner=None, ttl=2700, now=None):
    now = time.time() if now is None else float(now)
    owner = owner or ("terra:" + uuid.uuid4().hex)
    if not OWNER.fullmatch(owner):
        raise ValueError("Ungueltige Owner-Kennung")
    if not 300 <= ttl <= 7200:
        raise ValueError("TTL muss zwischen 300 und 7200 Sekunden liegen")
    def op(path):
        lease = read(path)
        if valid(lease, now) and lease["owner"] != owner:
            return False, lease
        new = {"owner": owner, "created_at": lease.get("created_at", now) if lease and lease.get("owner") == owner else now,
               "updated_at": now, "expires_at": now + ttl}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(new, sort_keys=True) + "\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
        return True, new
    return with_lock(op)


def renew(owner, ttl=2700, now=None):
    now = time.time() if now is None else float(now)
    if not OWNER.fullmatch(owner):
        raise ValueError("Ungueltige Owner-Kennung")
    def op(path):
        lease = read(path)
        if not valid(lease, now) or lease.get("owner") != owner:
            return False, lease
        lease["updated_at"] = now
        lease["expires_at"] = now + ttl
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(lease, sort_keys=True) + "\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
        return True, lease
    return with_lock(op)


def release(owner, now=None):
    now = time.time() if now is None else float(now)
    def op(path):
        lease = read(path)
        if not lease or lease.get("owner") != owner:
            return False, lease
        path.unlink(missing_ok=True)
        return True, {"owner": owner, "released_at": now}
    return with_lock(op)


def status(now=None):
    now = time.time() if now is None else float(now)
    path, _ = paths()
    lease = read(path)
    return {"active": valid(lease, now), "lease": lease}


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("acquire"); a.add_argument("--owner"); a.add_argument("--ttl", type=int, default=2700)
    r = sub.add_parser("renew"); r.add_argument("--owner", required=True); r.add_argument("--ttl", type=int, default=2700)
    x = sub.add_parser("release"); x.add_argument("--owner", required=True)
    sub.add_parser("status")
    args = p.parse_args()
    try:
        if args.cmd == "acquire":
            ok, data = acquire(args.owner, args.ttl)
            print(json.dumps({"acquired": ok, **data}, ensure_ascii=False))
            return 0 if ok else BUSY_EXIT
        if args.cmd == "renew":
            ok, data = renew(args.owner, args.ttl)
            print(json.dumps({"renewed": ok, "lease": data}, ensure_ascii=False))
            return 0 if ok else BUSY_EXIT
        if args.cmd == "release":
            ok, data = release(args.owner)
            print(json.dumps({"released": ok, "result": data}, ensure_ascii=False))
            return 0 if ok else 2
        print(json.dumps(status(), ensure_ascii=False))
        return 0
    except (ValueError, OSError) as exc:
        print(f"agent-lease: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
