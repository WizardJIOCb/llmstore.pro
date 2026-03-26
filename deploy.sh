#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/var/www/llmstore.pro"
PM2_APP="llmstore-backend"
PORT=3002

echo "=== LLMStore.pro Deploy ==="
echo

cd "$PROJECT_DIR"

echo "[1/8] Pulling latest code..."
git pull origin main

echo "[2/8] Installing dependencies..."
npm install

echo "[3/8] Applying database schema..."
npm run db:push -w @llmstore/backend

echo "[4/8] Building shared package..."
npm run build -w @llmstore/shared

echo "[5/8] Building backend..."
npm run build -w @llmstore/backend

echo "[6/8] Building frontend..."
npm run build -w @llmstore/frontend

echo "[7/8] Restarting backend..."
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start "$PM2_APP"
fi
sleep 5

echo "[8/8] Health check..."
STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health")"
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
