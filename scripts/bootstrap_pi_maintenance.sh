#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-pi13}"
REMOTE_PATH="${2:-~/maintainers/ai-news-hub-runner}"
SSH_HELPER="${SSH_HELPER:-/mnt/c/Users/Disph/.codex/skills/ssh-raspberry-pi/scripts/pi_ssh.sh}"
RSYNC_RSH="${RSYNC_RSH:-ssh -o StrictHostKeyChecking=accept-new}"
REMOTE_BARE_PATH="${REMOTE_BARE_PATH:-~/maintainers/ai-news-hub-origin.git}"

if [[ ! -x "$SSH_HELPER" ]]; then
  echo "Missing SSH helper: $SSH_HELPER" >&2
  exit 1
fi

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

PI_TARGET="$TARGET" "$SSH_HELPER" "mkdir -p \"$REMOTE_PATH\" \"$REMOTE_PATH/logs/inbox\" \"$REMOTE_PATH/reports\" \"$REMOTE_PATH/.agent/runtime\""

rsync -az --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  -e "$RSYNC_RSH" \
  "$REPO_ROOT"/ \
  "${PI_USER}@${PI_HOST}:$REMOTE_PATH/"

PI_TARGET="$TARGET" "$SSH_HELPER" "if ! git -C \"$REMOTE_PATH\" remote get-url origin >/dev/null 2>&1; then rm -rf \"$REMOTE_BARE_PATH\" && git clone --bare \"$REMOTE_PATH\" \"$REMOTE_BARE_PATH\" && git -C \"$REMOTE_PATH\" remote add origin \"$REMOTE_BARE_PATH\"; fi"
PI_TARGET="$TARGET" "$SSH_HELPER" "cd \"$REMOTE_PATH\" && python3 scripts/validate.py || true"
echo "Copied repository to $TARGET:$REMOTE_PATH"
echo "A local bare origin was created at $REMOTE_BARE_PATH when no remote existed."
echo "Install cron on the Pi after pnpm and maintainer environment variables are configured."
