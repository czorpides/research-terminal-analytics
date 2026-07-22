"""FastAPI entry point.

Endpoints
  GET  /healthz                          -> public health (no secrets)
  POST /jobs/growth-engine/us/kalman     -> trigger Kalman LLT run
  POST /jobs/growth-engine/us/pca        -> 501 inactive
  POST /jobs/regime-monitor/us/hmm       -> 501 inactive
  GET  /jobs/{run_id}                    -> run status from model_runs
"""
from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, HTTPException, status

from .auth import require_service_token
from .config import get_settings
from .logging_config import configure_logging
from .jobs.runner import execute_run, prepare_run
from .models import hmm_stub, pca_stub
from .models.kalman import MODEL_KEY, MODEL_VERSION
from .schemas import HealthResponse, JobStatusResponse, JobTriggerRequest, JobTriggerResponse
from . import db

settings = get_settings()
configure_logging(settings.log_level)
log = logging.getLogger("analytics")

app = FastAPI(title="Research Terminal — Analytics", version=settings.service_version)


@app.get("/healthz", response_model=HealthResponse, tags=["public"])
def healthz() -> HealthResponse:
    return HealthResponse(service_version=settings.service_version, deploy_env=settings.deploy_env)


@app.post(
    "/jobs/growth-engine/us/kalman",
    response_model=JobTriggerResponse,
    dependencies=[Depends(require_service_token)],
    tags=["jobs"],
)
def trigger_us_growth_kalman(payload: JobTriggerRequest) -> JobTriggerResponse:
    """Synchronous execution.

    Stage 1 Kalman runs finish in well under a minute for the five US Growth
    series, so we do the whole thing inside the request. This avoids the
    risk of an auto-stopping Fly machine terminating an in-process
    BackgroundTask before it can mark the run success or write outputs.
    """
    try:
        prep = prepare_run(
            as_of_date=payload.as_of_date.isoformat() if payload.as_of_date else None,
            force=payload.force,
            mode=payload.mode,
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("prepare_run failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="failed to queue run") from exc

    if prep.get("reused"):
        return JobTriggerResponse(
            run_id=prep["run_id"], status="success", model_key=MODEL_KEY, model_version=MODEL_VERSION,
            reused=True, detail=prep.get("detail"),
        )

    # Executes inline. execute_run never raises — on failure it marks the
    # model_runs row status='failed' and records the error.
    execute_run(
        prep["run_id"], prep["indicators"], prep["triples"],
        prep.get("as_of_date"), prep.get("mode", "live"),
    )

    row = db.get_run(prep["run_id"]) or {}
    final_status = row.get("status", "failed")
    detail = None
    if final_status == "success":
        summary = row.get("output_summary") or {}
        skipped = summary.get("indicators_skipped") or 0
        processed = summary.get("indicators_processed") or 0
        if skipped and processed:
            detail = f"partial: {processed} processed, {skipped} skipped"
    elif final_status == "failed":
        detail = row.get("error")
    return JobTriggerResponse(
        run_id=prep["run_id"], status=final_status,
        model_key=MODEL_KEY, model_version=MODEL_VERSION,
        reused=False, detail=detail,
    )


@app.post("/jobs/growth-engine/us/pca", dependencies=[Depends(require_service_token)], tags=["jobs"])
def trigger_pca() -> dict:
    return _inactive_response(pca_stub.run({}))


@app.post("/jobs/regime-monitor/us/hmm", dependencies=[Depends(require_service_token)], tags=["jobs"])
def trigger_hmm() -> dict:
    return _inactive_response(hmm_stub.run({}))


@app.get(
    "/jobs/{run_id}",
    response_model=JobStatusResponse,
    dependencies=[Depends(require_service_token)],
    tags=["jobs"],
)
def job_status(run_id: str) -> JobStatusResponse:
    try:
        row = db.get_run(run_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("get_run failed")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="failed to load run") from exc
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="run not found")
    return JobStatusResponse(
        run_id=row["id"], model_key=row["model_key"], model_version=row["model_version"],
        status=row["status"], started_at=row["started_at"], finished_at=row.get("finished_at"),
        input_hash=row.get("input_hash"), output_summary=row.get("output_summary"), error=row.get("error"),
    )


def _inactive_response(body: dict) -> dict:
    # 501 Not Implemented conveys that the endpoint exists but the model is
    # intentionally not activated in Stage 1.
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail=body)