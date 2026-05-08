from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class LoanApplicationRequest(BaseModel):
    customer_id: int
    branch_id: int
    linked_account_id: int
    loan_amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    interest_rate: Decimal = Field(gt=0, lt=100, max_digits=5, decimal_places=2)
    term_months: int = Field(gt=0, le=360)
    purpose: Optional[str] = None
    start_date: str


class DecideLoanRequest(BaseModel):
    decision: str
    rejection_reason: Optional[str] = None

    @field_validator("decision")
    @classmethod
    def valid_decision(cls, v):
        if v not in ("Approved", "Rejected"):
            raise ValueError("decision must be 'Approved' or 'Rejected'")
        return v


class RepaymentRequest(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)


class RepaymentRecord(BaseModel):
    repayment_id: int
    loan_id: int
    transaction_id: Optional[int] = None
    paid_at: str
    amount: float
    principal_portion: float
    interest_portion: float
    principal_after: float
    created_by_username: Optional[str] = None


class LoanRecord(BaseModel):
    loan_id: int
    customer_id: int
    customer_name: str
    branch_id: int
    branch_name: str
    loan_amount: float
    interest_rate: float
    term_months: Optional[int] = None
    monthly_payment_amount: Optional[float] = None
    principal_outstanding: Optional[float] = None
    interest_accrued: float
    start_date: str
    end_date: str
    disbursement_date: Optional[str] = None
    next_payment_date: Optional[str] = None
    purpose: Optional[str] = None
    approval_status: str
    status: str
    approved_by_username: Optional[str] = None
    rejection_reason: Optional[str] = None
    linked_account_id: Optional[int] = None
    created_by_username: Optional[str] = None


class LoanListResponse(BaseModel):
    loans: list[LoanRecord]
    total: int
