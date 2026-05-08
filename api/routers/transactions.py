import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from mysql.connector import Error as MySQLError

from approval_payloads import create_approval
from banking_ops import deposit, transfer, withdraw
from dependencies import db_error_to_http, require_teller_or_manager
from models.transactions import (
    DepositRequest,
    TransactionResponse,
    TransferRequest,
    WithdrawRequest,
)
from rule_lookup import get_approval_threshold

router = APIRouter()


def _approval_response_if_needed(request_type: str, payload: dict, amount, user: dict):
    threshold = get_approval_threshold()
    if amount >= threshold:
        approval_id = create_approval(request_type, payload, user["user_id"], user.get("branch_id"))
        return JSONResponse(
            status_code=202,
            content={
                "pending": True,
                "approval_id": approval_id,
                "message": (
                    f"Amount {float(amount):,.0f} VND meets or exceeds the approval threshold "
                    f"({float(threshold):,.0f} VND). Submitted for manager review."
                ),
            },
        )
    return None


@router.post("/deposit")
def api_deposit(req: DepositRequest, user=Depends(require_teller_or_manager)):
    pending = _approval_response_if_needed(
        "deposit",
        {"request_type": "deposit", "account_id": req.account_id, "amount": str(req.amount)},
        req.amount,
        user,
    )
    if pending:
        return pending
    try:
        txn_id = deposit(req.account_id, req.amount, raise_on_error=True, return_id=True)
    except MySQLError as e:
        raise db_error_to_http(e)
    if not txn_id:
        raise HTTPException(status_code=400, detail="Deposit failed.")
    return TransactionResponse(
        success=True,
        message=f"Deposited {float(req.amount):,.0f} VND to account {req.account_id}.",
        transaction_id=txn_id,
    )


@router.post("/withdraw")
def api_withdraw(req: WithdrawRequest, user=Depends(require_teller_or_manager)):
    pending = _approval_response_if_needed(
        "withdraw",
        {"request_type": "withdraw", "account_id": req.account_id, "amount": str(req.amount)},
        req.amount,
        user,
    )
    if pending:
        return pending
    try:
        txn_id = withdraw(req.account_id, req.amount, raise_on_error=True, return_id=True)
    except MySQLError as e:
        raise db_error_to_http(e)
    if not txn_id:
        raise HTTPException(status_code=400, detail="Withdrawal failed.")
    return TransactionResponse(
        success=True,
        message=f"Withdrew {float(req.amount):,.0f} VND from account {req.account_id}.",
        transaction_id=txn_id,
    )


@router.post("/transfer")
def api_transfer(req: TransferRequest, user=Depends(require_teller_or_manager)):
    pending = _approval_response_if_needed(
        "transfer",
        {
            "request_type": "transfer",
            "from_account_id": req.from_account_id,
            "to_account_id": req.to_account_id,
            "amount": str(req.amount),
        },
        req.amount,
        user,
    )
    if pending:
        return pending
    try:
        txn_id = transfer(req.from_account_id, req.to_account_id, req.amount, raise_on_error=True, return_id=True)
    except MySQLError as e:
        raise db_error_to_http(e)
    if not txn_id:
        raise HTTPException(status_code=400, detail="Transfer failed.")
    return TransactionResponse(
        success=True,
        message=f"Transferred {float(req.amount):,.0f} VND from account {req.from_account_id} to {req.to_account_id}.",
        transaction_id=txn_id,
    )
