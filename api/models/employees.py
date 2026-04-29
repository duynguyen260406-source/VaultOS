from datetime import date
from pydantic import BaseModel
from typing import Optional, List


class EmployeeDetail(BaseModel):
    employee_id: int
    branch_id: int
    manager_id: Optional[int] = None
    first_name: str
    last_name: str
    position: Optional[str] = None
    salary: Optional[float] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    hire_date: Optional[str] = None


class CreateEmployeeRequest(BaseModel):
    branch_id: int
    manager_id: Optional[int] = None
    first_name: str
    last_name: str
    position: str
    salary: float
    hire_date: date
    email: Optional[str] = None
    phone: Optional[str] = None


class UpdateEmployeeRequest(BaseModel):
    position: Optional[str] = None
    salary: Optional[float] = None
    hire_date: Optional[date] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    branch_id: Optional[int] = None
    manager_id: Optional[int] = None


class EmployeeListResponse(BaseModel):
    employees: List[EmployeeDetail]
    total: int
