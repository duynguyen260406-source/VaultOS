from pydantic import BaseModel
from typing import Optional


class CreateCaseRequest(BaseModel):
    summary: str
    priority: str = "medium"


class UpdateCaseRequest(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    summary: Optional[str] = None
    closure_reason: Optional[str] = None


class AddLinkRequest(BaseModel):
    link_type: str
    target_id: int


class AddNoteRequest(BaseModel):
    body: str


class CaseLinkRecord(BaseModel):
    link_id: int
    case_id: int
    link_type: str
    target_id: int
    added_at: str
    added_by_username: Optional[str] = None


class CaseNoteRecord(BaseModel):
    note_id: int
    case_id: int
    body: str
    created_at: str
    author_username: Optional[str] = None


class CaseRecord(BaseModel):
    case_id: int
    summary: str
    status: str
    priority: str
    opened_at: str
    closed_at: Optional[str] = None
    closure_reason: Optional[str] = None
    opened_by_username: Optional[str] = None
    closed_by_username: Optional[str] = None
    links: list[CaseLinkRecord] = []
    notes: list[CaseNoteRecord] = []


class CaseListRecord(BaseModel):
    case_id: int
    summary: str
    status: str
    priority: str
    opened_at: str
    closed_at: Optional[str] = None
    opened_by_username: Optional[str] = None
    link_count: int = 0
    note_count: int = 0
