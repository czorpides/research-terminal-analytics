# Standalone Railway staging: privileged HTTP authorization

**Blocker:** The existing `/api/public/*` ingestion, scoring, verification and
refresh endpoints accepted a Supabase publishable key for administrative work.
A publishable key is visible to browser clients. This branch replaces the checks
found in 18 routes with a dedicated **server-side** `INTERNAL_JOB_TOKEN`.

## Configuration

- `INTERNAL_JOB_TOKEN`: generate at least 32 random bytes, encoded as a
  43+-character base64url token. Configure as a **runtime-only** secret in
  Railway staging; no `VITE_` prefix, no GitHub commit, and no browser access.
- `SUPABASE_SERVICE_ROLE_KEY`: keep runtime-only. The external Supabase project
  currently has no auth users; do not treat it as production-ready.
- `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY` are **public**.
  They must match the external project but cannot authenticate administrative
  endpoints.
- Protected endpoints require `Authorization: Bearer <INTERNAL_JOB_TOKEN>`.
  Unauthorized or missing tokens return 401, including publishable-key-only calls.

**Breaking operational change:** The original Lovable pg_cron jobs may still
send `apikey` with the public Supabase key. Those jobs will not authenticate
against this hardened staging branch until the scheduler is deliberately
reconfigured to send the private bearer token. Do not activate a second
scheduler or reuse the original project's service-role key.

## Checks before any public domain or deployment

1. Verify all endpoints that mutate data, trigger models, spend provider
   quotas, or access privileged records are protected; these 18 route
   replacements cover only the identified old `apikey` pattern.
2. Test unauthorized calls with no credentials and a publishable key (401);
   test exact internal bearer token only from a secured operator/scheduler.
3. Enable `INTERNAL_JOB_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY` as sealed
   runtime secrets using the Railway dashboard or a secure connector.
4. Verify auth, permissions, test accounts, safe scheduled ingestion and data
   parity before production cutover.
5. Do not merge this branch into original Lovable `main` until its existing
   scheduler endpoints have an approved migration path. Keep Lovable intact.

No investment filter, schema, price history or stored score changes are made.
