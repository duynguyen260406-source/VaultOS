#!/usr/bin/env python3
"""Daily snapshot of account closing balances for point-in-time reconstruction."""

import argparse
import sys
import os
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

from scheduler_jobs import job_context
from db_connection import get_db


def snapshot_for_date(target_date: date, dry_run: bool = False):
    date_str = target_date.isoformat()
    with get_db() as (conn, cursor):
        cursor.execute(
            """
            SELECT
                a.AccountID,
                COALESCE(
                    (
                        SELECT SUM(
                            CASE
                                WHEN t.TransactionType IN ('Deposit','Transfer_In','InterestCredit') THEN t.Amount
                                ELSE -t.Amount
                            END
                        )
                        FROM Transactions t
                        WHERE t.AccountID = a.AccountID
                          AND DATE(t.TransactionDate) <= %s
                    ),
                    0
                ) AS closing_balance
            FROM Accounts a
            WHERE a.OpenDate <= %s
              AND (a.Status != 'Closed' OR a.UpdatedAt >= %s)
            """,
            (date_str, date_str, date_str),
        )
        rows = cursor.fetchall()

        inserted = 0
        for row in rows:
            if dry_run:
                inserted += 1
                continue
            cursor.execute(
                """
                INSERT INTO AccountBalanceSnapshots (SnapshotDate, AccountID, ClosingBalance)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE ClosingBalance = VALUES(ClosingBalance), ComputedAt = NOW()
                """,
                (date_str, row["AccountID"], float(row["closing_balance"])),
            )
            inserted += 1

    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", default=str(date.today() - timedelta(days=1)), help="YYYY-MM-DD")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--backfill-from", help="Backfill from YYYY-MM-DD to yesterday")
    args = parser.parse_args()

    with job_context("snapshot_balances"):
        if args.backfill_from:
            start = date.fromisoformat(args.backfill_from)
            end = date.today() - timedelta(days=1)
            current = start
            total = 0
            while current <= end:
                n = snapshot_for_date(current, args.dry_run)
                print(f"  {current}: {n} accounts", flush=True)
                total += n
                current += timedelta(days=1)
            print(f"Backfill complete: {total} snapshots", flush=True)
        else:
            target = date.fromisoformat(args.date)
            n = snapshot_for_date(target, args.dry_run)
            print(f"Snapshotted {n} accounts for {target}" + (" [dry-run]" if args.dry_run else ""), flush=True)


if __name__ == "__main__":
    main()
