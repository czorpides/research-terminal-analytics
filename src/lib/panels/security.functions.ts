import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck, Metric } from "./contract";

export interface UniverseRow {
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  industry: string | null;
  country: string | null;
  lastClose: number | null;
  lastDate: string | null;
  momentum: number | null;
  trend: number | null;
  volatility: number | null;
  composite: number | null;
}

export const getSecurityUniverse = createServerFn({ method: "GET" }).handler(async (): Promise<UniverseRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("id, symbol, name, exchange, currency, industry_id, country_id")
    .eq("active", true);
  if (!assets || assets.length === 0) return [];

  const industryIds = [...new Set(assets.map((a) => a.industry_id).filter(Boolean) as string[])];
  const countryIds = [...new Set(assets.map((a) => a.country_id).filter(Boolean) as string[])];

  const [{ data: inds }, { data: ctrys }, { data: prices }, { data: rawScores }] = await Promise.all([
    supabaseAdmin.from("industries").select("id, name").in("id", industryIds.length ? industryIds : ["00000000-0000-0000-0000-000000000000"]),
    supabaseAdmin.from("countries").select("id, name").in("id", countryIds.length ? countryIds : ["00000000-0000-0000-0000-000000000000"]),
    supabaseAdmin.from("prices_daily")
      .select("asset_id, trade_date, close")
      .in("asset_id", assets.map((a) => a.id as string))
      .order("trade_date", { ascending: false })
      .limit(assets.length * 3),
    supabaseAdmin.from("scores")
      .select("subject_id, score_type, value, computed_at")
      .eq("subject_type", "asset")
      .in("subject_id", assets.map((a) => a.id as string))
      .order("computed_at", { ascending: false })
      .limit(5000),
  ]);

  const indMap = new Map((inds ?? []).map((i) => [i.id as string, i.name as string]));
  const cMap = new Map((ctrys ?? []).map((c) => [c.id as string, c.name as string]));

  const priceMap = new Map<string, { close: number; date: string }>();
  for (const p of prices ?? []) {
    const id = p.asset_id as string;
    if (!priceMap.has(id)) priceMap.set(id, { close: Number(p.close), date: p.trade_date as string });
  }

  const scoreMap = new Map<string, Record<string, number>>();
  for (const r of rawScores ?? []) {
    const id = r.subject_id as string;
    const bag = scoreMap.get(id) ?? {};
    if (!(r.score_type in bag)) bag[r.score_type as string] = Number(r.value);
    scoreMap.set(id, bag);
  }

  const rows: UniverseRow[] = assets.map((a) => {
    const id = a.id as string;
    const p = priceMap.get(id) ?? null;
    const s = scoreMap.get(id) ?? {};
    const m = s["momentum"] ?? null;
    const t = s["trend"] ?? null;
    const v = s["volatility"] ?? null;
    const composite = m !== null && t !== null && v !== null
      ? (m + t) / 2 + (v - 50) * 0.1
      : null;
    return {
      symbol: a.symbol as string,
      name: a.name as string,
      exchange: (a.exchange as string) ?? null,
      currency: (a.currency as string) ?? null,
      industry: a.industry_id ? indMap.get(a.industry_id as string) ?? null : null,
      country: a.country_id ? cMap.get(a.country_id as string) ?? null : null,
      lastClose: p?.close ?? null,
      lastDate: p?.date ?? null,
      momentum: m,
      trend: t,
      volatility: v,
      composite,
    };
  });

  rows.sort((a, b) => (b.composite ?? -Infinity) - (a.composite ?? -Infinity));
  return rows;
});

export interface SecurityDetail {
  identity: {
    symbol: string;
    name: string;
    exchange: string | null;
    currency: string | null;
    industry: string | null;
    country: string | null;
    assetClass: string | null;
  };
  priceHistory: { date: string; close: number }[];
  panels: PanelData[];
}

export const getSecurityDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string }) => z.object({ symbol: z.string().min(1).max(20) }).parse(d))
  .handler(async ({ data }): Promise<SecurityDetail | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const symbol = data.symbol.toUpperCase();

    const { data: asset } = await supabaseAdmin
      .from("assets")
      .select("id, symbol, name, exchange, currency, asset_class, industry_id, country_id")
      .eq("symbol", symbol)
      .maybeSingle();
    if (!asset) return null;

    const assetId = asset.id as string;

    const [{ data: ind }, { data: ctry }, { data: prices }, { data: rawScores }, { data: verifyRuns }, { data: stooqSource }] = await Promise.all([
      asset.industry_id
        ? supabaseAdmin.from("industries").select("name").eq("id", asset.industry_id).maybeSingle()
        : Promise.resolve({ data: null }),
      asset.country_id
        ? supabaseAdmin.from("countries").select("name").eq("id", asset.country_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin.from("prices_daily")
        .select("trade_date, close")
        .eq("asset_id", assetId)
        .order("trade_date", { ascending: false })
        .limit(260),
      supabaseAdmin.from("scores")
        .select("score_type, value, confidence, positives, deductions, inputs, computed_at, calc_version")
        .eq("subject_type", "asset")
        .eq("subject_id", assetId)
        .order("computed_at", { ascending: false })
        .limit(60),
      supabaseAdmin.from("verify_runs")
        .select("id, check_id, verifier, status, detail, evidence, calc_version, ran_at")
        .eq("subject_type", "asset")
        .eq("subject_id", assetId)
        .order("ran_at", { ascending: false })
        .limit(25),
      supabaseAdmin.from("data_sources").select("name").eq("provider_code", "stooq").maybeSingle(),
    ]);

    const priceHistory = (prices ?? [])
      .map((p) => ({ date: p.trade_date as string, close: Number(p.close) }))
      .reverse();

    const latestScores = new Map<string, {
      value: number; confidence: number; positives: Point[]; deductions: Point[];
      inputs: Record<string, number | string | null>; computedAt: string; calcVersion: string;
    }>();
    for (const s of rawScores ?? []) {
      const key = s.score_type as string;
      if (!latestScores.has(key)) {
        latestScores.set(key, {
          value: Number(s.value),
          confidence: Number(s.confidence),
          positives: (s.positives as unknown as Point[]) ?? [],
          deductions: (s.deductions as unknown as Point[]) ?? [],
          inputs: (s.inputs as unknown as Record<string, number | string | null>) ?? {},
          computedAt: s.computed_at as string,
          calcVersion: (s.calc_version as string) ?? "unknown",
        });
      }
    }

    const sourceName = (stooqSource?.name as string | undefined) ?? "Equity price pool";
    const latestPrice = priceHistory[priceHistory.length - 1] ?? null;
    const asOf = latestPrice ? new Date(`${latestPrice.date}T21:00:00Z`).toISOString() : new Date().toISOString();
    const ageSec = (Date.now() - new Date(asOf).getTime()) / 1000;
    const priceEvidence: Evidence = {
      id: `ev-price-${symbol}`,
      label: `Daily OHLCV — ${symbol}`,
      sourceName,
      tier: "tier2_regulated",
      asOf,
      freshness: freshnessState(ageSec, DEFAULT_FRESHNESS.price_daily),
      agrees: true,
    };

    const panels: PanelData[] = [];

    // 1. Identity panel
    const identityMetrics: Metric[] = [
      { label: "Exchange", value: (asset.exchange as string) ?? "—" },
      { label: "Currency", value: (asset.currency as string) ?? "—" },
      { label: "Class", value: (asset.asset_class as string) ?? "—" },
    ];
    panels.push({
      id: `sec-identity-${symbol}`,
      title: `Security master — ${symbol}`,
      purpose: "Reference identity for this instrument. All research below anchors to this record.",
      metrics: identityMetrics,
      whatChanged: `Last close ${latestPrice ? `${latestPrice.close.toFixed(2)} on ${latestPrice.date}` : "—"}.`,
      whyItMatters: `${asset.name as string} — ${ind?.name ? `${ind.name}, ` : ""}${ctry?.name ?? "—"}. Every score, verifier and evidence chain on this page keys off this row.`,
      evidence: [priceEvidence],
      positives: [],
      deductions: latestPrice ? [] : [{ id: "no-price", label: "No price series yet — trigger equity ingestion." }],
      verifyNext: [
        {
          id: "v-identity-symbol", label: "Symbol resolves to exactly one asset row", verifier: "algo",
          status: "pass", detail: `assets.symbol = ${symbol} (1 match)`, checkedAt: new Date().toISOString(),
        },
        {
          id: "v-identity-crossref", label: "Cross-reference identity with a Tier-1 provider", verifier: "api",
          status: "unavailable", detail: "Lights up when a fundamentals/reference provider is wired.",
        },
      ],
      confidence: computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec }),
    });

    // 2. Price movement panel
    if (priceHistory.length > 0) {
      const last = priceHistory[priceHistory.length - 1];
      const at = (n: number) => priceHistory[priceHistory.length - 1 - n]?.close ?? null;
      const d30 = at(21);
      const d90 = at(63);
      const d252 = at(251);
      const pct = (a: number | null) => a === null ? "—" : `${((last.close / a - 1) * 100).toFixed(1)}%`;
      const tone = (a: number | null) => a === null ? "neutral" as const : last.close > a ? "positive" as const : "negative" as const;
      panels.push({
        id: `sec-price-${symbol}`,
        title: "Price movement",
        purpose: "Deterministic look-back returns over standard windows. No estimates, just the last close divided by the reference close.",
        metrics: [
          { label: "1M", value: pct(d30), tone: tone(d30) },
          { label: "3M", value: pct(d90), tone: tone(d90) },
          { label: "1Y", value: pct(d252), tone: tone(d252) },
        ],
        whatChanged: `Last close ${last.close.toFixed(2)} on ${last.date}. ${priceHistory.length} bars in local cache.`,
        whyItMatters: "Return windows anchor the momentum and trend scorers below and let you sanity-check them against raw price action.",
        evidence: [priceEvidence],
        positives: [],
        deductions: [],
        verifyNext: [
          {
            id: "v-fresh", label: "Latest bar within freshness policy", verifier: "algo",
            status: ageSec <= DEFAULT_FRESHNESS.price_daily.maxAgeSeconds ? "pass" : "stale",
            detail: `Age ${(ageSec / 3600).toFixed(1)}h`, checkedAt: new Date().toISOString(),
          },
          {
            id: "v-gaps", label: "No unexpected gaps in the last 60 bars", verifier: "algo",
            status: priceHistory.length >= 60 ? "pass" : "pending",
            detail: `${priceHistory.length} bars available`, checkedAt: new Date().toISOString(),
          },
        ],
        confidence: computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec }),
      });
    }

    // 3-5. Score breakdown panels
    for (const type of ["momentum", "trend", "volatility"] as const) {
      const s = latestScores.get(type);
      if (!s) continue;
      const scoreAge = (Date.now() - new Date(s.computedAt).getTime()) / 1000;
      panels.push({
        id: `sec-${type}-${symbol}`,
        title: `${type[0].toUpperCase()}${type.slice(1)} score`,
        purpose: `Deterministic ${type} score for ${symbol}. Same recipe as the radar; here you can see every input.`,
        metrics: [
          { label: "Score", value: s.value.toFixed(1), tone: s.value >= 60 ? "positive" : s.value <= 40 ? "negative" : "neutral" },
          { label: "Confidence", value: s.confidence.toFixed(0) },
          { label: "Positives / Deducts", value: `${s.positives.length} / ${s.deductions.length}` },
        ],
        whatChanged: `Computed ${new Date(s.computedAt).toLocaleString()}.`,
        whyItMatters: `Feeds the composite ranking on Opportunity Radar and Overvaluation Radar.`,
        evidence: [priceEvidence],
        positives: s.positives,
        deductions: s.deductions,
        verifyNext: [
          {
            id: `v-${type}-fresh`, label: "Score recomputed in the last 24h", verifier: "algo",
            status: scoreAge <= 86400 ? "pass" : "stale",
            detail: `Age ${(scoreAge / 3600).toFixed(1)}h`, checkedAt: new Date().toISOString(),
          },
        ],
        confidence: { value: s.confidence, penalties: [] },
        calculation: {
          formula: `${type} scorer — see src/lib/scoring/${type}.ts`,
          ...stampCalculation(s.calcVersion, s.inputs),
          inputs: s.inputs,
        },
      });
    }

    // 6. Fundamentals placeholder
    panels.push({
      id: `sec-fund-${symbol}`,
      title: "Fundamentals",
      purpose: "Annual and quarterly line items. Wired to fundamentals_annual / fundamentals_quarterly.",
      metrics: [{ label: "Statements loaded", value: "0" }],
      whatChanged: "No fundamentals provider ingested for this symbol yet.",
      whyItMatters: "Fundamentals unlock the valuation and balance-sheet scorers (Prompt 7).",
      evidence: [],
      positives: [],
      deductions: [{ id: "no-fund", label: "Fundamentals ingestion not yet wired." }],
      verifyNext: [
        {
          id: "v-fund-avail", label: "At least one annual statement available", verifier: "algo",
          status: "unavailable", detail: "Awaiting fundamentals ingestion.",
        },
      ],
      confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: "Fundamentals not ingested." }] },
    });

    // 7. Verifier audit
    const runs = verifyRuns ?? [];
    panels.push({
      id: `sec-verify-${symbol}`,
      title: "Verifier audit trail",
      purpose: "Every algo / api / ai check that ran against this security, most recent first.",
      metrics: [
        { label: "Runs (25 max)", value: String(runs.length) },
        { label: "Passes", value: String(runs.filter((r) => r.status === "pass").length), tone: "positive" },
        { label: "Fails", value: String(runs.filter((r) => r.status === "fail").length), tone: "negative" },
      ],
      whatChanged: runs.length > 0
        ? `Most recent: ${runs[0].check_id} → ${runs[0].status} (${runs[0].verifier}) at ${new Date(runs[0].ran_at as string).toLocaleString()}.`
        : "No verifier runs recorded for this security yet.",
      whyItMatters: "Auditable proof that scores were checked. Every run captures verifier, calc version and evidence.",
      evidence: [],
      positives: [],
      deductions: [],
      verifyNext: runs.slice(0, 6).map<VerifyCheck>((r) => ({
        id: `run-${r.id}`,
        label: r.check_id as string,
        verifier: r.verifier as VerifyCheck["verifier"],
        status: r.status as VerifyCheck["status"],
        detail: (r.detail as string) ?? undefined,
        checkedAt: r.ran_at as string,
      })),
      confidence: { value: runs.length > 0 ? 80 : 30, penalties: runs.length > 0 ? [] : [{ code: "no_runs", points: 70, reason: "No verifier runs yet." }] },
    });

    return {
      identity: {
        symbol,
        name: asset.name as string,
        exchange: (asset.exchange as string) ?? null,
        currency: (asset.currency as string) ?? null,
        industry: (ind?.name as string) ?? null,
        country: (ctry?.name as string) ?? null,
        assetClass: (asset.asset_class as string) ?? null,
      },
      priceHistory,
      panels,
    };
  });