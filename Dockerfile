# ════════════════════════════════════════════════════════════════════
# Shayak — single process: FastAPI serves the API and the static film.
# Database is Supabase. Build context: repository root.
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

RUN apk add --no-cache python3 su-exec && \
    rm -rf /usr/share/doc /usr/share/man /var/cache/apk/* && \
    adduser -D -H -s /sbin/nologin appuser

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static

WORKDIR /app
COPY backend/main.py .
COPY frontend/ /app/static/

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 10000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-10000}/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
