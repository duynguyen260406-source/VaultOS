"""Tests for /accounts endpoints."""

import pytest
import httpx


# Customer 1, branch 1, account type 1 (Savings) — safe defaults from sample data
_OPEN_PAYLOAD = {"customer_id": 1, "account_type_id": 1, "branch_id": 1}


def test_open_account_returns_201(client: httpx.Client, cleanup_accounts: list):
    r = client.post("/accounts", json=_OPEN_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert "account_id" in body
    assert "account_number" in body
    cleanup_accounts.append(body["account_id"])


def test_open_account_invalid_customer(client: httpx.Client):
    r = client.post("/accounts", json={"customer_id": 999999, "account_type_id": 1, "branch_id": 1})
    # stored proc or DB constraint should reject — 400 or 500
    assert r.status_code in (400, 409, 500)


def test_get_account_detail(client: httpx.Client, cleanup_accounts: list):
    r = client.post("/accounts", json=_OPEN_PAYLOAD)
    assert r.status_code == 201
    account_id = r.json()["account_id"]
    cleanup_accounts.append(account_id)

    r2 = client.get(f"/accounts/{account_id}")
    assert r2.status_code == 200
    body = r2.json()
    assert body["account_id"] == account_id
    assert float(body["balance"]) == 0.0
    assert body["status"] == "Active"


def test_get_account_not_found(client: httpx.Client):
    r = client.get("/accounts/999999")
    assert r.status_code == 404


def test_get_transaction_history_empty(client: httpx.Client, cleanup_accounts: list):
    r = client.post("/accounts", json=_OPEN_PAYLOAD)
    assert r.status_code == 201
    account_id = r.json()["account_id"]
    cleanup_accounts.append(account_id)

    r2 = client.get(f"/accounts/{account_id}/transactions")
    assert r2.status_code == 200
    body = r2.json()
    assert body["account_id"] == account_id
    assert body["transactions"] == []
    assert body["total"] == 0


def test_close_account_with_zero_balance(client: httpx.Client):
    r = client.post("/accounts", json=_OPEN_PAYLOAD)
    assert r.status_code == 201
    account_id = r.json()["account_id"]

    r2 = client.delete(f"/accounts/{account_id}")
    assert r2.status_code == 200
    assert r2.json()["success"] is True


def test_close_account_with_nonzero_balance_fails(client: httpx.Client, cleanup_accounts: list):
    r = client.post("/accounts", json=_OPEN_PAYLOAD)
    assert r.status_code == 201
    account_id = r.json()["account_id"]
    cleanup_accounts.append(account_id)

    client.post("/transactions/deposit", json={"account_id": account_id, "amount": 100000})

    r2 = client.delete(f"/accounts/{account_id}")
    assert r2.status_code == 409


def test_account_detail_has_required_fields(client: httpx.Client, cleanup_accounts: list):
    r = client.post("/accounts", json=_OPEN_PAYLOAD)
    assert r.status_code == 201
    account_id = r.json()["account_id"]
    cleanup_accounts.append(account_id)

    r2 = client.get(f"/accounts/{account_id}")
    body = r2.json()
    for field in ("account_id", "account_number", "customer_name", "balance", "status"):
        assert field in body, f"Missing field: {field}"
