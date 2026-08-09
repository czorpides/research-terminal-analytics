# Standalone deployment

The Research Terminal is a TanStack Start application built with Vite and Nitro. It no longer requires Lovable Cloud for hosting or database access.

## Runtime

- Node.js 22
- Build: `npm run build`
- Start: `npm run start`
- Default port: `3000` (hosts may override `PORT`)
- Container deployment is supported through the repository `Dockerfile`.

## Required environment

Copy the variable names from `.env.example` into the hosting provider's secret/environment settings. Never commit real values.

The browser-side `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are public client configuration and must be available **during the Vite/Docker build**. The Dockerfile accepts both as build arguments. The server-side `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are runtime environment variables. `SUPABASE_SERVICE_ROLE_KEY` must remain server-only and must never be passed as a Docker build argument.

The browser and server Supabase values must reference the same owned Supabase project.

## Supabase

Repository configuration targets the owned Supabase project in `supabase/config.toml`.

Do not enable database cron jobs until the replacement application has a stable public URL. Cron HTTP targets must be changed from the legacy Lovable URL to the replacement host before activation.

## Cutover sequence

1. Deploy this repository to the replacement host with the required build-time and runtime environment variables.
2. Verify the home page, authenticated routes and public API endpoints.
3. Bootstrap/verify the owner account.
4. Run provider/analytics health checks.
5. Recompute Opportunity Radar technical scores from the migrated `prices_daily` history.
6. Verify Opportunity Radar health and distribution.
7. Point Supabase scheduled jobs at the replacement host and enable them.
8. Observe ingestion/scoring for at least one successful cycle.
9. Only then retire the legacy Lovable deployment.

## Rollback

Until step 9, the legacy Lovable application remains the rollback target. Do not delete or mutate its database merely because the replacement deployment is healthy.
