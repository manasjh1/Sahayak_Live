-- Sahayak waitlist — Supabase schema (idempotent; safe to re-run)
-- Matches the SQLAlchemy model in backend/main.py.

CREATE TABLE IF NOT EXISTS public.waitlist (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(254) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Same index name SQLAlchemy uses for (unique=True, index=True)
CREATE UNIQUE INDEX IF NOT EXISTS ix_waitlist_email      ON public.waitlist (email);
CREATE INDEX        IF NOT EXISTS idx_waitlist_created_at ON public.waitlist (created_at DESC);

-- ── Lock down the auto-generated Supabase REST API ──────────────────
-- Row Level Security on + no policies = the publishable/anon key and signed-in
-- users can read or write nothing. The backend connects as the `postgres`
-- role, which bypasses RLS, so it is unaffected.
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.waitlist FROM anon;
    REVOKE ALL ON SEQUENCE public.waitlist_id_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.waitlist FROM authenticated;
    REVOKE ALL ON SEQUENCE public.waitlist_id_seq FROM authenticated;
  END IF;
END $$;
