import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_manager_or_auditor
from models.cases import (
    AddLinkRequest,
    AddNoteRequest,
    CaseLinkRecord,
    CaseListRecord,
    CaseNoteRecord,
    CaseRecord,
    CreateCaseRequest,
    UpdateCaseRequest,
)

router = APIRouter()

VALID_STATUSES = {"open", "investigating", "escalated", "closed"}
VALID_PRIORITIES = {"low", "medium", "high", "critical"}
VALID_LINK_TYPES = {"suspicious_activity", "transaction", "customer", "account"}


def _to_list_record(r: dict) -> CaseListRecord:
    return CaseListRecord(
        case_id=r["case_id"],
        summary=r["summary"],
        status=r["status"],
        priority=r["priority"],
        opened_at=str(r["opened_at"]),
        closed_at=str(r["closed_at"]) if r["closed_at"] else None,
        opened_by_username=r["opened_by_username"],
        link_count=r.get("link_count", 0) or 0,
        note_count=r.get("note_count", 0) or 0,
    )


@router.get("", response_model=list[CaseListRecord])
def list_cases(
    status: str = "",
    priority: str = "",
    limit: int = Query(100, ge=1, le=500),
    offset: int = 0,
    user=Depends(require_manager_or_auditor),
):
    conditions = []
    params: list = []
    if status and status in VALID_STATUSES:
        conditions.append("c.Status = %s")
        params.append(status)
    if priority and priority in VALID_PRIORITIES:
        conditions.append("c.Priority = %s")
        params.append(priority)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT
                    c.CaseID          AS case_id,
                    c.Summary         AS summary,
                    c.Status          AS status,
                    c.Priority        AS priority,
                    c.OpenedAt        AS opened_at,
                    c.ClosedAt        AS closed_at,
                    u.Username        AS opened_by_username,
                    COUNT(DISTINCT l.LinkID) AS link_count,
                    COUNT(DISTINCT n.NoteID) AS note_count
                FROM AuditCases c
                LEFT JOIN AppUsers u   ON c.OpenedByUserID = u.UserID
                LEFT JOIN AuditCaseLinks l ON c.CaseID = l.CaseID
                LEFT JOIN AuditCaseNotes n ON c.CaseID = n.CaseID
                {where}
                GROUP BY c.CaseID
                ORDER BY c.OpenedAt DESC
                LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return [_to_list_record(r) for r in rows]


@router.post("", response_model=CaseRecord, status_code=201)
def create_case(req: CreateCaseRequest, user=Depends(require_manager_or_auditor)):
    if req.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=422, detail="Invalid priority")
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "INSERT INTO AuditCases (OpenedByUserID, Summary, Priority) VALUES (%s, %s, %s)",
                (user["user_id"], req.summary, req.priority),
            )
            case_id = cursor.lastrowid
    except MySQLError as e:
        raise db_error_to_http(e)
    return get_case_detail(case_id, user)


@router.get("/{case_id}", response_model=CaseRecord)
def get_case(case_id: int, user=Depends(require_manager_or_auditor)):
    return get_case_detail(case_id, user)


def get_case_detail(case_id: int, user: dict) -> CaseRecord:
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT c.*, u.Username AS opened_by_username, cu.Username AS closed_by_username
                FROM AuditCases c
                LEFT JOIN AppUsers u  ON c.OpenedByUserID = u.UserID
                LEFT JOIN AppUsers cu ON c.ClosedByUserID = cu.UserID
                WHERE c.CaseID = %s
                """,
                (case_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Case not found")

            cursor.execute(
                """
                SELECT l.*, u.Username AS added_by_username
                FROM AuditCaseLinks l
                LEFT JOIN AppUsers u ON l.AddedByUserID = u.UserID
                WHERE l.CaseID = %s ORDER BY l.AddedAt
                """,
                (case_id,),
            )
            links = cursor.fetchall()

            cursor.execute(
                """
                SELECT n.*, u.Username AS author_username
                FROM AuditCaseNotes n
                LEFT JOIN AppUsers u ON n.AuthorUserID = u.UserID
                WHERE n.CaseID = %s ORDER BY n.CreatedAt
                """,
                (case_id,),
            )
            notes = cursor.fetchall()
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    return CaseRecord(
        case_id=row["CaseID"],
        summary=row["Summary"],
        status=row["Status"],
        priority=row["Priority"],
        opened_at=str(row["OpenedAt"]),
        closed_at=str(row["ClosedAt"]) if row["ClosedAt"] else None,
        closure_reason=row["ClosureReason"],
        opened_by_username=row["opened_by_username"],
        closed_by_username=row["closed_by_username"],
        links=[
            CaseLinkRecord(
                link_id=l["LinkID"],
                case_id=l["CaseID"],
                link_type=l["LinkType"],
                target_id=l["TargetID"],
                added_at=str(l["AddedAt"]),
                added_by_username=l["added_by_username"],
            )
            for l in links
        ],
        notes=[
            CaseNoteRecord(
                note_id=n["NoteID"],
                case_id=n["CaseID"],
                body=n["Body"],
                created_at=str(n["CreatedAt"]),
                author_username=n["author_username"],
            )
            for n in notes
        ],
    )


@router.patch("/{case_id}", response_model=CaseRecord)
def update_case(case_id: int, req: UpdateCaseRequest, user=Depends(require_manager_or_auditor)):
    updates = []
    params = []
    if req.status:
        if req.status not in VALID_STATUSES:
            raise HTTPException(status_code=422, detail="Invalid status")
        updates.append("Status = %s")
        params.append(req.status)
        if req.status == "closed":
            updates += ["ClosedAt = NOW()", "ClosedByUserID = %s", "ClosureReason = %s"]
            params += [user["user_id"], req.closure_reason]
    if req.priority:
        if req.priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=422, detail="Invalid priority")
        updates.append("Priority = %s")
        params.append(req.priority)
    if req.summary:
        updates.append("Summary = %s")
        params.append(req.summary)

    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")

    params.append(case_id)
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"UPDATE AuditCases SET {', '.join(updates)} WHERE CaseID = %s",
                params,
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Case not found")
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return get_case_detail(case_id, user)


@router.post("/{case_id}/links", response_model=CaseLinkRecord, status_code=201)
def add_link(case_id: int, req: AddLinkRequest, user=Depends(require_manager_or_auditor)):
    if req.link_type not in VALID_LINK_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid link_type: {req.link_type}")
    try:
        with get_db() as (conn, cursor):
            cursor.execute("SELECT CaseID FROM AuditCases WHERE CaseID = %s", (case_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Case not found")
            cursor.execute(
                "INSERT INTO AuditCaseLinks (CaseID, LinkType, TargetID, AddedByUserID) VALUES (%s,%s,%s,%s)",
                (case_id, req.link_type, req.target_id, user["user_id"]),
            )
            link_id = cursor.lastrowid
            cursor.execute(
                "SELECT l.*, u.Username AS added_by_username FROM AuditCaseLinks l LEFT JOIN AppUsers u ON l.AddedByUserID=u.UserID WHERE l.LinkID=%s",
                (link_id,),
            )
            row = cursor.fetchone()
    except HTTPException:
        raise
    except MySQLError as e:
        if "Duplicate entry" in str(e):
            raise HTTPException(status_code=409, detail="This link already exists")
        raise db_error_to_http(e)
    return CaseLinkRecord(
        link_id=row["LinkID"],
        case_id=row["CaseID"],
        link_type=row["LinkType"],
        target_id=row["TargetID"],
        added_at=str(row["AddedAt"]),
        added_by_username=row["added_by_username"],
    )


@router.delete("/{case_id}/links/{link_id}")
def remove_link(case_id: int, link_id: int, user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute("DELETE FROM AuditCaseLinks WHERE LinkID=%s AND CaseID=%s", (link_id, case_id))
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Link not found")
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return {"success": True}


@router.post("/{case_id}/notes", response_model=CaseNoteRecord, status_code=201)
def add_note(case_id: int, req: AddNoteRequest, user=Depends(require_manager_or_auditor)):
    if not req.body.strip():
        raise HTTPException(status_code=422, detail="Note body cannot be empty")
    try:
        with get_db() as (conn, cursor):
            cursor.execute("SELECT CaseID FROM AuditCases WHERE CaseID=%s", (case_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Case not found")
            cursor.execute(
                "INSERT INTO AuditCaseNotes (CaseID, AuthorUserID, Body) VALUES (%s,%s,%s)",
                (case_id, user["user_id"], req.body),
            )
            note_id = cursor.lastrowid
            cursor.execute(
                "SELECT n.*, u.Username AS author_username FROM AuditCaseNotes n LEFT JOIN AppUsers u ON n.AuthorUserID=u.UserID WHERE n.NoteID=%s",
                (note_id,),
            )
            row = cursor.fetchone()
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return CaseNoteRecord(
        note_id=row["NoteID"],
        case_id=row["CaseID"],
        body=row["Body"],
        created_at=str(row["CreatedAt"]),
        author_username=row["author_username"],
    )
