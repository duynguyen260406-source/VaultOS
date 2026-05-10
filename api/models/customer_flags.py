import re
from pydantic import BaseModel, field_validator
from typing import Optional


def _strip_tags(value: str) -> str:
    return re.sub(r'<[^>]+>', '', value).strip()


class AddFlagRequest(BaseModel):
    flag_type: str
    reason: Optional[str] = None
    expires_at: Optional[str] = None

    @field_validator('reason', 'flag_type', mode='before')
    @classmethod
    def sanitize_strings(cls, v):
        if isinstance(v, str):
            return _strip_tags(v)
        return v


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
