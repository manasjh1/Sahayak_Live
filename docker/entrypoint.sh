#!/bin/sh
# Runs FastAPI (API + static film) on 0.0.0.0:$PORT. Database is Supabase.
set -eu

: "${ENV:=development}"
: "${CORS_ORIGINS:=*}"
: "${PORT:=10000}"          # Render sets PORT (default 10000)
export ENV CORS_ORIGINS

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Set it to your Supabase pooler URI (Supabase -> Connect)." >&2
  exit 1
fi
export DATABASE_URL

echo "Starting on 0.0.0.0:${PORT}"
cd /app
# --proxy-headers: take the client IP from Render's X-Forwarded-For so rate
# limiting is per visitor, not per proxy.
exec su-exec appuser uvicorn main:app \
  --host 0.0.0.0 --port "${PORT}" --workers 1 \
  --proxy-headers --forwarded-allow-ips='*' \
  --no-server-header
