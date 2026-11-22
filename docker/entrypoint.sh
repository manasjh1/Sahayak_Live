#!/bin/sh
# Starts PostgreSQL, the FastAPI backend and nginx in one container.
# If any process dies, the container exits so Docker's restart policy
# brings the whole thing back up.
set -eu

: "${POSTGRES_DB:=shayak_waitlist}"
: "${POSTGRES_USER:=shayak}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${ENV:=development}"
: "${CORS_ORIGINS:=*}"
export POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD ENV CORS_ORIGINS

PGDATA="${PGDATA:-/var/lib/postgresql/data}"
mkdir -p "$PGDATA" /run/postgresql
chown -R postgres:postgres "$PGDATA" /run/postgresql
chmod 700 "$PGDATA"

# ── First boot: initialise cluster ───────────────────────────────────
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

# ── Start PostgreSQL (localhost only, small memory footprint) ────────
su-exec postgres postgres -D "$PGDATA" \
  -c listen_addresses=127.0.0.1 \
  -c max_connections=30 \
  -c shared_buffers=32MB \
  -c work_mem=2MB \
  -c maintenance_work_mem=16MB \
  -c fsync=on &
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
# Idempotent (IF NOT EXISTS) so it is safe to run on every boot
$PSQL -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/init.sql >/dev/null

# ── Backend (URL-encode the password for the DSN) ────────────────────
DATABASE_URL=$(python3 -c '
import os, urllib.parse as u
q = lambda k: u.quote(os.environ[k], safe="")
print("postgresql+asyncpg://%s:%s@127.0.0.1:5432/%s" % (q("POSTGRES_USER"), q("POSTGRES_PASSWORD"), q("POSTGRES_DB")))
')
export DATABASE_URL
unset PGPASSWORD

cd /app
su-exec appuser uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 &
API_PID=$!

# ── nginx ────────────────────────────────────────────────────────────
nginx -g 'daemon off;' &
NGINX_PID=$!

# ── Supervision / graceful shutdown ──────────────────────────────────
shutdown() {
  kill -TERM "$NGINX_PID" "$API_PID" 2>/dev/null || true
  kill -INT "$PG_PID" 2>/dev/null || true   # fast shutdown
  wait 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

while kill -0 "$PG_PID" 2>/dev/null && kill -0 "$API_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2 &
  wait $! || true
done

echo "A service exited unexpectedly — stopping container" >&2
kill -TERM "$NGINX_PID" "$API_PID" 2>/dev/null || true
kill -INT "$PG_PID" 2>/dev/null || true
wait 2>/dev/null || true
exit 1
