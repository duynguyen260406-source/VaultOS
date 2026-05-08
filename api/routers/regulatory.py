import csv
import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from mysql.connector import Error as MySQLError

from db_connection import get_db
from dependencies import db_error_to_http, require_manager_or_auditor, require_any_role

router = APIRouter()

_QUERIES = {
    "CTR_DAILY": """
        SELECT
            t.TransactionID     AS transaction_id,
            a.AccountNumber     AS account_number,
            b.BranchName        AS branch_name,
            t.TransactionType   AS type,
            t.Amount            AS amount,
            DATE(t.TransactionDate) AS txn_date,
            t.Description       AS description
        FROM Transactions t
        JOIN Accounts a ON t.AccountID = a.AccountID
        JOIN Branches b ON a.BranchID  = b.BranchID
        WHERE t.Amount >= 200000000
          AND ({date_filter})
        ORDER BY t.TransactionDate DESC
    """,
    "STR_MONTHLY": """
        SELECT
            sa.AlertID          AS alert_id,
            a.AccountNumber     AS account_number,
            sa.Amount           AS amount,
            sa.AlertDate        AS alert_date,
            sa.Reason           AS reason,
            IF(sa.Reviewed, 'Yes', 'No') AS reviewed
        FROM SuspiciousActivity sa
        JOIN Accounts a ON sa.AccountID = a.AccountID
        WHERE ({date_filter_sa})
        ORDER BY sa.AlertDate DESC
    """,
    "LOAN_SUMMARY": """
        SELECT
            b.BranchName        AS branch_name,
            COUNT(*)            AS total_loans,
            SUM(CASE WHEN COALESCE(l.ApprovalStatus,l.Status)='Pending'   THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN COALESCE(l.ApprovalStatus,l.Status)='Approved'  THEN 1 ELSE 0 END) AS approved,
            SUM(CASE WHEN COALESCE(l.ApprovalStatus,l.Status)='Disbursed' THEN 1 ELSE 0 END) AS disbursed,
            SUM(CASE WHEN COALESCE(l.ApprovalStatus,l.Status)='Paid'      THEN 1 ELSE 0 END) AS paid,
            SUM(l.LoanAmount)           AS total_loan_amount,
            SUM(l.PrincipalOutstanding) AS total_outstanding
        FROM Loans l
        JOIN Branches b ON l.BranchID = b.BranchID
        WHERE ({date_filter_loan})
        GROUP BY b.BranchID, b.BranchName
        ORDER BY total_loan_amount DESC
    """,
    "BALANCE_SHEET": """
        SELECT
            b.BranchName                    AS branch_name,
            COUNT(DISTINCT a.AccountID)     AS account_count,
            SUM(a.Balance)                  AS total_deposits,
            COUNT(DISTINCT l.LoanID)        AS loan_count,
            COALESCE(SUM(l.PrincipalOutstanding),0) AS loans_outstanding
        FROM Branches b
        LEFT JOIN Accounts a ON a.BranchID = b.BranchID AND a.Status = 'Active'
        LEFT JOIN Loans    l ON l.BranchID = b.BranchID AND COALESCE(l.ApprovalStatus,l.Status) = 'Disbursed'
        GROUP BY b.BranchID, b.BranchName
        ORDER BY total_deposits DESC
    """,
}


def _build_query(code: str, params: dict) -> tuple[str, list]:
    date_from = params.get("date_from", "")
    date_to = params.get("date_to", "")

    def date_filter(col: str) -> tuple[str, list]:
        conds, vals = ["1=1"], []
        if date_from:
            conds.append(f"DATE({col}) >= %s")
            vals.append(date_from)
        if date_to:
            conds.append(f"DATE({col}) <= %s")
            vals.append(date_to)
        return " AND ".join(conds), vals

    if code == "CTR_DAILY":
        cond, vals = date_filter("t.TransactionDate")
        return _QUERIES[code].replace("{date_filter}", cond), vals
    elif code == "STR_MONTHLY":
        cond, vals = date_filter("sa.AlertDate")
        return _QUERIES[code].replace("{date_filter_sa}", cond), vals
    elif code == "LOAN_SUMMARY":
        cond, vals = date_filter("l.StartDate")
        return _QUERIES[code].replace("{date_filter_loan}", cond), vals
    elif code == "BALANCE_SHEET":
        return _QUERIES[code], []
    raise HTTPException(status_code=404, detail="Template not found")


@router.get("/templates")
def list_templates(user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT TemplateID AS template_id, Code AS code, Name AS name, Description AS description, RequiredRole AS required_role, Active AS active FROM RegulatoryReportTemplates WHERE Active=1 ORDER BY Code"
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)
    return rows


@router.get("/runs")
def list_runs(user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT r.RunID AS run_id, t.Code AS code, t.Name AS template_name,
                       r.OutputFormat AS output_format, r.RowCount AS row_count,
                       r.GeneratedAt AS generated_at, r.Parameters AS parameters,
                       u.Username AS run_by_username,
                       s.Username AS signed_off_by_username, r.SignedOffAt AS signed_off_at
                FROM RegulatoryReportRuns r
                JOIN RegulatoryReportTemplates t ON r.TemplateID = t.TemplateID
                LEFT JOIN AppUsers u ON r.RunByUserID = u.UserID
                LEFT JOIN AppUsers s ON r.SignedOffByUserID = s.UserID
                ORDER BY r.GeneratedAt DESC LIMIT 100
                """
            )
            rows = cursor.fetchall()
    except MySQLError as e:
        raise db_error_to_http(e)

    result = []
    for r in rows:
        d = dict(r)
        d["generated_at"] = str(d["generated_at"]) if d["generated_at"] else None
        d["signed_off_at"] = str(d["signed_off_at"]) if d["signed_off_at"] else None
        result.append(d)
    return result


@router.post("/runs/{template_code}")
def run_report(
    template_code: str,
    params: dict = None,
    output_format: str = "CSV",
    user=Depends(require_manager_or_auditor),
):
    if params is None:
        params = {}
    if template_code not in _QUERIES:
        raise HTTPException(status_code=404, detail="Unknown template code")

    try:
        query, vals = _build_query(template_code, params)
    except HTTPException:
        raise

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT TemplateID FROM RegulatoryReportTemplates WHERE Code=%s AND Active=1",
                (template_code,),
            )
            tmpl = cursor.fetchone()
            if not tmpl:
                raise HTTPException(status_code=404, detail="Template not found or inactive")
            template_id = tmpl["TemplateID"]

            cursor.execute(query, vals)
            rows = cursor.fetchall()

            cursor.execute(
                "INSERT INTO RegulatoryReportRuns (TemplateID, RunByUserID, Parameters, OutputFormat, RowCount) VALUES (%s,%s,%s,%s,%s)",
                (template_id, user["user_id"], json.dumps(params), output_format, len(rows)),
            )
            run_id = cursor.lastrowid
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)

    if output_format == "CSV":
        if not rows:
            return {"run_id": run_id, "row_count": 0, "data": []}
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        for r in rows:
            writer.writerow({k: (str(v) if v is not None else '') for k, v in r.items()})
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{template_code}_{run_id}.csv"'},
        )

    return {
        "run_id": run_id,
        "row_count": len(rows),
        "data": [{k: (str(v) if hasattr(v, "isoformat") or hasattr(v, "quantize") else v) for k, v in r.items()} for r in rows],
    }


@router.post("/runs/{run_id}/signoff")
def signoff_run(run_id: int, user=Depends(require_manager_or_auditor)):
    try:
        with get_db() as (conn, cursor):
            cursor.execute("SELECT RunID FROM RegulatoryReportRuns WHERE RunID=%s", (run_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Run not found")
            cursor.execute(
                "UPDATE RegulatoryReportRuns SET SignedOffByUserID=%s, SignedOffAt=NOW() WHERE RunID=%s",
                (user["user_id"], run_id),
            )
    except HTTPException:
        raise
    except MySQLError as e:
        raise db_error_to_http(e)
    return {"success": True}
