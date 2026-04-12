#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/config/maintenance.json"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SCHEDULE="${1:-}"

if [[ -z "$SCHEDULE" ]]; then
  SCHEDULE="$(python3 - "$CONFIG_FILE" <<'PY'
import json
import sys
from pathlib import Path
config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(config.get("schedule", {}).get("linux_cron", "15 * * * *"))
PY
)"
fi

TASK_NAME="$(python3 - "$CONFIG_FILE" <<'PY'
import json
import sys
from pathlib import Path
config = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(config.get("schedule", {}).get("task_name", "ai-news-hub-maintenance"))
PY
)"

MARKER_BEGIN="# BEGIN ${TASK_NAME}"
MARKER_END="# END ${TASK_NAME}"
COMMAND="cd \"$REPO_ROOT\" && $PYTHON_BIN scripts/run_maintenance.py --mode scheduled >> logs/maintenance_scheduler.log 2>&1"

EXISTING="$(crontab -l 2>/dev/null || true)"
CLEANED="$(printf "%s\n" "$EXISTING" | awk -v begin="$MARKER_BEGIN" -v end="$MARKER_END" '
  $0 == begin {skip=1; next}
  $0 == end {skip=0; next}
  !skip {print}
')"

NEW_BLOCK="$(cat <<EOF
$MARKER_BEGIN
$SCHEDULE $COMMAND
$MARKER_END
EOF
)"

printf "%s\n%s\n" "$CLEANED" "$NEW_BLOCK" | crontab -
echo "Installed cron schedule:"
echo "$SCHEDULE $COMMAND"
