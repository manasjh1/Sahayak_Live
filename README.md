# Shayak AI Control Layer

## Project Structure

```
Shayak AI Control Layer/
│
├── frontend/                   ← Static film assets served by Nginx
│   ├── Shayak Film.dc.html     ← Entry point HTML
│   ├── shayak-film.jsx         ← Main film + live waitlist form
│   ├── animations-v3.jsx
│   ├── tweaks-panel.jsx
│   ├── support.js
│   ├── _ds/                    ← Design system bundle
│   ├── nginx.conf              ← Nginx config (static + proxy)
│   └── Dockerfile              ← Builds Nginx image
│
├── backend/                    ← Python FastAPI REST API
│   ├── main.py                 ← All routes (waitlist, health)
│   ├── requirements.txt
│   └── Dockerfile              ← Builds FastAPI image
│
├── db/
│   └── init.sql                ← Postgres schema (runs on first boot)
│
├── docker-compose.yml          ← Builds & runs all three services
├── .env.example                ← Copy to .env before running
├── .gitignore
└── README.md
```

## Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | Static HTML/JSX · Nginx 1.27      |
| Backend  | Python 3.12 · FastAPI · Uvicorn   |
| Database | PostgreSQL 16                     |
| Containers | Docker · Docker Compose         |

---

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
#    → set a strong POSTGRES_PASSWORD

# 2. Build and run all three services
docker compose up --build -d

# 3. Open the film in your browser
open http://localhost
```

Startup order is enforced automatically:
**db** (healthy) → **backend** (healthy) → **frontend**

---

## API Endpoints

| Method | Path                   | Description              |
|--------|------------------------|--------------------------|
| `POST` | `/api/waitlist`        | Register an email        |
| `GET`  | `/api/waitlist`        | List all entries (admin) |
| `GET`  | `/api/waitlist/count`  | Total signup count       |
| `GET`  | `/health`              | DB health check          |

**Interactive docs:** `http://localhost:8000/docs`

```bash
# Register an email
curl -X POST http://localhost/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email": "hello@company.com"}'

# Check total signups
curl http://localhost/api/waitlist/count
```

---

## Single-container mode (< 400 MB)

nginx, FastAPI and PostgreSQL 16 can run in one Alpine-based image
(`Dockerfile` at the repo root, entrypoint in `docker/entrypoint.sh`):

```bash
cp .env.example .env            # set POSTGRES_PASSWORD, ADMIN_API_KEY
docker compose -f docker-compose.single.yml up --build -d
docker images shayak            # check the size
```

Data lives in the `postgres_data` volume. If any of the three processes
dies, the container exits and `restart: unless-stopped` restarts it.

---

## Useful Commands

```bash
# Follow live logs for all services
docker compose logs -f

# Restart just one service
docker compose restart backend

# Connect to Postgres directly
docker exec -it shayak_db psql -U shayak -d shayak_waitlist

# Stop everything (keeps data volume)
docker compose down

# Stop and wipe all data (destructive!)
docker compose down -v
```

---

## Database Schema

```sql
CREATE TABLE waitlist (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

---

## Production Checklist

- [ ] Set a strong `POSTGRES_PASSWORD` in `.env`
- [ ] Set `CORS_ORIGINS` to your actual domain (not `*`)
- [ ] Restrict `GET /api/waitlist` with an API key or private network rule
- [ ] Add TLS (Certbot / Cloudflare) in front of Nginx on port 443
- [ ] Configure Docker log rotation
