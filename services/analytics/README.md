# Analytics Service

Stage-1 statistical analytics runtime for the research terminal.

**Live models in Stage 1**

- `growth_engine.us.kalman_llt` — US Growth Engine local-linear-trend Kalman
  filter (Statsmodels `UnobservedComponents`, `level='local linear trend'`).
  Filtered (point-in-time) estimates only; no smoothing. Emits latent level,
  slope, and 95% confidence bounds per indicator per observation date.

**Inactive interfaces (not fabricated in Stage 1)**

- `growth_engine.us.pca_factor` — returns `501 inactive` until Kalman-filtered
  series pass missing-observation, frequency, scaling, stationarity and
  vintage tests.
- `regime_monitor.us.hmm` — returns `501 inactive` until PCA factors are
  stable and states pass convergence / interpretability / persistence /
  OOS / label-stability review.

## Endpoints

| Method | Path | Auth | Purpose |
| ------ | ---- | ---- | ------- |
| GET  | `/healthz` | none | Service status, version, environment. No secrets. |
| POST | `/jobs/growth-engine/us/kalman` | bearer | Trigger a US Growth Kalman run. |
| POST | `/jobs/growth-engine/us/pca` | bearer | Returns `501 inactive`. |
| POST | `/jobs/regime-monitor/us/hmm` | bearer | Returns `501 inactive`. |
| GET  | `/jobs/{run_id}` | bearer | Return `model_runs` status + summary. |

All authenticated endpoints require `Authorization: Bearer $ANALYTICS_SERVICE_TOKEN`.

## Local install

```bash
cd services/analytics
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # then fill in values
```

## Run locally

```bash
uvicorn app.main:app --reload --port 8080
```

## Tests

```bash
pytest -q
```

Tests cover: constant series, linear rise, noisy rise, missing observations,
temporary outlier, and a no-lookahead assertion (filtered estimate at time
t only sees data up to t).

## Environment

See `.env.example`. Never commit real values.

## Idempotency

A job is keyed by SHA-256 of `(model_key, model_version, sorted (indicator_id,
observation_date, value) triples, as_of_date)`. If a prior `model_runs` row
with the same `input_hash` already succeeded, that run's id is returned
immediately and no new outputs are written. The `model_outputs` table also
has a unique constraint on `(model_key, model_version, indicator_id, ts,
output_type)` as a second line of defence.

## Deployment

Not deployed in this scaffold. `Dockerfile` and `fly.toml` are ready; deploy
with `flyctl deploy` once a Fly account is provisioned and secrets are set
in Fly. See `.env.example` for the required names.