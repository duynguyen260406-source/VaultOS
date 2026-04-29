from pydantic import BaseModel


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
