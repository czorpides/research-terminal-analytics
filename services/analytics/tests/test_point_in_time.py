"""Point-in-time (historical mode) reproducibility.

The invariant: a model output calculated as of a historical date must be
bit-exact reproducible when later observations are subsequently appended.
This is the strict version of the no-lookahead test — because
`mode='historical'` slices observations by `as_of` BEFORE the MLE step,
both the maximum-likelihood variance parameters and every filtered state
must be identical between the two fits.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from app.models.kalman import fit_llt

_MH = 4


def _dates(n: int) -> list[str]:
    d0 = date(2015, 1, 1)
    return [(d0 + timedelta(days=30 * i)).isoformat() for i in range(n)]


def test_historical_output_is_bit_exact_after_future_observations_added():
    rng = random.Random(1)
    n = 90
    dates = _dates(n + 30)
    original = [(d, 100.0 + 0.6 * i + rng.gauss(0, 2.0)) for i, d in enumerate(dates[:n])]
    as_of = original[-1][0]

    # Fit "at time T" using only what was known then.
    fit_a = fit_llt(original, mode="historical", as_of=as_of, min_history=_MH)
    assert fit_a.status == "ok"

    # Now imagine 30 more months arrive with a shock, and we re-run the
    # historical calculation with as_of pinned to the same date T.
    later = original + [(dates[n + k], 100.0 + 0.6 * (n + k) + 500.0 + rng.gauss(0, 5.0)) for k in range(30)]
    fit_b = fit_llt(later, mode="historical", as_of=as_of, min_history=_MH)
    assert fit_b.status == "ok"

    assert fit_a.model_params == fit_b.model_params, "MLE params must be identical"
    assert fit_a.training_start == fit_b.training_start
    assert fit_a.training_end == fit_b.training_end
    assert len(fit_a.points) == len(fit_b.points)
    for a, b in zip(fit_a.points, fit_b.points):
        assert a.date == b.date
        assert a.level == b.level
        assert a.slope == b.slope
        assert a.level_ci_low == b.level_ci_low
        assert a.level_ci_high == b.level_ci_high


def test_historical_requires_as_of():
    try:
        fit_llt([("2024-01-01", 1.0)] * 40, mode="historical", min_history=_MH)
    except ValueError:
        return
    raise AssertionError("historical mode without as_of should raise")