# Sahayak AI Control Layer

One Docker image, one process: **FastAPI** serves the waitlist API and the static film.
The database is **Supabase** (Postgres) — nothing database-related runs in the container.

```
frontend/        static film assets (served by FastAPI)
backend/main.py  FastAPI routes: waitlist, health
db/supabase.sql  schema (run once in Supabase SQL Editor)
docker/          entrypoint.sh
Dockerfile       single image
render.yaml      Render blueprint
scripts/         push_to_github.sh, apply_supabase_schema.py
```

## Setup

1. **Schema:** Supabase → SQL Editor → paste `db/supabase.sql` → Run.
2. **Connection string:** Supabase → Connect → **Session pooler** URI
   (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`).
   Use the pooler, not the Direct connection (IPv6-only; Render free is IPv4).
   URL-encode special characters in the password (`@` → `%40`).

## Deploy on Render (free)

1. Render → New → Blueprint → select this repo (`render.yaml`).
2. Environment variables:
   - `DATABASE_URL` — the Session pooler URI above (**required**; the container exits without it)
   - `CORS_ORIGINS` — `*` or your site URL
   - `ADMIN_API_KEY` — generated for you; `ENV=production` is preset
3. The free service sleeps after ~15 min idle (slow first request); data lives in Supabase.

## Run locally

```bash
cp .env.example .env            # set ADMIN_API_KEY
DATABASE_URL='postgresql://...pooler.supabase.com:5432/postgres' \
  docker compose -f docker-compose.single.yml up --build
open http://localhost
```

## API

| Method | Path                  | Description                      |
|--------|-----------------------|----------------------------------|
| POST   | `/api/waitlist`       | Register an email (5/min per IP) |
| GET    | `/api/waitlist`       | List entries — `X-API-Key` required |
| GET    | `/api/waitlist/count` | Signup count — `X-API-Key` required |
| GET    | `/health`             | DB health check                  |

Docs at `/docs` are disabled when `ENV=production`.

## Security notes

- The `waitlist` table has Row Level Security on and no policies, so the Supabase
  publishable/anon key cannot read emails. The backend connects as `postgres`.
- Keep real keys in `.env` / Render only. `.env` is gitignored.
