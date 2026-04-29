"""
Pytest fixtures for the Banking Management System API test suite.

NOTE: Stored procedures use auto-commit internally (START TRANSACTION … COMMIT),
so pytest transaction rollback does NOT work here. Use explicit DELETE cleanup instead.
"""

import os
import sys
import pytest
from fastapi.testclient import TestClient

# Allow importing from app/ for direct DB cleanup
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api.main import app

TEST_USERNAME = os.getenv("TEST_USERNAME", "manager")
TEST_PASSWORD = os.getenv("TEST_PASSWORD", "manager123")
TELLER_USERNAME = os.getenv("TEST_TELLER_USERNAME", "teller")
TELLER_PASSWORD = os.getenv("TEST_TELLER_PASSWORD", "teller123")
AUDITOR_USERNAME = os.getenv("TEST_AUDITOR_USERNAME", "auditor")
AUDITOR_PASSWORD = os.getenv("TEST_AUDITOR_PASSWORD", "auditor123")


@pytest.fixture(scope="session")
def base_url() -> str:
    return "http://testserver"


@pytest.fixture(scope="session")
def client():
    """Long-lived authenticated test client for the whole test session."""
    with TestClient(app) as c:
        login = c.post("/auth/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD})
        login.raise_for_status()
        token = login.json()["access_token"]
        c.headers.update({"Authorization": f"Bearer {token}"})
        yield c


def _role_client(username: str, password: str):
    client = TestClient(app)
    login = client.post("/auth/login", json={"username": username, "password": password})
    login.raise_for_status()
    token = login.json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture(scope="session")
def teller_client():
    client = _role_client(TELLER_USERNAME, TELLER_PASSWORD)
    try:
        yield client
    finally:
        client.close()


@pytest.fixture(scope="session")
def auditor_client():
    client = _role_client(AUDITOR_USERNAME, AUDITOR_PASSWORD)
    try:
        yield client
    finally:
        client.close()


@pytest.fixture
def cleanup_accounts(client: TestClient):
    """
    Yields a list; tests append account IDs to it.
    After the test, drain each account to zero and close it.
    """
    created_ids: list[int] = []
    yield created_ids

    for account_id in created_ids:
        # Get current balance
        r = client.get(f"/accounts/{account_id}")
        if r.status_code != 200:
            continue
        balance = r.json().get("balance", 0)
        if balance and float(balance) > 0:
            client.post("/transactions/withdraw", json={"account_id": account_id, "amount": float(balance)})
        client.delete(f"/accounts/{account_id}")
