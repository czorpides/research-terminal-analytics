/**
 * Composite ranking. Blends technicals (momentum/trend/volatility) with
 * fundamentals (valuation/quality) whenever the fundamentals are available.
 * Weights renormalise across whichever score types are present so an asset
 * without fundamentals still gets a technical-only composite.
 */
export const COMPOSITE_WEIGHTS = {
  momentum:   25,
  trend:      20,
  volatility: 15,
  valuation:  25,
  quality:    15,
} as const;
export const COMPOSITE_CALC_VERSION = "composite.v0.2";

export type CompositeInputs = Partial<Record<keyof typeof COMPOSITE_WEIGHTS, number | null>>;

export function compositeScore(scores: CompositeInputs): { value: number | null; components: Array<{ type: string; weight: number; value: number }> } {
  const active: Array<{ type: string; weight: number; value: number }> = [];
  for (const [type, w] of Object.entries(COMPOSITE_WEIGHTS)) {
    const v = scores[type as keyof typeof COMPOSITE_WEIGHTS];
    if (typeof v === "number" && Number.isFinite(v)) active.push({ type, weight: w, value: v });
  }
  if (active.length === 0) return { value: null, components: [] };
  const totalW = active.reduce((s, c) => s + c.weight, 0);
  const value = active.reduce((s, c) => s + c.value * c.weight, 0) / totalW;
  return { value, components: active };
}

/** Symmetric risk composite for the overvaluation radar. Inverts the "good" direction. */
export function riskScore(scores: CompositeInputs): { value: number | null; components: Array<{ type: string; weight: number; value: number }> } {
  const inv: CompositeInputs = {
    momentum:   scores.momentum   != null ? 100 - scores.momentum   : null,
    trend:      scores.trend      != null ? 100 - scores.trend      : null,
    volatility: scores.volatility != null ? 100 - scores.volatility : null, // low-vol scored high in scorer → invert for risk
    valuation:  scores.valuation  != null ? 100 - scores.valuation  : null, // expensive = risk
    quality:    scores.quality    != null ? 100 - scores.quality    : null, // low quality = risk
  };
  return compositeScore(inv);
}