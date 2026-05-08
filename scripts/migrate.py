import argparse
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
APP_DIR = BASE_DIR / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from env_loader import load_project_env


def _split_sql(sql: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_string = False
    quote = ""
    escape = False
    chars = sql
    i = 0
    n = len(chars)

    while i < n:
        ch = chars[i]
        if escape:
            current.append(ch)
            escape = False
            i += 1
            continue
        if ch == "\\" and in_string:
            current.append(ch)
            escape = True
            i += 1
            continue
        if in_string:
            current.append(ch)
            if ch == quote:
                in_string = False
            i += 1
            continue
        if ch == "-" and i + 1 < n and chars[i + 1] == "-":
            while i < n and chars[i] != "\n":
                i += 1
            continue
        if ch in {"'", '"', "`"}:
            in_string = True
            quote = ch
            current.append(ch)
            i += 1
            continue
        if ch == ";":
            stmt = "".join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1

    tail = "".join(current).strip()
    if tail:
        statements.append(tail)

    result = []
    for stmt in statements:
        lines = stmt.splitlines()
        while lines and lines[0].strip().startswith("--"):
            lines.pop(0)
        cleaned = "\n".join(lines).strip()
        if cleaned:
            result.append(cleaned)
    return result


def _connect():
    try:
        import mysql.connector
    except ImportError as exc:
        raise RuntimeError("mysql-connector-python is required to run migrations") from exc

    return mysql.connector.connect(
        host=os.getenv("DB_ADMIN_HOST", os.getenv("DB_HOST", "localhost")),
        port=int(os.getenv("DB_ADMIN_PORT", os.getenv("DB_PORT", "3306"))),
        user=os.getenv("DB_ADMIN_USER", os.getenv("DB_USER")),
        password=os.getenv("DB_ADMIN_PASSWORD", os.getenv("DB_PASSWORD", "")),
        database=os.getenv("DB_NAME", "banking_system"),
        autocommit=False,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply ordered SQL migrations.")
    parser.add_argument("--env", help="Environment profile, for example dev or prod.")
    parser.add_argument("--env-file", help="Explicit environment file.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.env:
        os.environ["APP_ENV"] = args.env
    if args.env_file:
        os.environ["APP_ENV_FILE"] = args.env_file
    load_project_env(override=True)

    migrations_dir = BASE_DIR / "database" / "migrations"
    files = sorted(path for path in migrations_dir.glob("*.sql") if path.is_file())
    if not files:
        print("[OK] No migrations found.")
        return 0

    if args.dry_run:
        for path in files:
            print(path.name)
        return 0

    conn = _connect()
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS SchemaMigrations (
                Version VARCHAR(255) PRIMARY KEY,
                AppliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
            """
        )
        cursor.execute("SELECT Version FROM SchemaMigrations")
        applied = {row[0] for row in cursor.fetchall()}

        for path in files:
            if path.name in applied:
                continue
            sql = path.read_text(encoding="utf-8")
            print(f"[INFO] Applying {path.name}")
            for statement in _split_sql(sql):
                cursor.execute(statement)
            cursor.execute("INSERT INTO SchemaMigrations (Version) VALUES (%s)", (path.name,))
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()

    print("[OK] Database migrations are up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

