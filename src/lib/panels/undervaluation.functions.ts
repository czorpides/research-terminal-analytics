import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, Point, VerifyCheck, Catalyst } from "./contract";
import { detectCatalystsForIndustry } from "@/lib/catalysts/detect.server";

/**
 * Undervaluation Radar — renders the persisted weekly watchlist. The list
 * changes only on refresh, keeping ordering stable across the week.
 *
 * Composite UV score: valuation × 0.5 + quality × 0.3 + trend × 0.2. Entry
 * threshold 70, weak-streak exit at < 55 for two consecutive weeks.
 */
export const getUndervaluationPanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: watch } = await supabaseAdmin
    .from("undervaluation_watchlist")
    .select("asset_id, entry_score, last_score, last_confirmed_at, added_at, weak_streak")
    .is("removed_at", null)
    .order("last_score", { ascending: false });

  if (!watch || watch.length === 0) return placeholder();

  const assetIds = watch.map((w) => w.asset_id as string);
  const [{ data: assets }, { data: rawScores }, { data: prices }] = await Promise.all([
    supabaseAdmin.from("assets").select("id, symbol, name, industry_id").in("id", assetIds),
    supabaseAdmin.from("scores")
      .select("subject_id, score_type, value, positives, deductions, inputs, computed_at")
      .eq("subject_type", "asset").in("subject_id", assetIds)
      .order("computed_at", { ascending: false }).limit(5000),
    supabaseAdmin.from("prices_daily")
      .select("asset_id, trade_date, close")
      .in("asset_id", assetIds).order("trade_date", { ascending: false }).limit(assetIds.length * 3),
  ]);

  const assetById = new Map((assets ?? []).map((a) => [a.id as string, a]));
  const indIds = [...new Set((assets ?? []).map((a) => a.industry_id).filter(Boolean) as string[])];
  const { data: industries } = indIds.length
    ? await supabaseAdmin.from("industries").select("id, code").in("id", indIds)
    : { data: [] as Array<{ id: string; code: string }> };
  const indCodeById = new Map((industries ?? []).map((i) => [i.id as string, i.code as string]));

  const latestScore = new Map<string, Record<string, { value: number; positives: Point[]; deductions: Point[] }>>();
  for (const r of rawScores ?? []) {
    const bag = latestScore.get(r.subject_id as string) ?? {};
    const t = r.score_type as string;
    if (!bag[t]) bag[t] = {
      value: Number(r.value),
      positives: (r.positives as unknown as Point[]) ?? [],
      deductions: (r.deductions as unknown as Point[]) ?? [],
    };
    latestScore.set(r.subject_id as string, bag);
  }

  const priceByAsset = new Map<string, { trade_date: string; close: number }>();
  for (const p of prices ?? []) {
    const id = p.asset_id as string;
    if (!priceByAsset.has(id)) priceByAsset.set(id, { trade_date: p.trade_date as string, close: Number(p.close) });
  }

  return await Promise.all(watch.map(async (w) => {
    const asset = assetById.get(w.asset_id as string);
    if (!asset) return null;
    const bag = latestScore.get(w.asset_id as string) ?? {};
    const indCode = asset.industry_id ? indCodeById.get(asset.industry_id as string) ?? null : null;
    const catalysts = await detectCatalystsForIndustry({ industryCode: indCode });
    const price = priceByAsset.get(w.asset_id as string);
    const symbol = asset.symbol as string;
    const asOf = price ? new Date(`${price.trade_date}T21:00:00Z`).toISOString() : new Date().toISOString();
    const ageSec = (Date.now() - new Date(asOf).getTime()) / 1000;
    const conf = computeConfidence({ tier: "tier2_regulated", category: "price_daily", ageSeconds: ageSec });

    // Positives = everything supporting the undervaluation case (cheap
    // metrics, quality strengths, tailwind catalysts).
    const positives: Point[] = [
      ...(bag["valuation"]?.positives ?? []).map((p) => ({ ...p, id: `val-${p.id}`, label: `Undervalued — ${p.label}` })),
      ...(bag["quality"]?.positives   ?? []).map((p) => ({ ...p, id: `qua-${p.id}`, label: `Quality — ${p.label}` })),
      ...catalysts.filter((c) => c.direction === "tailwind").map((c) => ({
        id: `cat-${c.id}`,
        label: `Tailwind — ${c.headline}`,
        detail: c.reasoning,
      })),
    ];
    // Deductions = risks to the value case (weak trend, quality drags,
    // pressure catalysts).
    const deductions: Point[] = [
      ...(bag["valuation"]?.deductions ?? []).map((p) => ({ ...p, id: `val-${p.id}`, label: `Value risk — ${p.label}` })),
      ...(bag["quality"]?.deductions   ?? []).map((p) => ({ ...p, id: `qua-${p.id}`, label: `Quality drag — ${p.label}` })),
      ...(bag["trend"]?.deductions     ?? []).map((p) => ({ ...p, id: `trn-${p.id}`, label: `Trend risk — ${p.label}` })),
      ...catalysts.filter((c) => c.direction === "pressure").map((c) => ({
        id: `cat-${c.id}`,
        label: `Pressure — ${c.headline}`,
        detail: c.reasoning,
      })),
    ];

    const evidence: Evidence[] = [{
      id: `ev-price-${symbol}`,
      label: `Daily OHLCV — ${symbol}`,
      sourceName: "Equity provider pool",
      tier: "tier2_regulated",
      asOf,
      freshness: freshnessState(ageSec, DEFAULT_FRESHNESS.price_daily),
      agrees: true,
    }];
    for (const c of catalysts) {
      evidence.push({
        id: `ev-${c.id}`,
        label: c.headline,
        sourceName: c.source,
        tier: c.kind === "macro" ? "tier1_official" : c.kind === "commodity" ? "tier2_regulated" : "tier3_reputable",
        asOf: c.asOf,
        freshness: "fresh",
        agrees: c.direction === "tailwind",
      });
    }

    const nowIso = new Date().toISOString();
    const daysOnList = Math.floor((Date.now() - new Date(w.added_at as string).getTime()) / 86_400_000);
    const algoChecks: VerifyCheck[] = [
      { id: "v-conf", label: "Watchlist entry re-confirmed this week", verifier: "algo",
        status: (Date.now() - new Date(w.last_confirmed_at as string).getTime()) < 8 * 86_400_000 ? "pass" : "stale",
        detail: `Last confirmed ${new Date(w.last_confirmed_at as string).toLocaleDateString()}.`,
        checkedAt: nowIso },
      { id: "v-streak", label: "Not in exit hysteresis window", verifier: "algo",
        status: Number(w.weak_streak ?? 0) === 0 ? "pass" : "fail",
        detail: `Weak streak ${w.weak_streak}/2 weeks.`, checkedAt: nowIso },
      { id: "v-catalyst", label: "External catalyst detected", verifier: "algo",
        status: catalysts.length > 0 ? "pass" : "unavailable",
        detail: `${catalysts.length} macro/commodity/alt-data catalysts within lookback.`, checkedAt: nowIso },
    ];
    const verifyNext: VerifyCheck[] = [
      ...algoChecks,
      aiCoherenceCheck(algoChecks, `${positives.length} positives / ${deductions.length} deductions`),
    ];

    const whyBullets = buildWhyBullets("under", {
      symbol,
      bag,
      catalysts,
      lastScore: Number(w.last_score),
      daysOnList,
    });

    const panel: PanelData = {
      id: `uv-${symbol}`,
      title: `${symbol} — ${asset.name as string}`,
      purpose: `On the weekly value watchlist since ${new Date(w.added_at as string).toLocaleDateString()} (${daysOnList}d).`,
      metrics: [
        { label: "UV score", value: Number(w.last_score).toFixed(1), tone: Number(w.last_score) >= 70 ? "positive" : "warning" },
        { label: "Entry score", value: Number(w.entry_score).toFixed(1) },
        { label: "Valuation", value: bag["valuation"] ? bag["valuation"].value.toFixed(0) : "—" },
        { label: "Quality", value: bag["quality"] ? bag["quality"].value.toFixed(0) : "—" },
        { label: "Trend", value: bag["trend"] ? bag["trend"].value.toFixed(0) : "—" },
        { label: "Days on list", value: String(daysOnList) },
      ],
      whatChanged: price ? `Last close ${price.close.toFixed(2)} on ${price.trade_date}. Score ${Number(w.last_score).toFixed(1)}.` : "No recent price data.",
      whyItMatters: catalysts.length > 0
        ? `Cheap on a peer-relative basis with ${catalysts.filter(c => c.direction === "tailwind").length} tailwind and ${catalysts.filter(c => c.direction === "pressure").length} pressure catalysts currently in view.`
        : "Cheap on a peer-relative basis. No external catalysts currently detected in the mapped rule set.",
      whyBullets,
      evidence, positives, deductions, verifyNext, confidence: conf,
      catalysts,
      calculation: {
        formula: "UV = valuation × 0.5 + quality × 0.3 + trend × 0.2",
        ...stampCalculation("undervaluation.watchlist.v0.1", { symbol }),
        inputs: {
          valuation: bag["valuation"]?.value ?? null,
          quality:   bag["quality"]?.value   ?? null,
          trend:     bag["trend"]?.value     ?? null,
          entry_score: Number(w.entry_score),
          last_score:  Number(w.last_score),
        },
      },
    };
    return panel;
  })).then((rows) => rows.filter((r): r is PanelData => r !== null));
});

function placeholder(): PanelData[] {
  return [{
    id: "uv-empty",
    title: "Undervaluation Radar",
    purpose: "Stable weekly watchlist of value candidates — cheap on fundamentals, not falling knives.",
    metrics: [{ label: "On watchlist", value: "0" }],
    whatChanged: "Watchlist is currently empty.",
    whyItMatters: "No assets currently meet the deterministic undervaluation criteria.",
    whyBullets: [
      "No asset scores a UV composite ≥ 60 (valuation × 0.5 + quality × 0.3 + trend × 0.2).",
      "Either the equity universe hasn't been fully scored yet, or the current tape is broadly expensive vs. fundamentals.",
      "Weekly refresh cadence keeps the list stable — new names only enter when they clearly qualify.",
      "Trigger a manual refresh: POST /api/public/radars/undervaluation/refresh.",
    ],
    evidence: [], positives: [],
    deductions: [{ id: "empty", label: "No qualifying assets — universe scored above the entry threshold." }],
    verifyNext: [],
    confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: "Watchlist empty." }] },
  }];
}

/**
 * Deterministic AI cross-check row. Aggregates the algo/api results and
 * marks the AI check pass/fail based on their coherence — no LLM call at
 * render time. The full AI thesis layer will replace `detail` later.
 */
export function aiCoherenceCheck(prior: VerifyCheck[], evidenceSummary: string): VerifyCheck {
  const fails = prior.filter((v) => v.status === "fail").length;
  const passes = prior.filter((v) => v.status === "pass").length;
  const stales = prior.filter((v) => v.status === "stale").length;
  const status: VerifyCheck["status"] =
    fails > 0 ? "fail" : stales > 0 ? "stale" : passes > 0 ? "pass" : "unavailable";
  return {
    id: "v-ai-crosscheck",
    label: "AI: cross-check algo & API results",
    verifier: "ai",
    status,
    detail: `${passes} pass · ${fails} fail · ${stales} stale across upstream checks. ${evidenceSummary}.`,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Build 4–5 forward-looking research bullets for a radar panel. Deterministic:
 * derived from score component bag, current catalysts, and their reasoning.
 */
export function buildWhyBullets(
  kind: "under" | "over",
  ctx: { symbol: string; bag: Record<string, { value: number; positives: Point[]; deductions: Point[] }>; catalysts: Catalyst[]; lastScore?: number; daysOnList?: number },
): string[] {
  const bullets: string[] = [];
  const val = ctx.bag["valuation"]?.value;
  const qua = ctx.bag["quality"]?.value;
  const trn = ctx.bag["trend"]?.value;
  const mom = ctx.bag["momentum"]?.value;
  const vol = ctx.bag["volatility"]?.value;

  if (kind === "under") {
    if (val != null && val >= 60) bullets.push(`Valuation percentile ${val.toFixed(0)}/100 — cheap vs. industry peers on the composite multiple stack.`);
    if (qua != null && qua >= 55) bullets.push(`Quality holding at ${qua.toFixed(0)}/100 — earnings/margin durability supports the value case rather than signalling a trap.`);
    if (trn != null && trn < 45) bullets.push(`Trend still weak (${trn.toFixed(0)}/100) — confirm the price is basing before assuming re-rating has started.`);
  } else {
    if (mom != null && mom < 40) bullets.push(`Momentum fading at ${mom.toFixed(0)}/100 — recent returns are decelerating relative to the universe.`);
    if (trn != null && trn < 40) bullets.push(`Price sitting below trend anchors (trend ${trn.toFixed(0)}/100) — regime has flipped from support to resistance.`);
    if (vol != null && vol > 60) bullets.push(`Volatility regime elevated (${vol.toFixed(0)}/100) — drawdowns amplify each incremental miss.`);
    if (val != null && val < 40) bullets.push(`Rich on valuation (${val.toFixed(0)}/100) — multiple compression risk if growth slows.`);
  }

  const tailwinds = ctx.catalysts.filter((c) => c.direction === "tailwind");
  const pressures = ctx.catalysts.filter((c) => c.direction === "pressure");
  const relevant = kind === "under" ? [...tailwinds, ...pressures] : [...pressures, ...tailwinds];
  for (const c of relevant.slice(0, 2)) {
    const arrow = c.direction === "tailwind" ? "Tailwind" : "Pressure";
    bullets.push(`${arrow} to watch — ${c.headline}. ${c.reasoning}`);
  }

  // Upcoming / trend watch: if no explicit catalyst matched but we have score drift, prompt research
  if (ctx.catalysts.length === 0) {
    bullets.push(
      kind === "under"
        ? "No mapped catalyst yet — track industry-level macro releases and commodity moves that could act as the trigger."
        : "No mapped catalyst yet — watch upcoming earnings and macro releases that could accelerate the decline.",
    );
  } else {
    bullets.push("Cross-reference the catalysts above against upcoming economic releases and earnings — that combination is where re-ratings happen.");
  }

  return bullets.slice(0, 5);
}

/**
 * Weekly refresh — add ≥70, keep, mark weak <55, remove after 2 weak weeks.
 */
export const refreshUndervaluationWatchlist = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: assets } = await supabaseAdmin.from("assets").select("id, symbol").eq("active", true);
  if (!assets || assets.length === 0) return { ok: false, reason: "no assets" };

  const assetIds = assets.map((a) => a.id as string);
  const { data: rawScores } = await supabaseAdmin
    .from("scores")
    .select("subject_id, score_type, value, computed_at")
    .eq("subject_type", "asset").in("subject_id", assetIds)
    .order("computed_at", { ascending: false }).limit(6000);

  const bag = new Map<string, Record<string, number>>();
  for (const r of rawScores ?? []) {
    const b = bag.get(r.subject_id as string) ?? {};
    const t = r.score_type as string;
    if (b[t] == null) b[t] = Number(r.value);
    bag.set(r.subject_id as string, b);
  }

  const uvScore = (s: Record<string, number>): number | null => {
    const v = s["valuation"]; const q = s["quality"]; const t = s["trend"];
    if (v == null && q == null && t == null) return null;
    let sum = 0; let w = 0;
    if (v != null) { sum += v * 0.5; w += 0.5; }
    if (q != null) { sum += q * 0.3; w += 0.3; }
    if (t != null) { sum += t * 0.2; w += 0.2; }
    return w === 0 ? null : sum / w;
  };

  const { data: existing } = await supabaseAdmin
    .from("undervaluation_watchlist")
    .select("id, asset_id, weak_streak")
    .is("removed_at", null);
  const existingByAsset = new Map<string, { id: string; weak_streak: number }>();
  for (const e of existing ?? []) existingByAsset.set(e.asset_id as string, { id: e.id as string, weak_streak: Number(e.weak_streak ?? 0) });

  const now = new Date().toISOString();
  let added = 0, kept = 0, removed = 0;

  for (const a of assets) {
    const s = bag.get(a.id as string);
    const score = s ? uvScore(s) : null;
    const current = existingByAsset.get(a.id as string);
    if (current) {
      if (score == null) continue;
      if (score < 55) {
        const nextStreak = current.weak_streak + 1;
        if (nextStreak >= 2) {
          await supabaseAdmin.from("undervaluation_watchlist").update({
            removed_at: now, exit_reason: `Weak streak ≥2 (score ${score.toFixed(1)})`,
            last_score: score,
          }).eq("id", current.id);
          removed += 1;
        } else {
          await supabaseAdmin.from("undervaluation_watchlist").update({
            weak_streak: nextStreak, last_score: score, last_confirmed_at: now,
          }).eq("id", current.id);
          kept += 1;
        }
      } else {
        await supabaseAdmin.from("undervaluation_watchlist").update({
          weak_streak: 0, last_score: score, last_confirmed_at: now,
        }).eq("id", current.id);
        kept += 1;
      }
    } else {
      if (score == null || score < 70) continue;
      await supabaseAdmin.from("undervaluation_watchlist").insert({
        asset_id: a.id, entry_score: score, last_score: score, added_at: now, last_confirmed_at: now, weak_streak: 0,
      });
      added += 1;
    }
  }

  return { ok: true, added, kept, removed, ranAt: now };
});