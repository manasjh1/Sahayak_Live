#!/usr/bin/env python3
"""Build DATABASE_URL for Supabase from values in .env.

Reads from .env:
  SUPABASE_URL           (gives the project ref)
  SUPABASE_DB_PASSWORD   your database password (plain, not URL-encoded)
  SUPABASE_POOLER_HOST   e.g. aws-1-ap-south-1.pooler.supabase.com
                         (Supabase -> Connect -> Session pooler: the part after '@')

Writes DATABASE_URL= into .env and copies the URL to your clipboard (macOS) so you
can paste it into Render -> Environment. The URL is never printed.

    .venv/bin/python scripts/build_database_url.py [path/to/.env]
"""
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit

env_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / ".env"
text = env_path.read_text()


def get(key: str) -> str:
    m = re.search(rf"^{key}=(.*)$", text, re.M)
    return m.group(1).strip().strip("'\"") if m else ""


url, pw, host = get("SUPABASE_URL"), get("SUPABASE_DB_PASSWORD"), get("SUPABASE_POOLER_HOST")
problems = []
ref = (urlsplit(url).hostname or "").split(".")[0]
if not ref or "YOUR-PROJECT" in ref:
    problems.append("SUPABASE_URL is missing or still a placeholder")
if not pw or pw.startswith("paste"):
    problems.append("SUPABASE_DB_PASSWORD is empty")
if "pooler.supabase.com" not in host:
    problems.append("SUPABASE_POOLER_HOST must look like aws-1-<region>.pooler.supabase.com")
if problems:
    print("Fix these in .env first:\n - " + "\n - ".join(problems), file=sys.stderr)
    sys.exit(1)

db_url = f"postgresql://postgres.{ref}:{quote(pw, safe='')}@{host}:5432/postgres"

if re.search(r"^DATABASE_URL=.*$", text, re.M):
    text = re.sub(r"^DATABASE_URL=.*$", lambda _: f"DATABASE_URL={db_url}", text, flags=re.M)
else:
    text = text.rstrip("\n") + f"\nDATABASE_URL={db_url}\n"
env_path.write_text(text)

try:
    subprocess.run(["pbcopy"], input=db_url.encode(), check=True)
    copied = "copied to clipboard"
except (FileNotFoundError, subprocess.CalledProcessError):
    copied = "(no clipboard tool found; copy it from .env)"

print(f"DATABASE_URL written to {env_path.name} for project '{ref}', host {host} -- {copied}.")
print("Paste it into Render -> Environment -> DATABASE_URL, then Save, rebuild and deploy.")
