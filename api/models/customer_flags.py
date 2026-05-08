from pydantic import BaseModel
from typing import Optional


class AddFlagRequest(BaseModel):
    flag_type: str
    reason: Optional[str] = None
    expires_at: Optional[str] = None


class FlagRecord(BaseModel):
    flag_id: int
    customer_id: int
    flag_type: str
    reason: Optional[str] = None
    added_at: str
    expires_at: Optional[str] = None
    removed_at: Optional[str] = None
    is_active: bool
    added_by_username: Optional[str] = None
    removed_by_username: Optional[str] = None
