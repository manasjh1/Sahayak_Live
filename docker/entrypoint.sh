#!/bin/sh
# Starts nginx + FastAPI (+ PostgreSQL when no external DATABASE_URL is given).
#
#  External DB (Supabase, Neon, Render Postgres, ...):  set DATABASE_URL
#  Built-in PostgreSQL (needs a persistent volume):     set POSTGRES_PASSWORD
#
# If any process dies, the container exits so the platform restarts it.
set -eu

: "${ENV:=development}"
: "${CORS_ORIGINS:=*}"
: "${PORT:=80}"
export ENV CORS_ORIGINS

# nginx listens on $PORT (Render sets PORT, default 10000)
sed -i "s/listen 80;/listen ${PORT};/" /etc/nginx/nginx.conf

PG_PID=""

# ════════════════════════════════════════════════════════════════════
# Built-in PostgreSQL — only when DATABASE_URL is not provided
# ════════════════════════════════════════════════════════════════════
if [ -z "${DATABASE_URL:-}" ]; then
  if [ -n "${RENDER:-}" ]; then
    echo "ERROR: DATABASE_URL is not set. On Render, add it under Environment" >&2
    echo "(your Supabase Session pooler URI). Built-in Postgres is disabled here" >&2
    echo "because Render's free tier has no persistent disk." >&2
    exit 1
  fi
  : "${POSTGRES_DB:=shayak_waitlist}"
  : "${POSTGRES_USER:=shayak}"
  : "${POSTGRES_PASSWORD:?Set DATABASE_URL (external DB) or POSTGRES_PASSWORD (built-in DB)}"
  export POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD

  PGDATA="${PGDATA:-/var/lib/postgresql/data}"
  mkdir -p "$PGDATA" /run/postgresql
  chown -R postgres:postgres "$PGDATA" /run/postgresql
  chmod 700 "$PGDATA"

  FIRST_BOOT=0
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    FIRST_BOOT=1
    pwfile=$(mktemp)
    printf '%s' "$POSTGRES_PASSWORD" > "$pwfile"
    chown postgres "$pwfile"
    su-exec postgres initdb -D "$PGDATA" -U "$POSTGRES_USER" \
      --encoding=UTF8 --no-locale \
      --auth-local=scram-sha-256 --auth-host=scram-sha-256 --pwfile="$pwfile" >/dev/null
    rm -f "$pwfile"
  fi

  su-exec postgres postgres -D "$PGDATA" \
    -c listen_addresses=127.0.0.1 \
    -c max_connections=30 \
    -c shared_buffers=32MB \
    -c work_mem=2MB \
    -c maintenance_work_mem=16MB &
  PG_PID=$!

  export PGPASSWORD="$POSTGRES_PASSWORD"
  PSQL="psql -h 127.0.0.1 -U $POSTGRES_USER -v ON_ERROR_STOP=1"

  i=0
  until pg_isready -q -h 127.0.0.1 -U "$POSTGRES_USER"; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && { echo "PostgreSQL did not become ready" >&2; exit 1; }
    kill -0 "$PG_PID" 2>/dev/null || { echo "PostgreSQL exited during startup" >&2; exit 1; }
    sleep 1
  done

  if [ "$FIRST_BOOT" = 1 ]; then
    $PSQL -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\"" >/dev/null
  fi
  $PSQL -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/init.sql >/dev/null

  # URL-encode the password for the DSN
  DATABASE_URL=$(python3 -c '
import os, urllib.parse as u
q = lambda k: u.quote(os.environ[k], safe="")
print("postgresql+asyncpg://%s:%s@127.0.0.1:5432/%s" % (q("POSTGRES_USER"), q("POSTGRES_PASSWORD"), q("POSTGRES_DB")))
')
  unset PGPASSWORD
else
  echo "Using external database (DATABASE_URL set) — built-in PostgreSQL disabled."
fi
export DATABASE_URL

# ════════════════════════════════════════════════════════════════════
# Backend + nginx
# ════════════════════════════════════════════════════════════════════
cd /app
su-exec appuser uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 --no-server-header &
API_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

stop_all() {
  kill -TERM "$NGINX_PID" "$API_PID" 2>/dev/null || true
  [ -n "$PG_PID" ] && kill -INT "$PG_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap 'stop_all; exit 0' TERM INT

alive() { kill -0 "$1" 2>/dev/null; }

while alive "$API_PID" && alive "$NGINX_PID" && { [ -z "$PG_PID" ] || alive "$PG_PID"; }; do
  sleep 2 &
  wait $! || true
done

echo "A service exited unexpectedly — stopping container" >&2
stop_all
exit 1
