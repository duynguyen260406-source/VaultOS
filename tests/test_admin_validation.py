"""Regression tests for admin validation and session invalidation flows."""


def test_create_branch_requires_established_date(client):
    response = client.post(
        "/branches",
        json={
            "branch_name": "Branch Missing Date",
            "address": "1 Test Street",
            "city": "Ha Noi",
            "phone": "02439990000",
        },
    )
    assert response.status_code == 422


def test_create_employee_requires_hire_date(client):
    response = client.post(
        "/employees",
        json={
            "branch_id": 1,
            "manager_id": 1,
            "first_name": "Test",
            "last_name": "Employee",
            "position": "Analyst",
            "salary": 15000000,
            "email": "employee.validation@test.local",
            "phone": "0909999999",
        },
    )
    assert response.status_code == 422


def test_status_change_revokes_existing_token_even_after_reenable(client):
    teller_user_id = 2

    from fastapi.testclient import TestClient
    from api.main import app

    with TestClient(app) as teller:
        login = teller.post("/auth/login", json={"username": "teller", "password": "teller123"})
        assert login.status_code == 200
        old_token = login.json()["access_token"]
        teller.headers.update({"Authorization": f"Bearer {old_token}"})
        assert teller.get("/auth/me").status_code == 200

        try:
            disable = client.patch(f"/users/{teller_user_id}", json={"status": "disabled"})
            assert disable.status_code == 200

            disabled = teller.get("/auth/me")
            assert disabled.status_code == 403

            enable = client.patch(f"/users/{teller_user_id}", json={"status": "active"})
            assert enable.status_code == 200

            revoked = teller.get("/auth/me")
            assert revoked.status_code == 401

            relogin = teller.post("/auth/login", json={"username": "teller", "password": "teller123"})
            assert relogin.status_code == 200
        finally:
            restore = client.patch(f"/users/{teller_user_id}", json={"status": "active"})
            assert restore.status_code == 200
