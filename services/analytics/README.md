# Analytics Service — stateless calculator

Pure statistical calculation runtime for the research terminal. The service
**does not** connect to Supabase. It receives a fully-formed calculation
request from the authenticated Lovable/TanStack server, performs the maths
and returns deterministic results. All persistence (ingestion, vintages,
idempotency, `model_runs`, `model_outputs`) lives on the Lovable side.

## Endpoints

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET  | `/healthz`           | none   | Service status/version. No secrets. |
| POST | `/calc/kalman-llt`   | bearer | Run one local-linear-trend Kalman calculation. |
| POST | `/calc/pca-factor`   | bearer | Inactive — echoes stateless envelope. |
| POST | `/calc/hmm-regime`   | bearer | Inactive — echoes stateless envelope. |

All authenticated endpoints require `Authorization: Bearer $ANALYTICS_SERVICE_TOKEN`.
The browser must never call this service; only Lovable server functions can.

## Request contract (`/calc/kalman-llt`)

```jsonc
{
  "model_key": "growth_engine.us.kalman_llt",
  "model_version": "kalman.llt.v0.2",
  "calculation_mode": "live" | "historical",
  "as_of_date": "YYYY-MM-DD" | null,
  "training_start": "YYYY-MM-DD" | null,
  "training_end":   "YYYY-MM-DD" | null,
  "input_hash": "<sha256 hex>",
  "indicator_id": "<uuid>",
  "indicator_frequency": "daily|weekly|monthly|quarterly|annual",
  "indicator_unit": "index|percent|thousands|...",
  "observations": [{ "date": "YYYY-MM-DD", "value": 12.3 }],
  "model_config_params": { "min_history": 24 }
}
```

Observations must be ordered ascending by date. Extra top-level fields are
rejected (422). In `historical` mode any observation with `date > as_of_date`
is dropped before the fit and reported in `warnings`.

## Response contract

```jsonc
{
  "status": "ok" | "insufficient_history" | "error",
  "model_key": "...", "model_version": "...",
  "indicator_id": "<uuid>",
  "input_hash": "<echoed verbatim>",
  "points": [{ "date": "...", "level": 0, "slope": 0, "level_ci_low": 0, "level_ci_high": 0 }],
  "model_params": { ... },
  "log_likelihood": 0.0, "converged": true, "warnings": [],
  "n_observations": 0, "n_missing": 0,
  "training_start": "...", "training_end": "...",
  "calculated_at": "<ISO timestamp>",
  "detail": null
}
```

The Lovable pipeline validates `input_hash`, `indicator_id`, `model_key`,
`model_version` and `status` before writing any `model_outputs` row. On any
mismatch the run is marked `failed` and no partial outputs are persisted.

## Local install & run

```bash
cd services/analytics
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8080
```

## Tests

```bash
pytest -q
```

Covers: bearer auth (missing/wrong/right), payload validation (empty,
out-of-order, extra fields), point-in-time trimming in historical mode,
input-hash echo, and confirmation that the service starts without any
Supabase credentials in the environment.

## Environment

Only two variables matter at runtime:

- `ANALYTICS_SERVICE_TOKEN` — shared secret with the Lovable server.
- `LOG_LEVEL` — optional, defaults to `INFO`.

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are **not required and not
read**. Do not set them on Fly.

## Deployment

`Dockerfile` and `fly.toml` are ready. Deploy with `flyctl deploy` once
`ANALYTICS_SERVICE_TOKEN` is set via `flyctl secrets set`.