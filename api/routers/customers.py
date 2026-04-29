import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException, Query
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_any_role, require_teller_or_manager
from models.accounts import AccountDetail, AccountListResponse
from models.customers import (
    CreateCustomerRequest,
    CustomerDetail,
    CustomerListResponse,
    CustomerSummary,
)
from security_context import ROLE_AUDITOR, ROLE_TELLER

router = APIRouter()

_GENDER_MAP = {"Male": "M", "Female": "F", "Other": "Other"}
_GENDER_DISPLAY = {"M": "Male", "F": "Female", "Other": "Other"}
def _email_sql(alias: str) -> str:
    return f"CAST(AES_DECRYPT({alias}.Email, @encryption_key) AS CHAR(100))"


def _phone_sql(alias: str) -> str:
    return f"CAST(AES_DECRYPT({alias}.Phone, @encryption_key) AS CHAR(15))"


def _customer_source(role: str, detail: bool = False, alias: str = "c") -> tuple[str, str]:
    if role == ROLE_AUDITOR:
        if detail:
            return (
                f"vw_customer_details_masked {alias}",
                """
                c.CustomerID AS customer_id,
                c.FirstName AS first_name,
                c.LastName AS last_name,
                c.EmailMasked AS email,
                c.PhoneMasked AS phone,
                c.AddressMasked AS address,
                c.DateOfBirthMasked AS date_of_birth,
                c.Gender AS gender,
                c.City AS city,
                CAST(c.RegistrationDate AS CHAR(20)) AS created_at
                """,
            )
        return (
            f"vw_customer_directory_masked {alias}",
            """
            c.CustomerID AS customer_id,
            c.FirstName AS first_name,
            c.LastName AS last_name,
            c.EmailMasked AS email,
            c.PhoneMasked AS phone
            """,
        )

    base_select = f"""
        c.CustomerID AS customer_id,
        c.FirstName AS first_name,
        c.LastName AS last_name,
        {_email_sql("c")} AS email,
        {_phone_sql("c")} AS phone
    """
    if detail:
        return (
            f"Customers {alias}",
            f"""
            {base_select},
            c.Address AS address,
            c.DateOfBirth AS date_of_birth,
            c.Gender AS gender,
            c.City AS city,
            c.RegistrationDate AS created_at
            """,
        )
    return (f"Customers {alias}", base_select)


def _customer_scope_clause(current_user: dict, customer_alias: str = "c") -> tuple[str, tuple]:
    if current_user["role"] != ROLE_TELLER:
        return "", ()
    branch_id = current_user.get("branch_id")
    if branch_id is None:
        return f" AND 1 = 0", ()
    return (
        f"""
        AND EXISTS (
            SELECT 1
            FROM Accounts scoped_accounts
            WHERE scoped_accounts.CustomerID = {customer_alias}.CustomerID
              AND scoped_accounts.BranchID = %s
        )
        """,
        (branch_id,),
    )


def _normalize_customer_row(row: dict) -> dict:
    normalized = {k: str(v) if hasattr(v, "isoformat") else v for k, v in row.items()}
    normalized["gender"] = _GENDER_DISPLAY.get(normalized.get("gender"), normalized.get("gender"))
    return normalized


@router.post("", response_model=CustomerDetail, status_code=201)
def create_customer(body: CreateCustomerRequest, _=Depends(require_teller_or_manager)):
    if body.gender not in _GENDER_MAP:
        raise HTTPException(status_code=400, detail="Gender must be Male, Female, or Other.")
    gender_db = _GENDER_MAP.get(body.gender, body.gender)
    identity_number = uuid.uuid4().hex[:12].upper()
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                CALL sp_create_customer(
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, @new_customer_id
                )
                """,
                (
                    body.first_name,
                    body.last_name,
                    body.date_of_birth,
                    gender_db,
                    identity_number,
                    body.phone,
                    body.email,
                    body.address,
                    body.city,
                ),
            )
            cursor.execute("SELECT @new_customer_id AS customer_id")
            out_row = cursor.fetchone()
            new_id = out_row["customer_id"] if out_row else None
            if new_id is None:
                raise MySQLError(msg="Stored procedure did not return a new customer ID")
            _, detail_select = _customer_source("manager", detail=True)
            cursor.execute(
                f"SELECT {detail_select} FROM Customers c WHERE c.CustomerID = %s",
                (new_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    return CustomerDetail(**_normalize_customer_row(row))


@router.get("", response_model=CustomerListResponse)
def list_customers(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_any_role),
):
    source, select_sql = _customer_source(current_user["role"], detail=False, alias="c")
    scope_sql, scope_params = _customer_scope_clause(current_user, "c")
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT {select_sql}
                FROM {source}
                WHERE 1 = 1 {scope_sql}
                ORDER BY c.CustomerID
                LIMIT %s OFFSET %s
                """,
                scope_params + (limit, offset),
            )
            rows = cursor.fetchall()
            cursor.execute(
                f"SELECT COUNT(*) AS total FROM {source} WHERE 1 = 1 {scope_sql}",
                scope_params,
            )
            total = cursor.fetchone()["total"]
        return CustomerListResponse(
            customers=[CustomerSummary(**_normalize_customer_row(r)) for r in rows],
            total=total,
        )
    except MySQLError as e:
        raise db_error_to_http(e)


@router.get("/search", response_model=CustomerListResponse)
def search_customers(
    name: str = Query(..., min_length=1),
    current_user: dict = Depends(require_any_role),
):
    source, select_sql = _customer_source(current_user["role"], detail=False, alias="c")
    scope_sql, scope_params = _customer_scope_clause(current_user, "c")
    pattern = f"%{name}%"
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT {select_sql}
                FROM {source}
                WHERE (c.FirstName LIKE %s OR c.LastName LIKE %s)
                {scope_sql}
                ORDER BY c.LastName, c.FirstName
                """,
                (pattern, pattern) + scope_params,
            )
            rows = cursor.fetchall()
        return CustomerListResponse(
            customers=[CustomerSummary(**_normalize_customer_row(r)) for r in rows],
            total=len(rows),
        )
    except MySQLError as e:
        raise db_error_to_http(e)


@router.get("/{customer_id}/accounts", response_model=AccountListResponse)
def get_customer_accounts(customer_id: int, current_user: dict = Depends(require_any_role)):
    customer_source = "vw_customer_directory_masked" if current_user["role"] == ROLE_AUDITOR else "Customers"
    scope_sql = ""
    account_params = [customer_id]
    if current_user["role"] == "teller":
        if current_user.get("branch_id") is None:
            return AccountListResponse(accounts=[], total=0)
        scope_sql = " AND a.BranchID = %s"
        account_params.append(current_user["branch_id"])

    try:
        with get_db() as (conn, cursor):
            if current_user["role"] == ROLE_TELLER:
                cursor.execute(
                    """
                    SELECT 1
                    FROM Accounts
                    WHERE CustomerID = %s AND BranchID = %s
                    LIMIT 1
                    """,
                    (customer_id, current_user["branch_id"]),
                )
            else:
                cursor.execute(
                    f"SELECT CustomerID FROM {customer_source} WHERE CustomerID = %s",
                    (customer_id,),
                )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
            cursor.execute(
                """
                SELECT
                    a.AccountID       AS account_id,
                    a.CustomerID      AS customer_id,
                    a.AccountNumber   AS account_number,
                    CONCAT(c.FirstName, ' ', c.LastName) AS customer_name,
                    at.TypeName       AS account_type,
                    b.BranchName      AS branch_name,
                    a.Balance         AS balance,
                    a.Status          AS status,
                    a.OpenDate        AS created_at
                FROM Accounts a
                JOIN """
                + customer_source
                + """ c  ON a.CustomerID    = c.CustomerID
                JOIN AccountTypes at ON a.AccountTypeID = at.AccountTypeID
                JOIN Branches     b  ON a.BranchID      = b.BranchID
                WHERE a.CustomerID = %s"""
                + scope_sql
                + """
                ORDER BY a.AccountID
                """,
                tuple(account_params),
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    accounts = []
    for row in rows:
        normalized = {
            k: (
                float(v)
                if hasattr(v, "quantize")
                else (str(v) if hasattr(v, "isoformat") else v)
            )
            for k, v in row.items()
        }
        accounts.append(AccountDetail(**normalized))
    return AccountListResponse(accounts=accounts, total=len(accounts))


@router.get("/{customer_id}", response_model=CustomerDetail)
def get_customer(customer_id: int, current_user: dict = Depends(require_any_role)):
    source, select_sql = _customer_source(current_user["role"], detail=True, alias="c")
    scope_sql, scope_params = _customer_scope_clause(current_user, "c")
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT {select_sql}
                FROM {source}
                WHERE c.CustomerID = %s {scope_sql}
                """,
                (customer_id,) + scope_params,
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not row:
        raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")
    return CustomerDetail(**_normalize_customer_row(row))
