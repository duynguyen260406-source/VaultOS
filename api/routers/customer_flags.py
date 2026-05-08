import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_manager_or_auditor
from models.customer_flags import AddFlagRequest, FlagRecord

router = APIRouter()

VALID_TYPES = {"VIP", "Blacklist", "UnderInvestigation", "PEP", "Deceased", "Incapacitated", "CourtOrder"}

_FLAG_SQL = """
    SELECT
        f.FlagID             AS flag_id,
        f.CustomerID         AS customer_id,
        f.FlagType           AS flag_type,
        f.Reason             AS reason,
        f.AddedAt            AS added_at,
        f.ExpiresAt          AS expires_at,
        f.RemovedAt          AS removed_at,
        f.IsActive           AS is_active,
        a.Username           AS added_by_username,
        r.Username           AS removed_by_username
    FROM CustomerFlags f
    LEFT JOIN AppUsers a ON f.AddedByUserID   = a.UserID
    LEFT JOIN AppUsers r ON f.RemovedByUserID = r.UserID
"""


def _row(r) -> FlagRecord:
    return FlagRecord(
        flag_id=r["flag_id"],
        customer_id=r["customer_id"],
        flag_type=r["flag_type"],
        reason=r["reason"],
        added_at=str(r["added_at"]),
        expires_at=str(r["expires_at"]) if r["expires_at"] else None,
        removed_at=str(r["removed_at"]) if r["removed_at"] else None,
        is_active=bool(r["is_active"]),
        added_by_username=r["added_by_username"],
        removed_by_username=r["removed_by_username"],
    )


@router.get("/customers/{customer_id}/flags", response_model=list[FlagRecord])
def list_customer_flags(customer_id: int, active_only: bool = True, _=Depends(require_any_role)):
    try:
        with get_db() as (conn, cursor):
            where = "WHERE f.CustomerID = %s"
            params = [customer_id]
            if active_only:
                where += " AND f.IsActive = 1"
            cursor.execute(f"{_FLAG_SQL} {where} ORDER BY f.AddedAt DESC", params)
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return [_row(r) for r in rows]


@router.post("/customers/{customer_id}/flags", response_model=FlagRecord, status_code=201)
def add_flag(customer_id: int, req: AddFlagRequest, user=Depends(require_manager_or_auditor)):
    if req.flag_type not in VALID_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid flag_type: {req.flag_type}")
    try:
        with get_db() as (conn, cursor):
            cursor.execute("SELECT CustomerID FROM Customers WHERE CustomerID = %s", (customer_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Customer not found")

            cursor.execute(
                "SELECT FlagID FROM CustomerFlags WHERE CustomerID = %s AND FlagType = %s AND IsActive = 1",
                (customer_id, req.flag_type),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail=f"Customer already has an active {req.flag_type} flag")

            cursor.execute(
                """
                INSERT INTO CustomerFlags (CustomerID, FlagType, Reason, AddedByUserID, ExpiresAt)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (customer_id, req.flag_type, req.reason, user["user_id"], req.expires_at),
            )
            flag_id = cursor.lastrowid
            cursor.execute(f"{_FLAG_SQL} WHERE f.FlagID = %s", (flag_id,))
            row = cursor.fetchone()
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row(row)


@router.delete("/customers/{customer_id}/flags/{flag_id}")
def remove_flag(customer_id: int, flag_id: int, user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT IsActive FROM CustomerFlags WHERE FlagID = %s AND CustomerID = %s",
                (flag_id, customer_id),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Flag not found")
            if not row["IsActive"]:
                raise HTTPException(status_code=409, detail="Flag is already removed")

            cursor.execute(
                "UPDATE CustomerFlags SET RemovedAt = NOW(), RemovedByUserID = %s WHERE FlagID = %s",
                (user["user_id"], flag_id),
            )
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return {"success": True}


@router.get("/watchlist", response_model=list[FlagRecord])
def watchlist(
    flag_type: str = "",
    limit: int = Query(100, ge=1, le=500),
    offset: int = 0,
    user=Depends(require_manager_or_auditor),
):
    conditions = ["f.IsActive = 1"]
    params: list = []
    if flag_type and flag_type in VALID_TYPES:
        conditions.append("f.FlagType = %s")
        params.append(flag_type)

    where = "WHERE " + " AND ".join(conditions)
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"{_FLAG_SQL} {where} ORDER BY f.AddedAt DESC LIMIT %s OFFSET %s",
                [*params, limit, offset],
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return [_row(r) for r in rows]
