import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "app"))

from fastapi import APIRouter, Depends, HTTPException
from mysql.connector import Error as MySQLError

from banking_ops import deposit, transfer, withdraw
from dependencies import db_error_to_http, require_teller_or_manager
from models.transactions import (
    DepositRequest,
    TransactionResponse,
    TransferRequest,
    WithdrawRequest,
)

router = APIRouter()


@router.post("/deposit", response_model=TransactionResponse)
def api_deposit(req: DepositRequest, _=Depends(require_teller_or_manager)):
    try:
        success = deposit(req.account_id, req.amount, raise_on_error=True)
    except MySQLError as e:
        raise db_error_to_http(e)
    if not success:
        raise HTTPException(status_code=400, detail="Deposit failed.")
    return TransactionResponse(success=True, message=f"Deposited {req.amount:.2f} to account {req.account_id}.")


@router.post("/withdraw", response_model=TransactionResponse)
def api_withdraw(req: WithdrawRequest, _=Depends(require_teller_or_manager)):
    try:
        success = withdraw(req.account_id, req.amount, raise_on_error=True)
    except MySQLError as e:
        raise db_error_to_http(e)
    if not success:
        raise HTTPException(status_code=400, detail="Withdrawal failed.")
    return TransactionResponse(success=True, message=f"Withdrew {req.amount:.2f} from account {req.account_id}.")


@router.post("/transfer", response_model=TransactionResponse)
def api_transfer(req: TransferRequest, _=Depends(require_teller_or_manager)):
    try:
        success = transfer(req.from_account_id, req.to_account_id, req.amount, raise_on_error=True)
    except MySQLError as e:
        raise db_error_to_http(e)
    if not success:
        raise HTTPException(status_code=400, detail="Transfer failed.")
    return TransactionResponse(
        success=True,
        message=f"Transferred {req.amount:.2f} from account {req.from_account_id} to {req.to_account_id}.",
    )
