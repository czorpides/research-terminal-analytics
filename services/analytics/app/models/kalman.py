"""US Growth Engine local-linear-trend Kalman filter.

Point-in-time semantics
-----------------------
The filter always returns FILTERED (not smoothed) states, so the estimate at
observation t depends only on y_{1..t}. Two explicit calculation modes
control the training window:

  * mode='live'       — fit on all observations passed in (production).
  * mode='historical' — pin the training window to `as_of`. Observations
                        with observation_date > as_of are dropped BEFORE the
                        MLE step. Because the maximum-likelihood variance
                        parameters are re-estimated on the truncated series,
                        a historical-mode fit is bit-exactly reproducible
                        from the same (data, as_of) tuple regardless of what
                        observations are added later. See
                        tests/test_point_in_time.py.

Insufficient history
--------------------
`fit_llt` no longer hard-codes the minimum observation count. Callers pass
`min_history`; when the effective non-missing count is below the threshold
the function returns a `KalmanFit` with `status='insufficient_history'` and
no points — no level, slope, CI or trend conclusion is produced.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal, Sequence

import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.structural import UnobservedComponents

MODEL_KEY = "growth_engine.us.kalman_llt"
MODEL_VERSION = "kalman.llt.v0.2"

CalcMode = Literal["live", "historical"]
FitStatus = Literal["ok", "insufficient_history"]


@dataclass(frozen=True)
class KalmanPoint:
    date: str            # ISO YYYY-MM-DD
    level: float
    slope: float
    level_ci_low: float  # 95% CI lower on level
    level_ci_high: float # 95% CI upper on level


@dataclass(frozen=True)
class KalmanFit:
    status: FitStatus
    points: list[KalmanPoint]
    n_observations: int
    n_missing: int
    log_likelihood: float | None
    converged: bool
    calc_mode: CalcMode
    as_of_date: str | None
    training_start: str | None
    training_end: str | None
    min_history: int
    model_params: dict[str, float]
    insufficient_reason: str | None = None


def _z95() -> float:
    return 1.959963984540054  # scipy.stats.norm.ppf(0.975)


def fit_llt(
    observations: Sequence[tuple[str, float | None]],
    *,
    mode: CalcMode = "live",
    as_of: str | None = None,
    min_history: int = 24,
) -> KalmanFit:
    """Fit a local-linear-trend UC model and return filtered level/slope.

    `observations` is an ordered sequence of `(iso_date, value or None)`.
    Duplicate dates are collapsed by taking the last non-null value. Dates
    with no value stay as NaN so the filter's prediction step handles them.

    In `mode='historical'`, all rows with observation_date > `as_of` are
    dropped so both variance hyperparameters and filtered states are
    reproducible from `(data ≤ as_of, as_of)`.
    """
    if mode == "historical" and not as_of:
        raise ValueError("mode='historical' requires as_of")

    df = pd.DataFrame(list(observations), columns=["date", "value"])
    if df.empty:
        return _insufficient(mode=mode, as_of=as_of, min_history=min_history,
                             reason="no observations supplied", n_obs=0, n_missing=0,
                             training_start=None, training_end=None)
    df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
    df = df.sort_values("date").drop_duplicates("date", keep="last").set_index("date")

    if mode == "historical":
        cutoff = pd.to_datetime(as_of)
        df = df[df.index <= cutoff]

    y = pd.to_numeric(df["value"], errors="coerce").astype(float)
    n_obs = int(y.notna().sum())
    n_missing = int(y.isna().sum())
    training_start = y.index.min().strftime("%Y-%m-%d") if len(y) else None
    training_end = y.index.max().strftime("%Y-%m-%d") if len(y) else None

    if n_obs < max(4, int(min_history)):
        return _insufficient(mode=mode, as_of=as_of, min_history=min_history,
                             reason=f"only {n_obs} non-missing observations, need {min_history}",
                             n_obs=n_obs, n_missing=n_missing,
                             training_start=training_start, training_end=training_end)

    model = UnobservedComponents(y, level="local linear trend")
    res = model.fit(disp=False, cov_type="none", maxiter=200)

    filtered_state = np.asarray(res.filtered_state)
    filtered_cov = np.asarray(res.filtered_state_cov)
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

    # MLE variance parameters — recorded verbatim so a historical run is
    # reproducible and auditable.
    params = {name: float(val) for name, val in zip(res.model.param_names, np.asarray(res.params))}

    return KalmanFit(
        status="ok",
        points=points,
        n_observations=n_obs,
        n_missing=n_missing,
        log_likelihood=float(res.llf) if np.isfinite(res.llf) else None,
        converged=bool(getattr(res.mle_retvals, "converged", True)) if res.mle_retvals else True,
        calc_mode=mode,
        as_of_date=as_of,
        training_start=training_start,
        training_end=training_end,
        min_history=int(min_history),
        model_params=params,
    )


def _insufficient(
    *, mode: CalcMode, as_of: str | None, min_history: int, reason: str,
    n_obs: int, n_missing: int, training_start: str | None, training_end: str | None,
) -> KalmanFit:
    return KalmanFit(
        status="insufficient_history",
        points=[], n_observations=n_obs, n_missing=n_missing,
        log_likelihood=None, converged=False,
        calc_mode=mode, as_of_date=as_of,
        training_start=training_start, training_end=training_end,
        min_history=int(min_history), model_params={},
        insufficient_reason=reason,
    )


DEFAULT_MIN_HISTORY = {
    "daily": 252,
    "weekly": 52,
    "monthly": 24,
    "quarterly": 16,
    "annual": 8,
}


def resolve_min_history(frequency: str, override: int | None) -> int:
    if override is not None and override > 0:
        return int(override)
    return DEFAULT_MIN_HISTORY.get(frequency.lower(), 24)