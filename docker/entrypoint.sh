#!/bin/sh
# Starts FastAPI + nginx. The database is external (Supabase): DATABASE_URL is required.
# If either process dies, the container exits so the platform restarts it.
set -eu

: "${ENV:=development}"
: "${CORS_ORIGINS:=*}"
: "${PORT:=80}"
export ENV CORS_ORIGINS

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  echo "Set it to your Supabase Session pooler URI (Supabase -> Connect -> Session pooler)." >&2
  exit 1
fi
export DATABASE_URL

# nginx is the public listener: 0.0.0.0:$PORT (Render sets PORT, default 10000)
sed -i -E "s/listen[[:space:]]+[0-9.:]*[0-9]+;/listen 0.0.0.0:${PORT};/" /etc/nginx/nginx.conf
echo "nginx: $(grep -E '^[[:space:]]*listen' /etc/nginx/nginx.conf | tr -s ' ')"
nginx -t || { echo "ERROR: nginx config test failed" >&2; exit 1; }

nginx -g 'daemon off;' &
NGINX_PID=$!
echo "nginx started on 0.0.0.0:${PORT} (pid $NGINX_PID)"

cd /app
su-exec appuser uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 --no-server-header &
API_PID=$!

stop_all() {
  kill -TERM "$NGINX_PID" "$API_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap 'stop_all; exit 0' TERM INT

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 2 &
  wait $! || true
done

echo "A service exited unexpectedly — stopping container" >&2
stop_all
exit 1
