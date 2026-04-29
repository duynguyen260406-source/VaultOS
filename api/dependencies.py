import os
import sys
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from mysql.connector import Error as MySQLError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

from app_user_auth import load_session_user
from runtime_config import require_env
from security_context import (
    ROLE_AUDITOR,
    ROLE_MANAGER,
    ROLE_TELLER,
    clear_current_actor,
    set_current_actor,
)

SECRET_KEY = require_env("JWT_SECRET_KEY")
ALGORITHM = "HS256"
AUTH_COOKIE_NAME = "vaultos_session"
CSRF_COOKIE_NAME = "vaultos_csrf"
CSRF_HEADER_NAME = "x-csrf-token"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _load_authenticated_user(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        clear_current_actor()
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    session_user = load_session_user(
        user_id=payload.get("user_id"),
        username=payload.get("sub"),
    )
    if not session_user:
        clear_current_actor()
        raise HTTPException(status_code=401, detail="User session is no longer valid")

    status = session_user.get("status")
    if status == "locked":
        clear_current_actor()
        raise HTTPException(status_code=423, detail="Account is locked")
    if status != "active":
        clear_current_actor()
        raise HTTPException(status_code=403, detail=f"Account is {status}")

    token_pwd = payload.get("pwd", "")
    current_pwd = session_user.get("password_changed_at") or ""
    if token_pwd != current_pwd:
        clear_current_actor()
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again")
    token_version = int(payload.get("ver", -1))
    current_version = int(session_user.get("session_version", 0) or 0)
    if token_version != current_version:
        clear_current_actor()
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again")

    set_current_actor(
        session_user["username"],
        session_user["role"],
        user_id=session_user.get("user_id"),
        employee_id=session_user.get("employee_id"),
        branch_id=session_user.get("branch_id"),
    )
    return {
        "username": session_user["username"],
        "role": session_user["role"],
        "user_id": session_user.get("user_id"),
        "employee_id": session_user.get("employee_id"),
        "branch_id": session_user.get("branch_id"),
    }


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
) -> dict:
    """Decode JWT and return user dict. Raises 401 if token is missing or invalid."""
    cached_user = getattr(request.state, "current_user", None)
    if cached_user:
        set_current_actor(
            cached_user["username"],
            cached_user["role"],
            user_id=cached_user.get("user_id"),
            employee_id=cached_user.get("employee_id"),
            branch_id=cached_user.get("branch_id"),
        )
        return cached_user

    token = token or request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        clear_current_actor()
        raise HTTPException(status_code=401, detail="Not authenticated")
    return _load_authenticated_user(token)


def require_role(*roles: str):
    """Factory: returns a dependency that enforces the user has one of the given roles."""

    def _dep(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        return current_user

    return _dep


require_manager = require_role(ROLE_MANAGER)
require_teller_or_manager = require_role(ROLE_TELLER, ROLE_MANAGER)
require_manager_or_auditor = require_role(ROLE_MANAGER, ROLE_AUDITOR)
require_any_role = require_role(ROLE_MANAGER, ROLE_TELLER, ROLE_AUDITOR)


def db_error_to_http(e: MySQLError) -> HTTPException:
    """Convert MySQLError to an appropriate HTTPException."""
    msg = str(e.msg) if hasattr(e, "msg") and e.msg else str(e)
    if hasattr(e, "sqlstate") and e.sqlstate == "45000":
        return HTTPException(status_code=400, detail=msg)
    if hasattr(e, "errno") and e.errno == 1062:
        return HTTPException(status_code=409, detail="Duplicate value violates a uniqueness constraint")
    return HTTPException(status_code=500, detail="Database operation failed")
