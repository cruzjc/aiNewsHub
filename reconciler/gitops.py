from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path

from .common import repo_root, run_command


@dataclass
class ReconcileResult:
    status: str
    changed: bool = False
    remote: str | None = None
    branch: str | None = None
    before_sha: str | None = None
    after_sha: str | None = None
    local_ahead: int = 0
    remote_ahead: int = 0
    detail: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _git(*args: str):
    return run_command(["git", *args], cwd=repo_root())


def _current_sha() -> str | None:
    result = _git("rev-parse", "HEAD")
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def reconcile(config: dict) -> ReconcileResult:
    reconcile_cfg = config.get("reconcile", {})
    if not reconcile_cfg.get("enabled", True):
        return ReconcileResult(status="disabled", detail="reconcile disabled in config")

    remote = reconcile_cfg.get("remote", "origin")
    branch = reconcile_cfg.get("branch") or config.get("project", {}).get("primary_branch", "main")
    strategy = reconcile_cfg.get("strategy", "fast_forward_only")
    dirty_policy = reconcile_cfg.get("on_dirty_workspace", "skip")
    diverged_policy = reconcile_cfg.get("on_diverged", "report_only")

    root_check = _git("rev-parse", "--is-inside-work-tree")
    if root_check.returncode != 0:
        return ReconcileResult(status="not_git_repo", detail=root_check.stderr.strip())

    before_sha = _current_sha()

    status_result = _git("status", "--porcelain")
    if status_result.returncode != 0:
        return ReconcileResult(status="status_failed", detail=status_result.stderr.strip())

    if status_result.stdout.strip():
        return ReconcileResult(
            status="dirty_workspace" if dirty_policy in {"skip", "report_only"} else "dirty_workspace_unknown",
            before_sha=before_sha,
            remote=remote,
            branch=branch,
            detail="workspace has uncommitted changes; reconcile skipped",
        )

    fetch_result = _git("fetch", remote)
    if fetch_result.returncode != 0:
        return ReconcileResult(
            status="fetch_failed",
            before_sha=before_sha,
            remote=remote,
            branch=branch,
            detail=fetch_result.stderr.strip(),
        )

    compare_result = _git("rev-list", "--left-right", "--count", f"HEAD...{remote}/{branch}")
    if compare_result.returncode != 0:
        return ReconcileResult(
            status="compare_failed",
            before_sha=before_sha,
            remote=remote,
            branch=branch,
            detail=compare_result.stderr.strip(),
        )

    left_right = compare_result.stdout.strip().split()
    if len(left_right) != 2:
        return ReconcileResult(
            status="compare_unexpected",
            before_sha=before_sha,
            remote=remote,
            branch=branch,
            detail=f"unexpected compare output: {compare_result.stdout!r}",
        )

    local_ahead, remote_ahead = (int(left_right[0]), int(left_right[1]))

    if local_ahead == 0 and remote_ahead == 0:
        return ReconcileResult(
            status="up_to_date",
            before_sha=before_sha,
            after_sha=before_sha,
            remote=remote,
            branch=branch,
            local_ahead=0,
            remote_ahead=0,
            detail="local checkout already matches remote",
        )

    if local_ahead > 0 and remote_ahead > 0:
        return ReconcileResult(
            status="diverged" if diverged_policy == "report_only" else "diverged_unknown",
            before_sha=before_sha,
            remote=remote,
            branch=branch,
            local_ahead=local_ahead,
            remote_ahead=remote_ahead,
            detail="local and remote histories diverged; no merge performed",
        )

    if local_ahead > 0 and remote_ahead == 0:
        return ReconcileResult(
            status="local_ahead",
            before_sha=before_sha,
            after_sha=before_sha,
            remote=remote,
            branch=branch,
            local_ahead=local_ahead,
            remote_ahead=0,
            detail="local checkout is ahead of remote; reconcile skipped",
        )

    if strategy != "fast_forward_only":
        return ReconcileResult(
            status="unsupported_strategy",
            before_sha=before_sha,
            remote=remote,
            branch=branch,
            local_ahead=local_ahead,
            remote_ahead=remote_ahead,
            detail=f"unsupported reconcile strategy: {strategy}",
        )

    merge_result = _git("merge", "--ff-only", f"{remote}/{branch}")
    after_sha = _current_sha()
    if merge_result.returncode != 0:
        return ReconcileResult(
            status="ff_merge_failed",
            before_sha=before_sha,
            after_sha=after_sha,
            remote=remote,
            branch=branch,
            local_ahead=local_ahead,
            remote_ahead=remote_ahead,
            detail=merge_result.stderr.strip() or merge_result.stdout.strip(),
        )

    return ReconcileResult(
        status="fast_forwarded",
        changed=True,
        before_sha=before_sha,
        after_sha=after_sha,
        remote=remote,
        branch=branch,
        local_ahead=local_ahead,
        remote_ahead=remote_ahead,
        detail="local checkout fast-forwarded to remote",
    )
