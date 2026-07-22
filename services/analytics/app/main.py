"""FastAPI entry point — stateless calculation service.

The service does NOT connect to Supabase. It performs deterministic
calculations on payloads sent by the authenticated Lovable/TanStack server.

Endpoints
  GET  /healthz                 -> public health (no secrets, no PII)
  POST /calc/kalman-llt         -> run one Kalman LLT calculation
  POST /calc/pca-factor         -> market PCA (shadow persistence upstream)
  POST /calc/hmm-regime         -> Gaussian HMM (shadow persistence upstream)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import Depends, FastAPI

from .auth import require_service_token
from .config import get_settings
from .logging_config import configure_logging
from .models.kalman import MODEL_KEY, MODEL_VERSION, fit_llt, resolve_min_history
from .models.hmm import MODEL_KEY as HMM_KEY, MODEL_VERSION as HMM_VERSION, fit_hmm
from .models.pca import MODEL_KEY as PCA_KEY, MODEL_VERSION as PCA_VERSION, fit_pca
from .schemas import (
    HealthResponse,
    FactorCalculationResponse,
    FactorMatrixRequest,
    FactorPointDTO,
    HMMCalculationRequest,
    HMMCalculationResponse,
    KalmanCalculationRequest,
    KalmanCalculationResponse,
    KalmanPointDTO,
    RegimePointDTO,
)
from fastapi import HTTPException

# ---------------------------------------------------------------------------
# Approved (model_key, model_version) combinations for /calc/kalman-llt.
# The Kalman LLT runtime is shared across engines; each engine must register
# its own explicit key here. Anything else is rejected.
# ---------------------------------------------------------------------------
APPROVED_KALMAN_MODELS: dict[str, set[str]] = {
    "growth_engine.us.kalman_llt": {MODEL_VERSION},
    "inflation_engine.us.kalman_llt": {MODEL_VERSION},
    "labour_engine.us.kalman_llt": {MODEL_VERSION},
}

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

    # Strict allow-list: reject unknown keys, unsupported versions, and
    # invalid key/version combinations. Never overwrite the caller's model_key
    # with a different engine's key.
    approved_versions = APPROVED_KALMAN_MODELS.get(payload.model_key)
    if approved_versions is None:
        raise HTTPException(
            status_code=422,
            detail=(
                f"unknown model_key '{payload.model_key}'. "
                f"Approved keys: {sorted(APPROVED_KALMAN_MODELS)}"
            ),
        )
    if payload.model_version not in approved_versions:
        raise HTTPException(
            status_code=422,
            detail=(
                f"unsupported model_version '{payload.model_version}' for "
                f"model_key '{payload.model_key}'. Approved versions: "
                f"{sorted(approved_versions)}"
            ),
        )
    echo_model_key = payload.model_key
    echo_model_version = payload.model_version

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
            model_key=echo_model_key,
            model_version=echo_model_version,
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
        model_key=echo_model_key,
        model_version=echo_model_version,
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
    response_model=FactorCalculationResponse,
    dependencies=[Depends(require_service_token)],
    tags=["calc"],
)
def calc_pca(payload: FactorMatrixRequest) -> FactorCalculationResponse:
    if payload.model_key != PCA_KEY or payload.model_version != PCA_VERSION:
        raise HTTPException(status_code=422, detail=f"expected {PCA_KEY}@{PCA_VERSION}")
    if len(payload.dates) != len(payload.observations) or len(payload.feature_names) != len(payload.observations[0]):
        raise HTTPException(status_code=422, detail="dates/features do not match observation matrix")
    try:
        fit = fit_pca(payload.observations, payload.n_components, payload.max_missing_fraction)
    except ValueError as exc:
        return FactorCalculationResponse(status="insufficient_history", model_key=PCA_KEY, model_version=PCA_VERSION, input_hash=payload.input_hash, feature_names=payload.feature_names, points=[], loadings={}, explained_variance_ratio=[], missing_fraction=0, detail=str(exc))
    return FactorCalculationResponse(status="ok", model_key=PCA_KEY, model_version=PCA_VERSION, input_hash=payload.input_hash, feature_names=payload.feature_names, points=[FactorPointDTO(date=date, values=[float(v) for v in fit.scores[i]]) for i, date in enumerate(payload.dates)], loadings={name: [float(v) for v in fit.loadings[i]] for i, name in enumerate(payload.feature_names)}, explained_variance_ratio=[float(v) for v in fit.explained_variance_ratio], missing_fraction=fit.missing_fraction)


@app.post(
    "/calc/hmm-regime",
    response_model=HMMCalculationResponse,
    dependencies=[Depends(require_service_token)],
    tags=["calc"],
)
def calc_hmm(payload: HMMCalculationRequest) -> HMMCalculationResponse:
    if payload.model_key != HMM_KEY or payload.model_version != HMM_VERSION:
        raise HTTPException(status_code=422, detail=f"expected {HMM_KEY}@{HMM_VERSION}")
    if len(payload.dates) != len(payload.observations) or len(payload.feature_names) != len(payload.observations[0]):
        raise HTTPException(status_code=422, detail="dates/features do not match observation matrix")
    try:
        fit = fit_hmm(payload.observations, payload.n_states, payload.max_iter)
    except ValueError as exc:
        return HMMCalculationResponse(status="insufficient_history", model_key=HMM_KEY, model_version=HMM_VERSION, input_hash=payload.input_hash, state_labels=[], points=[], state_means=[], transition_matrix=[], converged=False, iterations=0, log_likelihood=None, detail=str(exc))
    return HMMCalculationResponse(status="ok", model_key=HMM_KEY, model_version=HMM_VERSION, input_hash=payload.input_hash, state_labels=fit.labels, points=[RegimePointDTO(date=date, state_index=int(fit.states[i]), probabilities=[float(v) for v in fit.probabilities[i]]) for i, date in enumerate(payload.dates)], state_means=[[float(v) for v in row] for row in fit.means], transition_matrix=[[float(v) for v in row] for row in fit.transition], converged=fit.converged, iterations=fit.iterations, log_likelihood=fit.log_likelihood)
