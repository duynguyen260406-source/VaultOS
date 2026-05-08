from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel


class DecideRequest(BaseModel):
    decision: str  # 'approved' | 'rejected'
    review_notes: Optional[str] = None


class ApprovalRecord(BaseModel):
    approval_id: int
    request_type: str
    payload: Any
    requested_by_user_id: int
    requested_by_username: str
    requested_at: datetime
    branch_id: Optional[int]
    branch_name: Optional[str]
    status: str
    reviewed_by_user_id: Optional[int]
    reviewed_by_username: Optional[str]
    reviewed_at: Optional[datetime]
    review_notes: Optional[str]
    executed_at: Optional[datetime]
    execution_error: Optional[str]


class ApprovalStats(BaseModel):
    pending: int
    approved_today: int
    rejected_today: int
    executed_today: int


class ApprovalListResponse(BaseModel):
    approvals: list[ApprovalRecord]
    stats: ApprovalStats
    total: int


class DecideResponse(BaseModel):
    success: bool
    message: str
    approval_id: int
    status: str
    execution_error: Optional[str] = None
