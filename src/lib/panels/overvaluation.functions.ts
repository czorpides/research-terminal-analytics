import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck } from "./contract";

interface LatestScore {
  asset_id: string; score_type: string; value: number; confidence: number;
  positives: Point[]; deductions: Point[]; inputs: Record<string, number | string | null>;
}

/**
 * Overvaluation Radar. Symmetric counterpart to Opportunity Radar: same
 * scoring inputs, ranked by weakness. `overvaluation = (100 − momentum + 100 −
 * trend)/2 + (volatility − 50) × 0.1` — high volatility on failing trend/momo
 * amplifies the risk score. No new score types; pure ranking view.
 */
export const getOvervaluationPanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: assets } = await supabaseAdmin.from("assets").select("id, symbol, name").eq("active", true);
  if (!assets || assets.length === 0) return placeholder("No assets in universe yet.");
  const assetIds = assets.map((a) => a.id as string);

  const { data: rawScores } = await supabaseAdmin
    .from("scores")
    .select("subject_id, score_type, value, confidence, positives, deductions, inputs, computed_at")
    .eq("subject_type", "asset").in("subject_id", assetIds)
    .order("computed_at", { ascending: false }).limit(5000);

  if (!rawScores || rawScores.length === 0) {
    return placeholder("No scores computed yet.");
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
      const risk = ((100 - m) + (100 - t)) / 2 + (v - 50) * 0.1;
      return { asset: a, bag, risk };
    })
    .filter((x) => Object.keys(x.bag).length > 0)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 12);

  return ranked.map(({ asset, bag, risk }) => {
    const symbol = asset.symbol as string;
    const price = priceByAsset.get(asset.id as string);
    const asOf = price ? new Date(`${price.trade_date}T21:00:00Z`).toISOString() : new Date().toISOString();
    const ageSec = (Date.now() - new Date(asOf).getTime()) / 1000;
    const conf = computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec });

    const evidence: Evidence[] = [{
      id: `ev-price-${symbol}`,
      label: `Daily OHLCV — ${symbol}`,
      sourceName: "Equity provider pool",
      tier: "tier2_regulated",
      asOf,
      freshness: freshnessState(ageSec, DEFAULT_FRESHNESS.price_daily),
      agrees: true,
    }];

    // Invert the semantics: positives from the score become "risk mitigants"
    // (kept as deductions of the risk case) and deductions become elevated risks.
    const positives: Point[] = [];
    const deductions: Point[] = [];
    for (const t of ["momentum", "trend", "volatility"] as const) {
      const s = bag[t];
      if (!s) continue;
      // deductions from underlying score = reasons the risk is high
      positives.push(...s.deductions.map((p) => ({ ...p, id: `risk-${t}-${p.id}` })));
      // positives from underlying score = reasons the risk case is weaker
      deductions.push(...s.positives.map((p) => ({ ...p, id: `mit-${t}-${p.id}`, label: `Mitigant — ${p.label}` })));
    }

    const nowIso = new Date().toISOString();
    const trendInputs = bag["trend"]?.inputs ?? {};
    const cur = Number(trendInputs["cur"] ?? price?.close ?? 0);
    const ma50 = trendInputs["ma50"] == null ? null : Number(trendInputs["ma50"]);
    const ma200 = trendInputs["ma200"] == null ? null : Number(trendInputs["ma200"]);
    const hi52 = trendInputs["hi52"] == null ? null : Number(trendInputs["hi52"]);

    const verifyNext: VerifyCheck[] = [];
    if (ma50 !== null) verifyNext.push({
      id: "v-ma50-fail", label: "Price below 50-day MA (risk signal)", verifier: "algo",
      status: cur < ma50 ? "pass" : "fail",
      detail: `${cur.toFixed(2)} vs MA50 ${ma50.toFixed(2)}`, checkedAt: nowIso,
    });
    if (ma200 !== null) verifyNext.push({
      id: "v-ma200-fail", label: "Price below 200-day MA (regime shift)", verifier: "algo",
      status: cur < ma200 ? "pass" : "fail",
      detail: `${cur.toFixed(2)} vs MA200 ${ma200.toFixed(2)}`, checkedAt: nowIso,
    });
    if (hi52 !== null) {
      const dist = (cur / hi52 - 1) * 100;
      verifyNext.push({
        id: "v-drawdown", label: "≥15% off 52-week high", verifier: "algo",
        status: dist <= -15 ? "pass" : "fail",
        detail: `${dist.toFixed(1)}% from 52w high`, checkedAt: nowIso,
      });
    }
    verifyNext.push({
      id: "v-fresh", label: "Latest bar within freshness policy", verifier: "algo",
      status: ageSec <= DEFAULT_FRESHNESS.price_daily.maxAgeSeconds ? "pass" : "stale",
      detail: `Age ${(ageSec / 3600).toFixed(1)}h`, checkedAt: nowIso,
    });
    verifyNext.push({
      id: "v-ai-thesis", label: "AI: articulate the overvaluation case", verifier: "ai",
      status: "unavailable", detail: "Lit up once AI commentary layer is wired.",
    });

    return {
      id: `ov-${symbol}`,
      title: `${symbol} — ${asset.name as string}`,
      purpose: "Risk-ranked candidate — weak momentum, broken trend, elevated volatility.",
      metrics: [
        { label: "Risk score", value: risk.toFixed(1), tone: risk > 60 ? "negative" : risk < 40 ? "positive" : "warning" },
        { label: "Momentum", value: bag["momentum"] ? bag["momentum"].value.toFixed(0) : "—" },
        { label: "Trend", value: bag["trend"] ? bag["trend"].value.toFixed(0) : "—" },
        { label: "Vol regime", value: bag["volatility"] ? bag["volatility"].value.toFixed(0) : "—" },
      ],
      whatChanged: price ? `Last close ${price.close.toFixed(2)} on ${price.trade_date}.` : "No price data yet.",
      whyItMatters: "Cross-factor risk score highlights names where the failure case is corroborated across momentum, trend and vol regime — a research prompt, never a short recommendation.",
      evidence, positives, deductions, verifyNext, confidence: conf,
      calculation: {
        formula: "risk = ((100−momentum) + (100−trend))/2 + (volatility − 50) × 0.1",
        ...stampCalculation("overvaluation.risk.v0.1", { symbol, m: bag["momentum"]?.value, t: bag["trend"]?.value, v: bag["volatility"]?.value }),
        inputs: {
          momentum: bag["momentum"]?.value ?? null,
          trend: bag["trend"]?.value ?? null,
          volatility: bag["volatility"]?.value ?? null,
          risk,
        },
      },
    };
  });
});

function placeholder(message: string): PanelData[] {
  return [{
    id: "ov-empty",
    title: "Overvaluation Radar",
    purpose: "Deterministic risk ranking across the equity universe.",
    metrics: [{ label: "Ranked", value: "0" }],
    whatChanged: message,
    whyItMatters: "Ingest prices via /api/public/ingest/stooq, then run /api/public/scores/run.",
    evidence: [], positives: [],
    deductions: [{ id: "empty", label: message }],
    verifyNext: [],
    confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: message }] },
  }];
}