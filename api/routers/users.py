import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError

from app_user_auth import AppUserAuthError, set_password_for_user
from db_connection import get_db
from dependencies import db_error_to_http, require_manager
from models.users import (
    AppUserDetail,
    AppUserListResponse,
    CreateAppUserRequest,
    ResetPasswordRequest,
    UpdateAppUserRequest,
    UserActionResponse,
)

router = APIRouter()

_USER_SELECT = """
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
    CASE
        WHEN e.EmployeeID IS NULL THEN NULL
        ELSE CONCAT(e.FirstName, ' ', e.LastName)
    END AS employee_name
"""


def _normalize_row(row: dict) -> AppUserDetail:
    normalized = {}
    for key, value in row.items():
        normalized[key] = value.isoformat(sep=" ") if hasattr(value, "isoformat") else value
    return AppUserDetail(**normalized)


def _get_user_row(cursor, user_id: int):
    cursor.execute(
        f"""
        SELECT
            {_USER_SELECT}
        FROM AppUsers u
        LEFT JOIN Employees e ON u.EmployeeID = e.EmployeeID
        WHERE u.UserID = %s
        """,
        (user_id,),
    )
    return cursor.fetchone()


@router.get("", response_model=AppUserListResponse)
def list_users(_=Depends(require_manager)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT
                    {_USER_SELECT}
                FROM AppUsers u
                LEFT JOIN Employees e ON u.EmployeeID = e.EmployeeID
                ORDER BY u.UserID
                """
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    users = [_normalize_row(row) for row in rows]
    return AppUserListResponse(users=users, total=len(users))


@router.get("/{user_id}", response_model=AppUserDetail)
def get_user(user_id: int, _=Depends(require_manager)):
    try:
        with get_db() as (conn, cursor):
            row = _get_user_row(cursor, user_id)
    except MySQLError as e:
        raise db_error_to_http(e)
    if not row:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    return _normalize_row(row)


@router.post("", response_model=AppUserDetail, status_code=201)
def create_user(body: CreateAppUserRequest, current_user: dict = Depends(require_manager)):
    if body.employee_id is not None and body.customer_id is not None:
        raise HTTPException(status_code=400, detail="A user cannot be linked to both an employee and a customer")

    try:
        from app_user_auth import hash_password

        normalized_username = body.username.strip()
        if len(normalized_username) < 3:
            raise HTTPException(status_code=400, detail="Username must contain at least 3 non-space characters")

        password_hash = hash_password(body.password)
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO AppUsers
                    (Username, PasswordHash, Role, Status, EmployeeID, CustomerID, PasswordChangedAt, CreatedByUserID)
                VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, %s)
                """,
                (
                    normalized_username,
                    password_hash,
                    body.role,
                    body.status,
                    body.employee_id,
                    body.customer_id,
                    current_user.get("user_id"),
                ),
            )
            new_id = cursor.lastrowid
            row = _get_user_row(cursor, new_id)
    except AppUserAuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    except MySQLError as e:
        if hasattr(e, "errno") and e.errno == 1062:
            raise HTTPException(status_code=409, detail="Username already taken. Please choose a different username.")
        raise db_error_to_http(e)

    return _normalize_row(row)


@router.patch("/{user_id}", response_model=AppUserDetail)
def update_user(
    user_id: int,
    body: UpdateAppUserRequest,
    current_user: dict = Depends(require_manager),
):
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        with get_db() as (conn, cursor):
            existing = _get_user_row(cursor, user_id)
            if not existing:
                raise HTTPException(status_code=404, detail=f"User {user_id} not found")

            merged_employee_id = updates.get("employee_id", existing["employee_id"])
            merged_customer_id = updates.get("customer_id", existing["customer_id"])
            if merged_employee_id is not None and merged_customer_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail="A user cannot be linked to both an employee and a customer",
                )

            if current_user.get("user_id") == user_id:
                if "role" in updates and updates["role"] != existing["role"]:
                    raise HTTPException(status_code=400, detail="Managers cannot change their own role")
                if "status" in updates and updates["status"] != "active":
                    raise HTTPException(status_code=400, detail="Managers cannot disable or lock their own account")

            if "username" in updates and updates["username"] is not None:
                updates["username"] = updates["username"].strip()
                if len(updates["username"]) < 3:
                    raise HTTPException(
                        status_code=400,
                        detail="Username must contain at least 3 non-space characters",
                    )

            column_map = {
                "username": "Username",
                "role": "Role",
                "status": "Status",
                "employee_id": "EmployeeID",
                "customer_id": "CustomerID",
            }
            set_clauses = [f"{column_map[key]} = %s" for key in updates]
            if {"username", "role", "status", "employee_id", "customer_id"} & set(updates):
                set_clauses.append("SessionVersion = SessionVersion + 1")
            set_sql = ", ".join(set_clauses)
            values = [updates[key] for key in updates]
            values.append(user_id)

            cursor.execute(f"UPDATE AppUsers SET {set_sql} WHERE UserID = %s", values)
            row = _get_user_row(cursor, user_id)
    except MySQLError as e:
        raise db_error_to_http(e)

    return _normalize_row(row)


@router.post("/{user_id}/reset-password", response_model=UserActionResponse)
def reset_user_password(
    user_id: int,
    body: ResetPasswordRequest,
    _=Depends(require_manager),
):
    try:
        set_password_for_user(user_id, body.new_password, unlock_user=True)
    except AppUserAuthError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail)
    return UserActionResponse(detail="Password reset successfully")


@router.post("/{user_id}/unlock", response_model=UserActionResponse)
def unlock_user(user_id: int, _=Depends(require_manager)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                UPDATE AppUsers
                SET Status = 'active',
                    FailedLoginCount = 0,
                    SessionVersion = SessionVersion + 1
                WHERE UserID = %s
                """,
                (user_id,),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    except MySQLError as e:
        raise db_error_to_http(e)
    return UserActionResponse(detail="User account unlocked")
