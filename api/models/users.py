from typing import List, Literal, Optional

from pydantic import BaseModel, Field


RoleLiteral = Literal["manager", "teller", "auditor"]
StatusLiteral = Literal["pending", "active", "locked", "disabled"]


class AppUserDetail(BaseModel):
    user_id: int
    username: str
    role: RoleLiteral
    status: StatusLiteral
    employee_id: Optional[int] = None
    customer_id: Optional[int] = None
    employee_name: Optional[str] = None
    failed_login_count: int = 0
    last_login_at: Optional[str] = None
    password_changed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by_user_id: Optional[int] = None


class CreateAppUserRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    role: RoleLiteral
    status: StatusLiteral = "active"
    employee_id: Optional[int] = None
    customer_id: Optional[int] = None


class UpdateAppUserRequest(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=50)
    role: Optional[RoleLiteral] = None
    status: Optional[StatusLiteral] = None
    employee_id: Optional[int] = None
    customer_id: Optional[int] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserActionResponse(BaseModel):
    detail: str


class AppUserListResponse(BaseModel):
    users: List[AppUserDetail]
    total: int
