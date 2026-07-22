"""Job orchestration for the US Growth Kalman filter.

Idempotency
-----------
A run is keyed by SHA-256 of the JSON-encoded tuple
`(model_key, model_version, sorted (indicator_id, observation_date, value)
triples, as_of_date)`. If a prior `model_runs` row with the same hash has
status='success', we return that run id immediately and write no new outputs
(the unique constraint on `model_outputs` is a second line of defence).

State machine
-------------
queued -> running -> success | failed
On success, older successful runs for the same (model_key, model_version)
are marked 'superseded'.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import date, datetime, timezone
from typing import Any

from ..config import get_settings
from ..models.kalman import MODEL_KEY, MODEL_VERSION, fit_llt
from .. import db

log = logging.getLogger(__name__)

ENGINE = "growth"
REGION_CODE = "US"


def _hash_inputs(
    model_key: str,
    model_version: str,
    triples: list[tuple[str, str, float | None]],
    as_of_date: str | None,
) -> str:
    payload = json.dumps(
        {
            "model_key": model_key,
            "model_version": model_version,
            "as_of_date": as_of_date,
            "triples": sorted([[a, b, c] for a, b, c in triples]),
        },
        separators=(",", ":"),
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def prepare_run(as_of_date: str | None, force: bool) -> dict[str, Any]:
    """Create a `model_runs` row in status='queued'. If an identical prior
    success exists and `force` is False, return that run instead."""
    indicators = db.list_active_indicators(ENGINE, REGION_CODE)
    if not indicators:
        raise RuntimeError(f"no active indicators for engine={ENGINE} region={REGION_CODE}")

    obs = db.fetch_observations([i["id"] for i in indicators], as_of=as_of_date)
    triples: list[tuple[str, str, float | None]] = [
        (o["indicator_id"], o["observation_date"], (float(o["value"]) if o["value"] is not None else None))
        for o in obs
    ]
    input_hash = _hash_inputs(MODEL_KEY, MODEL_VERSION, triples, as_of_date)

    if not force:
        prior = db.find_prior_success(MODEL_KEY, MODEL_VERSION, input_hash)
        if prior is not None:
            return {
                "run_id": prior["id"],
                "status": "success",
                "reused": True,
                "input_hash": input_hash,
                "detail": "prior successful run with identical inputs reused",
            }

    settings = get_settings()
    run_row = db.insert_run(
        {
            "model_key": MODEL_KEY,
            "model_version": MODEL_VERSION,
            "status": "queued",
            "input_hash": input_hash,
            "service_version": settings.service_version,
            "output_summary": {
                "engine": ENGINE,
                "region": REGION_CODE,
                "indicators": len(indicators),
                "observations": len(triples),
                "as_of_date": as_of_date,
            },
        }
    )
    return {
        "run_id": run_row["id"],
        "status": "queued",
        "reused": False,
        "input_hash": input_hash,
        "indicators": indicators,
        "triples": triples,
    }


def execute_run(run_id: str, indicators: list[dict[str, Any]], triples: list[tuple[str, str, float | None]]) -> None:
    """Run the Kalman filter per indicator and persist outputs. Never raises."""
    started = datetime.now(timezone.utc)
    try:
        db.update_run(run_id, {"status": "running"})

        # Group observations by indicator
        by_ind: dict[str, list[tuple[str, float | None]]] = {i["id"]: [] for i in indicators}
        for ind_id, ts, val in triples:
            if ind_id in by_ind:
                by_ind[ind_id].append((ts, val))

        calc_ts = datetime.now(timezone.utc).isoformat()
        rows: list[dict[str, Any]] = []
        indicator_summaries: list[dict[str, Any]] = []
        skipped: list[dict[str, Any]] = []

        for ind in indicators:
            series = sorted(by_ind.get(ind["id"], []), key=lambda p: p[0])
            if len(series) < 4:
                skipped.append({"indicator_id": ind["id"], "concept_code": ind["concept_code"], "reason": f"only {len(series)} observations"})
                continue
            try:
                fit = fit_llt(series)
            except Exception as exc:  # noqa: BLE001 — never fail the whole run for one indicator
                log.exception("indicator fit failed", extra={"run_id": run_id, "model_key": MODEL_KEY})
                skipped.append({"indicator_id": ind["id"], "concept_code": ind["concept_code"], "reason": str(exc)[:200]})
                continue

            base_meta = {
                "model_run_id": run_id,
                "model_version": MODEL_VERSION,
                "calculation_timestamp": calc_ts,
                "input_data_version": "raw_observations.v1",
                "indicator_series_code": ind["series_code_native"],
                "concept_code": ind["concept_code"],
            }
            for pt in fit.points:
                rows.append({"model_key": MODEL_KEY, "model_version": MODEL_VERSION, "run_id": run_id,
                             "indicator_id": ind["id"], "ts": pt.date, "output_type": "kalman_level",
                             "value": pt.level, "uncertainty": (pt.level_ci_high - pt.level_ci_low) / 2.0,
                             "meta": base_meta})
                rows.append({"model_key": MODEL_KEY, "model_version": MODEL_VERSION, "run_id": run_id,
                             "indicator_id": ind["id"], "ts": pt.date, "output_type": "kalman_slope",
                             "value": pt.slope, "uncertainty": None, "meta": base_meta})
                rows.append({"model_key": MODEL_KEY, "model_version": MODEL_VERSION, "run_id": run_id,
                             "indicator_id": ind["id"], "ts": pt.date, "output_type": "kalman_level_ci_low",
                             "value": pt.level_ci_low, "uncertainty": None, "meta": base_meta})
                rows.append({"model_key": MODEL_KEY, "model_version": MODEL_VERSION, "run_id": run_id,
                             "indicator_id": ind["id"], "ts": pt.date, "output_type": "kalman_level_ci_high",
                             "value": pt.level_ci_high, "uncertainty": None, "meta": base_meta})

            indicator_summaries.append({
                "indicator_id": ind["id"], "concept_code": ind["concept_code"],
                "n_observations": fit.n_observations, "n_missing": fit.n_missing,
                "log_likelihood": fit.log_likelihood, "converged": fit.converged,
                "latest": {"date": fit.points[-1].date, "level": fit.points[-1].level, "slope": fit.points[-1].slope},
            })

        # Chunked upsert to keep request bodies bounded
        for i in range(0, len(rows), 500):
            db.upsert_outputs(rows[i : i + 500])

        finished = datetime.now(timezone.utc)
        summary = {
            "engine": ENGINE, "region": REGION_CODE,
            "indicators_processed": len(indicator_summaries),
            "indicators_skipped": len(skipped),
            "output_rows": len(rows),
            "duration_ms": int((finished - started).total_seconds() * 1000),
            "per_indicator": indicator_summaries,
            "skipped": skipped,
        }
        db.update_run(run_id, {"status": "success", "finished_at": finished.isoformat(), "output_summary": summary})
        db.supersede_prior_runs(MODEL_KEY, MODEL_VERSION, run_id)
        log.info("kalman run success", extra={"run_id": run_id, "model_key": MODEL_KEY, "duration_ms": summary["duration_ms"]})
    except Exception as exc:  # noqa: BLE001
        log.exception("kalman run failed", extra={"run_id": run_id, "model_key": MODEL_KEY})
        try:
            db.update_run(run_id, {
                "status": "failed",
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error": f"{type(exc).__name__}: {str(exc)[:500]}",
            })
        except Exception:  # noqa: BLE001
            log.exception("failed to mark run failed", extra={"run_id": run_id})