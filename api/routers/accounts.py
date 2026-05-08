import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

from banking_ops import close_account, get_account_info, get_transaction_history, open_account
from db_connection import get_db
from dependencies import (
    db_error_to_http,
    require_any_role,
    require_manager,
    require_teller_or_manager,
    require_manager_or_auditor,
)
from models.accounts import (
    AccountDetail,
    AccountListResponse,
    OpenAccountRequest,
    OpenAccountResponse,
    ChangeStatusRequest,
    StatusHistoryRecord,
)
from models.transactions import (
    TransactionHistoryResponse,
    TransactionRecord,
)

router = APIRouter()


@router.post("", response_model=OpenAccountResponse, status_code=201)
def api_open_account(req: OpenAccountRequest, _=Depends(require_teller_or_manager)):
    try:
        account_id = open_account(req.customer_id, req.account_type_id, req.branch_id, raise_on_error=True)
    except MySQLError as e:
        raise db_error_to_http(e)
    if account_id is None:
        raise HTTPException(
            status_code=400,
            detail="Could not open account. Check customer, account type, and branch IDs.",
        )
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT AccountNumber AS account_number FROM Accounts WHERE AccountID = %s",
                (account_id,),
            )
            row = cursor.fetchone()
        return OpenAccountResponse(account_id=account_id, account_number=row["account_number"])
    except MySQLError as e:
        raise db_error_to_http(e)


@router.get("/search", response_model=AccountListResponse)
def search_accounts(q: str = Query("", min_length=0), current_user: dict = Depends(require_any_role)):
    """Search active accounts by account number, customer name, or account ID."""
    pattern = f"%{q}%"
    id_clause = ""
    params = []
    scope_sql = ""
    if current_user["role"] == "teller":
        if current_user.get("branch_id") is None:
            return AccountListResponse(accounts=[], total=0)
        scope_sql = " AND a.BranchID = %s"
        params.append(current_user["branch_id"])
    customer_table = "vw_customer_directory_masked" if current_user["role"] == "auditor" else "Customers"
    params.extend([pattern, pattern, pattern, pattern])
    if q.strip().isdigit():
        id_clause = "OR a.AccountID = %s"
        params.append(int(q.strip()))
    try:
        with get_db() as (conn, cursor):
            query = f"""
                SELECT
                    a.AccountID       AS account_id,
                    a.CustomerID      AS customer_id,
                    a.AccountNumber   AS account_number,
                    CONCAT(c.FirstName, ' ', c.LastName) AS customer_name,
                    at.TypeName       AS account_type,
                    b.BranchName      AS branch_name,
                    a.Balance         AS balance,
                    a.Status          AS status,
                    a.OpenDate        AS created_at
                FROM Accounts a
                JOIN {customer_table} c  ON a.CustomerID    = c.CustomerID
                JOIN AccountTypes at ON a.AccountTypeID = at.AccountTypeID
                JOIN Branches     b  ON a.BranchID      = b.BranchID
                WHERE a.Status = 'Active'
                  {scope_sql}
                  AND (
                    a.AccountNumber LIKE %s
                    OR c.FirstName LIKE %s
                    OR c.LastName LIKE %s
                    OR CONCAT(c.FirstName, ' ', c.LastName) LIKE %s
                    {id_clause}
                  )
                ORDER BY a.AccountID
                LIMIT 10
                """
            cursor.execute(
                query,
                tuple(params),
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    accounts = []
    for row in rows:
        normalized = {
            k: (
                float(v)
                if hasattr(v, "quantize")
                else (str(v) if hasattr(v, "isoformat") else v)
            )
            for k, v in row.items()
        }
        accounts.append(AccountDetail(**normalized))
    return AccountListResponse(accounts=accounts, total=len(accounts))


@router.delete("/{account_id}")
def api_close_account(account_id: int, _=Depends(require_manager)):
    try:
        success = close_account(account_id, raise_on_error=True)
    except MySQLError as e:
        msg = str(e.msg) if hasattr(e, "msg") and e.msg else str(e)
        if hasattr(e, "sqlstate") and e.sqlstate == "45000":
            raise HTTPException(status_code=409, detail=msg)
        raise db_error_to_http(e)
    if not success:
        raise HTTPException(
            status_code=409,
            detail="Cannot close account. It may not exist, not be Active, or have a non-zero balance.",
        )
    return {"success": True, "message": f"Account {account_id} closed successfully."}


@router.get("/{account_id}", response_model=AccountDetail)
def api_get_account(account_id: int, _=Depends(require_any_role)):
    try:
        account = get_account_info(account_id)
    except MySQLError as e:
        raise db_error_to_http(e)
    if account is None:
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found")
    account = {
        k: (
            float(v)
            if hasattr(v, "quantize")
            else (str(v) if hasattr(v, "isoformat") else v)
        )
        for k, v in account.items()
    }
    return AccountDetail(**account)


@router.get("/{account_id}/transactions", response_model=TransactionHistoryResponse)
def api_get_transactions(
    account_id: int,
    limit: int = Query(50, ge=1, le=200),
    _=Depends(require_any_role),
):
    try:
        rows = get_transaction_history(account_id, limit)
    except MySQLError as e:
        raise db_error_to_http(e)
    records = [
        TransactionRecord(
            transaction_id=row["transaction_id"],
            transaction_type=row["transaction_type"],
            amount=float(row["amount"]),
            transaction_date=str(row["transaction_date"]),
            description=row.get("description"),
            reference_id=row.get("reference_id"),
        )
        for row in rows
    ]
    return TransactionHistoryResponse(account_id=account_id, transactions=records, total=len(records))


@router.post("/{account_id}/status")
def change_account_status(
    account_id: int,
    req: ChangeStatusRequest,
    user=Depends(require_manager_or_auditor),
):
    allowed_statuses = {"Active", "Frozen", "Hold", "Dormant", "Closed"}
    if req.new_status not in allowed_statuses:
        raise HTTPException(status_code=422, detail=f"Invalid status: {req.new_status}")

    if user["role"] == "auditor" and req.new_status != "Frozen":
        raise HTTPException(status_code=403, detail="Auditors may only set status to Frozen")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT Status, Balance FROM Accounts WHERE AccountID = %s",
                (account_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Account not found")

            old_status = row["Status"]
            if old_status == req.new_status:
                raise HTTPException(status_code=409, detail=f"Account is already {req.new_status}")
            if old_status == "Closed":
                raise HTTPException(status_code=409, detail="Cannot change status of a closed account")

            cursor.execute(
                """
                INSERT INTO AccountStatusHistory (AccountID, OldStatus, NewStatus, Reason, ChangedByUserID)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (account_id, old_status, req.new_status, req.reason, user["user_id"]),
            )
            cursor.execute(
                """
                UPDATE Accounts
                SET Status = %s,
                    StatusReason = %s,
                    StatusChangedByUserID = %s,
                    StatusChangedAt = NOW(),
                    HoldExpiresAt = %s
                WHERE AccountID = %s
                """,
                (
                    req.new_status,
                    req.reason,
                    user["user_id"],
                    req.hold_expires_at,
                    account_id,
                ),
            )
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    return {"success": True, "account_id": account_id, "new_status": req.new_status}


@router.get("/{account_id}/status-history", response_model=list[StatusHistoryRecord])
def get_status_history(account_id: int, _=Depends(require_any_role)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    h.HistoryID        AS history_id,
                    h.AccountID        AS account_id,
                    h.OldStatus        AS old_status,
                    h.NewStatus        AS new_status,
                    h.Reason           AS reason,
                    h.ChangedAt        AS changed_at,
                    u.Username         AS changed_by_username
                FROM AccountStatusHistory h
                LEFT JOIN AppUsers u ON h.ChangedByUserID = u.UserID
                WHERE h.AccountID = %s
                ORDER BY h.ChangedAt DESC
                """,
                (account_id,),
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    return [
        StatusHistoryRecord(
            history_id=r["history_id"],
            account_id=r["account_id"],
            old_status=r["old_status"],
            new_status=r["new_status"],
            reason=r["reason"],
            changed_at=str(r["changed_at"]),
            changed_by_username=r["changed_by_username"],
        )
        for r in rows
    ]
