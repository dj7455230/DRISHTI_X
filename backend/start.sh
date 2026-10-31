#!/bin/bash
# DRISHTI-X — Render start script
# Render runs this from the PROJECT ROOT (rootDir: . in render.yaml)
# PYTHONPATH is set by Render env var to /opt/render/project/src
# This ensures `import ai.*` and `import app.*` both work.
set -e
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --app-dir backend
