#!/bin/bash
set -e

PROJECT_DIR="/var/www/llmstore.pro"
PM2_APP="llmstore-backend"
PORT=3002

echo "=== LLMStore.pro Deploy ==="
echo ""

# 1. Pull latest code
echo "[1/6] Pulling latest code..."
cd "$PROJECT_DIR"
git pull origin main

# 2. Build shared
echo "[2/6] Building shared package..."
cd "$PROJECT_DIR/packages/shared"
npm run build

# 3. Build backend
echo "[3/6] Building backend..."
cd "$PROJECT_DIR/packages/backend"
npm run build

# 4. Build frontend
echo "[4/6] Building frontend..."
cd "$PROJECT_DIR/packages/frontend"
npm run build

# 5. Restart backend (kill zombie port if needed)
echo "[5/6] Restarting backend..."
pm2 stop "$PM2_APP" 2>/dev/null || true
sleep 1
fuser -k "$PORT/tcp" 2>/dev/null || true
sleep 2
pm2 start "$PM2_APP"
sleep 5

# 6. Health check
echo "[6/6] Health check..."
STATUS=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/health")
if [ "$STATUS" = "200" ]; then
  echo ""
  echo "=== Deploy successful! ==="
  pm2 show "$PM2_APP" | grep -E "status|uptime|restarts"
else
  echo ""
  echo "=== DEPLOY FAILED! Health check returned $STATUS ==="
  pm2 logs "$PM2_APP" --lines 20 --nostream
  exit 1
fi
