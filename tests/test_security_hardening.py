"""Focused security regression tests for masked reads and branch scoping."""

import os

import mysql.connector
from fastapi.testclient import TestClient


def test_auditor_customer_detail_is_masked(auditor_client: TestClient):
    response = auditor_client.get("/customers/1")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "REDACTED"
    assert body["phone"] == "REDACTED"
    assert body["address"].endswith("...")
    assert body["date_of_birth"].endswith("-**-**")


def test_teller_cannot_open_account_outside_own_branch(teller_client: TestClient):
    response = teller_client.post(
        "/accounts",
        json={"customer_id": 1, "account_type_id": 1, "branch_id": 2},
    )
    assert response.status_code == 400
    assert "branch" in response.json()["detail"].lower()


def test_teller_cannot_read_customer_outside_own_branch(teller_client: TestClient):
    response = teller_client.get("/customers/3")
    assert response.status_code == 404


def test_teller_search_is_branch_scoped(teller_client: TestClient):
    response = teller_client.get("/customers/search", params={"name": "Cuong"})
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_password_reset_revokes_existing_token(client):
    teller_user_id = 2
    temporary_password = "teller-reset-123"

    from api.main import app

    with TestClient(app) as teller:
        login = teller.post("/auth/login", json={"username": "teller", "password": "teller123"})
        assert login.status_code == 200
        old_token = login.json()["access_token"]
        teller.headers.update({"Authorization": f"Bearer {old_token}"})
        assert teller.get("/auth/me").status_code == 200

        try:
            reset = client.post(
                f"/users/{teller_user_id}/reset-password",
                json={"new_password": temporary_password},
            )
            assert reset.status_code == 200

            revoked = teller.get("/auth/me")
            assert revoked.status_code == 401

            relogin = teller.post("/auth/login", json={"username": "teller", "password": temporary_password})
            assert relogin.status_code == 200
        finally:
            restore = client.post(
                f"/users/{teller_user_id}/reset-password",
                json={"new_password": "teller123"},
            )
            assert restore.status_code == 200


def test_direct_teller_db_spoof_without_valid_context_signature_is_rejected():
    conn = mysql.connector.connect(
        host=os.getenv("DB_TELLER_HOST", os.getenv("DB_HOST", "localhost")),
        port=int(os.getenv("DB_TELLER_PORT", os.getenv("DB_PORT", "3306"))),
        user=os.getenv("DB_TELLER_USER"),
        password=os.getenv("DB_TELLER_PASSWORD"),
        database=os.getenv("DB_NAME", "banking_system"),
    )
    cursor = conn.cursor()
    try:
        cursor.execute("SET @app_user_id = 2")
        cursor.execute("SET @app_username = 'teller'")
        cursor.execute("SET @app_role = 'teller'")
        cursor.execute("SET @app_employee_id = 3")
        cursor.execute("SET @app_branch_id = 2")
        cursor.execute("SET @app_actor = 'teller (teller)'")
        cursor.execute("SET @app_context_signature = 'forged-signature'")

        try:
            cursor.execute("CALL sp_open_account(%s, %s, %s, @new_account_id, @new_account_number)", (1, 1, 2))
        except mysql.connector.Error as exc:
            message = getattr(exc, "msg", str(exc)).lower()
            assert exc.sqlstate == "45000"
            assert "invalid" in message or "untrusted" in message
        else:
            raise AssertionError("Expected direct DB spoofed teller context to be rejected")
    finally:
        cursor.close()
        conn.close()
