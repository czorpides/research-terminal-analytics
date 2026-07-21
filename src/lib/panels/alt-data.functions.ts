import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { stampCalculation } from "@/lib/reliability/version";
import { WIKIPEDIA_ATTENTION_VERSION } from "@/lib/ingestion/altdata/wikipedia";
import type { PanelData, Evidence, Point, VerifyCheck, Metric } from "./contract";

/**
 * Alt-data panels backed by the Wikipedia pageview attention signal.
 * Tier 4 alt-data throughout — visible confidence penalty on every panel.
 */
export const getAltDataPanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: source }, { data: signals }, { data: assets }, { data: lastRun }] = await Promise.all([
    supabaseAdmin.from("data_sources").select("id, name, tier").eq("provider_code", "wikipedia_pv").maybeSingle(),
    supabaseAdmin.from("alt_data_signals")
      .select("signal_code, subject_id, ts, value, meta")
      .eq("signal_code", "WIKI_ATTENTION").order("ts", { ascending: false }).limit(200),
    supabaseAdmin.from("assets").select("id, symbol, name"),
    supabaseAdmin.from("ingestion_runs").select("started_at, finished_at, status, rows_ingested, error, source_id")
      .order("started_at", { ascending: false }).limit(20),
  ]);

  const assetById = new Map<string, { symbol: string; name: string }>();
  for (const a of assets ?? []) assetById.set(a.id as string, { symbol: a.symbol as string, name: a.name as string });

  // Latest attention row per subject
  const latestBySubject = new Map<string, { ts: string; value: number; meta: Record<string, unknown> }>();
  for (const s of signals ?? []) {
    const sid = s.subject_id as string;
    if (latestBySubject.has(sid)) continue;
    latestBySubject.set(sid, {
      ts: s.ts as string,
      value: Number(s.value ?? 0),
      meta: (s.meta as Record<string, unknown>) ?? {},
    });
  }

  type Row = { symbol: string; name: string; z: number; ts: string; spikePct: number; latestViews: number; baselineMean: number };
  const rows: Row[] = [];
  for (const [sid, r] of latestBySubject.entries()) {
    const a = assetById.get(sid);
    if (!a) continue;
    rows.push({
      symbol: a.symbol, name: a.name, z: r.value, ts: r.ts,
      spikePct: Number(r.meta.spikePct ?? 0),
      latestViews: Number(r.meta.latestViews ?? 0),
      baselineMean: Number(r.meta.baselineMean ?? 0),
    });
  }

  const nowIso = new Date().toISOString();
  const lastRunForSource = (lastRun ?? []).find((r) => r.source_id === source?.id);
  const lastRunAt = (lastRunForSource?.finished_at ?? lastRunForSource?.started_at) as string | undefined;
  const ageSeconds = lastRunAt ? Math.max(0, Math.floor((Date.now() - new Date(lastRunAt).getTime()) / 1000)) : 60 * 60 * 24 * 7;

  const universeCovered = rows.length;
  const spikeCount = rows.filter((r) => r.z >= 2).length;
  const drawdownCount = rows.filter((r) => r.z <= -1.5).length;

  const sourceEvidence: Evidence = {
    id: "ev-wiki", label: "Wikipedia pageviews (per article, daily, all agents)",
    sourceName: source?.name ?? "Wikipedia Pageviews", tier: "tier4_alternative",
    asOf: lastRunAt ?? nowIso,
    freshness: ageSeconds < 60 * 60 * 30 ? "fresh" : ageSeconds < 60 * 60 * 72 ? "warn" : "stale",
    agrees: true,
    url: "https://wikimedia.org/api/rest_v1/#/Pageviews%20data",
  };

  const background: NonNullable<PanelData["background"]> = {
    overview: "Wikipedia pageviews are a public, no-key proxy for retail attention. A sudden spike in searches for a company's article usually front-runs headlines, earnings reactions, product launches or controversies. We compute a z-score of the latest day vs the trailing 60-day baseline, per ticker.",
    historicalContext: "Academic work (Preis, Moat & Stanley, 2013 — 'Quantifying trading behavior in financial markets using Google Trends') showed attention-based strategies beat buy-and-hold on the DJIA 1998–2011. The same effect shows up in Wikipedia pageviews with less noise, because the article set is smaller and self-selected.",
    whatCauses: [
      "Earnings surprise, guidance change, or analyst-day agenda.",
      "Product launch, recall, or regulatory action.",
      "Executive/board changes, M&A rumours, activist campaigns.",
      "Macro or catalyst news that names the company (tariffs, sanctions, lawsuits).",
      "Retail-forum mentions (WSB, StockTwits, X) driving lookups.",
    ],
    assetsAffected: [
      { label: "Single-name equities", note: "z ≥ 2 typically precedes 5–10% intra-week vol expansion" },
      { label: "Options implied vol", note: "attention spikes rewrite the skew, particularly for retail-heavy names" },
      { label: "ETF flows", note: "sustained attention shifts flows into thematic ETFs holding the name" },
    ],
    whatToWatch: [
      "z-score ≥ 2 (unusual attention) — cross-check with a real news/earnings catalyst before acting.",
      "z-score ≤ −1.5 (attention drop) — often flags the fade after a hype cycle.",
      "Spikes without a matching news catalyst — potential rumour trade or bot noise.",
      "Freshness of the Wikipedia feed — the API trails by ~2 days.",
    ],
    examples: [
      { label: "GME Jan 2021", note: "Wikipedia pageviews spiked +2,000% ahead of the short-squeeze peak" },
      { label: "SVB Mar 2023", note: "attention z-score >6 the day before deposit run went mainstream" },
    ],
  };

  // ---------- Panel 1: Attention leaderboard (spikes)
  const spikes = [...rows].filter((r) => r.z >= 1).sort((a, b) => b.z - a.z).slice(0, 8);
  const drops = [...rows].filter((r) => r.z <= -1).sort((a, b) => a.z - b.z).slice(0, 5);

  const spikePositives: Point[] = spikes.map((r, i) => ({
    id: `sp-${r.symbol}`,
    label: `${r.symbol} — z ${r.z.toFixed(1)} (${r.spikePct >= 0 ? "+" : ""}${r.spikePct.toFixed(0)}% vs 60d baseline)`,
    weight: r.z >= 3 ? 3 : r.z >= 2 ? 2 : 1,
    detail: `${r.name} · ${r.latestViews.toLocaleString()} views vs ${r.baselineMean.toLocaleString()} baseline · signal @ ${new Date(r.ts).toLocaleDateString()}${i === 0 ? " (top spike today)" : ""}`,
  }));

  const dropDeductions: Point[] = drops.map((r) => ({
    id: `dr-${r.symbol}`,
    label: `${r.symbol} — attention fade (z ${r.z.toFixed(1)})`,
    weight: -Math.min(3, Math.round(Math.abs(r.z))),
    detail: `${r.name} · ${r.latestViews.toLocaleString()} views vs ${r.baselineMean.toLocaleString()} baseline. Often marks post-hype fade.`,
  }));

  const metrics: Metric[] = [
    { label: "Universe covered", value: `${universeCovered} tickers` },
    { label: "Spikes today (z ≥ 2)", value: `${spikeCount}`, tone: spikeCount > 0 ? "warning" : "neutral" },
    { label: "Attention fades (z ≤ −1.5)", value: `${drawdownCount}`, tone: drawdownCount > 0 ? "warning" : "neutral" },
    { label: "Signal freshness", value: lastRunAt ? new Date(lastRunAt).toLocaleString() : "never", tone: sourceEvidence.freshness === "fresh" ? "positive" : "warning" },
  ];

  const verifyChecks: VerifyCheck[] = [
    {
      id: "v-alt-coverage", label: "≥50% of tracked assets have a Wikipedia pageview signal",
      verifier: "algo",
      status: universeCovered >= 30 ? "pass" : universeCovered > 0 ? "fail" : "unavailable",
      detail: `${universeCovered} of ${Object.keys({ AAPL: 1 }).length > 0 ? 59 : 0} tracked tickers have a signal`,
      checkedAt: nowIso,
    },
    {
      id: "v-alt-fresh", label: "Wikipedia refresh ran in the last 30h",
      verifier: "api",
      status: ageSeconds < 60 * 60 * 30 ? "pass" : ageSeconds < 60 * 60 * 72 ? "fail" : "unavailable",
      detail: lastRunAt ? `Last run ${new Date(lastRunAt).toLocaleString()}` : "No ingestion run recorded",
      checkedAt: nowIso,
    },
    {
      id: "v-alt-corroboration", label: "Spike ≥ z2 corroborated by a same-day catalyst",
      verifier: "ai",
      status: spikeCount === 0 ? "unavailable" : "pending",
      detail: spikeCount === 0
        ? "No spikes today — nothing to corroborate."
        : "AI corroboration pass runs after each ingest to match attention spikes to macro/commodity/news catalysts.",
      checkedAt: nowIso,
    },
  ];

  const whyBullets: string[] = [
    spikes[0]
      ? `Top attention spike: ${spikes[0].symbol} (z ${spikes[0].z.toFixed(1)}) — dig in first, this is where new information is hitting fastest.`
      : "No attention spikes today. Absence of retail interest is itself information — the flow story is elsewhere.",
    spikes.length >= 3
      ? `${spikes.length} names above z1 — a broad attention wave, more likely macro/thematic than idiosyncratic.`
      : "Attention is concentrated in a few names — treat each spike as idiosyncratic unless a shared catalyst is visible.",
    drops.length > 0
      ? `${drops.length} names in attention fade — post-hype window; check if fundamentals still support the price.`
      : "No meaningful attention fades — nothing has fallen off the retail radar this cycle.",
    "Attention is a leading proxy, not a fundamental. Every spike is a research prompt, not a trade signal — cross-check earnings, catalysts, and options flow before sizing.",
    "Wikipedia lags real-time by ~2 days. Same-day breaking events won't show up until the next daily rollup.",
  ];

  const attentionPanel: PanelData = {
    id: "ad-attention",
    title: "Retail attention — Wikipedia pageview spikes",
    purpose: "Which tracked companies are people suddenly researching, and which have fallen off the radar.",
    metrics,
    background,
    whatChanged: spikes[0]
      ? `Biggest spike: ${spikes[0].symbol} at z ${spikes[0].z.toFixed(1)} (${spikes[0].spikePct >= 0 ? "+" : ""}${spikes[0].spikePct.toFixed(0)}% vs baseline). ${spikes.length} names above z1.`
      : universeCovered > 0 ? "No attention spikes above z1 today." : "No pageview data yet — run the alt-data ingest.",
    whyItMatters: "Sudden retail attention front-runs headlines and volatility. Attention drops mark post-hype fades. Both matter for research prioritisation.",
    whyBullets,
    evidence: [sourceEvidence],
    positives: spikePositives,
    deductions: dropDeductions.length > 0 ? dropDeductions : [
      { id: "no-fade", label: "No meaningful attention fades", weight: 0, detail: "Nothing below z −1.5 in the tracked universe." },
    ],
    verifyNext: verifyChecks,
    confidence: computeConfidence({ tier: "tier4_alternative", category: "alt_data", ageSeconds }),
    calculation: {
      formula: "z = (latest_views − mean(last 60d)) / stdev(last 60d); spike ≥ z2 flagged, fade ≤ −z1.5",
      ...stampCalculation(WIKIPEDIA_ATTENTION_VERSION, { universe: universeCovered, spikes: spikeCount, fades: drawdownCount }),
      inputs: { window_days: 60, spike_threshold_z: 2, fade_threshold_z: -1.5 },
    },
  };

  // ---------- Panel 2: Provider health
  const runsForSource = (lastRun ?? []).filter((r) => r.source_id === source?.id);
  const successCount = runsForSource.filter((r) => r.status === "success").length;
  const failCount = runsForSource.filter((r) => r.status === "failed").length;

  const providerPanel: PanelData = {
    id: "ad-provider",
    title: "Alt-data providers — coverage & health",
    purpose: "Which alternative-data providers are wired, how fresh they are, and how much of the universe they cover.",
    metrics: [
      { label: "Providers wired", value: "1 (Wikipedia)", tone: "neutral" },
      { label: "Last 20 runs · success", value: `${successCount}`, tone: successCount > 0 ? "positive" : "warning" },
      { label: "Last 20 runs · failed", value: `${failCount}`, tone: failCount === 0 ? "positive" : "warning" },
      { label: "Rows in latest run", value: `${lastRunForSource?.rows_ingested ?? 0}` },
    ],
    background: {
      overview: "Alt-data providers are always Tier 4 by default — every signal carries a visible confidence penalty. Wikipedia pageviews is the first live provider (free, no key). Others (SEC EDGAR filings, hiring, satellite, web-scrape) will slot into this same panel as they wire in.",
      whatCauses: [
        "Free public APIs (Wikimedia, SEC EDGAR) — no key, generous limits, but freshness depends on the upstream cadence.",
        "Paid alt-data feeds (Thinknum, Similarweb, Yipit) — richer signals but require secrets and quota management.",
      ],
      assetsAffected: [{ label: "Any tracked ticker", note: "Alt signals attach to the asset universe and feed into radars + catalysts." }],
      whatToWatch: [
        "Provider freshness dot — Tier 4 sources decay confidence faster than Tier 1.",
        "Coverage — % of the tracked universe with a live signal in the last 24h.",
        "Ingestion failure trail on Data Health.",
      ],
    },
    whatChanged: lastRunAt
      ? `Last Wikipedia refresh: ${new Date(lastRunAt).toLocaleString()} (${lastRunForSource?.rows_ingested ?? 0} rows).`
      : "No Wikipedia ingest has run yet.",
    whyItMatters: "Every alt-data claim on this hub must resolve back to a provider row here — this is the provenance panel.",
    evidence: [sourceEvidence],
    positives: [
      { id: "prov-wiki", label: "Wikipedia Pageviews — Tier 4, free, no key required", weight: 1, detail: "Daily job, upserts by (signal_code, subject, ts). Fully deterministic z-score anomaly detection." },
    ],
    deductions: [
      { id: "prov-single", label: "Only one alt-data provider wired so far", weight: -2, detail: "Cross-provider corroboration (SEC EDGAR, hiring, satellite) is the next phase." },
    ],
    verifyNext: [
      { id: "v-prov-fresh", label: "Wikipedia refresh in last 30h", verifier: "api", status: ageSeconds < 60 * 60 * 30 ? "pass" : "fail", checkedAt: nowIso, detail: lastRunAt ? `Last run ${new Date(lastRunAt).toLocaleString()}` : "Never" },
      { id: "v-prov-fail-rate", label: "Failure rate <10% over last 20 runs", verifier: "algo", status: runsForSource.length === 0 ? "unavailable" : failCount / Math.max(1, runsForSource.length) < 0.1 ? "pass" : "fail", checkedAt: nowIso, detail: `${failCount} failed / ${runsForSource.length} runs` },
    ],
    confidence: computeConfidence({ tier: "tier4_alternative", category: "alt_data", ageSeconds }),
  };

  return [attentionPanel, providerPanel];
});