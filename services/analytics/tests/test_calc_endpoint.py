"""Endpoint tests for the stateless calculation service.

Covers auth, payload validation, ordering, point-in-time trimming, hash
echo, and confirms no database credentials are required.
"""
from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app
from app.models.kalman import MODEL_KEY, MODEL_VERSION

INFLATION_MODEL_KEY = "inflation_engine.us.kalman_llt"

TOKEN = "test-token-please-ignore"
HASH = "deadbeef" * 8


@pytest.fixture(autouse=True)
def _configure_settings(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("ANALYTICS_SERVICE_TOKEN", TOKEN)
    yield
    get_settings.cache_clear()


def _client() -> TestClient:
    return TestClient(app)


def _observations(n: int, start: str = "2015-01-01"):
    d0 = date.fromisoformat(start)
    return [
        {"date": (d0 + timedelta(days=30 * i)).isoformat(), "value": 100.0 + i}
        for i in range(n)
    ]


def _valid_request(**overrides):
    body = {
        "model_key": MODEL_KEY,
        "model_version": MODEL_VERSION,
        "calculation_mode": "live",
        "as_of_date": None,
        "training_start": "2015-01-01",
        "training_end": None,
        "input_hash": HASH,
        "indicator_id": "11111111-1111-1111-1111-111111111111",
        "indicator_frequency": "monthly",
        "indicator_unit": "index",
        "observations": _observations(48),
        "model_config_params": {"min_history": 24},
    }
    body.update(overrides)
    return body


# --- auth ---

def test_missing_bearer_is_rejected():
    r = _client().post("/calc/kalman-llt", json=_valid_request())
    assert r.status_code == 401


def test_wrong_bearer_is_rejected():
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(),
        headers={"Authorization": "Bearer not-the-token"},
    )
    assert r.status_code == 401


def test_valid_bearer_is_accepted():
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200


# --- payload validation ---

def test_empty_observations_are_rejected():
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(observations=[]),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 422


def test_out_of_order_observations_are_rejected():
    obs = _observations(24)
    obs[10], obs[11] = obs[11], obs[10]
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(observations=obs),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 422


def test_extra_fields_are_rejected():
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(supabase_url="https://leak.example.com"),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 422


# --- point-in-time semantics ---

def test_historical_mode_drops_future_observations():
    obs = _observations(60)
    as_of = obs[29]["date"]  # keep first 30
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(
            calculation_mode="historical",
            as_of_date=as_of,
            observations=obs,
        ),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    # The last emitted point date must not exceed as_of.
    assert body["points"][-1]["date"] <= as_of
    # And 30 obs should have been trimmed.
    assert any("dropped" in w for w in body["warnings"])


# --- hash echo & indicator id echo ---

def test_response_echoes_input_hash_and_indicator_id():
    req = _valid_request()
    r = _client().post(
        "/calc/kalman-llt",
        json=req,
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["input_hash"] == req["input_hash"]
    assert body["indicator_id"] == req["indicator_id"]
    assert body["model_key"] == MODEL_KEY
    assert body["model_version"] == MODEL_VERSION


# --- strict model_key / model_version allow-list -----------------------------

def test_valid_growth_engine_request_is_accepted_and_echoed():
    req = _valid_request(model_key=MODEL_KEY, model_version=MODEL_VERSION)
    r = _client().post(
        "/calc/kalman-llt", json=req,
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["model_key"] == MODEL_KEY
    assert body["model_version"] == MODEL_VERSION
    assert body["indicator_id"] == req["indicator_id"]
    assert body["input_hash"] == req["input_hash"]


def test_valid_inflation_engine_request_is_accepted_and_echoed():
    req = _valid_request(
        model_key=INFLATION_MODEL_KEY,
        model_version=MODEL_VERSION,
        indicator_id="22222222-2222-2222-2222-222222222222",
    )
    r = _client().post(
        "/calc/kalman-llt", json=req,
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    # Must NOT overwrite the inflation key with the growth key.
    assert body["model_key"] == INFLATION_MODEL_KEY
    assert body["model_version"] == MODEL_VERSION
    assert body["indicator_id"] == req["indicator_id"]
    assert body["input_hash"] == req["input_hash"]


def test_unknown_model_key_is_rejected():
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(model_key="liquidity_engine.us.kalman_llt"),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 422
    assert "unknown model_key" in r.json()["detail"]


def test_unsupported_model_version_is_rejected():
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(model_version="kalman.llt.v9.9"),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 422
    assert "unsupported model_version" in r.json()["detail"]


def test_invalid_key_version_combination_is_rejected():
    # Both key and version are individually valid strings but the combination
    # is not on the approved list.
    r = _client().post(
        "/calc/kalman-llt",
        json=_valid_request(
            model_key=INFLATION_MODEL_KEY,
            model_version="kalman.llt.v0.1",
        ),
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 422
    body = r.json()
    assert "unsupported model_version" in body["detail"]
    assert INFLATION_MODEL_KEY in body["detail"]


# --- Atlanta Fed wage series (FRBATLWGTUMHWGO) end-to-end shape --------------

def test_frbatlwgtumhwgo_series_processes_successfully():
    """The corrected Atlanta Fed Wage Growth Tracker series id must ingest
    and validate through the stateless calc endpoint under the inflation
    engine model key."""
    # Synthetic monthly YoY-% observations (60 months, ~24 min history).
    obs = [
        {"date": (date.fromisoformat("2020-01-01") + timedelta(days=30 * i)).isoformat(),
         "value": 3.0 + 0.02 * i}
        for i in range(60)
    ]
    req = _valid_request(
        model_key=INFLATION_MODEL_KEY,
        model_version=MODEL_VERSION,
        indicator_id="33333333-3333-3333-3333-333333333333",
        indicator_unit="yoy_pct",
        observations=obs,
        model_config_params={"min_history": 24},
    )
    r = _client().post(
        "/calc/kalman-llt", json=req,
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model_key"] == INFLATION_MODEL_KEY
    assert body["model_version"] == MODEL_VERSION
    assert body["input_hash"] == req["input_hash"]
    assert body["indicator_id"] == req["indicator_id"]
    assert len(body["points"]) == len(obs)


# --- no database credentials required ---

def test_settings_have_no_supabase_credentials():
    s = Settings()
    assert not hasattr(s, "supabase_url"), "Settings must not carry SUPABASE_URL"
    assert not hasattr(s, "supabase_service_role_key"), (
        "Settings must not carry SUPABASE_SERVICE_ROLE_KEY"
    )


def test_service_starts_without_supabase_env(monkeypatch):
    for var in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(var, raising=False)
    r = _client().get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# --- inactive models ---

def test_pca_endpoint_is_inactive_and_echoes_hash():
    r = _client().post(
        "/calc/pca-factor",
        json={
            "model_key": "growth_engine.us.pca_factor",
            "model_version": "pca.v0.0-inactive",
            "input_hash": HASH,
        },
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "inactive"
    assert body["input_hash"] == HASH


def test_hmm_endpoint_is_inactive_and_echoes_hash():
    r = _client().post(
        "/calc/hmm-regime",
        json={
            "model_key": "regime_monitor.us.hmm",
            "model_version": "hmm.v0.0-inactive",
            "input_hash": HASH,
        },
        headers={"Authorization": f"Bearer {TOKEN}"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "inactive"