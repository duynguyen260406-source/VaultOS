import os
import sys
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, timedelta
from math import pow as mpow

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_manager, require_teller_or_manager
from models.loans import (
    DecideLoanRequest,
    LoanApplicationRequest,
    LoanListResponse,
    LoanRecord,
    RepaymentRecord,
    RepaymentRequest,
)
from security_context import get_current_actor, is_branch_scoped_role

router = APIRouter()

_LOAN_SQL = """
    SELECT
        l.LoanID              AS loan_id,
        l.CustomerID          AS customer_id,
        CONCAT(c.FirstName,' ',c.LastName) AS customer_name,
        l.BranchID            AS branch_id,
        b.BranchName          AS branch_name,
        l.LoanAmount          AS loan_amount,
        l.InterestRate        AS interest_rate,
        l.TermMonths          AS term_months,
        l.MonthlyPaymentAmount AS monthly_payment_amount,
        l.PrincipalOutstanding AS principal_outstanding,
        l.InterestAccrued     AS interest_accrued,
        l.StartDate           AS start_date,
        l.EndDate             AS end_date,
        l.DisbursementDate    AS disbursement_date,
        l.NextPaymentDate     AS next_payment_date,
        l.Purpose             AS purpose,
        COALESCE(l.ApprovalStatus, l.Status) AS approval_status,
        l.Status              AS status,
        appr.Username         AS approved_by_username,
        l.RejectionReason     AS rejection_reason,
        l.LinkedAccountID     AS linked_account_id,
        creator.Username      AS created_by_username
    FROM Loans l
    JOIN Customers c  ON l.CustomerID = c.CustomerID
    JOIN Branches b   ON l.BranchID   = b.BranchID
    LEFT JOIN AppUsers appr    ON l.ApprovedByUserID = appr.UserID
    LEFT JOIN AppUsers creator ON l.CreatedByUserID  = creator.UserID
"""


def _cast(v):
    if v is None:
        return None
    if hasattr(v, "quantize"):
        return float(v)
    if hasattr(v, "isoformat"):
        return str(v)
    return v


def _row_to_record(row: dict) -> LoanRecord:
    d = {k: _cast(v) for k, v in row.items()}
    return LoanRecord(**d)


def _monthly_payment(principal: Decimal, annual_rate: Decimal, term_months: int) -> Decimal:
    r = annual_rate / Decimal("100") / Decimal("12")
    if r == 0:
        return (principal / term_months).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    factor = (1 + float(r)) ** term_months
    mp = float(principal) * float(r) * factor / (factor - 1)
    return Decimal(str(mp)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@router.get("", response_model=LoanListResponse)
def list_loans(
    approval_status: str = "",
    limit: int = Query(100, ge=1, le=500),
    offset: int = 0,
    user=Depends(require_any_role),
):
    actor = get_current_actor()
    conditions = []
    params: list = []

    if user["role"] == "teller" and user.get("branch_id"):
        conditions.append("l.BranchID = %s")
        params.append(user["branch_id"])
    elif user.get("branch_id") and is_branch_scoped_role(user["role"]):
        conditions.append("l.BranchID = %s")
        params.append(user["branch_id"])

    if approval_status:
        conditions.append("COALESCE(l.ApprovalStatus, l.Status) = %s")
        params.append(approval_status)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"{_LOAN_SQL} {where} ORDER BY l.LoanID DESC LIMIT %s OFFSET %s",
                [*params, limit, offset],
            )
            rows = cursor.fetchall()
            cursor.execute(f"SELECT COUNT(*) AS n FROM Loans l {where}", params)
            total = cursor.fetchone()["n"]
    except MySQLError as e:
        raise db_error_to_http(e)

    return LoanListResponse(loans=[_row_to_record(r) for r in rows], total=total)


@router.post("", response_model=LoanRecord, status_code=201)
def apply_loan(req: LoanApplicationRequest, user=Depends(require_teller_or_manager)):
    monthly = _monthly_payment(req.loan_amount, req.interest_rate, req.term_months)
    try:
        end_date_obj = date.fromisoformat(req.start_date) + timedelta(days=req.term_months * 30)
    except ValueError:
        raise HTTPException(status_code=422, detail="start_date must be YYYY-MM-DD")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO Loans
                    (CustomerID, BranchID, LoanAmount, InterestRate, StartDate, EndDate,
                     Status, Purpose, TermMonths, MonthlyPaymentAmount,
                     PrincipalOutstanding, LinkedAccountID, CreatedByUserID, ApprovalStatus)
                VALUES (%s,%s,%s,%s,%s,%s,'Active',%s,%s,%s,%s,%s,%s,'Pending')
                """,
                (
                    req.customer_id, req.branch_id,
                    float(req.loan_amount), float(req.interest_rate),
                    req.start_date, end_date_obj.isoformat(),
                    req.purpose, req.term_months, float(monthly),
                    float(req.loan_amount), req.linked_account_id, user["user_id"],
                ),
            )
            loan_id = cursor.lastrowid
            cursor.execute(_LOAN_SQL + " WHERE l.LoanID = %s", (loan_id,))
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)

    return _row_to_record(row)


@router.get("/{loan_id}", response_model=LoanRecord)
def get_loan(loan_id: int, user=Depends(require_any_role)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(_LOAN_SQL + " WHERE l.LoanID = %s", (loan_id,))
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not row:
        raise HTTPException(status_code=404, detail="Loan not found")
    return _row_to_record(row)


@router.patch("/{loan_id}/decide", response_model=LoanRecord)
def decide_loan(loan_id: int, req: DecideLoanRequest, user=Depends(require_manager)):
    if req.decision == "Rejected" and not (req.rejection_reason or "").strip():
        raise HTTPException(status_code=422, detail="rejection_reason required when rejecting")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT ApprovalStatus, CreatedByUserID FROM Loans WHERE LoanID = %s", (loan_id,)
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Loan not found")
            status = row["ApprovalStatus"] or "Pending"
            if status != "Pending":
                raise HTTPException(status_code=409, detail=f"Loan is already {status}")

            cursor.execute(
                "UPDATE Loans SET ApprovalStatus=%s, ApprovedByUserID=%s, RejectionReason=%s WHERE LoanID=%s",
                (req.decision, user["user_id"], req.rejection_reason, loan_id),
            )
            cursor.execute(_LOAN_SQL + " WHERE l.LoanID = %s", (loan_id,))
            updated = cursor.fetchone()
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    return _row_to_record(updated)


@router.post("/{loan_id}/disburse", response_model=LoanRecord)
def disburse_loan(loan_id: int, user=Depends(require_manager)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT ApprovalStatus, LoanAmount, LinkedAccountID FROM Loans WHERE LoanID = %s",
                (loan_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Loan not found")
            if (row["ApprovalStatus"] or "") != "Approved":
                raise HTTPException(status_code=409, detail="Loan must be Approved before disbursement")

            linked_id = row["LinkedAccountID"]
            amount = float(row["LoanAmount"])

            if linked_id:
                cursor.execute(
                    "SELECT AccountID FROM Accounts WHERE AccountID = %s AND Status = 'Active'",
                    (linked_id,),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=400, detail="Linked account not found or inactive")

                cursor.execute(
                    """
                    INSERT INTO Transactions (AccountID, TransactionType, Amount, Description)
                    VALUES (%s, 'Deposit', %s, %s)
                    """,
                    (linked_id, amount, f"Loan disbursement — Loan #{loan_id}"),
                )
                cursor.execute(
                    "UPDATE Accounts SET Balance = Balance + %s WHERE AccountID = %s",
                    (amount, linked_id),
                )

            cursor.execute(
                """
                UPDATE Loans
                SET ApprovalStatus = 'Disbursed',
                    DisbursementDate = CURDATE(),
                    NextPaymentDate = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
                WHERE LoanID = %s
                """,
                (loan_id,),
            )
            cursor.execute(_LOAN_SQL + " WHERE l.LoanID = %s", (loan_id,))
            updated = cursor.fetchone()
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    return _row_to_record(updated)


@router.get("/{loan_id}/repayments", response_model=list[RepaymentRecord])
def list_repayments(loan_id: int, user=Depends(require_any_role)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    r.RepaymentID      AS repayment_id,
                    r.LoanID           AS loan_id,
                    r.TransactionID    AS transaction_id,
                    r.PaidAt           AS paid_at,
                    r.Amount           AS amount,
                    r.PrincipalPortion AS principal_portion,
                    r.InterestPortion  AS interest_portion,
                    r.PrincipalAfter   AS principal_after,
                    u.Username         AS created_by_username
                FROM LoanRepayments r
                LEFT JOIN AppUsers u ON r.CreatedByUserID = u.UserID
                WHERE r.LoanID = %s
                ORDER BY r.PaidAt ASC
                """,
                (loan_id,),
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    return [
        RepaymentRecord(
            repayment_id=r["repayment_id"],
            loan_id=r["loan_id"],
            transaction_id=r["transaction_id"],
            paid_at=str(r["paid_at"]),
            amount=float(r["amount"] or 0),
            principal_portion=float(r["principal_portion"] or 0),
            interest_portion=float(r["interest_portion"] or 0),
            principal_after=float(r["principal_after"] or 0),
            created_by_username=r["created_by_username"],
        )
        for r in rows
    ]


@router.post("/{loan_id}/repayments", response_model=RepaymentRecord, status_code=201)
def post_repayment(loan_id: int, req: RepaymentRequest, user=Depends(require_teller_or_manager)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT ApprovalStatus, PrincipalOutstanding, InterestRate, LinkedAccountID FROM Loans WHERE LoanID = %s",
                (loan_id,),
            )
            loan = cursor.fetchone()
            if not loan:
                raise HTTPException(status_code=404, detail="Loan not found")
            if (loan["ApprovalStatus"] or "") != "Disbursed":
                raise HTTPException(status_code=409, detail="Loan must be Disbursed to accept repayments")

            principal_outstanding = Decimal(str(loan["PrincipalOutstanding"] or 0))
            annual_rate = Decimal(str(loan["InterestRate"] or 0))
            monthly_rate = annual_rate / Decimal("100") / Decimal("12")
            interest_due = (principal_outstanding * monthly_rate).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            amount = req.amount
            interest_portion = min(amount, interest_due)
            principal_portion = (amount - interest_portion).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            principal_after = max(Decimal("0"), principal_outstanding - principal_portion)

            txn_id = None
            linked_id = loan["LinkedAccountID"]
            if linked_id:
                cursor.execute(
                    """
                    INSERT INTO Transactions (AccountID, TransactionType, Amount, Description)
                    VALUES (%s, 'Withdrawal', %s, %s)
                    """,
                    (linked_id, float(amount), f"Loan repayment — Loan #{loan_id}"),
                )
                txn_id = cursor.lastrowid
                cursor.execute(
                    "UPDATE Accounts SET Balance = Balance - %s WHERE AccountID = %s",
                    (float(amount), linked_id),
                )

            cursor.execute(
                """
                INSERT INTO LoanRepayments
                    (LoanID, TransactionID, Amount, PrincipalPortion, InterestPortion, PrincipalAfter, CreatedByUserID)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    loan_id, txn_id, float(amount),
                    float(principal_portion), float(interest_portion),
                    float(principal_after), user["user_id"],
                ),
            )
            rep_id = cursor.lastrowid

            new_status = "Disbursed" if principal_after > 0 else "Paid"
            cursor.execute(
                """
                UPDATE Loans
                SET PrincipalOutstanding = %s,
                    ApprovalStatus = %s,
                    Status = IF(%s = 'Paid', 'Paid', Status),
                    NextPaymentDate = DATE_ADD(CURDATE(), INTERVAL 1 MONTH)
                WHERE LoanID = %s
                """,
                (float(principal_after), new_status, new_status, loan_id),
            )

            cursor.execute(
                """
                SELECT r.*, u.Username AS created_by_username
                FROM LoanRepayments r
                LEFT JOIN AppUsers u ON r.CreatedByUserID = u.UserID
                WHERE r.RepaymentID = %s
                """,
                (rep_id,),
            )
            rep_row = cursor.fetchone()

    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    return RepaymentRecord(
        repayment_id=rep_row["RepaymentID"],
        loan_id=rep_row["LoanID"],
        transaction_id=rep_row["TransactionID"],
        paid_at=str(rep_row["PaidAt"]),
        amount=float(rep_row["Amount"] or 0),
        principal_portion=float(rep_row["PrincipalPortion"] or 0),
        interest_portion=float(rep_row["InterestPortion"] or 0),
        principal_after=float(rep_row["PrincipalAfter"] or 0),
        created_by_username=rep_row["created_by_username"],
    )
