import json
import logging
from decimal import Decimal

from mysql.connector import Error as MySQLError

logger = logging.getLogger(__name__)


def create_approval(request_type: str, payload: dict, user_id: int, branch_id=None) -> int:
    from db_connection import get_db
    with get_db() as (conn, cursor):
        cursor.execute(
            "INSERT INTO PendingApprovals (RequestType, Payload, RequestedByUserID, BranchID, Status) "
            "VALUES (%s, %s, %s, %s, 'pending')",
            (request_type, json.dumps(payload), user_id, branch_id),
        )
        cursor.execute("SELECT LAST_INSERT_ID() AS id")
        row = cursor.fetchone()
        return int(row["id"])


def apply_payload(approval_id: int) -> tuple[bool, str]:
    """Execute the banking operation for an approved PendingApprovals record.

    Returns (success, message). On failure the record is marked 'failed'.
    """
    from db_connection import get_db
    from banking_ops import deposit, withdraw, transfer, close_account

    with get_db() as (conn, cursor):
        cursor.execute(
            "SELECT ApprovalID, RequestType, Payload, Status FROM PendingApprovals "
            "WHERE ApprovalID = %s",
            (approval_id,),
        )
        row = cursor.fetchone()

    if not row:
        raise ValueError(f"Approval {approval_id} not found")
    if row["Status"] != "approved":
        raise ValueError(f"Approval {approval_id} is not in approved state (current: {row['Status']})")

    payload = row["Payload"] if isinstance(row["Payload"], dict) else json.loads(row["Payload"])
    request_type = payload.get("request_type")

    try:
        if request_type == "deposit":
            deposit(payload["account_id"], Decimal(str(payload["amount"])), raise_on_error=True)
        elif request_type == "withdraw":
            withdraw(payload["account_id"], Decimal(str(payload["amount"])), raise_on_error=True)
        elif request_type == "transfer":
            transfer(
                payload["from_account_id"],
                payload["to_account_id"],
                Decimal(str(payload["amount"])),
                raise_on_error=True,
            )
        elif request_type == "close_account":
            close_account(payload["account_id"], raise_on_error=True)
        else:
            raise ValueError(f"Unknown request_type: {request_type}")

        with get_db() as (conn, cursor):
            cursor.execute(
                "UPDATE PendingApprovals SET Status='executed', ExecutedAt=NOW(), ExecutionError=NULL "
                "WHERE ApprovalID=%s",
                (approval_id,),
            )
        return True, "Transaction executed successfully."

    except (MySQLError, ValueError, Exception) as e:
        error_msg = str(e)[:500]
        logger.error("apply_payload failed for approval %s: %s", approval_id, error_msg)
        with get_db() as (conn, cursor):
            cursor.execute(
                "UPDATE PendingApprovals SET Status='failed', ExecutedAt=NOW(), ExecutionError=%s "
                "WHERE ApprovalID=%s",
                (error_msg, approval_id),
            )
        return False, error_msg
