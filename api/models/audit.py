from typing import Optional
from pydantic import BaseModel


class SuspiciousActivityItem(BaseModel):
    alert_id: int
    account_id: int
    account_number: str
    amount: float
    transaction_date: str
    reason: str
    reviewed: bool


class SuspiciousActivityResponse(BaseModel):
    items: list[SuspiciousActivityItem]
    total: int


class AuditLogItem(BaseModel):
    log_id: int
    table_name: str
    action_type: str
    record_id: int
    performed_by: Optional[str]
    performed_at: str


class AuditLogResponse(BaseModel):
    items: list[AuditLogItem]
    total: int


class AuditLogSummaryResponse(BaseModel):
    total: int
    action_counts: dict[str, int]
    table_counts: dict[str, int]
    actor_counts: dict[str, int]
    daily_counts: dict[str, int]


class ReviewStatusUpdate(BaseModel):
    reviewed: bool = True
