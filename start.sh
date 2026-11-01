#!/bin/bash
# DRISHTI-X — Start Script
# Starts both backend and frontend in separate terminal tabs.
# Run from the drishti-x/ directory: bash start.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================================"
echo "  DRISHTI-X — Starting Platform"
echo "  AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS"
echo "======================================================"
echo ""

# Check .env exists
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
  echo "⚠ backend/.env not found."
  echo "  Run first: python3 scripts/setup_database.py"
  echo ""
fi

# Check model weights
if [ -f "$SCRIPT_DIR/models/weights/best_model.pth" ]; then
  echo "✓ Model weights found (best_model.pth)"
else
  echo "⚠ Model weights not found. Run: python3 -u training/train_efficientnet.py"
fi

echo ""
echo "Starting backend on http://localhost:8000 ..."
echo "Starting frontend on http://localhost:3000 ..."
echo ""

# Open two terminal tabs (macOS)
osascript <<EOF
tell application "Terminal"
  -- Backend tab
  do script "cd '$SCRIPT_DIR' && echo '=== DRISHTI-X BACKEND ===' && lsof -ti :8000 | xargs kill -9 2>/dev/null || true; python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"
  -- Frontend tab
  do script "cd '$SCRIPT_DIR/frontend' && echo '=== DRISHTI-X FRONTEND ===' && lsof -ti :3000 | xargs kill -9 2>/dev/null || true; npm run dev"
end tell
EOF

echo "✓ Launched in two Terminal windows."
echo ""
echo "  Backend API:  http://localhost:8000/api/docs"
echo "  Frontend:     http://localhost:3000"
echo "  Health check: http://localhost:8000/api/health"
echo ""
echo "  Default login: register at http://localhost:3000/register"
