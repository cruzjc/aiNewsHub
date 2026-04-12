from __future__ import annotations

import datetime as _dt
import json
import os
import shlex
import subprocess
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]


def repo_root() -> Path:
    return ROOT


def now_utc() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


def timestamp_slug(dt: _dt.datetime | None = None) -> str:
    dt = dt or now_utc()
    return dt.strftime("%Y-%m-%dT%H%M%SZ")


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, sort_keys=False)
        fh.write("\n")


def write_text(path: Path, content: str) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as fh:
        fh.write(content)


def read_text(path: Path, default: str = "") -> str:
    if not path.exists():
        return default
    return path.read_text(encoding="utf-8")


def file_changed(path: Path, new_content: str) -> bool:
    if not path.exists():
        return True
    return read_text(path) != new_content


def run_command(
    command: list[str] | str,
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    shell: bool = False,
    ) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd or repo_root()),
        env=env,
        shell=shell,
        capture_output=True,
        text=True,
        check=False,
    )


def parse_command(command: list[str] | str) -> list[str]:
    if isinstance(command, str):
        return shlex.split(command, posix=os.name != "nt")
    return [str(item) for item in command]


def run_shell_command(
    command: str,
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    target_cwd = Path(cwd or repo_root())
    if os.name == "nt" and str(target_cwd).startswith("\\\\"):
        wrapped = (
            f'pushd "{target_cwd}" && '
            f'(({command}) & set "_cmd_exit=!ERRORLEVEL!" & popd & exit /b !_cmd_exit!)'
        )
        return subprocess.run(
            ["cmd.exe", "/v:on", "/d", "/s", "/c", wrapped],
            cwd=os.environ.get("SystemRoot", r"C:\Windows"),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )

    return subprocess.run(
        command,
        cwd=str(target_cwd),
        env=env,
        shell=True,
        capture_output=True,
        text=True,
        check=False,
    )


def which_python() -> str:
    for candidate in ("python3", "python"):
        result = run_command([candidate, "--version"])
        if result.returncode == 0:
            return candidate
    return "python"


def is_path_protected(relative_path: str, protected_paths: Iterable[str]) -> bool:
    normalized = relative_path.replace("\\", "/").lstrip("./")
    for item in protected_paths:
        protected = item.replace("\\", "/").lstrip("./")
        if normalized == protected or normalized.startswith(protected.rstrip("/") + "/"):
            return True
    return False
