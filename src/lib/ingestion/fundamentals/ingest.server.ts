import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  markProviderSymbolFailed,
  markProviderSymbolVerified,
  providerSymbolForAsset,
  type AssetProviderIdentity,
} from "@/lib/ingestion/providers/asset-symbols.server";
import { canUse, recordCall } from "@/lib/ingestion/providers/quota.server";
import { STATEMENT_METRICS, type StatementMetricCode } from "@/lib/opportunity/fundamental-models";
import { FUNDAMENTAL_METRICS } from "./metrics";

export interface FundamentalsIngestResult {
  status: "success" | "failed" | "skipped";
  symbol: string;
  runId: string;
  rowsInserted: number;
  filingsInserted?: number;
  factsInserted?: number;
  values?: Record<string, number | null>;
  providerSymbol?: string;
  error?: string;
  reason?: string;
}

interface FmpKeyMetrics {
  marketCap?: number;
  evToEBITDATTM?: number;
  freeCashFlowYieldTTM?: number;
  returnOnEquityTTM?: number;
  returnOnInvestedCapitalTTM?: number;
  currentRatioTTM?: number;
}
interface FmpRatios {
  priceToEarningsRatioTTM?: number;
  priceToBookRatioTTM?: number;
  priceToSalesRatioTTM?: number;
  grossProfitMarginTTM?: number;
  netProfitMarginTTM?: number;
  debtToEquityRatioTTM?: number;
  currentRatioTTM?: number;
}
interface FmpProfile {
  marketCap?: number;
  beta?: number;
}

interface FmpStatementBase {
  date?: string;
  filingDate?: string;
  acceptedDate?: string;
  calendarYear?: string;
  period?: string;
  reportedCurrency?: string;
  cik?: string;
  link?: string;
  finalLink?: string;
}

interface FmpIncomeStatement extends FmpStatementBase {
  revenue?: number;
  grossProfit?: number;
  netIncome?: number;
  operatingIncome?: number;
  ebit?: number;
  weightedAverageShsOut?: number;
}

interface FmpBalanceSheet extends FmpStatementBase {
  totalAssets?: number;
  longTermDebt?: number;
  totalNonCurrentDebt?: number;
  totalCurrentAssets?: number;
  totalCurrentLiabilities?: number;
  cashAndCashEquivalents?: number;
  cashAndShortTermInvestments?: number;
  totalDebt?: number;
  propertyPlantEquipmentNet?: number;
}

interface FmpCashFlowStatement extends FmpStatementBase {
  operatingCashFlow?: number;
  netCashProvidedByOperatingActivities?: number;
}

interface FmpHistoricalKeyMetrics extends FmpStatementBase {
  marketCap?: number;
  enterpriseValue?: number;
  enterpriseValueOverEBITDA?: number;
  evToEBITDA?: number;
  evToSales?: number;
  enterpriseValueOverRevenue?: number;
  freeCashFlowYield?: number;
  [key: string]: unknown;
}

interface AnnualStatementBundle {
  income: FmpIncomeStatement[];
  balance: FmpBalanceSheet[];
  cashFlow: FmpCashFlowStatement[];
  keyMetrics: FmpHistoricalKeyMetrics[];
}

interface StatementStoreResult {
  filingsInserted: number;
  factsInserted: number;
  filingsUnchanged: number;
}

interface StatementIngestResult extends StatementStoreResult {
  status: "success" | "skipped" | "failed";
  reason?: string;
}

class FmpQuotaError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "FmpQuotaError";
  }
}

class FmpEntitlementError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "FmpEntitlementError";
  }
}

async function fmp<T>(
  endpoint: string,
  symbol: string,
  apiKey: string,
  params: Record<string, string> = {},
): Promise<T[] | null> {
  const query = new URLSearchParams({ symbol, ...params, apikey: apiKey });
  const url = `https://financialmodelingprep.com/stable/${endpoint}?${query.toString()}`;
  const res = await fetch(url);
  if (res.status === 402) {
    await recordCall("fmp", "entitlement", `${endpoint} HTTP 402`);
    throw new FmpEntitlementError(`FMP ${endpoint} entitlement unavailable (HTTP 402)`);
  }
  if (res.status === 429) {
    await recordCall("fmp", "rate_limit", `${endpoint} HTTP 429`);
    throw new FmpQuotaError("FMP quota/rate limit reached (HTTP 429)");
  }
  if (res.status === 401 || res.status === 403) {
    await recordCall("fmp", "auth", `${endpoint} HTTP ${res.status}`);
    throw new Error(`FMP ${endpoint} authentication failed (HTTP ${res.status})`);
  }
  if (!res.ok) {
    await recordCall("fmp", "error", `${endpoint} HTTP ${res.status}`);
    throw new Error(`FMP ${endpoint} HTTP ${res.status}`);
  }
  await recordCall("fmp", "ok");
  const j = (await res.json()) as unknown;
  if (!Array.isArray(j)) return null;
  return j as T[];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Backwards-compatible ticker entrypoint. A ticker is accepted only when it
 * uniquely identifies one active internal asset; cross-provider identity is
 * then resolved from asset_id + exchange.
 */
export async function runFundamentalsIngest(symbol: string): Promise<FundamentalsIngestResult> {
  const asset = await resolveUniqueAssetBySymbol(symbol);
  return runFundamentalsIngestForAsset(asset.id);
}

export async function runFundamentalsIngestForAsset(assetId: string): Promise<FundamentalsIngestResult> {
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,symbol,exchange")
    .eq("id", assetId)
    .eq("active", true)
    .eq("asset_class", "equity")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Asset ${assetId} not in active equity universe`);
  return ingestFundamentalsForAsset({
    id: String(data.id),
    symbol: String(data.symbol),
    exchange: data.exchange ? String(data.exchange) : null,
  });
}

async function ingestFundamentalsForAsset(asset: AssetProviderIdentity): Promise<FundamentalsIngestResult> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY missing");

  const providerSymbol = await providerSymbolForAsset(asset, "fmp");
  if (!providerSymbol) {
    return {
      status: "skipped",
      symbol: asset.symbol,
      runId: "",
      rowsInserted: 0,
      reason: `No FMP provider symbol is mapped for ${asset.symbol} on ${asset.exchange ?? "unknown exchange"}.`,
    };
  }

  const { data: source } = await supabaseAdmin
    .from("data_sources")
    .select("id")
    .eq("provider_code", "fmp")
    .maybeSingle();
  const sourceId = (source?.id as string | undefined) ?? null;
  if (!sourceId) throw new Error("FMP data source is not configured");

  const gate = await canUse("fmp", 250, 3);
  if (!gate.ok) {
    return {
      status: "skipped",
      symbol: asset.symbol,
      providerSymbol,
      runId: "",
      rowsInserted: 0,
      reason: gate.reason,
    };
  }

  const { data: run } = await supabaseAdmin
    .from("ingestion_runs")
    .insert({
      source_id: sourceId,
      data_category: "fundamentals",
      status: "running",
      details: {
        symbol: asset.symbol,
        exchange: asset.exchange,
        providerSymbol,
        category: "fundamentals",
      },
    })
    .select("id")
    .single();
  const runId = run!.id as string;

  try {
    const km = await fmp<FmpKeyMetrics>("key-metrics-ttm", providerSymbol, apiKey);
    const ra = await fmp<FmpRatios>("ratios-ttm", providerSymbol, apiKey);
    const pr = await fmp<FmpProfile>("profile", providerSymbol, apiKey);
    if (!(km?.length || ra?.length || pr?.length)) {
      await markProviderSymbolFailed(
        asset,
        "fmp",
        providerSymbol,
        "All current-fundamental endpoints returned empty arrays.",
      );
      throw new Error(`FMP provider symbol ${providerSymbol} returned no current-fundamental rows`);
    }

    const k = km?.[0] ?? {};
    const r = ra?.[0] ?? {};
    const p = pr?.[0] ?? {};

    const marketCap = num(p.marketCap ?? k.marketCap);
    if (!marketCap) throw new Error("missing marketCap — provider returned empty payload");

    const values: Record<string, number | null> = {
      [FUNDAMENTAL_METRICS.pe]: num(r.priceToEarningsRatioTTM),
      [FUNDAMENTAL_METRICS.pb]: num(r.priceToBookRatioTTM),
      [FUNDAMENTAL_METRICS.ps]: num(r.priceToSalesRatioTTM),
      [FUNDAMENTAL_METRICS.evEbitda]: num(k.evToEBITDATTM),
      [FUNDAMENTAL_METRICS.fcfYield]: num(k.freeCashFlowYieldTTM),
      [FUNDAMENTAL_METRICS.roe]: num(k.returnOnEquityTTM),
      [FUNDAMENTAL_METRICS.roic]: num(k.returnOnInvestedCapitalTTM),
      [FUNDAMENTAL_METRICS.grossMargin]: num(r.grossProfitMarginTTM),
      [FUNDAMENTAL_METRICS.netMargin]: num(r.netProfitMarginTTM),
      [FUNDAMENTAL_METRICS.debtEquity]: num(r.debtToEquityRatioTTM),
      [FUNDAMENTAL_METRICS.currentRatio]: num(k.currentRatioTTM ?? r.currentRatioTTM),
      [FUNDAMENTAL_METRICS.marketCap]: marketCap,
      [FUNDAMENTAL_METRICS.beta]: num(p.beta),
    };

    const negativeImpossible = new Set<string>([
      FUNDAMENTAL_METRICS.grossMargin,
      FUNDAMENTAL_METRICS.currentRatio,
      FUNDAMENTAL_METRICS.marketCap,
    ]);
    for (const [code, v] of Object.entries(values)) {
      if (v !== null && v < 0 && negativeImpossible.has(code)) values[code] = null;
    }

    const asOf = new Date().toISOString();
    const rows = Object.entries(values)
      .filter(([, v]) => v !== null)
      .map(([metric_code, value_num]) => ({
        subject_type: "asset" as const,
        subject_id: asset.id,
        metric_code,
        value_num,
        as_of: asOf,
        source_id: sourceId,
        confidence: 90,
        penalties: [] as unknown as object,
        raw: null as unknown as object,
      }));

    if (rows.length === 0) throw new Error("no usable fundamentals fields returned");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("data_points").insert(rows as any);
    if (error) throw error;

    const statements = await refreshAnnualStatementHistory({
      assetId: asset.id,
      symbol: providerSymbol,
      sourceId,
      apiKey,
    });
    const rowsInserted = rows.length + statements.factsInserted;

    await markProviderSymbolVerified(asset, "fmp", providerSymbol);
    await supabaseAdmin
      .from("ingestion_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        rows_ingested: rowsInserted,
        details: {
          symbol: asset.symbol,
          exchange: asset.exchange,
          providerSymbol,
          provider: "fmp",
          values,
          statements,
          currentCalls: 3,
          statementCalls: statements.status,
        } as unknown as Json,
      })
      .eq("id", runId);

    return {
      status: "success",
      symbol: asset.symbol,
      providerSymbol,
      runId,
      rowsInserted,
      filingsInserted: statements.filingsInserted,
      factsInserted: statements.factsInserted,
      values,
    };
  } catch (e) {
    if (e instanceof FmpQuotaError || e instanceof FmpEntitlementError) {
      await supabaseAdmin
        .from("ingestion_runs")
        .update({
          status: "skipped" as unknown as "failed",
          finished_at: new Date().toISOString(),
          error: e.message,
        })
        .eq("id", runId);
      return {
        status: "skipped",
        symbol: asset.symbol,
        providerSymbol,
        runId,
        rowsInserted: 0,
        reason: e.message,
      };
    }
    const message = failureMessage(e);
    await supabaseAdmin
      .from("ingestion_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
      .eq("id", runId);
    return {
      status: "failed",
      symbol: asset.symbol,
      providerSymbol,
      runId,
      rowsInserted: 0,
      error: message,
    };
  }
}

export async function runAllFundamentalsIngest(
  opts: { symbols?: string[]; assetIds?: string[] } = {},
): Promise<FundamentalsIngestResult[]> {
  let assetIds = opts.assetIds;
  if (!assetIds && opts.symbols) {
    assetIds = [];
    for (const symbol of opts.symbols) {
      try {
        assetIds.push((await resolveUniqueAssetBySymbol(symbol)).id);
      } catch {
        // Ambiguous symbols are deliberately not guessed. Add a failed result
        // below by preserving a sentinel id that cannot resolve.
        assetIds.push(`symbol:${symbol}`);
      }
    }
  }
  if (!assetIds) {
    const { data, error } = await supabaseAdmin
      .from("assets")
      .select("id")
      .eq("active", true)
      .eq("asset_class", "equity");
    if (error) throw error;
    assetIds = (data ?? []).map((a) => String(a.id));
  }

  const out: FundamentalsIngestResult[] = [];
  for (let index = 0; index < assetIds.length; index += 1) {
    const assetId = assetIds[index];
    const gate = await canUse("fmp", 250, 3);
    if (!gate.ok) {
      out.push({ status: "skipped", symbol: assetId, runId: "", rowsInserted: 0, reason: gate.reason });
      continue;
    }
    try {
      const result = assetId.startsWith("symbol:")
        ? {
            status: "failed" as const,
            symbol: assetId.slice("symbol:".length),
            runId: "",
            rowsInserted: 0,
            error: "Ticker is ambiguous across active exchanges; use asset identity instead.",
          }
        : await runFundamentalsIngestForAsset(assetId);
      out.push(result);
      if (result.status === "skipped" && result.reason?.toLowerCase().includes("entitlement unavailable")) {
        for (const remaining of assetIds.slice(index + 1)) {
          out.push({
            status: "skipped",
            symbol: remaining,
            runId: "",
            rowsInserted: 0,
            reason: "FMP fundamentals entitlement unavailable; remaining assets were not requested.",
          });
        }
        break;
      }
    } catch (e) {
      out.push({ status: "failed", symbol: assetId, runId: "", rowsInserted: 0, error: failureMessage(e) });
    }
    await new Promise((r) => setTimeout(r, 1250));
  }
  return out;
}

async function resolveUniqueAssetBySymbol(symbol: string): Promise<AssetProviderIdentity> {
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select("id,symbol,exchange")
    .eq("symbol", symbol.toUpperCase())
    .eq("active", true)
    .eq("asset_class", "equity")
    .limit(2);
  if (error) throw error;
  if (!data?.length) throw new Error(`Asset ${symbol} not in universe`);
  if (data.length > 1) {
    throw new Error(`Asset ticker ${symbol} is ambiguous across active exchanges; resolve by asset id.`);
  }
  const asset = data[0];
  return {
    id: String(asset.id),
    symbol: String(asset.symbol),
    exchange: asset.exchange ? String(asset.exchange) : null,
  };
}

async function refreshAnnualStatementHistory(input: {
  assetId: string;
  symbol: string;
  sourceId: string;
  apiKey: string;
}): Promise<StatementIngestResult> {
  try {
    const { data: existing, error } = await supabaseAdmin
      .from("fundamental_filings")
      .select("period_end,ingested_at")
      .eq("asset_id", input.assetId)
      .eq("source_id", input.sourceId)
      .eq("fiscal_period", "FY")
      .order("ingested_at", { ascending: false })
      .limit(20);
    if (error) {
      return emptyStatementResult("failed", `Point-in-time statement storage is unavailable: ${error.message}`);
    }
    const distinctPeriods = new Set((existing ?? []).map((row) => row.period_end));
    const latestIngestedAt = existing?.[0]?.ingested_at ?? null;
    const stale =
      !latestIngestedAt ||
      Date.now() - new Date(latestIngestedAt).getTime() > 90 * 24 * 60 * 60 * 1000;
    if (distinctPeriods.size >= 8 && !stale) {
      return emptyStatementResult(
        "skipped",
        "At least eight annual periods are stored and the latest statement check is under 90 days old.",
      );
    }

    const gate = await canUse("fmp", 250, 4);
    if (!gate.ok) return emptyStatementResult("skipped", gate.reason ?? "FMP statement quota unavailable");

    try {
      const income = await fmp<FmpIncomeStatement>("income-statement", input.symbol, input.apiKey, {
        period: "annual",
        limit: "10",
      });
      const balance = await fmp<FmpBalanceSheet>("balance-sheet-statement", input.symbol, input.apiKey, {
        period: "annual",
        limit: "10",
      });
      const cashFlow = await fmp<FmpCashFlowStatement>("cash-flow-statement", input.symbol, input.apiKey, {
        period: "annual",
        limit: "10",
      });
      let keyMetrics: FmpHistoricalKeyMetrics[] = [];
      try {
        keyMetrics =
          (await fmp<FmpHistoricalKeyMetrics>("key-metrics", input.symbol, input.apiKey, {
            period: "annual",
            limit: "10",
          })) ?? [];
      } catch (error) {
        // Historical valuation is additive evidence. A provider-plan or quota
        // limitation must not discard otherwise valid annual statements.
        if (!(error instanceof FmpQuotaError) && !(error instanceof FmpEntitlementError)) throw error;
      }
      const stored = await storeAnnualStatementHistory({
        assetId: input.assetId,
        symbol: input.symbol,
        sourceId: input.sourceId,
        bundle: {
          income: income ?? [],
          balance: balance ?? [],
          cashFlow: cashFlow ?? [],
          keyMetrics,
        },
      });
      return { status: "success", ...stored };
    } catch (error) {
      return emptyStatementResult(
        error instanceof FmpQuotaError || error instanceof FmpEntitlementError ? "skipped" : "failed",
        failureMessage(error),
      );
    }
  } catch (error) {
    return emptyStatementResult("failed", failureMessage(error));
  }
}

function emptyStatementResult(
  status: StatementIngestResult["status"],
  reason: string,
): StatementIngestResult {
  return { status, reason, filingsInserted: 0, factsInserted: 0, filingsUnchanged: 0 };
}

async function storeAnnualStatementHistory(input: {
  assetId: string;
  symbol: string;
  sourceId: string;
  bundle: AnnualStatementBundle;
}): Promise<StatementStoreResult> {
  const incomeByDate = statementMap(input.bundle.income);
  const balanceByDate = statementMap(input.bundle.balance);
  const cashByDate = statementMap(input.bundle.cashFlow);
  const keyMetricsByDate = statementMap(input.bundle.keyMetrics);
  const dates = [
    ...new Set([...incomeByDate.keys(), ...balanceByDate.keys(), ...cashByDate.keys()]),
  ]
    .filter(isIsoDate)
    .sort()
    .reverse()
    .slice(0, 10);
  let filingsInserted = 0;
  let factsInserted = 0;
  let filingsUnchanged = 0;

  for (const periodEnd of dates) {
    const income = incomeByDate.get(periodEnd);
    const balance = balanceByDate.get(periodEnd);
    const cashFlow = cashByDate.get(periodEnd);
    const keyMetrics = historicalKeyMetricForPeriod(input.bundle.keyMetrics, keyMetricsByDate, periodEnd);
    const facts = statementFacts(income, balance, cashFlow);
    if (facts.length === 0) continue;

    const contentHash = createHash("sha256")
      .update(JSON.stringify({ facts, keyMetrics: keyMetrics ?? null }))
      .digest("hex");
    const publishedAt = latestTimestamp([
      income?.acceptedDate,
      income?.filingDate,
      balance?.acceptedDate,
      balance?.filingDate,
      cashFlow?.acceptedDate,
      cashFlow?.filingDate,
    ]);
    const sourceFilingId =
      income?.finalLink ?? income?.link ?? balance?.finalLink ?? balance?.link ?? cashFlow?.finalLink ?? cashFlow?.link ?? `${input.symbol}:${periodEnd}:FY`;
    const { data: previous, error: previousError } = await supabaseAdmin
      .from("fundamental_filings")
      .select("id,content_hash,revision_no,known_at,is_restatement")
      .eq("asset_id", input.assetId)
      .eq("source_id", input.sourceId)
      .eq("period_end", periodEnd)
      .eq("fiscal_period", "FY")
      .order("revision_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError) throw previousError;
    if (previous?.content_hash === contentHash) {
      const repairRows = buildFactRows({
        facts,
        filingId: previous.id,
        assetId: input.assetId,
        sourceId: input.sourceId,
        periodEnd,
        knownAt: previous.known_at,
        revisionNo: previous.revision_no,
        isRestatement: previous.is_restatement,
      });
      const { data: repaired, error: repairError } = await supabaseAdmin
        .from("fundamental_facts")
        .upsert(repairRows, { onConflict: "filing_id,metric_code", ignoreDuplicates: true })
        .select("id");
      if (repairError) throw repairError;
      factsInserted += repaired?.length ?? 0;
      filingsUnchanged++;
      continue;
    }

    const revisionNo = previous ? previous.revision_no + 1 : 1;
    const isRestatement = Boolean(previous);
    const knownAt = new Date().toISOString();
    const raw = {
      symbol: input.symbol,
      income: income ?? null,
      balance: balance ?? null,
      cashFlow: cashFlow ?? null,
      keyMetrics: keyMetrics ?? null,
    };
    const { data: filing, error: filingError } = await supabaseAdmin
      .from("fundamental_filings")
      .insert({
        asset_id: input.assetId,
        source_id: input.sourceId,
        source_filing_id: sourceFilingId,
        content_hash: contentHash,
        period_end: periodEnd,
        fiscal_year: Number(income?.calendarYear ?? balance?.calendarYear ?? periodEnd.slice(0, 4)),
        fiscal_period: "FY",
        published_at: publishedAt,
        known_at: knownAt,
        reported_currency: income?.reportedCurrency ?? balance?.reportedCurrency ?? cashFlow?.reportedCurrency ?? null,
        revision_no: revisionNo,
        is_restatement: isRestatement,
        supersedes_filing_id: previous?.id ?? null,
        raw: raw as unknown as Json,
      })
      .select("id")
      .single();
    if (filingError) throw filingError;

    const factRows = buildFactRows({
      facts,
      filingId: filing.id,
      assetId: input.assetId,
      sourceId: input.sourceId,
      periodEnd,
      knownAt,
      revisionNo,
      isRestatement,
    });
    const { error: factsError } = await supabaseAdmin.from("fundamental_facts").insert(factRows);
    if (factsError) throw factsError;
    filingsInserted++;
    factsInserted += factRows.length;
  }

  return { filingsInserted, factsInserted, filingsUnchanged };
}

function statementMap<T extends FmpStatementBase>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    if (row.date && !result.has(row.date)) result.set(row.date, row);
  }
  return result;
}

function historicalKeyMetricForPeriod(
  rows: FmpHistoricalKeyMetrics[],
  byDate: Map<string, FmpHistoricalKeyMetrics>,
  periodEnd: string,
): FmpHistoricalKeyMetrics | undefined {
  const exact = byDate.get(periodEnd);
  if (exact) return exact;
  const year = periodEnd.slice(0, 4);
  return rows.find((row) => row.calendarYear === year || row.date?.slice(0, 4) === year);
}

function statementFacts(
  income: FmpIncomeStatement | undefined,
  balance: FmpBalanceSheet | undefined,
  cashFlow: FmpCashFlowStatement | undefined,
): Array<{ metricCode: StatementMetricCode; value: number; unit: "currency" | "shares" }> {
  const candidates: Array<{
    metricCode: StatementMetricCode;
    value: unknown;
    unit: "currency" | "shares";
  }> = [
    { metricCode: STATEMENT_METRICS.netIncome, value: income?.netIncome, unit: "currency" },
    {
      metricCode: STATEMENT_METRICS.operatingCashFlow,
      value: cashFlow?.operatingCashFlow ?? cashFlow?.netCashProvidedByOperatingActivities,
      unit: "currency",
    },
    { metricCode: STATEMENT_METRICS.totalAssets, value: balance?.totalAssets, unit: "currency" },
    { metricCode: STATEMENT_METRICS.longTermDebt, value: balance?.longTermDebt ?? balance?.totalNonCurrentDebt, unit: "currency" },
    { metricCode: STATEMENT_METRICS.currentAssets, value: balance?.totalCurrentAssets, unit: "currency" },
    { metricCode: STATEMENT_METRICS.currentLiabilities, value: balance?.totalCurrentLiabilities, unit: "currency" },
    { metricCode: STATEMENT_METRICS.sharesOutstanding, value: income?.weightedAverageShsOut, unit: "shares" },
    { metricCode: STATEMENT_METRICS.revenue, value: income?.revenue, unit: "currency" },
    { metricCode: STATEMENT_METRICS.grossProfit, value: income?.grossProfit, unit: "currency" },
    { metricCode: STATEMENT_METRICS.ebit, value: income?.ebit ?? income?.operatingIncome, unit: "currency" },
    {
      metricCode: STATEMENT_METRICS.cashAndEquivalents,
      value: balance?.cashAndCashEquivalents ?? balance?.cashAndShortTermInvestments,
      unit: "currency",
    },
    { metricCode: STATEMENT_METRICS.totalDebt, value: balance?.totalDebt, unit: "currency" },
    { metricCode: STATEMENT_METRICS.netFixedAssets, value: balance?.propertyPlantEquipmentNet, unit: "currency" },
  ];
  return candidates.flatMap((candidate) => {
    const value = num(candidate.value);
    return value === null ? [] : [{ ...candidate, value }];
  });
}

function buildFactRows(input: {
  facts: Array<{ metricCode: StatementMetricCode; value: number; unit: "currency" | "shares" }>;
  filingId: string;
  assetId: string;
  sourceId: string;
  periodEnd: string;
  knownAt: string;
  revisionNo: number;
  isRestatement: boolean;
}) {
  return input.facts.map((fact) => ({
    filing_id: input.filingId,
    asset_id: input.assetId,
    source_id: input.sourceId,
    metric_code: fact.metricCode,
    value_num: fact.value,
    unit: fact.unit,
    period_end: input.periodEnd,
    known_at: input.knownAt,
    revision_no: input.revisionNo,
    is_restatement: input.isRestatement,
    raw: null,
  }));
}

function failureMessage(error: unknown): string {
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function latestTimestamp(values: Array<string | undefined>): string | null {
  const parsed = values
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      const trimmed = value.trim();
      const iso = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? `${trimmed}T23:59:59.000Z`
        : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(trimmed)
          ? `${trimmed.replace(" ", "T")}Z`
          : trimmed;
      return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
    })
    .filter((value): value is string => Boolean(value))
    .sort();
  return parsed.at(-1) ?? null;
}
