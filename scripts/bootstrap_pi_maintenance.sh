#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-pi13}"
RSYNC_RSH="${RSYNC_RSH:-ssh -o StrictHostKeyChecking=accept-new}"

case "$TARGET" in
  pi11)
    PI_USER="JeanclydeCruz"
    PI_HOST="192.168.4.11"
    ;;
  pi12)
    PI_USER="JeanclydeCruz"
    PI_HOST="192.168.4.12"
    ;;
  pi13)
    PI_USER="jeanclydecruz"
    PI_HOST="192.168.4.13"
    ;;
  *)
    echo "Unknown target '$TARGET'" >&2
    exit 1
    ;;
esac

SSH_TARGET="${PI_USER}@${PI_HOST}"
REMOTE_HOME="/home/${PI_USER}"
REMOTE_PATH="${2:-${REMOTE_HOME}/maintainers/ai-news-hub-runner}"
REMOTE_BARE_PATH="${REMOTE_BARE_PATH:-${REMOTE_HOME}/maintainers/ai-news-hub-origin.git}"

ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "mkdir -p \"$REMOTE_PATH\" \"$REMOTE_PATH/logs/inbox\" \"$REMOTE_PATH/reports\" \"$REMOTE_PATH/.agent/runtime\""

rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  -e "$RSYNC_RSH" \
  "$REPO_ROOT"/ \
  "${SSH_TARGET}:$REMOTE_PATH/"

ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "if ! git -C \"$REMOTE_PATH\" remote get-url origin >/dev/null 2>&1; then rm -rf \"$REMOTE_BARE_PATH\" && git clone --bare \"$REMOTE_PATH\" \"$REMOTE_BARE_PATH\" && git -C \"$REMOTE_PATH\" remote add origin \"$REMOTE_BARE_PATH\"; fi"
ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" "cd \"$REMOTE_PATH\" && corepack pnpm install && python3 scripts/validate.py"
echo "Copied repository to $TARGET:$REMOTE_PATH"
echo "A local bare origin was created at $REMOTE_BARE_PATH when no remote existed."
echo "Install cron on the Pi after maintainer environment variables are configured."
