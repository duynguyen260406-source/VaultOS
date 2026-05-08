"""
Shared infrastructure for scheduler scripts.

Usage in a script:
    from scheduler_jobs import bootstrap_system_actor, log, job_context

    with job_context("accrue_interest"):
        for account in accounts:
            try:
                run_for_account(account)
                log.info("accrued %s", account["id"])
            except Exception as exc:
                log.error("failed %s: %s", account["id"], exc)
"""

import logging
import os
import sys
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

_BASE = Path(__file__).resolve().parent.parent
for _p in (str(_BASE / "app"), str(_BASE / "api")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from security_context import set_current_actor, clear_current_actor

log = logging.getLogger("scheduler")

_SYSTEM_USERNAME = "system"
_SYSTEM_ROLE = "system"


def bootstrap_system_actor():
    """Set the thread-local actor to the system principal."""
    set_current_actor(_SYSTEM_USERNAME, _SYSTEM_ROLE)


def teardown_system_actor():
    clear_current_actor()


@contextmanager
def job_context(job_name: str, log_level: int = logging.INFO):
    """Context manager that sets up logging, system actor, and catches top-level exceptions."""
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    log.info("=== job '%s' started at %s ===", job_name, datetime.now().isoformat())
    bootstrap_system_actor()
    try:
        yield log
    except Exception as exc:
        log.error("job '%s' failed with unhandled exception: %s", job_name, exc, exc_info=True)
        sys.exit(1)
    finally:
        teardown_system_actor()
        log.info("=== job '%s' finished at %s ===", job_name, datetime.now().isoformat())
