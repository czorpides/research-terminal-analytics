"""Deterministic pre-Kalman transformations.

Every transform is a pure function on an ordered (date, value) series.
Callers must gate which transforms are computed by the indicator's
`allowed_transformations` list from the registry — the analytics service
never applies a transform an indicator did not opt into.

Supported names
---------------
  level          — identity
  mom / qoq / wow — 1-period % change (unit is percent)
  yoy            — year-over-year % change (period detected from frequency)
  momentum_3m    — 3-period rolling mean (level units)
  acceleration   — 1st difference of the 1-period % change
  percentile     — historical percentile of the current value (0..100)
  zscore         — (x - mean) / std over full history
"""
from __future__ import annotations

from typing import Sequence

import numpy as np
import pandas as pd


PERIODS_PER_YEAR = {"daily": 252, "weekly": 52, "monthly": 12, "quarterly": 4, "annual": 1}


def _series(observations: Sequence[tuple[str, float | None]]) -> pd.Series:
    df = pd.DataFrame(list(observations), columns=["date", "value"])
    if df.empty:
        return pd.Series(dtype=float)
    df["date"] = pd.to_datetime(df["date"], utc=True).dt.tz_localize(None)
    df = df.sort_values("date").drop_duplicates("date", keep="last").set_index("date")
    return pd.to_numeric(df["value"], errors="coerce").astype(float)


def _pct_change(y: pd.Series, periods: int) -> pd.Series:
    return y.pct_change(periods=periods) * 100.0


def compute(
    observations: Sequence[tuple[str, float | None]],
    *,
    allowed: Sequence[str],
    frequency: str,
) -> dict[str, list[tuple[str, float | None]]]:
    """Return {transform_name: [(iso_date, value_or_none), ...]} for each
    allowed transformation. Absent names are simply omitted."""
    y = _series(observations)
    if y.empty:
        return {}

    per_year = PERIODS_PER_YEAR.get(frequency.lower(), 12)
    out: dict[str, pd.Series] = {}

    allow = set(allowed or [])
    if "level" in allow:
        out["level"] = y
    if "mom" in allow:
        out["mom"] = _pct_change(y, 1)
    if "wow" in allow:
        out["wow"] = _pct_change(y, 1)
    if "qoq" in allow:
        out["qoq"] = _pct_change(y, 1)
    if "yoy" in allow:
        out["yoy"] = _pct_change(y, per_year)
    if "momentum_3m" in allow:
        out["momentum_3m"] = y.rolling(window=3, min_periods=3).mean()
    if "acceleration" in allow:
        out["acceleration"] = _pct_change(y, 1).diff()
    if "percentile" in allow:
        ranks = y.rank(method="average", pct=True) * 100.0
        out["percentile"] = ranks
    if "zscore" in allow:
        mu = y.mean(skipna=True)
        sd = y.std(skipna=True)
        out["zscore"] = (y - mu) / sd if sd and np.isfinite(sd) and sd > 0 else pd.Series(np.nan, index=y.index)

    result: dict[str, list[tuple[str, float | None]]] = {}
    for name, s in out.items():
        result[name] = [
            (idx.strftime("%Y-%m-%d"), None if pd.isna(v) else float(v))
            for idx, v in s.items()
        ]
    return result