import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_teller_or_manager
from pdf_documents import account_statement_pdf, transaction_receipt_pdf

router = APIRouter()

_TXN_SQL = """
    SELECT
        t.TransactionID   AS transaction_id,
        t.TransactionType AS transaction_type,
        t.Amount          AS amount,
        t.TransactionDate AS transaction_date,
        t.Description     AS description,
        t.ReferenceID     AS reference_id,
        a.AccountNumber   AS account_number,
        at.TypeName       AS account_type,
        b.BranchName      AS branch_name,
        CONCAT(c.FirstName, ' ', c.LastName) AS customer_name
    FROM Transactions t
    JOIN Accounts     a  ON t.AccountID      = a.AccountID
    JOIN AccountTypes at ON a.AccountTypeID  = at.AccountTypeID
    JOIN Branches     b  ON a.BranchID       = b.BranchID
    JOIN Customers    c  ON a.CustomerID     = c.CustomerID
    WHERE t.TransactionID = %s
"""


@router.get("/transactions/{transaction_id}/receipt")
def download_receipt(transaction_id: int, _=Depends(require_teller_or_manager)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(_TXN_SQL, (transaction_id,))
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)

    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")

    def _cast(v):
        if hasattr(v, "quantize"):
            return float(v)
        if hasattr(v, "isoformat"):
            return str(v)
        return v

    flat = {k: _cast(v) for k, v in row.items()}
    account = {k: flat[k] for k in ("account_number", "account_type", "branch_name", "customer_name")}

    pdf_bytes = transaction_receipt_pdf(flat, account)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="receipt_{transaction_id}.pdf"'},
    )


@router.get("/accounts/{account_id}/statement")
def download_statement(
    account_id: int,
    from_date: str = Query("", alias="from"),
    to_date: str = Query("", alias="to"),
    _=Depends(require_any_role),
):
    def _cast(v):
        if hasattr(v, "quantize"):
            return float(v)
        if hasattr(v, "isoformat"):
            return str(v)
        return v

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    a.AccountID,
                    a.AccountNumber AS account_number,
                    at.TypeName     AS account_type,
                    b.BranchName    AS branch_name,
                    a.Balance       AS balance,
                    a.Status        AS status,
                    CONCAT(c.FirstName, ' ', c.LastName) AS customer_name
                FROM Accounts     a
                JOIN AccountTypes at ON a.AccountTypeID = at.AccountTypeID
                JOIN Branches     b  ON a.BranchID      = b.BranchID
                JOIN Customers    c  ON a.CustomerID    = c.CustomerID
                WHERE a.AccountID = %s
                """,
                (account_id,),
            )
            acc_row = cursor.fetchone()

            if not acc_row:
                raise HTTPException(status_code=404, detail="Account not found")

            date_filter = ""
            params: list = [account_id]
            if from_date:
                date_filter += " AND DATE(t.TransactionDate) >= %s"
                params.append(from_date)
            if to_date:
                date_filter += " AND DATE(t.TransactionDate) <= %s"
                params.append(to_date)

            cursor.execute(
                f"""
                SELECT
                    t.TransactionID   AS transaction_id,
                    t.TransactionType AS transaction_type,
                    t.Amount          AS amount,
                    t.TransactionDate AS transaction_date,
                    t.Description     AS description,
                    t.ReferenceID     AS reference_id
                FROM Transactions t
                WHERE t.AccountID = %s {date_filter}
                ORDER BY t.TransactionDate ASC
                """,
                params,
            )
            tx_rows = cursor.fetchall()

    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    account = {k: _cast(v) for k, v in acc_row.items()}
    transactions = [{k: _cast(v) for k, v in row.items()} for row in tx_rows]

    pdf_bytes = account_statement_pdf(account, transactions, from_date, to_date)
    safe_from = (from_date or "all").replace("-", "")
    safe_to = (to_date or "all").replace("-", "")
    filename = f"statement_{account_id}_{safe_from}_{safe_to}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
