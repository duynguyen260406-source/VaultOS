import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, Query
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_manager

router = APIRouter()


def _cast(v):
    if v is None:
        return None
    if hasattr(v, "quantize"):
        return float(v)
    if hasattr(v, "isoformat"):
        return str(v)
    return v


@router.get("/branch")
def branch_performance(
    days: int = Query(30, ge=1, le=90),
    branch_id: int = None,
    user=Depends(require_manager),
):
    conditions = ["txn_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)"]
    params = [days]
    if branch_id:
        conditions.append("branch_id = %s")
        params.append(branch_id)
    where = "WHERE " + " AND ".join(conditions)
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT branch_id, branch_name, txn_date,
                       txn_count, total_amount, active_accounts,
                       deposit_volume, withdrawal_volume, transfer_volume
                FROM vw_branch_performance {where}
                ORDER BY txn_date DESC, branch_id
                """,
                params,
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return [{k: _cast(v) for k, v in r.items()} for r in rows]


@router.get("/teller")
def teller_productivity(
    days: int = Query(30, ge=1, le=90),
    branch_id: int = None,
    user=Depends(require_manager),
):
    conditions = ["txn_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)", "user_id IS NOT NULL"]
    params = [days]
    if branch_id:
        conditions.append("branch_id = %s")
        params.append(branch_id)
    where = "WHERE " + " AND ".join(conditions)
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT user_id, username, branch_id, branch_name, txn_date,
                       txn_count, total_amount, deposits, withdrawals, transfers
                FROM vw_teller_productivity {where}
                ORDER BY txn_date DESC, txn_count DESC
                """,
                params,
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return [{k: _cast(v) for k, v in r.items()} for r in rows]


@router.get("/summary")
def performance_summary(
    days: int = Query(30, ge=1, le=90),
    user=Depends(require_manager),
):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    COUNT(*)                AS txn_count,
                    SUM(Amount)             AS total_volume,
                    COUNT(DISTINCT AccountID) AS active_accounts,
                    AVG(Amount)             AS avg_txn_amount
                FROM Transactions
                WHERE TransactionDate >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                """,
                (days,),
            )
            summary = cursor.fetchone()

            cursor.execute(
                """
                SELECT b.BranchName, COUNT(*) AS txn_count, SUM(t.Amount) AS total_amount
                FROM Transactions t
                JOIN Accounts a ON t.AccountID = a.AccountID
                JOIN Branches b ON a.BranchID = b.BranchID
                WHERE t.TransactionDate >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                GROUP BY b.BranchID, b.BranchName
                ORDER BY total_amount DESC
                """,
                (days,),
            )
            by_branch = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    return {
        "summary": {k: _cast(v) for k, v in summary.items()} if summary else {},
        "by_branch": [{k: _cast(v) for k, v in r.items()} for r in by_branch],
    }
