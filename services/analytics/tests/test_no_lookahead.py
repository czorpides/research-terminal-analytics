"""Filtered estimates must be point-in-time: the estimate at time t may only
depend on observations available up to and including t.

The check: fit on the FULL series vs on the PREFIX ending at t. The
filtered value at position t in both fits must be (approximately) identical.
Statsmodels re-estimates the variance hyperparameters on each fit — so we
use a series with a clear enough signal that both fits agree numerically.
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta

from app.models.kalman import fit_llt


def _dates(n: int) -> list[str]:
    d0 = date(2019, 1, 1)
    return [(d0 + timedelta(days=30 * i)).isoformat() for i in range(n)]


def test_filtered_estimate_does_not_use_future_observations():
    rng = random.Random(7)
    n = 80
    slope_true = 1.0
    full_series = [(d, 100.0 + slope_true * i + rng.gauss(0, 2.0)) for i, d in enumerate(_dates(n))]

    # Fit on the full series
    full_fit = fit_llt(full_series)

    # Fit on a prefix; the filtered value at the last prefix point must
    # equal the filtered value at the same index in the full fit — since
    # filtering only ever conditions on past + present, extending the
    # series with future data must not change earlier filtered states
    # (up to numerical noise from hyperparameter re-estimation).
    for cutoff in (30, 45, 60):
        prefix_fit = fit_llt(full_series[:cutoff])
        full_at_cutoff = full_fit.points[cutoff - 1]
        prefix_last = prefix_fit.points[-1]
        # Loose tolerance to accommodate hyperparameter MLE variance across fits
        assert math.isclose(prefix_last.level, full_at_cutoff.level, rel_tol=0.05, abs_tol=1.5), (
            f"cutoff={cutoff}: prefix {prefix_last.level} vs full {full_at_cutoff.level}"
        )


def test_future_shock_does_not_shift_earlier_filtered_state():
    """A spike appended AFTER time t must not change the filtered level at t."""
    n = 50
    base = [(d, 100.0 + 0.5 * i) for i, d in enumerate(_dates(n))]
    base_fit = fit_llt(base)

    # Extend with a large future shock
    extended_dates = _dates(n + 10)
    extended = base + [(extended_dates[n + k], 100.0 + 0.5 * (n + k) + 400.0) for k in range(10)]
    ext_fit = fit_llt(extended)

    # Compare filtered level at the last pre-shock index
    base_last = base_fit.points[-1].level
    ext_at_same = ext_fit.points[n - 1].level
    # Some small drift from re-estimated hyperparameters is expected; the
    # future shock must not swing the earlier filtered value materially.
    assert abs(base_last - ext_at_same) < 5.0, (
        f"future shock leaked into earlier filtered state: base={base_last} extended={ext_at_same}"
    )