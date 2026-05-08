import argparse
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parents[1]
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from env_loader import load_project_env

load_project_env()

ROLE_DEFINITIONS = {
    "manager": "role_manager",
    "teller": "role_teller",
    "auditor": "role_auditor",
    "backup": "role_backup",
}
SIMPLE_IDENTIFIER = re.compile(r"^[A-Za-z0-9_]+$")


def get_env(name: str, default: Optional[str] = None, required: bool = False) -> Optional[str]:
    value = os.getenv(name, default)
    if required and (value is None or value == ""):
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def assert_identifier(name: str, value: str) -> str:
    if not SIMPLE_IDENTIFIER.match(value):
        raise ValueError(f"{name} must contain only letters, numbers, and underscores")
    return value


def sql_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def sql_string(value: str) -> str:
    return f"'{sql_escape(value)}'"


def account_literal(user: str, host: str) -> str:
    return f"{sql_string(user)}@{sql_string(host)}"


def build_config() -> Dict[str, object]:
    db_name = assert_identifier("DB_NAME", get_env("DB_NAME", "banking_system", required=True))
    host = get_env("DB_ADMIN_HOST", get_env("DB_HOST", "localhost", required=True), required=True)
    port = int(get_env("DB_ADMIN_PORT", get_env("DB_PORT", "3306", required=True), required=True))
    admin_user = get_env("DB_ADMIN_USER", get_env("DB_USER"), required=True)
    admin_password = get_env("DB_ADMIN_PASSWORD", os.getenv("DB_PASSWORD", ""))

    accounts = []
    for key, role_name in ROLE_DEFINITIONS.items():
        prefix = f"DB_{key.upper()}"
        accounts.append(
            {
                "role": role_name,
                "user": get_env(f"{prefix}_USER", f"{key}_user", required=True),
                "password": get_env(f"{prefix}_PASSWORD", required=True),
                "host": get_env(f"{prefix}_HOST", "localhost", required=True),
            }
        )

    auth_account = {
        "user": get_env("DB_AUTH_USER", "app_auth_user", required=True),
        "password": get_env("DB_AUTH_PASSWORD", required=True),
        "host": get_env("DB_AUTH_HOST", "localhost", required=True),
    }

    backup_account = {
        "user": get_env("DB_BACKUP_USER", "backup_user", required=True),
        "password": get_env("DB_BACKUP_PASSWORD", required=True),
        "host": get_env("DB_BACKUP_HOST", "localhost", required=True),
    }

    return {
        "db_name": db_name,
        "host": host,
        "port": port,
        "admin_user": admin_user,
        "admin_password": admin_password,
        "accounts": [account for account in accounts if account["role"] != "role_backup"],
        "auth_account": auth_account,
        "backup_account": backup_account,
    }


def build_statements(config: Dict[str, object]) -> List[str]:
    db_name = config["db_name"]
    statements = [
        f"USE `{db_name}`;",
        "DROP ROLE IF EXISTS 'role_manager', 'role_teller', 'role_auditor', 'role_backup';",
        "CREATE ROLE 'role_manager';",
        f"GRANT SELECT, INSERT, UPDATE ON `{db_name}`.Branches TO 'role_manager';",
        f"GRANT SELECT, INSERT, UPDATE ON `{db_name}`.Employees TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.Customers TO 'role_manager';",
        f"GRANT SELECT, INSERT, UPDATE ON `{db_name}`.AppUsers TO 'role_manager';",
        f"GRANT SELECT, INSERT, UPDATE ON `{db_name}`.AccountTypes TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.Accounts TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.Transactions TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.Loans TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.AuditLog TO 'role_manager';",
        f"GRANT SELECT, UPDATE ON `{db_name}`.SuspiciousActivity TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.vw_customer_balances TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.vw_transaction_summary TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.vw_branch_overview TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.vw_customer_directory_masked TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.vw_customer_details_masked TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.vw_employee_directory_masked TO 'role_manager';",
        f"GRANT SELECT ON `{db_name}`.vw_employee_details_masked TO 'role_manager';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_create_customer TO 'role_manager';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_open_account TO 'role_manager';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_close_account TO 'role_manager';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_deposit TO 'role_manager';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_withdraw TO 'role_manager';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_transfer TO 'role_manager';",
        f"GRANT SELECT, INSERT, UPDATE ON `{db_name}`.RuleSettings TO 'role_manager';",
        f"GRANT EXECUTE ON FUNCTION `{db_name}`.fn_rule_value TO 'role_manager';",
        "CREATE ROLE 'role_teller';",
        f"GRANT SELECT ON `{db_name}`.Customers TO 'role_teller';",
        f"GRANT SELECT ON `{db_name}`.Branches TO 'role_teller';",
        f"GRANT SELECT ON `{db_name}`.AccountTypes TO 'role_teller';",
        f"GRANT SELECT ON `{db_name}`.Accounts TO 'role_teller';",
        f"GRANT SELECT ON `{db_name}`.Transactions TO 'role_teller';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_create_customer TO 'role_teller';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_open_account TO 'role_teller';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_deposit TO 'role_teller';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_withdraw TO 'role_teller';",
        f"GRANT EXECUTE ON PROCEDURE `{db_name}`.sp_transfer TO 'role_teller';",
        f"GRANT SELECT ON `{db_name}`.RuleSettings TO 'role_teller';",
        f"GRANT EXECUTE ON FUNCTION `{db_name}`.fn_rule_value TO 'role_teller';",
        "CREATE ROLE 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.Branches TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.AccountTypes TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.Accounts TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.Transactions TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.AuditLog TO 'role_auditor';",
        f"GRANT SELECT, UPDATE ON `{db_name}`.SuspiciousActivity TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.vw_customer_balances TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.vw_transaction_summary TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.vw_branch_overview TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.vw_customer_directory_masked TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.vw_customer_details_masked TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.vw_employee_directory_masked TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.vw_employee_details_masked TO 'role_auditor';",
        f"GRANT SELECT ON `{db_name}`.RuleSettings TO 'role_auditor';",
        f"GRANT EXECUTE ON FUNCTION `{db_name}`.fn_rule_value TO 'role_auditor';",
        "CREATE ROLE 'role_backup';",
        f"GRANT SELECT, SHOW VIEW, TRIGGER ON `{db_name}`.* TO 'role_backup';",
        f"GRANT LOCK TABLES, EVENT ON `{db_name}`.* TO 'role_backup';",
    ]

    for account in config["accounts"]:
        account_name = account_literal(account["user"], account["host"])
        statements.extend(
            [
                f"DROP USER IF EXISTS {account_name};",
                f"CREATE USER {account_name} IDENTIFIED BY {sql_string(account['password'])};",
                f"GRANT '{account['role']}' TO {account_name};",
                f"SET DEFAULT ROLE '{account['role']}' TO {account_name};",
            ]
        )

    auth_account = config["auth_account"]
    auth_account_name = account_literal(auth_account["user"], auth_account["host"])
    statements.extend(
        [
            f"DROP USER IF EXISTS {auth_account_name};",
            f"CREATE USER {auth_account_name} IDENTIFIED BY {sql_string(auth_account['password'])};",
            f"GRANT SELECT, UPDATE ON `{db_name}`.AppUsers TO {auth_account_name};",
            f"GRANT SELECT ON `{db_name}`.Employees TO {auth_account_name};",
        ]
    )

    backup_account = config["backup_account"]
    backup_account_name = account_literal(backup_account["user"], backup_account["host"])
    statements.extend(
        [
            f"DROP USER IF EXISTS {backup_account_name};",
            f"CREATE USER {backup_account_name} IDENTIFIED BY {sql_string(backup_account['password'])};",
            f"GRANT 'role_backup' TO {backup_account_name};",
            f"SET DEFAULT ROLE 'role_backup' TO {backup_account_name};",
        ]
    )

    statements.append("FLUSH PRIVILEGES;")
    return statements


def render_sql(statements: List[str]) -> str:
    return "\n\n".join(statements) + "\n"


def apply_statements(config: Dict[str, object], statements: List[str]) -> None:
    try:
        import mysql.connector
        from mysql.connector import Error as MySQLError
    except ImportError as exc:
        raise RuntimeError(
            "mysql-connector-python is required to apply security bootstrap statements."
        ) from exc

    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(
            host=config["host"],
            port=config["port"],
            user=config["admin_user"],
            password=config["admin_password"],
            autocommit=False,
        )
        cursor = conn.cursor()
        for statement in statements:
            cursor.execute(statement)
        conn.commit()
    except MySQLError as exc:
        if conn:
            conn.rollback()
        raise RuntimeError(f"Failed to bootstrap DB security: {exc}") from exc
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Bootstrap MySQL roles/users for the banking application from environment variables."
    )
    parser.add_argument(
        "--env",
        help="Environment profile name to load, for example 'dev' or 'prod'.",
    )
    parser.add_argument(
        "--env-file",
        help="Explicit env file path to load before executing.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Render the SQL without applying it.",
    )
    parser.add_argument(
        "--write-sql",
        help="Write the rendered SQL to a file for review before applying.",
    )
    args = parser.parse_args()

    if args.env:
        os.environ["APP_ENV"] = args.env
    if args.env_file:
        os.environ["APP_ENV_FILE"] = args.env_file
    if args.env or args.env_file:
        load_project_env(override=True)

    try:
        config = build_config()
        statements = build_statements(config)
        rendered_sql = render_sql(statements)
    except ValueError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    if args.write_sql:
        Path(args.write_sql).write_text(rendered_sql, encoding="utf-8")
        print(f"[OK] Rendered SQL written to {args.write_sql}")

    if args.dry_run:
        print(rendered_sql)
        return 0

    try:
        apply_statements(config, statements)
    except RuntimeError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1

    print("[OK] Roles and MySQL users were bootstrapped successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
