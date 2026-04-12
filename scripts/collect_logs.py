#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reconciler.runner import load_config
from reconciler.log_ingest import collect_logs

if __name__ == "__main__":
    config = load_config()
    result = collect_logs(config)
    print(result)
