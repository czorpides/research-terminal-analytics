export type SwingSetupType =
  | "pullback_uptrend"
  | "oversold_reversal"
  | "breakout"
  | "momentum_continuation"
  | "recovery_repricing";

export type SwingSetupStatus =
  | "confirmed"
  | "developing"
  | "watch_trigger"
  | "extended"
  | "failed";

export interface SwingBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface SwingContext {
  existingMomentum: number | null;
  existingTrend: number | null;
  existingVolatility: number | null;
  ma50: number | null;
  ma200: number | null;
  hi52: number | null;
  quality: number | null;
  valuation: number | null;
  catalystScore: number | null;
  catalystLabel: string | null;
  catalystRisk: string | null;
  regimeScore?: number | null;
  regimeLabel?: string | null;
  regimeAvailable?: boolean;
}

export interface SwingComponent {
  score: number;
  value: string;
  detail: string;
  available: boolean;
}

export interface SwingComponents {
  momentum: SwingComponent;
  rsi: SwingComponent;
  location: SwingComponent;
  volume: SwingComponent;
  volatility: SwingComponent;
  confirmation: SwingComponent;
  regime: SwingComponent;
  catalyst: SwingComponent;
}

export interface SwingTradeGeometry {
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  target: number;
  rewardRisk: number;
  targetBasis: string;
}

export interface SwingTradeCandidate {
  setup: SwingSetupType;
  setupLabel: string;
  status: SwingSetupStatus;
  setupScore: number;
  evidenceCoverage: number;
  highConviction: boolean;
  components: SwingComponents;
  geometry: SwingTradeGeometry | null;
  reasons: string[];
  risks: string[];
  metrics: {
    current: number;
    rsi14: number | null;
    priorRsi: number | null;
    rsiMin10: number | null;
    return5dPct: number | null;
    return10dPct: number | null;
    return20dPct: number | null;
    momentumAccelerationPct: number | null;
    ma20: number | null;
    ma50: number | null;
    ma200: number | null;
    support20: number | null;
    resistance20: number | null;
    high52: number | null;
    drawdown52Pct: number | null;
    relativeVolume20: number | null;
    upDownVolumeRatio: number | null;
    atr14: number | null;
    atrPct: number | null;
    volatilityRatio: number | null;
    higherLow: boolean;
    breakout: boolean;
    ma20Reclaim: boolean;
    bullishClose: boolean;
    fundamentalSupport: number | null;
  };
}

export const SWING_MODEL_VERSION = "swing.setup.v1.0";

const WEIGHTS: Record<keyof SwingComponents, number> = {
  momentum: 0.15,
  rsi: 0.1,
  location: 0.15,
  volume: 0.125,
  volatility: 0.1,
  confirmation: 0.15,
  regime: 0.1,
  catalyst: 0.125,
};

const SETUP_LABELS: Record<SwingSetupType, string> = {
  pullback_uptrend: "Pullback in Uptrend",
  oversold_reversal: "Oversold Reversal",
  breakout: "Breakout",
  momentum_continuation: "Momentum Continuation",
  recovery_repricing: "Recovery / Repricing",
};

type Metrics = SwingTradeCandidate["metrics"] & {
  relVolAvailable: boolean;
  upDownVolAvailable: boolean;
};

interface SetupDraft {
  setup: SwingSetupType;
  components: SwingComponents;
  geometry: SwingTradeGeometry | null;
  status: SwingSetupStatus;
  reasons: string[];
  risks: string[];
}

export function computeSwingTrade(
  barsInput: SwingBar[],
  context: SwingContext,
): SwingTradeCandidate | null {
  const bars = [...barsInput]
    .filter(validBar)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length < 35) return null;

  const metrics = computeMetrics(bars, context);
  const drafts: SetupDraft[] = [
    buildPullback(metrics, context),
    buildReversal(metrics, context),
    buildBreakout(metrics, context),
    buildContinuation(metrics, context),
    buildRecovery(metrics, context),
  ];
  const candidates = drafts.map((draft) => finalizeDraft(draft, metrics));
  candidates.sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.setupScore - a.setupScore);
  return candidates[0] ?? null;
}

export function applyRegimeContext(
  candidate: SwingTradeCandidate,
  regimeScore: number,
  regimeLabel: string,
  available = true,
): SwingTradeCandidate {
  const components: SwingComponents = {
    ...candidate.components,
    regime: component(
      regimeScore,
      regimeLabel.replaceAll("_", " "),
      available
        ? `Current market regime contributes ${round(regimeScore, 0)}/100 to the setup.`
        : "No validated regional regime is available, so regime is held neutral.",
      available,
    ),
  };
  const setupScore = weightedScore(components);
  const evidenceCoverage = coverage(components);
  const risks = candidate.risks.filter((risk) => !risk.startsWith("Macro regime:"));
  if (available && regimeScore < 40) risks.push(`Macro regime: ${regimeLabel.replaceAll("_", " ")} is a headwind.`);
  const updated = { ...candidate, components, setupScore, evidenceCoverage, risks };
  return { ...updated, highConviction: qualifiesHighConviction(updated) };
}

export function regimeScoreForLabel(label: string): number {
  switch (label) {
    case "goldilocks": return 85;
    case "policy_reflation": return 80;
    case "reflation": return 72;
    case "overheating": return 57;
    case "mixed": return 50;
    case "late_cycle": return 46;
    case "slowdown": return 36;
    case "contraction": return 20;
    default: return 50;
  }
}

function computeMetrics(bars: SwingBar[], context: SwingContext): Metrics {
  const currentBar = bars.at(-1)!;
  const current = currentBar.close;
  const closes = bars.map((bar) => bar.close);
  const ma20 = average(closes.slice(-20));
  const calculatedMa50 = average(closes.slice(-50));
  const ma50 = finite(context.ma50) ?? calculatedMa50;
  const ma200 = finite(context.ma200);
  const high52 = finite(context.hi52) ?? max(bars.slice(-252).map((bar) => bar.high));
  const prior20 = bars.slice(-21, -1);
  const support20 = min(prior20.map((bar) => bar.low));
  const resistance20 = max(prior20.map((bar) => bar.high));
  const rsi14 = rsi(closes, 14);
  const priorRsi = bars.length > 20 ? rsi(closes.slice(0, -5), 14) : null;
  const rsiWindow = Array.from({ length: Math.min(10, bars.length - 14) }, (_, index) =>
    rsi(closes.slice(0, bars.length - index), 14),
  ).filter((value): value is number => value !== null);
  const rsiMin10 = min(rsiWindow);
  const return5 = trailingReturn(closes, 5);
  const return10 = trailingReturn(closes, 10);
  const return20 = trailingReturn(closes, 20);
  const previous5 = closes.length > 10
    ? closes[closes.length - 6] / closes[closes.length - 11] - 1
    : null;
  const acceleration = return5 !== null && previous5 !== null ? return5 - previous5 : null;

  const priorVolumes = bars.slice(-21, -1)
    .map((bar) => finite(bar.volume))
    .filter((v): v is number => v !== null && v > 0);
  const latestVolume = finite(currentBar.volume);
  const avgVolume20 = average(priorVolumes);
  const relativeVolume20 = latestVolume !== null && avgVolume20 !== null && avgVolume20 > 0
    ? latestVolume / avgVolume20
    : null;

  let upVolume = 0;
  let downVolume = 0;
  let volumeDays = 0;
  const volBars = bars.slice(-21);
  for (let i = 1; i < volBars.length; i++) {
    const volume = finite(volBars[i].volume);
    if (volume === null || volume <= 0) continue;
    volumeDays += 1;
    if (volBars[i].close >= volBars[i - 1].close) upVolume += volume;
    else downVolume += volume;
  }
  const upDownVolumeRatio = volumeDays >= 8 && downVolume > 0 ? upVolume / downVolume : null;

  const atr14 = atr(bars, 14);
  const atrPct = atr14 !== null && current > 0 ? atr14 / current : null;
  const returns = dailyReturns(closes);
  const recentVol = stdev(returns.slice(-10));
  const baselineVol = stdev(returns.slice(-30, -10));
  const volatilityRatio = recentVol !== null && baselineVol !== null && baselineVol > 0
    ? recentVol / baselineVol
    : null;

  const recentFive = bars.slice(-5);
  const priorFive = bars.slice(-10, -5);
  const higherLow = recentFive.length === 5 && priorFive.length === 5 &&
    min(recentFive.map((bar) => bar.low))! > min(priorFive.map((bar) => bar.low))!;
  const breakout = resistance20 !== null && current > resistance20 * 1.001;
  const priorMa20 = average(closes.slice(-25, -5));
  const ma20Reclaim = ma20 !== null && priorMa20 !== null && current > ma20 && bars[bars.length - 6].close <= priorMa20;
  const range = currentBar.high - currentBar.low;
  const bullishClose = currentBar.close > currentBar.open &&
    (range <= 0 || currentBar.close >= currentBar.low + range * 0.65);
  const fundamentalValues = [finite(context.quality), finite(context.valuation)]
    .filter((v): v is number => v !== null);
  const fundamentalSupport = fundamentalValues.length ? average(fundamentalValues) : null;

  return {
    current,
    rsi14,
    priorRsi,
    rsiMin10,
    return5dPct: percent(return5),
    return10dPct: percent(return10),
    return20dPct: percent(return20),
    momentumAccelerationPct: percent(acceleration),
    ma20,
    ma50,
    ma200,
    support20,
    resistance20,
    high52,
    drawdown52Pct: high52 && high52 > 0 ? (current / high52 - 1) * 100 : null,
    relativeVolume20,
    upDownVolumeRatio,
    atr14,
    atrPct: percent(atrPct),
    volatilityRatio,
    higherLow,
    breakout,
    ma20Reclaim,
    bullishClose,
    fundamentalSupport,
    relVolAvailable: relativeVolume20 !== null,
    upDownVolAvailable: upDownVolumeRatio !== null,
  };
}

function buildPullback(m: Metrics, c: SwingContext): SetupDraft {
  const components = baseComponents(
    m,
    c,
    momentumComponent(m, c, "pullback"),
    scorePullbackRsi(m.rsi14, m.priorRsi),
    pullbackLocationScore(m),
    confirmationScoreFor(m, "pullback_uptrend"),
  );
  const pullbackFromResistance = m.resistance20 && m.resistance20 > 0
    ? (m.current / m.resistance20 - 1) * 100
    : null;
  const trendHealthy = (c.existingTrend ?? 50) >= 55 && (m.ma200 === null || m.current > m.ma200);
  const inPullbackZone = pullbackFromResistance !== null && pullbackFromResistance <= -1.5 && pullbackFromResistance >= -15;
  const confirmed = trendHealthy && inPullbackZone && (m.higherLow || m.ma20Reclaim) && (m.rsi14 ?? 80) < 62;
  const developing = trendHealthy && inPullbackZone;
  const reasons = compact([
    trendHealthy ? "Longer-term trend remains constructive." : null,
    inPullbackZone ? `Price is ${round(pullbackFromResistance!, 1)}% below recent resistance, inside the pullback zone.` : null,
    m.ma20Reclaim ? "Price has reclaimed its 20-day average." : null,
    m.higherLow ? "Recent lows are rising." : null,
    risingRsi(m) ? "RSI is recovering rather than simply remaining oversold." : null,
  ]);
  const risks = commonRisks(m, c);
  if (!trendHealthy) risks.push("The longer-term trend is not yet strong enough for a clean pullback setup.");
  return {
    setup: "pullback_uptrend",
    components,
    geometry: geometryFor("pullback_uptrend", m),
    status: extended(m) ? "extended" : confirmed ? "confirmed" : developing ? "developing" : "watch_trigger",
    reasons,
    risks,
  };
}

function buildReversal(m: Metrics, c: SwingContext): SetupDraft {
  const components = baseComponents(
    m,
    c,
    momentumComponent(m, c, "reversal"),
    scoreReversalRsi(m.rsi14, m.rsiMin10),
    reversalLocationScore(m),
    confirmationScoreFor(m, "oversold_reversal"),
  );
  const wasOversold = m.rsiMin10 !== null && m.rsiMin10 <= 35;
  const recovering = wasOversold && m.rsi14 !== null && m.rsi14 >= m.rsiMin10 + 5;
  const dislocated = m.drawdown52Pct !== null && m.drawdown52Pct <= -12;
  const confirmed = dislocated && recovering && (m.higherLow || m.ma20Reclaim) && m.bullishClose;
  const developing = dislocated && (recovering || m.higherLow || m.ma20Reclaim);
  const reasons = compact([
    dislocated ? `Price remains ${round(m.drawdown52Pct!, 1)}% below its trailing high.` : null,
    wasOversold ? `RSI recently reached ${round(m.rsiMin10!, 1)}.` : null,
    recovering ? `RSI has recovered to ${round(m.rsi14!, 1)}.` : null,
    m.higherLow ? "A higher low provides early reversal structure." : null,
    m.ma20Reclaim ? "Price has reclaimed the 20-day average." : null,
  ]);
  const risks = commonRisks(m, c);
  if ((c.existingTrend ?? 50) < 40) risks.push("Primary trend remains weak, so this is a counter-trend setup.");
  return {
    setup: "oversold_reversal",
    components,
    geometry: geometryFor("oversold_reversal", m),
    status: extended(m) ? "extended" : confirmed ? "confirmed" : developing ? "developing" : "watch_trigger",
    reasons,
    risks,
  };
}

function buildBreakout(m: Metrics, c: SwingContext): SetupDraft {
  const components = baseComponents(
    m,
    c,
    momentumComponent(m, c, "breakout"),
    scoreBreakoutRsi(m.rsi14),
    breakoutLocationScore(m),
    confirmationScoreFor(m, "breakout"),
  );
  const nearTrigger = m.resistance20 !== null && m.current >= m.resistance20 * 0.985;
  const volumeConfirms = m.relativeVolume20 !== null && m.relativeVolume20 >= 1.2;
  const trendHealthy = (c.existingTrend ?? 50) >= 55;
  const confirmed = m.breakout && volumeConfirms && trendHealthy && (m.rsi14 ?? 0) < 74;
  const developing = nearTrigger && trendHealthy;
  const reasons = compact([
    m.breakout ? "Price has cleared the prior 20-session resistance zone." : null,
    volumeConfirms ? `Relative volume is ${round(m.relativeVolume20!, 2)}x its 20-day baseline.` : null,
    trendHealthy ? "Trend score supports continuation rather than an isolated spike." : null,
    m.bullishClose ? "Latest session closed with constructive intraday price action." : null,
  ]);
  const risks = commonRisks(m, c);
  if (m.breakout && !volumeConfirms) risks.push("Breakout lacks strong relative-volume confirmation.");
  return {
    setup: "breakout",
    components,
    geometry: geometryFor("breakout", m),
    status: extended(m) ? "extended" : confirmed ? "confirmed" : developing ? "developing" : "watch_trigger",
    reasons,
    risks,
  };
}

function buildContinuation(m: Metrics, c: SwingContext): SetupDraft {
  const components = baseComponents(
    m,
    c,
    momentumComponent(m, c, "continuation"),
    scoreContinuationRsi(m.rsi14),
    continuationLocationScore(m),
    confirmationScoreFor(m, "momentum_continuation"),
  );
  const trendHealthy = (c.existingTrend ?? 50) >= 60 && (m.ma50 === null || m.current > m.ma50);
  const positive20 = (m.return20dPct ?? -99) >= 3;
  const controlledVol = m.volatilityRatio === null || m.volatilityRatio <= 1.2;
  const confirmed = trendHealthy && positive20 && controlledVol && (m.higherLow || m.bullishClose);
  const developing = trendHealthy && positive20;
  return {
    setup: "momentum_continuation",
    components,
    geometry: geometryFor("momentum_continuation", m),
    status: extended(m) ? "extended" : confirmed ? "confirmed" : developing ? "developing" : "watch_trigger",
    reasons: compact([
      trendHealthy ? "Price structure and existing trend score are aligned." : null,
      positive20 ? `20-day return is ${round(m.return20dPct!, 1)}%.` : null,
      controlledVol ? "Recent volatility is not expanding materially against the trend." : null,
      m.higherLow ? "The consolidation is holding a higher low." : null,
    ]),
    risks: commonRisks(m, c),
  };
}

function buildRecovery(m: Metrics, c: SwingContext): SetupDraft {
  const components = baseComponents(
    m,
    c,
    momentumComponent(m, c, "recovery"),
    scoreRecoveryRsi(m.rsi14, m.priorRsi),
    recoveryLocationScore(m),
    confirmationScoreFor(m, "recovery_repricing"),
  );
  const dislocated = m.drawdown52Pct !== null && m.drawdown52Pct <= -10;
  const fundamentallySupported = m.fundamentalSupport !== null && m.fundamentalSupport >= 55;
  const improving = (m.momentumAccelerationPct ?? -99) > 0 || m.ma20Reclaim || m.higherLow;
  const confirmed = dislocated && fundamentallySupported && improving && m.current > (m.ma20 ?? 0) && m.bullishClose;
  const developing = dislocated && fundamentallySupported && improving;
  const reasons = compact([
    dislocated ? `Shares remain ${round(m.drawdown52Pct!, 1)}% below the trailing high.` : null,
    fundamentallySupported ? `Fundamental support score is ${round(m.fundamentalSupport!, 0)}/100.` : null,
    (m.momentumAccelerationPct ?? 0) > 0 ? "Short-term momentum is accelerating." : null,
    m.ma20Reclaim ? "Price has reclaimed the 20-day average." : null,
    m.higherLow ? "Price is building a higher low." : null,
  ]);
  const risks = commonRisks(m, c);
  if (!fundamentallySupported) risks.push("Fundamental evidence does not yet support a repricing thesis.");
  return {
    setup: "recovery_repricing",
    components,
    geometry: geometryFor("recovery_repricing", m),
    status: extended(m) ? "extended" : confirmed ? "confirmed" : developing ? "developing" : "watch_trigger",
    reasons,
    risks,
  };
}

function baseComponents(
  m: Metrics,
  c: SwingContext,
  momentum: SwingComponent,
  rsiComponent: SwingComponent,
  location: SwingComponent,
  confirmation: SwingComponent,
): SwingComponents {
  return {
    momentum,
    rsi: rsiComponent,
    location,
    volume: volumeComponent(m),
    volatility: volatilityComponent(m, c),
    confirmation,
    regime: component(
      c.regimeScore ?? 50,
      c.regimeLabel ?? "Neutral placeholder",
      c.regimeAvailable
        ? "Validated market-regime context."
        : "Regional regime is unavailable at this stage, so the component is held neutral and marked missing.",
      Boolean(c.regimeAvailable),
    ),
    catalyst: component(
      c.catalystScore ?? 50,
      c.catalystLabel ?? "No verified catalyst",
      c.catalystLabel
        ? "Verified earnings-event evidence is included in the setup."
        : "No current verified catalyst was found, so this component is held neutral rather than invented.",
      c.catalystScore !== null && c.catalystLabel !== null,
    ),
  };
}

function momentumComponent(
  m: Metrics,
  c: SwingContext,
  mode: "pullback" | "reversal" | "breakout" | "continuation" | "recovery",
): SwingComponent {
  const ret5 = (m.return5dPct ?? 0) / 100;
  const ret20 = (m.return20dPct ?? 0) / 100;
  const accel = (m.momentumAccelerationPct ?? 0) / 100;
  const longScore = finite(c.existingMomentum) ?? 50;
  let score = 50 + ret5 * 350 + ret20 * 120 + accel * 260 + (longScore - 50) * 0.22;
  if (mode === "pullback") score = 52 + ret5 * 300 + accel * 320 + (longScore - 50) * 0.3;
  if (mode === "reversal") score = 48 + ret5 * 420 + accel * 420 + (longScore - 50) * 0.08;
  if (mode === "breakout") score = 48 + ret5 * 330 + ret20 * 150 + (longScore - 50) * 0.28;
  if (mode === "continuation") score = 48 + ret5 * 260 + ret20 * 190 + (longScore - 50) * 0.35;
  if (mode === "recovery") score = 48 + ret5 * 320 + accel * 380 + (longScore - 50) * 0.12;
  return component(
    clamp(score),
    `${fmtPct(m.return5dPct)} 5d / ${fmtPct(m.return20dPct)} 20d`,
    "Short-term return, acceleration and the existing 12-1 momentum score are combined for this setup type.",
    m.return5dPct !== null && m.return20dPct !== null,
  );
}

function scorePullbackRsi(value: number | null, prior: number | null): SwingComponent {
  if (value === null) return component(50, "Unavailable", "RSI requires sufficient closes.", false);
  let score = bandScore(value, 38, 54, 24, 72);
  if (prior !== null && value > prior) score += 8;
  return component(clamp(score), `${round(value, 1)}`, "Best pullbacks cool momentum without destroying it, then show RSI improvement.", true);
}

function scoreReversalRsi(value: number | null, min10: number | null): SwingComponent {
  if (value === null) return component(50, "Unavailable", "RSI requires sufficient closes.", false);
  let score = bandScore(value, 34, 52, 22, 66);
  if (min10 !== null && min10 <= 35 && value >= min10 + 5) score += 18;
  return component(clamp(score), `${round(value, 1)} · min ${min10 === null ? "n/a" : round(min10, 1)}`, "Reversal score rewards a genuine recovery from oversold conditions.", true);
}

function scoreBreakoutRsi(value: number | null): SwingComponent {
  if (value === null) return component(50, "Unavailable", "RSI requires sufficient closes.", false);
  return component(clamp(bandScore(value, 52, 68, 38, 78)), `${round(value, 1)}`, "Breakouts favour positive momentum without extreme overextension.", true);
}

function scoreContinuationRsi(value: number | null): SwingComponent {
  if (value === null) return component(50, "Unavailable", "RSI requires sufficient closes.", false);
  return component(clamp(bandScore(value, 48, 66, 35, 78)), `${round(value, 1)}`, "Continuation setups favour healthy, non-extreme momentum.", true);
}

function scoreRecoveryRsi(value: number | null, prior: number | null): SwingComponent {
  if (value === null) return component(50, "Unavailable", "RSI requires sufficient closes.", false);
  let score = bandScore(value, 40, 60, 28, 72);
  if (prior !== null && value > prior) score += 10;
  return component(clamp(score), `${round(value, 1)}`, "Recovery setups favour RSI moving back into a healthy middle range.", true);
}

function pullbackLocationScore(m: Metrics): SwingComponent {
  let score = 45;
  const distances: string[] = [];
  if (m.ma20) {
    const d = Math.abs(m.current / m.ma20 - 1);
    score += d <= 0.025 ? 22 : d <= 0.05 ? 10 : -5;
    distances.push(`${round((m.current / m.ma20 - 1) * 100, 1)}% vs 20DMA`);
  }
  if (m.ma50) {
    const d = Math.abs(m.current / m.ma50 - 1);
    score += d <= 0.035 ? 20 : d <= 0.07 ? 8 : 0;
    if (m.current < m.ma50 * 0.94) score -= 12;
    distances.push(`${round((m.current / m.ma50 - 1) * 100, 1)}% vs 50DMA`);
  }
  return component(clamp(score), distances.join(" · ") || "Limited", "Rewards a controlled pullback into moving-average support.", Boolean(m.ma20 || m.ma50));
}

function reversalLocationScore(m: Metrics): SwingComponent {
  let score = 45;
  if (m.drawdown52Pct !== null) {
    if (m.drawdown52Pct <= -20 && m.drawdown52Pct >= -55) score += 25;
    else if (m.drawdown52Pct <= -12) score += 15;
  }
  if (m.support20 && Math.abs(m.current / m.support20 - 1) <= 0.06) score += 18;
  if (m.ma20 && m.current > m.ma20) score += 10;
  return component(clamp(score), `${fmtPct(m.drawdown52Pct)} from high`, "Rewards dislocation near support with evidence of a reclaim.", m.drawdown52Pct !== null);
}

function breakoutLocationScore(m: Metrics): SwingComponent {
  if (!m.resistance20) return component(50, "Unavailable", "Resistance requires recent high data.", false);
  const distance = (m.current / m.resistance20 - 1) * 100;
  let score = 50;
  if (distance >= 0 && distance <= 2.5) score = 92;
  else if (distance >= -1.5 && distance < 0) score = 78;
  else if (distance > 2.5 && distance <= 5) score = 65;
  else if (distance < -1.5) score = 35;
  else score = 40;
  return component(score, `${fmtPct(distance)} vs 20d resistance`, "Highest scores sit at or just through a well-defined trigger, not far above it.", true);
}

function continuationLocationScore(m: Metrics): SwingComponent {
  let score = 45;
  if (m.ma20 && m.current > m.ma20) score += 20;
  if (m.ma50 && m.current > m.ma50) score += 15;
  if (m.high52 && m.current / m.high52 >= 0.9) score += 15;
  if (m.ma20 && m.current > m.ma20 * 1.08) score -= 25;
  return component(clamp(score), m.high52 ? `${round((m.current / m.high52 - 1) * 100, 1)}% vs 52w high` : "Trend location", "Rewards healthy trend structure while penalising entries that are too extended.", Boolean(m.ma20 || m.ma50 || m.high52));
}

function recoveryLocationScore(m: Metrics): SwingComponent {
  let score = 45;
  if (m.drawdown52Pct !== null && m.drawdown52Pct <= -10 && m.drawdown52Pct >= -50) score += 20;
  if (m.ma20 && m.current > m.ma20) score += 18;
  if (m.ma50 && m.current > m.ma50) score += 12;
  return component(clamp(score), `${fmtPct(m.drawdown52Pct)} from high`, "Recovery setups need meaningful prior damage plus evidence that price is reclaiming structure.", m.drawdown52Pct !== null);
}

function volumeComponent(m: Metrics): SwingComponent {
  if (m.relativeVolume20 === null && m.upDownVolumeRatio === null) {
    return component(50, "Unavailable", "Volume is absent or insufficient for a reliable relative-volume read.", false);
  }
  let score = 48;
  if (m.relativeVolume20 !== null) {
    if (m.relativeVolume20 >= 2) score += 32;
    else if (m.relativeVolume20 >= 1.5) score += 24;
    else if (m.relativeVolume20 >= 1.2) score += 15;
    else if (m.relativeVolume20 < 0.7) score -= 12;
  }
  if (m.upDownVolumeRatio !== null) {
    if (m.upDownVolumeRatio >= 1.5) score += 12;
    else if (m.upDownVolumeRatio < 0.7) score -= 12;
  }
  return component(
    clamp(score),
    `${m.relativeVolume20 === null ? "n/a" : `${round(m.relativeVolume20, 2)}x`} rel vol`,
    "Relative volume and the 20-day up-volume/down-volume balance are used together.",
    true,
  );
}

function volatilityComponent(m: Metrics, c: SwingContext): SwingComponent {
  let score = 55;
  if (m.atrPct !== null) {
    if (m.atrPct >= 1 && m.atrPct <= 5.5) score += 18;
    else if (m.atrPct > 8) score -= 25;
    else if (m.atrPct < 0.5) score -= 10;
  }
  if (m.volatilityRatio !== null) {
    if (m.volatilityRatio <= 0.8) score += 15;
    else if (m.volatilityRatio > 1.5) score -= 20;
  }
  if ((c.existingVolatility ?? 50) < 25) score -= 8;
  return component(clamp(score), `${fmtPct(m.atrPct)} ATR`, "Prefers enough movement to create opportunity without uncontrolled volatility expansion.", m.atrPct !== null);
}

function confirmationScoreFor(m: Metrics, setup: SwingSetupType): SwingComponent {
  let score = 35;
  const signals: string[] = [];
  const add = (condition: boolean, points: number, label: string) => {
    if (condition) {
      score += points;
      signals.push(label);
    }
  };
  add(m.higherLow, 16, "higher low");
  add(m.ma20Reclaim, 17, "20DMA reclaim");
  add(m.bullishClose, 12, "bullish close");
  add(risingRsi(m), 12, "RSI rising");
  add((m.relativeVolume20 ?? 0) >= 1.2, 12, "volume expansion");
  if (setup === "breakout") add(m.breakout, 22, "breakout trigger");
  if (setup === "momentum_continuation") add((m.return5dPct ?? -99) > 0, 10, "positive 5d return");
  return component(clamp(score), signals.join(" · ") || "No trigger yet", "Confirmation requires observable price/volume behaviour, not a forecast.", true);
}

function geometryFor(setup: SwingSetupType, m: Metrics): SwingTradeGeometry | null {
  if (m.atr14 === null || m.atr14 <= 0) return null;
  const atrValue = m.atr14;
  let entry = m.current;
  let stop = m.current - 1.5 * atrValue;
  let target: number | null = null;
  let targetBasis = "technical resistance";

  if (setup === "breakout") {
    if (m.resistance20) entry = Math.max(m.current, m.resistance20 * 1.001);
    const structural = m.support20 ? m.support20 - 0.2 * atrValue : entry - 1.6 * atrValue;
    stop = Math.max(structural, entry - 2 * atrValue);
    if (m.resistance20 && m.support20 && m.resistance20 > m.support20) {
      target = m.resistance20 + (m.resistance20 - m.support20) * 0.65;
      targetBasis = "65% measured move from the 20-day range";
    }
  } else if (setup === "pullback_uptrend") {
    const structural = m.support20 ? m.support20 - 0.2 * atrValue : entry - 1.5 * atrValue;
    stop = Math.max(structural, entry - 2 * atrValue);
    target = firstAbove(entry, [m.resistance20, m.high52]);
    targetBasis = "nearest prior resistance / trailing high";
  } else if (setup === "oversold_reversal") {
    const structural = m.support20 ? m.support20 - 0.25 * atrValue : entry - 1.7 * atrValue;
    stop = Math.max(structural, entry - 2.2 * atrValue);
    target = firstAbove(entry, [m.ma50, m.resistance20, m.ma200]);
    targetBasis = "first major reclaim level";
  } else if (setup === "momentum_continuation") {
    const structural = m.support20 ? m.support20 - 0.15 * atrValue : entry - 1.4 * atrValue;
    stop = Math.max(structural, entry - 1.9 * atrValue);
    target = firstAbove(entry, [m.high52, m.resistance20]);
    targetBasis = "trailing high / recent resistance";
  } else {
    const structural = m.support20 ? m.support20 - 0.2 * atrValue : entry - 1.6 * atrValue;
    stop = Math.max(structural, entry - 2.1 * atrValue);
    target = firstAbove(entry, [m.ma50, m.ma200, m.resistance20, m.high52]);
    targetBasis = "next major recovery level";
  }

  if (target === null || target <= entry) {
    target = entry + 2 * atrValue;
    targetBasis = "2 ATR fallback because no higher structural level is available";
  }
  if (stop >= entry) stop = entry - 1.2 * atrValue;
  const risk = entry - stop;
  return {
    entryLow: Math.max(0, entry - 0.15 * atrValue),
    entryHigh: entry + 0.15 * atrValue,
    invalidation: stop,
    target,
    rewardRisk: round(risk > 0 ? Math.max(0, (target - entry) / risk) : 0, 2),
    targetBasis,
  };
}

function finalizeDraft(draft: SetupDraft, metrics: Metrics): SwingTradeCandidate {
  const setupScore = weightedScore(draft.components);
  const evidenceCoverage = coverage(draft.components);
  const candidate: SwingTradeCandidate = {
    setup: draft.setup,
    setupLabel: SETUP_LABELS[draft.setup],
    status: draft.status,
    setupScore,
    evidenceCoverage,
    highConviction: false,
    components: draft.components,
    geometry: draft.geometry,
    reasons: draft.reasons,
    risks: draft.risks,
    metrics,
  };
  candidate.highConviction = qualifiesHighConviction(candidate);
  return candidate;
}

function qualifiesHighConviction(candidate: SwingTradeCandidate): boolean {
  const disqualifyingRisk = candidate.risks.some((risk) => {
    const value = risk.toLowerCase();
    return value.includes("within 3 days") || value.includes("price data is stale");
  });
  return candidate.setupScore >= 80 &&
    candidate.status === "confirmed" &&
    candidate.evidenceCoverage >= 75 &&
    (candidate.geometry?.rewardRisk ?? 0) >= 1.8 &&
    candidate.components.confirmation.score >= 70 &&
    candidate.components.location.score >= 65 &&
    !disqualifyingRisk;
}

function commonRisks(m: Metrics, c: SwingContext): string[] {
  const risks: string[] = [];
  if (m.atrPct !== null && m.atrPct > 8) risks.push(`ATR is elevated at ${round(m.atrPct, 1)}% of price.`);
  if (m.rsi14 !== null && m.rsi14 > 72) risks.push(`RSI is extended at ${round(m.rsi14, 1)}.`);
  if (m.relativeVolume20 !== null && m.relativeVolume20 < 0.7) risks.push("Current volume is weak versus its 20-day baseline.");
  if (c.catalystRisk) risks.push(c.catalystRisk);
  if (c.regimeAvailable && (c.regimeScore ?? 50) < 40) risks.push(`Macro regime: ${c.regimeLabel ?? "risk-off"} is a headwind.`);
  return risks;
}

function extended(m: Metrics): boolean {
  return (m.rsi14 !== null && m.rsi14 > 74) || (m.ma20 !== null && m.current > m.ma20 * 1.09);
}

function weightedScore(components: SwingComponents): number {
  return round(
    (Object.keys(WEIGHTS) as Array<keyof SwingComponents>)
      .reduce((sum, key) => sum + components[key].score * WEIGHTS[key], 0),
    1,
  );
}

function coverage(components: SwingComponents): number {
  const keys = Object.keys(components) as Array<keyof SwingComponents>;
  const presentWeight = keys.reduce((sum, key) => sum + (components[key].available ? WEIGHTS[key] : 0), 0);
  return round(presentWeight * 100, 0);
}

function risingRsi(m: Pick<Metrics, "rsi14" | "priorRsi">): boolean {
  return m.rsi14 !== null && m.priorRsi !== null && m.rsi14 > m.priorRsi + 1;
}

function bandScore(value: number, idealLow: number, idealHigh: number, floor: number, ceiling: number): number {
  if (value >= idealLow && value <= idealHigh) return 82;
  if (value < floor || value > ceiling) return 25;
  if (value < idealLow) return 45 + ((value - floor) / Math.max(1, idealLow - floor)) * 37;
  return 82 - ((value - idealHigh) / Math.max(1, ceiling - idealHigh)) * 47;
}

function component(score: number, value: string, detail: string, available: boolean): SwingComponent {
  return { score: round(clamp(score), 0), value, detail, available };
}

function validBar(bar: SwingBar): boolean {
  return [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0) &&
    bar.high >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low <= Math.min(bar.open, bar.close, bar.high);
}

function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period;
  for (let i = start; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return gains === 0 ? 50 : 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function atr(bars: SwingBar[], period: number): number | null {
  if (bars.length < period + 1) return null;
  const ranges: number[] = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const previousClose = bars[i - 1].close;
    ranges.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - previousClose),
      Math.abs(bars[i].low - previousClose),
    ));
  }
  return average(ranges);
}

function trailingReturn(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;
  const prior = closes[closes.length - 1 - days];
  return prior > 0 ? closes.at(-1)! / prior - 1 : null;
}

function dailyReturns(closes: number[]): number[] {
  const output: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) output.push(closes[i] / closes[i - 1] - 1);
  }
  return output;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function average(values: number[]): number | null {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length : null;
}

function min(values: number[]): number | null {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? Math.min(...finiteValues) : null;
}

function max(values: number[]): number | null {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  return finiteValues.length ? Math.max(...finiteValues) : null;
}

function firstAbove(current: number, values: Array<number | null>): number | null {
  const candidates = values.filter((value): value is number => value !== null && Number.isFinite(value) && value > current * 1.005);
  return candidates.length ? Math.min(...candidates) : null;
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function percent(value: number | null): number | null {
  return value === null ? null : value * 100;
}

function clamp(value: number, low = 0, high = 100): number {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function fmtPct(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${round(value, 1)}%`;
}

function compact(values: Array<string | null>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function statusRank(status: SwingSetupStatus): number {
  switch (status) {
    case "confirmed": return 0;
    case "developing": return 1;
    case "watch_trigger": return 2;
    case "extended": return 3;
    case "failed": return 4;
  }
}
