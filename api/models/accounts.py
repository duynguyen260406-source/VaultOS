from pydantic import BaseModel
from typing import Optional


class OpenAccountRequest(BaseModel):
    customer_id: int
    account_type_id: int
    branch_id: int


class OpenAccountResponse(BaseModel):
    account_id: int
    account_number: str


class AccountDetail(BaseModel):
    account_id: int
    customer_id: int
    account_number: str
    customer_name: str
    account_type: str
    branch_name: str
    balance: float
    status: str
    created_at: str


class AccountListResponse(BaseModel):
    accounts: list[AccountDetail]
    total: int


class ChangeStatusRequest(BaseModel):
    new_status: str
    reason: Optional[str] = None
    hold_expires_at: Optional[str] = None


class StatusHistoryRecord(BaseModel):
    history_id: int
    account_id: int
    old_status: Optional[str] = None
    new_status: str
    reason: Optional[str] = None
    changed_at: str
    changed_by_username: Optional[str] = None
