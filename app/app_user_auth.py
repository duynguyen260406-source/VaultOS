import os
from typing import Dict, Optional

import bcrypt

from db_connection import get_db
from security_context import clear_current_actor, get_current_actor, set_current_actor

STATUS_ACTIVE = "active"
STATUS_PENDING = "pending"
STATUS_LOCKED = "locked"
STATUS_DISABLED = "disabled"
AUTH_LOCK_THRESHOLD = int(os.getenv("AUTH_LOCK_THRESHOLD", "5"))


class AppUserAuthError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def _normalize_row(row: Optional[Dict[str, object]]) -> Optional[Dict[str, object]]:
    if not row:
        return None
    normalized = {}
    for key, value in row.items():
        if hasattr(value, "isoformat"):
            normalized[key] = value.isoformat(sep=" ")
        else:
            normalized[key] = value
    return normalized


def load_session_user(
    user_id: Optional[int] = None,
    username: Optional[str] = None,
) -> Optional[Dict[str, object]]:
    if user_id is None and (username is None or not username.strip()):
        return None

    where_sql = "u.UserID = %s" if user_id is not None else "u.Username = %s"
    lookup_value = user_id if user_id is not None else username.strip()
    previous_actor = get_current_actor()
    set_current_actor(username, "auth", user_id=user_id)
    try:
        with get_db(use_current_actor_role=False) as (conn, cursor):
            cursor.execute(
                f"""
                SELECT
                    u.UserID AS user_id,
                    u.Username AS username,
                    u.Role AS role,
                    u.Status AS status,
                    u.EmployeeID AS employee_id,
                    u.CustomerID AS customer_id,
                    u.FailedLoginCount AS failed_login_count,
                    u.LastLoginAt AS last_login_at,
                    u.PasswordChangedAt AS password_changed_at,
                    u.SessionVersion AS session_version,
                    u.CreatedAt AS created_at,
                    u.UpdatedAt AS updated_at,
                    u.CreatedByUserID AS created_by_user_id,
                    e.BranchID AS branch_id
                FROM AppUsers u
                LEFT JOIN Employees e ON u.EmployeeID = e.EmployeeID
                WHERE {where_sql}
                """,
                (lookup_value,),
            )
            return _normalize_row(cursor.fetchone())
    finally:
        _restore_actor(previous_actor)


def hash_password(plain_password: str) -> str:
    if not plain_password:
        raise AppUserAuthError("Password must not be empty", status_code=400)
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            password_hash.encode("utf-8"),
        )
    except ValueError:
        return False


def _restore_actor(previous_actor: Optional[Dict[str, object]]) -> None:
    if previous_actor:
        set_current_actor(
            previous_actor.get("username"),
            previous_actor.get("role"),
            user_id=previous_actor.get("user_id"),
            employee_id=previous_actor.get("employee_id"),
            branch_id=previous_actor.get("branch_id"),
        )
        return
    clear_current_actor()


def authenticate_app_user(username: str, password: str) -> Dict[str, object]:
    normalized_username = username.strip()
    if not normalized_username or not password:
        raise AppUserAuthError("Invalid username or password", status_code=401)

    previous_actor = get_current_actor()
    set_current_actor(normalized_username, "auth")
    try:
        with get_db(use_current_actor_role=False) as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    u.UserID AS user_id,
                    u.Username AS username,
                    u.PasswordHash AS password_hash,
                    u.Role AS role,
                    u.Status AS status,
                    u.EmployeeID AS employee_id,
                    u.CustomerID AS customer_id,
                    u.FailedLoginCount AS failed_login_count,
                    u.LastLoginAt AS last_login_at,
                    u.PasswordChangedAt AS password_changed_at,
                    u.SessionVersion AS session_version,
                    u.CreatedAt AS created_at,
                    u.UpdatedAt AS updated_at,
                    u.CreatedByUserID AS created_by_user_id,
                    e.BranchID AS branch_id
                FROM AppUsers u
                LEFT JOIN Employees e ON u.EmployeeID = e.EmployeeID
                WHERE Username = %s
                """,
                (normalized_username,),
            )
            row = cursor.fetchone()
            if not row:
                raise AppUserAuthError("Invalid username or password", status_code=401)

            user = _normalize_row(row)
            user.pop("password_hash", None)
            status = user["status"]
            if status == STATUS_LOCKED:
                raise AppUserAuthError("Account is locked", status_code=423)
            if status == STATUS_DISABLED:
                raise AppUserAuthError("Account is disabled", status_code=403)
            if status != STATUS_ACTIVE:
                raise AppUserAuthError(f"Account is {status}", status_code=403)

            if not verify_password(password, row["password_hash"]):
                failed_count = int(row["failed_login_count"] or 0) + 1
                next_status = STATUS_LOCKED if failed_count >= AUTH_LOCK_THRESHOLD else row["status"]
                cursor.execute(
                    """
                    UPDATE AppUsers
                    SET FailedLoginCount = %s,
                        Status = %s,
                        SessionVersion = SessionVersion + %s
                    WHERE UserID = %s
                    """,
                    (
                        failed_count,
                        next_status,
                        1 if next_status == STATUS_LOCKED and row["status"] != next_status else 0,
                        row["user_id"],
                    ),
                )
                if next_status == STATUS_LOCKED:
                    raise AppUserAuthError(
                        "Account is locked after too many failed attempts",
                        status_code=423,
                    )
                raise AppUserAuthError("Invalid username or password", status_code=401)

            cursor.execute(
                """
                UPDATE AppUsers
                SET FailedLoginCount = 0, LastLoginAt = CURRENT_TIMESTAMP
                WHERE UserID = %s
                """,
                (row["user_id"],),
            )
            user["failed_login_count"] = 0
            return user
    finally:
        _restore_actor(previous_actor)


def change_password(user_id: int, current_password: str, new_password: str) -> None:
    with get_db(use_current_actor_role=False) as (conn, cursor):
        cursor.execute(
            """
            SELECT UserID AS user_id, PasswordHash AS password_hash, Status AS status
            FROM AppUsers
            WHERE UserID = %s
            """,
            (user_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise AppUserAuthError("User not found", status_code=404)
        if row["status"] != STATUS_ACTIVE:
            raise AppUserAuthError("Only active users can change password", status_code=403)
        if not verify_password(current_password, row["password_hash"]):
            raise AppUserAuthError("Current password is incorrect", status_code=401)

        password_hash = hash_password(new_password)
        cursor.execute(
            """
            UPDATE AppUsers
            SET PasswordHash = %s,
                PasswordChangedAt = CURRENT_TIMESTAMP,
                FailedLoginCount = 0,
                SessionVersion = SessionVersion + 1
            WHERE UserID = %s
            """,
            (password_hash, user_id),
        )


def set_password_for_user(user_id: int, new_password: str, unlock_user: bool = True) -> None:
    password_hash = hash_password(new_password)
    with get_db(use_current_actor_role=False) as (conn, cursor):
        if unlock_user:
            cursor.execute(
                """
                UPDATE AppUsers
                SET PasswordHash = %s,
                    PasswordChangedAt = CURRENT_TIMESTAMP,
                    FailedLoginCount = 0,
                    Status = %s,
                    SessionVersion = SessionVersion + 1
                WHERE UserID = %s
                """,
                (password_hash, STATUS_ACTIVE, user_id),
            )
        else:
            cursor.execute(
                """
                UPDATE AppUsers
                SET PasswordHash = %s,
                    PasswordChangedAt = CURRENT_TIMESTAMP,
                    SessionVersion = SessionVersion + 1
                WHERE UserID = %s
                """,
                (password_hash, user_id),
            )
        if cursor.rowcount == 0:
            raise AppUserAuthError("User not found", status_code=404)
