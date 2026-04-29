from pydantic import BaseModel
from typing import Optional, List


class AccountTypeDetail(BaseModel):
    account_type_id: int
    type_name: str
    description: Optional[str] = None
    interest_rate: Optional[float] = None


class CreateAccountTypeRequest(BaseModel):
    type_name: str
    description: Optional[str] = None
    interest_rate: Optional[float] = None


class AccountTypeListResponse(BaseModel):
    account_types: List[AccountTypeDetail]
    total: int
