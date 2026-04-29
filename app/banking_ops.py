import logging

from mysql.connector import Error as MySQLError
from db_connection import get_db
from security_context import ROLE_AUDITOR, get_current_actor, is_branch_scoped_role

logger = logging.getLogger(__name__)

def open_account(customer_id, account_type_id, branch_id, raise_on_error=False):
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                "CALL sp_open_account(%s, %s, %s, @new_account_id, @new_account_number)",
                (customer_id, account_type_id, branch_id),
            )
            cursor.execute(
                "SELECT @new_account_id AS account_id, @new_account_number AS account_number"
            )
            row = cursor.fetchone()
            account_id = row["account_id"] if row else None
            account_number = row["account_number"] if row else None
            if account_id is None:
                raise MySQLError(msg="Stored procedure did not return a new account ID")
            print(f"Account opened successfully!")
            print(f"  Account ID   : {account_id}")
            print(f"  Account Number: {account_number}")
            return account_id

    except MySQLError as e:
        logger.error("Could not open account: %s", e)
        if raise_on_error:
            raise
        return None


def close_account(account_id, raise_on_error=False):
    try:
        with get_db() as (conn, cursor):
            cursor.callproc("sp_close_account", (account_id,))
            print(f"Account {account_id} has been closed successfully.")
            return True

    except MySQLError as e:
        logger.error("Could not close account %s: %s", account_id, e)
        if raise_on_error:
            raise
        return False

def deposit(account_id, amount, raise_on_error=False):
    if amount <= 0:
        print("[ERROR] Deposit amount must be greater than zero.")
        return False

    try:
        with get_db() as (conn, cursor):
            cursor.callproc("sp_deposit", (account_id, amount))
            print(f"Deposit of ${amount:.2f} to account {account_id} completed successfully.")
            return True

    except MySQLError as e:
        logger.error("Deposit failed for account %s: %s", account_id, e)
        if raise_on_error:
            raise
        return False


def withdraw(account_id, amount, raise_on_error=False):
    if amount <= 0:
        print("[ERROR] Withdrawal amount must be greater than zero.")
        return False

    try:
        with get_db() as (conn, cursor):
            cursor.callproc("sp_withdraw", (account_id, amount))
            print(f"Withdrawal of ${amount:.2f} from account {account_id} completed successfully.")
            return True

    except MySQLError as e:
        logger.error("Withdrawal failed for account %s: %s", account_id, e)
        if raise_on_error:
            raise
        return False


def transfer(from_id, to_id, amount, raise_on_error=False):
    """
    Transfer money between accounts using the sp_transfer stored procedure.

    Returns True on success, False on failure.
    """
    if amount <= 0:
        print("[ERROR] Transfer amount must be greater than zero.")
        return False

    if from_id == to_id:
        print("[ERROR] Source and destination accounts must be different.")
        return False

    try:
        with get_db() as (conn, cursor):
            cursor.callproc("sp_transfer", (from_id, to_id, amount))
            print(
                f"Transfer of ${amount:.2f} from account {from_id} "
                f"to account {to_id} completed successfully."
            )
            return True

    except MySQLError as e:
        logger.error(
            "Transfer failed from account %s to account %s: %s",
            from_id,
            to_id,
            e,
        )
        if raise_on_error:
            raise
        return False


# ---------------------------------------------------------------------------
# Account Queries
# ---------------------------------------------------------------------------

def get_account_info(account_id):
    """
    Retrieve and display account details including customer name, type, and branch.

    Returns the account dict on success, or None if not found.
    """
    try:
        actor = get_current_actor()
        scope_sql = ""
        params = [account_id]
        if actor and is_branch_scoped_role(actor.get("role")):
            if actor.get("branch_id") is None:
                return None
            scope_sql = " AND a.BranchID = %s"
            params.append(actor["branch_id"])
        customer_table = "vw_customer_directory_masked" if actor and actor.get("role") == ROLE_AUDITOR else "Customers"
        with get_db() as (conn, cursor):
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
                + customer_table
                + """ c  ON a.CustomerID      = c.CustomerID
                JOIN AccountTypes at ON a.AccountTypeID  = at.AccountTypeID
                JOIN Branches    b  ON a.BranchID        = b.BranchID
                WHERE a.AccountID = %s"""
                + scope_sql,
                tuple(params),
            )
            account = cursor.fetchone()

            if not account:
                print(f"[INFO] No account found with ID {account_id}.")
                return None

            print("\n--- Account Information ---")
            print(f"  Account ID    : {account['account_id']}")
            print(f"  Account Number: {account['account_number']}")
            print(f"  Customer      : {account['customer_name']}")
            print(f"  Account Type  : {account['account_type']}")
            print(f"  Branch        : {account['branch_name']}")
            print(f"  Balance       : ${float(account['balance']):,.2f}")
            print(f"  Status        : {account['status']}")
            print(f"  Opened On     : {account['created_at']}")
            return account

    except MySQLError as e:
        logger.error("Could not retrieve account info for %s: %s", account_id, e)
        return None


def get_transaction_history(account_id, limit=10):
    try:
        actor = get_current_actor()
        scope_sql = ""
        params = [account_id]
        if actor and is_branch_scoped_role(actor.get("role")):
            if actor.get("branch_id") is None:
                return []
            scope_sql = " AND a.BranchID = %s"
            params.append(actor["branch_id"])
        params.append(limit)
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    t.TransactionID     AS transaction_id,
                    t.TransactionType   AS transaction_type,
                    t.Amount            AS amount,
                    t.TransactionDate   AS transaction_date,
                    t.Description       AS description,
                    t.ReferenceID       AS reference_id
                FROM Transactions t
                JOIN Accounts a ON a.AccountID = t.AccountID
                WHERE t.AccountID = %s"""
                + scope_sql
                + """
                ORDER BY t.TransactionDate DESC
                LIMIT %s
                """,
                tuple(params),
            )
            rows = cursor.fetchall()

            if not rows:
                print(f"[INFO] No transactions found for account {account_id}.")
                return []

            from tabulate import tabulate

            # Format numeric values for display
            table_data = []
            for r in rows:
                table_data.append([
                    r["transaction_id"],
                    r["transaction_type"],
                    f"${float(r['amount']):,.2f}",
                    r["description"] or "",
                    r["transaction_date"],
                ])

            headers = ["TX ID", "Type", "Amount", "Description", "Date"]
            print(f"\n--- Transaction History (Account {account_id}) ---")
            print(tabulate(table_data, headers=headers, tablefmt="grid"))
            return rows

    except MySQLError as e:
        logger.error("Could not retrieve transaction history for %s: %s", account_id, e)
        return []
