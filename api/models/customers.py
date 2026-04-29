from pydantic import BaseModel
from typing import Optional


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


class CustomerListResponse(BaseModel):
    customers: list[CustomerSummary]
    total: int
