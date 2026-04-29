import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_manager, require_manager_or_auditor
from models.employees import (
    CreateEmployeeRequest,
    EmployeeDetail,
    EmployeeListResponse,
    UpdateEmployeeRequest,
)
from security_context import ROLE_AUDITOR

router = APIRouter()
_EMPLOYEE_EMAIL_SQL = "CAST(AES_DECRYPT(Email, @encryption_key) AS CHAR(100))"
_EMPLOYEE_PHONE_SQL = "CAST(AES_DECRYPT(Phone, @encryption_key) AS CHAR(15))"
_EMPLOYEE_EMAIL_HASH_SQL = (
    "CASE "
    "WHEN NULLIF(TRIM(%s), '') IS NULL THEN NULL "
    "ELSE SHA2(CONCAT(@hash_pepper, '|', LOWER(TRIM(%s))), 256) "
    "END"
)


def _employee_source(role: str) -> tuple[str, str]:
    if role == ROLE_AUDITOR:
        return (
            "vw_employee_details_masked",
            """
            EmployeeID  AS employee_id,
            BranchID    AS branch_id,
            ManagerID   AS manager_id,
            FirstName   AS first_name,
            LastName    AS last_name,
            Position    AS position,
            Salary      AS salary,
            EmailMasked AS email,
            PhoneMasked AS phone,
            HireDate    AS hire_date
            """,
        )
    return (
        "Employees",
        f"""
        EmployeeID  AS employee_id,
        BranchID    AS branch_id,
        ManagerID   AS manager_id,
        FirstName   AS first_name,
        LastName    AS last_name,
        Position    AS position,
        Salary      AS salary,
        {_EMPLOYEE_EMAIL_SQL} AS email,
        {_EMPLOYEE_PHONE_SQL} AS phone,
        HireDate    AS hire_date
        """,
    )


def _row_to_detail(row: dict) -> EmployeeDetail:
    return EmployeeDetail(
        employee_id=row["employee_id"],
        branch_id=row["branch_id"],
        manager_id=row.get("manager_id"),
        first_name=row["first_name"],
        last_name=row["last_name"],
        position=row.get("position"),
        salary=float(row["salary"]) if row.get("salary") is not None else None,
        email=row.get("email"),
        phone=row.get("phone"),
        hire_date=str(row["hire_date"]) if row.get("hire_date") else None,
    )


@router.get("", response_model=EmployeeListResponse)
def list_employees(current_user: dict = Depends(require_manager_or_auditor)):
    """List all employees."""
    source, select_sql = _employee_source(current_user["role"])
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT
                    {select_sql}
                FROM {source}
                ORDER BY EmployeeID
                """
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return EmployeeListResponse(employees=[_row_to_detail(row) for row in rows], total=len(rows))


@router.get("/{employee_id}", response_model=EmployeeDetail)
def get_employee(employee_id: int, current_user: dict = Depends(require_manager_or_auditor)):
    """Get a single employee by ID."""
    source, select_sql = _employee_source(current_user["role"])
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                f"""
                SELECT
                    {select_sql}
                FROM {source}
                WHERE EmployeeID = %s
                """,
                (employee_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    if not row:
        raise HTTPException(status_code=404, detail=f"Employee {employee_id} not found")
    return _row_to_detail(row)


@router.post("", response_model=EmployeeDetail, status_code=201)
def create_employee(body: CreateEmployeeRequest, _=Depends(require_manager)):
    """Create a new employee. Requires manager role."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO Employees
                    (BranchID, ManagerID, FirstName, LastName, Position, Salary, HireDate, Email, EmailHash, Phone, EncryptionKeyVersion)
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    AES_ENCRYPT(%s, @encryption_key),
                    """
                + _EMPLOYEE_EMAIL_HASH_SQL
                + """,
                    AES_ENCRYPT(%s, @encryption_key),
                    COALESCE(CAST(@encryption_key_version AS UNSIGNED), 1)
                )
                """,
                (
                    body.branch_id,
                    body.manager_id,
                    body.first_name,
                    body.last_name,
                    body.position,
                    body.salary,
                    body.hire_date,
                    body.email,
                    body.email,
                    body.email,
                    body.phone,
                ),
            )
            new_id = cursor.lastrowid
            _, select_sql = _employee_source("manager")
            cursor.execute(
                f"SELECT {select_sql} FROM Employees WHERE EmployeeID = %s",
                (new_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_detail(row)


@router.put("/{employee_id}", response_model=EmployeeDetail)
def update_employee(employee_id: int, body: UpdateEmployeeRequest, _=Depends(require_manager)):
    """Update an employee (partial update). Requires manager role."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    col_map = {
        "position": "Position",
        "salary": "Salary",
        "hire_date": "HireDate",
        "branch_id": "BranchID",
        "manager_id": "ManagerID",
    }
    set_clauses = []
    values = []
    for key, value in updates.items():
        if key == "email":
            set_clauses.append("Email = AES_ENCRYPT(%s, @encryption_key)")
            set_clauses.append(f"EmailHash = {_EMPLOYEE_EMAIL_HASH_SQL}")
            values.extend([value, value, value])
            continue
        if key == "phone":
            set_clauses.append("Phone = AES_ENCRYPT(%s, @encryption_key)")
            values.append(value)
            continue
        set_clauses.append(f"{col_map[key]} = %s")
        values.append(value)
    if {"email", "phone"} & set(updates):
        set_clauses.append("EncryptionKeyVersion = COALESCE(CAST(@encryption_key_version AS UNSIGNED), 1)")
    values.append(employee_id)
    set_sql = ", ".join(set_clauses)

    try:
        with get_db() as (conn, cursor):
            cursor.execute(f"UPDATE Employees SET {set_sql} WHERE EmployeeID = %s", values)
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail=f"Employee {employee_id} not found")
            _, select_sql = _employee_source("manager")
            cursor.execute(
                f"SELECT {select_sql} FROM Employees WHERE EmployeeID = %s",
                (employee_id,),
            )
            row = cursor.fetchone()
    except MySQLError as e:
        raise db_error_to_http(e)
    return _row_to_detail(row)
