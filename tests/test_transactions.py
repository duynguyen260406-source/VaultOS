"""Tests for /transactions endpoints."""

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


# ── Deposit ────────────────────────────────────────────────────────────────────

def test_deposit_increases_balance(client: httpx.Client, cleanup_accounts: list):
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/deposit", json={"account_id": aid, "amount": 500000})
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert _balance(client, aid) == 500000.0


def test_deposit_zero_amount_rejected(client: httpx.Client, cleanup_accounts: list):
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/deposit", json={"account_id": aid, "amount": 0})
    # Pydantic field_validator rejects at 422, or stored proc at 400
    assert r.status_code in (400, 422)


def test_deposit_negative_amount_rejected(client: httpx.Client, cleanup_accounts: list):
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/deposit", json={"account_id": aid, "amount": -1000})
    assert r.status_code in (400, 422)


def test_deposit_nonexistent_account(client: httpx.Client):
    r = client.post("/transactions/deposit", json={"account_id": 999999, "amount": 1000})
    assert r.status_code in (400, 404)


# ── Withdraw ───────────────────────────────────────────────────────────────────

def test_withdraw_decreases_balance(client: httpx.Client, cleanup_accounts: list):
    aid = _open(client, cleanup_accounts)
    client.post("/transactions/deposit", json={"account_id": aid, "amount": 1000000})
    r = client.post("/transactions/withdraw", json={"account_id": aid, "amount": 400000})
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert _balance(client, aid) == 600000.0


def test_withdraw_insufficient_funds_returns_400(client: httpx.Client, cleanup_accounts: list):
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/withdraw", json={"account_id": aid, "amount": 1})
    assert r.status_code == 400
    assert "detail" in r.json()
    # Message should come from the stored procedure
    assert "Insufficient" in r.json()["detail"] or "balance" in r.json()["detail"].lower()


def test_withdraw_zero_amount_rejected(client: httpx.Client, cleanup_accounts: list):
    aid = _open(client, cleanup_accounts)
    r = client.post("/transactions/withdraw", json={"account_id": aid, "amount": 0})
    assert r.status_code in (400, 422)


# ── Transfer ───────────────────────────────────────────────────────────────────

def test_transfer_moves_funds(client: httpx.Client, cleanup_accounts: list):
    src = _open(client, cleanup_accounts)
    dst = _open(client, cleanup_accounts)
    client.post("/transactions/deposit", json={"account_id": src, "amount": 2000000})

    r = client.post("/transactions/transfer", json={
        "from_account_id": src,
        "to_account_id": dst,
        "amount": 750000,
    })
    assert r.status_code == 200
    assert r.json()["success"] is True
    assert _balance(client, src) == 1250000.0
    assert _balance(client, dst) == 750000.0


def test_transfer_insufficient_funds(client: httpx.Client, cleanup_accounts: list):
    src = _open(client, cleanup_accounts)
    dst = _open(client, cleanup_accounts)
    r = client.post("/transactions/transfer", json={
        "from_account_id": src,
        "to_account_id": dst,
        "amount": 1,
    })
    assert r.status_code == 400


def test_transfer_same_account_rejected(client: httpx.Client, cleanup_accounts: list):
    aid = _open(client, cleanup_accounts)
    client.post("/transactions/deposit", json={"account_id": aid, "amount": 1000000})
    r = client.post("/transactions/transfer", json={
        "from_account_id": aid,
        "to_account_id": aid,
        "amount": 100000,
    })
    # Pydantic model_validator rejects at 422, or stored proc SIGNAL at 400
    assert r.status_code in (400, 422)


def test_transfer_appears_in_transaction_history(client: httpx.Client, cleanup_accounts: list):
    src = _open(client, cleanup_accounts)
    dst = _open(client, cleanup_accounts)
    client.post("/transactions/deposit", json={"account_id": src, "amount": 1000000})
    client.post("/transactions/transfer", json={
        "from_account_id": src,
        "to_account_id": dst,
        "amount": 300000,
    })

    r = client.get(f"/accounts/{src}/transactions")
    assert r.status_code == 200
    types = {t["transaction_type"] for t in r.json()["transactions"]}
    assert "Transfer_Out" in types
