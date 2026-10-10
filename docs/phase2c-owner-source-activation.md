# Phase 2C — Owner-authenticated official source recovery

## Why this design

The attached Lovable TanStack Start project cannot create additional Supabase Edge Functions. Lovable's Edge Function secrets are not available to the published TanStack Worker. The previously published endpoints returned HTTP 503 even after a private INTERNAL_JOB_TOKEN was generated.

**No duplicate database, cron worker, or new password is needed.** The existing Supabase Auth session already identifies the single owner account `owner@research.local`. Both ingestion APIs now require an Authorization bearer containing an actual Supabase access JWT, revalidated server-side by Supabase Auth. The email is checked against the hard-coded existing owner account **after** token verification; client-supplied email/header values do not confer ownership. Other users get 403, absent/invalid tokens 401. The public Supabase publishable key cannot be used as a bearer token.

## SEC contact configuration

This is an SEC-declared contact identity, NOT an API secret. A migration creates `public.research_provider_settings` with a single allowlisted setting `sec_edgar_user_agent`, RLS enabled, service_role-only SELECT/INSERT/UPDATE and no public or authenticated table grants. The owner-provided SEC contact string is inserted separately in the connected **production Lovable Cloud database**, not source-controlled, not a VITE variable and not exposed to browser code.

The original bounded SEC ingestion remains in `src/lib/ingestion/sec/recover-annual.server.ts`, with direct accession-matched original 10-K US-GAAP facts, <=2 assets per call, <=3 annual filings, actual first-observed timestamps and no score refresh. There is no automatic SEC backfill or job schedule.

## Owner workflow

1. Sign in to the normal Research Terminal.
2. Open **Data Health → Official-source recovery · manual**.
3. Click **Import MSFT SEC 10-K sample**. It requests only the known monitored MSFT asset UUID from the signed-in session; owner identity is revalidated in the handler. Observe the returned filing/fact counts. Then independently check the resulting official source accession and fact values before requesting a batch schedule.
4. Click **Check EODHD coverage**. It sends <=2 quota-accounted read-only provider checks, never imports earnings, changes the user's plan or touches the existing EOD price pipeline. If the runtime lacks EODHD_API_KEY, the result must honestly say unavailable; do not hardcode secrets or silently proxy via staging.
5. Data Health refreshes measured filing coverage after the SEC action. Validated samples precede any broad import.

The separate previous INTERNAL_JOB_TOKEN stored in Lovable Edge Function Secrets is **not used** by these owner endpoints. It remains private, and is not brought into this app or committed. The old cron scheduler is unaffected.

## Release and acceptance

- Required CI and container smoke pass.
- Read-only public browser smoke on published URL succeeds.
- Unauthenticated POST to both owner-only ingestion endpoints returns HTTP 401, not 200/503.
- New schema is installed in the **same original Lovable Cloud production DB**, confirmed RLS deny for anon/authenticated.
- Actual SEC facts coverage only credited following explicit owner invocation and independent source sampling.
- No claims of recovered filings/earnings until rows actually materialize. No new source schedule without approval.
