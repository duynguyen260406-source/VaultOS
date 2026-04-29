from pydantic import BaseModel
from typing import Optional


class DailyReportRow(BaseModel):
    transaction_type: str
    transaction_count: int
    total_amount: float


class DailyReportResponse(BaseModel):
    report_date: str
    rows: list[DailyReportRow]
    grand_count: int
    grand_total: float


class TransactionDetailRow(BaseModel):
    transaction_id: int
    transaction_type: str
    amount: float
    transaction_date: str
    account_number: str
    customer_name: str
    description: Optional[str] = None


class CustomerBalanceRow(BaseModel):
    customer_id: int
    customer_name: str
    total_balance: float


class BranchActivityRow(BaseModel):
    branch_id: int
    branch_name: str
    city: str
    account_count: int
    employee_count: int
    total_deposits: float


class BranchTransactionStatsRow(BaseModel):
    branch_id: int
    branch_name: str
    tx_count: int
    deposit_volume: float
    withdrawal_volume: float
    transfer_volume: float
    deposit_count: int
    withdrawal_count: int
    suspicious_count: int
    suspicious_amount: float
    unreviewed_count: int
    loan_count: int = 0
