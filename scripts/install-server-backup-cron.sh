#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/llmstore.pro}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/llmstore}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/llmstore-backup}"
LOG_FILE="${LOG_FILE:-/var/log/llmstore-backup.log}"

install -d -m 0755 "$BACKUP_ROOT"
install -d -m 0755 "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"
chmod 0644 "$LOG_FILE"

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# LLMStore daily backup: database + chat uploads, keep latest 3 days
10 4 * * * root cd "$PROJECT_DIR" && bash "$PROJECT_DIR/scripts/server-backup.sh" >> "$LOG_FILE" 2>&1
EOF

chmod 0644 "$CRON_FILE"

echo "Cron installed: $CRON_FILE"
