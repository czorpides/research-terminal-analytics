"""HMM regime detector — INACTIVE in Stage 1.

Interface only. Activation requires stable PCA factors and formal
assessment of state convergence, interpretability, persistence, out-of-sample
behaviour and regime-label stability.
"""
from typing import Any

MODEL_KEY = "regime_monitor.us.hmm"
MODEL_VERSION = "hmm.v0.0-inactive"
STATUS = "inactive"


def run(_payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": STATUS,
        "reason": (
            "HMM regime detector is inactive in Stage 1. Activation requires "
            "stable PCA factors and formal review of state convergence, "
            "interpretability, persistence, out-of-sample behaviour and "
            "regime-label stability."
        ),
        "model_key": MODEL_KEY,
        "model_version": MODEL_VERSION,
    }