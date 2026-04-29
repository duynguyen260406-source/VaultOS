import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_manager
from models.branches import (
    BranchDetail,
    BranchListResponse,
    CreateBranchRequest,
    UpdateBranchRequest,
)

router = APIRouter()


def _row_to_detail(row: dict) -> BranchDetail:
    return BranchDetail(
        branch_id=row["branch_id"],
        branch_name=row["branch_name"],
        address=row.get("address"),
        city=row.get("city"),
        phone=row.get("phone"),
        established_date=str(row["established_date"]) if row.get("established_date") else None,
    )


@router.get("", response_model=BranchListResponse)
def list_branches(_=Depends(require_any_role)):
    """List all branches."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    BranchID        AS branch_id,
                    BranchName      AS branch_name,
                    Address         AS address,
                    City            AS city,
                    Phone           AS phone,
                    EstablishedDate AS established_date
                FROM Branches
                ORDER BY BranchID
                """
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return BranchListResponse(branches=[_row_to_detail(row) for row in rows], total=len(rows))


@router.get("/{branch_id}", response_model=BranchDetail)
def get_branch(branch_id: int, _=Depends(require_any_role)):
    """Get a single branch by ID."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    BranchID        AS branch_id,
                    BranchName      AS branch_name,
                    Address         AS address,
                    City            AS city,
                    Phone           AS phone,
                    EstablishedDate AS established_date
                FROM Branches
                WHERE BranchID = %s
                """,
                (branch_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not row:
        raise HTTPException(status_code=404, detail=f"Branch {branch_id} not found")
    return _row_to_detail(row)


@router.post("", response_model=BranchDetail, status_code=201)
def create_branch(body: CreateBranchRequest, _=Depends(require_manager)):
    """Create a new branch. Requires manager role."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO Branches (BranchName, Address, City, Phone, EstablishedDate)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (body.branch_name, body.address, body.city, body.phone, body.established_date),
            )
            new_id = cursor.lastrowid
            cursor.execute(
                """
                SELECT BranchID AS branch_id, BranchName AS branch_name,
                       Address AS address, City AS city, Phone AS phone,
                       EstablishedDate AS established_date
                FROM Branches WHERE BranchID = %s
                """,
                (new_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_detail(row)


@router.put("/{branch_id}", response_model=BranchDetail)
def update_branch(branch_id: int, body: UpdateBranchRequest, _=Depends(require_manager)):
    """Update a branch (partial update). Requires manager role."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    col_map = {
        "branch_name": "BranchName",
        "address": "Address",
        "city": "City",
        "phone": "Phone",
        "established_date": "EstablishedDate",
    }
    set_clauses = ", ".join(f"{col_map[key]} = %s" for key in updates)
    values = list(updates.values()) + [branch_id]

    try:
        with get_db() as (conn, cursor):
            cursor.execute(f"UPDATE Branches SET {set_clauses} WHERE BranchID = %s", values)
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"Branch {branch_id} not found")
            cursor.execute(
                """
                SELECT BranchID AS branch_id, BranchName AS branch_name,
                       Address AS address, City AS city, Phone AS phone,
                       EstablishedDate AS established_date
                FROM Branches WHERE BranchID = %s
                """,
                (branch_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_detail(row)
