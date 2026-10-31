#!/bin/bash
# DRISHTI-X — Start Backend Server
# Run from the drishti-x/ directory

echo "Starting DRISHTI-X Backend..."
echo "Make sure PostgreSQL is running and .env is configured."
echo ""

export PYTHONPATH="$(pwd)/backend:$(pwd)"

uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload \
  --reload-dir backend \
  --app-dir backend
