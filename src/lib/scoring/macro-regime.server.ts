export type MacroRegimeLabel =
  | "goldilocks"
  | "reflation"
  | "overheating"
  | "late_cycle"
  | "slowdown"
  | "contraction"
  | "policy_reflation"
  | "mixed"
  | "insufficient";

export interface MacroRegimeInput {
  growth: number | null;
  inflation: number | null;
  liquidityStress: number | null;
  labourHeat: number | null;
  marketStress: number | null;
}
export interface MacroRegimeResult {
  label: MacroRegimeLabel;
  confidence: number;
  probabilities: Record<MacroRegimeLabel, number>;
  drivers: Array<{ engine: keyof MacroRegimeInput; value: number | null; effect: string }>;
  methodology: string;
}

/** Explainable current-state classifier. HMM output is shown separately in shadow mode. */
export function classifyMacroRegime(input: MacroRegimeInput): MacroRegimeResult {
  const present = Object.values(input).filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  const coverage = present.length / 5;
  const drivers = (Object.entries(input) as Array<[keyof MacroRegimeInput, number | null]>).map(
    ([engine, value]) => ({
      engine,
      value,
      effect: value === null ? "missing" : value > 0.5 ? "high" : value < -0.5 ? "low" : "neutral",
    }),
  );
  if (present.length < 3)
    return {
      label: "insufficient",
      confidence: Math.round(coverage * 100),
      probabilities: { insufficient: 1 } as Record<MacroRegimeLabel, number>,
      drivers,
      methodology: "macro.regime.rules.v1",
    };
  const growth = input.growth ?? 0;
  const inflation = input.inflation ?? 0;
  const liquidity = input.liquidityStress ?? 0;
  const labour = input.labourHeat ?? 0;
  const market = input.marketStress ?? 0;
  let label: MacroRegimeLabel = "mixed";
  if (growth > 0.25 && inflation < 0.25 && liquidity < 0.5 && market < 0.5) label = "goldilocks";
  else if (growth > 0.2 && inflation >= 0.25 && liquidity < 0.75)
    label = inflation > 0.9 || labour > 0.9 ? "overheating" : "reflation";
  else if (growth >= -0.2 && (liquidity > 0.6 || labour < -0.35)) label = "late_cycle";
  else if (growth < -0.2 && growth >= -0.9 && market < 1) label = "slowdown";
  else if (growth < -0.9 || (market > 1 && labour < -0.6)) label = "contraction";
  else if (growth < 0 && liquidity < -0.5 && market < 0.4) label = "policy_reflation";
  const raw: Partial<Record<MacroRegimeLabel, number>> = {
    [label]: 0.62,
    mixed: label === "mixed" ? 0.62 : 0.18,
  };
  if (label !== "slowdown") raw.slowdown = 0.1;
  if (label !== "goldilocks") raw.goldilocks = 0.1;
  const total = Object.values(raw).reduce((sum, value) => sum + (value ?? 0), 0);
  const probabilities = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, (value ?? 0) / total]),
  ) as Record<MacroRegimeLabel, number>;
  return {
    label,
    confidence: Math.round(coverage * Math.max(...Object.values(probabilities)) * 100),
    probabilities,
    drivers,
    methodology: "macro.regime.rules.v1",
  };
}
