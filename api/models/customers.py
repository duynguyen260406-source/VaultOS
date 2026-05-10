import re
from pydantic import BaseModel, field_validator
from typing import Optional


def _strip_tags(value: str) -> str:
    return re.sub(r'<[^>]+>', '', value).strip()


class CustomerSummary(BaseModel):
    customer_id: int
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: str


class CustomerDetail(CustomerSummary):
    date_of_birth: str
    gender: str
    address: str
    city: str
    created_at: str


class CreateCustomerRequest(BaseModel):
    first_name: str
    last_name: str
    phone: str
    email: Optional[str] = None
    date_of_birth: str
    gender: str
    address: str
    city: str

    @field_validator('first_name', 'last_name', 'phone', 'address', 'city', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            return _strip_tags(v)
        return v


class CustomerListResponse(BaseModel):
    customers: list[CustomerSummary]
    total: int
