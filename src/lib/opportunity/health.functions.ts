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
    twoPeriodStatementAssets: number;
    twoPeriodStatementCoveragePct: number;
  };
  bootstrap: {
    pendingDates: number;
    failedDates: number;
  };
  checks: OpportunityReadinessCheck[];
}

const TARGET_EQUITIES = 3_000;
const MIN_ACTIVE_EQUITIES = 2_950;
const REQUIRED_COVERAGE = 95;

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
          twoPeriodStatementAssets: 0,
          twoPeriodStatementCoveragePct: 0,
        },
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
  },
);

function buildHealth(raw: Record<string, unknown>): OpportunityRadarHealth {
  const active = integer(raw.activeEquities);
  const freshAssets = integer(raw.freshPriceAssets);
  const history252Assets = integer(raw.history252Assets);
  const freshScoreAssets = integer(raw.freshTechnicalScoreAssets);
  const fundamentalAssets = integer(raw.fundamentalAssets);
  const statementAssets = integer(raw.twoPeriodStatementAssets);
  const pendingDates = integer(raw.pendingBackfillDates);
  const failedDates = integer(raw.failedBackfillDates);
  const priceCoveragePct = coverage(freshAssets, active);
  const historyCoveragePct = coverage(history252Assets, active);
  const scoreCoveragePct = coverage(freshScoreAssets, active);
  const fundamentalCoveragePct = coverage(fundamentalAssets, active);
  const statementCoveragePct = coverage(statementAssets, active);
  const latestBulkDate = text(raw.latestBulkDate);
  const latestBulkFinishedAt = text(raw.latestBulkFinishedAt);
  const latestBulkRows = integer(raw.latestBulkRows);

  const universePass = active >= MIN_ACTIVE_EQUITIES;
  const pricesPass = latestBulkDate !== null && priceCoveragePct >= REQUIRED_COVERAGE;
  const historyPass = historyCoveragePct >= REQUIRED_COVERAGE;
  const scoresPass = scoreCoveragePct >= REQUIRED_COVERAGE;
  const marketEvidenceReady = universePass && pricesPass && historyPass && scoresPass;

  const state: OpportunityReadinessState = !universePass || failedDates > 0 || latestBulkDate === null
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
      label: "252-session history",
      state: historyPass ? "pass" : pendingDates > 0 ? "warn" : "fail",
      value: `${history252Assets.toLocaleString()} (${historyCoveragePct.toFixed(1)}%)`,
      detail: "12-1 momentum, 200-day trend and 52-week price context require roughly 252 completed sessions.",
      required: true,
    },
    {
      key: "technical_scores",
      label: "Fresh technical scores",
      state: scoresPass ? "pass" : pendingDates > 0 ? "warn" : "fail",
      value: `${freshScoreAssets.toLocaleString()} (${scoreCoveragePct.toFixed(1)}%)`,
      detail: "Momentum, trend and volatility must be recalculated after the latest authoritative bulk EOD run.",
      required: true,
    },
    {
      key: "fundamentals",
      label: "Fundamental coverage",
      state: fundamentalCoveragePct >= REQUIRED_COVERAGE ? "pass" : fundamentalAssets > 0 ? "warn" : "fail",
      value: `${fundamentalAssets.toLocaleString()} (${fundamentalCoveragePct.toFixed(1)}%)`,
      detail: "FMP fundamentals are refreshed separately; missing evidence lowers candidate confidence instead of being silently estimated.",
      required: false,
    },
    {
      key: "statements",
      label: "Two-period statement history",
      state: statementCoveragePct >= REQUIRED_COVERAGE ? "pass" : statementAssets > 0 ? "warn" : "fail",
      value: `${statementAssets.toLocaleString()} (${statementCoveragePct.toFixed(1)}%)`,
      detail: "Two annual periods unlock stronger Piotroski, recovery and institutional-quality evidence.",
      required: false,
    },
    {
      key: "bootstrap",
      label: "Historical bootstrap",
      state: failedDates > 0 ? "fail" : pendingDates > 0 ? "warn" : "pass",
      value: failedDates > 0 ? `${failedDates} failed` : pendingDates > 0 ? `${pendingDates} dates remaining` : "complete",
      detail: "The longer EODHD bootstrap is intentionally shared with the existing bulk queue and remains single-flight.",
      required: false,
    },
  ];

  return {
    asOf: text(raw.asOf) ?? new Date().toISOString(),
    state,
    trustedMarketEvidence: marketEvidenceReady,
    headline: marketEvidenceReady
      ? "The Radar has broad, current market evidence across the managed universe. Fundamental coverage remains separately visible and confidence-weighted."
      : pendingDates > 0
        ? "The EODHD market-data foundation is healthy, but the Radar is still building the longer history and score coverage required for 12-month evidence."
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
      twoPeriodStatementAssets: statementAssets,
      twoPeriodStatementCoveragePct: statementCoveragePct,
    },
    bootstrap: { pendingDates, failedDates },
    checks,
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
