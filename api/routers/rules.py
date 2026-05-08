import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError
from pydantic import BaseModel
from typing import Any, Optional

from db_connection import get_db
from dependencies import db_error_to_http, require_manager, require_manager_or_auditor
from rule_lookup import invalidate as invalidate_rule

router = APIRouter()


class RuleSetting(BaseModel):
    rule_id: int
    code: str
    value: Any
    description: Optional[str] = None
    active: bool
    updated_by_username: Optional[str] = None
    updated_at: Optional[str] = None


class RuleListResponse(BaseModel):
    rules: list[RuleSetting]


class PatchRuleRequest(BaseModel):
    value: Any
    active: Optional[bool] = None
    description: Optional[str] = None


_LIST_SQL = """
    SELECT
        rs.RuleID           AS rule_id,
        rs.Code             AS code,
        rs.Value            AS value,
        rs.Description      AS description,
        rs.Active           AS active,
        u.Username          AS updated_by_username,
        rs.UpdatedAt        AS updated_at
    FROM RuleSettings rs
    LEFT JOIN AppUsers u ON rs.UpdatedByUserID = u.UserID
    ORDER BY rs.Code
"""


def _row_to_rule(row: dict) -> RuleSetting:
    raw = row["value"]
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode()
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            pass
    return RuleSetting(
        rule_id=row["rule_id"],
        code=row["code"],
        value=raw,
        description=row["description"],
        active=bool(row["active"]),
        updated_by_username=row["updated_by_username"],
        updated_at=str(row["updated_at"]) if row["updated_at"] else None,
    )


@router.get("", response_model=RuleListResponse)
def list_rules(user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(_LIST_SQL)
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return RuleListResponse(rules=[_row_to_rule(r) for r in rows])


@router.patch("/{code}", response_model=RuleSetting)
def update_rule(code: str, req: PatchRuleRequest, user=Depends(require_manager)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute("SELECT RuleID FROM RuleSettings WHERE Code = %s", (code,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail=f"Rule '{code}' not found")

            updates = ["Value = %s", "UpdatedByUserID = %s", "UpdatedAt = NOW()"]
            params: list = [json.dumps(req.value), user["user_id"]]

            if req.active is not None:
                updates.append("Active = %s")
                params.append(int(req.active))

            if req.description is not None:
                updates.append("Description = %s")
                params.append(req.description)

            params.append(code)
            cursor.execute(
                f"UPDATE RuleSettings SET {', '.join(updates)} WHERE Code = %s",
                params,
            )

            cursor.execute(_LIST_SQL.replace("ORDER BY rs.Code", "WHERE rs.Code = %s ORDER BY rs.Code"), (code,))
            row = cursor.fetchone()
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    invalidate_rule(code)
    return _row_to_rule(row)
