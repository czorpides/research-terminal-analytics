# Research Terminal production release checklist (Phase 1)

## Environments and ownership

- **Normal/public terminal:** https://research-terminal-analytics.lovable.app
- **Normal code:** GitHub `main`, synchronized to the Lovable project.
- **Normal database:** existing Lovable Cloud PostgreSQL/Supabase project. It contains the latest EOD prices, market scores and scheduled ingestion jobs. Never substitute the separately owned staging Supabase instance.
- **Staging terminal:** https://research-terminal-web-staging.up.railway.app
- **Staging code:** `feature/catalyst-intelligence-foundation`, with its own database and independently deployed Railway services.
- **Production authentication:** retain the existing sign-in until any wider access change is explicitly approved. A successful unauthenticated redirect does **not** demonstrate authenticated research operations.

## Required release checks

1. **CI green:** Vite/Nitro build, `node scripts/verify-production-build.mjs`, TypeScript, research model tests, and analytics tests. Do not merge when the required artifact check fails. Existing ESLint currently runs in diagnostic mode, not a release gate.
2. **Static artifacts:** client JS/CSS exist at both `dist/public/assets` and `dist/assets`; both copies match. The published host must return them with correct content types. A plain HTML HTTP 200 is not a sufficient health check.
3. **Supabase binding:** the **public** browser Supabase URL/publishable key must be bundled and point to the *existing production* database, not staging. Keep service-role credentials in server-only hosting configuration and never in `VITE_*` or `.env` committed to GitHub.
4. **Publish:** sync the reviewed `main` commit to the existing Lovable project and use **Publish/Update**. Wait for the published build rather than inferring success from commit synchronization or a pending deployment response.
5. **Production browser check:** run the GitHub Actions **Production browser availability** workflow (or `node scripts/verify-production-browser.mjs` in a Chromium-equipped environment). Verify `/`, `/auth`, `/catalysts`, `/swing-trades` and `/radar`. Confirm form hydration, protected-route redirects, loaded JS and CSS, no missing files, and no unexpected JavaScript errors.
6. **Owner-session acceptance:** in a separate authenticated session verify login, working navigation to all three research workspaces, data results and loading/error states. Never claim this is completed based on anonymous/public smoke testing.
7. **Afterwards:** confirm production prices, scores and jobs remain intact (read-only SQL). Check that source collection and scoring behaviour was not silently enabled by a deployment.

## Known issue and monitoring

- Unauthenticated deep links sometimes emit **React hydration warning #418** while redirecting to `/auth`. It is recorded as a known warning in the public smoke test because the final sign-in view is usable. It must not be represented as an authenticated-route success. Any new JS exception, missing script, broken stylesheet, absent password form, or failed redirect must fail the smoke test.
- GitHub Actions **Production browser availability** runs on a manual dispatch, on changes to its own script/workflow in PRs, and twice daily. CI failure visibility depends on repository Actions notifications/settings; this is not a guaranteed paging service.
- Source configurations and private credentials must be provisioned through supported deployment controls. The tracked `.env` is temporarily restricted to six explicitly allowed *public* project/URL/publishable-key fields and guarded by CI. Migrate it to managed build configuration when the hosting process supports that safely.

## On-call rollback order

1. Preserve the existing production database, `pg_cron` jobs and auth configuration.
2. Reproduce in a real browser and inspect failed JS/CSS/network requests before blaming data ingestion.
3. If a new publish causes a blank page, 502, or wrong backend URL, restore the last verified working Lovable publish using built-in History/Publish controls when available. **Do not** replace the database or repoint production to staging.
4. Verify `/auth` and both Radar URLs again in Chromium. Record the working code/build and log any remaining Catalyst issues separately.
5. Do not merge staging PR #60 merely to repair the normal terminal; it contains separate auth/worker/job infrastructure changes.

This runbook describes release controls, not a promise of trading-signal accuracy or a completed authenticated user-journey test.
