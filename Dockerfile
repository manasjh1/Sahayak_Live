# ════════════════════════════════════════════════════════════════════
# Shayak — single-container build (nginx + FastAPI, database on Supabase)
# Build context: repository root.   Small Alpine image.
#   docker build -t shayak .
# ════════════════════════════════════════════════════════════════════

# ── Stage 1: python deps (no pip in the final image) ────────────────
FROM alpine:3.20 AS builder

RUN apk add --no-cache python3 py3-pip

COPY backend/requirements.txt /tmp/requirements.txt

# Slim the server deps: plain uvicorn instead of uvicorn[standard]
# (drops watchfiles, websockets, uvloop, httptools, pyyaml — unused here).
RUN sed 's/uvicorn\[standard\]/uvicorn/' /tmp/requirements.txt > /tmp/req.slim.txt && \
    python3 -m venv --without-pip /opt/venv && \
    pip --python /opt/venv/bin/python install --no-cache-dir -r /tmp/req.slim.txt && \
    find /opt/venv -type d -name __pycache__ -prune -exec rm -rf {} + && \
    find /opt/venv -type d \( -name tests -o -name test \) -prune -exec rm -rf {} +

# ── Stage 2: runtime ────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache python3 nginx su-exec && \
    rm -rf /usr/share/doc /usr/share/man /var/cache/apk/* && \
    adduser -D -H -s /sbin/nologin appuser

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Backend
WORKDIR /app
COPY backend/main.py .

# Frontend: static files + nginx config adapted for a single container
# (upstream is localhost, logs go to the container's stdout/stderr)
COPY frontend/ /usr/share/nginx/html/
RUN sed -e 's#server backend:8000;#server 127.0.0.1:8000;#' \
        -e 's#error_log .*;#error_log /dev/stderr warn;#' \
        -e 's#access_log .*;#access_log /dev/stdout main;#' \
        /usr/share/nginx/html/nginx.conf > /etc/nginx/nginx.conf && \
    rm -f /usr/share/nginx/html/nginx.conf

# Entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 10000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-80}/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
