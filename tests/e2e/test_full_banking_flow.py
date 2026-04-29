"""End-to-end banking flow test (16 steps)."""

import pytest
import os
from fastapi.testclient import TestClient

from api.main import app

TEST_USERNAME = os.getenv("TEST_USERNAME", "manager")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "manager123")

_OPEN_1 = {"customer_id": 1, "account_type_id": 1, "branch_id": 1}  # Savings
_OPEN_2 = {"customer_id": 2, "account_type_id": 2, "branch_id": 2}  # Checking


@pytest.fixture(scope="module")
def api():
    with TestClient(app) as c:
        login = c.post("/auth/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD})
        login.raise_for_status()
        token = login.json()["access_token"]
        c.headers.update({"Authorization": f"Bearer {token}"})
        yield c


def _balance(api, account_id: int) -> float:
    r = api.get(f"/accounts/{account_id}")
    assert r.status_code == 200, f"GET /accounts/{account_id} returned {r.status_code}: {r.text}"
    return float(r.json()["balance"])


def test_full_banking_flow(api):
    # ── Step 1: Confirm customer 1 exists ─────────────────────────────────────
    r = api.get("/customers/1")
    assert r.status_code == 200, f"Step 1 failed: {r.text}"
    print(f"\n[Step 1] Customer 1: {r.json()['first_name']} {r.json()['last_name']}")

    # ── Step 2: Open checking account for customer 1, branch 1 ───────────────
    r = api.post("/accounts", json=_OPEN_1)
    assert r.status_code == 201, f"Step 2 failed: {r.text}"
    acct1 = r.json()["account_id"]
    acct1_number = r.json()["account_number"]
    print(f"[Step 2] Opened account {acct1} ({acct1_number})")

    # ── Step 3: Verify initial balance is 0 ──────────────────────────────────
    bal = _balance(api, acct1)
    assert bal == 0.0, f"Step 3 failed: expected 0, got {bal}"
    print(f"[Step 3] Balance = {bal}")

    # ── Step 4: Deposit 5,000,000 ─────────────────────────────────────────────
    r = api.post("/transactions/deposit", json={"account_id": acct1, "amount": 5_000_000})
    assert r.status_code == 200, f"Step 4 failed: {r.text}"
    bal = _balance(api, acct1)
    assert bal == 5_000_000.0, f"Step 4: expected 5000000, got {bal}"
    print(f"[Step 4] After deposit 5,000,000 → balance = {bal}")

    # ── Step 5: Withdraw 1,000,000 ────────────────────────────────────────────
    r = api.post("/transactions/withdraw", json={"account_id": acct1, "amount": 1_000_000})
    assert r.status_code == 200, f"Step 5 failed: {r.text}"
    bal = _balance(api, acct1)
    assert bal == 4_000_000.0, f"Step 5: expected 4000000, got {bal}"
    print(f"[Step 5] After withdraw 1,000,000 → balance = {bal}")

    # ── Step 6: Overdraft attempt returns 400 ─────────────────────────────────
    r = api.post("/transactions/withdraw", json={"account_id": acct1, "amount": 99_000_000})
    assert r.status_code == 400, f"Step 6: expected 400, got {r.status_code}"
    print(f"[Step 6] Overdraft rejected: {r.json()['detail']}")

    # ── Step 7: Open second account for customer 2 ────────────────────────────
    r = api.post("/accounts", json=_OPEN_2)
    assert r.status_code == 201, f"Step 7 failed: {r.text}"
    acct2 = r.json()["account_id"]
    print(f"[Step 7] Opened second account {acct2}")

    # ── Step 8: Transfer 2,000,000 from acct1 → acct2 ────────────────────────
    r = api.post("/transactions/transfer", json={
        "from_account_id": acct1,
        "to_account_id": acct2,
        "amount": 2_000_000,
    })
    assert r.status_code == 200, f"Step 8 failed: {r.text}"
    bal1 = _balance(api, acct1)
    bal2 = _balance(api, acct2)
    assert bal1 == 2_000_000.0, f"Step 8: acct1 expected 2000000, got {bal1}"
    assert bal2 == 2_000_000.0, f"Step 8: acct2 expected 2000000, got {bal2}"
    print(f"[Step 8] Transfer 2,000,000: acct1={bal1}, acct2={bal2}")

    # ── Step 9: Same-account transfer rejected ────────────────────────────────
    r = api.post("/transactions/transfer", json={
        "from_account_id": acct1,
        "to_account_id": acct1,
        "amount": 100,
    })
    assert r.status_code in (400, 422), f"Step 9: expected 400/422, got {r.status_code}"
    print(f"[Step 9] Same-account transfer rejected: {r.status_code}")

    # ── Step 10: Transaction history for acct1 ────────────────────────────────
    r = api.get(f"/accounts/{acct1}/transactions")
    assert r.status_code == 200, f"Step 10 failed: {r.text}"
    txns = r.json()["transactions"]
    types = {t["transaction_type"] for t in txns}
    assert "Deposit" in types, f"Step 10: missing Deposit in {types}"
    assert "Withdrawal" in types, f"Step 10: missing Withdrawal in {types}"
    assert "Transfer_Out" in types, f"Step 10: missing Transfer_Out in {types}"
    print(f"[Step 10] acct1 transaction types: {types}")

    # ── Step 11: Transaction history for acct2 ────────────────────────────────
    r = api.get(f"/accounts/{acct2}/transactions")
    assert r.status_code == 200, f"Step 11 failed: {r.text}"
    types2 = {t["transaction_type"] for t in r.json()["transactions"]}
    assert "Transfer_In" in types2, f"Step 11: missing Transfer_In in {types2}"
    print(f"[Step 11] acct2 transaction types: {types2}")

    # ── Step 12: Reports still return valid data ───────────────────────────────
    r = api.get("/reports/customer-balances")
    assert r.status_code == 200, f"Step 12 failed: {r.text}"
    assert len(r.json()) >= 1
    print(f"[Step 12] Customer balance report: {len(r.json())} rows")

    # ── Step 13: Cannot close account with non-zero balance ───────────────────
    r = api.delete(f"/accounts/{acct1}")
    assert r.status_code == 409, f"Step 13: expected 409, got {r.status_code}"
    print(f"[Step 13] Close acct1 with balance rejected (409)")

    # ── Step 14: Drain acct1 to zero ──────────────────────────────────────────
    bal1 = _balance(api, acct1)
    r = api.post("/transactions/withdraw", json={"account_id": acct1, "amount": bal1})
    assert r.status_code == 200, f"Step 14 failed: {r.text}"
    assert _balance(api, acct1) == 0.0
    print(f"[Step 14] Drained acct1 to 0")

    # ── Step 15: Drain acct2 to zero ──────────────────────────────────────────
    bal2 = _balance(api, acct2)
    r = api.post("/transactions/withdraw", json={"account_id": acct2, "amount": bal2})
    assert r.status_code == 200, f"Step 15 failed: {r.text}"
    assert _balance(api, acct2) == 0.0
    print(f"[Step 15] Drained acct2 to 0")

    # ── Step 16: Close both accounts ──────────────────────────────────────────
    r1 = api.delete(f"/accounts/{acct1}")
    r2 = api.delete(f"/accounts/{acct2}")
    assert r1.status_code == 200, f"Step 16 acct1 close failed: {r1.text}"
    assert r2.status_code == 200, f"Step 16 acct2 close failed: {r2.text}"
    print(f"[Step 16] Both accounts closed successfully.")
