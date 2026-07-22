"""Mathematical tests for the local-linear-trend Kalman filter.

All tests use synthetic series so the expected behaviour is unambiguous.
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta

import pytest

from app.models.kalman import fit_llt


def _dates(n: int, start: str = "2020-01-01") -> list[str]:
    d0 = date.fromisoformat(start)
    return [(d0 + timedelta(days=30 * i)).isoformat() for i in range(n)]


def test_constant_series_recovers_level_and_zero_slope():
    n = 60
    y = 100.0
    fit = fit_llt(list(zip(_dates(n), [y] * n)))
    latest = fit.points[-1]
    assert abs(latest.level - y) < 1.0
    assert abs(latest.slope) < 0.05
    assert latest.level_ci_low <= latest.level <= latest.level_ci_high


def test_linear_rising_series_recovers_positive_slope():
    n = 72
    slope_true = 2.0
    series = [(d, 10.0 + slope_true * i) for i, d in enumerate(_dates(n))]
    fit = fit_llt(series)
    latest = fit.points[-1]
    assert latest.slope > 1.0, f"expected slope>1, got {latest.slope}"
    assert abs(latest.level - series[-1][1]) < 5.0


def test_noisy_rising_series_recovers_trend_within_noise():
    rng = random.Random(42)
    n = 120
    slope_true = 1.5
    series = [(d, 50.0 + slope_true * i + rng.gauss(0, 3.0)) for i, d in enumerate(_dates(n))]
    fit = fit_llt(series)
    latest = fit.points[-1]
    assert latest.slope > 0.5
    assert latest.slope < 3.0
    # true value at the last observation should fall inside the CI most of the time
    truth = 50.0 + slope_true * (n - 1)
    assert latest.level_ci_low - 5 <= truth <= latest.level_ci_high + 5


def test_missing_observations_are_handled():
    n = 80
    series: list[tuple[str, float | None]] = [(d, 20.0 + 0.5 * i) for i, d in enumerate(_dates(n))]
    # blank out ~15% of observations
    for i in range(5, n, 7):
        series[i] = (series[i][0], None)
    fit = fit_llt(series)
    assert fit.n_missing >= 10
    assert fit.n_observations + fit.n_missing == n
    latest = fit.points[-1]
    assert latest.slope > 0.0
    assert math.isfinite(latest.level)


def test_temporary_outlier_does_not_dominate_latest_estimate():
    n = 60
    series = [(d, 100.0 + 0.5 * i) for i, d in enumerate(_dates(n))]
    # inject a huge one-off spike near the middle
    mid = n // 2
    series[mid] = (series[mid][0], series[mid][1] + 500.0)
    fit = fit_llt(series)
    # By the end of the series, the filter should have discounted the spike.
    truth_end = 100.0 + 0.5 * (n - 1)
    latest = fit.points[-1]
    assert abs(latest.level - truth_end) < 25.0, f"outlier over-influenced end level: {latest.level}"
    # Confidence interval widens through the spike but recovers
    ci_width_mid = fit.points[mid].level_ci_high - fit.points[mid].level_ci_low
    ci_width_end = latest.level_ci_high - latest.level_ci_low
    assert ci_width_end <= ci_width_mid * 2  # doesn't blow up permanently


def test_too_few_observations_raises():
    with pytest.raises(ValueError):
        fit_llt([("2024-01-01", 1.0), ("2024-02-01", 2.0)])


def test_ci_brackets_level_and_is_symmetric():
    n = 40
    series = [(d, 10.0 + i) for i, d in enumerate(_dates(n))]
    fit = fit_llt(series)
    for pt in fit.points:
        assert pt.level_ci_low <= pt.level <= pt.level_ci_high
        # symmetric around level
        half_lo = pt.level - pt.level_ci_low
        half_hi = pt.level_ci_high - pt.level
        assert math.isclose(half_lo, half_hi, rel_tol=1e-6, abs_tol=1e-6)