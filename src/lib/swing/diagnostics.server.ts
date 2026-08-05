import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  EODHD_EXCHANGE_TARGETS,
  eodhdErrorMessage,
  eodhdExchangeToMic,
  fetchEodhdAccount,
  fetchEodhdBulkEod,
  fetchEodhdDaily,
  fetchEodhdSymbolList,
  isEodhdConfigured,
} from "@/lib/ingestion/providers/eodhd-market.server";

const FMP_SCREENER_URL = "https://financialmodelingprep.com/stable/company-screener";
const FMP_EOD_BULK_URL = "https://financialmodelingprep.com/stable/eod-bulk";
const REQUEST_LIMIT = 1_000;
const DEFAULT_FMP_EXCHANGES = ["NASDAQ", "NYSE", "LSE"];

interface TableDiagnostic {
  available: boolean;
  count: number | null;
  error: string | null;
}

interface HttpProbe {
  label: string;
  httpStatus: number;
  rows: number | null;
  available: boolean;
  error: string | null;
}

export async function runSwingRuntimeDiagnostics(url: URL) {
  // New runtime tables can legitimately be absent while deployment is incomplete.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const probeEodhd = url.searchParams.get("probeEodhd") === "1";
  const probeBulk = url.searchParams.get("probeBulk") === "1";
  const probeFmp = url.searchParams.get("probeFmp") === "1";
  const probeFundamentals = url.searchParams.get("probeFundamentals") === "1";

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

  const [eodhd, fmp] = await Promise.all([
    diagnoseEodhd(probeEodhd, probeBulk),
    diagnoseFmp(url, probeFmp, probeBulk, probeFundamentals),
  ]);

  const database = {
    activeEquities: assets,
    technicalScreen,
    trackerSetups,
    trackerSnapshots,
    monitorRuns,
    backfillQueue,
  };

  return {
    asOf: new Date().toISOString(),
    database,
    eodhd,
    fmp,
    interpretation: interpret({ ...database, eodhd, fmp }),
  };
}

async function diagnoseEodhd(probe: boolean, probeBulk: boolean) {
  if (!isEodhdConfigured()) {
    return {
      configured: false,
      probed: false,
      account: null,
      symbolLists: [] as HttpProbe[],
      dailySamples: [] as HttpProbe[],
      bulkEod: null as HttpProbe | null,
      error: "EODHD_API_KEY missing",
    };
  }
  if (!probe) {
    return {
      configured: true,
      probed: false,
      account: null,
      symbolLists: [] as HttpProbe[],
      dailySamples: [] as HttpProbe[],
      bulkEod: null as HttpProbe | null,
      error: null,
    };
  }

  let account: null | {
    dailyRateLimit: number | null;
    apiRequests: number | null;
    apiRequestsDate: string | null;
    subscriptionType: string | null;
    error: string | null;
  } = null;
  try {
    const value = await fetchEodhdAccount();
    account = {
      dailyRateLimit: finite(value.dailyRateLimit),
      apiRequests: finite(value.apiRequests),
      apiRequestsDate: value.apiRequestsDate ?? null,
      subscriptionType: value.subscriptionType ?? null,
      error: null,
    };
  } catch (error) {
    account = {
      dailyRateLimit: null,
      apiRequests: null,
      apiRequestsDate: null,
      subscriptionType: null,
      error: eodhdErrorMessage(error),
    };
  }

  const symbolLists: HttpProbe[] = [];
  for (const target of EODHD_EXCHANGE_TARGETS) {
    try {
      const rows = await fetchEodhdSymbolList(target.code);
      const eligible = target.code === "US"
        ? rows.filter((row) => eodhdExchangeToMic(row.Exchange) !== null).length
        : rows.length;
      symbolLists.push({
        label: target.code,
        httpStatus: 200,
        rows: eligible,
        available: true,
        error: eligible === rows.length ? null : `${rows.length - eligible} unsupported/OTC US listings excluded`,
      });
    } catch (error) {
      symbolLists.push({
        label: target.code,
        httpStatus: providerStatus(error),
        rows: null,
        available: false,
        error: eodhdErrorMessage(error),
      });
    }
  }

  const from = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const samples = [
    ["AAPL.US", "US"],
    ["BP.LSE", "UK"],
    ["SAP.XETRA", "DE"],
    ["AIR.PA", "FR"],
    ["ASML.AS", "NL"],
  ] as const;
  const dailySamples: HttpProbe[] = [];
  for (const [ticker, label] of samples) {
    try {
      const rows = await fetchEodhdDaily(ticker, { from });
      dailySamples.push({
        label: `${label}:${ticker}`,
        httpStatus: 200,
        rows: rows.length,
        available: rows.length >= 90,
        error: rows.length >= 90 ? null : `Only ${rows.length} daily bars returned`,
      });
    } catch (error) {
      dailySamples.push({
        label: `${label}:${ticker}`,
        httpStatus: providerStatus(error),
        rows: null,
        available: false,
        error: eodhdErrorMessage(error),
      });
    }
  }

  let bulkEod: HttpProbe | null = null;
  if (probeBulk) {
    try {
      const rows = await fetchEodhdBulkEod("US", { date: previousUtcBusinessDate() });
      bulkEod = {
        label: "US bulk EOD",
        httpStatus: 200,
        rows: rows.length,
        available: rows.length > 0,
        error: rows.length > 0 ? null : "EODHD bulk endpoint returned no rows",
      };
    } catch (error) {
      bulkEod = {
        label: "US bulk EOD",
        httpStatus: providerStatus(error),
        rows: null,
        available: false,
        error: eodhdErrorMessage(error),
      };
    }
  }

  return {
    configured: true,
    probed: true,
    account,
    symbolLists,
    dailySamples,
    bulkEod,
    error: null,
  };
}

async function diagnoseFmp(url: URL, probe: boolean, probeBulk: boolean, probeFundamentals: boolean) {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    return {
      configured: false,
      probed: false,
      screener: [] as HttpProbe[],
      bulkEod: null as HttpProbe | null,
      fundamentals: [] as HttpProbe[],
      error: "FMP_API_KEY missing",
    };
  }
  if (!probe && !probeFundamentals) {
    return {
      configured: true,
      probed: false,
      screener: [] as HttpProbe[],
      bulkEod: null as HttpProbe | null,
      fundamentals: [] as HttpProbe[],
      error: null,
    };
  }

  const screener: HttpProbe[] = [];
  if (probe) {
    const exchanges = csvParam(url, "exchanges") ?? DEFAULT_FMP_EXCHANGES;
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
      screener.push(await rawHttpProbe(exchange, endpoint));
    }
  }

  let bulkEod: HttpProbe | null = null;
  if (probe && probeBulk) {
    const endpoint = new URL(FMP_EOD_BULK_URL);
    endpoint.searchParams.set("date", previousUtcBusinessDate());
    endpoint.searchParams.set("apikey", key);
    bulkEod = await rawHttpProbe("FMP bulk EOD", endpoint);
  }

  const fundamentals: HttpProbe[] = [];
  if (probeFundamentals) {
    const requests: Array<{ endpoint: string; params?: Record<string, string> }> = [
      { endpoint: "profile" },
      { endpoint: "key-metrics-ttm" },
      { endpoint: "ratios-ttm" },
      { endpoint: "income-statement", params: { period: "annual", limit: "1" } },
      { endpoint: "balance-sheet-statement", params: { period: "annual", limit: "1" } },
      { endpoint: "cash-flow-statement", params: { period: "annual", limit: "1" } },
    ];
    for (const request of requests) {
      const endpoint = new URL(`https://financialmodelingprep.com/stable/${request.endpoint}`);
      endpoint.searchParams.set("symbol", "AAPL");
      for (const [name, value] of Object.entries(request.params ?? {})) endpoint.searchParams.set(name, value);
      endpoint.searchParams.set("apikey", key);
      fundamentals.push(await rawHttpProbe(request.endpoint, endpoint));
    }
  }

  return {
    configured: true,
    probed: probe || probeFundamentals,
    screener,
    bulkEod,
    fundamentals,
    error: null,
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

async function rawHttpProbe(label: string, endpoint: URL): Promise<HttpProbe> {
  try {
    const response = await fetch(endpoint.toString());
    const body = await safeJson(response);
    const rows = Array.isArray(body) ? body.length : body && typeof body === "object" ? 1 : null;
    return {
      label,
      httpStatus: response.status,
      rows,
      available: response.ok && rows !== null && rows > 0,
      error: response.ok ? null : providerError(response.status, body),
    };
  } catch (error) {
    return { label, httpStatus: 0, rows: null, available: false, error: errorMessage(error) };
  }
}

function interpret(input: {
  activeEquities: TableDiagnostic;
  technicalScreen: TableDiagnostic;
  trackerSetups: TableDiagnostic;
  trackerSnapshots: TableDiagnostic;
  monitorRuns: TableDiagnostic;
  backfillQueue: TableDiagnostic;
  eodhd: Awaited<ReturnType<typeof diagnoseEodhd>>;
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
    findings.push(`${missingRuntimeTables} required Swing runtime table(s) are unavailable.`);
  }

  const active = input.activeEquities.count ?? 0;
  if (input.activeEquities.available && active < 2_950) {
    findings.push(`Only ${active} active equities exist in the database; managed-universe bootstrap is incomplete.`);
  }

  if (input.eodhd.probed) {
    const dailyLimit = input.eodhd.account?.dailyRateLimit ?? null;
    if (dailyLimit !== null && dailyLimit < 100_000) {
      findings.push(`EODHD account reports ${dailyLimit} API units/day; production bulk jobs must remain disabled until paid All World EOD entitlement is active.`);
    }
    const lists = input.eodhd.symbolLists.filter((item) => item.available);
    const listed = lists.reduce((sum, item) => sum + (item.rows ?? 0), 0);
    if (listed >= 3_000) {
      findings.push(`EODHD reference-data probe exposes ${listed} supported common-stock listings across the target markets; universe capacity is sufficient.`);
    }
    if (input.eodhd.bulkEod && !input.eodhd.bulkEod.available) {
      findings.push(`EODHD bulk EOD is not yet usable: ${input.eodhd.bulkEod.error ?? `HTTP ${input.eodhd.bulkEod.httpStatus}`}.`);
    } else if (input.eodhd.bulkEod?.available) {
      findings.push(`EODHD bulk EOD is available (${input.eodhd.bulkEod.rows ?? 0} US rows in the probe).`);
    }
  }

  const restrictedFundamentals = input.fmp.fundamentals.filter((item) => item.httpStatus === 402 || item.httpStatus === 403);
  if (restrictedFundamentals.length) {
    findings.push(`FMP fundamentals entitlement is missing for: ${restrictedFundamentals.map((item) => item.label).join(", ")}.`);
  } else if (input.fmp.fundamentals.length && input.fmp.fundamentals.every((item) => item.available)) {
    findings.push("FMP fundamental endpoints remain available and can stay as the platform's fundamental-data source.");
  }

  if (!findings.length) findings.push("No obvious deployment or provider capability fault was detected by this probe.");
  return findings;
}

function providerStatus(error: unknown): number {
  if (error && typeof error === "object" && "status" in error) {
    const value = Number((error as { status?: unknown }).status);
    return Number.isFinite(value) ? value : 0;
  }
  return 0;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text.slice(0, 500); }
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

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map(String);
    if (parts.length) return parts.join(" · ");
    try { return JSON.stringify(record); } catch { return String(error); }
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

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function previousUtcBusinessDate(now = new Date()): string {
  const value = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 12));
  while (value.getUTCDay() === 0 || value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}