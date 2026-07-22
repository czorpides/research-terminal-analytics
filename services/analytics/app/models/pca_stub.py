"""PCA growth factor — INACTIVE in Stage 1.

Interface only. See services/analytics/README.md for the activation
criteria: Kalman-filtered inputs must first pass missing-observation,
frequency, scaling, stationarity and vintage tests.
"""
from typing import Any

MODEL_KEY = "growth_engine.us.pca_factor"
MODEL_VERSION = "pca.v0.0-inactive"
STATUS = "inactive"


def run(_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": STATUS,
        "reason": (
            "PCA growth factor is inactive in Stage 1. Activation requires "
            "Kalman-filtered indicator series to pass missing-observation, "
            "frequency, scaling, stationarity and historical-vintage tests."
        ),
        "model_key": MODEL_KEY,
        "model_version": MODEL_VERSION,
    }