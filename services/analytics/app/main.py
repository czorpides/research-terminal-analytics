"""FastAPI entry point — stateless calculation service.

The service does NOT connect to Supabase. It performs deterministic
calculations on payloads sent by the authenticated Lovable/TanStack server.

Endpoints
  GET  /healthz                 -> public health (no secrets, no PII)
  POST /calc/kalman-llt         -> run one Kalman LLT calculation
  POST /calc/pca-factor         -> inactive (stateless contract preserved)
  POST /calc/hmm-regime         -> inactive (stateless contract preserved)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import Depends, FastAPI

from .auth import require_service_token
from .config import get_settings
from .logging_config import configure_logging
from .models import hmm_stub, pca_stub
from .models.kalman import MODEL_KEY, MODEL_VERSION, fit_llt, resolve_min_history
from .schemas import (
    HealthResponse,
    InactiveModelRequest,
    InactiveModelResponse,
    KalmanCalculationRequest,
    KalmanCalculationResponse,
    KalmanPointDTO,
)

settings = get_settings()
configure_logging(settings.log_level)
log = logging.getLogger("analytics")

app = FastAPI(title="Research Terminal — Analytics (stateless)", version=settings.service_version)


@app.get("/healthz", response_model=HealthResponse, tags=["public"])
def healthz() -> HealthResponse:
    return HealthResponse(service_version=settings.service_version, deploy_env=settings.deploy_env)


@app.post(
    "/calc/kalman-llt",
    response_model=KalmanCalculationResponse,
    dependencies=[Depends(require_service_token)],
    tags=["calc"],
)
def calc_kalman_llt(payload: KalmanCalculationRequest) -> KalmanCalculationResponse:
    warnings: list[str] = []

    if payload.model_key != MODEL_KEY:
        warnings.append(f"unexpected model_key '{payload.model_key}', expected '{MODEL_KEY}'")
    if payload.model_version != MODEL_VERSION:
        warnings.append(
            f"model_version mismatch: request {payload.model_version} vs runtime {MODEL_VERSION}"
        )

    # Point-in-time guard: strip any observation later than as_of_date.
    obs = [(o.date.isoformat(), o.value) for o in payload.observations]
    if payload.calculation_mode == "historical" and payload.as_of_date is not None:
        cutoff = payload.as_of_date.isoformat()
        before = len(obs)
        obs = [(d, v) for d, v in obs if d <= cutoff]
        dropped = before - len(obs)
        if dropped:
            warnings.append(f"dropped {dropped} observations after as_of_date {cutoff}")

    min_history = resolve_min_history(
        payload.indicator_frequency,
        payload.model_config_params.min_history,
    )

    try:
        fit = fit_llt(
            obs,
            mode=payload.calculation_mode,
            as_of=payload.as_of_date.isoformat() if payload.as_of_date else None,
            min_history=min_history,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("kalman fit failed", extra={"indicator_id": payload.indicator_id})
        return KalmanCalculationResponse(
            status="error",
            model_key=MODEL_KEY,
            model_version=MODEL_VERSION,
            indicator_id=payload.indicator_id,
            input_hash=payload.input_hash,
            points=[],
            model_params={},
            log_likelihood=None,
            converged=False,
            warnings=warnings,
            n_observations=0,
            n_missing=0,
            training_start=None,
            training_end=None,
            calculated_at=datetime.now(timezone.utc),
            detail=f"{type(exc).__name__}: {str(exc)[:400]}",
        )

    points = [
        KalmanPointDTO(
            date=p.date,
            level=p.level,
            slope=p.slope,
            level_ci_low=p.level_ci_low,
            level_ci_high=p.level_ci_high,
        )
        for p in fit.points
    ]

    status_val = "ok" if fit.status == "ok" else "insufficient_history"

    return KalmanCalculationResponse(
        status=status_val,
        model_key=MODEL_KEY,
        model_version=MODEL_VERSION,
        indicator_id=payload.indicator_id,
        input_hash=payload.input_hash,
        points=points,
        model_params=fit.model_params,
        log_likelihood=fit.log_likelihood,
        converged=fit.converged,
        warnings=warnings,
        n_observations=fit.n_observations,
        n_missing=fit.n_missing,
        training_start=fit.training_start,
        training_end=fit.training_end,
        calculated_at=datetime.now(timezone.utc),
        detail=fit.insufficient_reason,
    )


@app.post(
    "/calc/pca-factor",
    response_model=InactiveModelResponse,
    dependencies=[Depends(require_service_token)],
    tags=["calc"],
)
def calc_pca(payload: InactiveModelRequest) -> InactiveModelResponse:
    body = pca_stub.run({})
    return InactiveModelResponse(
        model_key=body["model_key"],
        model_version=body["model_version"],
        input_hash=payload.input_hash,
        reason=body["reason"],
    )


@app.post(
    "/calc/hmm-regime",
    response_model=InactiveModelResponse,
    dependencies=[Depends(require_service_token)],
    tags=["calc"],
)
def calc_hmm(payload: InactiveModelRequest) -> InactiveModelResponse:
    body = hmm_stub.run({})
    return InactiveModelResponse(
        model_key=body["model_key"],
        model_version=body["model_version"],
        input_hash=payload.input_hash,
        reason=body["reason"],
    )