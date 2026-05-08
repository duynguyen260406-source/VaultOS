#!/usr/bin/env python3
"""
Daily interest accrual job.

Run once per day (e.g. via cron or task scheduler):
    python scripts/accrue_interest.py

Options:
    --dry-run   Print eligible accounts without writing to DB.
    --date YYYY-MM-DD  Process as if today is DATE (for backfill/testing).
"""

import argparse
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from datetime import date, datetime

_BASE = Path(__file__).resolve().parent.parent
for _p in (_BASE / "app", _BASE / "api"):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

from env_loader import load_project_env
load_project_env()

from scheduler_jobs import job_context, log
from db_connection import get_db

_ELIGIBLE_SQL = """
    SELECT
        a.AccountID       AS account_id,
        a.AccountNumber   AS account_number,
        a.Balance         AS balance,
        a.LastInterestAccruedDate AS last_accrued,
        at.InterestRate   AS interest_rate
    FROM Accounts a
    JOIN AccountTypes at ON a.AccountTypeID = at.AccountTypeID
    WHERE at.AccruesInterest = 1
      AND at.InterestRate IS NOT NULL
      AND at.InterestRate > 0
      AND a.Status = 'Active'
      AND a.Balance > 0
      AND (a.LastInterestAccruedDate IS NULL OR a.LastInterestAccruedDate < %s)
    ORDER BY a.AccountID
"""


def _accrue_one(account: dict, as_of: date, dry_run: bool) -> bool:
    balance = Decimal(str(account["balance"]))
    rate = Decimal(str(account["interest_rate"]))
    daily_rate = rate / Decimal("365")
    interest = (balance * daily_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    if interest <= 0:
        return False

    if dry_run:
        log.info("[DRY-RUN] account %s balance=%s rate=%.4f%% interest=%s",
                 account["account_number"], balance, float(rate) * 100, interest)
        return True

    try:
        with get_db() as (conn, cursor):
            cursor.execute(
                """
                INSERT INTO Transactions (AccountID, TransactionType, Amount, Description)
                VALUES (%s, 'InterestCredit', %s, %s)
                """,
                (
                    account["account_id"],
                    float(interest),
                    f"Daily interest credit @ {float(rate)*100:.4f}% p.a.",
                ),
            )
            cursor.execute(
                """
                UPDATE Accounts
                SET Balance = Balance + %s,
                    LastInterestAccruedDate = %s
                WHERE AccountID = %s
                """,
                (float(interest), as_of.isoformat(), account["account_id"]),
            )
        log.info("account %s: credited %s interest", account["account_number"], interest)
        return True
    except Exception as exc:
        log.error("account %s: accrual failed — %s", account["account_number"], exc)
        return False


def main():
    parser = argparse.ArgumentParser(description="Accrue daily interest on eligible accounts")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--date", help="Override today's date (YYYY-MM-DD)")
    args = parser.parse_args()

    as_of = date.fromisoformat(args.date) if args.date else date.today()

    with job_context("accrue_interest") as logger:
        try:
            with get_db() as (conn, cursor):
                cursor.execute(_ELIGIBLE_SQL, (as_of.isoformat(),))
                accounts = cursor.fetchall()
        except Exception as exc:
            logger.error("Failed to query eligible accounts: %s", exc)
            sys.exit(1)

        logger.info("Found %d eligible account(s) for %s%s",
                    len(accounts), as_of, " [DRY-RUN]" if args.dry_run else "")

        ok = failed = skipped = 0
        for acc in accounts:
            result = _accrue_one(acc, as_of, args.dry_run)
            if result:
                ok += 1
            else:
                failed += 1

        logger.info("Done — credited: %d, skipped: %d, failed: %d", ok, skipped, failed)


if __name__ == "__main__":
    main()
