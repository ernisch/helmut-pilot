#!/usr/bin/env python3
"""Safe helper for isolated Helmut agent worktrees.

Terra creates and owns worktrees. DeepSeek may edit inside them but does not
commit, push, open PRs or merge.
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")
SHA = re.compile(r"^[0-9a-f]{40}$")


def run(*args, cwd=None, check=True):
    p = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE,
                       stderr=subprocess.PIPE)
    if check and p.returncode:
        raise RuntimeError((p.stderr or p.stdout).strip() or "git command failed")
    return p


def repo_root():
    return Path(run("git", "rev-parse", "--show-toplevel").stdout.strip()).resolve()


def worktree_root():
    override = os.environ.get("HELMUT_WORKTREE_ROOT")
    return Path(override).expanduser().resolve() if override else (Path.home() / ".helmut-router" / "worktrees").resolve()


def validate_slug(value):
    if not SLUG.fullmatch(value):
        raise ValueError("Name muss klein geschrieben, eindeutig und nur aus a-z, 0-9 und Bindestrichen bestehen")
    return value


def require_clean(root):
    if run("git", "status", "--porcelain", cwd=root).stdout.strip():
        raise RuntimeError("Hauptarbeitsbaum ist nicht sauber")


def create(name, base):
    name = validate_slug(name)
    if not SHA.fullmatch(base):
        raise ValueError("Base muss ein voller 40-stelliger Commit-SHA sein")
    root = repo_root()
    require_clean(root)
    origin_main = run("git", "rev-parse", "origin/main", cwd=root).stdout.strip()
    if origin_main != base:
        raise RuntimeError("Base stimmt nicht exakt mit dem lokal verifizierten origin/main ueberein")
    target_root = worktree_root()
    target_root.mkdir(parents=True, exist_ok=True)
    target = target_root / name
    branch = f"codex/parallel-{name}"
    if target.exists():
        raise RuntimeError("Worktree-Pfad existiert bereits")
    if run("git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}", cwd=root, check=False).returncode == 0:
        raise RuntimeError("Worktree-Branch existiert bereits")
    run("git", "worktree", "add", "-b", branch, str(target), base, cwd=root)
    print(json.dumps({"name": name, "path": str(target), "branch": branch, "base": base}, ensure_ascii=False))


def remove(name):
    name = validate_slug(name)
    root = repo_root()
    target = worktree_root() / name
    if not target.exists():
        raise RuntimeError("Worktree-Pfad existiert nicht")
    if run("git", "status", "--porcelain", cwd=target).stdout.strip():
        raise RuntimeError("Worktree enthaelt noch nicht gesicherte Aenderungen")
    branch = run("git", "branch", "--show-current", cwd=target).stdout.strip()
    run("git", "worktree", "remove", str(target), cwd=root)
    print(json.dumps({"removed": name, "branch_preserved": branch}, ensure_ascii=False))


def list_worktrees():
    root = repo_root()
    print(run("git", "worktree", "list", "--porcelain", cwd=root).stdout, end="")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create")
    c.add_argument("name")
    c.add_argument("--base", required=True)
    r = sub.add_parser("remove")
    r.add_argument("name")
    sub.add_parser("list")
    a = p.parse_args()
    try:
        if a.cmd == "create":
            create(a.name, a.base)
        elif a.cmd == "remove":
            remove(a.name)
        else:
            list_worktrees()
    except (RuntimeError, ValueError) as exc:
        print(f"agent-worktree: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
