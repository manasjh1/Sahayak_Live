-- Shayak Waitlist — PostgreSQL init script
-- Runs once when the Docker volume is first created.
-- SQLAlchemy also runs CREATE TABLE IF NOT EXISTS on startup,
-- so this is belt-and-suspenders for pre-seeding or manual inspection.

CREATE TABLE IF NOT EXISTS waitlist (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Useful index (SQLAlchemy also creates this via mapped_column(index=True))
CREATE INDEX IF NOT EXISTS idx_waitlist_email      ON waitlist (email);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist (created_at DESC);
