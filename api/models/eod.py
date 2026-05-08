from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, field_validator


class OpenSessionRequest(BaseModel):
    opening_balance: Decimal = Field(default=Decimal("0"), ge=0, max_digits=18, decimal_places=2)


class CloseSessionRequest(BaseModel):
    counted_amount: Decimal = Field(ge=0, max_digits=18, decimal_places=2)
    notes: str = ""

    @field_validator("counted_amount")
    @classmethod
    def amount_non_negative(cls, v):
        if v < 0:
            raise ValueError("counted_amount must be non-negative")
        return v


class ReconcileRequest(BaseModel):
    notes: str = ""


class SessionRecord(BaseModel):
    session_id: int
    user_id: int
    username: str
    branch_id: int
    branch_name: str
    opened_at: str
    opening_balance: float
    closed_at: Optional[str] = None
    closing_balance_counted: Optional[float] = None
    closing_balance_expected: Optional[float] = None
    variance: Optional[float] = None
    status: str
    notes: Optional[str] = None
    running_cash: Optional[float] = None


class SessionListResponse(BaseModel):
    sessions: list[SessionRecord]
    total: int
