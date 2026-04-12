from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .agent_runner import invoke_agent
from .common import ensure_dir, load_json, now_utc, parse_command, repo_root, run_command, run_shell_command, timestamp_slug, which_python, write_json, write_text
from .gitops import reconcile
from .log_ingest import collect_logs
from .mapping import update_repo_map_files


EXIT_SUCCESS = 0
EXIT_NOOP = 2
EXIT_LOCKED = 3
EXIT_CONFIG = 4
EXIT_VALIDATION = 5
EXIT_AGENT = 6


def load_config(path: Path | None = None) -> dict:
    path = path or (repo_root() / "config" / "maintenance.json")
    data = load_json(path)

    required_top = {"contract_version", "project", "maintenance", "reconcile", "logs", "reports", "repo_map", "agent", "validation"}
    missing = sorted(required_top - set(data.keys()))
    if missing:
        raise ValueError(f"config missing required keys: {', '.join(missing)}")
    if data.get("contract_version") != 1:
        raise ValueError(f"unsupported contract_version: {data.get('contract_version')!r}")
    return data


def acquire_lock(config: dict) -> tuple[bool, dict]:
    root = repo_root()
    lock_file = root / config["maintenance"].get("lock_file", ".agent/maintenance.lock")
    stale_after = int(config["maintenance"].get("lock_stale_after_seconds", 7200))
    ensure_dir(lock_file.parent)

    if lock_file.exists():
        try:
            existing = load_json(lock_file)
        except Exception:
            existing = {}
        created = existing.get("created_at_epoch")
        now_epoch = int(now_utc().timestamp())
        if created and (now_epoch - int(created) < stale_after):
            return False, {"status": "locked", "lock_file": str(lock_file.relative_to(root)).replace("\\", "/")}
    payload = {
        "created_at": now_utc().isoformat(),
        "created_at_epoch": int(now_utc().timestamp()),
        "pid": os.getpid(),
    }
    write_json(lock_file, payload)
    return True, payload


def release_lock(config: dict) -> None:
    lock_file = repo_root() / config["maintenance"].get("lock_file", ".agent/maintenance.lock")
    try:
        lock_file.unlink(missing_ok=True)
    except TypeError:
        if lock_file.exists():
            lock_file.unlink()


def run_validation(config: dict) -> dict:
    validation_cfg = config.get("validation", {})
    command = validation_cfg.get("command", "python scripts/validate.py")
    use_shell = bool(validation_cfg.get("shell", False))
    if use_shell:
        result = run_shell_command(str(command), cwd=repo_root())
    else:
        parsed_command = parse_command(command)
        if parsed_command and parsed_command[0] == "python":
            parsed_command[0] = which_python()
        result = run_command(parsed_command, cwd=repo_root())

    runtime_dir = ensure_dir(repo_root() / ".agent" / "runtime")
    write_text(runtime_dir / "validation_stdout.log", result.stdout or "")
    write_text(runtime_dir / "validation_stderr.log", result.stderr or "")

    return {
        "status": "passed" if result.returncode == 0 else "failed",
        "returncode": result.returncode,
        "stdout_log": str((runtime_dir / "validation_stdout.log").relative_to(repo_root())).replace("\\", "/"),
        "stderr_log": str((runtime_dir / "validation_stderr.log").relative_to(repo_root())).replace("\\", "/"),
        "changed": False,
    }


def write_report(results: dict, config: dict) -> Path:
    root = repo_root()
    reports_dir = ensure_dir(root / config.get("reports", {}).get("directory", "reports"))
    runtime_dir = ensure_dir(root / ".agent")
    ts = timestamp_slug()
    target = reports_dir / f"{ts}.md"

    lines: list[str] = []
    lines.append(f"# Maintenance report {ts}")
    lines.append("")
    lines.append(f"- mode: `{results['mode']}`")
    lines.append(f"- started_at: `{results['started_at']}`")
    lines.append(f"- finished_at: `{results['finished_at']}`")
    lines.append(f"- exit_code: `{results['exit_code']}`")
    lines.append("")
    lines.append("## Phase summary")
    for phase_name in ("reconcile", "repo_map", "logs", "agent", "validation"):
        phase = results.get(phase_name, {})
        if not phase:
            continue
        lines.append(f"### {phase_name}")
        for key, value in phase.items():
            lines.append(f"- {key}: `{value}`")
        lines.append("")
    lines.append("## Notes")
    for note in results.get("notes", []):
        lines.append(f"- {note}")
    lines.append("")

    content = "\n".join(lines)
    write_text(target, content)
    write_text(reports_dir / "latest_report.md", content)

    last_run = {
        "finished_at": results["finished_at"],
        "exit_code": results["exit_code"],
        "report_path": str(target.relative_to(root)).replace("\\", "/"),
        "last_synced_sha": results.get("reconcile", {}).get("after_sha"),
    }
    write_json(runtime_dir / "last_run.json", last_run)
    return target


def run(mode: str, *, skip_reconcile: bool = False, skip_agent: bool = False, skip_validate: bool = False) -> int:
    started_at = now_utc().isoformat()
    results: dict = {
        "mode": mode,
        "started_at": started_at,
        "notes": [],
    }

    try:
        config = load_config()
    except Exception as exc:
        results["finished_at"] = now_utc().isoformat()
        results["exit_code"] = EXIT_CONFIG
        results["notes"].append(str(exc))
        try:
            write_report(results, {"reports": {"directory": "reports"}})
        except Exception:
            pass
        return EXIT_CONFIG

    locked, lock_meta = acquire_lock(config)
    if not locked:
        results["finished_at"] = now_utc().isoformat()
        results["exit_code"] = EXIT_LOCKED
        results["notes"].append("another maintenance run appears to be active")
        results["lock"] = lock_meta
        write_report(results, config)
        return EXIT_LOCKED

    try:
        if not skip_reconcile:
            reconcile_result = reconcile(config)
            results["reconcile"] = reconcile_result.to_dict()
            if reconcile_result.status not in {"disabled", "up_to_date", "fast_forwarded"}:
                results["notes"].append(reconcile_result.detail)
                results["notes"].append(
                    "maintenance stopped before map, agent, and validation because reconcile did not complete safely"
                )
                results["finished_at"] = now_utc().isoformat()
                results["exit_code"] = EXIT_NOOP
                write_report(results, config)
                return EXIT_NOOP

        repo_map_cfg = config.get("repo_map", {})
        repo_map_result = update_repo_map_files(
            json_path=repo_map_cfg.get("json_path", "repo_map.json"),
            markdown_path=repo_map_cfg.get("markdown_path", "REPO_MAP.md"),
        )
        results["repo_map"] = repo_map_result

        logs_result = collect_logs(config)
        results["logs"] = {
            "backend": logs_result.get("backend"),
            "file_count": logs_result.get("file_count", len(logs_result.get("files", []))),
            "supported": logs_result.get("supported", True),
        }

        preflight_path = config.get("agent", {}).get("preflight_report_path", ".agent/runtime/preflight.json")
        preflight_payload = {
            "generated_at": now_utc().isoformat(),
            "mode": mode,
            "reconcile": results.get("reconcile", {}),
            "repo_map": results.get("repo_map", {}),
            "logs": results.get("logs", {}),
            "notes": results.get("notes", []),
        }
        write_json(repo_root() / preflight_path, preflight_payload)

        agent_failed = False
        if not skip_agent:
            agent_result = invoke_agent(config, mode=mode, preflight_path=preflight_path)
        else:
            agent_result = {"status": "skipped", "changed": False, "detail": "agent skipped by flag"}
        results["agent"] = agent_result
        if agent_result.get("status") in {"failed", "missing_command"}:
            agent_failed = True

        validation_failed = False
        if config.get("validation", {}).get("enabled", True) and not skip_validate:
            validation_result = run_validation(config)
        else:
            validation_result = {"status": "skipped", "changed": False}
        results["validation"] = validation_result
        if validation_result.get("status") == "failed":
            validation_failed = True

        if validation_failed:
            exit_code = EXIT_VALIDATION
        elif agent_failed:
            exit_code = EXIT_AGENT
        else:
            meaningful_change = any(
                bool(results.get(name, {}).get("changed"))
                for name in ("reconcile", "repo_map", "agent")
            )
            if meaningful_change:
                exit_code = EXIT_SUCCESS
            else:
                exit_code = EXIT_NOOP

        results["finished_at"] = now_utc().isoformat()
        results["exit_code"] = exit_code
        write_report(results, config)
        return exit_code
    finally:
        release_lock(config)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the project reconciler maintenance loop.")
    parser.add_argument("--mode", choices=["scheduled", "manual"], required=True)
    parser.add_argument("--skip-reconcile", action="store_true")
    parser.add_argument("--skip-agent", action="store_true")
    parser.add_argument("--skip-validate", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    return run(
        args.mode,
        skip_reconcile=args.skip_reconcile,
        skip_agent=args.skip_agent,
        skip_validate=args.skip_validate,
    )


if __name__ == "__main__":
    raise SystemExit(main())
