#!/usr/bin/env python3
from pathlib import Path
import sys
import argparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reconciler.agent_runner import invoke_agent
from reconciler.runner import load_config


def main() -> int:
    parser = argparse.ArgumentParser(description="Invoke the configured maintenance agent.")
    parser.add_argument("--mode", default="manual")
    parser.add_argument("--preflight-path", default=".agent/runtime/preflight.json")
    args = parser.parse_args()

    config = load_config()
    result = invoke_agent(config, mode=args.mode, preflight_path=args.preflight_path)
    print(result)
    return int(result.get("returncode", 0 if result.get("status") != "failed" else 1))


if __name__ == "__main__":
    raise SystemExit(main())
