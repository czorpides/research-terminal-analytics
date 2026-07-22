"""US Growth Engine local-linear-trend Kalman filter.

Implementation uses Statsmodels' `UnobservedComponents(level='local linear
trend')`. Only FILTERED (point-in-time) estimates are returned — no smoothing
— so the estimate at observation date t only uses observations available up
to and including t. This is enforced and asserted by `tests/test_no_lookahead.py`.

Missing observations are handled natively by the Kalman filter (NaN in the
observation vector → prediction step only, no update).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.structural import UnobservedComponents

MODEL_KEY = "growth_engine.us.kalman_llt"
MODEL_VERSION = "kalman.llt.v0.1"


@dataclass(frozen=True)
class KalmanPoint:
    date: str            # ISO YYYY-MM-DD
    level: float
    slope: float
    level_ci_low: float  # 95% CI lower on level
    level_ci_high: float # 95% CI upper on level


@dataclass(frozen=True)
class KalmanFit:
    points: list[KalmanPoint]
    n_observations: int
    n_missing: int
    log_likelihood: float | None
    converged: bool


def _z95() -> float:
    return 1.959963984540054  # scipy.stats.norm.ppf(0.975)


def fit_llt(observations: Sequence[tuple[str, float | None]]) -> KalmanFit:
    """Fit a local-linear-trend UC model and return filtered level/slope.

    `observations` is an ordered sequence of `(iso_date, value or None)`.
    Duplicate dates are collapsed by taking the last non-null value. Dates
    with no value stay as NaN so the filter's prediction step handles them.
    """
    if len(observations) < 4:
        raise ValueError(f"need at least 4 observations, got {len(observations)}")

    df = pd.DataFrame(observations, columns=["date", "value"])
    df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
    df = df.sort_values("date").drop_duplicates("date", keep="last").set_index("date")
    y = pd.to_numeric(df["value"], errors="coerce").astype(float)

    model = UnobservedComponents(y, level="local linear trend")
    # `disp=False` silences the fit log; `cov_type='none'` keeps the fit fast
    # for the small Growth-Engine series (typically <400 obs). We ignore the
    # parameter standard errors — CIs on the latent level come from the
    # filtered state covariance, not the MLE Hessian.
    res = model.fit(disp=False, cov_type="none", maxiter=200)

    # Filtered (not smoothed): E[state_t | y_{1..t}]
    filtered_state = np.asarray(res.filtered_state)          # shape (k_states, n)
    filtered_cov = np.asarray(res.filtered_state_cov)        # shape (k_states, k_states, n)
    # For 'local linear trend' the state vector is [level, trend].
    levels = filtered_state[0, :]
    slopes = filtered_state[1, :]
    level_vars = filtered_cov[0, 0, :]
    z = _z95()

    points: list[KalmanPoint] = []
    for i, ts in enumerate(y.index):
        sd = float(np.sqrt(max(level_vars[i], 0.0)))
        points.append(
            KalmanPoint(
                date=ts.strftime("%Y-%m-%d"),
                level=float(levels[i]),
                slope=float(slopes[i]),
                level_ci_low=float(levels[i] - z * sd),
                level_ci_high=float(levels[i] + z * sd),
            )
        )

    return KalmanFit(
        points=points,
        n_observations=int(y.notna().sum()),
        n_missing=int(y.isna().sum()),
        log_likelihood=float(res.llf) if np.isfinite(res.llf) else None,
        converged=bool(getattr(res.mle_retvals, "converged", True)) if res.mle_retvals else True,
    )