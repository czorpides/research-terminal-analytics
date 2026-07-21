import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck } from "./contract";
import { riskScore } from "@/lib/scoring/composite";
import { detectCatalystsForIndustry } from "@/lib/catalysts/detect.server";
import { aiCoherenceCheck, buildWhyBullets } from "./undervaluation.functions";
import { historicalParallelBullet } from "@/lib/history/match.server";

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
  const { data: assetsWithInd } = await supabaseAdmin
    .from("assets").select("id, industry_id").in("id", assetIds);
  const indIdByAsset = new Map<string, string | null>();
  for (const a of assetsWithInd ?? []) indIdByAsset.set(a.id as string, (a.industry_id as string | null) ?? null);
  const indIds = [...new Set([...indIdByAsset.values()].filter(Boolean) as string[])];
  const { data: industries } = indIds.length
    ? await supabaseAdmin.from("industries").select("id, code").in("id", indIds)
    : { data: [] as Array<{ id: string; code: string }> };
  const indCodeById = new Map((industries ?? []).map((i) => [i.id as string, i.code as string]));

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
      const r = riskScore({
        momentum:   bag["momentum"]?.value   ?? null,
        trend:      bag["trend"]?.value      ?? null,
        volatility: bag["volatility"]?.value ?? null,
        valuation:  bag["valuation"]?.value  ?? null,
        quality:    bag["quality"]?.value    ?? null,
      });
      return { asset: a, bag, risk: r.value ?? -Infinity, components: r.components };
    })
    .filter((x) => Object.keys(x.bag).length > 0)
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 12);

  return await Promise.all(ranked.map(async ({ asset, bag, risk, components }) => {
    const symbol = asset.symbol as string;
    const price = priceByAsset.get(asset.id as string);
    const asOf = price ? new Date(`${price.trade_date}T21:00:00Z`).toISOString() : new Date().toISOString();
    const ageSec = (Date.now() - new Date(asOf).getTime()) / 1000;
    const conf = computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec });

    const indId = indIdByAsset.get(asset.id as string) ?? null;
    const indCode = indId ? indCodeById.get(indId) ?? null : null;
    const catalysts = await detectCatalystsForIndustry({ industryCode: indCode });

    const evidence: Evidence[] = [{
      id: `ev-price-${symbol}`,
      label: `Daily OHLCV — ${symbol}`,
      sourceName: "Equity provider pool",
      tier: "tier2_regulated",
      asOf,
      freshness: freshnessState(ageSec, DEFAULT_FRESHNESS.price_daily),
      agrees: true,
    }];

    // Semantics for Overvaluation:
    //   Deductions = things pulling the name DOWN (decline drivers, pressure
    //     catalysts, weak factors) — these are the "bad" signals.
    //   Positives  = mitigants — factors that argue AGAINST the decline case.
    // This mirrors the Undervaluation panel so users read positives/deductions
    // consistently: positives = "supports the panel thesis being wrong",
    // deductions = "supports the panel thesis being right".
    const positives: Point[] = [];
    const deductions: Point[] = [];
    for (const t of ["momentum", "trend", "volatility", "valuation", "quality"] as const) {
      const s = bag[t];
      if (!s) continue;
      // Score deductions on the underlying factor → decline drivers
      deductions.push(...s.deductions.map((p) => ({
        ...p, id: `risk-${t}-${p.id}`, label: `${t[0].toUpperCase()}${t.slice(1)} risk — ${p.label}`,
      })));
      // Score positives on the underlying factor → mitigants against decline
      positives.push(...s.positives.map((p) => ({
        ...p, id: `mit-${t}-${p.id}`, label: `Mitigant — ${p.label}`,
      })));
    }
    for (const c of catalysts) {
      if (c.direction === "pressure") {
        deductions.push({ id: `cat-${c.id}`, label: `Pressure — ${c.headline}`, detail: c.reasoning });
      } else {
        positives.push({ id: `cat-${c.id}`, label: `Tailwind (mitigant) — ${c.headline}`, detail: c.reasoning });
      }
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
    verifyNext.push(aiCoherenceCheck(verifyNext, `${positives.length} mitigants / ${deductions.length} decline drivers`));

    const whyBullets = buildWhyBullets("over", { symbol, bag, catalysts });
    if (indCode) {
      const parallel = await historicalParallelBullet("sector", indCode, "over");
      if (parallel) whyBullets.push(parallel);
    }

    return {
      id: `ov-${symbol}`,
      title: `${symbol} — ${asset.name as string}`,
      purpose: "Risk-ranked candidate — weak momentum, broken trend, elevated volatility.",
      metrics: [
        { label: "Risk score", value: risk.toFixed(1), tone: risk > 60 ? "negative" : risk < 40 ? "positive" : "warning" },
        { label: "Momentum", value: bag["momentum"] ? bag["momentum"].value.toFixed(0) : "—" },
        { label: "Trend", value: bag["trend"] ? bag["trend"].value.toFixed(0) : "—" },
        { label: "Vol regime", value: bag["volatility"] ? bag["volatility"].value.toFixed(0) : "—" },
        { label: "Valuation", value: bag["valuation"] ? bag["valuation"].value.toFixed(0) : "—" },
        { label: "Quality", value: bag["quality"] ? bag["quality"].value.toFixed(0) : "—" },
      ],
      whatChanged: price ? `Last close ${price.close.toFixed(2)} on ${price.trade_date}.` : "No price data yet.",
      whyItMatters: "Cross-factor risk score highlights names where the failure case is corroborated across momentum, trend and vol regime — a research prompt, never a short recommendation.",
      whyBullets,
      evidence, positives, deductions, verifyNext, confidence: conf,
      catalysts,
      calculation: {
        formula: "risk = weighted average of (100 − score) over available components",
        ...stampCalculation("overvaluation.risk.v0.2", { symbol, components }),
        inputs: {
          momentum: bag["momentum"]?.value ?? null,
          trend: bag["trend"]?.value ?? null,
          volatility: bag["volatility"]?.value ?? null,
          valuation: bag["valuation"]?.value ?? null,
          quality: bag["quality"]?.value ?? null,
          risk,
        },
      },
    };
  }));
});

function placeholder(message: string): PanelData[] {
  return [{
    id: "ov-empty",
    title: "Overvaluation Radar",
    purpose: "Deterministic risk ranking across the equity universe.",
    metrics: [{ label: "Ranked", value: "0" }],
    whatChanged: message,
    whyItMatters: "No assets currently carry enough downside evidence to rank.",
    whyBullets: [
      "No composite risk score could be computed — the universe likely hasn't been scored yet.",
      "Overvaluation is a symmetric read of Momentum + Trend + Volatility + Valuation — if none of those are computed, nothing ranks.",
      "Ingest prices via POST /api/public/ingest/stooq, then compute scores via POST /api/public/scores/run.",
      "Once scored, names with weak momentum, broken trend and elevated volatility will surface here automatically.",
    ],
    evidence: [], positives: [],
    deductions: [{ id: "empty", label: message }],
    verifyNext: [],
    confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: message }] },
  }];
}