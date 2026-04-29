import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from time import monotonic
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from jose import jwt
from pydantic import BaseModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from app_user_auth import AppUserAuthError, authenticate_app_user, change_password
from runtime_config import env_flag, require_env
from security_context import clear_current_actor
from dependencies import AUTH_COOKIE_NAME, CSRF_COOKIE_NAME, get_current_user
from models.users import ChangePasswordRequest, UserActionResponse

router = APIRouter()

SECRET_KEY = require_env("JWT_SECRET_KEY")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = int(os.getenv("SESSION_TTL_HOURS", "8"))
COOKIE_MAX_AGE = TOKEN_EXPIRE_HOURS * 60 * 60
COOKIE_SECURE = env_flag("SESSION_COOKIE_SECURE")
COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "lax").strip().lower() or "lax"
COOKIE_DOMAIN = os.getenv("SESSION_COOKIE_DOMAIN") or None
LOGIN_RATE_LIMIT = int(os.getenv("AUTH_IP_LOCK_THRESHOLD", "10"))
LOGIN_RATE_WINDOW_SECONDS = int(os.getenv("AUTH_IP_LOCK_WINDOW_SECONDS", "300"))
_FAILED_LOGIN_BUCKETS: dict[str, list[float]] = {}

if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError("SESSION_COOKIE_SAMESITE must be one of: lax, strict, none")
if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
    raise RuntimeError("SESSION_COOKIE_SAMESITE=none requires SESSION_COOKIE_SECURE=true")


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str
    user_id: int
    employee_id: Optional[int] = None
    branch_id: Optional[int] = None


class MeResponse(BaseModel):
    username: str
    role: str
    user_id: Optional[int] = None
    employee_id: Optional[int] = None
    branch_id: Optional[int] = None


def _create_token(user: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user["username"],
        "role": user["role"],
        "user_id": user["user_id"],
        "employee_id": user.get("employee_id"),
        "branch_id": user.get("branch_id"),
        "pwd": user.get("password_changed_at") or "",
        "ver": int(user.get("session_version", 0) or 0),
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _login_bucket_key(request: Request, username: str) -> str:
    client_host = request.client.host if request.client else "unknown"
    return f"{client_host}:{username.strip().lower()}"


def _check_login_rate_limit(request: Request, username: str) -> None:
    key = _login_bucket_key(request, username)
    now = monotonic()
    attempts = [ts for ts in _FAILED_LOGIN_BUCKETS.get(key, []) if now - ts < LOGIN_RATE_WINDOW_SECONDS]
    _FAILED_LOGIN_BUCKETS[key] = attempts
    if len(attempts) >= LOGIN_RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many failed login attempts. Try again later.")


def _record_failed_login(request: Request, username: str) -> None:
    key = _login_bucket_key(request, username)
    now = monotonic()
    attempts = [ts for ts in _FAILED_LOGIN_BUCKETS.get(key, []) if now - ts < LOGIN_RATE_WINDOW_SECONDS]
    attempts.append(now)
    _FAILED_LOGIN_BUCKETS[key] = attempts


def _clear_failed_login_bucket(request: Request, username: str) -> None:
    _FAILED_LOGIN_BUCKETS.pop(_login_bucket_key(request, username), None)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, response: Response, request: Request):
    """Authenticate and return a JWT token."""
    clear_current_actor()
    _check_login_rate_limit(request, body.username)
    try:
        user = authenticate_app_user(body.username, body.password)
    except AppUserAuthError as e:
        _record_failed_login(request, body.username)
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    _clear_failed_login_bucket(request, body.username)
    token = _create_token(user)
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=COOKIE_MAX_AGE,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
        path="/",
    )
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        role=user["role"],
        username=user["username"],
        user_id=user["user_id"],
        employee_id=user.get("employee_id"),
        branch_id=user.get("branch_id"),
    )


@router.post("/logout")
def logout(response: Response):
    clear_current_actor()
    response.delete_cookie(AUTH_COOKIE_NAME, path="/", domain=COOKIE_DOMAIN)
    response.delete_cookie(CSRF_COOKIE_NAME, path="/", domain=COOKIE_DOMAIN)
    return {"detail": "Logged out"}


@router.get("/me", response_model=MeResponse)
def me(current_user: dict = Depends(get_current_user)):
    """Return info for the currently authenticated user."""
    return MeResponse(
        username=current_user["username"],
        role=current_user["role"],
        user_id=current_user.get("user_id"),
        employee_id=current_user.get("employee_id"),
        branch_id=current_user.get("branch_id"),
    )


@router.post("/change-password", response_model=UserActionResponse)
def auth_change_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        change_password(current_user["user_id"], body.current_password, body.new_password)
    except AppUserAuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return UserActionResponse(detail="Password changed successfully")
