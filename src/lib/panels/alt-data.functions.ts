import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { stampCalculation } from "@/lib/reliability/version";
import { WIKIPEDIA_ATTENTION_VERSION, WIKIPEDIA_TITLES } from "@/lib/ingestion/altdata/wikipedia";
import type { PanelData, Evidence, Point, VerifyCheck, Metric } from "./contract";

/**
 * Alt-data panels backed by the Wikipedia pageview attention signal.
 * Tier 4 alt-data throughout — visible confidence penalty on every panel.
 */
export const getAltDataPanels = createServerFn({ method: "GET" }).handler(
  async (): Promise<PanelData[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: source }, { data: signals }, { data: assets }, { data: lastRun }] =
      await Promise.all([
        supabaseAdmin
          .from("data_sources")
          .select("id, name, tier")
          .eq("provider_code", "wikipedia_pv")
          .maybeSingle(),
        supabaseAdmin
          .from("alt_data_signals")
          .select("signal_code, subject_id, ts, value, meta")
          .eq("signal_code", "WIKI_ATTENTION")
          .order("ts", { ascending: false })
          .limit(200),
        supabaseAdmin.from("assets").select("id, symbol, name"),
        supabaseAdmin
          .from("ingestion_runs")
          .select("started_at, finished_at, status, rows_ingested, error, source_id")
          .order("started_at", { ascending: false })
          .limit(20),
      ]);

    const assetById = new Map<string, { symbol: string; name: string }>();
    for (const a of assets ?? [])
      assetById.set(a.id as string, { symbol: a.symbol as string, name: a.name as string });

    // Latest attention row per subject
    const latestBySubject = new Map<
      string,
      { ts: string; value: number; meta: Record<string, unknown> }
    >();
    for (const s of signals ?? []) {
      const sid = s.subject_id as string;
      if (latestBySubject.has(sid)) continue;
      latestBySubject.set(sid, {
        ts: s.ts as string,
        value: Number(s.value ?? 0),
        meta: (s.meta as Record<string, unknown>) ?? {},
      });
    }

    type Row = {
      symbol: string;
      name: string;
      z: number;
      ts: string;
      spikePct: number;
      latestViews: number;
      baselineMean: number;
      version: string;
    };
    const rows: Row[] = [];
    for (const [sid, r] of latestBySubject.entries()) {
      const a = assetById.get(sid);
      if (!a) continue;
      rows.push({
        symbol: a.symbol,
        name: a.name,
        z: r.value,
        ts: r.ts,
        spikePct: Number(r.meta.spikePct ?? 0),
        latestViews: Number(r.meta.latestViews ?? 0),
        baselineMean: Number(r.meta.baselineMean ?? 0),
        version: String(r.meta.version ?? "altdata.wiki_attention.legacy.v0.1"),
      });
    }

    const nowIso = new Date().toISOString();
    const lastRunForSource = (lastRun ?? []).find((r) => r.source_id === source?.id);
    const lastRunAt = (lastRunForSource?.finished_at ?? lastRunForSource?.started_at) as
      string | undefined;
    const ageSeconds = lastRunAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastRunAt).getTime()) / 1000))
      : 60 * 60 * 24 * 7;

    const universeCovered = rows.length;
    const spikeCount = rows.filter((r) => r.z >= 2).length;
    const drawdownCount = rows.filter((r) => r.z <= -1.5).length;
    const displayedVersion = rows[0]?.version ?? WIKIPEDIA_ATTENTION_VERSION;
    const usesRobustScore = displayedVersion.includes("robust");

    const sourceEvidence: Evidence = {
      id: "ev-wiki",
      label: "Wikipedia pageviews (per article, daily, all agents)",
      sourceName: source?.name ?? "Wikipedia Pageviews",
      tier: "tier4_alternative",
      asOf: lastRunAt ?? nowIso,
      freshness: ageSeconds < 60 * 60 * 30 ? "fresh" : ageSeconds < 60 * 60 * 72 ? "warn" : "stale",
      agrees: true,
      url: "https://wikimedia.org/api/rest_v1/#/Pageviews%20data",
    };

    const background: NonNullable<PanelData["background"]> = {
      overview:
        "Wikipedia pageviews are a public proxy for retail attention. A sudden spike in views for a company's article can accompany headlines, earnings reactions, product launches or controversies. We compare the latest day with the company's own trailing 60-day baseline.",
      historicalContext:
        "Academic work (Preis, Moat & Stanley, 2013 — 'Quantifying trading behavior in financial markets using Google Trends') showed attention-based strategies beat buy-and-hold on the DJIA 1998–2011. The same effect shows up in Wikipedia pageviews with less noise, because the article set is smaller and self-selected.",
      whatCauses: [
        "Earnings surprise, guidance change, or analyst-day agenda.",
        "Product launch, recall, or regulatory action.",
        "Executive/board changes, M&A rumours, activist campaigns.",
        "Macro or catalyst news that names the company (tariffs, sanctions, lawsuits).",
        "Retail-forum mentions (WSB, StockTwits, X) driving lookups.",
      ],
      assetsAffected: [
        {
          label: "Single-name equities",
          note: "attention at least two normal variations above baseline often comes with a wider trading range",
        },
        {
          label: "Options implied vol",
          note: "attention spikes rewrite the skew, particularly for retail-heavy names",
        },
        {
          label: "ETF flows",
          note: "sustained attention shifts flows into thematic ETFs holding the name",
        },
      ],
      whatToWatch: [
        "At least two normal variations above baseline means unusual attention. Cross-check it with a real news or earnings catalyst.",
        "At least one and a half normal variations below baseline means attention has faded and may mark a post-hype period.",
        "Spikes without a matching news catalyst — potential rumour trade or bot noise.",
        "Freshness of the Wikipedia feed — the API trails by ~2 days.",
      ],
      examples: [
        {
          label: "GME Jan 2021",
          note: "Wikipedia pageviews spiked +2,000% ahead of the short-squeeze peak",
        },
        {
          label: "SVB Mar 2023",
          note: "attention moved more than six normal variations above baseline before the deposit run became mainstream",
        },
      ],
    };

    // ---------- Panel 1: Attention leaderboard (spikes)
    const spikes = [...rows]
      .filter((r) => r.z >= 1)
      .sort((a, b) => b.z - a.z)
      .slice(0, 8);
    const drops = [...rows]
      .filter((r) => r.z <= -1)
      .sort((a, b) => a.z - b.z)
      .slice(0, 5);

    const spikePositives: Point[] = spikes.map((r, i) => ({
      id: `sp-${r.symbol}`,
      label: `${r.symbol} — ${r.z.toFixed(1)} normal variations (${r.spikePct >= 0 ? "+" : ""}${r.spikePct.toFixed(0)}% vs 60-day norm)`,
      weight: r.z >= 3 ? 3 : r.z >= 2 ? 2 : 1,
      detail: `${r.name} · ${r.latestViews.toLocaleString()} views vs ${r.baselineMean.toLocaleString()} baseline · signal @ ${new Date(r.ts).toLocaleDateString()}${i === 0 ? " (top spike today)" : ""}`,
    }));

    const dropDeductions: Point[] = drops.map((r) => ({
      id: `dr-${r.symbol}`,
      label: `${r.symbol} — attention fade (${r.z.toFixed(1)} normal variations)`,
      weight: -Math.min(3, Math.round(Math.abs(r.z))),
      detail: `${r.name} · ${r.latestViews.toLocaleString()} views vs ${r.baselineMean.toLocaleString()} baseline. Often marks post-hype fade.`,
    }));

    const metrics: Metric[] = [
      { label: "Universe covered", value: `${universeCovered} tickers` },
      {
        label: "Unusual attention (2+ normal variations)",
        value: `${spikeCount}`,
        tone: spikeCount > 0 ? "warning" : "neutral",
      },
      {
        label: "Attention fades (1.5+ below normal)",
        value: `${drawdownCount}`,
        tone: drawdownCount > 0 ? "warning" : "neutral",
      },
      {
        label: "Signal freshness",
        value: lastRunAt ? new Date(lastRunAt).toLocaleString() : "never",
        tone: sourceEvidence.freshness === "fresh" ? "positive" : "warning",
      },
    ];

    const verifyChecks: VerifyCheck[] = [
      {
        id: "v-alt-coverage",
        label: "≥50% of tracked assets have a Wikipedia pageview signal",
        verifier: "algo",
        status: universeCovered >= 30 ? "pass" : universeCovered > 0 ? "fail" : "unavailable",
        detail: `${universeCovered} of ${Object.keys(WIKIPEDIA_TITLES).length} mapped tickers have a signal`,
        checkedAt: nowIso,
      },
      {
        id: "v-alt-fresh",
        label: "Wikipedia refresh ran in the last 30h",
        verifier: "api",
        status:
          ageSeconds < 60 * 60 * 30 ? "pass" : ageSeconds < 60 * 60 * 72 ? "fail" : "unavailable",
        detail: lastRunAt
          ? `Last run ${new Date(lastRunAt).toLocaleString()}`
          : "No ingestion run recorded",
        checkedAt: nowIso,
      },
      {
        id: "v-alt-corroboration",
        label: "Unusual attention corroborated by a same-day catalyst",
        verifier: "ai",
        status: spikeCount === 0 ? "unavailable" : "pending",
        detail:
          spikeCount === 0
            ? "No spikes today — nothing to corroborate."
            : "AI corroboration pass runs after each ingest to match attention spikes to macro/commodity/news catalysts.",
        checkedAt: nowIso,
      },
    ];

    const whyBullets: string[] = [
      spikes[0]
        ? `Top attention spike: ${spikes[0].symbol} (${spikes[0].z.toFixed(1)} normal variations above its baseline) — investigate this first; it is where attention is changing fastest.`
        : "No attention spikes today. Absence of retail interest is itself information — the flow story is elsewhere.",
      spikes.length >= 3
        ? `${spikes.length} names are meaningfully above normal — a broad attention wave is more likely to reflect a market theme than company-specific news.`
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
      purpose:
        "Which tracked companies are people suddenly researching, and which have fallen off the radar.",
      metrics,
      background,
      whatChanged: spikes[0]
        ? `Biggest spike: ${spikes[0].symbol} at ${spikes[0].z.toFixed(1)} normal variations above its baseline (${spikes[0].spikePct >= 0 ? "+" : ""}${spikes[0].spikePct.toFixed(0)}%). ${spikes.length} names are above normal.`
        : universeCovered > 0
          ? "No meaningful attention spikes today."
          : "No pageview data yet — run the alt-data ingest.",
      whyItMatters:
        "Sudden retail attention front-runs headlines and volatility. Attention drops mark post-hype fades. Both matter for research prioritisation.",
      whyBullets,
      evidence: [sourceEvidence],
      positives: spikePositives,
      deductions:
        dropDeductions.length > 0
          ? dropDeductions
          : [
              {
                id: "no-fade",
                label: "No meaningful attention fades",
                weight: 0,
                detail: "Nothing is at least 1.5 normal variations below its baseline.",
              },
            ],
      verifyNext: verifyChecks,
      confidence: computeConfidence({
        tier: "tier4_alternative",
        category: "alt_data",
        ageSeconds,
      }),
      calculation: {
        formula: usesRobustScore
          ? "attention score = average of the conventional 60-day deviation score and an outlier-resistant median-based score; spike at 2 or more, fade at −1.5 or less"
          : "attention score = latest views compared with the average and usual variation of the previous 60 days; spike at 2 or more, fade at −1.5 or less",
        ...stampCalculation(displayedVersion, {
          universe: universeCovered,
          spikes: spikeCount,
          fades: drawdownCount,
        }),
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
      purpose:
        "Which alternative-data providers are wired, how fresh they are, and how much of the universe they cover.",
      metrics: [
        { label: "Providers wired", value: "1 (Wikipedia)", tone: "neutral" },
        {
          label: "Last 20 runs · success",
          value: `${successCount}`,
          tone: successCount > 0 ? "positive" : "warning",
        },
        {
          label: "Last 20 runs · failed",
          value: `${failCount}`,
          tone: failCount === 0 ? "positive" : "warning",
        },
        { label: "Rows in latest run", value: `${lastRunForSource?.rows_ingested ?? 0}` },
      ],
      background: {
        overview:
          "Alt-data providers are always Tier 4 by default — every signal carries a visible confidence penalty. Wikipedia pageviews is the first live provider (free, no key). Others (SEC EDGAR filings, hiring, satellite, web-scrape) will slot into this same panel as they wire in.",
        whatCauses: [
          "Free public APIs (Wikimedia, SEC EDGAR) — no key, generous limits, but freshness depends on the upstream cadence.",
          "Paid alt-data feeds (Thinknum, Similarweb, Yipit) — richer signals but require secrets and quota management.",
        ],
        assetsAffected: [
          {
            label: "Any tracked ticker",
            note: "Alt signals attach to the asset universe and feed into radars + catalysts.",
          },
        ],
        whatToWatch: [
          "Provider freshness dot — Tier 4 sources decay confidence faster than Tier 1.",
          "Coverage — % of the tracked universe with a live signal in the last 24h.",
          "Ingestion failure trail on Data Health.",
        ],
      },
      whatChanged: lastRunAt
        ? `Last Wikipedia refresh: ${new Date(lastRunAt).toLocaleString()} (${lastRunForSource?.rows_ingested ?? 0} rows).`
        : "No Wikipedia ingest has run yet.",
      whyItMatters:
        "Every alt-data claim on this hub must resolve back to a provider row here — this is the provenance panel.",
      evidence: [sourceEvidence],
      positives: [
        {
          id: "prov-wiki",
          label: "Wikipedia Pageviews — Tier 4, free, no key required",
          weight: 1,
          detail:
            "Daily job with repeat-safe storage and transparent attention-anomaly calculations.",
        },
      ],
      deductions: [
        {
          id: "prov-single",
          label: "Only one alt-data provider wired so far",
          weight: -2,
          detail: "Cross-provider corroboration (SEC EDGAR, hiring, satellite) is the next phase.",
        },
      ],
      verifyNext: [
        {
          id: "v-prov-fresh",
          label: "Wikipedia refresh in last 30h",
          verifier: "api",
          status: ageSeconds < 60 * 60 * 30 ? "pass" : "fail",
          checkedAt: nowIso,
          detail: lastRunAt ? `Last run ${new Date(lastRunAt).toLocaleString()}` : "Never",
        },
        {
          id: "v-prov-fail-rate",
          label: "Failure rate <10% over last 20 runs",
          verifier: "algo",
          status:
            runsForSource.length === 0
              ? "unavailable"
              : failCount / Math.max(1, runsForSource.length) < 0.1
                ? "pass"
                : "fail",
          checkedAt: nowIso,
          detail: `${failCount} failed / ${runsForSource.length} runs`,
        },
      ],
      confidence: computeConfidence({
        tier: "tier4_alternative",
        category: "alt_data",
        ageSeconds,
      }),
    };

    return [attentionPanel, providerPanel];
  },
);

export interface AttentionWorkspaceRow {
  symbol: string;
  name: string;
  latestDate: string | null;
  latestViews: number | null;
  baselineMean: number | null;
  conventionalScore: number | null;
  robustScore: number | null;
  combinedScore: number | null;
  persistenceDays: number;
  reliability: number;
  state: "spike" | "fade" | "normal" | "insufficient";
  history: Array<{ date: string; value: number }>;
}

export interface AltDataWorkspace {
  computedAt: string;
  latestSignalDate: string | null;
  trackedAssets: number;
  coveredAssets: number;
  coverage: number;
  spikeCount: number;
  fadeCount: number;
  rows: AttentionWorkspaceRow[];
  provider: {
    name: string;
    lastRunAt: string | null;
    freshnessHours: number | null;
    recentRuns: number;
    successfulRuns: number;
    failedRuns: number;
    latestRows: number;
  };
}

/** Detailed attention workspace with robust, outlier-resistant diagnostics. */
export const getAltDataWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<AltDataWorkspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const [{ data: source }, { data: assets }, dailySignals, { data: runs }] = await Promise.all([
      supabaseAdmin
        .from("data_sources")
        .select("id, name")
        .eq("provider_code", "wikipedia_pv")
        .maybeSingle(),
      supabaseAdmin.from("assets").select("id, symbol, name").eq("active", true),
      paginateRows<{ subject_id: string; ts: string; value: number | null }>((from, to) =>
        supabaseAdmin
          .from("alt_data_signals")
          .select("subject_id, ts, value")
          .eq("signal_code", "WIKI_PV_DAILY")
          .gte("ts", cutoff)
          .order("subject_id", { ascending: true })
          .order("ts", { ascending: true })
          .range(from, to),
      ),
      supabaseAdmin
        .from("ingestion_runs")
        .select("started_at, finished_at, status, rows_ingested, source_id")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

    const assetById = new Map(
      (assets ?? []).map((asset) => [
        asset.id as string,
        {
          symbol: asset.symbol as string,
          name: asset.name as string,
        },
      ]),
    );
    const historyById = new Map<string, Array<{ date: string; value: number }>>();
    for (const signal of dailySignals) {
      if (signal.value == null || !Number.isFinite(Number(signal.value))) continue;
      const history = historyById.get(signal.subject_id) ?? [];
      history.push({ date: signal.ts.slice(0, 10), value: Number(signal.value) });
      historyById.set(signal.subject_id, history);
    }

    const rows: AttentionWorkspaceRow[] = [];
    for (const [subjectId, history] of historyById.entries()) {
      const asset = assetById.get(subjectId);
      if (!asset) continue;
      const latest = history.at(-1);
      const baseline = history.slice(-61, -1).map((point) => point.value);
      const conventional = standardScore(latest?.value ?? null, baseline);
      const robust = robustStandardScore(latest?.value ?? null, baseline);
      const combined =
        conventional == null && robust == null
          ? null
          : meanNumbers([conventional, robust].filter((value): value is number => value != null));
      const latestAgeDays = latest
        ? Math.max(0, (Date.now() - new Date(`${latest.date}T00:00:00Z`).getTime()) / 86_400_000)
        : 999;
      const agreement =
        conventional != null && robust != null
          ? Math.max(0, 1 - Math.min(1, Math.abs(conventional - robust) / 3))
          : 0;
      const baselineCoverage = Math.min(1, baseline.length / 60);
      const freshness = Math.max(0, 1 - Math.max(0, latestAgeDays - 2) / 7);
      const reliability = Math.round(
        (baselineCoverage * 0.45 + agreement * 0.3 + freshness * 0.25) * 100,
      );
      const persistenceDays = attentionPersistence(history);
      const state: AttentionWorkspaceRow["state"] =
        combined == null || baseline.length < 20
          ? "insufficient"
          : combined >= 2
            ? "spike"
            : combined <= -1.5
              ? "fade"
              : "normal";
      rows.push({
        symbol: asset.symbol,
        name: asset.name,
        latestDate: latest?.date ?? null,
        latestViews: latest?.value ?? null,
        baselineMean: baseline.length ? meanNumbers(baseline) : null,
        conventionalScore: conventional,
        robustScore: robust,
        combinedScore: combined,
        persistenceDays,
        reliability,
        state,
        history: history.slice(-60),
      });
    }
    rows.sort((a, b) => Math.abs(b.combinedScore ?? 0) - Math.abs(a.combinedScore ?? 0));

    const sourceRuns = (runs ?? []).filter((run) => run.source_id === source?.id);
    const lastRun = sourceRuns[0];
    const lastRunAt = ((lastRun?.finished_at ?? lastRun?.started_at) as string | null) ?? null;
    const freshnessHours = lastRunAt
      ? Math.max(0, (Date.now() - new Date(lastRunAt).getTime()) / 3_600_000)
      : null;
    const latestSignalDate =
      rows
        .map((row) => row.latestDate)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;
    const trackedAssets = (assets ?? []).length;
    return {
      computedAt: new Date().toISOString(),
      latestSignalDate,
      trackedAssets,
      coveredAssets: rows.length,
      coverage: trackedAssets ? (rows.length / trackedAssets) * 100 : 0,
      spikeCount: rows.filter((row) => row.state === "spike").length,
      fadeCount: rows.filter((row) => row.state === "fade").length,
      rows,
      provider: {
        name: source?.name ?? "Wikipedia Pageviews",
        lastRunAt,
        freshnessHours,
        recentRuns: sourceRuns.length,
        successfulRuns: sourceRuns.filter((run) => run.status === "success").length,
        failedRuns: sourceRuns.filter((run) => run.status === "failed").length,
        latestRows: Number(lastRun?.rows_ingested ?? 0),
      },
    };
  },
);

async function paginateRows<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const output: T[] = [];
  const size = 1000;
  for (let from = 0; from < 50_000; from += size) {
    const { data, error } = await query(from, from + size - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    output.push(...page);
    if (page.length < size) break;
  }
  return output;
}

function standardScore(latest: number | null, baseline: number[]): number | null {
  if (latest == null || baseline.length < 5) return null;
  const average = meanNumbers(baseline);
  const deviation = Math.sqrt(meanNumbers(baseline.map((value) => (value - average) ** 2)));
  return deviation === 0 ? 0 : (latest - average) / deviation;
}

function robustStandardScore(latest: number | null, baseline: number[]): number | null {
  if (latest == null || baseline.length < 5) return null;
  const centre = medianNumber(baseline);
  const mad = medianNumber(baseline.map((value) => Math.abs(value - centre)));
  return mad === 0 ? 0 : (0.6745 * (latest - centre)) / mad;
}

function attentionPersistence(history: Array<{ date: string; value: number }>): number {
  let count = 0;
  for (let index = history.length - 1; index >= Math.max(60, history.length - 5); index -= 1) {
    const baseline = history.slice(Math.max(0, index - 60), index).map((point) => point.value);
    const score = standardScore(history[index].value, baseline);
    if (score != null && Math.abs(score) >= 1) count += 1;
    else break;
  }
  return count;
}

function meanNumbers(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function medianNumber(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
