#!/usr/bin/env python3
"""Apply db/supabase.sql to your Supabase database (one-time, re-runnable).

    .venv/bin/python scripts/apply_supabase_schema.py

Paste the Session pooler URI from Supabase -> Connect (input is hidden).
Nothing is written to disk.
"""
import asyncio
import getpass
import pathlib
import sys
from urllib.parse import urlsplit

import asyncpg

SQL = (pathlib.Path(__file__).resolve().parent.parent / "db" / "supabase.sql").read_text()


async def main() -> int:
    uri = getpass.getpass("Supabase Session pooler URI (hidden): ").strip()
    for p in ("postgresql+asyncpg://", "postgres://"):
        if uri.startswith(p):
            uri = "postgresql://" + uri[len(p):]
    if not uri.startswith(("postgresql://", "postgres://")):
        print(
            "That is not a Postgres connection string (it must start with postgresql://).\n"
            "You probably pasted the project URL or an API key. In Supabase click\n"
            "'Connect' (top bar) -> 'Session pooler' and copy that URI instead.",
            file=sys.stderr,
        )
        return 1
    if "[YOUR-PASSWORD]" in uri:
        print("Replace [YOUR-PASSWORD] with your real database password.", file=sys.stderr)
        return 1
    host = urlsplit(uri).hostname
    print(f"Connecting to {host} ...")
    conn = await asyncpg.connect(uri, ssl="require", statement_cache_size=0, timeout=20)
    try:
        await conn.execute(SQL)
        cols = await conn.fetch(
            "select column_name, data_type from information_schema.columns "
            "where table_schema='public' and table_name='waitlist' order by ordinal_position"
        )
        rls = await conn.fetchval(
            "select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass"
        )
        print("waitlist columns:", ", ".join(f"{c['column_name']} ({c['data_type']})" for c in cols))
        print("row level security:", "ON" if rls else "OFF")
    finally:
        await conn.close()
    print("Schema applied ✓")
    return 0


sys.exit(asyncio.run(main()))
