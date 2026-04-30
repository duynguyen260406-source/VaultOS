import logging
import sys
from datetime import date, timedelta
from mysql.connector import Error as MySQLError
from tabulate import tabulate
from db_connection import get_db

logger = logging.getLogger(__name__)
_EMPTY_BRANCH_STATS = {
    "tx_count": 0,
    "deposit_volume": 0.0,
    "withdrawal_volume": 0.0,
    "transfer_volume": 0.0,
    "deposit_count": 0,
    "withdrawal_count": 0,
    "suspicious_count": 0,
    "suspicious_amount": 0.0,
    "unreviewed_count": 0,
    "loan_count": 0,
}


def _emit_console_output(enabled: bool) -> bool:
    return enabled and sys.stdout.isatty()


def _normalize_scalar(value):
    if hasattr(value, "quantize"):
        return float(value)
    if hasattr(value, "isoformat"):
        return str(value)
    return value


def _merge_transfer_rows(rows):
    merged = {}
    for row in rows:
        tx_type = row["transaction_type"]
        key = "Transfer" if str(tx_type).lower().startswith("transfer") else tx_type
        if key not in merged:
            merged[key] = {
                "transaction_type": key,
                "transaction_count": 0,
                "total_amount": 0.0,
                "_sides": 0,
            }
        count = int(row["transaction_count"])
        total = float(row["total_amount"])
        if key == "Transfer":
            merged[key]["_sides"] += 1
            merged[key]["transaction_count"] = max(merged[key]["transaction_count"], count)
            merged[key]["total_amount"] += total
        else:
            merged[key]["transaction_count"] += count
            merged[key]["total_amount"] += total

    result = []
    for item in merged.values():
        if item["transaction_type"] == "Transfer" and item["_sides"] >= 2:
            item["total_amount"] /= 2
        item.pop("_sides", None)
        result.append(item)
    return result


def daily_transaction_report(report_date=None, emit_console_output=True):
    """
    Display a transaction summary for a given date, grouped by transaction type
    with count and total amount.

    If no date is provided, defaults to today.

    Returns a dict with report_date, rows, grand_count, and grand_total.
    """
    if report_date is None:
        report_date = date.today()

    emit_console = _emit_console_output(emit_console_output)
    if emit_console:
        print(f"\n{'=' * 50}")
        print(f"  Daily Transaction Report  --  {report_date}")
        print(f"{'=' * 50}")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    TransactionType  AS transaction_type,
                    TransactionCount AS transaction_count,
                    TotalAmount      AS total_amount
                FROM vw_transaction_summary
                WHERE TransactionDate = %s
                ORDER BY TransactionType
                """,
                (report_date,),
            )
            rows = cursor.fetchall()

            if not rows:
                if emit_console:
                    print("\n  No transactions found for this date.\n")
                return {"report_date": str(report_date), "rows": [], "grand_count": 0, "grand_total": 0.0}

            table_data = []
            grand_count = 0
            grand_total = 0.0
            result_rows = []

            for r in rows:
                count = r["transaction_count"]
                total = float(r["total_amount"])
                grand_count += count
                grand_total += total
                result_rows.append({
                    "transaction_type": r["transaction_type"],
                    "transaction_count": count,
                    "total_amount": total,
                })
                table_data.append([
                    r["transaction_type"],
                    count,
                    f"${total:,.2f}",
                ])

            # Append a totals row
            table_data.append(["TOTAL", grand_count, f"${grand_total:,.2f}"])

            headers = ["Transaction Type", "Count", "Total Amount"]
            if emit_console:
                print(tabulate(table_data, headers=headers, tablefmt="grid"))
                print()

            return {
                "report_date": str(report_date),
                "rows": result_rows,
                "grand_count": grand_count,
                "grand_total": grand_total,
            }

    except MySQLError as e:
        logger.error("Could not generate daily transaction report for %s: %s", report_date, e)
        raise


def daily_transaction_range_report(days, end_date=None):
    """Return one summary object per day for a contiguous window ending at end_date."""
    if days < 1:
        raise ValueError("days must be at least 1")

    if end_date is None:
        end_date = date.today()
    start_date = end_date - timedelta(days=days - 1)

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    TransactionDate  AS transaction_date,
                    TransactionType  AS transaction_type,
                    TransactionCount AS transaction_count,
                    TotalAmount      AS total_amount
                FROM vw_transaction_summary
                WHERE TransactionDate BETWEEN %s AND %s
                ORDER BY TransactionDate, TransactionType
                """,
                (start_date, end_date),
            )
            rows = cursor.fetchall()

        results = {}
        ordered_dates = []
        for offset in range(days):
            current_date = start_date + timedelta(days=offset)
            key = str(current_date)
            ordered_dates.append(key)
            results[key] = {
                "report_date": key,
                "rows": [],
                "grand_count": 0,
                "grand_total": 0.0,
            }

        for row in rows:
            key = str(row["transaction_date"])
            if key not in results:
                continue
            count = int(row["transaction_count"])
            total = float(row["total_amount"])
            results[key]["rows"].append(
                {
                    "transaction_type": row["transaction_type"],
                    "transaction_count": count,
                    "total_amount": total,
                }
            )
            results[key]["grand_count"] += count
            results[key]["grand_total"] += total

        return [results[key] for key in ordered_dates]
    except MySQLError as e:
        logger.error(
            "Could not generate %s-day transaction report ending on %s: %s",
            days,
            end_date,
            e,
        )
        raise


def customer_balance_summary(emit_console_output=True):
    """
    Display all customers with their total balances using the
    vw_customer_balances view.

    Returns a list of dicts with customer_id, customer_name, total_balance.
    """
    emit_console = _emit_console_output(emit_console_output)
    if emit_console:
        print(f"\n{'=' * 50}")
        print("  Customer Balance Summary")
        print(f"{'=' * 50}")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT CustomerID   AS customer_id,
                       CustomerName AS customer_name,
                       TotalBalance AS total_balance
                FROM vw_customer_balances
                ORDER BY TotalBalance DESC
                """
            )
            rows = cursor.fetchall()

            if not rows:
                if emit_console:
                    print("\n  No customer balance data available.\n")
                return []

            result_rows = []
            table_data = []
            for r in rows:
                total = float(r["total_balance"])
                result_rows.append({
                    "customer_id": r["customer_id"],
                    "customer_name": r["customer_name"],
                    "total_balance": total,
                })
                table_data.append([r["customer_id"], r["customer_name"], f"${total:,.2f}"])

            headers = ["Customer ID", "Customer Name", "Total Balance"]
            if emit_console:
                print(tabulate(table_data, headers=headers, tablefmt="grid"))
                print()

            return result_rows

    except MySQLError as e:
        logger.error("Could not generate customer balance summary: %s", e)
        raise


def daily_transaction_detail(report_date=None, transaction_type=None):
    """
    Return individual transactions for a given date and type.
    'Transfer' covers both Transfer In and Transfer Out.
    """
    if report_date is None:
        report_date = date.today()

    try:
        with get_db() as (conn, cursor):
            if transaction_type and transaction_type.lower().startswith("transfer"):
                cursor.execute(
                    """
                    SELECT t.TransactionID   AS transaction_id,
                           t.TransactionType AS transaction_type,
                           t.Amount          AS amount,
                           t.TransactionDate AS transaction_date,
                           a.AccountNumber   AS account_number,
                           CONCAT(c.FirstName, ' ', c.LastName) AS customer_name,
                           t.Description     AS description
                    FROM Transactions t
                    JOIN Accounts  a ON t.AccountID   = a.AccountID
                    JOIN Customers c ON a.CustomerID  = c.CustomerID
                    WHERE DATE(t.TransactionDate) = %s
                      AND t.TransactionType IN ('Transfer In', 'Transfer Out')
                    ORDER BY t.TransactionDate DESC
                    LIMIT 200
                    """,
                    (report_date,),
                )
            else:
                cursor.execute(
                    """
                    SELECT t.TransactionID   AS transaction_id,
                           t.TransactionType AS transaction_type,
                           t.Amount          AS amount,
                           t.TransactionDate AS transaction_date,
                           a.AccountNumber   AS account_number,
                           CONCAT(c.FirstName, ' ', c.LastName) AS customer_name,
                           t.Description     AS description
                    FROM Transactions t
                    JOIN Accounts  a ON t.AccountID   = a.AccountID
                    JOIN Customers c ON a.CustomerID  = c.CustomerID
                    WHERE DATE(t.TransactionDate) = %s
                      AND t.TransactionType = %s
                    ORDER BY t.TransactionDate DESC
                    LIMIT 200
                    """,
                    (report_date, transaction_type),
                )
            rows = cursor.fetchall()
        return [
            {
                "transaction_id":   row["transaction_id"],
                "transaction_type": row["transaction_type"],
                "amount":           float(row["amount"]),
                "transaction_date": str(row["transaction_date"]),
                "account_number":   row["account_number"],
                "customer_name":    row["customer_name"],
                "description":      row.get("description"),
            }
            for row in rows
        ]
    except MySQLError as e:
        logger.error("Could not get transaction detail: %s", e)
        raise


def branch_transaction_stats():
    """
    Per-branch transaction volume/count and suspicious activity stats.
    Returns a list of dicts keyed by branch_id.
    """
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    b.BranchID   AS branch_id,
                    b.BranchName AS branch_name,
                    COALESCE(tx.tx_count,          0) AS tx_count,
                    COALESCE(tx.deposit_volume,    0) AS deposit_volume,
                    COALESCE(tx.withdrawal_volume, 0) AS withdrawal_volume,
                    COALESCE(tx.transfer_volume,   0) AS transfer_volume,
                    COALESCE(tx.deposit_count,     0) AS deposit_count,
                    COALESCE(tx.withdrawal_count,  0) AS withdrawal_count,
                    COALESCE(sa_s.alert_count,     0) AS suspicious_count,
                    COALESCE(sa_s.alert_amount,    0) AS suspicious_amount,
                    COALESCE(sa_s.unreviewed_count,0) AS unreviewed_count,
                    COALESCE(ln.loan_count,        0) AS loan_count
                FROM Branches b
                LEFT JOIN (
                    SELECT a.BranchID,
                        COUNT(t.TransactionID) AS tx_count,
                        SUM(CASE WHEN t.TransactionType = 'Deposit'
                                 THEN t.Amount ELSE 0 END) AS deposit_volume,
                        SUM(CASE WHEN t.TransactionType = 'Withdrawal'
                                 THEN t.Amount ELSE 0 END) AS withdrawal_volume,
                        SUM(CASE WHEN t.TransactionType IN ('Transfer In','Transfer Out')
                                 THEN t.Amount ELSE 0 END) AS transfer_volume,
                        COUNT(CASE WHEN t.TransactionType = 'Deposit'    THEN 1 END) AS deposit_count,
                        COUNT(CASE WHEN t.TransactionType = 'Withdrawal' THEN 1 END) AS withdrawal_count
                    FROM Accounts a
                    JOIN Transactions t ON t.AccountID = a.AccountID
                    GROUP BY a.BranchID
                ) tx ON tx.BranchID = b.BranchID
                LEFT JOIN (
                    SELECT a.BranchID,
                        COUNT(sa.AlertID)                                            AS alert_count,
                        SUM(sa.Amount)                                               AS alert_amount,
                        SUM(CASE WHEN sa.Reviewed = FALSE THEN 1 ELSE 0 END)        AS unreviewed_count
                    FROM Accounts a
                    JOIN SuspiciousActivity sa ON sa.AccountID = a.AccountID
                    GROUP BY a.BranchID
                ) sa_s ON sa_s.BranchID = b.BranchID
                LEFT JOIN (
                    SELECT a.BranchID,
                        COUNT(a.AccountID) AS loan_count
                    FROM Accounts a
                    JOIN AccountTypes at ON at.AccountTypeID = a.AccountTypeID
                    WHERE at.TypeName LIKE '%Loan%' OR at.TypeName LIKE '%loan%'
                    GROUP BY a.BranchID
                ) ln ON ln.BranchID = b.BranchID
                ORDER BY COALESCE(tx.deposit_volume, 0) DESC
                """
            )
            rows = cursor.fetchall()
        return [
            {
                "branch_id":          int(r["branch_id"]),
                "branch_name":        r["branch_name"],
                "tx_count":           int(r["tx_count"]),
                "deposit_volume":     float(r["deposit_volume"]),
                "withdrawal_volume":  float(r["withdrawal_volume"]),
                "transfer_volume":    float(r["transfer_volume"]),
                "deposit_count":      int(r["deposit_count"]),
                "withdrawal_count":   int(r["withdrawal_count"]),
                "suspicious_count":   int(r["suspicious_count"]),
                "suspicious_amount":  float(r["suspicious_amount"]),
                "unreviewed_count":   int(r["unreviewed_count"]),
                "loan_count":         int(r["loan_count"]),
            }
            for r in rows
        ]
    except MySQLError as e:
        logger.error("Could not get branch transaction stats: %s", e)
        raise


def branch_activity_with_stats():
    """Return branch overview rows merged with transaction and alert stats."""
    branch_rows = branch_activity_report(emit_console_output=False)
    stats_map = {row["branch_id"]: row for row in branch_transaction_stats()}
    return [
        {
            **row,
            **stats_map.get(row["branch_id"], _EMPTY_BRANCH_STATS),
        }
        for row in branch_rows
    ]


def branch_activity_report(emit_console_output=True):
    """
    Display a branch activity overview using the vw_branch_overview view.

    Returns a list of dicts with branch_id, branch_name, city, account_count,
    employee_count, and total_deposits.
    """
    emit_console = _emit_console_output(emit_console_output)
    if emit_console:
        print(f"\n{'=' * 50}")
        print("  Branch Activity Report")
        print(f"{'=' * 50}")

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT b.BranchID    AS branch_id,
                       v.BranchName  AS branch_name,
                       v.City        AS city,
                       v.AccountCount  AS account_count,
                       v.EmployeeCount AS employee_count,
                       v.TotalDeposits AS total_deposits
                FROM vw_branch_overview v
                JOIN Branches b ON b.BranchName = v.BranchName
                ORDER BY v.TotalDeposits DESC
                """
            )
            rows = cursor.fetchall()

            if not rows:
                if emit_console:
                    print("\n  No branch activity data available.\n")
                return []

            result_rows = []
            table_data = []
            for r in rows:
                total_dep = float(r["total_deposits"])
                result_rows.append({
                    "branch_id": int(r["branch_id"]),
                    "branch_name": r["branch_name"],
                    "city": r["city"],
                    "account_count": r["account_count"],
                    "employee_count": r["employee_count"],
                    "total_deposits": total_dep,
                })
                table_data.append([
                    r["branch_name"],
                    r["city"],
                    r["account_count"],
                    r["employee_count"],
                    f"${total_dep:,.2f}",
                ])

            headers = ["Branch Name", "City", "Accounts", "Employees", "Total Deposits"]
            if emit_console:
                print(tabulate(table_data, headers=headers, tablefmt="grid"))
                print()

            return result_rows

    except MySQLError as e:
        logger.error("Could not generate branch activity report: %s", e)
        raise


def dashboard_summary(role, branch_id=None):
    """Return the combined payload needed by the dashboard for a given role."""
    if role == "teller":
        if branch_id is None:
            return {
                "stats": {"type": "teller"},
                "recent_tx": {"type": "teller"},
                "right_panel": {"type": "teller", "accounts": [], "total": 0},
            }

        try:
            with get_db() as (conn, cursor):
                cursor.execute(
                    """
                    SELECT COUNT(*) AS total
                    FROM Accounts
                    WHERE Status = 'Active' AND BranchID = %s
                    """,
                    (branch_id,),
                )
                total = int(cursor.fetchone()["total"])
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
                    JOIN Customers c   ON a.CustomerID = c.CustomerID
                    JOIN AccountTypes at ON a.AccountTypeID = at.AccountTypeID
                    JOIN Branches b    ON a.BranchID = b.BranchID
                    WHERE a.Status = 'Active' AND a.BranchID = %s
                    ORDER BY a.AccountID
                    LIMIT 8
                    """,
                    (branch_id,),
                )
                rows = cursor.fetchall()
        except MySQLError as e:
            logger.error("Could not generate teller dashboard summary: %s", e)
            raise

        accounts = [
            {key: _normalize_scalar(value) for key, value in row.items()}
            for row in rows
        ]
        return {
            "stats": {"type": "teller"},
            "recent_tx": {"type": "teller"},
            "right_panel": {"type": "teller", "accounts": accounts, "total": total},
        }

    today_report = daily_transaction_report(emit_console_output=False)
    merged_rows = _merge_transfer_rows(today_report.get("rows", []))
    recent_total = sum(row["total_amount"] for row in merged_rows)

    try:
        with get_db() as (conn, cursor):
            cursor.execute("SELECT COUNT(*) AS total FROM Customers")
            customer_total = int(cursor.fetchone()["total"])
            cursor.execute("SELECT COUNT(*) AS total FROM Accounts")
            account_total = int(cursor.fetchone()["total"])
    except MySQLError as e:
        logger.error("Could not generate dashboard counts: %s", e)
        raise

    if role == "manager":
        right_panel = {
            "type": "manager",
            "rows": branch_activity_report(emit_console_output=False),
        }
    else:
        right_panel = {
            "type": "auditor",
            "rows": customer_balance_summary(emit_console_output=False),
        }

    return {
        "stats": {
            "type": "manager",
            "total": float(today_report.get("grand_total", 0.0)),
            "count": int(today_report.get("grand_count", 0)),
            "custTotal": customer_total,
            "acctTotal": account_total,
        },
        "recent_tx": {
            "rows": merged_rows,
            "date": today_report.get("report_date"),
            "total": recent_total,
        },
        "right_panel": right_panel,
    }
