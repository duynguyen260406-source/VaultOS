import hashlib
import os
import sys
import unicodedata

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError
from pydantic import BaseModel
from typing import Optional

from db_connection import get_db
from dependencies import db_error_to_http, require_manager_or_auditor

router = APIRouter()


def normalize_name(name: str) -> str:
    """Lower-case, remove diacritics, strip extra spaces."""
    s = name.strip().lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.split())


def hash_identity(id_number: str) -> str:
    return hashlib.sha256(id_number.strip().upper().encode()).hexdigest()


class SanctionsEntryRequest(BaseModel):
    list_source: str = "LOCAL"
    entry_type: str = "Individual"
    full_name: str
    aliases: list[str] = []
    date_of_birth: Optional[str] = None
    country: Optional[str] = None
    identity_number: Optional[str] = None
    source_notes: Optional[str] = None


class ReviewRequest(BaseModel):
    status: str


def _screen_customer(cursor, customer_id: int) -> list[dict]:
    cursor.execute(
        """
        SELECT c.FirstName, c.LastName, c.DateOfBirth, c.NationalID
        FROM Customers c WHERE c.CustomerID = %s
        """,
        (customer_id,),
    )
    cust = cursor.fetchone()
    if not cust:
        return []

    full_name = f"{cust['FirstName']} {cust['LastName']}"
    norm = normalize_name(full_name)
    dob = str(cust["DateOfBirth"]) if cust["DateOfBirth"] else None

    results = []

    cursor.execute(
        "SELECT EntryID, FullName, NormalizedName, DateOfBirth, ListSource, IdentityNumberHash FROM SanctionsList WHERE Active=1"
    )
    entries = cursor.fetchall()
    for entry in entries:
        score = 0
        reason_parts = []
        if entry["NormalizedName"] == norm:
            score += 60
            reason_parts.append("name_exact")
        elif norm in entry["NormalizedName"] or entry["NormalizedName"] in norm:
            score += 30
            reason_parts.append("name_partial")

        if dob and entry["DateOfBirth"] and str(entry["DateOfBirth"]) == dob:
            score += 30
            reason_parts.append("dob_match")

        if cust.get("NationalID") and entry["IdentityNumberHash"]:
            if hash_identity(str(cust["NationalID"])) == entry["IdentityNumberHash"]:
                score = 100
                reason_parts.append("id_hash_match")

        if score >= 60:
            results.append({
                "entry_id": entry["EntryID"],
                "score": score,
                "reason": ",".join(reason_parts),
                "list_source": entry["ListSource"],
            })

    return results


@router.get("/entries")
def list_entries(
    list_source: str = "",
    active_only: bool = True,
    limit: int = Query(100, ge=1, le=500),
    offset: int = 0,
    user=Depends(require_manager_or_auditor),
):
    conditions = []
    params = []
    if active_only:
        conditions.append("Active = 1")
    if list_source:
        conditions.append("ListSource = %s")
        params.append(list_source)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT EntryID AS entry_id, ListSource AS list_source, EntryType AS entry_type,
                       FullName AS full_name, NormalizedName AS normalized_name,
                       DateOfBirth AS date_of_birth, Country AS country,
                       SourceNotes AS source_notes, Active AS active, AddedAt AS added_at
                FROM SanctionsList {where} ORDER BY AddedAt DESC LIMIT %s OFFSET %s
                """,
                [*params, limit, offset],
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return [{k: (str(v) if hasattr(v, "isoformat") else v) for k, v in r.items()} for r in rows]


@router.post("/entries", status_code=201)
def add_entry(req: SanctionsEntryRequest, user=Depends(require_manager_or_auditor)):
    import json
    norm = normalize_name(req.full_name)
    id_hash = hash_identity(req.identity_number) if req.identity_number else None
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO SanctionsList
                    (ListSource, EntryType, FullName, NormalizedName, Aliases, DateOfBirth,
                     Country, IdentityNumberHash, SourceNotes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    req.list_source, req.entry_type, req.full_name, norm,
                    json.dumps(req.aliases) if req.aliases else None,
                    req.date_of_birth, req.country, id_hash, req.source_notes,
                ),
            )
            entry_id = cursor.lastrowid
    except MySQLError as e:
        raise db_error_to_http(e)
    return {"entry_id": entry_id, "normalized_name": norm}


@router.delete("/entries/{entry_id}")
def deactivate_entry(entry_id: int, user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute("UPDATE SanctionsList SET Active=0 WHERE EntryID=%s", (entry_id,))
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Entry not found")
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return {"success": True}


@router.post("/screen/{customer_id}")
def screen_customer(customer_id: int, user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            matches = _screen_customer(cursor, customer_id)
            results = []
            for m in matches:
                cursor.execute(
                    """
                    INSERT INTO SanctionsScreeningResults
                        (ScreenedEntityType, EntityID, ListSource, MatchedEntryID, MatchScore, MatchReason)
                    VALUES ('customer', %s, %s, %s, %s, %s)
                    """,
                    (customer_id, m["list_source"], m["entry_id"], m["score"], m["reason"]),
                )
                results.append({**m, "result_id": cursor.lastrowid})
    except MySQLError as e:
        raise db_error_to_http(e)
    return {"customer_id": customer_id, "matches": len(results), "results": results}


@router.get("/results")
def list_results(
    status: str = "",
    limit: int = Query(100, ge=1, le=500),
    user=Depends(require_manager_or_auditor),
):
    conditions = []
    params = []
    if status:
        conditions.append("r.Status = %s")
        params.append(status)
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT
                    r.ResultID AS result_id, r.ScreenedAt AS screened_at,
                    r.ScreenedEntityType AS entity_type, r.EntityID AS entity_id,
                    r.ListSource AS list_source, r.MatchScore AS match_score,
                    r.MatchReason AS match_reason, r.Status AS status,
                    r.ReviewedAt AS reviewed_at,
                    e.FullName AS matched_name,
                    u.Username AS reviewed_by_username
                FROM SanctionsScreeningResults r
                LEFT JOIN SanctionsList e ON r.MatchedEntryID = e.EntryID
                LEFT JOIN AppUsers u ON r.ReviewedByUserID = u.UserID
                {where}
                ORDER BY r.ScreenedAt DESC LIMIT %s
                """,
                [*params, limit],
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return [{k: (str(v) if hasattr(v, "isoformat") else v) for k, v in r.items()} for r in rows]


@router.patch("/results/{result_id}")
def review_result(result_id: int, req: ReviewRequest, user=Depends(require_manager_or_auditor)):
    valid = {"FalsePositive", "Confirmed", "Resolved"}
    if req.status not in valid:
        raise HTTPException(status_code=422, detail=f"status must be one of {valid}")
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "UPDATE SanctionsScreeningResults SET Status=%s, ReviewedByUserID=%s, ReviewedAt=NOW() WHERE ResultID=%s",
                (req.status, user["user_id"], result_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Result not found")
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return {"success": True}
