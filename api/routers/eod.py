import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_manager, require_teller_or_manager
from models.eod import (
    CloseSessionRequest,
    OpenSessionRequest,
    ReconcileRequest,
    SessionListResponse,
    SessionRecord,
)
from rule_lookup import get_rule_decimal

router = APIRouter()

_VARIANCE_TOLERANCE_CODE = "cash_variance_tolerance_vnd"
_DEFAULT_TOLERANCE = 100_000  # 100k VND

_SESSION_SQL = """
    SELECT
        ts.SessionID              AS session_id,
        ts.UserID                 AS user_id,
        u.Username                AS username,
        ts.BranchID               AS branch_id,
        b.BranchName              AS branch_name,
        ts.OpenedAt               AS opened_at,
        ts.OpeningBalance         AS opening_balance,
        ts.ClosedAt               AS closed_at,
        ts.ClosingBalanceCounted  AS closing_balance_counted,
        ts.ClosingBalanceExpected AS closing_balance_expected,
        ts.Variance               AS variance,
        ts.Status                 AS status,
        ts.Notes                  AS notes
    FROM TellerSessions ts
    JOIN AppUsers u ON ts.UserID   = u.UserID
    JOIN Branches b ON ts.BranchID = b.BranchID
"""

_RUNNING_CASH_SQL = """
    SELECT
        COALESCE(SUM(CASE WHEN t.TransactionType IN ('Deposit','Transfer_In')
                         THEN t.Amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN t.TransactionType IN ('Withdrawal','Transfer_Out')
                         THEN t.Amount ELSE 0 END), 0) AS running_cash
    FROM Transactions t
    JOIN Accounts a ON t.AccountID = a.AccountID
    WHERE a.BranchID = %s
      AND t.TransactionDate >= %s
      AND (%s IS NULL OR t.TransactionDate <= %s)
"""


def _row_to_record(row: dict, running_cash=None) -> SessionRecord:
    def _s(v):
        if v is None:
            return None
        if hasattr(v, "isoformat"):
            return str(v)
        if hasattr(v, "quantize"):
            return float(v)
        return v

    return SessionRecord(
        session_id=row["session_id"],
        user_id=row["user_id"],
        username=row["username"],
        branch_id=row["branch_id"],
        branch_name=row["branch_name"],
        opened_at=_s(row["opened_at"]),
        opening_balance=float(row["opening_balance"] or 0),
        closed_at=_s(row["closed_at"]),
        closing_balance_counted=_s(row["closing_balance_counted"]),
        closing_balance_expected=_s(row["closing_balance_expected"]),
        variance=_s(row["variance"]),
        status=row["status"],
        notes=row["notes"],
        running_cash=running_cash,
    )


def _compute_running_cash(cursor, branch_id: int, opened_at, closed_at=None) -> float:
    cursor.execute(_RUNNING_CASH_SQL, (branch_id, opened_at, closed_at, closed_at))
    row = cursor.fetchone()
    return float(row["running_cash"] or 0) if row else 0.0


@router.get("/session", response_model=SessionRecord)
def get_my_session(user=Depends(require_teller_or_manager)):
    """Return the caller's currently open session, or 404 if none."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                _SESSION_SQL + " WHERE ts.UserID = %s AND ts.Status = 'open' ORDER BY ts.OpenedAt DESC LIMIT 1",
                (user["user_id"],),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No open session")
            running = _compute_running_cash(cursor, row["branch_id"], row["opened_at"])
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_record(row, running_cash=running)


@router.post("/sessions/open", response_model=SessionRecord, status_code=201)
def open_session(req: OpenSessionRequest, user=Depends(require_teller_or_manager)):
    """Open a new cash-drawer session for today. Fails if one is already open."""
    if user.get("branch_id") is None:
        raise HTTPException(status_code=400, detail="Your account has no branch assigned.")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT SessionID FROM TellerSessions WHERE UserID = %s AND Status = 'open' LIMIT 1",
                (user["user_id"],),
            )
            if cursor.fetchone():
                raise HTTPException(status_code=409, detail="You already have an open session. Close it first.")

            cursor.execute(
                "INSERT INTO TellerSessions (UserID, BranchID, OpeningBalance) VALUES (%s, %s, %s)",
                (user["user_id"], user["branch_id"], float(req.opening_balance)),
            )
            session_id = cursor.lastrowid

            cursor.execute(_SESSION_SQL + " WHERE ts.SessionID = %s", (session_id,))
            row = cursor.fetchone()
            running = _compute_running_cash(cursor, row["branch_id"], row["opened_at"])
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_record(row, running_cash=running)


@router.post("/sessions/close", response_model=SessionRecord)
def close_session(req: CloseSessionRequest, user=Depends(require_teller_or_manager)):
    """Close the caller's open session. Computes expected balance and variance."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                _SESSION_SQL + " WHERE ts.UserID = %s AND ts.Status = 'open' ORDER BY ts.OpenedAt DESC LIMIT 1",
                (user["user_id"],),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No open session to close.")

            running = _compute_running_cash(cursor, row["branch_id"], row["opened_at"])
            expected = float(row["opening_balance"] or 0) + running
            counted = float(req.counted_amount)
            variance = counted - expected

            tolerance = float(get_rule_decimal(_VARIANCE_TOLERANCE_CODE, _DEFAULT_TOLERANCE))
            new_status = "flagged" if abs(variance) > tolerance else "closed"

            cursor.execute(
                """UPDATE TellerSessions
                   SET Status = %s, ClosedAt = NOW(),
                       ClosingBalanceCounted  = %s,
                       ClosingBalanceExpected = %s,
                       Variance = %s,
                       Notes = %s
                   WHERE SessionID = %s""",
                (new_status, counted, expected, variance, req.notes or None, row["session_id"]),
            )

            cursor.execute(_SESSION_SQL + " WHERE ts.SessionID = %s", (row["session_id"],))
            updated = cursor.fetchone()

    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_record(updated, running_cash=running)


@router.get("/sessions", response_model=SessionListResponse)
def list_sessions(
    status: str = "",
    limit: int = 100,
    offset: int = 0,
    user=Depends(require_any_role),
):
    """List sessions. Managers/auditors see branch; tellers see their own."""
    conditions = []
    params: list = []

    if user["role"] == "teller":
        conditions.append("ts.UserID = %s")
        params.append(user["user_id"])
    elif user.get("branch_id"):
        conditions.append("ts.BranchID = %s")
        params.append(user["branch_id"])

    if status:
        conditions.append("ts.Status = %s")
        params.append(status)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"{_SESSION_SQL} {where} ORDER BY ts.OpenedAt DESC LIMIT %s OFFSET %s",
                [*params, limit, offset],
            )
            rows = cursor.fetchall()
            cursor.execute(
                f"SELECT COUNT(*) AS n FROM TellerSessions ts {where}", params
            )
            total = cursor.fetchone()["n"]
    except MySQLError as e:
        raise db_error_to_http(e)

    return SessionListResponse(
        sessions=[_row_to_record(r) for r in rows],
        total=total,
    )


@router.post("/sessions/{session_id}/reconcile", response_model=SessionRecord)
def reconcile_session(session_id: int, req: ReconcileRequest, user=Depends(require_manager)):
    """Manager marks a closed/flagged session as reconciled."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT Status FROM TellerSessions WHERE SessionID = %s", (session_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Session not found")
            if row["Status"] not in ("closed", "flagged"):
                raise HTTPException(
                    status_code=409,
                    detail=f"Only closed/flagged sessions can be reconciled (current: {row['Status']})",
                )

            cursor.execute(
                "UPDATE TellerSessions SET Status = 'reconciled', Notes = %s WHERE SessionID = %s",
                (req.notes or None, session_id),
            )
            cursor.execute(_SESSION_SQL + " WHERE ts.SessionID = %s", (session_id,))
            updated = cursor.fetchone()
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_record(updated)
