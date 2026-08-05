import { loadUsEngineSeries, type MacroIndicatorSeries } from "@/lib/macro/engine-data.server";
import type { SwingExpectationSignal } from "./expectations";
import type { SwingV2CatalystContext, SwingV2MacroContext } from "./model-v2";

export interface SwingV2EarningsEvent {
  scheduled_at: string;
  surprise_pct: number | null;
  actual_eps: number | null;
  estimate_eps: number | null;
}

export interface SwingV2NewsItem {
  headline: string;
  published_at: string;
  sentiment: number | null;
  url: string | null;
}

export function buildEquityCatalystContext(
  events: SwingV2EarningsEvent[],
  expectations: SwingExpectationSignal | null,
  news: SwingV2NewsItem[],
  now = new Date(),
): SwingV2CatalystContext {
  const nowMs = now.getTime();
  const upcoming = events
    .filter((event) => new Date(event.scheduled_at).getTime() > nowMs)
    .sort((left, right) => left.scheduled_at.localeCompare(right.scheduled_at))[0] ?? null;
  const recent = events
    .filter((event) => new Date(event.scheduled_at).getTime() <= nowMs && event.surprise_pct !== null)
    .sort((left, right) => right.scheduled_at.localeCompare(left.scheduled_at))[0] ?? null;
  const daysToEarnings = upcoming
    ? Math.max(0, Math.ceil((new Date(upcoming.scheduled_at).getTime() - nowMs) / 86_400_000))
    : null;

  const components: Array<{ value: number; weight: number }> = [];
  const reasons: string[] = [];
  const risks: string[] = [];
  let label: string | null = null;

  if (expectations && expectations.freshness !== "stale" && expectations.validationState === "accepted") {
    components.push({ value: expectations.score, weight: 0.58 });
    reasons.push(...expectations.reasons.slice(0, 4));
    risks.push(...expectations.warnings.slice(0, 3));
    if (expectations.strongPositive) label = "Forward estimates / price targets are being revised higher";
    if (expectations.blockHighConviction) label = "Forward estimates are deteriorating";
  }

  if (recent?.surprise_pct !== null && recent?.surprise_pct !== undefined) {
    const surprise = Number(recent.surprise_pct);
    const score = surprise >= 10 ? 88 : surprise >= 5 ? 76 : surprise > 0 ? 62 : surprise <= -10 ? 18 : surprise <= -5 ? 30 : 43;
    components.push({ value: score, weight: 0.3 });
    reasons.push(`Latest reported EPS surprise was ${surprise >= 0 ? "+" : ""}${surprise.toFixed(1)}%.`);
    if (!label && surprise >= 5) label = `Recent earnings beat (${surprise >= 0 ? "+" : ""}${surprise.toFixed(1)}% EPS surprise)`;
    if (surprise <= -5) risks.push(`Latest reported EPS missed consensus by ${Math.abs(surprise).toFixed(1)}%.`);
  }

  const sentimentValues = news
    .map((item) => normalizeSentiment(item.sentiment))
    .filter((value): value is number => value !== null);
  if (sentimentValues.length) {
    const average = sentimentValues.reduce((sum, value) => sum + value, 0) / sentimentValues.length;
    components.push({ value: average, weight: 0.12 });
    if (average >= 65) reasons.push(`Stored recent-news sentiment is constructive across ${sentimentValues.length} source-linked item${sentimentValues.length === 1 ? "" : "s"}.`);
    if (average <= 35) risks.push(`Stored recent-news sentiment is weak across ${sentimentValues.length} source-linked item${sentimentValues.length === 1 ? "" : "s"}.`);
  }

  if (upcoming && daysToEarnings !== null) {
    if (!label && daysToEarnings <= 30) label = `Quarterly results due in ${daysToEarnings} day${daysToEarnings === 1 ? "" : "s"}`;
    if (daysToEarnings <= 3) risks.unshift(`Quarterly results are due in ${daysToEarnings} day${daysToEarnings === 1 ? "" : "s"}, creating binary gap risk.`);
    else if (daysToEarnings <= 21) reasons.push(`Quarterly results are scheduled in ${daysToEarnings} days; this is an upcoming event, not automatically a bullish catalyst.`);
  }

  // Headlines remain evidence/context only unless a stored sentiment score exists.
  // Do not manufacture bullish/bearish meaning from text without a verified classifier.
  for (const item of news.slice(0, 2)) {
    reasons.push(`Recent source-linked update: ${item.headline}`);
  }

  const score = components.length
    ? weightedAverage(components)
    : null;
  const expectationConfidence = expectations?.confidence ?? 0;
  const confidence = clamp(
    (expectations ? Math.min(70, expectationConfidence * 0.7) : 0) +
      (recent ? 18 : 0) +
      Math.min(12, sentimentValues.length * 4),
    0,
    100,
  );
  const positiveRevision = Boolean(
    expectations &&
      expectations.validationState === "accepted" &&
      expectations.freshness !== "stale" &&
      (expectations.strongPositive || expectations.adjustment >= 2),
  );
  const negativeRevision = Boolean(
    expectations &&
      expectations.validationState === "accepted" &&
      expectations.freshness !== "stale" &&
      (expectations.blockHighConviction || expectations.adjustment <= -2),
  );

  return {
    score,
    label,
    confidence,
    daysToEarnings,
    positiveRevision,
    negativeRevision,
    reasons: unique(reasons).slice(0, 8),
    risks: unique(risks).slice(0, 6),
  };
}

export async function loadPreciousMetalMacroContexts(): Promise<Record<"XAUUSD" | "XAGUSD", SwingV2MacroContext>> {
  try {
    const series = await loadUsEngineSeries("market");
    const realYield = series.find((item) => item.concept === "real_yield_10y") ?? null;
    const broadDollar = series.find((item) => item.concept === "broad_dollar") ?? null;
    const vix = series.find((item) => item.concept === "equity_volatility") ?? null;
    return {
      XAUUSD: preciousMetalContext("gold", realYield, broadDollar, vix),
      XAGUSD: preciousMetalContext("silver", realYield, broadDollar, vix),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const unavailable: SwingV2MacroContext = {
      score: 50,
      label: "Precious-metals macro context unavailable",
      available: false,
      reasons: [],
      risks: [`Macro context could not be loaded: ${message}`],
    };
    return { XAUUSD: unavailable, XAGUSD: unavailable };
  }
}

function preciousMetalContext(
  metal: "gold" | "silver",
  realYield: MacroIndicatorSeries | null,
  broadDollar: MacroIndicatorSeries | null,
  vix: MacroIndicatorSeries | null,
): SwingV2MacroContext {
  const realYieldChange = pointChange(realYield, 20);
  const dollarChangePct = percentChange(broadDollar, 20);
  const vixChangePct = percentChange(vix, 10);
  let score = 50;
  const reasons: string[] = [];
  const risks: string[] = [];
  let evidence = 0;

  if (realYieldChange !== null) {
    evidence += 1;
    if (realYieldChange <= -0.2) {
      score += 22;
      reasons.push(`US 10-year real yields have fallen ${Math.abs(realYieldChange).toFixed(2)} percentage points over roughly 20 observations, a meaningful precious-metals tailwind.`);
    } else if (realYieldChange <= -0.07) {
      score += 10;
      reasons.push("US real yields are easing, which is supportive for precious metals.");
    } else if (realYieldChange >= 0.2) {
      score -= 22;
      risks.push(`US 10-year real yields have risen ${realYieldChange.toFixed(2)} percentage points, a material headwind for precious metals.`);
    } else if (realYieldChange >= 0.07) {
      score -= 10;
      risks.push("US real yields are rising, which works against the precious-metals setup.");
    }
  }

  if (dollarChangePct !== null) {
    evidence += 1;
    if (dollarChangePct <= -2) {
      score += 20;
      reasons.push(`The broad US dollar index has weakened about ${Math.abs(dollarChangePct).toFixed(1)}% over roughly 20 observations.`);
    } else if (dollarChangePct <= -0.7) {
      score += 9;
      reasons.push("The broad US dollar is softening, which supports dollar-priced metals.");
    } else if (dollarChangePct >= 2) {
      score -= 20;
      risks.push(`The broad US dollar has strengthened about ${dollarChangePct.toFixed(1)}%, a headwind for dollar-priced metals.`);
    } else if (dollarChangePct >= 0.7) {
      score -= 9;
      risks.push("The broad US dollar is strengthening against the metals setup.");
    }
  }

  if (vixChangePct !== null) {
    evidence += 1;
    if (metal === "gold" && vixChangePct >= 15) {
      score += 7;
      reasons.push("Equity volatility has risen sharply, adding a modest safe-haven tailwind for gold.");
    } else if (metal === "silver" && vixChangePct >= 25) {
      score -= 4;
      risks.push("A sharp risk-off move can pressure silver's industrial-demand component even when gold benefits.");
    }
  }

  const label = score >= 68
    ? `${metal === "gold" ? "Gold" : "Silver"} macro backdrop is supportive`
    : score <= 35
      ? `${metal === "gold" ? "Gold" : "Silver"} macro backdrop is a headwind`
      : `${metal === "gold" ? "Gold" : "Silver"} macro backdrop is mixed`;
  return {
    score: clamp(score, 0, 100),
    label,
    available: evidence >= 2,
    reasons,
    risks,
  };
}

function pointChange(series: MacroIndicatorSeries | null, lookback: number): number | null {
  if (!series || series.history.length <= lookback) return null;
  const latest = series.history.at(-1)?.value;
  const prior = series.history.at(-1 - lookback)?.value;
  return latest !== undefined && prior !== undefined && Number.isFinite(latest) && Number.isFinite(prior)
    ? latest - prior
    : null;
}

function percentChange(series: MacroIndicatorSeries | null, lookback: number): number | null {
  if (!series || series.history.length <= lookback) return null;
  const latest = series.history.at(-1)?.value;
  const prior = series.history.at(-1 - lookback)?.value;
  if (latest === undefined || prior === undefined || !Number.isFinite(latest) || !Number.isFinite(prior) || prior === 0) return null;
  return (latest / prior - 1) * 100;
}

function normalizeSentiment(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value >= -1 && value <= 1) return clamp(50 + value * 50, 0, 100);
  if (value >= 0 && value <= 100) return value;
  if (value >= -100 && value <= 100) return clamp(50 + value / 2, 0, 100);
  return null;
}

function weightedAverage(values: Array<{ value: number; weight: number }>): number {
  const total = values.reduce((sum, item) => sum + item.weight, 0);
  return total > 0 ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / total : 50;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
