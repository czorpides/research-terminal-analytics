import type { ConvictionV2Result } from "./conviction-v2";
import type { InstitutionalAnalysis } from "./institutional-model";
import type { OpportunityCandidate } from "./workspace.functions";

export type DiscoveryRouteKey =
  | "deep_value"
  | "broken_but_durable"
  | "fundamental_recovery"
  | "quality_growth"
  | "compounder_reset"
  | "capital_allocation"
  | "sector_specific";

export type DiscoveryReadiness = "ready" | "emerging" | "coverage_gap" | "not_nominated";

export interface DiscoveryRouteAssessment {
  key: DiscoveryRouteKey;
  label: string;
  score: number;
  availableSignals: number;
  qualifies: boolean;
  emerging: boolean;
  thesis: string;
  nextProof: string;
}

export interface FinancialModelNote {
  kind:
    | "payments_fintech"
    | "bank"
    | "insurer"
    | "asset_manager"
    | "exchange_data"
    | "lender"
    | "diversified_financial";
  label: string;
  note: string;
}

export interface DiscoveryProfile {
  readiness: DiscoveryReadiness;
  bestRoute: DiscoveryRouteAssessment | null;
  routes: DiscoveryRouteAssessment[];
  routeScore: number;
  financialModel: FinancialModelNote | null;
  reason: string;
}

interface WeightedSignal {
  value: number | null | undefined;
  weight: number;
}

const ROUTE_LABELS: Record<DiscoveryRouteKey, string> = {
  deep_value: "Deep value",
  broken_but_durable: "Broken but durable",
  fundamental_recovery: "Fundamental recovery",
  quality_growth: "Quality growth at a reasonable price",
  compounder_reset: "Compounder reset",
  capital_allocation: "Capital-allocation opportunity",
  sector_specific: "Sector-specific opportunity",
};

export function assessDiscoveryRoutes(input: {
  candidate: OpportunityCandidate;
  conviction: ConvictionV2Result;
  institutional: InstitutionalAnalysis | null;
}): DiscoveryProfile {
  const { candidate, conviction, institutional } = input;
  const metrics = institutional?.rawMetrics ?? {};
  const valuation = finite(candidate.evidence.valuationCompression?.value);
  const quality = finite(candidate.evidence.fundamentalResilience?.value);
  const dislocation = finite(candidate.evidence.priceDislocation?.value);
  const recovery = finite(candidate.evidence.recoveryConfirmation?.value);
  const balance = finite(candidate.evidence.balanceSheetDurability?.value);
  const impairmentSafety = invert(finite(candidate.evidence.impairmentRisk?.value));
  const fcfYield = finiteScore(candidate, "valuation", "fcf_yield");
  const cashLens = lensScore(institutional, "cash_earnings");
  const returnsLens = lensScore(institutional, "returns_reinvestment");
  const operatingLens = lensScore(institutional, "operating_trajectory");
  const capitalLens = lensScore(institutional, "capital_allocation");

  const financialModel = financialModelFor(candidate);
  const routes: DiscoveryRouteAssessment[] = [
    route(
      "deep_value",
      weightedScore([
        { value: valuation, weight: 34 },
        { value: pctScore(metrics.fcfMargin, -0.02, 0.14), weight: 22 },
        { value: fcfYield ?? pctScore(candidate.fundamentalModels.magicFormula.earningsYield, 0.02, 0.12), weight: 18 },
        { value: balance, weight: 14 },
        { value: cashLens, weight: 12 },
      ]),
      "Low expectations are supported by cash generation and a balance sheet that can survive the thesis taking time.",
      "Normalise earnings and free cash flow across the cycle, then test why the market multiple should rerate.",
    ),
    route(
      "broken_but_durable",
      weightedScore([
        { value: dislocation, weight: 32 },
        { value: quality, weight: 24 },
        { value: impairmentSafety, weight: 18 },
        { value: cashLens, weight: 16 },
        { value: returnsLens, weight: 10 },
      ]),
      "The share price is damaged more severely than the available evidence suggests the underlying business is impaired.",
      "Identify the specific temporary problem and the evidence that prevents it becoming permanent impairment.",
    ),
    route(
      "fundamental_recovery",
      weightedScore([
        { value: operatingLens, weight: 30 },
        { value: recovery, weight: 20 },
        { value: pctScore(metrics.revenueGrowth, -0.12, 0.16), weight: 15 },
        { value: pctScore(metrics.ebitMarginChange, -0.04, 0.05), weight: 15 },
        { value: pctScore(negate(metrics.debtChange), -0.18, 0.18), weight: 10 },
        { value: piotroskiScore(candidate), weight: 10 },
      ]),
      "Revenue, margins, cash generation or leverage are moving in the right direction rather than relying on price recovery alone.",
      "Confirm the improvement is recurring and visible in guidance, order intake, customer demand or unit economics.",
    ),
    route(
      "quality_growth",
      weightedScore([
        { value: quality, weight: 20 },
        { value: pctScore(metrics.revenueCagr, -0.02, 0.2), weight: 23 },
        { value: pctScore(metrics.roicWaccSpread, -0.04, 0.14), weight: 18 },
        { value: pctScore(metrics.incrementalRoic, -0.05, 0.25), weight: 14 },
        { value: pctScore(metrics.fcfMargin, -0.02, 0.18), weight: 13 },
        { value: valuation, weight: 12 },
      ]),
      "Durable growth and attractive reinvestment economics justify research even when absolute valuation multiples are not conventionally cheap.",
      "Pressure-test growth durability, competitive advantage, stock compensation and the valuation implied by a realistic fade in returns.",
    ),
    route(
      "compounder_reset",
      weightedScore([
        { value: quality, weight: 24 },
        { value: pctScore(metrics.positiveFcfYears, 0.25, 1), weight: 18 },
        { value: pctScore(metrics.roicWaccSpread, -0.03, 0.14), weight: 18 },
        { value: dislocation, weight: 18 },
        { value: pctScore(metrics.expectationGap, -0.12, 0.16), weight: 12 },
        { value: pctScore(metrics.revenueCagr, -0.02, 0.18), weight: 10 },
      ]),
      "A historically strong business has suffered a valuation or price reset while its cash and return profile remains credible.",
      "Separate a temporary multiple reset from a genuine erosion of competitive advantage, growth runway or incremental returns.",
    ),
    route(
      "capital_allocation",
      weightedScore([
        { value: capitalLens, weight: 22 },
        { value: pctScore(metrics.shareholderYield, -0.03, 0.12), weight: 24 },
        { value: pctScore(metrics.buybackYield, -0.04, 0.1), weight: 18 },
        { value: pctScore(negate(metrics.shareCountCagr), -0.08, 0.06), weight: 14 },
        { value: pctScore(metrics.debtReductionYield, -0.02, 0.1), weight: 12 },
        { value: pctScore(metrics.fcfMargin, -0.02, 0.15), weight: 10 },
      ]),
      "Free cash flow is being converted into genuine per-share value through disciplined repurchases, distributions or deleveraging.",
      "Verify that buybacks exceed dilution, are not debt-funded and were executed at sensible valuations.",
    ),
    route(
      "sector_specific",
      financialModel
        ? weightedScore([
            { value: valuation, weight: 18 },
            { value: quality, weight: 18 },
            { value: cashLens, weight: 16 },
            { value: operatingLens, weight: 16 },
            { value: capitalLens, weight: 12 },
            { value: pctScore(metrics.residualIncome, -0.05, 0.12), weight: 10 },
            { value: impairmentSafety, weight: 10 },
          ])
        : emptyScore(),
      financialModel
        ? `${financialModel.label} is included through a dedicated discovery route rather than being rejected by generic industrial leverage rules.`
        : "The company requires a sector-specific operating and valuation framework.",
      financialModel?.note ?? "Build the relevant sector model before escalating conviction.",
    ),
  ];

  const visible = routes
    .filter((item) => item.availableSignals >= 2 && item.score >= 42)
    .sort((left, right) => right.score - left.score);
  const bestRoute = visible[0] ?? null;
  const routeScore = bestRoute?.score ?? 0;
  const coverage = institutional?.coverage ?? conviction.coverage;
  const readiness: DiscoveryReadiness = bestRoute?.qualifies && coverage >= 34
    ? "ready"
    : bestRoute?.emerging
      ? "emerging"
      : coverage < 30
        ? "coverage_gap"
        : "not_nominated";

  return {
    readiness,
    bestRoute,
    routes: visible,
    routeScore,
    financialModel,
    reason:
      readiness === "ready"
        ? `${bestRoute?.label ?? "A discovery route"} provides a credible reason to begin research.`
        : readiness === "emerging"
          ? `${bestRoute?.label ?? "A preliminary route"} is visible, but one or more proof points remain incomplete.`
          : readiness === "coverage_gap"
            ? "The company is in the universe, but missing evidence prevents a fair research classification."
            : "No discovery route currently has enough supporting evidence.",
  };
}

function route(
  key: DiscoveryRouteKey,
  result: { score: number; availableSignals: number },
  thesis: string,
  nextProof: string,
): DiscoveryRouteAssessment {
  return {
    key,
    label: ROUTE_LABELS[key],
    score: round1(result.score),
    availableSignals: result.availableSignals,
    qualifies: result.availableSignals >= 3 && result.score >= 62,
    emerging: result.availableSignals >= 2 && result.score >= 52,
    thesis,
    nextProof,
  };
}

function weightedScore(signals: WeightedSignal[]): { score: number; availableSignals: number } {
  const available = signals.filter((item) => finite(item.value) !== null);
  const weight = available.reduce((sum, item) => sum + item.weight, 0);
  if (!weight) return emptyScore();
  return {
    score: clamp(
      available.reduce((sum, item) => sum + (finite(item.value) ?? 0) * item.weight, 0) / weight,
    ),
    availableSignals: available.length,
  };
}

function emptyScore(): { score: number; availableSignals: number } {
  return { score: 0, availableSignals: 0 };
}

function financialModelFor(candidate: OpportunityCandidate): FinancialModelNote | null {
  if (candidate.industryCode !== "SEC_FIN") return null;
  const text = `${candidate.name} ${candidate.industryName ?? ""}`.toLowerCase();
  if (/payment|transaction|fintech|card network|credit services/.test(text)) {
    return {
      kind: "payments_fintech",
      label: "Payments / fintech model",
      note: "Focus on payment volume, take rate, transaction margin, active-account quality, credit losses, FCF conversion and dilution. Bank leverage ratios are not applied mechanically.",
    };
  }
  if (/insurance|assurance|reinsurance/.test(text)) {
    return {
      kind: "insurer",
      label: "Insurance model",
      note: "Focus on combined ratio, reserve development, solvency capital, investment portfolio risk, book value and underwriting-cycle normalisation.",
    };
  }
  if (/asset management|investment management|capital management|wealth/.test(text)) {
    return {
      kind: "asset_manager",
      label: "Asset-manager model",
      note: "Focus on assets under management, net flows, fee rate, performance fees, operating leverage, seed capital and capital return.",
    };
  }
  if (/exchange|market data|ratings|index|clearing/.test(text)) {
    return {
      kind: "exchange_data",
      label: "Exchange / financial-data model",
      note: "Focus on recurring data revenue, trading and clearing volumes, pricing power, regulatory capital and acquisition economics.",
    };
  }
  if (/consumer finance|lending|credit|mortgage/.test(text)) {
    return {
      kind: "lender",
      label: "Specialist-lender model",
      note: "Focus on net interest margin, credit losses, funding costs, deposit or wholesale funding stability, capital ratios and vintage performance.",
    };
  }
  if (/bank|bancorp|financial group|savings|thrift/.test(text)) {
    return {
      kind: "bank",
      label: "Bank model",
      note: "Focus on CET1, tangible book value, net interest margin, deposit mix, non-performing loans, credit costs and funding liquidity rather than industrial net debt / EBITDA.",
    };
  }
  return {
    kind: "diversified_financial",
    label: "Diversified-financial model",
    note: "Residual income and cash generation can nominate the company, but regulatory capital, asset quality and funding structure must be reviewed before high conviction.",
  };
}

function lensScore(analysis: InstitutionalAnalysis | null, key: string): number | null {
  return finite(analysis?.lenses.find((lens) => lens.key === key)?.score);
}

function finiteScore(candidate: OpportunityCandidate, scoreType: string, inputKey: string): number | null {
  if (scoreType !== "valuation") return null;
  const score = candidate.evidence.valuationCompression;
  const direct = finite((score as unknown as { inputs?: Record<string, unknown> })?.inputs?.[inputKey]);
  return direct === null ? null : pctScore(direct, 0.01, 0.12);
}

function piotroskiScore(candidate: OpportunityCandidate): number | null {
  const model = candidate.fundamentalModels.piotroski;
  const raw = model.score ?? model.provisionalScore;
  return finite(raw) === null ? null : clamp(((raw ?? 0) / 9) * 100);
}

function pctScore(value: unknown, bad: number, good: number): number | null {
  const number = finite(value);
  if (number === null || good === bad) return null;
  return clamp(((number - bad) / (good - bad)) * 100);
}

function invert(value: number | null): number | null {
  return value === null ? null : 100 - value;
}

function negate(value: unknown): number | null {
  const number = finite(value);
  return number === null ? null : -number;
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
