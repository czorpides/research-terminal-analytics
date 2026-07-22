/**
 * Deterministic, family-capped US Inflation Pressure Score.
 *
 * The score separates current level from direction and acceleration. Closely
 * related CPI/PCE measures are grouped before aggregation so correlated series
 * cannot overwhelm the model merely because several versions are available.
 */

export type PressureDirection = "up" | "down" | "neutral";
export type InflationFamily =
  | "consumer_prices"
  | "shelter_services"
  | "wages"
  | "producer_import_freight"
  | "market_expectations"
  | "survey_expectations";

export interface PressureContribution {
  key: PressureKey;
  label: string;
  family: InflationFamily;
  metric: string;
  value: number | null;
  target: string | null;
  distance: number | null;
  trend3m: number | null;
  acceleration3m: number | null;
  direction: PressureDirection;
  weight: number;
  points: number;
  levelPoints: number;
  directionPoints: number;
  accelerationPoints: number;
  detail?: string;
}

export interface InflationFamilyBreakdown {
  family: InflationFamily;
  cap: number;
  active: boolean;
  componentCoverage: number;
  effectiveWeight: number;
  pressureSignal: number | null;
  directionSignal: number | null;
  points: number;
}

export interface InflationPressureDiagnostics {
  missingKeys: PressureKey[];
  leaveOneOut: Array<{ key: PressureKey; scoreWithout: number; scoreDifference: number }>;
  weightScenarios: Array<{ name: string; score: number }>;
  scoreRange: [number, number];
}

export interface InflationPressure {
  score: number;
  directionScore: number;
  breadthScore: number;
  confidence: number;
  regime: "cooling" | "on_target" | "warming" | "overshooting";
  contributions: PressureContribution[];
  families: InflationFamilyBreakdown[];
  diagnostics: InflationPressureDiagnostics;
  calcVersion: string;
  computedAt: string;
}

interface ComponentConfig {
  family: InflationFamily;
  familyShare: number;
}

export const FAMILY_CAPS: Record<InflationFamily, number> = {
  consumer_prices: 0.30,
  shelter_services: 0.15,
  wages: 0.15,
  producer_import_freight: 0.15,
  market_expectations: 0.15,
  survey_expectations: 0.10,
};

export const COMPONENTS = {
  pce_core: { family: "consumer_prices", familyShare: 0.40 },
  cpi_core: { family: "consumer_prices", familyShare: 0.30 },
  pce_headline: { family: "consumer_prices", familyShare: 0.15 },
  cpi_headline: { family: "consumer_prices", familyShare: 0.15 },
  cpi_shelter: { family: "shelter_services", familyShare: 1.00 },
  wage_ahe: { family: "wages", familyShare: 1.00 },
  ppi_final_demand: { family: "producer_import_freight", familyShare: 0.45 },
  import_prices: { family: "producer_import_freight", familyShare: 0.35 },
  freight_truck_tonnage: { family: "producer_import_freight", familyShare: 0.20 },
  breakeven_5y5y: { family: "market_expectations", familyShare: 0.65 },
  breakeven_10y: { family: "market_expectations", familyShare: 0.35 },
  umich_1y_expectations: { family: "survey_expectations", familyShare: 1.00 },
} as const satisfies Record<string, ComponentConfig>;

export type PressureKey = keyof typeof COMPONENTS;

export interface PressureInput {
  key: PressureKey;
  label: string;
  metric: string;
  value: number | null;
  trend3m: number | null;
  acceleration3m: number | null;
  target: { value: number; band: [number, number] } | null;
}

interface ScoreProfile {
  name: string;
  levelWeight: number;
  directionWeight: number;
  accelerationWeight: number;
}

const BASELINE_PROFILE: ScoreProfile = {
  name: "baseline",
  levelWeight: 0.70,
  directionWeight: 0.20,
  accelerationWeight: 0.10,
};

const SENSITIVITY_PROFILES: ScoreProfile[] = [
  BASELINE_PROFILE,
  { name: "level_heavy", levelWeight: 0.80, directionWeight: 0.15, accelerationWeight: 0.05 },
  { name: "direction_heavy", levelWeight: 0.55, directionWeight: 0.30, accelerationWeight: 0.15 },
];

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function available(input: PressureInput): boolean {
  return input.value != null && Number.isFinite(input.value) && input.target != null;
}

function normalise(value: number | null, scale: number): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return clamp(value / Math.max(0.1, scale), -1, 1);
}

interface CoreScore {
  score: number;
  directionScore: number;
  breadthScore: number;
  confidence: number;
  contributions: PressureContribution[];
  families: InflationFamilyBreakdown[];
}

function calculateCore(inputs: PressureInput[], profile: ScoreProfile): CoreScore {
  const byKey = new Map(inputs.map((input) => [input.key, input]));
  const familyRows = new Map<InflationFamily, Array<{
    input: PressureInput;
    config: ComponentConfig;
    levelSignal: number;
    directionSignal: number;
    accelerationSignal: number;
  }>>();

  let configuredCoverage = 0;
  for (const [key, config] of Object.entries(COMPONENTS) as Array<[PressureKey, ComponentConfig]>) {
    const input = byKey.get(key);
    if (!input || !available(input)) continue;
    const target = input.target!;
    const halfBand = Math.max(0.1, (target.band[1] - target.band[0]) / 2);
    const levelSignal = clamp((input.value! - target.value) / (halfBand * 3), -1, 1);
    const directionSignal = normalise(input.trend3m, halfBand);
    const accelerationSignal = normalise(input.acceleration3m, halfBand);
    const rows = familyRows.get(config.family) ?? [];
    rows.push({ input, config, levelSignal, directionSignal, accelerationSignal });
    familyRows.set(config.family, rows);
    configuredCoverage += FAMILY_CAPS[config.family] * config.familyShare;
  }

  const activeFamilyCap = Array.from(familyRows.keys()).reduce((sum, family) => sum + FAMILY_CAPS[family], 0);
  const contributions: PressureContribution[] = [];
  const families: InflationFamilyBreakdown[] = [];
  let pressureSignalTotal = 0;
  let directionSignalTotal = 0;
  let positiveWeight = 0;
  let negativeWeight = 0;
  let neutralWeight = 0;

  for (const family of Object.keys(FAMILY_CAPS) as InflationFamily[]) {
    const rows = familyRows.get(family) ?? [];
    const cap = FAMILY_CAPS[family];
    const availableShare = rows.reduce((sum, row) => sum + row.config.familyShare, 0);
    const effectiveFamilyWeight = activeFamilyCap > 0 && rows.length > 0 ? cap / activeFamilyCap : 0;
    let familyPressure = 0;
    let familyDirection = 0;

    for (const row of rows) {
      const withinFamilyWeight = availableShare > 0 ? row.config.familyShare / availableShare : 0;
      const effectiveWeight = effectiveFamilyWeight * withinFamilyWeight;
      const componentSignal =
        profile.levelWeight * row.levelSignal
        + profile.directionWeight * row.directionSignal
        + profile.accelerationWeight * row.accelerationSignal;
      const levelPoints = 50 * effectiveWeight * profile.levelWeight * row.levelSignal;
      const directionPoints = 50 * effectiveWeight * profile.directionWeight * row.directionSignal;
      const accelerationPoints = 50 * effectiveWeight * profile.accelerationWeight * row.accelerationSignal;
      const points = levelPoints + directionPoints + accelerationPoints;
      const target = row.input.target!;
      const direction: PressureDirection = points > 0.25 ? "up" : points < -0.25 ? "down" : "neutral";

      pressureSignalTotal += effectiveWeight * componentSignal;
      directionSignalTotal += effectiveWeight * (
        0.75 * row.directionSignal + 0.25 * row.accelerationSignal
      );
      familyPressure += withinFamilyWeight * componentSignal;
      familyDirection += withinFamilyWeight * (0.75 * row.directionSignal + 0.25 * row.accelerationSignal);

      if (row.levelSignal > 0.1) positiveWeight += effectiveWeight;
      else if (row.levelSignal < -0.1) negativeWeight += effectiveWeight;
      else neutralWeight += effectiveWeight;

      contributions.push({
        key: row.input.key,
        label: row.input.label,
        family,
        metric: row.input.metric,
        value: row.input.value,
        target: `${target.band[0]}–${target.band[1]}`,
        distance: row.input.value! - target.value,
        trend3m: row.input.trend3m,
        acceleration3m: row.input.acceleration3m,
        direction,
        weight: effectiveWeight,
        points,
        levelPoints,
        directionPoints,
        accelerationPoints,
        detail: row.input.trend3m != null && row.input.value! > target.band[1] && row.input.trend3m < 0
          ? "level remains above target while the three-month direction is disinflationary"
          : undefined,
      });
    }

    families.push({
      family,
      cap,
      active: rows.length > 0,
      componentCoverage: availableShare,
      effectiveWeight: effectiveFamilyWeight,
      pressureSignal: rows.length > 0 ? familyPressure : null,
      directionSignal: rows.length > 0 ? familyDirection : null,
      points: rows.length > 0 ? 50 * effectiveFamilyWeight * familyPressure : 0,
    });
  }

  for (const input of inputs) {
    if (available(input)) continue;
    const config = COMPONENTS[input.key];
    contributions.push({
      key: input.key,
      label: input.label,
      family: config.family,
      metric: input.metric,
      value: input.value,
      target: input.target ? `${input.target.band[0]}–${input.target.band[1]}` : null,
      distance: null,
      trend3m: input.trend3m,
      acceleration3m: input.acceleration3m,
      direction: "neutral",
      weight: 0,
      points: 0,
      levelPoints: 0,
      directionPoints: 0,
      accelerationPoints: 0,
      detail: "missing data; weight excluded and confidence reduced",
    });
  }

  const breadthDenominator = positiveWeight + negativeWeight + neutralWeight;
  const breadthScore = breadthDenominator > 0
    ? ((positiveWeight + neutralWeight * 0.5) / breadthDenominator) * 100
    : 50;

  return {
    score: round(clamp(50 + 50 * pressureSignalTotal, 0, 100)),
    directionScore: round(clamp(50 + 50 * directionSignalTotal, 0, 100)),
    breadthScore: round(clamp(breadthScore, 0, 100)),
    confidence: round(clamp(configuredCoverage * 100, 0, 100)),
    contributions: contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    families,
  };
}

export function scoreInflationPressureSnapshot(inputs: PressureInput[]): Pick<
  InflationPressure,
  "score" | "directionScore" | "breadthScore" | "confidence" | "regime"
> {
  const core = calculateCore(inputs, BASELINE_PROFILE);
  const regime: InflationPressure["regime"] =
    core.score >= 75 ? "overshooting"
      : core.score >= 55 ? "warming"
        : core.score >= 45 ? "on_target"
          : "cooling";
  return {
    score: core.score,
    directionScore: core.directionScore,
    breadthScore: core.breadthScore,
    confidence: core.confidence,
    regime,
  };
}

export function scoreInflationPressure(inputs: PressureInput[]): InflationPressure {
  const baseline = calculateCore(inputs, BASELINE_PROFILE);
  const missingKeys = (Object.keys(COMPONENTS) as PressureKey[])
    .filter((key) => !inputs.some((input) => input.key === key && available(input)));

  const leaveOneOut = inputs
    .filter(available)
    .map((input) => {
      const scoreWithout = calculateCore(inputs.filter((candidate) => candidate.key !== input.key), BASELINE_PROFILE).score;
      return {
        key: input.key,
        scoreWithout,
        scoreDifference: round(baseline.score - scoreWithout),
      };
    })
    .sort((a, b) => Math.abs(b.scoreDifference) - Math.abs(a.scoreDifference));

  const weightScenarios = SENSITIVITY_PROFILES.map((profile) => ({
    name: profile.name,
    score: calculateCore(inputs, profile).score,
  }));
  const scenarioScores = weightScenarios.map((scenario) => scenario.score);
  const regime: InflationPressure["regime"] =
    baseline.score >= 75 ? "overshooting"
      : baseline.score >= 55 ? "warming"
        : baseline.score >= 45 ? "on_target"
          : "cooling";

  return {
    ...baseline,
    regime,
    diagnostics: {
      missingKeys,
      leaveOneOut,
      weightScenarios,
      scoreRange: [Math.min(...scenarioScores), Math.max(...scenarioScores)],
    },
    calcVersion: "inflation_pressure.v2.0",
    computedAt: new Date().toISOString(),
  };
}
