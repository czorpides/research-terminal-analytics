import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck } from "./contract";

interface LatestScore {
  asset_id: string; score_type: string; value: number; confidence: number;
  positives: Point[]; deductions: Point[]; inputs: Record<string, number | string | null>;
}

export const getRadarPanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: assets } = await supabaseAdmin
    .from("assets").select("id, symbol, name").eq("active", true);
  if (!assets || assets.length === 0) return placeholder("No assets in universe yet.");
  const assetIds = assets.map((a) => a.id as string);

  const { data: rawScores } = await supabaseAdmin
    .from("scores")
    .select("subject_id, score_type, value, confidence, positives, deductions, inputs, computed_at")
    .eq("subject_type", "asset").in("subject_id", assetIds)
    .order("computed_at", { ascending: false }).limit(5000);

  if (!rawScores || rawScores.length === 0) {
    return placeholder("No scores computed yet. Trigger /api/public/scores/run once prices are ingested.");
  }

  const latest = new Map<string, LatestScore>();
  for (const r of rawScores) {
    const key = `${r.subject_id}:${r.score_type}`;
    if (!latest.has(key)) {
      latest.set(key, {
        asset_id: r.subject_id as string,
        score_type: r.score_type as string,
        value: Number(r.value),
        confidence: Number(r.confidence),
        positives: (r.positives as unknown as Point[]) ?? [],
        deductions: (r.deductions as unknown as Point[]) ?? [],
        inputs: (r.inputs as unknown as Record<string, number | string | null>) ?? {},
      });
    }
  }

  const byAsset = new Map<string, Record<string, LatestScore>>();
  for (const s of latest.values()) {
    const bag = byAsset.get(s.asset_id) ?? {};
    bag[s.score_type] = s;
    byAsset.set(s.asset_id, bag);
  }

  const { data: stooqSource } = await supabaseAdmin.from("data_sources").select("name").eq("provider_code", "stooq").maybeSingle();
  const stooqName = (stooqSource?.name as string | undefined) ?? "Stooq";

  const { data: latestPrices } = await supabaseAdmin
    .from("prices_daily").select("asset_id, trade_date, close")
    .in("asset_id", assetIds).order("trade_date", { ascending: false }).limit(assetIds.length * 5);
  const priceByAsset = new Map<string, { trade_date: string; close: number }>();
  for (const p of latestPrices ?? []) {
    const id = p.asset_id as string;
    if (!priceByAsset.has(id)) priceByAsset.set(id, { trade_date: p.trade_date as string, close: Number(p.close) });
  }

  const ranked = assets
    .map((a) => {
      const bag = byAsset.get(a.id as string) ?? {};
      const m = bag["momentum"]?.value ?? 50;
      const t = bag["trend"]?.value ?? 50;
      const v = bag["volatility"]?.value ?? 50;
      return { asset: a, bag, composite: (m + t) / 2 + (v - 50) * 0.1 };
    })
    .filter((x) => Object.keys(x.bag).length > 0)
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 12);

  return ranked.map(({ asset, bag, composite }) => {
    const symbol = asset.symbol as string;
    const price = priceByAsset.get(asset.id as string);
    const asOf = price ? new Date(`${price.trade_date}T21:00:00Z`).toISOString() : new Date().toISOString();
    const ageSec = (Date.now() - new Date(asOf).getTime()) / 1000;
    const conf = computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec });

    const evidence: Evidence[] = [{
      id: `ev-price-${symbol}`,
      label: `Daily OHLCV — ${symbol}`,
      sourceName: stooqName,
      tier: "tier2_regulated",
      asOf,
      freshness: freshnessState(ageSec, DEFAULT_FRESHNESS.price_daily),
      agrees: true,
      url: `https://stooq.com/q/?s=${symbol.toLowerCase()}.us`,
    }];

    const positives: Point[] = [];
    const deductions: Point[] = [];
    for (const t of ["momentum", "trend", "volatility"] as const) {
      const s = bag[t];
      if (!s) continue;
      positives.push(...s.positives);
      deductions.push(...s.deductions);
    }

    const nowIso = new Date().toISOString();
    const trendInputs = bag["trend"]?.inputs ?? {};
    const cur = Number(trendInputs["cur"] ?? price?.close ?? 0);
    const ma50 = trendInputs["ma50"] == null ? null : Number(trendInputs["ma50"]);
    const ma200 = trendInputs["ma200"] == null ? null : Number(trendInputs["ma200"]);
    const hi52 = trendInputs["hi52"] == null ? null : Number(trendInputs["hi52"]);

    const verifyNext: VerifyCheck[] = [];
    if (ma50 !== null) verifyNext.push({
      id: "v-ma50", label: "Price above 50-day MA", verifier: "algo",
      status: cur > ma50 ? "pass" : "fail",
      detail: `${cur.toFixed(2)} vs MA50 ${ma50.toFixed(2)}`, checkedAt: nowIso,
    });
    if (ma200 !== null) verifyNext.push({
      id: "v-ma200", label: "Price above 200-day MA", verifier: "algo",
      status: cur > ma200 ? "pass" : "fail",
      detail: `${cur.toFixed(2)} vs MA200 ${ma200.toFixed(2)}`, checkedAt: nowIso,
    });
    if (hi52 !== null) {
      const dist = (cur / hi52 - 1) * 100;
      verifyNext.push({
        id: "v-52w", label: "Within 5% of 52-week high", verifier: "algo",
        status: dist > -5 ? "pass" : "fail",
        detail: `${dist.toFixed(1)}% from 52w high`, checkedAt: nowIso,
      });
    }
    verifyNext.push({
      id: "v-fresh", label: "Latest bar within freshness policy", verifier: "algo",
      status: ageSec <= DEFAULT_FRESHNESS.price_daily.maxAgeSeconds ? "pass" : "stale",
      detail: `Age ${(ageSec / 3600).toFixed(1)}h`, checkedAt: nowIso,
    });
    verifyNext.push({
      id: "v-ai-thesis", label: "AI: narrate why this ranked in the top 12", verifier: "ai",
      status: "unavailable", detail: "Lit up once AI commentary layer is wired.",
    });

    return {
      id: `radar-${symbol}`,
      title: `${symbol} — ${asset.name as string}`,
      purpose: "Ranked research candidate from the deterministic scoring layer (momentum, trend, volatility).",
      metrics: [
        { label: "Composite", value: composite.toFixed(1), tone: composite > 60 ? "positive" : composite < 40 ? "negative" : "neutral" },
        { label: "Momentum", value: bag["momentum"] ? bag["momentum"].value.toFixed(0) : "—" },
        { label: "Trend", value: bag["trend"] ? bag["trend"].value.toFixed(0) : "—" },
        { label: "Vol regime", value: bag["volatility"] ? bag["volatility"].value.toFixed(0) : "—" },
      ],
      whatChanged: price ? `Last close ${price.close.toFixed(2)} on ${price.trade_date}.` : "No price data yet.",
      whyItMatters: "Cross-factor composite highlights names where price action, trend regime and vol backdrop all agree.",
      evidence, positives, deductions, verifyNext, confidence: conf,
      calculation: {
        formula: "composite = (momentum + trend)/2 + (volatility − 50) × 0.1",
        ...stampCalculation("radar.composite.v0.1", { symbol, m: bag["momentum"]?.value, t: bag["trend"]?.value, v: bag["volatility"]?.value }),
        inputs: {
          momentum: bag["momentum"]?.value ?? null,
          trend: bag["trend"]?.value ?? null,
          volatility: bag["volatility"]?.value ?? null,
          composite,
        },
      },
    };
  });
});

function placeholder(message: string): PanelData[] {
  return [{
    id: "radar-empty",
    title: "Opportunity Radar",
    purpose: "Deterministic scoring across the equity universe.",
    metrics: [{ label: "Assets scored", value: "0" }],
    whatChanged: message,
    whyItMatters: "Ingest prices via /api/public/ingest/stooq, then run /api/public/scores/run.",
    evidence: [], positives: [],
    deductions: [{ id: "empty", label: message }],
    verifyNext: [],
    confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: message }] },
  }];
}