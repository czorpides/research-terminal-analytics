import { createServerFn } from "@tanstack/react-start";

import {
  computeSwingTrade,
  SWING_MODEL_VERSION,
  type SwingBar,
  type SwingTradeCandidate,
} from "./model";

const MAX_UNIVERSE = 3_000;
const DEEP_SCAN_CAP = 160;
const BAR_LOOKBACK = 90;

type ScoreType = "momentum" | "trend" | "volatility" | "quality" | "valuation";

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  country_id: string | null;
  industry_id: string | null;
}

interface ScoreRow {
  subject_id: string;
  score_type: ScoreType;
  value: number;
  confidence: number;
  inputs: Record<string, unknown>;
  computed_at: string;
}

interface PriceRow {
  asset_id: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface EarningsRow {
  asset_id: string;
  scheduled_at: string;
  surprise_pct: number | null;
  actual_eps: number | null;
  estimate_eps: number | null;
}

export interface SwingWorkspaceCandidate {
  assetId: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  countryCode: string;
  industryCode: string | null;
  industryName: string | null;
  priceAsOf: string;
  trade: SwingTradeCandidate;
}

export interface SwingTradesWorkspace {
  asOf: string;
  modelVersion: string;
  universe: {
    activeEquities: number;
    scoreScreened: number;
    deepScanned: number;
    surfaced: number;
    cap: number;
  };
  candidates: SwingWorkspaceCandidate[];
  methodology: string;
  calibration: {
    status: "not_calibrated";
    note: string;
  };
}

export const getSwingTradesWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<SwingTradesWorkspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: activeEquities } = await supabaseAdmin
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .eq("asset_class", "equity");

    const { data: assetData, error: assetError } = await supabaseAdmin
      .from("assets")
      .select("id,symbol,name,exchange,currency,country_id,industry_id")
      .eq("active", true)
      .eq("asset_class", "equity")
      .order("symbol", { ascending: true })
      .limit(MAX_UNIVERSE);
    if (assetError) throw assetError;
    const assets = (assetData ?? []) as AssetRow[];
    if (!assets.length) return emptyWorkspace(activeEquities ?? 0);

    const assetIds = assets.map((asset) => asset.id);
    const scorePages = await Promise.all(
      chunk(assetIds, 75).map((batch) =>
        supabaseAdmin
          .from("latest_asset_scores")
          .select("subject_id,score_type,value,confidence,inputs,computed_at")
          .in("subject_id", batch)
          .in("score_type", ["momentum", "trend", "volatility", "quality", "valuation"])
          .limit(batch.length * 5),
      ),
    );
    const scoreError = scorePages.find((page) => page.error)?.error;
    if (scoreError) throw scoreError;
    const scoreRows = scorePages.flatMap((page) => page.data ?? []) as unknown as ScoreRow[];
    const scores = scoreMap(scoreRows);
    const selectedIds = selectDeepScan(assets, scores);
    const selectedAssets = assets.filter((asset) => selectedIds.has(asset.id));

    const selectedAssetIds = selectedAssets.map((asset) => asset.id);
    const countryIds = unique(selectedAssets.map((asset) => asset.country_id).filter(isString));
    const industryIds = unique(selectedAssets.map((asset) => asset.industry_id).filter(isString));
    const now = new Date();
    const priceStart = new Date(now.getTime() - 160 * 86_400_000).toISOString().slice(0, 10);
    const eventStart = new Date(now.getTime() - 45 * 86_400_000).toISOString();
    const eventEnd = new Date(now.getTime() + 45 * 86_400_000).toISOString();

    const [pricePages, earningsPages, countryResult, industryResult] = await Promise.all([
      Promise.all(
        chunk(selectedAssetIds, 6).map((batch) =>
          supabaseAdmin
            .from("prices_daily")
            .select("asset_id,trade_date,open,high,low,close,volume")
            .in("asset_id", batch)
            .gte("trade_date", priceStart)
            .order("trade_date", { ascending: false })
            .limit(900),
        ),
      ),
      Promise.all(
        chunk(selectedAssetIds, 75).map((batch) =>
          supabaseAdmin
            .from("earnings_events")
            .select("asset_id,scheduled_at,surprise_pct,actual_eps,estimate_eps")
            .in("asset_id", batch)
            .gte("scheduled_at", eventStart)
            .lte("scheduled_at", eventEnd)
            .order("scheduled_at", { ascending: false })
            .limit(batch.length * 6),
        ),
      ),
      countryIds.length
        ? supabaseAdmin.from("countries").select("id,iso2").in("id", countryIds)
        : Promise.resolve({ data: [], error: null }),
      industryIds.length
        ? supabaseAdmin.from("industries").select("id,code,name").in("id", industryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const priceError = pricePages.find((page) => page.error)?.error;
    const earningsError = earningsPages.find((page) => page.error)?.error;
    if (priceError) throw priceError;
    if (earningsError) throw earningsError;
    if (countryResult.error) throw countryResult.error;
    if (industryResult.error) throw industryResult.error;

    const barsByAsset = groupBars(
      pricePages.flatMap((page) => page.data ?? []) as unknown as PriceRow[],
    );
    const earningsByAsset = groupEarnings(
      earningsPages.flatMap((page) => page.data ?? []) as unknown as EarningsRow[],
    );
    const countries = new Map(
      (countryResult.data ?? []).map((row) => [String(row.id), String(row.iso2)]),
    );
    const industries = new Map(
      (industryResult.data ?? []).map((row) => [
        String(row.id),
        { code: String(row.code), name: String(row.name) },
      ]),
    );

    const candidates: SwingWorkspaceCandidate[] = [];
    for (const asset of selectedAssets) {
      const bars = barsByAsset.get(asset.id) ?? [];
      if (bars.length < 35) continue;
      const bag = scores.get(asset.id) ?? {};
      const trendInputs = bag.trend?.inputs ?? {};
      const catalyst = catalystEvidence(earningsByAsset.get(asset.id) ?? [], now);
      const trade = computeSwingTrade(bars, {
        existingMomentum: finite(bag.momentum?.value),
        existingTrend: finite(bag.trend?.value),
        existingVolatility: finite(bag.volatility?.value),
        ma50: finite(trendInputs.ma50),
        ma200: finite(trendInputs.ma200),
        hi52: finite(trendInputs.hi52),
        quality: finite(bag.quality?.value),
        valuation: finite(bag.valuation?.value),
        catalystScore: catalyst.score,
        catalystLabel: catalyst.label,
        catalystRisk: catalyst.risk,
        regimeScore: 50,
        regimeLabel: "Regional regime pending",
        regimeAvailable: false,
      });
      if (!trade || trade.setupScore < 45) continue;
      const latest = bars.at(-1)!;
      const ageDays = Math.max(0, (now.getTime() - new Date(`${latest.date}T21:00:00Z`).getTime()) / 86_400_000);
      if (ageDays > 7) {
        trade.risks.push(`Price data is stale at ${Math.floor(ageDays)} days old.`);
        trade.highConviction = false;
      }
      const countryCode = asset.country_id
        ? countries.get(asset.country_id) ?? inferCountry(asset.exchange)
        : inferCountry(asset.exchange);
      const industry = asset.industry_id ? industries.get(asset.industry_id) ?? null : null;
      candidates.push({
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        exchange: asset.exchange,
        currency: asset.currency,
        countryCode,
        industryCode: industry?.code ?? null,
        industryName: industry?.name ?? null,
        priceAsOf: latest.date,
        trade,
      });
    }

    candidates.sort((left, right) =>
      Number(right.trade.highConviction) - Number(left.trade.highConviction) ||
      right.trade.setupScore - left.trade.setupScore ||
      (right.trade.geometry?.rewardRisk ?? 0) - (left.trade.geometry?.rewardRisk ?? 0),
    );

    const latestDate = candidates.reduce(
      (latest, candidate) => candidate.priceAsOf > latest ? candidate.priceAsOf : latest,
      "",
    );

    return {
      asOf: latestDate || new Date().toISOString().slice(0, 10),
      modelVersion: SWING_MODEL_VERSION,
      universe: {
        activeEquities: activeEquities ?? assets.length,
        scoreScreened: assets.length,
        deepScanned: selectedAssets.length,
        surfaced: candidates.length,
        cap: DEEP_SCAN_CAP,
      },
      candidates: candidates.slice(0, 100),
      methodology:
        "The full active equity universe is first screened through several independent technical and recovery routes using existing platform scores. Up to 160 diverse candidates then receive a 90-session OHLCV analysis covering RSI, short-term momentum, support/resistance, relative volume, ATR, volatility behaviour, confirmation and explicit reward/risk geometry.",
      calibration: {
        status: "not_calibrated",
        note:
          "Setup Score is a deterministic evidence score, not a claimed probability of profit. A point-in-time historical calibration layer is required before the platform can attach observed win rates to score bands.",
      },
    };
  },
);

function selectDeepScan(
  assets: AssetRow[],
  scores: Map<string, Partial<Record<ScoreType, ScoreRow>>>,
): Set<string> {
  const rows = assets.map((asset) => {
    const bag = scores.get(asset.id) ?? {};
    const momentum = finite(bag.momentum?.value);
    const trend = finite(bag.trend?.value);
    const quality = finite(bag.quality?.value);
    const valuation = finite(bag.valuation?.value);
    const trendInputs = bag.trend?.inputs ?? {};
    const current = finite(trendInputs.cur);
    const high = finite(trendInputs.hi52);
    const drawdown = current !== null && high !== null && high > 0 ? current / high - 1 : null;
    const technical = [momentum, trend].filter((value): value is number => value !== null);
    return {
      assetId: asset.id,
      momentum,
      trend,
      quality,
      valuation,
      drawdown,
      technicalMean: technical.length ? technical.reduce((sum, value) => sum + value, 0) / technical.length : null,
    };
  }).filter((row) => row.technicalMean !== null || row.momentum !== null || row.trend !== null);

  const selected = new Set<string>();
  addTop(selected, rows, (row) => row.technicalMean ?? -1, 48, true);
  addTop(selected, rows, (row) => row.momentum ?? -1, 36, true);
  addTop(selected, rows, (row) => row.trend ?? -1, 28, true);
  addTop(selected, rows, (row) => row.technicalMean ?? 101, 24, false);
  addTop(
    selected,
    rows.filter((row) => (row.quality ?? 0) >= 50 || (row.valuation ?? 0) >= 55),
    (row) => row.drawdown ?? 0,
    36,
    false,
  );
  addTop(
    selected,
    rows.filter((row) => row.drawdown !== null && row.drawdown >= -0.08),
    (row) => row.drawdown ?? -1,
    24,
    true,
  );

  return new Set([...selected].slice(0, DEEP_SCAN_CAP));
}

function addTop<T>(
  target: Set<string>,
  rows: T[],
  metric: (row: T) => number,
  count: number,
  descending: boolean,
): void {
  const sorted = [...rows].sort((left, right) =>
    descending ? metric(right) - metric(left) : metric(left) - metric(right),
  );
  for (const row of sorted.slice(0, count)) {
    const assetId = (row as { assetId: string }).assetId;
    target.add(assetId);
  }
}

function scoreMap(rows: ScoreRow[]): Map<string, Partial<Record<ScoreType, ScoreRow>>> {
  const map = new Map<string, Partial<Record<ScoreType, ScoreRow>>>();
  for (const row of rows) {
    const bag = map.get(row.subject_id) ?? {};
    bag[row.score_type] = row;
    map.set(row.subject_id, bag);
  }
  return map;
}

function groupBars(rows: PriceRow[]): Map<string, SwingBar[]> {
  const map = new Map<string, SwingBar[]>();
  for (const row of rows) {
    if ([row.open, row.high, row.low, row.close].some((value) => value === null)) continue;
    const list = map.get(row.asset_id) ?? [];
    list.push({
      date: row.trade_date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume === null ? null : Number(row.volume),
    });
    map.set(row.asset_id, list);
  }
  for (const [assetId, list] of map.entries()) {
    list.sort((left, right) => left.date.localeCompare(right.date));
    if (list.length > BAR_LOOKBACK) map.set(assetId, list.slice(-BAR_LOOKBACK));
  }
  return map;
}

function groupEarnings(rows: EarningsRow[]): Map<string, EarningsRow[]> {
  const map = new Map<string, EarningsRow[]>();
  for (const row of rows) {
    const list = map.get(row.asset_id) ?? [];
    list.push(row);
    map.set(row.asset_id, list);
  }
  return map;
}

function catalystEvidence(
  events: EarningsRow[],
  now: Date,
): { score: number | null; label: string | null; risk: string | null } {
  if (!events.length) return { score: null, label: null, risk: null };
  const nowMs = now.getTime();
  const upcoming = events
    .filter((event) => new Date(event.scheduled_at).getTime() > nowMs)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null;
  const recent = events
    .filter((event) => new Date(event.scheduled_at).getTime() <= nowMs && event.surprise_pct !== null)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))[0] ?? null;

  if (upcoming) {
    const days = Math.ceil((new Date(upcoming.scheduled_at).getTime() - nowMs) / 86_400_000);
    if (days <= 3) {
      return {
        score: 40,
        label: `Earnings in ${days} day${days === 1 ? "" : "s"}`,
        risk: `Earnings are scheduled within 3 days (${days} day${days === 1 ? "" : "s"}), adding binary event risk.`,
      };
    }
  }

  if (recent?.surprise_pct !== null && recent?.surprise_pct !== undefined) {
    const surprise = Number(recent.surprise_pct);
    const score = surprise >= 10 ? 82 : surprise >= 5 ? 72 : surprise > 0 ? 61 : surprise <= -10 ? 24 : surprise <= -5 ? 34 : 44;
    return {
      score,
      label: `Recent EPS surprise ${surprise >= 0 ? "+" : ""}${surprise.toFixed(1)}%`,
      risk: surprise <= -5 ? "Recent earnings surprise was negative and may cap near-term follow-through." : null,
    };
  }

  if (upcoming) {
    const days = Math.ceil((new Date(upcoming.scheduled_at).getTime() - nowMs) / 86_400_000);
    if (days <= 30) return { score: 54, label: `Earnings in ${days} days`, risk: null };
  }
  return { score: null, label: null, risk: null };
}

function emptyWorkspace(activeEquities: number): SwingTradesWorkspace {
  return {
    asOf: new Date().toISOString().slice(0, 10),
    modelVersion: SWING_MODEL_VERSION,
    universe: { activeEquities, scoreScreened: 0, deepScanned: 0, surfaced: 0, cap: DEEP_SCAN_CAP },
    candidates: [],
    methodology: "No active scored equities are available yet.",
    calibration: {
      status: "not_calibrated",
      note: "Setup Score is not a probability of profit.",
    },
  };
}

function inferCountry(exchange: string | null): string {
  const value = (exchange ?? "").toUpperCase();
  if (value.includes("LSE") || value.includes("LONDON")) return "UK";
  if (["NASDAQ", "NYSE", "AMEX", "NYSE AMERICAN"].some((token) => value.includes(token))) return "US";
  return "EU";
}

function chunk<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isString(value: string | null): value is string {
  return Boolean(value);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}
