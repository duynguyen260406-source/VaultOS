"""Tests for GET /customers endpoints."""

import pytest
import httpx


def test_list_customers_returns_10(client: httpx.Client):
    r = client.get("/customers")
    assert r.status_code == 200
    body = r.json()
    assert "customers" in body
    assert "total" in body
    assert body["total"] >= 10
    assert len(body["customers"]) >= 10


def test_list_customers_pagination(client: httpx.Client):
    r = client.get("/customers", params={"limit": 3, "offset": 0})
    assert r.status_code == 200
    body = r.json()
    assert len(body["customers"]) == 3

    r2 = client.get("/customers", params={"limit": 3, "offset": 3})
    assert r2.status_code == 200
    ids_page1 = {c["customer_id"] for c in body["customers"]}
    ids_page2 = {c["customer_id"] for c in r2.json()["customers"]}
    assert ids_page1.isdisjoint(ids_page2), "Pages must not overlap"


def test_search_customers_by_name(client: httpx.Client):
    # Get first customer's name from the list to use as search term
    r = client.get("/customers", params={"limit": 1})
    assert r.status_code == 200
    first = r.json()["customers"][0]
    last_name = first["last_name"]

    r2 = client.get("/customers/search", params={"name": last_name})
    assert r2.status_code == 200
    results = r2.json()["customers"]
    assert len(results) >= 1
    assert any(c["last_name"] == last_name for c in results)


def test_search_customers_no_results(client: httpx.Client):
    r = client.get("/customers/search", params={"name": "ZZZNOMATCH9999"})
    assert r.status_code == 200
    assert r.json()["total"] == 0
    assert r.json()["customers"] == []


def test_get_customer_by_id(client: httpx.Client):
    r = client.get("/customers/1")
    assert r.status_code == 200
    body = r.json()
    assert body["customer_id"] == 1
    assert "first_name" in body
    assert "last_name" in body
    assert "email" in body


def test_get_customer_not_found(client: httpx.Client):
    r = client.get("/customers/999999")
    assert r.status_code == 404
    assert "detail" in r.json()


def test_customer_detail_has_all_fields(client: httpx.Client):
    r = client.get("/customers/1")
    assert r.status_code == 200
    body = r.json()
    for field in ("customer_id", "first_name", "last_name", "email", "phone",
                  "address", "date_of_birth", "gender", "city", "created_at"):
        assert field in body, f"Missing field: {field}"
