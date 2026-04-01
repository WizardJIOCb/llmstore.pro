#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/var/www/llmstore.pro"
PM2_APP="llmstore-backend"
BACKEND_DIR="$PROJECT_DIR/packages/backend"
TSX_BIN="$PROJECT_DIR/node_modules/.bin/tsx"
PORT=3002

ensure_single_backend_manager() {
  if systemctl list-unit-files | grep -q '^llmstore\.service'; then
    echo "Disabling legacy systemd backend service..."
    systemctl stop llmstore.service >/dev/null 2>&1 || true
    systemctl disable llmstore.service >/dev/null 2>&1 || true
    systemctl mask llmstore.service >/dev/null 2>&1 || true
    systemctl reset-failed llmstore.service >/dev/null 2>&1 || true
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi
}

kill_port_listeners() {
  local listeners
  listeners="$(ss -ltnp 2>/dev/null | awk -v port=\":$PORT\" '$4 ~ port {print $NF}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
  if [ -n "$listeners" ]; then
    echo "Stopping existing listeners on port $PORT: $listeners"
    for pid in $listeners; do
      kill "$pid" >/dev/null 2>&1 || true
    done
    sleep 2
  fi
}

echo "=== LLMStore.pro Deploy ==="
echo

cd "$PROJECT_DIR"

echo "[1/8] Pulling latest code..."
git pull origin main

echo "[2/8] Installing dependencies..."
npm install

echo "[3/8] Applying database schema (only pending changes)..."
if npm run db:push -w @llmstore/backend; then
  echo "Schema check/apply completed."
else
  echo "Schema apply failed."
  exit 1
fi

echo "[4/8] Building shared package..."
npm run build -w @llmstore/shared

echo "[5/8] Building backend..."
npm run build -w @llmstore/backend

echo "[6/8] Building frontend..."
npm run build -w @llmstore/frontend

echo "[7/8] Restarting backend..."
ensure_single_backend_manager
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 delete "$PM2_APP" >/dev/null 2>&1 || true
fi
kill_port_listeners
pm2 start "$TSX_BIN" --name "$PM2_APP" --cwd "$BACKEND_DIR" -- src/server.ts
pm2 save >/dev/null 2>&1 || true
sleep 5

echo "[8/8] Health check..."
STATUS=""
for _ in $(seq 1 15); do
  STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health" || true)"
  if [ "$STATUS" = "200" ]; then
    break
  fi
  sleep 2
done
if [ "$STATUS" = "200" ]; then
  echo
  echo "=== Deploy successful ==="
  pm2 show "$PM2_APP" | grep -E "status|uptime|restarts" || true
else
  echo
  echo "=== DEPLOY FAILED: health returned $STATUS ==="
  pm2 logs "$PM2_APP" --lines 50 --nostream || true
  exit 1
fi
