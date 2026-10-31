#!/bin/bash
# DRISHTI-X — Database Setup Script
# Run this once to create the database and user.
#
# Usage:
#   chmod +x scripts/setup_db.sh
#   ./scripts/setup_db.sh
#
# Or manually:
#   psql -U <superuser> -f scripts/setup_db.sql

echo "============================================"
echo "  DRISHTI-X — PostgreSQL Database Setup"
echo "============================================"
echo ""
echo "Enter your PostgreSQL superuser name (default: postgres):"
read -r PG_SUPERUSER
PG_SUPERUSER=${PG_SUPERUSER:-postgres}

echo "Enter password for $PG_SUPERUSER (or press Enter if using peer auth):"
read -rs PG_PASSWORD

if [ -n "$PG_PASSWORD" ]; then
  export PGPASSWORD="$PG_PASSWORD"
fi

psql -U "$PG_SUPERUSER" <<EOF
-- Create database
CREATE DATABASE drishti_x;

-- Create application user (optional — use your own user if preferred)
-- CREATE USER drishti_user WITH PASSWORD 'change_this_password';
-- GRANT ALL PRIVILEGES ON DATABASE drishti_x TO drishti_user;

\echo 'Database drishti_x created successfully.'
EOF

unset PGPASSWORD
echo ""
echo "Done. Update backend/.env with your DATABASE_URL."
echo "Example: DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/drishti_x"
