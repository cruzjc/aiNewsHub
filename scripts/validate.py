#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def resolve_pnpm() -> list[str]:
    pnpm = shutil.which("pnpm")
    if pnpm:
        return [pnpm]
    corepack = shutil.which("corepack")
    if corepack:
        return [corepack, "pnpm"]
    raise FileNotFoundError("pnpm not found and corepack is unavailable")


def run_step(command: list[str], *, cwd: Path) -> int:
    result = subprocess.run(command, cwd=str(cwd), check=False)
    return result.returncode


def main() -> int:
    root = Path(__file__).resolve().parents[1]

    python_tests = [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"]
    if run_step(python_tests, cwd=root) != 0:
        return 1

    try:
        pnpm = resolve_pnpm()
    except FileNotFoundError as exc:
        print(f"validation error: {exc}", file=sys.stderr)
        return 1

    return run_step([*pnpm, "validate:workspace"], cwd=root)


if __name__ == "__main__":
    raise SystemExit(main())
