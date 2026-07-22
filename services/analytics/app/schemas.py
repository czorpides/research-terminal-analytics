"""Typed data contracts for jobs and DB rows.

These mirror the existing `model_runs` / `model_outputs` schema — no new
tables are introduced. See services/analytics/README.md for the rationale
for reusing the existing contracts.
"""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

RunStatus = Literal["queued", "running", "success", "failed", "superseded"]


class JobTriggerRequest(BaseModel):
    """Optional body for a job trigger. `as_of_date` pins the input snapshot."""

    as_of_date: date | None = None
    force: bool = False  # if True, ignore idempotency cache and run again


class JobTriggerResponse(BaseModel):
    run_id: str
    status: RunStatus
    model_key: str
    model_version: str
    reused: bool = False
    detail: str | None = None


class JobStatusResponse(BaseModel):
    run_id: str
    model_key: str
    model_version: str
    status: RunStatus
    started_at: datetime
    finished_at: datetime | None = None
    input_hash: str | None = None
    output_summary: dict[str, Any] | None = None
    error: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service_version: str
    deploy_env: str


class ModelOutputRow(BaseModel):
    model_key: str
    model_version: str
    run_id: str
    indicator_id: str
    ts: date
    output_type: str
    value: float | None
    uncertainty: float | None = None
    meta: dict[str, Any] = Field(default_factory=dict)