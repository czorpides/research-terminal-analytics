/**
 * Deterministic Inflation Pressure Score.
 * Contribution ledger: each component reports its raw metric, direction of
 * pressure, weight and points contributed. Sum of contributions = final
 * score. The ledger is what makes the score explainable.
 */
export type PressureDirection = "up" | "down" | "neutral";

export interface PressureContribution {
  key: string;
  label: string;
  metric: string;
  value: number | null;
  target: string | null;
  distance: number | null;
  direction: PressureDirection;
  weight: number;
  points: number;
  detail?: string;
}

export interface InflationPressure {
  score: number;
  regime: "cooling" | "on_target" | "warming" | "overshooting";
  contributions: PressureContribution[];
  calcVersion: string;
  computedAt: string;
}

const WEIGHTS = {
  cpi_core: 0.20, pce_core: 0.20, cpi_headline: 0.10, ppi_final_demand: 0.10,
  wage_ahe: 0.10, cpi_shelter: 0.10, breakeven_5y5y: 0.10, umich_1y_expectations: 0.05,
  import_prices: 0.05,
};

export interface PressureInput {
  key: keyof typeof WEIGHTS;
  label: string;
  metric: string;
  value: number | null;
  target: { value: number; band: [number, number] } | null;
}

export function scoreInflationPressure(inputs: PressureInput[]): InflationPressure {
  const contributions: PressureContribution[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const inp of inputs) {
    const w = WEIGHTS[inp.key] ?? 0;
    if (!w) continue;
    if (inp.value == null || !inp.target) {
      contributions.push({
        key: inp.key, label: inp.label, metric: inp.metric, value: inp.value,
        target: inp.target ? `${inp.target.band[0]}–${inp.target.band[1]}` : null,
        distance: null, direction: "neutral", weight: w, points: 0,
        detail: "missing data",
      });
      continue;
    }
    const mid = inp.target.value;
    const halfBand = Math.max(0.1, (inp.target.band[1] - inp.target.band[0]) / 2);
    const distance = inp.value - mid;
    const normalised = Math.max(-3, Math.min(3, distance / halfBand));
    const componentScore = 50 + (normalised / 3) * 50;
    const points = componentScore * w;
    weightedSum += points;
    totalWeight += w;
    contributions.push({
      key: inp.key, label: inp.label, metric: inp.metric, value: inp.value,
      target: `${inp.target.band[0]}–${inp.target.band[1]}`, distance,
      direction: distance > halfBand * 0.25 ? "up" : distance < -halfBand * 0.25 ? "down" : "neutral",
      weight: w, points,
    });
  }

  const score = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 10) / 10 : 50;
  const regime: InflationPressure["regime"] =
    score >= 75 ? "overshooting" : score >= 55 ? "warming" : score >= 45 ? "on_target" : "cooling";
  return { score, regime, contributions, calcVersion: "inflation_pressure.v1.0", computedAt: new Date().toISOString() };
}