# Diagnosis: Why the ingest endpoints still return 503

## Finding (confirmed from platform docs, no edits made)

**Project Settings → Secrets on Lovable Cloud are Supabase Edge Function secrets.** The platform's own documentation states the 100-secret cap is "Supabase Edge Function Secret caps" — those values are injected into the Supabase Edge Function runtime only.

The published site's TanStack Start server runtime (Cloudflare Worker) receives exactly **three** server environment variables, and nothing else:

| Variable | Server (`process.env`) |
|---|---|
| Supabase URL | `SUPABASE_URL` |
| Public Key | `SUPABASE_PUBLISHABLE_KEY` |
| Service Role | `SUPABASE_SERVICE_ROLE_KEY` |

Custom secrets like `SEC_EDGAR_USER_AGENT` and `INTERNAL_JOB_TOKEN` are **not** injected into `process.env` of the published TanStack/Cloudflare SSR process. That is why both endpoints still return 503 (their "token absent" branch) even though the secrets are saved and the project was redeployed. The secrets are safe and correctly stored — they are simply not visible to that runtime. This is a platform limitation, not a misconfiguration, and no amount of re-publishing changes it.

## Consequences

- The current code path (`process.env['INTERNAL_JOB_TOKEN']` inside the route handler) can never succeed on the published Lovable site as-is.
- No user action in Project Settings can fix this — there is no UI to inject custom env vars into the Cloudflare Worker runtime.

## Safe solutions (pick one; all require a small code change, none touch data/jobs/auth)

**Option A — Database-backed job token (recommended, smallest change).**
Store the token hash in a private `public.job_secrets` table (RLS locked, service-role only). The route handler loads `supabaseAdmin` inside the handler (after verifying the caller) and compares the incoming bearer token against the stored hash. The operator sets the row once via a one-time SQL insert I provide. No plaintext token in code; rotation is a SQL update.

**Option B — Supabase Vault.**
Same idea, using the managed `vault` schema: store `INTERNAL_JOB_TOKEN` as a vault secret, read it server-side via `supabaseAdmin`. Slightly more moving parts than A.

**Option C — Move the two ingest jobs into Supabase Edge Functions.**
Edge Functions **do** receive the Project Settings secrets, so `SEC_EDGAR_USER_AGENT` / `INTERNAL_JOB_TOKEN` would work there unchanged. But this project's architecture standard is TanStack server routes (per prior decisions), so this would be an exception and duplicates deployment surface.

## Recommended plan (if approved)

1. Create migration: `public.job_secrets` table (name text PK, token_hash text, updated_at), RLS enabled, no anon/authenticated policies, service-role only.
2. Edit the two route handlers (`/api/public/ingest/sec-annual`, `/api/public/ingest/eodhd-financial-capabilities`): replace the `process.env` read with a `supabaseAdmin` lookup of the SHA-256 hash of the presented token. Keep the same 503/401/200 semantics.
3. Provide the operator a one-time SQL snippet to insert the token hash (token value chosen by the operator, never printed by me).
4. `SEC_EDGAR_USER_AGENT`: move the literal string `"ResearchTerminal czorpides@gmail.com"` into the same table (or hardcode — it is not secret, just contact info SEC requires).
5. Publish, then verify: unauthenticated POST → 401 (not 503), confirming the token is now readable.

## What is NOT needed

- No new credentials from the user beyond choosing the token value once.
- No database data changes, no cron/job changes, no auth changes.
- No further secret-manager entries.

## User step strictly required

Only one: after the code change ships, run the one-time SQL insert of the token hash (or paste the token into a throwaway settings form if you prefer I build one). Everything else is code I can write.
