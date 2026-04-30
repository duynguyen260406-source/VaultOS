from pydantic import BaseModel
from typing import Any, Optional


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
    tx_count: int = 0
    deposit_volume: float = 0.0
    withdrawal_volume: float = 0.0
    transfer_volume: float = 0.0
    deposit_count: int = 0
    withdrawal_count: int = 0
    suspicious_count: int = 0
    suspicious_amount: float = 0.0
    unreviewed_count: int = 0
    loan_count: int = 0


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


class DashboardSummaryResponse(BaseModel):
    stats: dict[str, Any]
    recent_tx: dict[str, Any]
    right_panel: dict[str, Any]
