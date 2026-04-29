import hashlib
import os
from contextvars import ContextVar
from typing import Dict, Optional, Tuple

from env_loader import load_project_env


load_project_env()

ROLE_MANAGER = "manager"
ROLE_TELLER = "teller"
ROLE_AUDITOR = "auditor"

VALID_ROLES = (ROLE_MANAGER, ROLE_TELLER, ROLE_AUDITOR)
BRANCH_SCOPED_ROLES = (ROLE_TELLER,)

_username_ctx: ContextVar[Optional[str]] = ContextVar("username_ctx", default=None)
_role_ctx: ContextVar[Optional[str]] = ContextVar("role_ctx", default=None)
_user_id_ctx: ContextVar[Optional[int]] = ContextVar("user_id_ctx", default=None)
_employee_id_ctx: ContextVar[Optional[int]] = ContextVar("employee_id_ctx", default=None)
_branch_id_ctx: ContextVar[Optional[int]] = ContextVar("branch_id_ctx", default=None)

_ROLE_DB_PREFIX = {
    ROLE_MANAGER: "DB_MANAGER",
    ROLE_TELLER: "DB_TELLER",
    ROLE_AUDITOR: "DB_AUDITOR",
}


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def set_current_actor(
    username: Optional[str],
    role: Optional[str],
    user_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    branch_id: Optional[int] = None,
) -> None:
    _username_ctx.set(username)
    _role_ctx.set(role)
    _user_id_ctx.set(user_id)
    _employee_id_ctx.set(employee_id)
    _branch_id_ctx.set(branch_id)


def clear_current_actor() -> None:
    set_current_actor(None, None, None, None, None)


def get_current_actor() -> Optional[Dict[str, object]]:
    username = _username_ctx.get()
    role = _role_ctx.get()
    if not username or not role:
        return None
    return {
        "username": username,
        "role": role,
        "user_id": _user_id_ctx.get(),
        "employee_id": _employee_id_ctx.get(),
        "branch_id": _branch_id_ctx.get(),
    }


def build_actor_label(username: Optional[str], role: Optional[str]) -> Optional[str]:
    if not username:
        return None
    if role:
        return f"{username} ({role})"
    return username


def build_context_signature(
    username: Optional[str],
    role: Optional[str],
    user_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    secret: Optional[str] = None,
) -> Optional[str]:
    if not username or not role:
        return None
    signing_secret = (
        secret
        or os.getenv("DB_CONTEXT_SIGNING_KEY")
        or os.getenv("JWT_SECRET_KEY")
        or os.getenv("DB_ENCRYPTION_KEY")
    )
    if not signing_secret:
        return None

    payload = "|".join(
        [
            signing_secret,
            "null" if user_id is None else str(user_id),
            username,
            role,
            "null" if employee_id is None else str(employee_id),
            "null" if branch_id is None else str(branch_id),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def is_branch_scoped_role(role: Optional[str]) -> bool:
    return role in BRANCH_SCOPED_ROLES


def resolve_db_config(
    base_config: Dict[str, object],
    role: Optional[str],
) -> Tuple[Dict[str, object], str, bool]:
    if role not in _ROLE_DB_PREFIX:
        return dict(base_config), "default", False

    prefix = _ROLE_DB_PREFIX[role]
    role_user = os.getenv(f"{prefix}_USER")
    role_password = os.getenv(f"{prefix}_PASSWORD")
    if not role_user or role_password is None:
        if _env_flag("DB_ALLOW_ROLE_FALLBACK", False):
            return dict(base_config), "default", False
        raise RuntimeError(f"Missing required role-specific DB credentials for role '{role}'")

    role_config = dict(base_config)
    role_config["host"] = os.getenv(f"{prefix}_HOST", str(base_config["host"]))
    role_config["port"] = int(os.getenv(f"{prefix}_PORT", str(base_config["port"])))
    role_config["user"] = role_user
    role_config["password"] = role_password
    role_config["database"] = (
        os.getenv(f"{prefix}_NAME")
        or os.getenv(f"{prefix}_DATABASE")
        or str(base_config["database"])
    )
    return role_config, role, True
