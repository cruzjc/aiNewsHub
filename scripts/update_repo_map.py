#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reconciler.mapping import update_repo_map_files

if __name__ == "__main__":
    result = update_repo_map_files()
    print(result)
