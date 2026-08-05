import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";

export interface AdvancedPriceBar {
  date: string;
  close: number;
  adjustedClose: number;
  volume: number | null;
}

export interface AdvancedStatementPeriod {
  periodEnd: string;
  knownAt: string | null;
  isRestatement: boolean;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  netIncome: number | null;
  dilutedShares: number | null;
  cashAndInvestments: number | null;
  totalDebt: number | null;
  totalEquity: number | null;
  totalAssets: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  freeCashFlow: number | null;
  dividendsPaid: number | null;
  shareRepurchases: number | null;
  shareIssuance: number | null;
  stockBasedCompensation: number | null;
  interestExpense: number | null;
}

export interface AdvancedExpectationSnapshot {
  provider: string;
  lastVerifiedAt: string;
  confidence: number;
  referencePrice: number | null;
  fy1Date: string | null;
  fy1EpsAvg: number | null;
  fy1EpsLow: number | null;
  fy1EpsHigh: number | null;
  fy1EpsAnalysts: number | null;
  fy1RevenueAvg: number | null;
  fy1RevenueLow: number | null;
  fy1RevenueHigh: number | null;
  fy1RevenueAnalysts: number | null;
  fy2Date: string | null;
  fy2EpsAvg: number | null;
  fy2RevenueAvg: number | null;
  targetConsensus: number | null;
  targetMedian: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  targetLastMonthAvg: number | null;
  targetLastQuarterAvg: number | null;
  targetLastYearAvg: number | null;
  forwardPe: number | null;
  impliedTargetUpsidePct: number | null;
}

export interface AdvancedEarningsEvent {
  scheduledAt: string;
  periodEnd: string | null;
  estimateEps: number | null;
  actualEps: number | null;
  surprisePct: number | null;
}

export interface AdvancedSecurityResearch {
  asOf: string;
  identity: {
    assetId: string;
    symbol: string;
    name: string;
    exchange: string | null;
    currency: string | null;
    assetClass: string | null;
    industry: string | null;
    country: string | null;
  };
  price: {
    current: number | null;
    adjustedCurrent: number | null;
    latestDate: string | null;
    high52: number | null;
    low52: number | null;
    drawdownFromHighPct: number | null;
    return1mPct: number | null;
    return3mPct: number | null;
    return6mPct: number | null;
    return12mPct: number | null;
    history: AdvancedPriceBar[];
  };
  fundamentals: {
    asOf: string | null;
    values: Record<string, number | null>;
  };
  statements: AdvancedStatementPeriod[];
  expectations: AdvancedExpectationSnapshot | null;
  earnings: AdvancedEarningsEvent[];
  providerMappings: Array<{
    provider: string;
    symbol: string;
    status: string;
    lastVerifiedAt: string | null;
  }>;
}

const inputSchema = z.object({ assetId: z.string().uuid() });

export const getAdvancedSecurityResearch = createServerFn({ method: "GET" })
  .inputValidator((value: { assetId: string }) => inputSchema.parse(value))
  .handler(async ({ data }): Promise<AdvancedSecurityResearch | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Several of the evidence tables were introduced after the generated
    // Supabase types. Keep this loader deployment-safe until those types are regenerated.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

    const { data: asset, error: assetError } = await db
      .from("assets")
      .select("id,symbol,name,exchange,currency,asset_class,industry_id,country_id")
      .eq("id", data.assetId)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return null;

    const [industryResult, countryResult, priceResult, fundResult, filingResult, expectationResult, earningsResult, mappingResult] = await Promise.all([
      asset.industry_id
        ? db.from("industries").select("name").eq("id", asset.industry_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      asset.country_id
        ? db.from("countries").select("name").eq("id", asset.country_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.from("prices_daily")
        .select("trade_date,close,adj_close,volume")
        .eq("asset_id", data.assetId)
        .order("trade_date", { ascending: false })
        .limit(1300),
      db.from("latest_asset_fundamentals")
        .select("metric_code,value_num,as_of")
        .eq("subject_id", data.assetId)
        .in("metric_code", Object.values(FUNDAMENTAL_METRICS)),
      db.from("fundamental_filings")
        .select("period_end,known_at,revision_no,is_restatement,raw")
        .eq("asset_id", data.assetId)
        .eq("fiscal_period", "FY")
        .order("period_end", { ascending: false })
        .order("revision_no", { ascending: false })
        .limit(12),
      db.from("analyst_expectation_snapshots")
        .select("provider_code,last_verified_at,confidence,reference_price,fy1_date,fy1_eps_avg,fy1_eps_low,fy1_eps_high,fy1_eps_analysts,fy1_revenue_avg,fy1_revenue_low,fy1_revenue_high,fy1_revenue_analysts,fy2_date,fy2_eps_avg,fy2_revenue_avg,target_consensus,target_median,target_high,target_low,target_last_month_avg,target_last_quarter_avg,target_last_year_avg")
        .eq("asset_id", data.assetId)
        .eq("validation_state", "accepted")
        .order("last_verified_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("earnings_events")
        .select("scheduled_at,period_end,estimate_eps,actual_eps,surprise_pct")
        .eq("asset_id", data.assetId)
        .order("scheduled_at", { ascending: false })
        .limit(8),
      db.from("asset_provider_symbols")
        .select("provider_code,provider_symbol,mapping_status,last_verified_at")
        .eq("asset_id", data.assetId)
        .order("provider_code", { ascending: true }),
    ]);

    for (const result of [priceResult, fundResult, filingResult, earningsResult]) {
      if (result.error) throw result.error;
    }

    const history = ((priceResult.data ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const close = positive(row.close);
        const adjusted = positive(row.adj_close) ?? close;
        if (!close || !adjusted || !row.trade_date) return null;
        return {
          date: String(row.trade_date),
          close,
          adjustedClose: adjusted,
          volume: finite(row.volume),
        } satisfies AdvancedPriceBar;
      })
      .filter((row): row is AdvancedPriceBar => Boolean(row))
      .reverse();

    const latest = history.at(-1) ?? null;
    const trailing = history.slice(-252);
    const high52 = trailing.length ? Math.max(...trailing.map((row) => row.adjustedClose)) : null;
    const low52 = trailing.length ? Math.min(...trailing.map((row) => row.adjustedClose)) : null;

    const fundamentalRows = (fundResult.data ?? []) as Array<{
      metric_code: string;
      value_num: number | null;
      as_of: string;
    }>;
    const values: Record<string, number | null> = {};
    let fundamentalAsOf: string | null = null;
    for (const row of fundamentalRows) {
      values[row.metric_code] = finite(row.value_num);
      if (!fundamentalAsOf || row.as_of > fundamentalAsOf) fundamentalAsOf = row.as_of;
    }

    const statements = latestStatementPeriods((filingResult.data ?? []) as Array<Record<string, unknown>>);
    const expectation = buildExpectation(
      expectationResult.error ? null : expectationResult.data as Record<string, unknown> | null,
      latest?.close ?? null,
    );

    return {
      asOf: new Date().toISOString(),
      identity: {
        assetId: String(asset.id),
        symbol: String(asset.symbol),
        name: String(asset.name),
        exchange: text(asset.exchange),
        currency: text(asset.currency),
        assetClass: text(asset.asset_class),
        industry: text(industryResult.data?.name),
        country: text(countryResult.data?.name),
      },
      price: {
        current: latest?.close ?? null,
        adjustedCurrent: latest?.adjustedClose ?? null,
        latestDate: latest?.date ?? null,
        high52,
        low52,
        drawdownFromHighPct:
          latest && high52 && high52 > 0 ? ((latest.adjustedClose / high52) - 1) * 100 : null,
        return1mPct: trailingReturn(history, 21),
        return3mPct: trailingReturn(history, 63),
        return6mPct: trailingReturn(history, 126),
        return12mPct: trailingReturn(history, 251),
        history,
      },
      fundamentals: { asOf: fundamentalAsOf, values },
      statements,
      expectations: expectation,
      earnings: ((earningsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        scheduledAt: String(row.scheduled_at),
        periodEnd: text(row.period_end),
        estimateEps: finite(row.estimate_eps),
        actualEps: finite(row.actual_eps),
        surprisePct: finite(row.surprise_pct),
      })),
      providerMappings: mappingResult.error
        ? []
        : ((mappingResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
            provider: String(row.provider_code),
            symbol: String(row.provider_symbol),
            status: String(row.mapping_status),
            lastVerifiedAt: text(row.last_verified_at),
          })),
    };
  });

function buildExpectation(
  row: Record<string, unknown> | null,
  currentPrice: number | null,
): AdvancedExpectationSnapshot | null {
  if (!row) return null;
  const fy1Eps = finite(row.fy1_eps_avg);
  const consensus = finite(row.target_consensus);
  return {
    provider: String(row.provider_code ?? "unknown"),
    lastVerifiedAt: String(row.last_verified_at),
    confidence: finite(row.confidence) ?? 0,
    referencePrice: finite(row.reference_price),
    fy1Date: text(row.fy1_date),
    fy1EpsAvg: fy1Eps,
    fy1EpsLow: finite(row.fy1_eps_low),
    fy1EpsHigh: finite(row.fy1_eps_high),
    fy1EpsAnalysts: integer(row.fy1_eps_analysts),
    fy1RevenueAvg: finite(row.fy1_revenue_avg),
    fy1RevenueLow: finite(row.fy1_revenue_low),
    fy1RevenueHigh: finite(row.fy1_revenue_high),
    fy1RevenueAnalysts: integer(row.fy1_revenue_analysts),
    fy2Date: text(row.fy2_date),
    fy2EpsAvg: finite(row.fy2_eps_avg),
    fy2RevenueAvg: finite(row.fy2_revenue_avg),
    targetConsensus: consensus,
    targetMedian: finite(row.target_median),
    targetHigh: finite(row.target_high),
    targetLow: finite(row.target_low),
    targetLastMonthAvg: finite(row.target_last_month_avg),
    targetLastQuarterAvg: finite(row.target_last_quarter_avg),
    targetLastYearAvg: finite(row.target_last_year_avg),
    forwardPe: currentPrice && fy1Eps && fy1Eps > 0 ? currentPrice / fy1Eps : null,
    impliedTargetUpsidePct:
      currentPrice && consensus && currentPrice > 0 ? ((consensus / currentPrice) - 1) * 100 : null,
  };
}

function latestStatementPeriods(rows: Array<Record<string, unknown>>): AdvancedStatementPeriod[] {
  const latestByPeriod = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const periodEnd = text(row.period_end);
    if (!periodEnd || latestByPeriod.has(periodEnd)) continue;
    latestByPeriod.set(periodEnd, row);
  }
  return [...latestByPeriod.values()].slice(0, 6).map(parseStatement);
}

function parseStatement(row: Record<string, unknown>): AdvancedStatementPeriod {
  const raw = record(row.raw);
  const income = record(raw?.income);
  const balance = record(raw?.balance);
  const cashFlow = record(raw?.cashFlow);
  return {
    periodEnd: String(row.period_end),
    knownAt: text(row.known_at),
    isRestatement: Boolean(row.is_restatement),
    revenue: readNumber(income, ["revenue"]),
    grossProfit: readNumber(income, ["grossProfit"]),
    operatingIncome: readNumber(income, ["operatingIncome"]),
    ebitda: readNumber(income, ["ebitda"]),
    netIncome: readNumber(income, ["netIncome"]),
    dilutedShares: readNumber(income, ["weightedAverageShsOutDil", "weightedAverageShsOut"]),
    cashAndInvestments: readNumber(balance, ["cashAndShortTermInvestments", "cashAndCashEquivalents"]),
    totalDebt: readNumber(balance, ["totalDebt"]),
    totalEquity: readNumber(balance, ["totalStockholdersEquity", "totalEquity"]),
    totalAssets: readNumber(balance, ["totalAssets"]),
    currentAssets: readNumber(balance, ["totalCurrentAssets"]),
    currentLiabilities: readNumber(balance, ["totalCurrentLiabilities"]),
    operatingCashFlow: readNumber(cashFlow, ["operatingCashFlow", "netCashProvidedByOperatingActivities"]),
    capitalExpenditure: readNumber(cashFlow, ["capitalExpenditure", "investmentsInPropertyPlantAndEquipment"]),
    freeCashFlow: readNumber(cashFlow, ["freeCashFlow"]),
    dividendsPaid: readNumber(cashFlow, ["dividendsPaid", "commonDividendsPaid"]),
    shareRepurchases: readNumber(cashFlow, ["commonStockRepurchased", "purchasesOfCommonStock"]),
    shareIssuance: readNumber(cashFlow, ["commonStockIssued", "proceedsFromStockIssuance"]),
    stockBasedCompensation: readNumber(cashFlow, ["stockBasedCompensation"]),
    interestExpense: readNumber(income, ["interestExpense", "interestExpenseNonOperating"]),
  };
}

function trailingReturn(history: AdvancedPriceBar[], sessions: number): number | null {
  if (history.length <= sessions) return null;
  const current = history.at(-1)?.adjustedClose ?? null;
  const prior = history[history.length - 1 - sessions]?.adjustedClose ?? null;
  return current && prior && prior > 0 ? ((current / prior) - 1) * 100 : null;
}

function readNumber(source: Record<string, unknown> | null, keys: string[]): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = finite(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positive(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integer(value: unknown): number | null {
  const number = finite(value);
  return number === null ? null : Math.round(number);
}

function text(value: unknown): string | null {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}
