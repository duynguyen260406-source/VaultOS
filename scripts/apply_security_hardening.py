import os
import sys
from pathlib import Path
from typing import Iterable

BASE_DIR = Path(__file__).resolve().parents[1]
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from env_loader import load_project_env

load_project_env()

try:
    import mysql.connector
    from mysql.connector import Error as MySQLError
except ImportError as exc:
    raise RuntimeError("mysql-connector-python is required to apply DB hardening.") from exc

from bootstrap_security import apply_statements, build_config, build_statements

from security_context import build_context_signature


def _iter_sql_statements(sql_text: str) -> Iterable[str]:
    delimiter = ";"
    buffer: list[str] = []

    for raw_line in sql_text.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("--"):
            continue
        if stripped.upper().startswith("DELIMITER "):
            delimiter = stripped.split(None, 1)[1]
            continue

        buffer.append(raw_line)
        if stripped.endswith(delimiter):
            statement = "\n".join(buffer)
            statement = statement[: statement.rfind(delimiter)].strip()
            if statement:
                yield statement
            buffer = []

    if buffer:
        statement = "\n".join(buffer).strip()
        if statement:
            yield statement


def _execute_sql_file(cursor, path: Path) -> None:
    sql_text = path.read_text(encoding="utf-8")
    for statement in _iter_sql_statements(sql_text):
        cursor.execute(statement)


def _ensure_session_version(cursor, db_name: str) -> None:
    cursor.execute(
        """
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME = 'AppUsers'
          AND COLUMN_NAME = 'SessionVersion'
        """,
        (db_name,),
    )
    exists = cursor.fetchone()[0] > 0
    if not exists:
        cursor.execute(
            f"""
            ALTER TABLE `{db_name}`.AppUsers
            ADD COLUMN SessionVersion INT NOT NULL DEFAULT 0
            AFTER PasswordChangedAt
            """
        )


def _ensure_runtime_secrets(
    cursor,
    db_name: str,
    context_signing_key: str,
    auth_user: str,
    auth_host: str,
    admin_user: str,
    admin_host: str,
) -> None:
    cursor.execute(
        """
        SELECT COUNT(*) FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME = 'AppRuntimeSecrets'
        """,
        (db_name,),
    )
    exists = cursor.fetchone()[0] > 0
    if not exists:
        cursor.execute(
            f"""
            CREATE TABLE `{db_name}`.AppRuntimeSecrets (
                SecretName VARCHAR(64) PRIMARY KEY,
                SecretValue VARCHAR(255) NOT NULL,
                UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
            """
        )

    for secret_name, secret_value in (
        ("context_signing_key", context_signing_key),
        ("auth_db_user", auth_user),
        ("auth_db_host", auth_host),
        ("admin_db_user", admin_user),
        ("admin_db_host", admin_host),
    ):
        cursor.execute(
            f"""
            INSERT INTO `{db_name}`.AppRuntimeSecrets (SecretName, SecretValue)
            VALUES (%s, %s)
            ON DUPLICATE KEY UPDATE SecretValue = VALUES(SecretValue)
            """,
            (secret_name, secret_value),
        )


def _rehash_sensitive_indexes(
    cursor,
    encryption_key: str,
    hash_pepper: str,
    context_signing_key: str,
) -> None:
    context_signature = build_context_signature("system", "system", secret=context_signing_key)
    cursor.execute("SET @app_user_id = NULL")
    cursor.execute("SET @encryption_key = %s", (encryption_key,))
    cursor.execute("SET @hash_pepper = %s", (hash_pepper,))
    cursor.execute("SET @app_username = 'system'")
    cursor.execute("SET @app_role = 'system'")
    cursor.execute("SET @app_employee_id = NULL")
    cursor.execute("SET @app_branch_id = NULL")
    cursor.execute("SET @app_actor = 'system (migration)'")
    cursor.execute("SET @app_context_signature = %s", (context_signature,))

    cursor.execute(
        """
        UPDATE Customers
        SET IdentityHash = SHA2(
                CONCAT(
                    @hash_pepper,
                    '|',
                    TRIM(CAST(AES_DECRYPT(IdentityNumber, @encryption_key) AS CHAR(255)))
                ),
                256
            ),
            PhoneHash = SHA2(
                CONCAT(
                    @hash_pepper,
                    '|',
                    TRIM(CAST(AES_DECRYPT(Phone, @encryption_key) AS CHAR(255)))
                ),
                256
            )
        """
    )
    cursor.execute(
        """
        UPDATE Employees
        SET EmailHash = CASE
            WHEN Email IS NULL THEN NULL
            ELSE SHA2(
                CONCAT(
                    @hash_pepper,
                    '|',
                    LOWER(TRIM(CAST(AES_DECRYPT(Email, @encryption_key) AS CHAR(255))))
                ),
                256
            )
        END
        """
    )


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Apply runtime SQL hardening and security grants.")
    parser.add_argument(
        "--env",
        help="Environment profile name to load, for example 'dev' or 'prod'.",
    )
    parser.add_argument(
        "--env-file",
        help="Explicit env file path to load before executing.",
    )
    args = parser.parse_args()

    if args.env:
        os.environ["APP_ENV"] = args.env
    if args.env_file:
        os.environ["APP_ENV_FILE"] = args.env_file
    if args.env or args.env_file:
        load_project_env(override=True)

    db_name = os.getenv("DB_NAME", "banking_system")
    host = os.getenv("DB_ADMIN_HOST", os.getenv("DB_HOST", "localhost"))
    port = int(os.getenv("DB_ADMIN_PORT", os.getenv("DB_PORT", "3306")))
    user = os.getenv("DB_ADMIN_USER", os.getenv("DB_USER"))
    password = os.getenv("DB_ADMIN_PASSWORD", os.getenv("DB_PASSWORD", ""))
    encryption_key = os.getenv("DB_ENCRYPTION_KEY")
    hash_pepper = os.getenv("DB_HASH_PEPPER", encryption_key)
    context_signing_key = os.getenv("DB_CONTEXT_SIGNING_KEY", os.getenv("JWT_SECRET_KEY", encryption_key))
    auth_user = os.getenv("DB_AUTH_USER", "app_auth_user")
    auth_host = os.getenv("DB_AUTH_HOST", "localhost")

    if not encryption_key:
        print("[ERROR] Missing DB_ENCRYPTION_KEY", file=sys.stderr)
        return 1
    if not context_signing_key:
        print("[ERROR] Missing DB_CONTEXT_SIGNING_KEY/JWT_SECRET_KEY/DB_ENCRYPTION_KEY", file=sys.stderr)
        return 1
    if not user:
        print("[ERROR] Missing DB_ADMIN_USER or DB_USER", file=sys.stderr)
        return 1

    conn = None
    cursor = None
    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            autocommit=False,
        )
        cursor = conn.cursor()
        cursor.execute(f"USE `{db_name}`")

        _ensure_session_version(cursor, db_name)
        _ensure_runtime_secrets(cursor, db_name, context_signing_key, auth_user, auth_host, user, host)
        _execute_sql_file(cursor, BASE_DIR / "database" / "functions.sql")
        _execute_sql_file(cursor, BASE_DIR / "database" / "procedures.sql")
        _execute_sql_file(cursor, BASE_DIR / "database" / "triggers.sql")
        _rehash_sensitive_indexes(cursor, encryption_key, hash_pepper, context_signing_key)
        conn.commit()

        config = build_config()
        statements = build_statements(config)
        apply_statements(config, statements)
    except MySQLError as exc:
        if conn:
            conn.rollback()
        print(f"[ERROR] Failed to apply DB hardening: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        if conn:
            conn.rollback()
        print(f"[ERROR] Failed to apply DB hardening: {exc}", file=sys.stderr)
        return 1
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    print("[OK] Applied DB hardening, runtime SQL, and security grants.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
