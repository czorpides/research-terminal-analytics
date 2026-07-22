"""Supabase PostgREST client. Service-role — bypasses RLS. Server-only.

Uses raw httpx against PostgREST to avoid pulling the async supabase-py
dependency graph. All calls are synchronous — jobs run in a threadpool via
FastAPI's BackgroundTasks so blocking here is fine.
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

import httpx

from .config import get_settings

log = logging.getLogger(__name__)


class SupabaseError(RuntimeError):
    """Raised for any non-2xx PostgREST response."""


def _client() -> httpx.Client:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise SupabaseError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured")
    key = s.supabase_service_role_key
    return httpx.Client(
        base_url=f"{s.supabase_url.rstrip('/')}/rest/v1",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=30.0,
    )


def _raise(resp: httpx.Response) -> None:
    if resp.status_code >= 300:
        raise SupabaseError(f"{resp.status_code} {resp.request.method} {resp.request.url}: {resp.text[:400]}")


# --- indicator + observation reads ---

def list_active_indicators(engine: str, region_code: str) -> list[dict[str, Any]]:
    """Return `indicator_registry` rows for a given engine + region code."""
    with _client() as c:
        regions = c.get("/regions", params={"select": "id,code", "code": f"eq.{region_code}"})
        _raise(regions)
        region_rows = regions.json()
        if not region_rows:
            return []
        region_id = region_rows[0]["id"]
        r = c.get(
            "/indicator_registry",
            params={
                "select": "id,concept_code,series_code_native,frequency,unit,direction,seasonal_adj,min_history,allowed_transformations",
                "engine": f"eq.{engine}",
                "region_id": f"eq.{region_id}",
                "is_active": "eq.true",
                "order": "concept_code.asc",
            },
        )
        _raise(r)
        return r.json()


def fetch_observations(indicator_ids: Iterable[str], as_of: str | None = None) -> list[dict[str, Any]]:
    """Read `raw_observations` for the indicators, respecting a point-in-time cutoff.

    `as_of` is an ISO date; when set, only observations with `observation_date <= as_of`
    and `known_at <= as_of` are returned (vintage-safe).
    """
    ids = list(indicator_ids)
    if not ids:
        return []
    params: dict[str, Any] = {
        "select": "indicator_id,observation_date,value,vintage_date,known_at",
        "indicator_id": f"in.({','.join(ids)})",
        "order": "indicator_id.asc,observation_date.asc",
        "limit": "50000",
    }
    if as_of:
        params["observation_date"] = f"lte.{as_of}"
        params["known_at"] = f"lte.{as_of}T23:59:59Z"
    with _client() as c:
        r = c.get("/raw_observations", params=params)
        _raise(r)
        return r.json()


# --- model_runs / model_outputs writes ---

def find_prior_success(model_key: str, model_version: str, input_hash: str) -> dict[str, Any] | None:
    with _client() as c:
        r = c.get(
            "/model_runs",
            params={
                "select": "id,status,started_at,finished_at,output_summary",
                "model_key": f"eq.{model_key}",
                "model_version": f"eq.{model_version}",
                "input_hash": f"eq.{input_hash}",
                "status": "eq.success",
                "order": "finished_at.desc",
                "limit": "1",
            },
        )
        _raise(r)
        rows = r.json()
        return rows[0] if rows else None


def insert_run(row: dict[str, Any]) -> dict[str, Any]:
    with _client() as c:
        r = c.post("/model_runs", json=row, headers={"Prefer": "return=representation"})
        _raise(r)
        return r.json()[0]


def update_run(run_id: str, patch: dict[str, Any]) -> None:
    with _client() as c:
        r = c.patch(f"/model_runs?id=eq.{run_id}", json=patch)
        _raise(r)


def get_run(run_id: str) -> dict[str, Any] | None:
    with _client() as c:
        r = c.get(
            "/model_runs",
            params={
                "select": "id,model_key,model_version,status,started_at,finished_at,input_hash,output_summary,error",
                "id": f"eq.{run_id}",
                "limit": "1",
            },
        )
        _raise(r)
        rows = r.json()
        return rows[0] if rows else None


def upsert_outputs(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    with _client() as c:
        # Unique key: (model_key, model_version, indicator_id, ts, output_type)
        r = c.post(
            "/model_outputs",
            json=rows,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        _raise(r)


def supersede_prior_runs(model_key: str, model_version: str, current_run_id: str) -> None:
    """Mark older successful runs for this (model_key, model_version) as superseded."""
    with _client() as c:
        r = c.patch(
            "/model_runs",
            params={
                "model_key": f"eq.{model_key}",
                "model_version": f"eq.{model_version}",
                "status": "eq.success",
                "id": f"neq.{current_run_id}",
            },
            json={"status": "superseded"},
        )
        _raise(r)