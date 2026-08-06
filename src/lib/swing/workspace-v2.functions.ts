import { createServerFn } from "@tanstack/react-start";

import {
  buildEquityCatalystContext,
  loadPreciousMetalMacroContexts,
  type SwingV2EarningsEvent,
  type SwingV2NewsItem,
} from "./context-v2.server";
import {
  computeSwingTradeV2,
  SWING_V2_MODEL_VERSION,
  type SwingV2Candidate,
  type SwingV2CatalystContext,
} from "./model-v2";
import type { SwingBar } from "./model";
import type { SwingExpectationSignal } from "./expectations";

const MAX_UNIVERSE = 3_000;
const DEEP_SCAN_CAP = 220;
const BAR_LOOKBACK = 280;
const PRICE_HISTORY_DAYS = 620;
const METAL_SYMBOLS = ["XAUUSD", "XAGUSD"] as const;

type ScoreType = "momentum" | "trend" | "volatility" | "quality" | "valuation";

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  country_id: string | null;
  industry_id: string | null;
  asset_class?: string | null;
}

interface ScoreRow {
  subject_id: string;
  score_type: ScoreType;
  value: number;
  confidence: number;
  inputs: Record<string, unknown>;
  computed_at: string;
}

interface TechnicalScreenRow {
  asset_id: string;
  as_of: string;
  bars: number;
  current_price: number | null;
  return_5d_pct: number | null;
  return_20d_pct: number | null;
  ma20: number | null;
  ma50: number | null;
  high_90: number | null;
  low_90: number | null;
  latest_volume: number | null;
  avg_volume_20: number | null;
  relative_volume: number | null;
}

interface PriceRow {
  asset_id: string;
  trade_date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adj_close: number | null;
  volume: number | null;
}

interface CountryRow { id: string; iso2: string }
interface IndustryRow { id: string; code: string; name: string }

export interface SwingV2WorkspaceCandidate {
  assetId: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  assetType: "equity" | "commodity";
  countryCode: string;
  industryCode: string | null;
  industryName: string | null;
  priceAsOf: string;
  setup: SwingV2Candidate;
  catalyst: SwingV2CatalystContext;
  expectations: SwingExpectationSignal | null;
}

export interface SwingV2Workspace {
  asOf: string;
  modelVersion: string;
  shadow: true;
  calibration: {
    status: "shadow_unvalidated";
    note: string;
  };
  universe: {
    activeEquities: number;
    scoreScreened: number;
    equityDeepScanned: number;
    commodityDeepScanned: number;
    surfaced: number;
    actionable: number;
    developing: number;
    eventRisk: number;
    extended: number;
    cap: number;
  };
  candidates: SwingV2WorkspaceCandidate[];
  methodology: string;
  warnings: string[];
}

export const getSwingTradesV2Workspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<SwingV2Workspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // v2 reads optional/new data surfaces fail-soft while it remains shadow.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;

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
    const equities = (assetData ?? []) as AssetRow[];
    if (!equities.length) return emptyWorkspace(activeEquities ?? 0, ["No active equities are loaded."]);

    const equityIds = equities.map((asset) => asset.id);
    const [scorePages, screenRows, metalResult] = await Promise.all([
      Promise.all(
        chunk(equityIds, 75).map((batch) =>
          supabaseAdmin
            .from("latest_asset_scores")
            .select("subject_id,score_type,value,confidence,inputs,computed_at")
            .in("subject_id", batch)
            .in("score_type", ["momentum", "trend", "volatility", "quality", "valuation"])
            .limit(batch.length * 5),
        ),
      ),
      loadTechnicalScreen(equityIds),
      db
        .from("assets")
        .select("id,symbol,name,exchange,currency,country_id,industry_id,asset_class")
        .eq("active", true)
        .eq("asset_class", "commodity")
        .in("symbol", [...METAL_SYMBOLS]),
    ]);
    const scoreError = scorePages.find((page) => page.error)?.error;
    if (scoreError) throw scoreError;
    const scores = scoreMap(scorePages.flatMap((page) => page.data ?? []) as unknown as ScoreRow[]);
    const technicalScreen = new Map(screenRows.map((row) => [row.asset_id, row]));
    const selectedIds = selectDeepScanV2(equities, scores, technicalScreen);
    const selectedEquities = equities.filter((asset) => selectedIds.has(asset.id));
    const metals = metalResult.error ? [] : ((metalResult.data ?? []) as AssetRow[]);
    const selectedAssets = [...selectedEquities, ...metals];
    const selectedIdsAll = selectedAssets.map((asset) => asset.id);
    const scoreScreened = equities.filter((asset) =>
      technicalScreen.has(asset.id) || hasTechnicalScore(scores.get(asset.id)),
    ).length;

    const countryIds = unique(selectedEquities.map((asset) => asset.country_id).filter(isString));
    const industryIds = unique(selectedEquities.map((asset) => asset.industry_id).filter(isString));
    const now = new Date();
    const priceStart = new Date(now.getTime() - PRICE_HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const eventStart = new Date(now.getTime() - 55 * 86_400_000).toISOString();
    const eventEnd = new Date(now.getTime() + 45 * 86_400_000).toISOString();
    const newsStart = new Date(now.getTime() - 14 * 86_400_000).toISOString();

    const [pricePages, earningsPages, newsPages, countryResult, industryResult] = await Promise.all([
      Promise.all(
        chunk(selectedIdsAll, 3).map((batch) =>
          db
            .from("prices_daily")
            .select("asset_id,trade_date,open,high,low,close,adj_close,volume")
            .in("asset_id", batch)
            .gte("trade_date", priceStart)
            .order("trade_date", { ascending: false })
            .limit(batch.length * 360),
        ),
      ),
      Promise.all(
        chunk(selectedIdsAll, 75).map((batch) =>
          db
            .from("earnings_events")
            .select("asset_id,scheduled_at,surprise_pct,actual_eps,estimate_eps")
            .in("asset_id", batch)
            .gte("scheduled_at", eventStart)
            .lte("scheduled_at", eventEnd)
            .order("scheduled_at", { ascending: false })
            .limit(batch.length * 6),
        ),
      ),
      loadNewsPages(db, selectedIdsAll, newsStart),
      countryIds.length
        ? supabaseAdmin.from("countries").select("id,iso2").in("id", countryIds)
        : Promise.resolve({ data: [], error: null }),
      industryIds.length
        ? supabaseAdmin.from("industries").select("id,code,name").in("id", industryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const priceError = pricePages.find((page: { error?: unknown }) => page.error)?.error;
    const earningsError = earningsPages.find((page: { error?: unknown }) => page.error)?.error;
    if (priceError) throw priceError;
    if (earningsError) throw earningsError;
    if (countryResult.error) throw countryResult.error;
    if (industryResult.error) throw industryResult.error;

    const barsByAsset = groupAdjustedBars(
      pricePages.flatMap((page: { data?: unknown[] }) => page.data ?? []) as PriceRow[],
    );
    const earningsByAsset = groupRows<SwingV2EarningsEvent>(
      earningsPages.flatMap((page: { data?: unknown[] }) => page.data ?? []) as Array<SwingV2EarningsEvent & { asset_id: string }>,
    );
    const newsByAsset = groupRows<SwingV2NewsItem>(
      newsPages as Array<SwingV2NewsItem & { subject_id: string }>,
      "subject_id",
    );
    const countries = new Map<string, string>(
      ((countryResult.data ?? []) as unknown as CountryRow[]).map((row) => [String(row.id), String(row.iso2)]),
    );
    const industries = new Map<string, { code: string; name: string }>(
      ((industryResult.data ?? []) as unknown as IndustryRow[]).map((row) => [
        String(row.id),
        { code: String(row.code), name: String(row.name) },
      ]),
    );

    let expectationSignals: Record<string, SwingExpectationSignal> = {};
    try {
      const { loadExpectationSignalsForAssets } = await import("./expectations.functions");
      expectationSignals = await loadExpectationSignalsForAssets(selectedEquities.map((asset) => asset.id));
    } catch {
      expectationSignals = {};
    }
    const metalMacro = await loadPreciousMetalMacroContexts();

    const warnings: string[] = [];
    if (!metals.length) warnings.push("Gold/silver assets are not loaded yet; apply the v2 metals rollout and run its EODHD history ingest.");
    if (metalResult.error) warnings.push(`Metal asset lookup failed: ${errorMessage(metalResult.error)}`);

    const candidates: SwingV2WorkspaceCandidate[] = [];
    for (const asset of selectedAssets) {
      const bars = barsByAsset.get(asset.id) ?? [];
      if (bars.length < 45) {
        if (METAL_SYMBOLS.includes(asset.symbol as (typeof METAL_SYMBOLS)[number])) {
          warnings.push(`${asset.symbol} has only ${bars.length} usable OHLC bars; metals history ingest is not ready.`);
        }
        continue;
      }
      const isMetal = METAL_SYMBOLS.includes(asset.symbol as (typeof METAL_SYMBOLS)[number]);
      const bag = scores.get(asset.id) ?? {};
      const expectations = isMetal ? null : (expectationSignals[asset.id] ?? null);
      const catalyst = isMetal
        ? neutralCatalyst()
        : buildEquityCatalystContext(
            earningsByAsset.get(asset.id) ?? [],
            expectations,
            newsByAsset.get(asset.id) ?? [],
            now,
          );
      const macro = isMetal
        ? metalMacro[asset.symbol as "XAUUSD" | "XAGUSD"]
        : null;
      const setup = computeSwingTradeV2(bars, {
        existingMomentum: finite(bag.momentum?.value),
        existingTrend: finite(bag.trend?.value),
        quality: finite(bag.quality?.value),
        valuation: finite(bag.valuation?.value),
        catalyst,
        macro,
        instrumentType: isMetal ? "commodity" : "equity",
      });
      if (!setup || setup.rankingScore < 42 || setup.entryState === "invalidated") continue;
      const latest = bars.at(-1)!;
      const ageDays = Math.max(0, (now.getTime() - new Date(`${latest.date}T21:00:00Z`).getTime()) / 86_400_000);
      if (ageDays > 7) {
        setup.risks.unshift(`Daily OHLC evidence is ${Math.floor(ageDays)} days old.`);
        if (setup.entryState === "actionable") setup.entryState = "developing";
        setup.rankingScore = Math.max(0, setup.rankingScore - 12);
      }

      const industry = asset.industry_id ? industries.get(asset.industry_id) ?? null : null;
      const countryCode = isMetal
        ? "GLOBAL"
        : asset.country_id
          ? countries.get(asset.country_id) ?? inferCountry(asset.exchange)
          : inferCountry(asset.exchange);
      candidates.push({
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        exchange: asset.exchange,
        currency: asset.currency,
        assetType: isMetal ? "commodity" : "equity",
        countryCode,
        industryCode: industry?.code ?? null,
        industryName: industry?.name ?? null,
        priceAsOf: latest.date,
        setup,
        catalyst,
        expectations,
      });
    }

    candidates.sort((left, right) =>
      right.setup.rankingScore - left.setup.rankingScore ||
      right.setup.entryQuality - left.setup.entryQuality ||
      right.setup.technicalScore - left.setup.technicalScore,
    );

    const latestDate = candidates.reduce(
      (latest, candidate) => candidate.priceAsOf > latest ? candidate.priceAsOf : latest,
      "",
    );
    const surfaced = candidates.slice(0, 140);
    return {
      asOf: latestDate || new Date().toISOString().slice(0, 10),
      modelVersion: SWING_V2_MODEL_VERSION,
      shadow: true,
      calibration: {
        status: "shadow_unvalidated",
        note:
          "v2 separates setup quality from entry quality and intentionally favours pullbacks, mean reversion, 200SMA bounces and catalyst repricing over simple proximity to a high. Thresholds are hypotheses until point-in-time outcomes support them; v1 remains the control tracker during shadow validation.",
      },
      universe: {
        activeEquities: activeEquities ?? equities.length,
        scoreScreened,
        equityDeepScanned: selectedEquities.length,
        commodityDeepScanned: metals.length,
        surfaced: surfaced.length,
        actionable: surfaced.filter((candidate) => candidate.setup.entryState === "actionable").length,
        developing: surfaced.filter((candidate) => candidate.setup.entryState === "developing").length,
        eventRisk: surfaced.filter((candidate) => candidate.setup.entryState === "event_risk").length,
        extended: surfaced.filter((candidate) => candidate.setup.entryState === "extended").length,
        cap: DEEP_SCAN_CAP,
      },
      candidates: surfaced,
      methodology:
        "Swing v2 is a multi-strategy shadow engine. The broad screen deliberately allocates deep-scan capacity to 3-6 month lows, drawdowns, negative-to-positive momentum transitions, value/quality dislocations and 200SMA candidates; only a small bucket is reserved for clean base breakouts. Deep analysis then combines RSI, MACD, 20/50/200SMA location, 3/6/12-month range position, z-scores, ATR, volume, structural reward/risk, earnings timing and validated analyst estimate/target revisions. Gold and silver use the same technical framework with a separate macro overlay based on real yields, the broad dollar and volatility.",
      warnings: unique(warnings).slice(0, 20),
    };
  },
);

function selectDeepScanV2(
  assets: AssetRow[],
  scores: Map<string, Partial<Record<ScoreType, ScoreRow>>>,
  technicalScreen: Map<string, TechnicalScreenRow>,
): Set<string> {
  const rows = assets.map((asset) => {
    const bag = scores.get(asset.id) ?? {};
    const screen = technicalScreen.get(asset.id) ?? null;
    const trendInputs = bag.trend?.inputs ?? {};
    const current = finite(screen?.current_price) ?? finite(trendInputs.cur);
    const high90 = finite(screen?.high_90) ?? finite(trendInputs.hi52);
    const low90 = finite(screen?.low_90);
    const ma20 = finite(screen?.ma20);
    const ma50 = finite(screen?.ma50);
    const ma200 = finite(trendInputs.ma200);
    const return5 = finite(screen?.return_5d_pct);
    const return20 = finite(screen?.return_20d_pct);
    const relativeVolume = finite(screen?.relative_volume);
    const quality = finite(bag.quality?.value);
    const valuation = finite(bag.valuation?.value);
    const drawdown90 = current !== null && high90 !== null && high90 > 0 ? current / high90 - 1 : null;
    const rangeLocation90 = current !== null && high90 !== null && low90 !== null && high90 > low90
      ? (current - low90) / (high90 - low90)
      : null;
    const distanceMa20 = current !== null && ma20 !== null && ma20 > 0 ? current / ma20 - 1 : null;
    const distanceMa50 = current !== null && ma50 !== null && ma50 > 0 ? current / ma50 - 1 : null;
    const distanceMa200 = current !== null && ma200 !== null && ma200 > 0 ? current / ma200 - 1 : null;
    return {
      assetId: asset.id,
      return5,
      return20,
      relativeVolume,
      quality,
      valuation,
      drawdown90,
      rangeLocation90,
      distanceMa20,
      distanceMa50,
      distanceMa200,
      oldMomentum: finite(bag.momentum?.value),
      oldTrend: finite(bag.trend?.value),
    };
  }).filter((row) =>
    row.return5 !== null || row.return20 !== null || row.drawdown90 !== null || row.oldMomentum !== null,
  );

  const selected = new Set<string>();
  // Depression / location buckets dominate v2 nomination.
  addTop(selected, rows, (row) => row.rangeLocation90 ?? 2, 42, false);
  addTop(selected, rows, (row) => row.drawdown90 ?? 1, 42, false);
  addTop(selected, rows, (row) => row.return20 ?? 999, 34, false);
  addTop(
    selected,
    rows.filter((row) => (row.return20 ?? 0) < -2 && (row.return5 ?? -999) > 0),
    (row) => row.return5 ?? -999,
    34,
    true,
  );
  // 200SMA and moving-average mean-reversion candidates.
  addTop(
    selected,
    rows.filter((row) => row.distanceMa200 !== null && row.distanceMa200 >= -0.18 && row.distanceMa200 <= 0.05),
    (row) => Math.abs(row.distanceMa200 ?? 99),
    34,
    false,
  );
  addTop(
    selected,
    rows.filter((row) =>
      [row.distanceMa20, row.distanceMa50].some((distance) => distance !== null && distance <= 0.02 && distance >= -0.1),
    ),
    (row) => Math.min(Math.abs(row.distanceMa20 ?? 99), Math.abs(row.distanceMa50 ?? 99)),
    28,
    false,
  );
  // Fundamentally supported damage gets a dedicated catalyst/repricing lane.
  addTop(
    selected,
    rows.filter((row) =>
      (row.drawdown90 ?? 0) <= -0.08 && ((row.quality ?? 0) >= 55 || (row.valuation ?? 0) >= 58),
    ),
    (row) => (row.quality ?? 0) + (row.valuation ?? 0) - (row.drawdown90 ?? 0) * 50,
    38,
    true,
  );
  // Volume-driven reversals.
  addTop(
    selected,
    rows.filter((row) => (row.drawdown90 ?? 0) <= -0.05),
    (row) => row.relativeVolume ?? -1,
    24,
    true,
  );
  // Preserve only a small trend/base-breakout discovery lane.
  addTop(
    selected,
    rows.filter((row) =>
      (row.rangeLocation90 ?? 0) >= 0.72 &&
      (row.rangeLocation90 ?? 1) <= 1.02 &&
      (row.return20 ?? 0) <= 12 &&
      (row.distanceMa20 ?? 0) <= 0.07,
    ),
    (row) => (row.relativeVolume ?? 0) + (row.oldTrend ?? 50) / 100,
    24,
    true,
  );
  return new Set([...selected].slice(0, DEEP_SCAN_CAP));
}

async function loadTechnicalScreen(assetIds: string[]): Promise<TechnicalScreenRow[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const pages = await Promise.all(
      chunk(assetIds, 400).map((batch) =>
        db
          .from("equity_technical_screen")
          .select("asset_id,as_of,bars,current_price,return_5d_pct,return_20d_pct,ma20,ma50,high_90,low_90,latest_volume,avg_volume_20,relative_volume")
          .in("asset_id", batch)
          .limit(batch.length),
      ),
    );
    const error = pages.find((page: { error?: unknown }) => page.error)?.error;
    if (error) return [];
    return pages.flatMap((page: { data?: TechnicalScreenRow[] }) => page.data ?? []);
  } catch {
    return [];
  }
}

async function loadNewsPages(
  db: any,
  assetIds: string[],
  newsStart: string,
): Promise<Array<SwingV2NewsItem & { subject_id: string }>> {
  try {
    const pages = await Promise.all(
      chunk(assetIds, 80).map((batch) =>
        db
          .from("news_items")
          .select("subject_id,headline,published_at,sentiment,url")
          .eq("subject_type", "asset")
          .in("subject_id", batch)
          .gte("published_at", newsStart)
          .order("published_at", { ascending: false })
          .limit(batch.length * 6),
      ),
    );
    if (pages.some((page: { error?: unknown }) => page.error)) return [];
    return pages.flatMap((page: { data?: unknown[] }) => page.data ?? []) as Array<SwingV2NewsItem & { subject_id: string }>;
  } catch {
    return [];
  }
}

function groupAdjustedBars(rows: PriceRow[]): Map<string, SwingBar[]> {
  const byAsset = new Map<string, PriceRow[]>();
  for (const row of rows) {
    if ([row.open, row.high, row.low, row.close].some((value) => value === null)) continue;
    const list = byAsset.get(row.asset_id) ?? [];
    list.push(row);
    byAsset.set(row.asset_id, list);
  }
  const output = new Map<string, SwingBar[]>();
  for (const [assetId, input] of byAsset.entries()) {
    const sorted = [...input].sort((left, right) => left.trade_date.localeCompare(right.trade_date));
    const latest = sorted.at(-1);
    const latestClose = finite(latest?.close);
    const latestAdj = finite(latest?.adj_close);
    const currentScale = latestClose !== null && latestAdj !== null && latestAdj > 0
      ? latestClose / latestAdj
      : 1;
    const bars = sorted.map((row) => {
      const rawClose = finite(row.close)!;
      const adj = finite(row.adj_close);
      const factor = adj !== null && rawClose > 0 ? adj / rawClose : 1;
      const scale = factor * currentScale;
      return {
        date: row.trade_date,
        open: Number(row.open) * scale,
        high: Number(row.high) * scale,
        low: Number(row.low) * scale,
        close: rawClose * scale,
        volume: row.volume === null ? null : Number(row.volume),
      } satisfies SwingBar;
    }).filter(validBar);
    output.set(assetId, bars.slice(-BAR_LOOKBACK));
  }
  return output;
}

function groupRows<T>(
  rows: Array<T & Record<string, unknown>>,
  key = "asset_id",
): Map<string, T[]> {
  const output = new Map<string, T[]>();
  for (const row of rows) {
    const id = String(row[key] ?? "");
    if (!id) continue;
    const list = output.get(id) ?? [];
    list.push(row as T);
    output.set(id, list);
  }
  return output;
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

function hasTechnicalScore(bag: Partial<Record<ScoreType, ScoreRow>> | undefined): boolean {
  return Boolean(bag?.momentum || bag?.trend || bag?.volatility);
}

function addTop<T extends { assetId: string }>(
  target: Set<string>,
  rows: T[],
  metric: (row: T) => number,
  count: number,
  descending: boolean,
): void {
  const sorted = [...rows].sort((left, right) =>
    descending ? metric(right) - metric(left) : metric(left) - metric(right),
  );
  for (const row of sorted.slice(0, count)) target.add(row.assetId);
}

function neutralCatalyst(): SwingV2CatalystContext {
  return {
    score: null,
    label: null,
    confidence: 0,
    daysToEarnings: null,
    positiveRevision: false,
    negativeRevision: false,
    reasons: [],
    risks: [],
  };
}

function inferCountry(exchange: string | null): string {
  const value = (exchange ?? "").toUpperCase();
  if (value.includes("LSE") || value.includes("LONDON") || value.includes("XLON")) return "UK";
  if (["NASDAQ", "NYSE", "AMEX", "NYSE AMERICAN", "XNAS", "XNYS", "XASE"].some((token) => value.includes(token))) return "US";
  return "EU";
}

function validBar(bar: SwingBar): boolean {
  return [bar.open, bar.high, bar.low, bar.close].every((value) => Number.isFinite(value) && value > 0) &&
    bar.high >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low <= Math.min(bar.open, bar.close, bar.high);
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(record.message ?? record.details ?? record.code ?? JSON.stringify(record));
  }
  return String(error);
}

function emptyWorkspace(activeEquities: number, warnings: string[]): SwingV2Workspace {
  return {
    asOf: new Date().toISOString().slice(0, 10),
    modelVersion: SWING_V2_MODEL_VERSION,
    shadow: true,
    calibration: {
      status: "shadow_unvalidated",
      note: "Swing v2 is collecting evidence and is not a claimed probability of profit.",
    },
    universe: {
      activeEquities,
      scoreScreened: 0,
      equityDeepScanned: 0,
      commodityDeepScanned: 0,
      surfaced: 0,
      actionable: 0,
      developing: 0,
      eventRisk: 0,
      extended: 0,
      cap: DEEP_SCAN_CAP,
    },
    candidates: [],
    methodology: "No v2 candidates can be evaluated until the managed market-data surface is available.",
    warnings,
  };
}
