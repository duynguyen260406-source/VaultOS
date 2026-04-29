import os
import sys
from datetime import date, datetime
from typing import Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

import reports as reports_module
from dependencies import db_error_to_http, require_manager_or_auditor
from models.reports import (
    BranchActivityRow,
    BranchTransactionStatsRow,
    CustomerBalanceRow,
    DailyReportResponse,
    DailyReportRow,
    TransactionDetailRow,
)

router = APIRouter()


@router.get("/daily-transactions", response_model=DailyReportResponse)
def daily_transactions(
    report_date: Optional[str] = Query(None),
    _=Depends(require_manager_or_auditor),
):
    parsed_date = None
    if report_date:
        try:
            parsed_date = datetime.strptime(report_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    try:
        result = reports_module.daily_transaction_report(parsed_date)
    except MySQLError as e:
        raise db_error_to_http(e)
    if result is None:
        return DailyReportResponse(
            report_date=str(parsed_date or date.today()),
            rows=[],
            grand_count=0,
            grand_total=0.0,
        )
    rows = [
        DailyReportRow(
            transaction_type=row["transaction_type"],
            transaction_count=int(row["transaction_count"]),
            total_amount=float(row["total_amount"]),
        )
        for row in result.get("rows", [])
    ]
    return DailyReportResponse(
        report_date=result["report_date"],
        rows=rows,
        grand_count=int(result["grand_count"]),
        grand_total=float(result["grand_total"]),
    )


@router.get("/daily-transactions-detail", response_model=list[TransactionDetailRow])
def daily_transactions_detail(
    report_date: Optional[str] = Query(None),
    transaction_type: Optional[str] = Query(None),
    _=Depends(require_manager_or_auditor),
):
    parsed_date = None
    if report_date:
        try:
            parsed_date = datetime.strptime(report_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    try:
        rows = reports_module.daily_transaction_detail(parsed_date, transaction_type)
    except MySQLError as e:
        raise db_error_to_http(e)
    except Exception:
        raise HTTPException(status_code=500, detail="Report generation failed")
    return [TransactionDetailRow(**row) for row in rows]


@router.get("/customer-balances", response_model=list[CustomerBalanceRow])
def customer_balances(_=Depends(require_manager_or_auditor)):
    try:
        rows = reports_module.customer_balance_summary()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not rows:
        return []
    return [
        CustomerBalanceRow(
            customer_id=row["customer_id"],
            customer_name=row["customer_name"],
            total_balance=float(row["total_balance"]),
        )
        for row in rows
    ]


@router.get("/branch-transactions", response_model=list[BranchTransactionStatsRow])
def branch_transactions(_=Depends(require_manager_or_auditor)):
    try:
        rows = reports_module.branch_transaction_stats()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not rows:
        return []
    return [BranchTransactionStatsRow(**row) for row in rows]


@router.get("/branch-activity", response_model=list[BranchActivityRow])
def branch_activity(_=Depends(require_manager_or_auditor)):
    try:
        rows = reports_module.branch_activity_report()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not rows:
        return []
    return [
        BranchActivityRow(
            branch_id=int(row["branch_id"]),
            branch_name=row["branch_name"],
            city=row["city"],
            account_count=int(row["account_count"]),
            employee_count=int(row["employee_count"]),
            total_deposits=float(row["total_deposits"]),
        )
        for row in rows
    ]
