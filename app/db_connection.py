import logging
import os
from contextlib import contextmanager
from typing import Optional

from mysql.connector import Error as MySQLError
from mysql.connector.pooling import MySQLConnectionPool

from runtime_config import env_flag, require_env
from security_context import (
    build_actor_label,
    build_context_signature,
    get_current_actor,
    resolve_db_config,
)

logger = logging.getLogger(__name__)

DB_CONFIG = {
    "host": os.environ.get("DB_AUTH_HOST", os.environ.get("DB_HOST", "localhost")),
    "port": int(os.environ.get("DB_AUTH_PORT", os.environ.get("DB_PORT", 3306))),
    "user": os.environ.get("DB_AUTH_USER", os.environ.get("DB_USER", "root")),
    "password": os.environ.get("DB_AUTH_PASSWORD", os.environ.get("DB_PASSWORD", "")),
    "database": os.environ.get(
        "DB_AUTH_NAME",
        os.environ.get(
            "DB_AUTH_DATABASE",
            os.environ.get("DB_NAME", "banking_system"),
        ),
    ),
}
DB_ENCRYPTION_KEY = require_env("DB_ENCRYPTION_KEY")
DB_HASH_PEPPER = os.environ.get("DB_HASH_PEPPER", DB_ENCRYPTION_KEY)
DB_ENCRYPTION_KEY_VERSION = int(os.environ.get("DB_ENCRYPTION_KEY_VERSION", "1"))

_pools = {}


def _build_ssl_options() -> dict:
    ssl_options = {}
    require_tls = env_flag("DB_REQUIRE_TLS")
    if require_tls or env_flag("DB_SSL_ENABLED"):
        ssl_options["ssl_disabled"] = False
    if env_flag("DB_SSL_DISABLED"):
        ssl_options["ssl_disabled"] = True

    ssl_ca = os.environ.get("DB_SSL_CA")
    ssl_cert = os.environ.get("DB_SSL_CERT")
    ssl_key = os.environ.get("DB_SSL_KEY")
    if ssl_ca:
        ssl_options["ssl_ca"] = ssl_ca
    if ssl_cert:
        ssl_options["ssl_cert"] = ssl_cert
    if ssl_key:
        ssl_options["ssl_key"] = ssl_key
    if env_flag("DB_SSL_VERIFY_CERT"):
        ssl_options["ssl_verify_cert"] = True
    if env_flag("DB_SSL_VERIFY_IDENTITY"):
        ssl_options["ssl_verify_identity"] = True
    if require_tls and ssl_options.get("ssl_disabled"):
        raise RuntimeError("DB_REQUIRE_TLS is enabled but DB_SSL_DISABLED is also set")
    return ssl_options


def _get_pool(role: Optional[str] = None):
    pool_config, pool_key, _ = resolve_db_config(DB_CONFIG, role)
    pool_config.update(_build_ssl_options())
    if pool_key not in _pools:
        try:
            _pools[pool_key] = MySQLConnectionPool(
                pool_name=f"banking_pool_{pool_key}",
                pool_size=5,
                pool_reset_session=True,
                **pool_config,
            )
        except MySQLError as e:
            logger.error("Failed to create connection pool '%s': %s", pool_key, e)
            raise
    return _pools[pool_key]


def get_connection(role: Optional[str] = None):
    try:
        return _get_pool(role).get_connection()
    except MySQLError as e:
        logger.error("Failed to get connection from pool: %s", e)
        raise


@contextmanager
def get_db(use_current_actor_role: bool = True):
    conn = None
    cursor = None
    try:
        actor = get_current_actor()
        actor_role = actor["role"] if actor else None
        actor_username = actor["username"] if actor else None
        actor_user_id = actor["user_id"] if actor else None
        actor_employee_id = actor["employee_id"] if actor else None
        actor_branch_id = actor["branch_id"] if actor else None
        actor_label = build_actor_label(actor_username, actor_role)
        actor_signature = build_context_signature(
            actor_username,
            actor_role,
            user_id=actor_user_id,
            employee_id=actor_employee_id,
            branch_id=actor_branch_id,
        )
        selected_role = actor_role if use_current_actor_role else None

        conn = get_connection(selected_role)
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SET @app_user_id = %s", (actor_user_id,))
        cursor.execute("SET @app_username = %s", (actor_username,))
        cursor.execute("SET @app_role = %s", (actor_role,))
        cursor.execute("SET @app_employee_id = %s", (actor_employee_id,))
        cursor.execute("SET @app_branch_id = %s", (actor_branch_id,))
        cursor.execute("SET @app_actor = %s", (actor_label,))
        cursor.execute("SET @app_context_signature = %s", (actor_signature,))
        cursor.execute("SET @encryption_key = %s", (DB_ENCRYPTION_KEY,))
        cursor.execute("SET @hash_pepper = %s", (DB_HASH_PEPPER,))
        cursor.execute("SET @encryption_key_version = %s", (DB_ENCRYPTION_KEY_VERSION,))
        yield conn, cursor
        conn.commit()
    except MySQLError as e:
        if conn:
            conn.rollback()
        logger.error("Database error: %s", e)
        raise
    except Exception:
        if conn:
            conn.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
