#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/llmstore.pro}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/llmstore}"
PM2_APP="${PM2_APP:-llmstore-backend}"
PORT="${PORT:-3002}"
TSX_BIN="${TSX_BIN:-$PROJECT_DIR/node_modules/.bin/tsx}"

usage() {
  cat <<EOF
Usage:
  bash scripts/server-restore.sh YYYY-MM-DD [--yes]

Example:
  bash scripts/server-restore.sh 2026-04-01 --yes
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

resolve_path() {
  local value="$1"
  if [[ "$value" = /* ]]; then
    printf '%s\n' "$value"
  else
    readlink -f "$PROJECT_DIR/$value"
  fi
}

load_env() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Env file not found: $ENV_FILE" >&2
    exit 1
  fi

  while IFS= read -r line; do
    export "$line"
  done < <(
    python3 - "$ENV_FILE" <<'PY'
import sys
from pathlib import Path

for raw_line in Path(sys.argv[1]).read_text(encoding="utf-8").splitlines():
    stripped = raw_line.strip()
    if not stripped or stripped.startswith("#") or "=" not in raw_line:
        continue
    key, value = raw_line.split("=", 1)
    key = key.strip()
    if not key:
        continue
    print(f"{key}={value}")
PY
  )
}

DATE_ARG="${1:-}"
CONFIRM_FLAG="${2:-}"

if [[ -z "$DATE_ARG" || "$DATE_ARG" = "-h" || "$DATE_ARG" = "--help" ]]; then
  usage
  exit 1
fi

BACKUP_DIR="$BACKUP_ROOT/$DATE_ARG"
DB_DUMP_FILE="$BACKUP_DIR/db/llmstore.dump"
BACKUP_CHAT_DIR="$BACKUP_DIR/uploads/chat"

case "$BACKUP_DIR" in
  "$BACKUP_ROOT"/*) ;;
  *)
    echo "Unsafe backup path: $BACKUP_DIR" >&2
    exit 1
    ;;
esac

if [ ! -f "$DB_DUMP_FILE" ]; then
  echo "Backup dump not found: $DB_DUMP_FILE" >&2
  exit 1
fi

if [ "$CONFIRM_FLAG" != "--yes" ]; then
  echo "Restore will overwrite the current database and chat uploads."
  echo "Run again with --yes to continue."
  exit 1
fi

require_command pg_restore
require_command psql
require_command curl
require_command readlink
require_command find

load_env

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is empty" >&2
  exit 1
fi

UPLOADS_PATH="$(resolve_path "${UPLOADS_DIR:-./uploads}")"
CHAT_UPLOADS_PATH="$UPLOADS_PATH/chat"

echo "Stopping backend..."
pm2 stop "$PM2_APP" >/dev/null 2>&1 || true

echo "Closing active PostgreSQL connections..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" >/dev/null

echo "Restoring PostgreSQL dump..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DB_DUMP_FILE"

echo "Restoring chat uploads..."
mkdir -p "$CHAT_UPLOADS_PATH"
find "$CHAT_UPLOADS_PATH" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
if [ -d "$BACKUP_CHAT_DIR" ]; then
  cp -a "$BACKUP_CHAT_DIR/." "$CHAT_UPLOADS_PATH/"
fi

echo "Starting backend..."
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" >/dev/null
else
  pm2 start "$TSX_BIN" --name "$PM2_APP" --cwd "$PROJECT_DIR/packages/backend" -- src/server.ts >/dev/null
fi

STATUS=""
for _ in $(seq 1 15); do
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" || true)"
  if [ "$STATUS" = "200" ]; then
    break
  fi
  sleep 2
done

if [ "$STATUS" != "200" ]; then
  echo "Restore finished, but health check failed with status ${STATUS:-unknown}" >&2
  exit 1
fi

echo "Restore successful: $BACKUP_DIR"
