"""Typed data contracts for the stateless calculation service.

The service does NOT talk to Supabase. It receives a fully-formed
calculation request from the Lovable/TanStack server, performs the maths
and returns the calculated series + diagnostics. Persistence, idempotency,
vintages and model_runs/model_outputs writes all live on the Lovable side.
"""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CalcMode = Literal["live", "historical"]
CalcStatus = Literal["ok", "insufficient_history", "error"]


class Observation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: date
    value: float | None = None


class KalmanModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min_history: int | None = None


class KalmanCalculationRequest(BaseModel):
    """Everything the Kalman filter needs. No credentials, no user data."""

    model_config = ConfigDict(extra="forbid")

    model_key: str
    model_version: str
    calculation_mode: CalcMode
    as_of_date: date | None = None
    training_start: date | None = None
    training_end: date | None = None
    input_hash: str = Field(min_length=8, max_length=128)
    indicator_id: str
    indicator_frequency: Literal["daily", "weekly", "monthly", "quarterly", "annual"]
    indicator_unit: str
    observations: list[Observation]
    model_config_params: KalmanModelConfig = Field(default_factory=KalmanModelConfig, alias="model_config_params")

    @field_validator("observations")
    @classmethod
    def _non_empty_and_ordered(cls, v: list[Observation]) -> list[Observation]:
        if not v:
            raise ValueError("observations must not be empty")
        prev: date | None = None
        for o in v:
            if prev is not None and o.date < prev:
                raise ValueError("observations must be ordered ascending by date")
            prev = o.date
        return v


class KalmanPointDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: date
    level: float
    slope: float
    level_ci_low: float
    level_ci_high: float


class KalmanCalculationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: CalcStatus
    model_key: str
    model_version: str
    indicator_id: str
    input_hash: str
    points: list[KalmanPointDTO]
    model_params: dict[str, float]
    log_likelihood: float | None = None
    converged: bool
    warnings: list[str] = Field(default_factory=list)
    n_observations: int
    n_missing: int
    training_start: date | None = None
    training_end: date | None = None
    calculated_at: datetime
    detail: str | None = None


class InactiveModelRequest(BaseModel):
    """Shared stateless contract for PCA / HMM. Same envelope, no computation."""

    model_config = ConfigDict(extra="forbid")
    model_key: str
    model_version: str
    input_hash: str
    payload: dict[str, Any] = Field(default_factory=dict)


class InactiveModelResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["inactive"] = "inactive"
    model_key: str
    model_version: str
    input_hash: str
    reason: str


class FactorMatrixRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_key: str
    model_version: str
    input_hash: str = Field(min_length=8, max_length=128)
    dates: list[date]
    feature_names: list[str]
    observations: list[list[float | None]]
    n_components: int = Field(default=2, ge=1, le=5)
    max_missing_fraction: float = Field(default=0.2, ge=0, le=0.5)

    @field_validator("observations")
    @classmethod
    def _matrix_shape(cls, value: list[list[float | None]], info):
        if not value:
            raise ValueError("observations must not be empty")
        width = len(value[0])
        if width < 2 or any(len(row) != width for row in value):
            raise ValueError("observations must be a rectangular matrix with at least two columns")
        return value


class FactorPointDTO(BaseModel):
    date: date
    values: list[float]


class FactorCalculationResponse(BaseModel):
    status: Literal["ok", "insufficient_history", "error"]
    model_key: str
    model_version: str
    input_hash: str
    feature_names: list[str]
    points: list[FactorPointDTO]
    loadings: dict[str, list[float]]
    explained_variance_ratio: list[float]
    missing_fraction: float
    detail: str | None = None


class HMMCalculationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model_key: str
    model_version: str
    input_hash: str = Field(min_length=8, max_length=128)
    dates: list[date]
    feature_names: list[str]
    observations: list[list[float]]
    n_states: int = Field(default=3, ge=2, le=5)
    max_iter: int = Field(default=100, ge=10, le=500)

    @field_validator("observations")
    @classmethod
    def _hmm_matrix_shape(cls, value: list[list[float]]):
        if not value:
            raise ValueError("observations must not be empty")
        width = len(value[0])
        if width < 1 or any(len(row) != width for row in value):
            raise ValueError("observations must be a non-empty rectangular matrix")
        return value


class RegimePointDTO(BaseModel):
    date: date
    state_index: int
    probabilities: list[float]


class HMMCalculationResponse(BaseModel):
    status: Literal["ok", "insufficient_history", "error"]
    model_key: str
    model_version: str
    input_hash: str
    state_labels: list[str]
    points: list[RegimePointDTO]
    state_means: list[list[float]]
    transition_matrix: list[list[float]]
    converged: bool
    iterations: int
    log_likelihood: float | None
    detail: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service_version: str
    deploy_env: str
