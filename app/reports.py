import logging
from datetime import date
from mysql.connector import Error as MySQLError
from tabulate import tabulate
from db_connection import get_db

logger = logging.getLogger(__name__)


def daily_transaction_report(report_date=None):
    """
    Display a transaction summary for a given date, grouped by transaction type
    with count and total amount.

    If no date is provided, defaults to today.

    Returns a dict with report_date, rows, grand_count, and grand_total.
    """
    if report_date is None:
        report_date = date.today()

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


def customer_balance_summary():
    """
    Display all customers with their total balances using the
    vw_customer_balances view.

    Returns a list of dicts with customer_id, customer_name, total_balance.
    """
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


def branch_activity_report():
    """
    Display a branch activity overview using the vw_branch_overview view.

    Returns a list of dicts with branch_id, branch_name, city, account_count,
    employee_count, and total_deposits.
    """
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
            print(tabulate(table_data, headers=headers, tablefmt="grid"))
            print()

            return result_rows

    except MySQLError as e:
        logger.error("Could not generate branch activity report: %s", e)
        raise
