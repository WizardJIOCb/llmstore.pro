#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/llmstore.pro}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/llmstore}"
KEEP_DAYS="${KEEP_DAYS:-3}"

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

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

remove_old_backups() {
  local index=0
  while IFS= read -r dir_name; do
    index=$((index + 1))
    if [ "$index" -le "$KEEP_DAYS" ]; then
      continue
    fi

    local target="$BACKUP_ROOT/$dir_name"
    case "$target" in
      "$BACKUP_ROOT"/*) rm -rf -- "$target" ;;
      *) echo "Skipping unsafe backup path: $target" >&2 ;;
    esac
  done < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | sort -r)
}

require_command pg_dump
require_command python3
require_command readlink
require_command find

load_env

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is empty" >&2
  exit 1
fi

UPLOADS_PATH="$(resolve_path "${UPLOADS_DIR:-./uploads}")"
CHAT_UPLOADS_PATH="$UPLOADS_PATH/chat"
TODAY="$(date +%F)"
NOW_UTC="$(date -u +%FT%TZ)"
BACKUP_DIR="$BACKUP_ROOT/$TODAY"
TMP_DIR="$BACKUP_ROOT/.tmp-$TODAY-$$"
DB_DIR="$BACKUP_DIR/db"
BACKUP_CHAT_DIR="$BACKUP_DIR/uploads/chat"
DB_DUMP_FILE="$DB_DIR/llmstore.dump"
MANIFEST_FILE="$BACKUP_DIR/manifest.json"
TMP_MANIFEST_FILE="$TMP_DIR/manifest.json"

mkdir -p "$BACKUP_ROOT"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/db" "$TMP_DIR/uploads/chat"

echo "Creating PostgreSQL dump..."
pg_dump --format=custom --file="$TMP_DIR/db/llmstore.dump" "$DATABASE_URL"

echo "Copying chat uploads..."
if [ -d "$CHAT_UPLOADS_PATH" ]; then
  cp -a "$CHAT_UPLOADS_PATH/." "$TMP_DIR/uploads/chat/"
fi

CHAT_FILE_COUNT="$(find "$TMP_DIR/uploads/chat" -type f 2>/dev/null | wc -l | tr -d ' ')"
DB_SIZE_BYTES="$(stat -c %s "$TMP_DIR/db/llmstore.dump")"
GIT_SHA="$(git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"

python3 - <<'PY' "$TMP_MANIFEST_FILE" "$NOW_UTC" "$TODAY" "$GIT_SHA" "$DB_SIZE_BYTES" "$CHAT_FILE_COUNT" "$UPLOADS_PATH"
import json, pathlib, sys

manifest_path = pathlib.Path(sys.argv[1])
manifest = {
    "created_at_utc": sys.argv[2],
    "backup_date": sys.argv[3],
    "git_sha": sys.argv[4],
    "database_dump": {
        "path": "db/llmstore.dump",
        "format": "pg_dump_custom",
        "size_bytes": int(sys.argv[5]),
    },
    "chat_uploads": {
        "path": "uploads/chat",
        "source_path": sys.argv[7],
        "file_count": int(sys.argv[6]),
    },
}
manifest_path.parent.mkdir(parents=True, exist_ok=True)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

rm -rf "$BACKUP_DIR"
mkdir -p "$DB_DIR" "$BACKUP_CHAT_DIR"
cp -a "$TMP_DIR/db/llmstore.dump" "$DB_DUMP_FILE"
if [ -d "$TMP_DIR/uploads/chat" ]; then
  cp -a "$TMP_DIR/uploads/chat/." "$BACKUP_CHAT_DIR/"
fi
cp -a "$TMP_MANIFEST_FILE" "$MANIFEST_FILE"
rm -rf "$TMP_DIR"

remove_old_backups

echo "Backup ready: $BACKUP_DIR"
