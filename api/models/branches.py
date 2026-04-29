from datetime import date
from pydantic import BaseModel
from typing import Optional, List


class BranchDetail(BaseModel):
    branch_id: int
    branch_name: str
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    established_date: Optional[str] = None


class CreateBranchRequest(BaseModel):
    branch_name: str
    address: str
    city: str
    phone: str
    established_date: date


class UpdateBranchRequest(BaseModel):
    branch_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    established_date: Optional[date] = None


class BranchListResponse(BaseModel):
    branches: List[BranchDetail]
    total: int
