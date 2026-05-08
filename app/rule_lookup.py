import logging
import time
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

_cache: dict = {}
_TTL = 60  # seconds


def get_rule_decimal(code: str, default: Decimal) -> Decimal:
    now = time.monotonic()
    entry = _cache.get(code)
    if entry and now - entry["ts"] < _TTL:
        return entry["value"]
    try:
        from db_connection import get_db
        with get_db() as (conn, cursor):
            cursor.execute(
                "SELECT CAST(JSON_UNQUOTE(Value) AS DECIMAL(18,2)) AS v "
                "FROM RuleSettings WHERE Code = %s AND Active = TRUE LIMIT 1",
                (code,),
            )
            row = cursor.fetchone()
            val = Decimal(str(row["v"])) if row and row["v"] is not None else default
    except Exception as e:
        logger.warning("rule_lookup failed for %s, using default: %s", code, e)
        val = default
    _cache[code] = {"value": val, "ts": now}
    return val


def invalidate(code: str) -> None:
    _cache.pop(code, None)


def get_approval_threshold() -> Decimal:
    return get_rule_decimal("approval_required_amount_vnd", Decimal("50000000"))
