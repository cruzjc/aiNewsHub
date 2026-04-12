from __future__ import annotations

from pathlib import Path

from .common import ensure_dir, now_utc, repo_root, write_json


def _tail_lines(path: Path, *, max_lines: int = 20) -> list[str]:
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return []
    return lines[-max_lines:]


def collect_logs(config: dict, root: Path | None = None) -> dict:
    root = root or repo_root()
    logs_cfg = config.get("logs", {})
    backend = logs_cfg.get("backend", "local")
    log_dir = root / logs_cfg.get("directory", "logs")
    inbox_dir = root / logs_cfg.get("inbox_directory", "logs/inbox")
    lookback_hours = int(logs_cfg.get("lookback_hours", 48))
    extensions = set(logs_cfg.get("extensions", [".log", ".json", ".jsonl", ".txt"]))

    ensure_dir(log_dir)
    ensure_dir(inbox_dir)

    if backend != "local":
        summary = {
            "generated_at": now_utc().isoformat(),
            "backend": backend,
            "supported": False,
            "files": [],
            "detail": "Only the local log backend is implemented in the base template.",
        }
        write_json(inbox_dir / "log_summary.json", summary)
        return summary

    cutoff = now_utc().timestamp() - (lookback_hours * 3600)
    files = []
    for path in sorted(log_dir.rglob("*")):
        if path.is_dir():
            continue
        if path.parent == inbox_dir or inbox_dir in path.parents:
            continue
        if path.suffix and path.suffix not in extensions:
            continue
        try:
            stat = path.stat()
        except FileNotFoundError:
            continue
        if stat.st_mtime < cutoff:
            continue
        files.append(
            {
                "path": str(path.relative_to(root)).replace("\\", "/"),
                "size_bytes": stat.st_size,
                "modified_at_epoch": int(stat.st_mtime),
                "tail": _tail_lines(path),
            }
        )

    summary = {
        "generated_at": now_utc().isoformat(),
        "backend": backend,
        "supported": True,
        "file_count": len(files),
        "files": files,
    }
    write_json(inbox_dir / "log_summary.json", summary)
    return summary
