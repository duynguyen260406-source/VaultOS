import os
import sys
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError
from pydantic import BaseModel
from typing import Optional

from db_connection import get_db
from dependencies import db_error_to_http, require_manager

router = APIRouter()


class AccrualSummary(BaseModel):
    account_id: int
    account_number: str
    balance: float
    interest_rate: float
    daily_interest: float
    last_accrued: Optional[str] = None


class PendingAccrualResponse(BaseModel):
    accounts: list[AccrualSummary]
    total: int


class RunNowResponse(BaseModel):
    credited: int
    failed: int
    date: str


_PENDING_SQL = """
    SELECT
        a.AccountID          AS account_id,
        a.AccountNumber      AS account_number,
        a.Balance            AS balance,
        at.InterestRate      AS interest_rate,
        a.LastInterestAccruedDate AS last_accrued
    FROM Accounts a
    JOIN AccountTypes at ON a.AccountTypeID = at.AccountTypeID
    WHERE at.AccruesInterest = 1
      AND at.InterestRate IS NOT NULL
      AND at.InterestRate > 0
      AND a.Status = 'Active'
      AND a.Balance > 0
      AND (a.LastInterestAccruedDate IS NULL OR a.LastInterestAccruedDate < CURDATE())
    ORDER BY a.AccountID
    LIMIT 200
"""


@router.get("/pending", response_model=PendingAccrualResponse)
def list_pending(user=Depends(require_manager)):
    """List accounts with interest accrual pending today."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(_PENDING_SQL)
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    accounts = []
    for row in rows:
        balance = float(row["balance"] or 0)
        rate = float(row["interest_rate"] or 0)
        daily = round(balance * rate / 365, 2)
        accounts.append(AccrualSummary(
            account_id=row["account_id"],
            account_number=row["account_number"],
            balance=balance,
            interest_rate=rate,
            daily_interest=daily,
            last_accrued=str(row["last_accrued"]) if row["last_accrued"] else None,
        ))
    return PendingAccrualResponse(accounts=accounts, total=len(accounts))


@router.post("/run-now", response_model=RunNowResponse)
def run_accrual_now(user=Depends(require_manager)):
    """Trigger interest accrual for all eligible accounts immediately."""
    today = date.today()
    credited = failed = 0

    try:
        with get_db() as (conn, cursor):
            cursor.execute(_PENDING_SQL.replace("CURDATE()", "%s"), (today.isoformat(),))
            accounts = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    for acc in accounts:
        try:
            balance = Decimal(str(acc["balance"] or 0))
            rate = Decimal(str(acc["interest_rate"] or 0))
            interest = (balance * rate / Decimal("365")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            if interest <= 0:
                continue

            with get_db() as (conn, cursor):
                cursor.execute(
                    """
                    INSERT INTO Transactions (AccountID, TransactionType, Amount, Description)
                    VALUES (%s, 'InterestCredit', %s, %s)
                    """,
                    (
                        acc["account_id"],
                        float(interest),
                        f"Daily interest credit @ {float(rate)*100:.4f}% p.a.",
                    ),
                )
                cursor.execute(
                    """
                    UPDATE Accounts
                    SET Balance = Balance + %s,
                        LastInterestAccruedDate = %s
                    WHERE AccountID = %s
                    """,
                    (float(interest), today.isoformat(), acc["account_id"]),
                )
            credited += 1
        except Exception:
            failed += 1

    return RunNowResponse(credited=credited, failed=failed, date=today.isoformat())
