"""Transforms are gated by allowed_transformations and produce the right shapes."""
from __future__ import annotations

from datetime import date, timedelta

from app.models.transforms import compute


def _monthly(n: int) -> list[tuple[str, float]]:
    d0 = date(2020, 1, 1)
    return [((d0 + timedelta(days=30 * i)).isoformat(), 100.0 + i) for i in range(n)]


def test_only_allowed_transforms_are_computed():
    obs = _monthly(30)
    out = compute(obs, allowed=["level", "mom", "yoy"], frequency="monthly")
    assert set(out.keys()) == {"level", "mom", "yoy"}


def test_empty_allowlist_returns_nothing():
    out = compute(_monthly(24), allowed=[], frequency="monthly")
    assert out == {}


def test_yoy_uses_frequency_lag():
    obs = _monthly(24)
    out = compute(obs, allowed=["yoy"], frequency="monthly")
    # first 12 values should be None (no year of history yet), 13th onward numeric
    yoy = out["yoy"]
    assert all(v is None for _, v in yoy[:12])
    assert all(v is not None for _, v in yoy[12:])


def test_zscore_is_symmetric_around_zero_for_linear_series():
    out = compute(_monthly(40), allowed=["zscore"], frequency="monthly")
    vals = [v for _, v in out["zscore"] if v is not None]
    assert abs(sum(vals)) < 1e-6