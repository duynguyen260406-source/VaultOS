"""
Tests for POST /customers endpoint and DOB trigger validation.

Trigger tested:
- trg_customers_check_dob_ins: BEFORE INSERT on Customers — rejects DateOfBirth >= CURRENT_DATE
  with SQLSTATE '45000', which should surface as HTTP 400 or 500 from the API.
"""

import uuid
import pytest
import httpx
from datetime import date, timedelta


def _unique_payload(**overrides) -> dict:
    """Generate a unique valid customer payload to avoid duplicate-key conflicts."""
    uid = uuid.uuid4().hex[:8]
    payload = {
        "first_name": "Test",
        "last_name": f"User_{uid}",
        "date_of_birth": "1990-06-15",
        "gender": "Male",
        "phone": f"09{uid[:8]}",
        "email": f"test_{uid}@example.com",
        "address": "123 Test Street",
        "city": "Ho Chi Minh City",
    }
    payload.update(overrides)
    return payload


# ── Successful creation ────────────────────────────────────────────────────────

def test_create_customer_returns_201(client: httpx.Client):
    """Valid payload should return HTTP 201 with customer_id and key fields."""
    r = client.post("/customers", json=_unique_payload())
    assert r.status_code == 201, f"Expected 201, got {r.status_code}: {r.text}"
    body = r.json()
    assert "customer_id" in body
    assert body["first_name"] == "Test"


def test_create_customer_all_fields_present(client: httpx.Client):
    """Response must include all required fields."""
    r = client.post("/customers", json=_unique_payload())
    assert r.status_code == 201
    body = r.json()
    for field in (
        "customer_id", "first_name", "last_name", "email",
        "phone", "address", "date_of_birth", "gender", "city", "created_at",
    ):
        assert field in body, f"Missing field in response: {field}"


def test_create_customer_gender_stored_correctly(client: httpx.Client):
    """Gender 'Female' should be returned as 'Female' (not 'F' or other internal value)."""
    r = client.post("/customers", json=_unique_payload(gender="Female"))
    assert r.status_code == 201
    assert r.json()["gender"] == "Female"


# ── DOB trigger validation ─────────────────────────────────────────────────────

def test_create_customer_future_dob_rejected(client: httpx.Client):
    """
    DateOfBirth in the future must be rejected.
    The trigger trg_customers_check_dob_ins fires BEFORE INSERT and raises SQLSTATE 45000.
    Expected HTTP response: 400, 422, or 500.
    """
    future_date = (date.today() + timedelta(days=365)).isoformat()
    r = client.post("/customers", json=_unique_payload(date_of_birth=future_date))
    assert r.status_code in (400, 422, 500), (
        f"Future DOB should be rejected. Got {r.status_code}: {r.text}"
    )


def test_create_customer_today_dob_rejected(client: httpx.Client):
    """
    DateOfBirth = today must also be rejected (trigger condition: DOB >= CURRENT_DATE).
    """
    today = date.today().isoformat()
    r = client.post("/customers", json=_unique_payload(date_of_birth=today))
    assert r.status_code in (400, 422, 500), (
        f"Today's DOB should be rejected. Got {r.status_code}: {r.text}"
    )


# ── Validation errors ─────────────────────────────────────────────────────────

def test_create_customer_missing_first_name_rejected(client: httpx.Client):
    """Omitting first_name must return 422 (Pydantic validation error)."""
    payload = _unique_payload()
    del payload["first_name"]
    r = client.post("/customers", json=payload)
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"


def test_create_customer_missing_last_name_rejected(client: httpx.Client):
    """Omitting last_name must return 422."""
    payload = _unique_payload()
    del payload["last_name"]
    r = client.post("/customers", json=payload)
    assert r.status_code == 422


def test_create_customer_invalid_gender_rejected(client: httpx.Client):
    """Gender must be one of Male / Female / Other. Invalid value → 422."""
    r = client.post("/customers", json=_unique_payload(gender="InvalidGender"))
    assert r.status_code in (400, 422), (
        f"Invalid gender should be rejected. Got {r.status_code}: {r.text}"
    )


# ── Duplicate constraint ───────────────────────────────────────────────────────

def test_create_customer_duplicate_phone_rejected(client: httpx.Client):
    """
    Creating two customers with the same phone number must fail with 409 or 500
    (Customers.Phone has a UNIQUE constraint).
    """
    shared_phone = f"09{uuid.uuid4().hex[:8]}"
    payload1 = _unique_payload(phone=shared_phone)
    payload2 = _unique_payload(phone=shared_phone)

    r1 = client.post("/customers", json=payload1)
    assert r1.status_code == 201, f"First creation failed: {r1.text}"

    r2 = client.post("/customers", json=payload2)
    assert r2.status_code in (409, 500), (
        f"Duplicate phone should be rejected. Got {r2.status_code}: {r2.text}"
    )
