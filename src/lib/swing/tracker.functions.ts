import { createServerFn } from "@tanstack/react-start";

import {
  evaluateSwingOutcome,
  type SwingOutcomeBar,
  type SwingOutcomeStatus,
  type SwingTargetBehaviour,
} from "./outcomes";
import type {
  SwingComponents,
  SwingSetupStatus,
  SwingSetupType,
  SwingTradeCandidate,
} from "./model";

const TRACK_MIN_SCORE = 65;
const OUTCOME_HORIZON = 40;
const LIVE_QUOTE_CAP = 8;
const FMP_DAILY_LIMIT = 250;
const TWELVE_DATA_DAILY_LIMIT = 800;
const FMP_QUOTA_RESERVE = 60;
const TWELVE_DATA_QUOTA_RESERVE = 100;

interface TrackableCandidate {
  assetId: string;
  symbol: string;
  name: string;
  priceAsOf: string;
  trade: SwingTradeCandidate;
}

interface SetupRow {
  id: string;
  asset_id: string;
  model_version: string;
  setup_type: SwingSetupType;
  setup_label: string;
  signal_state: SwingSetupStatus;
  setup_score: number;
  evidence_coverage: number;
  high_conviction: boolean;
  signal_at: string;
  price_as_of: string;
  signal_price: number;
  entry_low: number;
  entry_high: number;
  entry_mid: number;
  invalidation: number;
  target: number;
  reward_risk: number;
  atr14: number | null;
  horizon_sessions: number;
  components: SwingComponents;
  metrics: Record<string, unknown>;
  reasons: string[];
  risks: string[];
  outcome_status: SwingOutcomeStatus;
  target_behaviour: SwingTargetBehaviour;
  sessions_observed: number;
  target_hit_at: string | null;
  stop_hit_at: string | null;
  resolved_at: string | null;
  max_price: number | null;
  min_price: number | null;
  max_favourable_pct: number | null;
  max_adverse_pct: number | null;
  target_overshoot_pct: number | null;
  target_shortfall_pct: number | null;
  latest_return_pct: number | null;
  calibration_eligible: boolean;
  last_evaluated_at: string | null;
}

interface PriceRow {
  asset_id: string;
  trade_date: string;
  high: number | null;
  low: number | null;
  close: number | null;
}

interface LiveQuote {
  symbol: string;
  price: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  observedAt: string;
  provider: "fmp" | "twelvedata";
}

export interface SwingTrackerRow {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  setupType: SwingSetupType;
  setupLabel: string;
  signalState: SwingSetupStatus;
  signalAt: string;
  priceAsOf: string;
  setupScore: number;
  highConviction: boolean;
  entry: number;
  target: number;
  invalidation: number;
  rewardRisk: number;
  outcomeStatus: SwingOutcomeStatus;
  targetBehaviour: SwingTargetBehaviour;
  sessionsObserved: number;
  maxFavourablePct: number | null;
  maxAdversePct: number | null;
  targetOvershootPct: number | null;
  targetShortfallPct: number | null;
  latestReturnPct: number | null;
  latestObservedPrice: number | null;
  latestObservedAt: string | null;
  components: SwingComponents;
  metrics: Record<string, unknown>;
}

export interface SwingPatternStat {
  key: string;
  label: string;
  sampleSize: number;
  wins: number;
  hitRate: number;
  validated: boolean;
}

export interface SwingTrackerWorkspace {
  asOf: string;
  cadence: {
    liveMonitor: string;
    uiRefresh: string;
    authoritativeOutcomeSource: string;
  };
  totals: {
    tracked: number;
    active: number;
    resolvedEligible: number;
    targetHits: number;
    stopHits: number;
    nearMisses: number;
    expired: number;
    ambiguous: number;
    targetExceeded: number;
  };
  performance: {
    hitRate: number | null;
    averageMaxFavourablePct: number | null;
    averageMaxAdversePct: number | null;
  };
  learning: {
    minimumSample: number;
    status: "collecting" | "active";
    baselineHitRate: number | null;
    patterns: SwingPatternStat[];
    note: string;
  };
  rows: SwingTrackerRow[];
}

export async function persistSwingSignals(
  candidates: TrackableCandidate[],
  modelVersion: string,
): Promise<number> {
  const rows = candidates.flatMap((candidate) => {
    const trade = candidate.trade;
    const geometry = trade.geometry;
    if (!geometry) return [];
    if (!["confirmed", "developing"].includes(trade.status)) return [];
    if (trade.setupScore < TRACK_MIN_SCORE) return [];

    const entryMid = (geometry.entryLow + geometry.entryHigh) / 2;
    if (!(geometry.target > entryMid && geometry.invalidation < entryMid)) return [];

    return [{
      asset_id: candidate.assetId,
      model_version: modelVersion,
      setup_type: trade.setup,
      setup_label: trade.setupLabel,
      signal_state: trade.status,
      setup_score: trade.setupScore,
      evidence_coverage: trade.evidenceCoverage,
      high_conviction: trade.highConviction,
      price_as_of: candidate.priceAsOf,
      signal_price: trade.metrics.current,
      entry_low: geometry.entryLow,
      entry_high: geometry.entryHigh,
      entry_mid: entryMid,
      invalidation: geometry.invalidation,
      target: geometry.target,
      reward_risk: geometry.rewardRisk,
      atr14: trade.metrics.atr14,
      horizon_sessions: OUTCOME_HORIZON,
      components: trade.components,
      metrics: trade.metrics,
      reasons: trade.reasons,
      risks: trade.risks,
    }];
  });

  if (!rows.length) return 0;
  const db = await looseDb();
  const { error } = await db
    .from("swing_trade_setups")
    .upsert(rows, {
      onConflict: "asset_id,setup_type,price_as_of,model_version",
      ignoreDuplicates: true,
    });
  if (error) throw error;
  return rows.length;
}

export async function refreshTrackedOutcomes(): Promise<number> {
  const db = await looseDb();
  const { data: setupData, error: setupError } = await db
    .from("swing_trade_setups")
    .select("*")
    .in("outcome_status", ["active", "target_hit"])
    .order("signal_at", { ascending: true })
    .limit(500);
  if (setupError) throw setupError;
  const setups = (setupData ?? []) as SetupRow[];
  if (!setups.length) return 0;

  const assetIds = unique(setups.map((row) => row.asset_id));
  const earliest = setups.reduce(
    (value, row) => row.price_as_of < value ? row.price_as_of : value,
    setups[0].price_as_of,
  );
  const pricePages = await Promise.all(
    chunk(assetIds, 50).map((batch) =>
      db
        .from("prices_daily")
        .select("asset_id,trade_date,high,low,close")
        .in("asset_id", batch)
        .gt("trade_date", earliest)
        .order("trade_date", { ascending: true })
        .limit(batch.length * 140),
    ),
  );
  const priceError = pricePages.find((page: { error?: unknown }) => page.error)?.error;
  if (priceError) throw priceError;
  const barsByAsset = groupOutcomeBars(
    pricePages.flatMap((page: { data?: unknown[] }) => page.data ?? []) as PriceRow[],
  );

  let updated = 0;
  for (const setup of setups) {
    const evaluation = evaluateSwingOutcome(
      {
        signalDate: setup.price_as_of,
        entry: setup.entry_mid,
        target: setup.target,
        invalidation: setup.invalidation,
        atr14: setup.atr14,
        horizonSessions: setup.horizon_sessions,
      },
      barsByAsset.get(setup.asset_id) ?? [],
    );

    const update = {
      outcome_status: evaluation.status,
      target_behaviour: evaluation.targetBehaviour,
      sessions_observed: evaluation.sessionsObserved,
      target_hit_at: evaluation.targetHitDate ? marketCloseTimestamp(evaluation.targetHitDate) : setup.target_hit_at,
      stop_hit_at: evaluation.stopHitDate ? marketCloseTimestamp(evaluation.stopHitDate) : setup.stop_hit_at,
      resolved_at: evaluation.resolvedDate ? marketCloseTimestamp(evaluation.resolvedDate) : setup.resolved_at,
      max_price: evaluation.maxPrice,
      min_price: evaluation.minPrice,
      max_favourable_pct: evaluation.maxFavourablePct,
      max_adverse_pct: evaluation.maxAdversePct,
      target_overshoot_pct: evaluation.targetOvershootPct,
      target_shortfall_pct: evaluation.targetShortfallPct,
      latest_return_pct: evaluation.latestReturnPct,
      calibration_eligible: evaluation.calibrationEligible,
      last_evaluated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("swing_trade_setups").update(update).eq("id", setup.id);
    if (error) throw error;
    updated += 1;
  }
  return updated;
}

export async function runSwingIntradayMonitor(): Promise<{
  evaluated: number;
  quotesUpdated: number;
  failures: Array<{ symbol: string; error: string }>;
  providers: Record<string, number>;
  asOf: string;
}> {
  const evaluated = await refreshTrackedOutcomes();
  const db = await looseDb();
  const { data: setupData, error: setupError } = await db
    .from("swing_trade_setups")
    .select("*")
    .eq("outcome_status", "active")
    .order("high_conviction", { ascending: false })
    .order("setup_score", { ascending: false })
    .order("signal_at", { ascending: false })
    .limit(LIVE_QUOTE_CAP);
  if (setupError) throw setupError;
  const setups = (setupData ?? []) as SetupRow[];
  if (!setups.length) {
    return { evaluated, quotesUpdated: 0, failures: [], providers: {}, asOf: new Date().toISOString() };
  }

  const assetIds = unique(setups.map((row) => row.asset_id));
  const { data: assetData, error: assetError } = await db
    .from("assets")
    .select("id,symbol")
    .in("id", assetIds);
  if (assetError) throw assetError;
  const symbols = new Map(
    (assetData ?? []).map((row: { id: string; symbol: string }) => [String(row.id), String(row.symbol)]),
  );

  let quotesUpdated = 0;
  const failures: Array<{ symbol: string; error: string }> = [];
  const providers: Record<string, number> = {};
  for (const setup of setups) {
    const symbol = symbols.get(setup.asset_id);
    if (!symbol) continue;
    try {
      const quote = await fetchLiveQuote(symbol);
      providers[quote.provider] = (providers[quote.provider] ?? 0) + 1;
      await db.from("swing_trade_price_snapshots").insert({
        setup_id: setup.id,
        asset_id: setup.asset_id,
        observed_at: quote.observedAt,
        price: quote.price,
        day_high: quote.dayHigh,
        day_low: quote.dayLow,
        volume: quote.volume,
        provider: quote.provider,
        source_kind: "intraday_quote",
      });
      await applyIntradayQuote(setup, quote, db);
      quotesUpdated += 1;
    } catch (error) {
      failures.push({ symbol, error: (error as Error).message });
    }
  }

  return {
    evaluated,
    quotesUpdated,
    failures,
    providers,
    asOf: new Date().toISOString(),
  };
}

export const getSwingTrackerWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<SwingTrackerWorkspace> => {
    await refreshTrackedOutcomes();
    const db = await looseDb();
    const { data: setupData, error: setupError } = await db
      .from("swing_trade_setups")
      .select("*")
      .order("signal_at", { ascending: false })
      .limit(200);
    if (setupError) throw setupError;
    const setups = (setupData ?? []) as SetupRow[];
    if (!setups.length) return emptyTrackerWorkspace();

    const assetIds = unique(setups.map((row) => row.asset_id));
    const setupIds = setups.map((row) => row.id);
    const [assetResult, snapshotResult] = await Promise.all([
      db.from("assets").select("id,symbol,name").in("id", assetIds),
      db
        .from("swing_trade_price_snapshots")
        .select("setup_id,observed_at,price")
        .in("setup_id", setupIds)
        .order("observed_at", { ascending: false })
        .limit(Math.max(500, setupIds.length * 4)),
    ]);
    if (assetResult.error) throw assetResult.error;
    if (snapshotResult.error) throw snapshotResult.error;

    const assets = new Map(
      (assetResult.data ?? []).map((row: { id: string; symbol: string; name: string }) => [
        String(row.id),
        { symbol: String(row.symbol), name: String(row.name) },
      ]),
    );
    const latestSnapshots = new Map<string, { price: number; observedAt: string }>();
    for (const row of snapshotResult.data ?? []) {
      const setupId = String((row as { setup_id: string }).setup_id);
      if (latestSnapshots.has(setupId)) continue;
      latestSnapshots.set(setupId, {
        price: Number((row as { price: number }).price),
        observedAt: String((row as { observed_at: string }).observed_at),
      });
    }

    const rows: SwingTrackerRow[] = setups.map((row) => {
      const asset = assets.get(row.asset_id) ?? { symbol: "?", name: "Unknown security" };
      const snapshot = latestSnapshots.get(row.id) ?? null;
      return {
        id: row.id,
        assetId: row.asset_id,
        symbol: asset.symbol,
        name: asset.name,
        setupType: row.setup_type,
        setupLabel: row.setup_label,
        signalState: row.signal_state,
        signalAt: row.signal_at,
        priceAsOf: row.price_as_of,
        setupScore: Number(row.setup_score),
        highConviction: row.high_conviction,
        entry: Number(row.entry_mid),
        target: Number(row.target),
        invalidation: Number(row.invalidation),
        rewardRisk: Number(row.reward_risk),
        outcomeStatus: row.outcome_status,
        targetBehaviour: row.target_behaviour,
        sessionsObserved: row.sessions_observed,
        maxFavourablePct: finite(row.max_favourable_pct),
        maxAdversePct: finite(row.max_adverse_pct),
        targetOvershootPct: finite(row.target_overshoot_pct),
        targetShortfallPct: finite(row.target_shortfall_pct),
        latestReturnPct: finite(row.latest_return_pct),
        latestObservedPrice: snapshot?.price ?? null,
        latestObservedAt: snapshot?.observedAt ?? null,
        components: row.components,
        metrics: row.metrics,
      };
    });

    const eligible = rows.filter((row) =>
      ["target_hit", "stop_hit", "near_miss", "expired"].includes(row.outcomeStatus),
    );
    const targetHits = rows.filter((row) => row.outcomeStatus === "target_hit").length;
    const stopHits = rows.filter((row) => row.outcomeStatus === "stop_hit").length;
    const nearMisses = rows.filter((row) => row.outcomeStatus === "near_miss").length;
    const expired = rows.filter((row) => row.outcomeStatus === "expired").length;
    const ambiguous = rows.filter((row) => row.outcomeStatus === "ambiguous_same_bar").length;
    const patternStats = buildPatternStats(eligible);
    const baselineHitRate = eligible.length ? round(targetHits / eligible.length * 100, 1) : null;
    const validated = patternStats.filter((pattern) => pattern.validated);
    const latestObservedAt = [...latestSnapshots.values()]
      .map((snapshot) => snapshot.observedAt)
      .sort()
      .at(-1) ?? null;

    return {
      asOf: latestObservedAt ?? new Date().toISOString(),
      cadence: {
        liveMonitor: "Hourly at :10 from 07:10-20:10 UTC on weekdays for the strongest 8 active setups",
        uiRefresh: "Tracker and Swing Radar re-query every 5 minutes while the tab is open",
        authoritativeOutcomeSource: "Final target/stop results are reconciled against completed daily high/low bars",
      },
      totals: {
        tracked: rows.length,
        active: rows.filter((row) => row.outcomeStatus === "active").length,
        resolvedEligible: eligible.length,
        targetHits,
        stopHits,
        nearMisses,
        expired,
        ambiguous,
        targetExceeded: rows.filter((row) => row.targetBehaviour === "exceeded").length,
      },
      performance: {
        hitRate: baselineHitRate,
        averageMaxFavourablePct: average(eligible.map((row) => row.maxFavourablePct)),
        averageMaxAdversePct: average(eligible.map((row) => row.maxAdversePct)),
      },
      learning: {
        minimumSample: 30,
        status: validated.length ? "active" : "collecting",
        baselineHitRate,
        patterns: patternStats.slice(0, 12),
        note: validated.length
          ? "Patterns with at least 30 resolved examples are now statistically eligible to influence future ranking. The raw technical model remains visible so the empirical layer can be audited separately."
          : "The ledger is collecting point-in-time outcomes. Pattern-based ranking adjustments remain disabled until a condition has at least 30 resolved, non-ambiguous examples, which reduces the risk of learning from noise.",
      },
      rows,
    };
  },
);

async function applyIntradayQuote(
  setup: SetupRow,
  quote: LiveQuote,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
): Promise<void> {
  const observedDate = quote.observedAt.slice(0, 10);
  if (observedDate <= setup.price_as_of) return;
  const high = quote.dayHigh ?? quote.price;
  const low = quote.dayLow ?? quote.price;
  const targetHit = high >= setup.target;
  const stopHit = low <= setup.invalidation;
  const now = quote.observedAt;
  const targetOvershootPct = Math.max(0, (high / setup.target - 1) * 100);
  const targetShortfallPct = high < setup.target ? Math.max(0, (setup.target / high - 1) * 100) : 0;
  const maxPrice = setup.max_price === null ? high : Math.max(Number(setup.max_price), high);
  const minPrice = setup.min_price === null ? low : Math.min(Number(setup.min_price), low);

  const common = {
    max_price: maxPrice,
    min_price: minPrice,
    max_favourable_pct: (maxPrice / setup.entry_mid - 1) * 100,
    max_adverse_pct: (minPrice / setup.entry_mid - 1) * 100,
    target_overshoot_pct: targetOvershootPct,
    target_shortfall_pct: targetShortfallPct,
    latest_return_pct: (quote.price / setup.entry_mid - 1) * 100,
    last_evaluated_at: now,
    updated_at: now,
  };

  if (targetHit && stopHit) {
    await db.from("swing_trade_setups").update({
      ...common,
      outcome_status: "ambiguous_same_bar",
      target_behaviour: "ambiguous",
      target_hit_at: now,
      stop_hit_at: now,
      resolved_at: now,
      calibration_eligible: false,
    }).eq("id", setup.id);
    return;
  }
  if (targetHit) {
    const exceedThreshold = Math.max(
      1,
      setup.atr14 && setup.atr14 > 0 ? (setup.atr14 * 0.5 / setup.target) * 100 : 0,
    );
    await db.from("swing_trade_setups").update({
      ...common,
      outcome_status: "target_hit",
      target_behaviour: targetOvershootPct >= exceedThreshold ? "exceeded" : "hit",
      target_hit_at: setup.target_hit_at ?? now,
      resolved_at: setup.resolved_at ?? now,
      calibration_eligible: true,
    }).eq("id", setup.id);
    return;
  }
  if (stopHit) {
    await db.from("swing_trade_setups").update({
      ...common,
      outcome_status: "stop_hit",
      target_behaviour: "missed",
      stop_hit_at: setup.stop_hit_at ?? now,
      resolved_at: setup.resolved_at ?? now,
      calibration_eligible: true,
    }).eq("id", setup.id);
    return;
  }
  await db.from("swing_trade_setups").update(common).eq("id", setup.id);
}

async function fetchLiveQuote(symbol: string): Promise<LiveQuote> {
  const fmpError = await tryFmpQuote(symbol);
  if (fmpError.ok) return fmpError.quote;
  const twelve = await tryTwelveDataQuote(symbol);
  if (twelve.ok) return twelve.quote;
  throw new Error(`No intraday quote available: FMP ${fmpError.error}; Twelve Data ${twelve.error}`);
}

async function tryFmpQuote(symbol: string): Promise<
  | { ok: true; quote: LiveQuote }
  | { ok: false; error: string }
> {
  const key = process.env.FMP_API_KEY;
  if (!key) return { ok: false, error: "key missing" };
  const { canUse, recordCall } = await import("@/lib/ingestion/providers/quota.server");
  const quota = await canUse("fmp", FMP_DAILY_LIMIT, FMP_QUOTA_RESERVE);
  if (!quota.ok) return { ok: false, error: quota.reason ?? "quota unavailable" };
  try {
    const url = new URL("https://financialmodelingprep.com/stable/quote");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("apikey", key);
    const response = await fetch(url.toString());
    if (!response.ok) {
      await recordCall("fmp", response.status === 429 || response.status === 402 ? "rate_limit" : "error", `HTTP ${response.status}`);
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const payload = await response.json() as Array<Record<string, unknown>>;
    const row = Array.isArray(payload) ? payload[0] : null;
    const price = finite(row?.price);
    if (price === null || price <= 0) {
      await recordCall("fmp", "error", "quote missing price");
      return { ok: false, error: "quote missing price" };
    }
    await recordCall("fmp", "ok");
    const timestamp = finite(row?.timestamp);
    return {
      ok: true,
      quote: {
        symbol,
        price,
        dayHigh: positiveOrNull(row?.dayHigh),
        dayLow: positiveOrNull(row?.dayLow),
        volume: positiveOrNull(row?.volume),
        observedAt: timestamp === null ? new Date().toISOString() : new Date(timestamp * 1000).toISOString(),
        provider: "fmp",
      },
    };
  } catch (error) {
    await recordCall("fmp", "error", (error as Error).message);
    return { ok: false, error: (error as Error).message };
  }
}

async function tryTwelveDataQuote(symbol: string): Promise<
  | { ok: true; quote: LiveQuote }
  | { ok: false; error: string }
> {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) return { ok: false, error: "key missing" };
  const { canUse, recordCall } = await import("@/lib/ingestion/providers/quota.server");
  const quota = await canUse("twelvedata", TWELVE_DATA_DAILY_LIMIT, TWELVE_DATA_QUOTA_RESERVE);
  if (!quota.ok) return { ok: false, error: quota.reason ?? "quota unavailable" };
  try {
    const url = new URL("https://api.twelvedata.com/quote");
    url.searchParams.set("symbol", symbol.replace("-", "."));
    url.searchParams.set("apikey", key);
    const response = await fetch(url.toString());
    if (!response.ok) {
      await recordCall("twelvedata", response.status === 429 ? "rate_limit" : "error", `HTTP ${response.status}`);
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const row = await response.json() as Record<string, unknown>;
    if (row.status === "error") {
      const message = String(row.message ?? "quote error");
      await recordCall("twelvedata", Number(row.code) === 429 ? "rate_limit" : "error", message);
      return { ok: false, error: message };
    }
    const price = positiveOrNull(row.close ?? row.price);
    if (price === null) {
      await recordCall("twelvedata", "error", "quote missing price");
      return { ok: false, error: "quote missing price" };
    }
    await recordCall("twelvedata", "ok");
    await sleep(8_000);
    return {
      ok: true,
      quote: {
        symbol,
        price,
        dayHigh: positiveOrNull(row.high),
        dayLow: positiveOrNull(row.low),
        volume: positiveOrNull(row.volume),
        observedAt: quoteTimestamp(row),
        provider: "twelvedata",
      },
    };
  } catch (error) {
    await recordCall("twelvedata", "error", (error as Error).message);
    return { ok: false, error: (error as Error).message };
  }
}

function buildPatternStats(rows: SwingTrackerRow[]): SwingPatternStat[] {
  const patterns = new Map<string, { label: string; sampleSize: number; wins: number }>();
  const add = (key: string, label: string, win: boolean) => {
    const current = patterns.get(key) ?? { label, sampleSize: 0, wins: 0 };
    current.sampleSize += 1;
    if (win) current.wins += 1;
    patterns.set(key, current);
  };

  for (const row of rows) {
    const win = row.outcomeStatus === "target_hit";
    add(`setup:${row.setupType}`, row.setupLabel, win);
    if (row.setupScore >= 80) add("score:80", "Setup score 80+", win);
    if (row.highConviction) add("high_conviction", "High Conviction gate passed", win);
    if (row.components.confirmation?.score >= 70) add("confirmation:70", "Confirmation 70+", win);
    if (row.components.location?.score >= 65) add("location:65", "Location 65+", win);
    if (row.components.volume?.score >= 70) add("volume:70", "Volume score 70+", win);
    if (row.components.regime?.available && row.components.regime.score >= 60) add("regime:60", "Supportive regime 60+", win);
    const rsi = finite(row.metrics.rsi14);
    if (rsi !== null && rsi >= 35 && rsi <= 55) add("rsi:35-55", "RSI 35-55", win);
    const relativeVolume = finite(row.metrics.relativeVolume20);
    if (relativeVolume !== null && relativeVolume >= 1.2) add("relvol:1.2", "Relative volume 1.2x+", win);
  }

  return [...patterns.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      sampleSize: value.sampleSize,
      wins: value.wins,
      hitRate: round(value.wins / value.sampleSize * 100, 1),
      validated: value.sampleSize >= 30,
    }))
    .sort((left, right) =>
      Number(right.validated) - Number(left.validated) ||
      right.sampleSize - left.sampleSize ||
      right.hitRate - left.hitRate,
    );
}

function groupOutcomeBars(rows: PriceRow[]): Map<string, SwingOutcomeBar[]> {
  const map = new Map<string, SwingOutcomeBar[]>();
  for (const row of rows) {
    const high = finite(row.high);
    const low = finite(row.low);
    const close = finite(row.close);
    if (high === null || low === null || close === null) continue;
    const list = map.get(row.asset_id) ?? [];
    list.push({ date: row.trade_date, high, low, close });
    map.set(row.asset_id, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return map;
}

function emptyTrackerWorkspace(): SwingTrackerWorkspace {
  return {
    asOf: new Date().toISOString(),
    cadence: {
      liveMonitor: "Hourly at :10 from 07:10-20:10 UTC on weekdays for the strongest 8 active setups",
      uiRefresh: "Tracker and Swing Radar re-query every 5 minutes while the tab is open",
      authoritativeOutcomeSource: "Final target/stop results are reconciled against completed daily high/low bars",
    },
    totals: {
      tracked: 0,
      active: 0,
      resolvedEligible: 0,
      targetHits: 0,
      stopHits: 0,
      nearMisses: 0,
      expired: 0,
      ambiguous: 0,
      targetExceeded: 0,
    },
    performance: {
      hitRate: null,
      averageMaxFavourablePct: null,
      averageMaxAdversePct: null,
    },
    learning: {
      minimumSample: 30,
      status: "collecting",
      baselineHitRate: null,
      patterns: [],
      note: "No tracked outcomes yet. The platform will begin collecting immutable setup snapshots once qualifying signals are surfaced.",
    },
    rows: [],
  };
}

async function looseDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The migration lands with this feature. Generated Supabase types are updated
  // separately by the normal schema-generation workflow, so keep this boundary
  // intentionally loose instead of pretending the new tables already exist in
  // the checked-in generated file.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

function marketCloseTimestamp(date: string): string {
  return `${date}T21:00:00.000Z`;
}

function quoteTimestamp(row: Record<string, unknown>): string {
  const timestamp = finite(row.timestamp);
  if (timestamp !== null) return new Date(timestamp * 1000).toISOString();
  const datetime = typeof row.datetime === "string" ? row.datetime : null;
  if (datetime) {
    const parsed = new Date(datetime.endsWith("Z") ? datetime : `${datetime}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function positiveOrNull(value: unknown): number | null {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function chunk<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function average(values: Array<number | null>): number | null {
  const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!clean.length) return null;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length, 2);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
