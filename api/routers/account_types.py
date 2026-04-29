import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_manager
from models.account_types import (
    AccountTypeDetail,
    AccountTypeListResponse,
    CreateAccountTypeRequest,
)

router = APIRouter()


def _row_to_detail(row: dict) -> AccountTypeDetail:
    return AccountTypeDetail(
        account_type_id=row["account_type_id"],
        type_name=row["type_name"],
        description=row.get("description"),
        interest_rate=float(row["interest_rate"]) if row.get("interest_rate") is not None else None,
    )


@router.get("", response_model=AccountTypeListResponse)
def list_account_types(_=Depends(require_any_role)):
    """List all account types."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    AccountTypeID AS account_type_id,
                    TypeName      AS type_name,
                    Description   AS description
                FROM AccountTypes
                ORDER BY AccountTypeID
                """
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return AccountTypeListResponse(
        account_types=[_row_to_detail(row) for row in rows],
        total=len(rows),
    )


@router.get("/{account_type_id}", response_model=AccountTypeDetail)
def get_account_type(account_type_id: int, _=Depends(require_any_role)):
    """Get a single account type by ID."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    AccountTypeID AS account_type_id,
                    TypeName      AS type_name,
                    Description   AS description
                FROM AccountTypes
                WHERE AccountTypeID = %s
                """,
                (account_type_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not row:
        raise HTTPException(status_code=404, detail=f"AccountType {account_type_id} not found")
    return _row_to_detail(row)


@router.post("", response_model=AccountTypeDetail, status_code=201)
def create_account_type(body: CreateAccountTypeRequest, _=Depends(require_manager)):
    """Create a new account type. Requires manager role."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO AccountTypes (TypeName, Description)
                VALUES (%s, %s)
                """,
                (body.type_name, body.description),
            )
            new_id = cursor.lastrowid
            cursor.execute(
                """
                SELECT AccountTypeID AS account_type_id, TypeName AS type_name,
                       Description AS description
                FROM AccountTypes WHERE AccountTypeID = %s
                """,
                (new_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_detail(row)
