from __future__ import annotations

import os
from pathlib import Path

from .common import ensure_dir, repo_root, run_shell_command, write_text


def invoke_agent(config: dict, *, mode: str, preflight_path: str) -> dict:
    root = repo_root()
    agent_cfg = config.get("agent", {})
    runtime_dir = ensure_dir(root / ".agent" / "runtime")

    if not agent_cfg.get("enabled", False):
        return {
            "status": "disabled",
            "changed": False,
            "detail": "agent invocation disabled in config",
        }

    command = str(agent_cfg.get("command", "")).strip()
    if not command:
        return {
            "status": "missing_command",
            "changed": False,
            "detail": "agent.enabled is true but agent.command is empty",
            "returncode": 1,
        }

    env = os.environ.copy()
    env.update(
        {
            "PROJECT_RECONCILER_ROOT": str(root),
            "PROJECT_RECONCILER_MODE": mode,
            "PROJECT_RECONCILER_PROMPT_FILE": str(root / agent_cfg.get("prompt_file", "prompts/maintenance.md")),
            "PROJECT_RECONCILER_PREFLIGHT_FILE": str(root / preflight_path),
            "PROJECT_RECONCILER_SPEC_FILE": str(root / "PROJECT_SPEC.md"),
            "PROJECT_RECONCILER_RULES_FILE": str(root / "AGENT_RULES.md"),
            "PROJECT_RECONCILER_CONTRACT_FILE": str(root / "RUNNER_CONTRACT.md"),
        }
    )

    result = run_shell_command(command, cwd=root, env=env)
    write_text(runtime_dir / "agent_stdout.log", result.stdout or "")
    write_text(runtime_dir / "agent_stderr.log", result.stderr or "")

    return {
        "status": "ok" if result.returncode == 0 else "failed",
        "changed": result.returncode == 0,
        "returncode": result.returncode,
        "detail": command,
        "stdout_log": str((runtime_dir / "agent_stdout.log").relative_to(root)).replace("\\", "/"),
        "stderr_log": str((runtime_dir / "agent_stderr.log").relative_to(root)).replace("\\", "/"),
    }
