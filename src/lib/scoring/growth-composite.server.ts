/**
 * Dimensionless US Growth composite used by the Growth × Inflation map.
 *
 * Each component starts from its Kalman slope, is monthly-aligned, converted
 * to a rolling z-score using only information available at that date,
 * direction-adjusted, winsorised, and then combined with documented weights.
 * Raw slopes measured in dollars, people, thousands or index points are never
 * averaged directly.
 */

export interface GrowthSlopePoint {
  date: string;
  value: number;
}

export interface GrowthCompositeInput {
  conceptCode: string;
  points: GrowthSlopePoint[];
}

export interface GrowthCompositeContribution {
  conceptCode: string;
  rawSlope: number;
  standardisedSlope: number;
  directionSign: 1 | -1;
  configuredWeight: number;
  effectiveWeight: number;
  weightedContribution: number;
}

export interface GrowthCompositePoint {
  date: string;
  value: number;
  coverage: number;
  contributions: GrowthCompositeContribution[];
}

interface GrowthComponentConfig {
  weight: number;
  directionSign: 1 | -1;
}

export const GROWTH_COMPOSITE_VERSION = "growth_composite.v2.0";
export const GROWTH_ZSCORE_WINDOW = 60;
export const GROWTH_ZSCORE_MIN_HISTORY = 24;
export const GROWTH_ZSCORE_CAP = 3;
export const GROWTH_MIN_COVERAGE = 0.6;

export const GROWTH_COMPONENTS: Record<string, GrowthComponentConfig> = {
  industrial_production: { weight: 0.25, directionSign: 1 },
  retail_sales: { weight: 0.20, directionSign: 1 },
  housing_starts: { weight: 0.15, directionSign: 1 },
  initial_jobless_claims: { weight: 0.20, directionSign: -1 },
  nonfarm_payrolls: { weight: 0.20, directionSign: 1 },
};

function mean(xs: number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

function sampleStd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1));
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Take the final observation in each calendar month. This is important for the
 * weekly claims series, which otherwise receives more observations and would
 * dominate standardisation merely because it is higher frequency.
 */
export function monthlyLast(points: GrowthSlopePoint[]): GrowthSlopePoint[] {
  const byMonth = new Map<string, GrowthSlopePoint>();
  for (const point of points) {
    if (!Number.isFinite(point.value)) continue;
    const month = point.date.slice(0, 7);
    const current = byMonth.get(month);
    if (!current || point.date.localeCompare(current.date) >= 0) byMonth.set(month, point);
  }
  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, point]) => ({ date: `${month}-01`, value: point.value }));
}

/** Rolling, point-in-time z-scores. No future observations enter an old score. */
export function rollingZScores(points: GrowthSlopePoint[]): GrowthSlopePoint[] {
  return points.map((point, index) => {
    const start = Math.max(0, index - GROWTH_ZSCORE_WINDOW + 1);
    const history = points.slice(start, index + 1).map((p) => p.value).filter(Number.isFinite);
    if (history.length < GROWTH_ZSCORE_MIN_HISTORY) return { date: point.date, value: Number.NaN };
    const sd = sampleStd(history);
    if (!Number.isFinite(sd) || sd === 0) return { date: point.date, value: 0 };
    return {
      date: point.date,
      value: clamp((point.value - mean(history)) / sd, -GROWTH_ZSCORE_CAP, GROWTH_ZSCORE_CAP),
    };
  });
}

export function buildGrowthComposite(inputs: GrowthCompositeInput[]): GrowthCompositePoint[] {
  const totalConfiguredWeight = Object.values(GROWTH_COMPONENTS).reduce((sum, cfg) => sum + cfg.weight, 0);
  const byConcept = new Map<string, {
    raw: Map<string, number>;
    z: Map<string, number>;
  }>();
  const months = new Set<string>();

  for (const input of inputs) {
    if (!GROWTH_COMPONENTS[input.conceptCode]) continue;
    const monthly = monthlyLast(input.points);
    const zscores = rollingZScores(monthly);
    const raw = new Map(monthly.map((p) => [p.date, p.value]));
    const z = new Map(zscores.filter((p) => Number.isFinite(p.value)).map((p) => [p.date, p.value]));
    for (const date of z.keys()) months.add(date);
    byConcept.set(input.conceptCode, { raw, z });
  }

  const result: GrowthCompositePoint[] = [];
  for (const date of Array.from(months).sort()) {
    const available: Array<{
      conceptCode: string;
      rawSlope: number;
      adjustedZ: number;
      config: GrowthComponentConfig;
    }> = [];

    for (const [conceptCode, values] of byConcept) {
      const rawSlope = values.raw.get(date);
      const z = values.z.get(date);
      const config = GROWTH_COMPONENTS[conceptCode];
      if (rawSlope == null || z == null || !config) continue;
      available.push({ conceptCode, rawSlope, adjustedZ: z * config.directionSign, config });
    }

    const coveredWeight = available.reduce((sum, item) => sum + item.config.weight, 0);
    const coverage = totalConfiguredWeight > 0 ? coveredWeight / totalConfiguredWeight : 0;
    if (coverage < GROWTH_MIN_COVERAGE || coveredWeight === 0) continue;

    const contributions: GrowthCompositeContribution[] = available.map((item) => {
      const effectiveWeight = item.config.weight / coveredWeight;
      return {
        conceptCode: item.conceptCode,
        rawSlope: item.rawSlope,
        standardisedSlope: item.adjustedZ,
        directionSign: item.config.directionSign,
        configuredWeight: item.config.weight,
        effectiveWeight,
        weightedContribution: item.adjustedZ * effectiveWeight,
      };
    });

    result.push({
      date,
      value: contributions.reduce((sum, item) => sum + item.weightedContribution, 0),
      coverage,
      contributions,
    });
  }

  return result;
}
