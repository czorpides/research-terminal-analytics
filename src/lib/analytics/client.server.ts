/**
 * Server-only HTTP client for the Python analytics service.
 *
 * The browser must NEVER call this service directly — all traffic goes
 * through server functions (see analytics.functions.ts) which attach the
 * shared ANALYTICS_SERVICE_TOKEN bearer.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface AnalyticsHealth {
  status: "ok";
  service_version: string;
  deploy_env: string;
}

export interface AnalyticsJobTriggerResponse {
  run_id: string;
  status: "queued" | "running" | "success" | "failed" | "superseded";
  model_key: string;
  model_version: string;
  reused: boolean;
  detail?: string | null;
}

export interface AnalyticsJobStatus {
  run_id: string;
  model_key: string;
  model_version: string;
  status: "queued" | "running" | "success" | "failed" | "superseded";
  started_at: string;
  finished_at: string | null;
  input_hash: string | null;
  output_summary: Json | null;
  error: string | null;
}

function config(): { url: string; token: string } {
  const url = process.env.ANALYTICS_SERVICE_URL;
  const token = process.env.ANALYTICS_SERVICE_TOKEN;
  if (!url) throw new Error("ANALYTICS_SERVICE_URL not configured");
  if (!token) throw new Error("ANALYTICS_SERVICE_TOKEN not configured");
  return { url: url.replace(/\/+$/, ""), token };
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { url, token } = config();
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // Never surface the token or full config; safe to include remote status + body preview.
    throw new Error(`analytics ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export function analyticsHealth(): Promise<AnalyticsHealth> {
  return call<AnalyticsHealth>("GET", "/healthz");
}

export function triggerUsGrowthKalman(
  input: { asOfDate?: string; force?: boolean } = {},
): Promise<AnalyticsJobTriggerResponse> {
  return call<AnalyticsJobTriggerResponse>("POST", "/jobs/growth-engine/us/kalman", {
    as_of_date: input.asOfDate ?? null,
    force: input.force ?? false,
  });
}

export function getAnalyticsJob(runId: string): Promise<AnalyticsJobStatus> {
  return call<AnalyticsJobStatus>("GET", `/jobs/${encodeURIComponent(runId)}`);
}