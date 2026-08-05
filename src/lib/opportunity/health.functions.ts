import { createServerFn } from "@tanstack/react-start";

export type OpportunityReadinessState = "ready" | "building" | "degraded";
export type OpportunityReadinessCheckState = "pass" | "warn" | "fail";

export interface OpportunityReadinessCheck {
  key: string;
  label: string;
  state: OpportunityReadinessCheckState;
  value: string;
  detail: string;
  required: boolean;
}

export interface OpportunityRegionHealth {
  region: "US" | "UK" | "EU";
  activeAssets: number;
  freshPriceAssets: number;
  freshPriceCoveragePct: number;
  history252Assets: number;
  history252CoveragePct: number;
  freshScoreAssets: number;
  freshScoreCoveragePct: number;
  ready: boolean;
}

export interface OpportunityRadarHealth {
  asOf: string;
  state: OpportunityReadinessState;
  trustedMarketEvidence: boolean;
  headline: string;
  universe: {
    target: number;
    active: number;
  };
  prices: {
    latestBulkDate: string | null;
    latestBulkFinishedAt: string | null;
    latestBulkRows: number;
    freshAssets: number;
    coveragePct: number;
  };
  technical: {
    history252Assets: number;
    history252CoveragePct: number;
    freshScoreAssets: number;
    freshScoreCoveragePct: number;
  };
  fundamentals: {
    assets: number;
    coveragePct: number;
    freshAssets: number;
    freshCoveragePct: number;
    warningAssets: number;
    staleAssets: number;
    twoPeriodStatementAssets: number;
    twoPeriodStatementCoveragePct: number;
    currentStatementAssets: number;
    currentStatementCoveragePct: number;
  };
  providerMappings: {
    eodhdMappedAssets: number;
    fmpMappedAssets: number;
    fmpVerifiedAssets: number;
    twelveDataMappedAssets: number;
  };
  regions: OpportunityRegionHealth[];
  bootstrap: {
    pendingDates: number;
    failedDates: number;
  };
  checks: OpportunityReadinessCheck[];
}

const TARGET_EQUITIES = 3_000;
const MIN_ACTIVE_EQUITIES = 2_950;
const REQUIRED_COVERAGE = 95;
const REGIONAL_REQUIRED_COVERAGE = 90;

export const getOpportunityRadarHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<OpportunityRadarHealth> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The readiness RPC is migration-backed and intentionally fail-soft so a
    // code deploy cannot break the Radar if the database migration lands later.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    try {
      const { data, error } = await db.rpc("get_opportunity_radar_health");
      if (error) throw error;
      return buildHealth((data ?? {}) as Record<string, unknown>);
    } catch (error) {
      const message = errorMessage(error);
      return emptyHealth(message);
    }
  },
);

function buildHealth(raw: Record<string, unknown>): OpportunityRadarHealth {
  const active = integer(raw.activeEquities);
  const freshAssets = integer(raw.freshPriceAssets);
  const history252Assets = integer(raw.history252Assets);
  const freshScoreAssets = integer(raw.freshTechnicalScoreAssets);
  const fundamentalAssets = integer(raw.fundamentalAssets);
  const freshFundamentalAssets = integer(raw.freshFundamentalAssets ?? raw.fundamentalAssets);
  const warningFundamentalAssets = integer(raw.warningFundamentalAssets);
  const staleFundamentalAssets = integer(raw.staleFundamentalAssets);
  const statementAssets = integer(raw.twoPeriodStatementAssets);
  const currentStatementAssets = integer(raw.currentStatementAssets ?? raw.twoPeriodStatementAssets);
  const pendingDates = integer(raw.pendingBackfillDates);
  const failedDates = integer(raw.failedBackfillDates);
  const priceCoveragePct = coverage(freshAssets, active);
  const historyCoveragePct = coverage(history252Assets, active);
  const scoreCoveragePct = coverage(freshScoreAssets, active);
  const fundamentalCoveragePct = coverage(fundamentalAssets, active);
  const freshFundamentalCoveragePct = coverage(freshFundamentalAssets, active);
  const statementCoveragePct = coverage(statementAssets, active);
  const currentStatementCoveragePct = coverage(currentStatementAssets, active);
  const latestBulkDate = text(raw.latestBulkDate);
  const latestBulkFinishedAt = text(raw.latestBulkFinishedAt);
  const latestBulkRows = integer(raw.latestBulkRows);
  const providerMappings = parseProviderMappings(raw.providerMappings);
  const regions = parseRegions(raw.regions);

  const universePass = active >= MIN_ACTIVE_EQUITIES;
  const pricesPass = latestBulkDate !== null && priceCoveragePct >= REQUIRED_COVERAGE;
  const historyPass = historyCoveragePct >= REQUIRED_COVERAGE;
  const scoresPass = scoreCoveragePct >= REQUIRED_COVERAGE;
  const regionalPricePass = regions.length > 0 && regions.every(
    (region) => region.activeAssets === 0 || region.freshPriceCoveragePct >= REGIONAL_REQUIRED_COVERAGE,
  );
  const regionalEvidencePass = regions.length > 0 && regions.every(
    (region) => region.activeAssets === 0 || region.ready,
  );
  const marketEvidenceReady =
    universePass && pricesPass && historyPass && scoresPass && regionalEvidencePass;

  const hardDegraded =
    !universePass ||
    failedDates > 0 ||
    latestBulkDate === null ||
    (regions.length > 0 && !regionalPricePass);
  const state: OpportunityReadinessState = hardDegraded
    ? "degraded"
    : marketEvidenceReady
      ? "ready"
      : "building";

  const checks: OpportunityReadinessCheck[] = [
    {
      key: "universe",
      label: "Managed universe",
      state: universePass ? "pass" : "fail",
      value: `${active.toLocaleString()} / ${TARGET_EQUITIES.toLocaleString()}`,
      detail: "Opportunity Radar and Swing Trades share the same managed EODHD equity population.",
      required: true,
    },
    {
      key: "prices",
      label: "Fresh EOD price coverage",
      state: pricesPass ? "pass" : "fail",
      value: `${freshAssets.toLocaleString()} (${priceCoveragePct.toFixed(1)}%)`,
      detail: latestBulkDate
        ? `Coverage through the latest successful full-universe bulk date ${latestBulkDate}.`
        : "No successful full-universe bulk EOD date is available.",
      required: true,
    },
    {
      key: "history252",
      label: "252-session adjusted history",
      state: historyPass ? "pass" : pendingDates > 0 ? "warn" : "fail",
      value: `${history252Assets.toLocaleString()} (${historyCoveragePct.toFixed(1)}%)`,
      detail: "12-1 momentum, 200-day trend and 52-week context require roughly 252 completed sessions; Opportunity technical scores use adjusted closes.",
      required: true,
    },
    {
      key: "technical_scores",
      label: "Fresh technical scores",
      state: scoresPass ? "pass" : pendingDates > 0 ? "warn" : "fail",
      value: `${freshScoreAssets.toLocaleString()} (${scoreCoveragePct.toFixed(1)}%)`,
      detail: "Momentum, trend and volatility must all be recalculated after the latest authoritative bulk EOD run.",
      required: true,
    },
    {
      key: "regional",
      label: "Regional market evidence",
      state: regionalEvidencePass ? "pass" : pendingDates > 0 && regionalPricePass ? "warn" : "fail",
      value: regions.length
        ? regions.map((region) => `${region.region} ${Math.min(region.freshPriceCoveragePct, region.history252CoveragePct, region.freshScoreCoveragePct).toFixed(0)}%`).join(" · ")
        : "unavailable",
      detail: `No active US/UK/EU region may hide behind the global average; each requires at least ${REGIONAL_REQUIRED_COVERAGE}% price, 252-session and fresh-score coverage.`,
      required: true,
    },
    {
      key: "fundamentals",
      label: "Current fundamentals",
      state: freshFundamentalCoveragePct >= REQUIRED_COVERAGE
        ? "pass"
        : fundamentalAssets > 0
          ? "warn"
          : "fail",
      value: `${freshFundamentalAssets.toLocaleString()} fresh (${freshFundamentalCoveragePct.toFixed(1)}%)`,
      detail: `${warningFundamentalAssets.toLocaleString()} assets are 46–100 days old and ${staleFundamentalAssets.toLocaleString()} exceed 100 days. Stale values are excluded from live valuation/quality scoring.`,
      required: false,
    },
    {
      key: "statements",
      label: "Statement history",
      state: currentStatementCoveragePct >= REQUIRED_COVERAGE
        ? "pass"
        : statementAssets > 0
          ? "warn"
          : "fail",
      value: `${currentStatementAssets.toLocaleString()} current · ${statementAssets.toLocaleString()} multi-period`,
      detail: "Two annual periods unlock stronger Piotroski/recovery evidence; the current count also requires a reasonably recent latest FY period.",
      required: false,
    },
    {
      key: "provider_identity",
      label: "Provider symbol identity",
      state: coverage(providerMappings.eodhdMappedAssets, active) >= REQUIRED_COVERAGE
        ? "pass"
        : providerMappings.eodhdMappedAssets > 0
          ? "warn"
          : "fail",
      value: `EODHD ${providerMappings.eodhdMappedAssets.toLocaleString()} · FMP ${providerMappings.fmpMappedAssets.toLocaleString()} (${providerMappings.fmpVerifiedAssets.toLocaleString()} verified)`,
      detail: "Provider tickers are adapters keyed to canonical asset_id + exchange. FMP mappings become verified only after a successful mapped response.",
      required: false,
    },
    {
      key: "bootstrap",
      label: "Historical bootstrap",
      state: failedDates > 0 ? "fail" : pendingDates > 0 ? "warn" : "pass",
      value: failedDates > 0 ? `${failedDates} failed` : pendingDates > 0 ? `${pendingDates} dates remaining` : "complete",
      detail: "The longer EODHD bootstrap is shared with the existing bulk queue and remains single-flight.",
      required: false,
    },
  ];

  return {
    asOf: text(raw.asOf) ?? new Date().toISOString(),
    state,
    trustedMarketEvidence: marketEvidenceReady,
    headline: marketEvidenceReady
      ? "The Radar has broad, current market evidence globally and across US, UK and European sleeves. Fundamental freshness remains separately visible and confidence-weighted."
      : pendingDates > 0
        ? "The EODHD market-data foundation is healthy, but the Radar is still building the longer adjusted-price history and score coverage required for 12-month evidence."
        : "One or more required Opportunity Radar market-evidence checks are not yet passing.",
    universe: { target: TARGET_EQUITIES, active },
    prices: {
      latestBulkDate,
      latestBulkFinishedAt,
      latestBulkRows,
      freshAssets,
      coveragePct: priceCoveragePct,
    },
    technical: {
      history252Assets,
      history252CoveragePct: historyCoveragePct,
      freshScoreAssets,
      freshScoreCoveragePct: scoreCoveragePct,
    },
    fundamentals: {
      assets: fundamentalAssets,
      coveragePct: fundamentalCoveragePct,
      freshAssets: freshFundamentalAssets,
      freshCoveragePct: freshFundamentalCoveragePct,
      warningAssets: warningFundamentalAssets,
      staleAssets: staleFundamentalAssets,
      twoPeriodStatementAssets: statementAssets,
      twoPeriodStatementCoveragePct: statementCoveragePct,
      currentStatementAssets,
      currentStatementCoveragePct,
    },
    providerMappings,
    regions,
    bootstrap: { pendingDates, failedDates },
    checks,
  };
}

function parseRegions(value: unknown): OpportunityRegionHealth[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const region = text(row.region);
    if (region !== "US" && region !== "UK" && region !== "EU") return [];
    const activeAssets = integer(row.activeAssets);
    const freshPriceAssets = integer(row.freshPriceAssets);
    const history252Assets = integer(row.history252Assets);
    const freshScoreAssets = integer(row.freshTechnicalScoreAssets);
    const freshPriceCoveragePct = coverage(freshPriceAssets, activeAssets);
    const history252CoveragePct = coverage(history252Assets, activeAssets);
    const freshScoreCoveragePct = coverage(freshScoreAssets, activeAssets);
    return [{
      region,
      activeAssets,
      freshPriceAssets,
      freshPriceCoveragePct,
      history252Assets,
      history252CoveragePct,
      freshScoreAssets,
      freshScoreCoveragePct,
      ready:
        activeAssets > 0 &&
        freshPriceCoveragePct >= REGIONAL_REQUIRED_COVERAGE &&
        history252CoveragePct >= REGIONAL_REQUIRED_COVERAGE &&
        freshScoreCoveragePct >= REGIONAL_REQUIRED_COVERAGE,
    }];
  });
}

function parseProviderMappings(value: unknown): OpportunityRadarHealth["providerMappings"] {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    eodhdMappedAssets: integer(row.eodhdMappedAssets),
    fmpMappedAssets: integer(row.fmpMappedAssets),
    fmpVerifiedAssets: integer(row.fmpVerifiedAssets),
    twelveDataMappedAssets: integer(row.twelveDataMappedAssets),
  };
}

function emptyHealth(message: string): OpportunityRadarHealth {
  return {
    asOf: new Date().toISOString(),
    state: "degraded",
    trustedMarketEvidence: false,
    headline: `Radar readiness evidence is unavailable: ${message}`,
    universe: { target: TARGET_EQUITIES, active: 0 },
    prices: {
      latestBulkDate: null,
      latestBulkFinishedAt: null,
      latestBulkRows: 0,
      freshAssets: 0,
      coveragePct: 0,
    },
    technical: {
      history252Assets: 0,
      history252CoveragePct: 0,
      freshScoreAssets: 0,
      freshScoreCoveragePct: 0,
    },
    fundamentals: {
      assets: 0,
      coveragePct: 0,
      freshAssets: 0,
      freshCoveragePct: 0,
      warningAssets: 0,
      staleAssets: 0,
      twoPeriodStatementAssets: 0,
      twoPeriodStatementCoveragePct: 0,
      currentStatementAssets: 0,
      currentStatementCoveragePct: 0,
    },
    providerMappings: {
      eodhdMappedAssets: 0,
      fmpMappedAssets: 0,
      fmpVerifiedAssets: 0,
      twelveDataMappedAssets: 0,
    },
    regions: [],
    bootstrap: { pendingDates: 0, failedDates: 0 },
    checks: [
      {
        key: "health_rpc",
        label: "Readiness telemetry",
        state: "fail",
        value: "unavailable",
        detail: message,
        required: true,
      },
    ],
  };
}

function coverage(value: number, total: number): number {
  return total > 0 ? value / total * 100 : 0;
}

function integer(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [value.message, value.details, value.hint, value.code]
      .filter((item) => typeof item === "string" && item.length > 0)
      .join(" · ") || JSON.stringify(value);
  }
  return String(error);
}
