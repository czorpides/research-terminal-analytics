export type FinancialConditionsComponent = { key: string; label: string; family: "rates" | "credit" | "liquidity"; value: number | null; zScore: number | null; weight: number; contribution: number | null; direction: "tighter" | "easier" };
export type FinancialConditionsScore = { score: number | null; regime: "restrictive" | "neutral" | "accommodative" | "insufficient"; confidence: number; methodology: string; components: FinancialConditionsComponent[] };

/** A transparent, equally auditable initial FCI. Positive z-scores mean tighter
 * conditions after applying each series' economic direction.  It deliberately
 * avoids pretending the inactive PCA endpoint is a validated live factor. */
export function scoreFinancialConditions(input: Array<{ key: string; label: string; family: FinancialConditionsComponent["family"]; values: number[]; current: number | null; higherIsTighter: boolean; weight: number }>): FinancialConditionsScore {
  const available = input.filter((x) => x.current != null && x.values.length >= 24);
  const activeWeight = available.reduce((n, x) => n + x.weight, 0);
  const components = input.map((x) => {
    const mean = x.values.reduce((n, v) => n + v, 0) / Math.max(1, x.values.length);
    const variance = x.values.reduce((n, v) => n + (v - mean) ** 2, 0) / Math.max(1, x.values.length);
    const rawZ = x.current == null || variance === 0 ? null : (x.current - mean) / Math.sqrt(variance);
    const zScore = rawZ == null ? null : Math.max(-3, Math.min(3, rawZ * (x.higherIsTighter ? 1 : -1)));
    const weight = activeWeight && zScore != null ? x.weight / activeWeight : 0;
    return { key: x.key, label: x.label, family: x.family, value: x.current, zScore, weight, contribution: zScore == null ? null : zScore * weight, direction: zScore == null || zScore >= 0 ? "tighter" as const : "easier" as const };
  });
  if (!activeWeight) return { score: null, regime: "insufficient", confidence: 0, methodology: "fci.transparent.zscore.v1", components };
  const fci = components.reduce((n, x) => n + (x.contribution ?? 0), 0);
  return { score: Math.round(fci * 100) / 100, regime: fci > 0.5 ? "restrictive" : fci < -0.5 ? "accommodative" : "neutral", confidence: Math.round(activeWeight * 100), methodology: "fci.transparent.zscore.v1", components };
}
