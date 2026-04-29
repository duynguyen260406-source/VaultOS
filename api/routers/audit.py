import os
import sys
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_manager_or_auditor, require_manager
from models.audit import (
    AuditLogItem,
    AuditLogResponse,
    ReviewStatusUpdate,
    SuspiciousActivityItem,
    SuspiciousActivityResponse,
)

router = APIRouter()


@router.get("/suspicious-activities", response_model=SuspiciousActivityResponse)
def list_suspicious_activities(
    reviewed: Optional[str] = Query(None),
    _=Depends(require_manager_or_auditor),
):
    conditions = []
    params = []

    if reviewed is not None:
        if reviewed.lower() == "true":
            conditions.append("sa.Reviewed = TRUE")
        elif reviewed.lower() == "false":
            conditions.append("sa.Reviewed = FALSE")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT
                    sa.AlertID      AS alert_id,
                    sa.AccountID    AS account_id,
                    a.AccountNumber AS account_number,
                    sa.Amount       AS amount,
                    sa.AlertDate    AS transaction_date,
                    sa.Reason       AS reason,
                    sa.Reviewed     AS reviewed
                FROM SuspiciousActivity sa
                JOIN Accounts a ON sa.AccountID = a.AccountID
                {where}
                ORDER BY sa.AlertDate DESC
                """,
                tuple(params),
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    items = [
        SuspiciousActivityItem(
            alert_id=row["alert_id"],
            account_id=row["account_id"],
            account_number=row["account_number"],
            amount=float(row["amount"]),
            transaction_date=str(row["transaction_date"]),
            reason=row["reason"],
            reviewed=bool(row["reviewed"]),
        )
        for row in rows
    ]
    return SuspiciousActivityResponse(items=items, total=len(items))


@router.patch("/suspicious-activities/{alert_id}")
def set_review_status(
    alert_id: int,
    body: ReviewStatusUpdate = ReviewStatusUpdate(),
    _=Depends(require_manager_or_auditor),
):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT AlertID FROM SuspiciousActivity WHERE AlertID = %s",
                (alert_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found.")
            cursor.execute(
                "UPDATE SuspiciousActivity SET Reviewed = %s WHERE AlertID = %s",
                (body.reviewed, alert_id),
            )
    except MySQLError as e:
        raise db_error_to_http(e)

    status = "reviewed" if body.reviewed else "unreviewed"
    return {"success": True, "message": f"Alert {alert_id} marked as {status}."}


@router.get("/logs", response_model=AuditLogResponse)
def list_audit_logs(
    performed_by: Optional[str] = Query(None),
    table_name: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    _=Depends(require_manager_or_auditor),
):
    conditions = []
    params = []

    if performed_by:
        conditions.append("al.PerformedBy LIKE %s")
        params.append(f"%{performed_by}%")
    if table_name:
        conditions.append("al.TableName = %s")
        params.append(table_name)
    if action_type:
        conditions.append("al.ActionType = %s")
        params.append(action_type)
    if date_from:
        conditions.append("al.ActionTimestamp >= %s")
        params.append(date_from)
    if date_to:
        conditions.append("al.ActionTimestamp < DATE_ADD(%s, INTERVAL 1 DAY)")
        params.append(date_to)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    offset = (page - 1) * page_size

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"SELECT COUNT(*) AS cnt FROM AuditLog al {where}",
                tuple(params),
            )
            total = cursor.fetchone()["cnt"]

            cursor.execute(
                f"""
                SELECT
                    al.AuditID          AS log_id,
                    al.TableName        AS table_name,
                    al.ActionType       AS action_type,
                    al.RecordID         AS record_id,
                    al.PerformedBy      AS performed_by,
                    al.ActionTimestamp  AS performed_at
                FROM AuditLog al
                {where}
                ORDER BY al.ActionTimestamp DESC
                LIMIT %s OFFSET %s
                """,
                tuple(params) + (page_size, offset),
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    items = [
        AuditLogItem(
            log_id=row["log_id"],
            table_name=row["table_name"],
            action_type=row["action_type"],
            record_id=row["record_id"],
            performed_by=row.get("performed_by"),
            performed_at=str(row["performed_at"]),
        )
        for row in rows
    ]
    return AuditLogResponse(items=items, total=total)
