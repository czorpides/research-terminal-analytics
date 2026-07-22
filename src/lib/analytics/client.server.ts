/**
 * Server-only HTTP client for the stateless Python calculation service.
 *
 * The Python service is a pure calculator: it receives a fully-formed
 * request from THIS Lovable server, returns filtered levels/slopes/CI +
 * diagnostics, and never touches the database. All persistence
 * (model_runs, model_outputs, vintages) happens in Lovable Cloud on this
 * side of the wire. The browser must NEVER call the Python service.
 */

export interface AnalyticsHealth {
  status: "ok";
  service_version: string;
  deploy_env: string;
}

export type CalcMode = "live" | "historical";
export type CalcStatus = "ok" | "insufficient_history" | "error";

export interface KalmanCalculationRequest {
  model_key: string;
  model_version: string;
  calculation_mode: CalcMode;
  as_of_date: string | null;
  training_start: string | null;
  training_end: string | null;
  input_hash: string;
  indicator_id: string;
  indicator_frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  indicator_unit: string;
  observations: Array<{ date: string; value: number | null }>;
  model_config_params: { min_history?: number | null };
}

export interface KalmanCalculationPoint {
  date: string;
  level: number;
  slope: number;
  level_ci_low: number;
  level_ci_high: number;
}

export interface KalmanCalculationResponse {
  status: CalcStatus;
  model_key: string;
  model_version: string;
  indicator_id: string;
  input_hash: string;
  points: KalmanCalculationPoint[];
  model_params: Record<string, number>;
  log_likelihood: number | null;
  converged: boolean;
  warnings: string[];
  n_observations: number;
  n_missing: number;
  training_start: string | null;
  training_end: string | null;
  calculated_at: string;
  detail: string | null;
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
    // Never surface the token; safe to include remote status + body preview.
    throw new Error(`analytics ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export function analyticsHealth(): Promise<AnalyticsHealth> {
  return call<AnalyticsHealth>("GET", "/healthz");
}

export function calculateKalmanLlt(
  request: KalmanCalculationRequest,
): Promise<KalmanCalculationResponse> {
  return call<KalmanCalculationResponse>("POST", "/calc/kalman-llt", request);
}