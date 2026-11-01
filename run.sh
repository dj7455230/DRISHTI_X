#!/bin/bash
# DRISHTI-X — Complete Unified Startup Script
# Runs both FastAPI Backend & Next.js Frontend with automatic health checks & graceful shutdown.

set -e
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================================="
echo "  DRISHTI-X | AI Retinal Screening & Diagnostics Platform"
echo "  Starting Full-Stack System (Backend + Frontend)"
echo "=========================================================="

# 1. Clean up lingering processes on ports 8000 & 3000
echo "[1/4] Checking and freeing ports 8000 and 3000..."
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true

# 2. Trap SIGINT and SIGTERM to clean up all background jobs on Ctrl+C
cleanup() {
    echo ""
    echo "=========================================================="
    echo "  Shutting down DRISHTI-X..."
    echo "=========================================================="
    kill $(jobs -p) 2>/dev/null || true
    lsof -ti :8000 | xargs kill -9 2>/dev/null || true
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# 3. Start Backend
echo "[2/4] Starting FastAPI backend on http://localhost:8000 ..."
python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Wait for backend to be healthy
echo "[3/4] Waiting for backend to become ready..."
for i in {1..30}; do
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
        echo "  ✓ Backend is online and healthy!"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo "  ⚠ Backend health check timed out. Proceeding anyway..."
    fi
done

# 4. Start Frontend
echo "[4/4] Starting Next.js frontend on http://localhost:3000 ..."
echo ""
echo "=========================================================="
echo "  🚀 PLATFORM READY:"
echo "  - Web Dashboard:  http://localhost:3000"
echo "  - Backend API:    http://localhost:8000"
echo "  - Swagger Docs:   http://localhost:8000/docs"
echo "  - Health Check:   http://localhost:8000/health"
echo "  Press Ctrl+C to stop all services."
echo "=========================================================="
echo ""

npm --prefix frontend run dev

