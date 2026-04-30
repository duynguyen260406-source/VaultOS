"""Tests for /reports endpoints."""

import pytest
import httpx
from datetime import date


def test_daily_report_no_date_defaults_to_today(client: httpx.Client):
    r = client.get("/reports/daily-transactions")
    assert r.status_code == 200
    body = r.json()
    assert "report_date" in body
    assert "rows" in body
    assert "grand_count" in body
    assert "grand_total" in body
    # report_date should be today
    assert body["report_date"] == str(date.today())


def test_daily_report_with_explicit_date(client: httpx.Client):
    # Use a fixed date that has sample data — or just any valid date
    r = client.get("/reports/daily-transactions", params={"report_date": "2024-01-15"})
    assert r.status_code == 200
    body = r.json()
    assert body["report_date"] == "2024-01-15"
    assert isinstance(body["rows"], list)
    assert isinstance(body["grand_count"], int)
    assert isinstance(body["grand_total"], float)


def test_daily_report_invalid_date_format(client: httpx.Client):
    r = client.get("/reports/daily-transactions", params={"report_date": "15-01-2024"})
    assert r.status_code == 400
    assert "detail" in r.json()


def test_daily_report_future_date_returns_empty(client: httpx.Client):
    r = client.get("/reports/daily-transactions", params={"report_date": "2099-12-31"})
    assert r.status_code == 200
    body = r.json()
    assert body["grand_count"] == 0
    assert body["rows"] == []


def test_daily_report_range_returns_requested_day_window(client: httpx.Client):
    r = client.get("/reports/daily-transactions-range", params={"days": 3, "end_date": "2024-01-16"})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 3
    assert [item["report_date"] for item in body] == ["2024-01-14", "2024-01-15", "2024-01-16"]
    assert all("rows" in item for item in body)
    assert all("grand_count" in item for item in body)
    assert all("grand_total" in item for item in body)


def test_daily_report_range_invalid_end_date_format(client: httpx.Client):
    r = client.get("/reports/daily-transactions-range", params={"days": 7, "end_date": "16-01-2024"})
    assert r.status_code == 400
    assert "detail" in r.json()


def test_customer_balances_returns_list(client: httpx.Client):
    r = client.get("/reports/customer-balances")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 10  # sample data has 10 customers


def test_customer_balances_row_structure(client: httpx.Client):
    r = client.get("/reports/customer-balances")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) > 0
    row = rows[0]
    for field in ("customer_id", "customer_name", "total_balance"):
        assert field in row, f"Missing field: {field}"
    assert isinstance(row["total_balance"], float)


def test_branch_activity_returns_list(client: httpx.Client):
    r = client.get("/reports/branch-activity")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert len(body) >= 1


def test_branch_activity_row_structure(client: httpx.Client):
    r = client.get("/reports/branch-activity")
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) > 0
    row = rows[0]
    for field in ("branch_name", "city", "account_count", "employee_count", "total_deposits"):
        assert field in row, f"Missing field: {field}"
    assert isinstance(row["account_count"], int)
    assert isinstance(row["total_deposits"], float)
