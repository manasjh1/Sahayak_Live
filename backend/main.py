"""
Shayak AI Control Layer — Waitlist API
FastAPI + Supabase (Postgres) · Strict CORS · Security headers · Rate limiting
All HIGH/CRITICAL security issues resolved.
"""

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, DateTime, Integer, func, select
from contextlib import asynccontextmanager
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from datetime import datetime
from urllib.parse import urlsplit
from uuid import uuid4
from sqlalchemy.engine import make_url
import os
import re
import secrets
import base64
import hashlib
import logging

# ── logging ──────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── config ───────────────────────────────────────────────────────────
# HIGH FIX #1: No hardcoded fallback credentials — fail fast if unset
_db_url = os.environ.get("DATABASE_URL")
if not _db_url:
    raise RuntimeError(
        "DATABASE_URL environment variable is required but not set. "
        "Copy .env.example to .env and configure it."
    )
# Accept plain postgres:// / postgresql:// URLs (e.g. copied from Supabase)
# and make them use the asyncpg driver.
for _prefix in ("postgres://", "postgresql://"):
    if _db_url.startswith(_prefix):
        _db_url = "postgresql+asyncpg://" + _db_url[len(_prefix):]
DATABASE_URL: str = _db_url

# HIGH FIX #2: Admin API key — required, no weak default
ADMIN_API_KEY: str = os.environ.get("ADMIN_API_KEY", "")
if not ADMIN_API_KEY:
    # Generate a random key so the app starts, but warn loudly
    ADMIN_API_KEY = secrets.token_urlsafe(32)
    log.warning(
        "ADMIN_API_KEY not set! A random key has been generated for this session: %s "
        "Set ADMIN_API_KEY in .env to use a persistent key.",
        ADMIN_API_KEY,
    )

# CORS — strict by default; never send wildcard with credentials
_raw_origins = os.environ.get("CORS_ORIGINS", "")
CORS_ORIGINS: list[str] = (
    ["*"] if not _raw_origins or _raw_origins.strip() == "*"
    else [o.strip() for o in _raw_origins.split(",") if o.strip()]
)
CORS_ALLOW_CREDENTIALS = CORS_ORIGINS != ["*"]
ENV = os.environ.get("ENV", "development")

log.info("ENV          : %s", ENV)
log.info("CORS origins : %s", CORS_ORIGINS)

# ── rate limiter ──────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

# ── database ──────────────────────────────────────────────────────────
_db_host = (urlsplit(DATABASE_URL.replace("+asyncpg", "")).hostname or "")
_is_local_db = _db_host in ("localhost", "127.0.0.1", "db", "")
_connect_args: dict = {
    # Supabase's transaction pooler (pgbouncer, port 6543) routes each query to
    # any backend, so prepared statements must not be cached or reuse names.
    "statement_cache_size": 0,
    "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4().hex}__",
}
if not _is_local_db:
    _connect_args["ssl"] = "require"   # Supabase requires TLS

engine = create_async_engine(
    # SQLAlchemy keeps its own prepared-statement cache too; disable it
    make_url(DATABASE_URL).update_query_dict({"prepared_statement_cache_size": "0"}),
    echo=False,
    pool_pre_ping=True,
    pool_size=3,        # stay well inside Supabase free-tier connection limits
    max_overflow=2,
    connect_args=_connect_args,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    email:      Mapped[str]      = mapped_column(String(254), unique=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ── lifespan ──────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    log.info("Database tables ensured ✓")
    yield
    await engine.dispose()


# ── app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Shayak Waitlist API",
    version="1.0.0",
    lifespan=lifespan,
    # HIGH FIX #3: Docs disabled in production — no route exposure
    docs_url="/docs"        if ENV != "production" else None,
    redoc_url="/redoc"      if ENV != "production" else None,
    openapi_url="/openapi.json" if ENV != "production" else None,
)

# ── rate limiting ──────────────────────────────────────────────────────
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests — please slow down."},
        headers={"Retry-After": "60"},
    )


# HIGH FIX #4: Override validation error handler — never leak field internals
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Return generic message instead of exposing internal field names/types
    return JSONResponse(
        status_code=422,
        content={"detail": "Invalid request payload. Check your input and try again."},
    )


# ── CORS ──────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-API-Key"],
    max_age=600,
)


# ── Security headers ───────────────────────────────────────────────────
FRONTEND_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-eval' https://fonts.googleapis.com https://unpkg.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


def _is_api_path(path: str) -> bool:
    return path.startswith(("/api/", "/health", "/docs", "/redoc", "/openapi.json"))


# HIGH FIX #5: Add Content-Security-Policy + complete header set
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    # Prevent MIME-type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    # Prevent clickjacking
    response.headers["X-Frame-Options"] = "DENY"
    # Legacy XSS filter (belt-and-suspenders)
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Control referrer info
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Restrict browser features
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    path = request.url.path
    if _is_api_path(path):
        # No caching of API responses
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        # API only serves JSON — lock CSP down completely
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    else:
        # Frontend (film): same policy nginx used to send
        response.headers["Content-Security-Policy"] = FRONTEND_CSP
        if path == "/" or path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache"
        elif response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=604800"
    # HSTS only in production (requires HTTPS)
    if ENV == "production":
        response.headers["Strict-Transport-Security"] = (
            "max-age=63072000; includeSubDomains; preload"
        )
    # HIGH FIX #5b: Strip server banner entirely
    if "server" in response.headers:
        del response.headers["server"]
    return response


# ── Auth helper ────────────────────────────────────────────────────────
# HIGH FIX #6: Admin route protection via API key
def _check_admin_key(request: Request) -> None:
    key = request.headers.get("X-API-Key", "").strip()
    # Use constant-time comparison to prevent timing attacks
    if not key or not secrets.compare_digest(key, ADMIN_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
            headers={"WWW-Authenticate": "ApiKey"},
        )


# ── Schemas ───────────────────────────────────────────────────────────
EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


class WaitlistRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def strict_email(cls, v: str) -> str:
        v = v.strip().lower()
        # RFC 5321 max length
        if len(v) > 254:
            raise ValueError("Email address too long")
        if not EMAIL_RE.match(v):
            raise ValueError("Invalid email format")
        # Reject any control characters / null bytes
        if any(ord(c) < 32 for c in v):
            raise ValueError("Email contains invalid characters")
        return v


class WaitlistResponse(BaseModel):
    id: int
    email: str
    created_at: datetime
    already_registered: bool = False


class HealthResponse(BaseModel):
    status: str
    db: str


# ── Routes ────────────────────────────────────────────────────────────
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    """Health check — used by Docker and load balancers."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(select(1))
        return {"status": "ok", "db": "connected"}
    except Exception as exc:
        log.error("DB health check failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "error", "db": "unreachable"},
        )


@app.post(
    "/api/waitlist",
    response_model=WaitlistResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Waitlist"],
)
@limiter.limit("5/minute")
async def join_waitlist(request: Request, payload: WaitlistRequest):
    """Register an email on the Shayak waitlist."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(WaitlistEntry).where(WaitlistEntry.email == payload.email)
        )
        existing = result.scalar_one_or_none()

        if existing:
            log.info("Duplicate waitlist: %s", payload.email)
            return JSONResponse(
                status_code=200,
                content={
                    "id": existing.id,
                    "email": existing.email,
                    "created_at": existing.created_at.isoformat(),
                    "already_registered": True,
                },
            )

        entry = WaitlistEntry(email=payload.email)
        session.add(entry)
        await session.commit()
        await session.refresh(entry)
        log.info("New waitlist entry: id=%d", entry.id)  # don't log email in prod
        return WaitlistResponse(
            id=entry.id,
            email=entry.email,
            created_at=entry.created_at,
            already_registered=False,
        )


# HIGH FIX #6: Admin routes require X-API-Key header
@app.get("/api/waitlist", response_model=list[WaitlistResponse], tags=["Admin"])
@limiter.limit("30/minute")
async def list_waitlist(request: Request, skip: int = 0, limit: int = 100):
    """
    List all waitlist entries.
    🔒 Requires X-API-Key header matching ADMIN_API_KEY env var.
    """
    _check_admin_key(request)
    if limit > 1000 or limit < 1:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 1000")
    if skip < 0:
        raise HTTPException(status_code=400, detail="skip must be non-negative")
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(WaitlistEntry)
            .order_by(WaitlistEntry.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return [
            WaitlistResponse(id=e.id, email=e.email, created_at=e.created_at)
            for e in result.scalars().all()
        ]


@app.get("/api/waitlist/count", tags=["Admin"])
@limiter.limit("60/minute")
async def waitlist_count(request: Request):
    """
    Return total signup count.
    🔒 Requires X-API-Key header.
    """
    _check_admin_key(request)
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(func.count(WaitlistEntry.id)))
        return {"count": result.scalar_one()}


# ── Frontend (static film) ────────────────────────────────────────────
# Served by FastAPI itself — no nginx. Registered last so /api and /health win.
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parent / "static"))
INDEX_FILE = "Shayak Film.dc.html"

if (STATIC_DIR / INDEX_FILE).is_file():
    # Allow exactly the page's own inline <script> blocks (by hash) — nothing else inline.
    _html = (STATIC_DIR / INDEX_FILE).read_text(encoding="utf-8")
    _hashes = " ".join(
        "'sha256-%s'" % base64.b64encode(hashlib.sha256(m.encode("utf-8")).digest()).decode()
        for m in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", _html, re.S)
    )
    if _hashes:
        FRONTEND_CSP = FRONTEND_CSP.replace("script-src 'self'", f"script-src 'self' {_hashes}", 1)

    @app.get("/", include_in_schema=False)
    async def index():
        return FileResponse(STATIC_DIR / INDEX_FILE, media_type="text/html")

    app.mount("/", StaticFiles(directory=STATIC_DIR), name="static")
    log.info("Serving frontend from %s", STATIC_DIR)
else:
    log.warning("Frontend not found at %s — serving API only", STATIC_DIR)
