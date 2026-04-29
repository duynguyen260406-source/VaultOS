"""
Tests for MySQL trigger behavior accessed through the API.

Triggers tested:
- trg_log_transaction: fires AFTER INSERT on Transactions → writes to AuditLog
- trg_suspicious_activity: fires when amount >= 50,000,000 VND → writes to SuspiciousActivity
- trg_customers_check_dob_ins: fires BEFORE INSERT on Customers → rejects future DOB

These are integration tests: they verify the trigger did not break the transaction flow.
The audit records are visible in MySQL (AuditLog, SuspiciousActivity tables) after each test.
"""

import pytest
import httpx

_OPEN_PAYLOAD = {"customer_id": 1, "account_type_id": 1, "branch_id": 1}


def _open(client: httpx.Client, cleanup: list) -> int:
    r = client.post("/accounts", json=_OPEN_PAYLOAD)
    assert r.status_code == 201
    aid = r.json()["account_id"]
    cleanup.append(aid)
    return aid


def _balance(client: httpx.Client, account_id: int) -> float:
    r = client.get(f"/accounts/{account_id}")
    assert r.status_code == 200
    return float(r.json()["balance"])


# ── trg_suspicious_activity threshold tests ────────────────────────────────────

def test_large_deposit_at_threshold_does_not_break_flow(client: httpx.Client, cleanup_accounts: list):
    """
    Deposit exactly 50,000,000 VND (the suspicious-activity threshold).
    trg_suspicious_activity fires and writes to SuspiciousActivity — but
    the transaction itself must still succeed (200 OK).
    """
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/deposit", json={"account_id": aid, "amount": 50_000_000})
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert _balance(client, aid) == 50_000_000.0


def test_very_large_deposit_above_threshold_does_not_break_flow(client: httpx.Client, cleanup_accounts: list):
    """
    Deposit 100,000,000 VND (well above the 50M threshold).
    trg_suspicious_activity fires — transaction must still succeed.
    """
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/deposit", json={"account_id": aid, "amount": 100_000_000})
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert _balance(client, aid) == 100_000_000.0


def test_normal_deposit_below_suspicious_threshold(client: httpx.Client, cleanup_accounts: list):
    """
    Deposit 1,000,000 VND (below 50M threshold).
    trg_suspicious_activity does NOT fire — transaction succeeds normally.
    """
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/deposit", json={"account_id": aid, "amount": 1_000_000})
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert _balance(client, aid) == 1_000_000.0


# ── trg_log_transaction: verify transaction history recorded ───────────────────

def test_deposit_recorded_in_transaction_history(client: httpx.Client, cleanup_accounts: list):
    """
    After a deposit, GET /accounts/{id}/transactions must return at least one
    Deposit record. This confirms trg_log_transaction did not abort the INSERT.
    """
    aid = _open(client, cleanup_accounts)
    client.post("/transactions/deposit", json={"account_id": aid, "amount": 500_000})

    r = client.get(f"/accounts/{aid}/transactions")
    assert r.status_code == 200
    txns = r.json()["transactions"]
    assert len(txns) >= 1
    types = {t["transaction_type"] for t in txns}
    assert "Deposit" in types, f"Expected 'Deposit' in transaction types, got: {types}"

    deposit = next(t for t in txns if t["transaction_type"] == "Deposit")
    assert float(deposit["amount"]) == 500_000.0


def test_withdrawal_recorded_in_transaction_history(client: httpx.Client, cleanup_accounts: list):
    """
    After deposit + withdrawal, both must appear in transaction history.
    Confirms trg_log_transaction fires for both inserts.
    """
    aid = _open(client, cleanup_accounts)
    client.post("/transactions/deposit", json={"account_id": aid, "amount": 2_000_000})
    client.post("/transactions/withdraw", json={"account_id": aid, "amount": 500_000})

    r = client.get(f"/accounts/{aid}/transactions")
    assert r.status_code == 200
    types = {t["transaction_type"] for t in r.json()["transactions"]}
    assert "Deposit" in types, f"Missing Deposit in {types}"
    assert "Withdrawal" in types, f"Missing Withdrawal in {types}"


def test_transfer_recorded_in_both_account_histories(client: httpx.Client, cleanup_accounts: list):
    """
    After a transfer, src account shows Transfer_Out and dst account shows Transfer_In.
    Confirms trg_log_transaction fires for both the debit and credit transaction inserts.
    """
    src = _open(client, cleanup_accounts)
    dst = _open(client, cleanup_accounts)
    client.post("/transactions/deposit", json={"account_id": src, "amount": 2_000_000})
    r = client.post("/transactions/transfer", json={
        "from_account_id": src,
        "to_account_id": dst,
        "amount": 500_000,
    })
    assert r.status_code == 200

    r_src = client.get(f"/accounts/{src}/transactions")
    assert r_src.status_code == 200
    src_types = {t["transaction_type"] for t in r_src.json()["transactions"]}
    assert "Transfer_Out" in src_types, f"Missing Transfer_Out in src history: {src_types}"

    r_dst = client.get(f"/accounts/{dst}/transactions")
    assert r_dst.status_code == 200
    dst_types = {t["transaction_type"] for t in r_dst.json()["transactions"]}
    assert "Transfer_In" in dst_types, f"Missing Transfer_In in dst history: {dst_types}"
