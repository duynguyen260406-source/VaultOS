import getpass
import os
import sys
from datetime import datetime

from mysql.connector import Error as MySQLError
from tabulate import tabulate

from banking_ops import (
    close_account,
    deposit,
    get_account_info,
    get_transaction_history,
    open_account,
    transfer,
    withdraw,
)
from db_connection import get_db
from reports import (
    branch_activity_report,
    customer_balance_summary,
    daily_transaction_report,
)
from app_user_auth import AppUserAuthError, authenticate_app_user
from security_context import ROLE_AUDITOR, ROLE_MANAGER, ROLE_TELLER, set_current_actor


def clear_screen():
    """Clear the terminal screen."""
    os.system("cls" if os.name == "nt" else "clear")


def pause():
    """Pause and wait for the user to press Enter."""
    input("\nPress Enter to continue...")


def read_int(prompt):
    """Prompt the user for an integer. Returns the value or None on bad input."""
    try:
        return int(input(prompt))
    except ValueError:
        print("[ERROR] Please enter a valid integer.")
        return None


def read_float(prompt):
    """Prompt the user for a positive float. Returns the value or None on bad input."""
    try:
        value = float(input(prompt))
        if value < 0:
            print("[ERROR] Amount cannot be negative.")
            return None
        return value
    except ValueError:
        print("[ERROR] Please enter a valid number.")
        return None


def can_open_accounts(role):
    return role in {ROLE_MANAGER, ROLE_TELLER}


def can_close_accounts(role):
    return role == ROLE_MANAGER


def can_manage_transactions(role):
    return role in {ROLE_MANAGER, ROLE_TELLER}


def can_view_reports(role):
    return role in {ROLE_MANAGER, ROLE_AUDITOR}


def authenticate_user():
    """Prompt for AppUsers credentials and return the authenticated user."""
    while True:
        clear_screen()
        print("===== BANKING MANAGEMENT SYSTEM =====")
        print("Seeded sample users (if sample_data.sql was loaded):")
        print("  manager / manager123")
        print("  teller  / teller123")
        print("  auditor / auditor123")
        print()
        username = input("Username (or 'exit' to quit): ").strip()
        if username.lower() == "exit":
            sys.exit(0)
        password = getpass.getpass("Password: ")

        try:
            user = authenticate_app_user(username, password)
            set_current_actor(
                user["username"],
                user["role"],
                user_id=user["user_id"],
                employee_id=user.get("employee_id"),
                branch_id=user.get("branch_id"),
            )
            return {
                "username": user["username"],
                "role": user["role"],
                "user_id": user["user_id"],
                "employee_id": user.get("employee_id"),
                "branch_id": user.get("branch_id"),
            }
        except AppUserAuthError as exc:
            print(f"\n[ERROR] {exc.detail}.")
        pause()


def list_customers():
    """List all customers."""
    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    CustomerID   AS customer_id,
                    FirstName    AS first_name,
                    LastName     AS last_name,
                    CAST(AES_DECRYPT(Email, @encryption_key) AS CHAR(100)) AS email,
                    CAST(AES_DECRYPT(Phone, @encryption_key) AS CHAR(15)) AS phone
                FROM Customers
                ORDER BY CustomerID
                """
            )
            rows = cursor.fetchall()

            if not rows:
                print("\n  No customers found.\n")
                return

            table_data = [
                [r["customer_id"], r["first_name"], r["last_name"], r["email"], r["phone"]]
                for r in rows
            ]
            headers = ["ID", "First Name", "Last Name", "Email", "Phone"]
            print(f"\n--- Customer List ({len(rows)} customers) ---")
            print(tabulate(table_data, headers=headers, tablefmt="grid"))

    except MySQLError as e:
        print(f"[ERROR] Could not list customers: {e}")


def search_customer_by_id():
    """Search for a customer by their ID."""
    cid = read_int("Enter Customer ID: ")
    if cid is None:
        return

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                SELECT
                    CustomerID       AS customer_id,
                    FirstName        AS first_name,
                    LastName         AS last_name,
                    CAST(AES_DECRYPT(Email, @encryption_key) AS CHAR(100)) AS email,
                    CAST(AES_DECRYPT(Phone, @encryption_key) AS CHAR(15)) AS phone,
                    Address          AS address,
                    DateOfBirth      AS date_of_birth,
                    RegistrationDate AS created_at
                FROM Customers
                WHERE CustomerID = %s
                """,
                (cid,),
            )
            customer = cursor.fetchone()

            if not customer:
                print(f"\n  No customer found with ID {cid}.\n")
                return

            print("\n--- Customer Details ---")
            for key, value in customer.items():
                label = key.replace("_", " ").title()
                print(f"  {label:15s}: {value}")

    except MySQLError as e:
        print(f"[ERROR] Could not search customer: {e}")


def search_customer_by_name():
    """Search for customers by name (partial match)."""
    name = input("Enter name to search: ").strip()
    if not name:
        print("[ERROR] Please enter a name to search.")
        return

    try:
        with get_db() as (conn, cursor):
            pattern = f"%{name}%"
            cursor.execute(
                """
                SELECT
                    CustomerID  AS customer_id,
                    FirstName   AS first_name,
                    LastName    AS last_name,
                    CAST(AES_DECRYPT(Email, @encryption_key) AS CHAR(100)) AS email,
                    CAST(AES_DECRYPT(Phone, @encryption_key) AS CHAR(15)) AS phone
                FROM Customers
                WHERE FirstName LIKE %s OR LastName LIKE %s
                ORDER BY LastName, FirstName
                """,
                (pattern, pattern),
            )
            rows = cursor.fetchall()

            if not rows:
                print(f"\n  No customers found matching '{name}'.\n")
                return

            table_data = [
                [r["customer_id"], r["first_name"], r["last_name"], r["email"], r["phone"]]
                for r in rows
            ]
            headers = ["ID", "First Name", "Last Name", "Email", "Phone"]
            print(f"\n--- Search Results ({len(rows)} matches) ---")
            print(tabulate(table_data, headers=headers, tablefmt="grid"))

    except MySQLError as e:
        print(f"[ERROR] Could not search customers: {e}")


def customer_management_menu():
    """Sub-menu for customer management."""
    while True:
        clear_screen()
        print("===== CUSTOMER MANAGEMENT =====")
        print("1. List All Customers")
        print("2. Search Customer by ID")
        print("3. Search Customer by Name")
        print("4. Back to Main Menu")
        print()

        choice = input("Select an option: ").strip()

        if choice == "1":
            list_customers()
            pause()
        elif choice == "2":
            search_customer_by_id()
            pause()
        elif choice == "3":
            search_customer_by_name()
            pause()
        elif choice == "4":
            break
        else:
            print("[ERROR] Invalid option. Please try again.")
            pause()


def menu_open_account():
    """Prompt user to open a new account."""
    print("\n--- Open New Account ---")
    customer_id = read_int("Customer ID    : ")
    if customer_id is None:
        return
    account_type_id = read_int("Account Type ID: ")
    if account_type_id is None:
        return
    branch_id = read_int("Branch ID      : ")
    if branch_id is None:
        return

    open_account(customer_id, account_type_id, branch_id)


def menu_close_account():
    """Prompt user to close an account."""
    print("\n--- Close Account ---")
    account_id = read_int("Account ID: ")
    if account_id is None:
        return

    close_account(account_id)


def menu_view_account_info():
    """Prompt user to view account information."""
    account_id = read_int("Account ID: ")
    if account_id is None:
        return

    get_account_info(account_id)


def menu_view_transaction_history():
    """Prompt user to view transaction history."""
    account_id = read_int("Account ID: ")
    if account_id is None:
        return

    limit_str = input("Number of recent transactions (default 10): ").strip()
    limit = 10
    if limit_str:
        try:
            limit = int(limit_str)
            if limit <= 0:
                print("[ERROR] Limit must be a positive number. Using default of 10.")
                limit = 10
        except ValueError:
            print("[ERROR] Invalid number. Using default of 10.")

    get_transaction_history(account_id, limit)


def account_management_menu(role):
    """Sub-menu for account management."""
    actions = []
    if can_open_accounts(role):
        actions.append(("Open Account", menu_open_account))
    if can_close_accounts(role):
        actions.append(("Close Account", menu_close_account))
    actions.extend(
        [
            ("View Account Info", menu_view_account_info),
            ("View Transaction History", menu_view_transaction_history),
        ]
    )

    while True:
        clear_screen()
        print("===== ACCOUNT MANAGEMENT =====")
        for idx, (label, _) in enumerate(actions, start=1):
            print(f"{idx}. {label}")
        back_option = len(actions) + 1
        print(f"{back_option}. Back to Main Menu")
        print()

        choice = input("Select an option: ").strip()
        if choice.isdigit():
            index = int(choice)
            if 1 <= index <= len(actions):
                actions[index - 1][1]()
                pause()
                continue
            if index == back_option:
                break

        print("[ERROR] Invalid option. Please try again.")
        pause()


def menu_deposit():
    """Prompt user to make a deposit."""
    print("\n--- Deposit ---")
    account_id = read_int("Account ID: ")
    if account_id is None:
        return

    amount = read_float("Amount: $")
    if amount is None:
        return
    if amount <= 0:
        print("[ERROR] Deposit amount must be greater than zero.")
        return

    deposit(account_id, amount)


def menu_withdraw():
    """Prompt user to make a withdrawal."""
    print("\n--- Withdrawal ---")
    account_id = read_int("Account ID: ")
    if account_id is None:
        return

    amount = read_float("Amount: $")
    if amount is None:
        return
    if amount <= 0:
        print("[ERROR] Withdrawal amount must be greater than zero.")
        return

    withdraw(account_id, amount)


def menu_transfer():
    """Prompt user to make a transfer."""
    print("\n--- Transfer ---")
    from_id = read_int("From Account ID: ")
    if from_id is None:
        return

    to_id = read_int("To Account ID  : ")
    if to_id is None:
        return

    amount = read_float("Amount: $")
    if amount is None:
        return
    if amount <= 0:
        print("[ERROR] Transfer amount must be greater than zero.")
        return

    transfer(from_id, to_id, amount)


def transactions_menu():
    """Sub-menu for transactions."""
    while True:
        clear_screen()
        print("===== TRANSACTIONS =====")
        print("1. Deposit")
        print("2. Withdraw")
        print("3. Transfer")
        print("4. Back to Main Menu")
        print()

        choice = input("Select an option: ").strip()

        if choice == "1":
            menu_deposit()
            pause()
        elif choice == "2":
            menu_withdraw()
            pause()
        elif choice == "3":
            menu_transfer()
            pause()
        elif choice == "4":
            break
        else:
            print("[ERROR] Invalid option. Please try again.")
            pause()


def menu_daily_transactions():
    """Prompt user for a date and show the daily transaction report."""
    date_str = input("Enter date (YYYY-MM-DD) or press Enter for today: ").strip()
    report_date = None
    if date_str:
        try:
            report_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            print("[ERROR] Invalid date format. Please use YYYY-MM-DD.")
            return

    daily_transaction_report(report_date)


def reports_menu():
    """Sub-menu for reports."""
    while True:
        clear_screen()
        print("===== REPORTS =====")
        print("1. Daily Transaction Report")
        print("2. Customer Balance Summary")
        print("3. Branch Activity Report")
        print("4. Back to Main Menu")
        print()

        choice = input("Select an option: ").strip()

        if choice == "1":
            menu_daily_transactions()
            pause()
        elif choice == "2":
            customer_balance_summary()
            pause()
        elif choice == "3":
            branch_activity_report()
            pause()
        elif choice == "4":
            break
        else:
            print("[ERROR] Invalid option. Please try again.")
            pause()


def main_menu(current_user):
    """Display the main menu and route to sub-menus."""
    role = current_user["role"]
    username = current_user["username"]

    modules = []
    if role in {ROLE_MANAGER, ROLE_TELLER}:
        modules.append(("Customer Management", customer_management_menu))
    modules.append(("Account Management", lambda: account_management_menu(role)))
    if can_manage_transactions(role):
        modules.append(("Transactions", transactions_menu))
    if can_view_reports(role):
        modules.append(("Reports", reports_menu))

    while True:
        clear_screen()
        print("===== BANKING MANAGEMENT SYSTEM =====")
        print(f"Logged in as: {username} ({role})")
        print()
        for idx, (label, _) in enumerate(modules, start=1):
            print(f"{idx}. {label}")
        exit_option = len(modules) + 1
        print(f"{exit_option}. Exit")
        print()

        choice = input("Select an option: ").strip()
        if choice.isdigit():
            index = int(choice)
            if 1 <= index <= len(modules):
                modules[index - 1][1]()
                continue
            if index == exit_option:
                print("\nThank you for using the Banking Management System. Goodbye!")
                sys.exit(0)

        print("[ERROR] Invalid option. Please try again.")
        pause()


if __name__ == "__main__":
    user = authenticate_user()
    main_menu(user)
