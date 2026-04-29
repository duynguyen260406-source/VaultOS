import mimetypes
import os
import logging
import sys
from pathlib import Path
from fastapi.responses import FileResponse, JSONResponse

# Ensure correct MIME types (Windows registry may be missing these)
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')
mimetypes.add_type('text/css', '.css')

BASE_DIR = Path(__file__).resolve().parent.parent
API_DIR = BASE_DIR / "api"
APP_DIR = BASE_DIR / "app"
WEB_DIR = BASE_DIR / "web"
REACT_DIR = BASE_DIR / "react-app"
REACT_DIST_DIR = REACT_DIR / "dist"
SOURCE_FRONTEND_MODE = (not REACT_DIST_DIR.exists()) and REACT_DIR.exists()

for path in (str(API_DIR), str(APP_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("banking_api")

from fastapi import FastAPI
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app_user_auth import load_session_user
from env_loader import load_project_env
from runtime_config import env_flag, is_prod, require_env, validate_production_config
from security_context import clear_current_actor, set_current_actor

load_project_env()
validate_production_config()

from routers import customers, accounts, transactions, reports
from routers import auth, branches, employees, account_types, users, audit
from dependencies import AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME

_docs_enabled = (not is_prod()) or env_flag("APP_EXPOSE_DOCS")
app = FastAPI(
    title="Banking Management API",
    version="1.0.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)
SECRET_KEY = require_env("JWT_SECRET_KEY")
ALGORITHM = "HS256"


def _csv_env(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


cors_origins = _csv_env(
    "CORS_ALLOWED_ORIGINS",
    [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:8001",
        "http://localhost:8001",
        "http://127.0.0.1:8002",
        "http://localhost:8002",
    ],
)
trusted_hosts = _csv_env("APP_TRUSTED_HOSTS", [])

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

if env_flag("APP_FORCE_HTTPS"):
    app.add_middleware(HTTPSRedirectMiddleware)


@app.middleware("http")
async def enforce_csrf_for_cookie_auth(request, call_next):
    unsafe_method = request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
    uses_cookie_auth = bool(request.cookies.get(AUTH_COOKIE_NAME)) and not request.headers.get("authorization")
    csrf_required = env_flag("CSRF_PROTECTION", True)

    if csrf_required and unsafe_method and uses_cookie_auth and request.url.path != "/auth/login":
        csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
        csrf_header = request.headers.get(CSRF_HEADER_NAME)
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(status_code=403, content={"detail": "CSRF token is missing or invalid"})
    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    if not env_flag("APP_SECURITY_HEADERS", True):
        return response

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")

    csp = os.getenv("APP_CONTENT_SECURITY_POLICY")
    if not csp:
        if SOURCE_FRONTEND_MODE and not is_prod():
            csp = (
                "default-src 'self'; "
                "base-uri 'self'; "
                "frame-ancestors 'none'; "
                "form-action 'self'; "
                "img-src 'self' data:; "
                "font-src 'self' data:; "
                "style-src 'self' 'unsafe-inline'; "
                "script-src 'self' 'unsafe-inline' https://esm.sh; "
                "connect-src 'self' https://esm.sh"
            )
        else:
            csp = (
                "default-src 'self'; "
                "base-uri 'self'; "
                "frame-ancestors 'none'; "
                "form-action 'self'; "
                "img-src 'self' data:; "
                "font-src 'self' data:; "
                "style-src 'self' 'unsafe-inline'; "
                "script-src 'self'; "
                "connect-src 'self'"
            )
    response.headers.setdefault("Content-Security-Policy", csp)

    if is_prod() or env_flag("APP_FORCE_HTTPS"):
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        )
    return response


@app.middleware("http")
async def load_actor_context(request, call_next):
    """Make the authenticated app user available to DB helpers in sync endpoints."""
    clear_current_actor()
    request.state.current_user = None
    auth_header = request.headers.get("authorization", "")
    token = request.cookies.get("vaultos_session")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            session_user = load_session_user(
                user_id=payload.get("user_id"),
                username=payload.get("sub"),
            )
            if session_user and session_user.get("status") == "active":
                token_pwd = payload.get("pwd", "")
                current_pwd = session_user.get("password_changed_at") or ""
                token_version = int(payload.get("ver", -1))
                current_version = int(session_user.get("session_version", 0) or 0)
                if token_pwd == current_pwd and token_version == current_version:
                    request.state.current_user = {
                        "username": session_user["username"],
                        "role": session_user["role"],
                        "user_id": session_user.get("user_id"),
                        "employee_id": session_user.get("employee_id"),
                        "branch_id": session_user.get("branch_id"),
                    }
                    set_current_actor(
                        session_user["username"],
                        session_user["role"],
                        user_id=session_user.get("user_id"),
                        employee_id=session_user.get("employee_id"),
                        branch_id=session_user.get("branch_id"),
                    )
        except JWTError:
            clear_current_actor()

    try:
        return await call_next(request)
    finally:
        clear_current_actor()

# Original routers
app.include_router(customers.router, prefix="/customers", tags=["customers"])
app.include_router(accounts.router, prefix="/accounts", tags=["accounts"])
app.include_router(transactions.router, prefix="/transactions", tags=["transactions"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])

# New routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(branches.router, prefix="/branches", tags=["branches"])
app.include_router(employees.router, prefix="/employees", tags=["employees"])
app.include_router(account_types.router, prefix="/account-types", tags=["account-types"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(audit.router, prefix="/audit", tags=["audit"])

logger.info("Banking Management API started - all routers registered")


@app.get("/health")
def health():
    logger.info("Health check called")
    return {"status": "ok"}


# Serve the built React SPA in production. Local development can use Vite or
# the source-mode index that loads pinned CDN modules for quick demos.
if is_prod() and not REACT_DIST_DIR.exists():
    raise RuntimeError("APP_ENV=prod requires a built frontend at react-app/dist")

_SERVE_DIR = (
    REACT_DIST_DIR
    if REACT_DIST_DIR.exists()
    else REACT_DIR
    if REACT_DIR.exists() and not is_prod()
    else WEB_DIR
    if WEB_DIR.exists()
    else None
)

if _SERVE_DIR:
    # Mount static assets explicitly so they're served directly
    for _sub in ("assets", "brand_assets"):
        _subdir = REACT_DIR / _sub
        if _subdir.exists():
            app.mount(f"/{_sub}", StaticFiles(directory=str(_subdir)), name=_sub)
    if _SERVE_DIR == REACT_DIR:
        _src_dir = REACT_DIR / "src"
        if _src_dir.exists():
            app.mount("/src", StaticFiles(directory=str(_src_dir)), name="src")

    # SPA catch-all: return index.html for all non-API paths
    _index = _SERVE_DIR / ("index.dev.html" if _SERVE_DIR == REACT_DIR and (_SERVE_DIR / "index.dev.html").exists() else "index.html")

    def _spa_response(full_path: str):
        if full_path:
            candidate = _SERVE_DIR / full_path
            if candidate.exists() and candidate.is_file():
                return FileResponse(str(candidate))
        if _index.exists():
            return FileResponse(str(_index))
        from fastapi import HTTPException
        raise HTTPException(status_code=404)

    @app.get("/", include_in_schema=False)
    async def serve_root():
        return _spa_response("")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return _spa_response(full_path)
