import { createServerFn } from "@tanstack/react-start";

import { FUNDAMENTAL_METRICS } from "@/lib/ingestion/fundamentals/metrics";
import {
  computeInstitutionalAnalysis,
  withInstitutionalPeerContext,
  type InstitutionalAnalysis,
  type InstitutionalFundamentals,
  type InstitutionalPeriod,
  type MarketAssumptions,
} from "./institutional-model";

const MAX_INSTITUTIONAL_UNIVERSE = 3_000;
const MAX_PERIODS_PER_ASSET = 6;

interface AssetRow {
  id: string;
  symbol: string;
  exchange: string | null;
  currency: string | null;
  industry_id: string | null;
}

interface FundamentalRow {
  subject_id: string;
  metric_code: string;
  value_num: number | null;
  as_of: string;
}

interface FilingRow {
  asset_id: string;
  period_end: string;
  known_at: string | null;
  revision_no: number;
  is_restatement: boolean;
  raw: unknown;
}

export interface InstitutionalOpportunityWorkspace {
  asOf: string;
  calcVersion: string;
  status: "live" | "partial" | "unavailable";
  universe: {
    activeEquities: number;
    loadedAssets: number;
    assetsWithStatements: number;
    assetsWithTwoPeriods: number;
    cap: number;
    truncated: boolean;
  };
  counts: Record<"priority" | "qualified" | "watch" | "avoid" | "insufficient", number>;
  analyses: InstitutionalAnalysis[];
  modelNote: string;
  warnings: string[];
}

const FUNDAMENTAL_CODES = [
  FUNDAMENTAL_METRICS.marketCap,
  FUNDAMENTAL_METRICS.beta,
  FUNDAMENTAL_METRICS.fcfYield,
  FUNDAMENTAL_METRICS.roic,
  FUNDAMENTAL_METRICS.pe,
  FUNDAMENTAL_METRICS.pb,
  FUNDAMENTAL_METRICS.evEbitda,
  FUNDAMENTAL_METRICS.currentRatio,
  FUNDAMENTAL_METRICS.debtEquity,
];

export const getInstitutionalOpportunityWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<InstitutionalOpportunityWorkspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: activeEquities } = await supabaseAdmin
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("asset_class", "equity");
    const { data: assetData, error: assetError } = await supabaseAdmin
      .from("assets")
      .select("id,symbol,exchange,currency,industry_id")
      .eq("active", true)
      .eq("asset_class", "equity")
      .order("symbol", { ascending: true })
      .limit(MAX_INSTITUTIONAL_UNIVERSE);
    if (assetError) throw assetError;

    const assets = (assetData ?? []) as AssetRow[];
    if (!assets.length) return emptyWorkspace(activeEquities ?? 0, "No active equities are loaded.");

    const assetIds = assets.map((asset) => asset.id);
    const industryIds = unique(
      assets.map((asset) => asset.industry_id).filter((value): value is string => Boolean(value)),
    );
    const batches = chunkValues(assetIds, 60);

    const [fundamentalPages, filingPages, industryResult] = await Promise.all([
      Promise.all(
        batches.map((batch) =>
          supabaseAdmin
            .from("latest_asset_fundamentals")
            .select("subject_id,metric_code,value_num,as_of")
            .in("subject_id", batch)
            .in("metric_code", FUNDAMENTAL_CODES)
            .limit(batch.length * FUNDAMENTAL_CODES.length),
        ),
      ),
      Promise.all(
        batches.map((batch) =>
          supabaseAdmin
            .from("fundamental_filings")
            .select("asset_id,period_end,known_at,revision_no,is_restatement,raw")
            .in("asset_id", batch)
            .eq("fiscal_period", "FY")
            .order("period_end", { ascending: false })
            .order("revision_no", { ascending: false })
            .limit(batch.length * (MAX_PERIODS_PER_ASSET + 2)),
        ),
      ),
      industryIds.length
        ? supabaseAdmin.from("industries").select("id,code").in("id", industryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const fundamentalError = fundamentalPages.find((page) => page.error)?.error;
    const filingError = filingPages.find((page) => page.error)?.error;
    if (fundamentalError) throw fundamentalError;
    if (industryResult.error) throw industryResult.error;
    if (filingError) {
      return emptyWorkspace(
        activeEquities ?? assets.length,
        `Institutional statement history is unavailable: ${filingError.message}`,
      );
    }

    const fundamentals = buildFundamentals(
      fundamentalPages.flatMap((page) => page.data ?? []) as unknown as FundamentalRow[],
    );
    const industryCodes = new Map(
      (industryResult.data ?? []).map((row) => [String(row.id), String(row.code)]),
    );
    const filings = latestFilingsByAsset(
      filingPages.flatMap((page) => page.data ?? []) as unknown as FilingRow[],
    );

    const warnings: string[] = [];
    const analyses: InstitutionalAnalysis[] = [];
    let assetsWithStatements = 0;
    let assetsWithTwoPeriods = 0;
    for (const asset of assets) {
      const rows = filings.get(asset.id) ?? [];
      if (rows.length) assetsWithStatements++;
      if (rows.length >= 2) assetsWithTwoPeriods++;
      const periods = rows.map(parseInstitutionalPeriod).filter((value): value is InstitutionalPeriod => Boolean(value));
      if (!periods.length) continue;
      try {
        analyses.push(
          computeInstitutionalAnalysis({
            assetId: asset.id,
            industryId: asset.industry_id,
            industryCode: asset.industry_id ? (industryCodes.get(asset.industry_id) ?? null) : null,
            currency: asset.currency,
            periods,
            fundamentals: fundamentals.get(asset.id) ?? emptyFundamentals(),
            assumptions: marketAssumptions(asset.currency, asset.exchange),
          }),
        );
      } catch (error) {
        warnings.push(`${asset.symbol}: ${(error as Error).message}`);
      }
    }

    const withPeers = withInstitutionalPeerContext(analyses).sort(
      (left, right) =>
        tierOrder(left.tier) - tierOrder(right.tier) ||
        right.score - left.score ||
        right.coverage - left.coverage,
    );
    const counts = {
      priority: withPeers.filter((item) => item.tier === "priority").length,
      qualified: withPeers.filter((item) => item.tier === "qualified").length,
      watch: withPeers.filter((item) => item.tier === "watch").length,
      avoid: withPeers.filter((item) => item.tier === "avoid").length,
      insufficient: withPeers.filter((item) => item.tier === "insufficient").length,
    };
    const asOf =
      withPeers
        .map((analysis) => analysis.latestPeriodEnd)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? new Date().toISOString();
    const status = assetsWithTwoPeriods >= Math.max(5, assets.length * 0.25) ? "live" : "partial";

    return {
      asOf,
      calcVersion: withPeers[0]?.calcVersion ?? "opportunity.institutional.v0.1",
      status,
      universe: {
        activeEquities: activeEquities ?? assets.length,
        loadedAssets: assets.length,
        assetsWithStatements,
        assetsWithTwoPeriods,
        cap: MAX_INSTITUTIONAL_UNIVERSE,
        truncated: (activeEquities ?? assets.length) > assets.length,
      },
      counts,
      analyses: withPeers,
      modelNote:
        "Seven institutional lenses are calculated from the full raw annual statements already stored by the fundamentals pipeline. Missing fields reduce lens coverage rather than being silently estimated. Existing valuation, Piotroski, Magic Formula, price-dislocation and recovery evidence remain separate and are combined in the Opportunity Radar UI.",
      warnings: unique(warnings).slice(0, 30),
    };
  },
);

function latestFilingsByAsset(rows: FilingRow[]): Map<string, FilingRow[]> {
  const byAsset = new Map<string, Map<string, FilingRow>>();
  for (const row of rows) {
    const periods = byAsset.get(row.asset_id) ?? new Map<string, FilingRow>();
    const existing = periods.get(row.period_end);
    if (!existing || row.revision_no > existing.revision_no) periods.set(row.period_end, row);
    byAsset.set(row.asset_id, periods);
  }
  return new Map(
    [...byAsset.entries()].map(([assetId, periods]) => [
      assetId,
      [...periods.values()]
        .sort((left, right) => right.period_end.localeCompare(left.period_end))
        .slice(0, MAX_PERIODS_PER_ASSET),
    ]),
  );
}

function buildFundamentals(rows: FundamentalRow[]): Map<string, InstitutionalFundamentals> {
  const byAsset = new Map<string, Map<string, FundamentalRow>>();
  for (const row of rows) {
    if (row.value_num === null) continue;
    const bag = byAsset.get(row.subject_id) ?? new Map<string, FundamentalRow>();
    const existing = bag.get(row.metric_code);
    if (!existing || row.as_of > existing.as_of) bag.set(row.metric_code, row);
    byAsset.set(row.subject_id, bag);
  }
  return new Map(
    [...byAsset.entries()].map(([assetId, bag]) => {
      const read = (code: string) => finite(bag.get(code)?.value_num);
      const asOf = [...bag.values()].map((row) => row.as_of).sort().at(-1) ?? null;
      return [
        assetId,
        {
          marketCap: read(FUNDAMENTAL_METRICS.marketCap),
          beta: read(FUNDAMENTAL_METRICS.beta),
          fcfYield: read(FUNDAMENTAL_METRICS.fcfYield),
          roic: read(FUNDAMENTAL_METRICS.roic),
          pe: read(FUNDAMENTAL_METRICS.pe),
          pb: read(FUNDAMENTAL_METRICS.pb),
          evEbitda: read(FUNDAMENTAL_METRICS.evEbitda),
          currentRatio: read(FUNDAMENTAL_METRICS.currentRatio),
          debtEquity: read(FUNDAMENTAL_METRICS.debtEquity),
          asOf,
        } satisfies InstitutionalFundamentals,
      ];
    }),
  );
}

function parseInstitutionalPeriod(row: FilingRow): InstitutionalPeriod | null {
  const raw = record(row.raw);
  if (!raw) return null;
  const income = record(raw.income);
  const balance = record(raw.balance);
  const cashFlow = record(raw.cashFlow);
  if (!income && !balance && !cashFlow) return null;

  return {
    periodEnd: row.period_end,
    knownAt: row.known_at,
    isRestatement: Boolean(row.is_restatement),
    revenue: readNumber(income, ["revenue"]),
    costOfRevenue: readNumber(income, ["costOfRevenue", "costOfGoodsSold"]),
    grossProfit: readNumber(income, ["grossProfit"]),
    operatingIncome: readNumber(income, ["operatingIncome"]),
    ebit: readNumber(income, ["ebit", "operatingIncome"]),
    ebitda: readNumber(income, ["ebitda"]),
    interestExpense: readNumber(income, ["interestExpense", "interestExpenseNonOperating"]),
    incomeBeforeTax: readNumber(income, ["incomeBeforeTax"]),
    incomeTaxExpense: readNumber(income, ["incomeTaxExpense"]),
    netIncome: readNumber(income, ["netIncome"]),
    dilutedShares: readNumber(income, ["weightedAverageShsOutDil", "weightedAverageShsOut"]),
    totalAssets: readNumber(balance, ["totalAssets"]),
    totalCurrentAssets: readNumber(balance, ["totalCurrentAssets"]),
    totalCurrentLiabilities: readNumber(balance, ["totalCurrentLiabilities"]),
    cashAndInvestments: readNumber(balance, [
      "cashAndShortTermInvestments",
      "cashAndCashEquivalents",
      "cashAndCashEquivalentsAtCarryingValue",
    ]),
    totalDebt: readNumber(balance, ["totalDebt"]),
    shortTermDebt: readNumber(balance, ["shortTermDebt", "shortTermBorrowings"]),
    longTermDebt: readNumber(balance, ["longTermDebt", "totalNonCurrentDebt"]),
    totalEquity: readNumber(balance, ["totalStockholdersEquity", "totalEquity"]),
    totalLiabilities: readNumber(balance, ["totalLiabilities"]),
    receivables: readNumber(balance, ["netReceivables", "accountsReceivables"]),
    inventory: readNumber(balance, ["inventory"]),
    accountsPayable: readNumber(balance, ["accountPayables", "accountsPayable"]),
    netPpe: readNumber(balance, ["propertyPlantEquipmentNet"]),
    goodwill: readNumber(balance, ["goodwill"]),
    intangibleAssets: readNumber(balance, ["intangibleAssets", "goodwillAndIntangibleAssets"]),
    operatingCashFlow: readNumber(cashFlow, [
      "operatingCashFlow",
      "netCashProvidedByOperatingActivities",
    ]),
    capitalExpenditure: readNumber(cashFlow, [
      "capitalExpenditure",
      "investmentsInPropertyPlantAndEquipment",
    ]),
    freeCashFlow: readNumber(cashFlow, ["freeCashFlow"]),
    depreciationAmortization:
      readNumber(cashFlow, ["depreciationAndAmortization", "depreciationAndAmortizationExpense"]) ??
      readNumber(income, ["depreciationAndAmortization"]),
    dividendsPaid: readNumber(cashFlow, ["dividendsPaid", "commonDividendsPaid"]),
    commonStockRepurchased: readNumber(cashFlow, [
      "commonStockRepurchased",
      "purchasesOfCommonStock",
    ]),
    commonStockIssued: readNumber(cashFlow, [
      "commonStockIssued",
      "proceedsFromStockIssuance",
    ]),
    stockBasedCompensation: readNumber(cashFlow, ["stockBasedCompensation"]),
    acquisitionsNet: readNumber(cashFlow, ["acquisitionsNet", "acquisitions"]),
    debtRepayment: readNumber(cashFlow, ["debtRepayment", "repaymentOfDebt"]),
    debtIssuance: readNumber(cashFlow, ["debtIssuance", "proceedsFromDebt"]),
    changeInWorkingCapital: readNumber(cashFlow, ["changeInWorkingCapital"]),
    sellingGeneralAdministrative: readNumber(income, [
      "sellingGeneralAndAdministrativeExpenses",
      "sellingAndMarketingExpenses",
    ]),
  };
}

function marketAssumptions(currency: string | null, exchange: string | null): MarketAssumptions {
  const code = currency?.toUpperCase() ?? "";
  if (code === "GBP" || exchange?.toUpperCase().includes("LSE")) {
    return {
      riskFreeRate: 0.0425,
      equityRiskPremium: 0.0475,
      terminalGrowthRate: 0.02,
      fallbackPreTaxCostOfDebt: 0.0675,
      label: "GBP market",
    };
  }
  if (code === "EUR") {
    return {
      riskFreeRate: 0.03,
      equityRiskPremium: 0.05,
      terminalGrowthRate: 0.02,
      fallbackPreTaxCostOfDebt: 0.055,
      label: "EUR market",
    };
  }
  if (code === "USD" || !code) {
    return {
      riskFreeRate: 0.0425,
      equityRiskPremium: 0.0475,
      terminalGrowthRate: 0.025,
      fallbackPreTaxCostOfDebt: 0.0675,
      label: "USD market",
    };
  }
  return {
    riskFreeRate: 0.04,
    equityRiskPremium: 0.05,
    terminalGrowthRate: 0.02,
    fallbackPreTaxCostOfDebt: 0.065,
    label: `${code} fallback market`,
  };
}

function emptyWorkspace(activeEquities: number, warning: string): InstitutionalOpportunityWorkspace {
  return {
    asOf: new Date().toISOString(),
    calcVersion: "opportunity.institutional.v0.1",
    status: "unavailable",
    universe: {
      activeEquities,
      loadedAssets: 0,
      assetsWithStatements: 0,
      assetsWithTwoPeriods: 0,
      cap: MAX_INSTITUTIONAL_UNIVERSE,
      truncated: false,
    },
    counts: { priority: 0, qualified: 0, watch: 0, avoid: 0, insufficient: 0 },
    analyses: [],
    modelNote:
      "Institutional scoring is unavailable. The existing Opportunity Radar remains active and unchanged.",
    warnings: [warning],
  };
}

function emptyFundamentals(): InstitutionalFundamentals {
  return {
    marketCap: null,
    beta: null,
    fcfYield: null,
    roic: null,
    pe: null,
    pb: null,
    evEbitda: null,
    currentRatio: null,
    debtEquity: null,
    asOf: null,
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumber(
  source: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!source) return null;
  for (const key of keys) {
    const value = finite(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function tierOrder(tier: InstitutionalAnalysis["tier"]): number {
  return tier === "priority"
    ? 0
    : tier === "qualified"
      ? 1
      : tier === "watch"
        ? 2
        : tier === "insufficient"
          ? 3
          : 4;
}
