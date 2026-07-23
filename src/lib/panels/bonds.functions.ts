import { createServerFn } from "@tanstack/react-start";

import type { ChartPoint, ChartZone, TrendSeries } from "./contract";

interface BondObservation {
  date: string;
  value: number;
}

export interface BondMetric {
  code: string;
  label: string;
  value: number | null;
  unit: "%" | "bp";
  change1d: number | null;
  change1w: number | null;
  change1m: number | null;
  asOf: string | null;
  explanation: string;
}

export interface YieldCurvePoint {
  tenor: string;
  years: number;
  current: number | null;
  oneWeekAgo: number | null;
  oneMonthAgo: number | null;
}

export interface DurationImpact {
  tenor: string;
  assumedDuration: number;
  weeklyYieldMoveBp: number | null;
  estimatedPriceMovePct: number | null;
}

export interface BondDashboardPayload {
  generatedAt: string;
  asOf: string | null;
  coverage: number;
  freshness: number;
  reliability: number;
  curveState: string;
  rateDriver: {
    nominalMove1wBp: number | null;
    realYieldMove1wBp: number | null;
    inflationMove1wBp: number | null;
    residual1wBp: number | null;
    dominant: string;
    explanation: string;
  };
  metrics: BondMetric[];
  curve: YieldCurvePoint[];
  charts: {
    treasury: TrendSeries;
    curve: TrendSeries;
    realYield: TrendSeries;
    breakeven: TrendSeries;
    credit: TrendSeries;
  };
  duration: DurationImpact[];
  narrative: {
    summary: string;
    detail: string;
    watch: string[];
  };
  sourceSeries: Array<{
    code: string;
    label: string;
    asOf: string | null;
    observations: number;
  }>;
}

const SERIES = [
  ["DGS1MO", "1-month Treasury"],
  ["DGS3MO", "3-month Treasury"],
  ["DGS6MO", "6-month Treasury"],
  ["DGS1", "1-year Treasury"],
  ["DGS2", "2-year Treasury"],
  ["DGS3", "3-year Treasury"],
  ["DGS5", "5-year Treasury"],
  ["DGS7", "7-year Treasury"],
  ["DGS10", "10-year Treasury"],
  ["DGS20", "20-year Treasury"],
  ["DGS30", "30-year Treasury"],
  ["DFII5", "5-year real yield"],
  ["DFII10", "10-year real yield"],
  ["DFII30", "30-year real yield"],
  ["T5YIE", "5-year breakeven inflation"],
  ["T10YIE", "10-year breakeven inflation"],
  ["T10Y2Y", "10-year minus 2-year curve"],
  ["T10Y3M", "10-year minus 3-month curve"],
  ["BAMLC0A0CM", "Investment-grade credit spread"],
  ["BAMLH0A0HYM2", "High-yield credit spread"],
] as const;

const CURVE = [
  ["1M", 1 / 12, "DGS1MO"],
  ["3M", 0.25, "DGS3MO"],
  ["6M", 0.5, "DGS6MO"],
  ["1Y", 1, "DGS1"],
  ["2Y", 2, "DGS2"],
  ["3Y", 3, "DGS3"],
  ["5Y", 5, "DGS5"],
  ["7Y", 7, "DGS7"],
  ["10Y", 10, "DGS10"],
  ["20Y", 20, "DGS20"],
  ["30Y", 30, "DGS30"],
] as const;

export const getBondDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<BondDashboardPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const codes = SERIES.map(([code]) => code);
    const { data: indicators, error: indicatorError } = await supabaseAdmin
      .from("economic_indicators")
      .select("id,provider_series_code")
      .in("provider_series_code", codes);
    if (indicatorError) throw indicatorError;

    const pointGroups = await Promise.all(
      (indicators ?? []).map(async (indicator) => {
        const { data, error } = await supabaseAdmin
          .from("data_points")
          .select("metric_code,value_num,as_of")
          .eq("subject_type", "indicator")
          .eq("subject_id", indicator.id)
          .eq("metric_code", indicator.provider_series_code as string)
          .order("as_of", { ascending: false })
          .limit(1900);
        if (error) throw error;
        return {
          code: String(indicator.provider_series_code),
          points: normaliseObservations(
            (data ?? []).map((point) => ({
              date: String(point.as_of),
              value: Number(point.value_num),
            })),
          ),
        };
      }),
    );
    const byCode = new Map(pointGroups.map((group) => [group.code, group.points]));

    const metrics = buildMetrics(byCode);
    const curve = CURVE.map(([tenor, years, code]) => ({
      tenor,
      years,
      current: latest(byCode.get(code)),
      oneWeekAgo: valueBefore(byCode.get(code), 7),
      oneMonthAgo: valueBefore(byCode.get(code), 30),
    }));
    const available = SERIES.filter(([code]) => (byCode.get(code)?.length ?? 0) > 0).length;
    const coverage = Math.round((available / SERIES.length) * 100);
    const latestDates = SERIES.flatMap(([code]) => {
      const point = byCode.get(code)?.at(-1);
      return point ? [point.date] : [];
    });
    const asOf = latestDates.sort().at(-1) ?? null;
    const freshness = freshnessScore(latestDates);
    const reliability = Math.round(coverage * 0.7 + freshness * 0.3);
    const curveState = describeCurve(latest(byCode.get("T10Y2Y")), latest(byCode.get("T10Y3M")));
    const rateDriver = buildRateDriver(byCode);
    const duration = buildDuration(byCode);
    const charts = buildCharts(byCode);
    const narrative = buildNarrative(metrics, curveState, rateDriver, reliability);

    return {
      generatedAt: new Date().toISOString(),
      asOf,
      coverage,
      freshness,
      reliability,
      curveState,
      rateDriver,
      metrics,
      curve,
      charts,
      duration,
      narrative,
      sourceSeries: SERIES.map(([code, label]) => ({
        code,
        label,
        asOf: byCode.get(code)?.at(-1)?.date ?? null,
        observations: byCode.get(code)?.length ?? 0,
      })),
    };
  },
);

function buildMetrics(byCode: Map<string, BondObservation[]>): BondMetric[] {
  return [
    metric(
      "DGS2",
      "2-year Treasury",
      byCode,
      "Closest liquid guide to expected policy rates over the next few years.",
    ),
    metric(
      "DGS10",
      "10-year Treasury",
      byCode,
      "Benchmark long-term borrowing rate. Higher yields generally tighten financing conditions.",
    ),
    metric(
      "DGS30",
      "30-year Treasury",
      byCode,
      "Long-duration yield, sensitive to inflation risk, term premium and fiscal supply.",
    ),
    metric(
      "T10Y2Y",
      "10Y minus 2Y",
      byCode,
      "A negative value means shorter yields exceed longer yields; a re-steepening curve can reflect easing expectations or rising long-term risk.",
    ),
    metric(
      "DFII10",
      "10-year real yield",
      byCode,
      "The inflation-adjusted discount rate. Higher real yields usually weigh on long-duration assets.",
    ),
    metric(
      "T10YIE",
      "10-year inflation pricing",
      byCode,
      "Market-implied average inflation compensation, not a pure inflation forecast.",
    ),
    metric(
      "BAMLC0A0CM",
      "Investment-grade spread",
      byCode,
      "Extra yield above Treasuries for investment-grade corporate bonds.",
    ),
    metric(
      "BAMLH0A0HYM2",
      "High-yield spread",
      byCode,
      "Extra yield above Treasuries for lower-rated debt; widening usually signals rising credit stress.",
    ),
  ];
}

function metric(
  code: string,
  label: string,
  byCode: Map<string, BondObservation[]>,
  explanation: string,
): BondMetric {
  const points = byCode.get(code);
  const isSpread = code.startsWith("BAML");
  return {
    code,
    label,
    value: latest(points) === null ? null : latest(points)! * (isSpread ? 100 : 1),
    unit: isSpread ? "bp" : "%",
    change1d: change(points, 1, isSpread ? 100 : 1),
    change1w: change(points, 7, isSpread ? 100 : 1),
    change1m: change(points, 30, isSpread ? 100 : 1),
    asOf: points?.at(-1)?.date ?? null,
    explanation,
  };
}

function buildRateDriver(byCode: Map<string, BondObservation[]>) {
  const nominal = change(byCode.get("DGS10"), 7, 100);
  const real = change(byCode.get("DFII10"), 7, 100);
  const inflation = change(byCode.get("T10YIE"), 7, 100);
  const residual =
    nominal === null || real === null || inflation === null ? null : nominal - real - inflation;
  let dominant = "Not enough current data";
  if (real !== null && inflation !== null) {
    dominant =
      Math.abs(real) > Math.abs(inflation)
        ? "Real yields contributed more"
        : Math.abs(inflation) > Math.abs(real)
          ? "Inflation pricing contributed more"
          : "Real yields and inflation pricing contributed equally";
  }
  return {
    nominalMove1wBp: nominal,
    realYieldMove1wBp: real,
    inflationMove1wBp: inflation,
    residual1wBp: residual,
    dominant,
    explanation:
      "Approximation: the weekly move in the nominal 10-year yield is split into the move in the 10-year real yield and the move in 10-year inflation compensation. Timing and market-construction differences appear as a residual.",
  };
}

function buildDuration(byCode: Map<string, BondObservation[]>): DurationImpact[] {
  return [
    ["2Y", "DGS2", 1.9],
    ["5Y", "DGS5", 4.5],
    ["10Y", "DGS10", 8.2],
    ["30Y", "DGS30", 16.5],
  ].map(([tenor, code, duration]) => {
    const weeklyYieldMoveBp = change(byCode.get(String(code)), 7, 100);
    return {
      tenor: String(tenor),
      assumedDuration: Number(duration),
      weeklyYieldMoveBp,
      estimatedPriceMovePct:
        weeklyYieldMoveBp === null ? null : -Number(duration) * (weeklyYieldMoveBp / 100),
    };
  });
}

function buildCharts(byCode: Map<string, BondObservation[]>): BondDashboardPayload["charts"] {
  return {
    treasury: chart(
      byCode.get("DGS2"),
      "2-year yield",
      "percent",
      [
        { to: 3, kind: "good", label: "Lower financing pressure" },
        { from: 3, to: 5, kind: "warn", label: "Restrictive range" },
        { from: 5, kind: "bad", label: "High financing pressure" },
      ],
      {
        label: "10-year yield",
        points: toChartPoints(byCode.get("DGS10")),
      },
    ),
    curve: chart(byCode.get("T10Y2Y"), "10Y minus 2Y", "percent", [
      { to: 0, kind: "bad", label: "Inverted curve" },
      { from: 0, to: 0.5, kind: "warn", label: "Flat curve" },
      { from: 0.5, kind: "good", label: "Positive slope" },
    ]),
    realYield: chart(byCode.get("DFII10"), "10-year real yield", "percent", [
      { to: 1, kind: "good", label: "Supportive real discount rate" },
      { from: 1, to: 2.25, kind: "warn", label: "Restrictive real rate" },
      { from: 2.25, kind: "bad", label: "High real-rate pressure" },
    ]),
    breakeven: chart(byCode.get("T10YIE"), "10-year inflation pricing", "percent", [
      { to: 1.5, kind: "bad", label: "Low-inflation or demand risk" },
      { from: 1.5, to: 2.5, kind: "good", label: "Broadly anchored" },
      { from: 2.5, to: 3, kind: "warn", label: "Elevated inflation pricing" },
      { from: 3, kind: "bad", label: "High inflation-risk pricing" },
    ]),
    credit: chart(
      byCode.get("BAMLH0A0HYM2"),
      "High-yield spread",
      "bp",
      [
        { to: 350, kind: "good", label: "Calm credit conditions" },
        { from: 350, to: 500, kind: "warn", label: "Credit caution" },
        { from: 500, kind: "bad", label: "Credit stress" },
      ],
      {
        label: "Investment-grade spread",
        points: toChartPoints(byCode.get("BAMLC0A0CM"), 100),
      },
      100,
    ),
  };
}

function chart(
  points: BondObservation[] | undefined,
  yLabel: string,
  format: TrendSeries["format"],
  zones: ChartZone[],
  compare?: TrendSeries["compare"],
  scale = 1,
): TrendSeries {
  return {
    points: toChartPoints(points, scale),
    compare,
    zones,
    yLabel,
    format,
  };
}

function buildNarrative(
  metrics: BondMetric[],
  curveState: string,
  driver: BondDashboardPayload["rateDriver"],
  reliability: number,
): BondDashboardPayload["narrative"] {
  const get = (code: string) => metrics.find((item) => item.code === code);
  const tenYear = get("DGS10");
  const real = get("DFII10");
  const highYield = get("BAMLH0A0HYM2");
  const weekly = tenYear?.change1w;
  const direction =
    weekly === null || weekly === undefined
      ? "has insufficient weekly history"
      : weekly > 0
        ? `rose ${Math.abs(weekly * 100).toFixed(0)}bp over the latest week`
        : weekly < 0
          ? `fell ${Math.abs(weekly * 100).toFixed(0)}bp over the latest week`
          : "was unchanged over the latest week";
  return {
    summary: `The 10-year Treasury ${direction}. The curve is ${curveState.toLowerCase()}. ${driver.dominant}.`,
    detail: `Real yields are ${formatPercent(real?.value)} and high-yield credit spreads are ${formatSpread(highYield?.value)}. Together these indicate the discount-rate and credit-risk pressure currently facing equities, housing and corporate borrowers. Reliability is ${reliability}% because it reflects both series coverage and source freshness.`,
    watch: [
      "A rise led by real yields tightens discount rates more directly than the same rise led by inflation pricing.",
      "A curve that steepens because long yields rise can be less supportive than one that steepens because short yields fall.",
      "Widening high-yield spreads alongside rising Treasury yields is a stronger warning than either move alone.",
      "Duration estimates are first-order approximations; convexity, coupon and security-specific cash flows can change realised prices.",
    ],
  };
}

function describeCurve(tenTwo: number | null, tenThreeMonth: number | null): string {
  if (tenTwo === null && tenThreeMonth === null) return "Insufficient data";
  const values = [tenTwo, tenThreeMonth].filter((value): value is number => value !== null);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (average < 0) return "Inverted";
  if (average < 0.5) return "Flat to mildly positive";
  return "Positively sloped";
}

function normaliseObservations(points: BondObservation[]): BondObservation[] {
  const byDate = new Map<string, number>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    const date = new Date(point.date);
    if (!Number.isFinite(date.getTime())) continue;
    byDate.set(date.toISOString(), point.value);
  }
  return [...byDate.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([date, value]) => ({ date, value }));
}

function latest(points: BondObservation[] | undefined): number | null {
  return points?.at(-1)?.value ?? null;
}

function valueBefore(points: BondObservation[] | undefined, calendarDays: number): number | null {
  const current = points?.at(-1);
  if (!current) return null;
  const target = new Date(current.date).getTime() - calendarDays * 86_400_000;
  const prior = [...(points ?? [])]
    .reverse()
    .find((point) => new Date(point.date).getTime() <= target);
  return prior?.value ?? null;
}

function change(
  points: BondObservation[] | undefined,
  calendarDays: number,
  scale = 1,
): number | null {
  const current = latest(points);
  const prior = valueBefore(points, calendarDays);
  return current === null || prior === null ? null : (current - prior) * scale;
}

function toChartPoints(points: BondObservation[] | undefined, scale = 1): ChartPoint[] {
  return (points ?? []).slice(-780).map((point) => ({
    t: point.date,
    v: point.value * scale,
  }));
}

function freshnessScore(latestDates: string[]): number {
  if (!latestDates.length) return 0;
  const scores = latestDates.map((date) => {
    const days = Math.max(0, (Date.now() - new Date(date).getTime()) / 86_400_000);
    if (days <= 5) return 100;
    if (days <= 10) return 75;
    if (days <= 30) return 40;
    return 10;
  });
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? "unavailable" : `${value.toFixed(2)}%`;
}

function formatSpread(value: number | null | undefined): string {
  return value === null || value === undefined ? "unavailable" : `${value.toFixed(0)}bp`;
}
