import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError

from approval_payloads import apply_payload, create_approval
from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_manager, require_manager_or_auditor
from models.approvals import ApprovalListResponse, ApprovalRecord, ApprovalStats, DecideRequest, DecideResponse
from security_context import get_current_actor, is_branch_scoped_role

router = APIRouter()

_LIST_SQL = """
    SELECT
        pa.ApprovalID          AS approval_id,
        pa.RequestType         AS request_type,
        pa.Payload             AS payload,
        pa.RequestedByUserID   AS requested_by_user_id,
        req.Username           AS requested_by_username,
        pa.RequestedAt         AS requested_at,
        pa.BranchID            AS branch_id,
        b.BranchName           AS branch_name,
        pa.Status              AS status,
        pa.ReviewedByUserID    AS reviewed_by_user_id,
        rev.Username           AS reviewed_by_username,
        pa.ReviewedAt          AS reviewed_at,
        pa.ReviewNotes         AS review_notes,
        pa.ExecutedAt          AS executed_at,
        pa.ExecutionError      AS execution_error
    FROM PendingApprovals pa
    JOIN AppUsers req ON pa.RequestedByUserID = req.UserID
    LEFT JOIN AppUsers rev ON pa.ReviewedByUserID = rev.UserID
    LEFT JOIN Branches b ON pa.BranchID = b.BranchID
"""

_STATS_SQL = """
    SELECT
        SUM(Status = 'pending')                                   AS pending,
        SUM(Status = 'approved'  AND DATE(RequestedAt) = CURDATE()) AS approved_today,
        SUM(Status = 'rejected'  AND DATE(RequestedAt) = CURDATE()) AS rejected_today,
        SUM(Status = 'executed'  AND DATE(ExecutedAt)  = CURDATE()) AS executed_today
    FROM PendingApprovals
"""


def _row_to_record(row: dict) -> ApprovalRecord:
    payload = row["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)
    return ApprovalRecord(
        approval_id=row["approval_id"],
        request_type=row["request_type"],
        payload=payload,
        requested_by_user_id=row["requested_by_user_id"],
        requested_by_username=row["requested_by_username"],
        requested_at=row["requested_at"],
        branch_id=row["branch_id"],
        branch_name=row["branch_name"],
        status=row["status"],
        reviewed_by_user_id=row["reviewed_by_user_id"],
        reviewed_by_username=row["reviewed_by_username"],
        reviewed_at=row["reviewed_at"],
        review_notes=row["review_notes"],
        executed_at=row["executed_at"],
        execution_error=row["execution_error"],
    )


@router.get("", response_model=ApprovalListResponse)
def list_approvals(
    status: str = "",
    limit: int = 100,
    offset: int = 0,
    user=Depends(require_manager_or_auditor),
):
    actor = get_current_actor()
    branch_id = actor.get("branch_id") if actor else None

    conditions = []
    params: list = []

    if status:
        conditions.append("pa.Status = %s")
        params.append(status)

    if branch_id and is_branch_scoped_role(user["role"]):
        conditions.append("pa.BranchID = %s")
        params.append(branch_id)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    try:
        with get_db() as (conn, cursor):
            cursor.execute(f"{_LIST_SQL} {where} ORDER BY pa.RequestedAt DESC LIMIT %s OFFSET %s",
                           [*params, limit, offset])
            rows = cursor.fetchall()

            cursor.execute("SELECT COUNT(*) AS n FROM PendingApprovals pa " + where, params)
            total = cursor.fetchone()["n"]

            stats_where = ("WHERE pa.BranchID = %s" if branch_id and is_branch_scoped_role(user["role"]) else "")
            stats_params = [branch_id] if branch_id and is_branch_scoped_role(user["role"]) else []
            cursor.execute(_STATS_SQL.replace("FROM PendingApprovals", "FROM PendingApprovals pa") + stats_where, stats_params)
            s = cursor.fetchone()

    except MySQLError as e:
        raise db_error_to_http(e)

    return ApprovalListResponse(
        approvals=[_row_to_record(r) for r in rows],
        stats=ApprovalStats(
            pending=int(s["pending"] or 0),
            approved_today=int(s["approved_today"] or 0),
            rejected_today=int(s["rejected_today"] or 0),
            executed_today=int(s["executed_today"] or 0),
        ),
        total=total,
    )


@router.get("/mine", response_model=ApprovalListResponse)
def list_my_approvals(
    status: str = "",
    limit: int = 100,
    offset: int = 0,
    user=Depends(require_any_role),
):
    conditions = ["pa.RequestedByUserID = %s"]
    params: list = [user["user_id"]]

    if status:
        conditions.append("pa.Status = %s")
        params.append(status)

    where = "WHERE " + " AND ".join(conditions)

    try:
        with get_db() as (conn, cursor):
            cursor.execute(f"{_LIST_SQL} {where} ORDER BY pa.RequestedAt DESC LIMIT %s OFFSET %s",
                           [*params, limit, offset])
            rows = cursor.fetchall()

            cursor.execute("SELECT COUNT(*) AS n FROM PendingApprovals pa " + where, params)
            total = cursor.fetchone()["n"]

            cursor.execute(
                _STATS_SQL.replace("FROM PendingApprovals", "FROM PendingApprovals pa") +
                "WHERE pa.RequestedByUserID = %s",
                [user["user_id"]],
            )
            s = cursor.fetchone()

    except MySQLError as e:
        raise db_error_to_http(e)

    return ApprovalListResponse(
        approvals=[_row_to_record(r) for r in rows],
        stats=ApprovalStats(
            pending=int(s["pending"] or 0),
            approved_today=int(s["approved_today"] or 0),
            rejected_today=int(s["rejected_today"] or 0),
            executed_today=int(s["executed_today"] or 0),
        ),
        total=total,
    )


@router.get("/{approval_id}", response_model=ApprovalRecord)
def get_approval(approval_id: int, user=Depends(require_any_role)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                _LIST_SQL + " WHERE pa.ApprovalID = %s",
                (approval_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)

    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")

    if user["role"] == "teller" and row["requested_by_user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    return _row_to_record(row)


@router.post("/{approval_id}/decide", response_model=DecideResponse)
def decide_approval(approval_id: int, req: DecideRequest, user=Depends(require_manager)):
    if req.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=422, detail="decision must be 'approved' or 'rejected'")
    if req.decision == "rejected" and not (req.review_notes or "").strip():
        raise HTTPException(status_code=422, detail="review_notes are required when rejecting")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT Status, RequestedByUserID FROM PendingApprovals WHERE ApprovalID = %s",
                (approval_id,),
            )
            row = cursor.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="Approval not found")
            if row["Status"] != "pending":
                raise HTTPException(status_code=409, detail=f"Approval is already {row['Status']}")

            cursor.execute(
                "UPDATE PendingApprovals SET Status=%s, ReviewedByUserID=%s, ReviewedAt=NOW(), ReviewNotes=%s "
                "WHERE ApprovalID=%s",
                (req.decision, user["user_id"], req.review_notes, approval_id),
            )
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    if req.decision == "approved":
        success, msg = apply_payload(approval_id)
        return DecideResponse(
            success=success,
            message=msg if success else f"Approved but execution failed: {msg}",
            approval_id=approval_id,
            status="executed" if success else "failed",
            execution_error=None if success else msg,
        )

    return DecideResponse(
        success=True,
        message="Approval rejected.",
        approval_id=approval_id,
        status="rejected",
    )


@router.post("/{approval_id}/execute", response_model=DecideResponse)
def retry_execute(approval_id: int, user=Depends(require_manager)):
    """Retry execution of a failed approval."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT Status FROM PendingApprovals WHERE ApprovalID = %s", (approval_id,)
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)

    if not row:
        raise HTTPException(status_code=404, detail="Approval not found")
    if row["Status"] != "failed":
        raise HTTPException(status_code=409, detail=f"Only failed approvals can be retried (current: {row['Status']})")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "UPDATE PendingApprovals SET Status='approved' WHERE ApprovalID=%s",
                (approval_id,),
            )
    except MySQLError as e:
        raise db_error_to_http(e)

    success, msg = apply_payload(approval_id)
    return DecideResponse(
        success=success,
        message=msg if success else f"Retry failed: {msg}",
        approval_id=approval_id,
        status="executed" if success else "failed",
        execution_error=None if success else msg,
    )
