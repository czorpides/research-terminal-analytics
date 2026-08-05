import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FMP_SCREENER_URL = "https://financialmodelingprep.com/stable/company-screener";
const FMP_EOD_BULK_URL = "https://financialmodelingprep.com/stable/eod-bulk";
const REQUEST_LIMIT = 1_000;
const DEFAULT_EXCHANGES = ["NASDAQ", "NYSE", "LSE"];

interface TableDiagnostic {
  available: boolean;
  count: number | null;
  error: string | null;
}

interface FmpExchangeDiagnostic {
  exchange: string;
  httpStatus: number;
  rows: number | null;
  cappedAtRequestLimit: boolean;
  error: string | null;
}

export async function runSwingRuntimeDiagnostics(url: URL) {
  // New runtime tables can legitimately be absent while deployment is incomplete.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const exchanges = csvParam(url, "exchanges") ?? DEFAULT_EXCHANGES;
  const probeBulk = url.searchParams.get("probeBulk") === "1";

  const [assets, technicalScreen, trackerSetups, trackerSnapshots, monitorRuns, backfillQueue] =
    await Promise.all([
      diagnoseCount(
        supabaseAdmin
          .from("assets")
          .select("id", { count: "exact", head: true })
          .eq("active", true)
          .eq("asset_class", "equity"),
      ),
      diagnoseTable(db, "equity_technical_screen", "asset_id"),
      diagnoseTable(db, "swing_trade_setups", "id"),
      diagnoseTable(db, "swing_trade_price_snapshots", "id"),
      diagnoseTable(db, "swing_monitor_runs", "id"),
      diagnoseTable(db, "equity_eod_backfill_queue", "market_date"),
    ]);

  const fmp = await diagnoseFmp(exchanges, probeBulk);

  return {
    asOf: new Date().toISOString(),
    database: {
      activeEquities: assets,
      technicalScreen,
      trackerSetups,
      trackerSnapshots,
      monitorRuns,
      backfillQueue,
    },
    fmp,
    interpretation: interpret({
      activeEquities: assets,
      technicalScreen,
      trackerSetups,
      trackerSnapshots,
      monitorRuns,
      backfillQueue,
      fmp,
    }),
  };
}

async function diagnoseTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  table: string,
  column: string,
): Promise<TableDiagnostic> {
  try {
    const { count, error } = await db.from(table).select(column, { count: "exact", head: true });
    if (error) throw error;
    return { available: true, count: count ?? 0, error: null };
  } catch (error) {
    return { available: false, count: null, error: errorMessage(error) };
  }
}

async function diagnoseCount(
  query: PromiseLike<{ count: number | null; error: unknown }>,
): Promise<TableDiagnostic> {
  try {
    const { count, error } = await query;
    if (error) throw error;
    return { available: true, count: count ?? 0, error: null };
  } catch (error) {
    return { available: false, count: null, error: errorMessage(error) };
  }
}

async function diagnoseFmp(exchanges: string[], probeBulk: boolean) {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    return {
      configured: false,
      screener: [] as FmpExchangeDiagnostic[],
      totalRows: null as number | null,
      bulkEod: null,
      error: "FMP_API_KEY missing",
    };
  }

  const screener: FmpExchangeDiagnostic[] = [];
  for (const exchange of exchanges.slice(0, 20)) {
    const endpoint = new URL(FMP_SCREENER_URL);
    endpoint.searchParams.set("exchange", exchange);
    endpoint.searchParams.set("isEtf", "false");
    endpoint.searchParams.set("isFund", "false");
    endpoint.searchParams.set("isActivelyTrading", "true");
    endpoint.searchParams.set("marketCapMoreThan", "300000000");
    endpoint.searchParams.set("priceMoreThan", "2");
    endpoint.searchParams.set("volumeMoreThan", "50000");
    endpoint.searchParams.set("limit", String(REQUEST_LIMIT));
    endpoint.searchParams.set("apikey", key);

    try {
      const response = await fetch(endpoint.toString());
      const body = await safeJson(response);
      const rows = Array.isArray(body) ? body.length : null;
      screener.push({
        exchange,
        httpStatus: response.status,
        rows,
        cappedAtRequestLimit: rows === REQUEST_LIMIT,
        error: response.ok && Array.isArray(body) ? null : providerError(response.status, body),
      });
    } catch (error) {
      screener.push({
        exchange,
        httpStatus: 0,
        rows: null,
        cappedAtRequestLimit: false,
        error: errorMessage(error),
      });
    }
  }

  let bulkEod: null | {
    attempted: boolean;
    httpStatus: number;
    rows: number | null;
    available: boolean;
    error: string | null;
  } = null;

  if (probeBulk) {
    const endpoint = new URL(FMP_EOD_BULK_URL);
    endpoint.searchParams.set("date", previousUtcBusinessDate());
    endpoint.searchParams.set("apikey", key);
    try {
      const response = await fetch(endpoint.toString());
      const body = await safeJson(response);
      const rows = Array.isArray(body) ? body.length : null;
      bulkEod = {
        attempted: true,
        httpStatus: response.status,
        rows,
        available: response.ok && Array.isArray(body),
        error: response.ok && Array.isArray(body) ? null : providerError(response.status, body),
      };
    } catch (error) {
      bulkEod = {
        attempted: true,
        httpStatus: 0,
        rows: null,
        available: false,
        error: errorMessage(error),
      };
    }
  }

  return {
    configured: true,
    screener,
    totalRows: screener.reduce((sum, item) => sum + (item.rows ?? 0), 0),
    bulkEod,
    error: null,
  };
}

function interpret(input: {
  activeEquities: TableDiagnostic;
  technicalScreen: TableDiagnostic;
  trackerSetups: TableDiagnostic;
  trackerSnapshots: TableDiagnostic;
  monitorRuns: TableDiagnostic;
  backfillQueue: TableDiagnostic;
  fmp: Awaited<ReturnType<typeof diagnoseFmp>>;
}): string[] {
  const findings: string[] = [];
  const missingRuntimeTables = [
    input.technicalScreen,
    input.trackerSetups,
    input.trackerSnapshots,
    input.monitorRuns,
    input.backfillQueue,
  ].filter((item) => !item.available).length;

  if (missingRuntimeTables > 0) {
    findings.push(
      `${missingRuntimeTables} required Swing runtime table(s) are unavailable. The Supabase migration/deployment is incomplete.`,
    );
  }

  const active = input.activeEquities.count ?? 0;
  if (input.activeEquities.available && active < 2_950) {
    findings.push(`Only ${active} active equities exist in the database; the managed-universe bootstrap has not completed.`);
  }

  if (input.fmp.configured) {
    const successful = input.fmp.screener.filter((item) => item.httpStatus === 200 && item.rows !== null);
    const total = successful.reduce((sum, item) => sum + (item.rows ?? 0), 0);
    if (successful.length > 0 && total < 100) {
      findings.push(
        `FMP returned only ${total} screener rows across ${successful.length} successful exchange request(s). Provider-plan coverage or endpoint restrictions are a likely universe bottleneck.`,
      );
    } else if (total >= 500) {
      findings.push(
        `FMP returned ${total} screener rows across the diagnostic exchanges, so a provider asset-count cap is unlikely to explain a ~59-name database universe.`,
      );
    }
  }

  if (input.fmp.bulkEod && !input.fmp.bulkEod.available) {
    findings.push(
      `FMP bulk EOD probe failed with HTTP ${input.fmp.bulkEod.httpStatus}; the configured plan may not include the bulk endpoint.`,
    );
  }

  if (findings.length === 0) findings.push("No obvious deployment or provider coverage fault was detected by this probe.");
  return findings;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.slice(0, 500);
  }
}

function providerError(status: number, body: unknown): string {
  if (typeof body === "string" && body.trim()) return `HTTP ${status}: ${body.slice(0, 300)}`;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message = record.message ?? record.error ?? record.detail;
    if (message) return `HTTP ${status}: ${String(message)}`;
  }
  return `HTTP ${status}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map(String);
    if (parts.length) return parts.join(" · ");
    try {
      return JSON.stringify(record);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function csvParam(url: URL, key: string): string[] | undefined {
  const values = url.searchParams
    .get(key)
    ?.split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  return values?.length ? values : undefined;
}

function previousUtcBusinessDate(now = new Date()): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12));
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
