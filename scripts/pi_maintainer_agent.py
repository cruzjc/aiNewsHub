#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reconciler.runner import load_config


def run(command: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=str(ROOT), check=check, text=True, capture_output=True)


def has_remote(name: str) -> bool:
    result = subprocess.run(
        ["git", "remote", "get-url", name],
        cwd=str(ROOT),
        check=False,
        text=True,
        capture_output=True,
    )
    return result.returncode == 0


def parse_origin_repo() -> str | None:
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=str(ROOT),
        check=False,
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return None
    url = result.stdout.strip()
    patterns = [
        r"github\.com[:/](?P<repo>[^/]+/[^/.]+?)(?:\.git)?$",
        r"api\.github\.com/repos/(?P<repo>[^/]+/[^/]+?)(?:/)?$",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group("repo")
    return None


def changed_files() -> list[str]:
    result = run(["git", "status", "--short"], check=False)
    files: list[str] = []
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        files.append(line[3:].strip())
    return files


def current_branch() -> str | None:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=str(ROOT),
        check=False,
        text=True,
        capture_output=True,
    )
    branch = result.stdout.strip()
    return branch or None


def touches_protected_path(paths: list[str], protected_paths: list[str]) -> str | None:
    for path in paths:
        normalized = path.replace("\\", "/")
        for protected in protected_paths:
            if protected.endswith("/"):
                if normalized.startswith(protected):
                    return normalized
            elif protected.endswith("."):
                if normalized.startswith(protected):
                    return normalized
            elif normalized == protected or normalized.startswith(f"{protected}/"):
                return normalized
    return None


def ensure_branch(branch: str) -> None:
    subprocess.run(["git", "checkout", "-B", branch], cwd=str(ROOT), check=True)


def create_or_update_pr(branch: str, repo_full_name: str, token: str) -> None:
    api_base = "https://api.github.com"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": "ai-news-hub-maintainer",
    }

    search_url = f"{api_base}/repos/{repo_full_name}/pulls?head={urllib.parse.quote(repo_full_name.split('/')[0] + ':' + branch)}&state=open"
    request = urllib.request.Request(search_url, headers=headers)
    with urllib.request.urlopen(request) as response:
        pulls = json.loads(response.read().decode("utf-8"))

    if pulls:
        return

    body = json.dumps(
        {
            "title": "Pi13 maintenance updates",
            "head": branch,
            "base": "main",
            "body": "Automated low-risk maintenance updates from the pi13 scheduled reconciler.",
            "draft": True,
        }
    ).encode("utf-8")
    create_request = urllib.request.Request(
        f"{api_base}/repos/{repo_full_name}/pulls",
        data=body,
        headers={**headers, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(create_request):
        return


def main() -> int:
    config = load_config()
    protected_paths = list(config.get("maintenance", {}).get("protected_paths", []))
    max_files = int(config.get("maintenance", {}).get("max_files_per_run", 5))
    starting_branch = current_branch() or config.get("project", {}).get("primary_branch", "main")

    fix_command = os.environ.get("AINEWSHUB_AUTOFIX_COMMAND", "").strip()
    if fix_command:
        result = subprocess.run(fix_command, cwd=str(ROOT), shell=True, check=False)
        if result.returncode != 0:
            print("configured autofix command failed", file=sys.stderr)
            return result.returncode

    files = changed_files()
    if not files:
        print("no maintainer changes detected")
        return 0

    if len(files) > max_files:
        print(f"refusing to commit {len(files)} files; limit is {max_files}", file=sys.stderr)
        return 1

    protected = touches_protected_path(files, protected_paths)
    if protected:
        print(f"refusing to edit protected path: {protected}", file=sys.stderr)
        return 1

    branch = os.environ.get("AINEWSHUB_MAINTENANCE_BRANCH", "maintainer/pi13")
    try:
        ensure_branch(branch)
        subprocess.run(["git", "add", *files], cwd=str(ROOT), check=True)
        subprocess.run(
            ["git", "commit", "-m", "chore: pi13 maintenance update"],
            cwd=str(ROOT),
            check=False,
        )

        if not has_remote("origin"):
            print("origin remote is not configured; commit created locally only")
            return 0

        push_result = subprocess.run(
            ["git", "push", "--set-upstream", "origin", branch],
            cwd=str(ROOT),
            check=False,
            text=True,
            capture_output=True,
        )
        if push_result.returncode != 0:
            print(push_result.stderr or push_result.stdout, file=sys.stderr)
            return push_result.returncode

        token = os.environ.get("GITHUB_TOKEN", "").strip()
        repo_full_name = parse_origin_repo()
        if token and repo_full_name:
            try:
                create_or_update_pr(branch, repo_full_name, token)
            except urllib.error.URLError as exc:
                print(f"push succeeded but PR creation failed: {exc}", file=sys.stderr)
                return 1
        else:
            print("push succeeded but GITHUB_TOKEN or origin repo metadata is missing; PR not created")

        return 0
    finally:
        if starting_branch != branch:
            subprocess.run(["git", "checkout", starting_branch], cwd=str(ROOT), check=False)


if __name__ == "__main__":
    raise SystemExit(main())
