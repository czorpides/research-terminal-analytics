import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import { linearProjection } from "@/components/research/TrendChart";
import type { PanelData, Evidence, VerifyCheck, ChartZone, TrendSeries, Metric } from "./contract";
import { FRED_SERIES } from "@/lib/ingestion/fred/series";

export type MacroRegion = "US" | "EZ" | "UK";

const RegionInput = z.object({ region: z.enum(["US", "EZ", "UK"]) });

interface Obs { asOf: string; value: number }
type ByMetric = Map<string, Obs[]>;

/**
 * Region-aware Macro hub. Loads the last ~5 years of every FRED series
 * we ingest for the chosen region, then builds category-scoped panels
 * (rates, inflation, labor, credit, housing, business, growth) with
 * inline trend charts and goldilocks/warn/danger zones.
 */
export const getMacroPanelsForRegion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RegionInput.parse(d))
  .handler(async ({ data }): Promise<PanelData[]> => {
    return buildRegionPanels(data.region);
  });

/**
 * Multi-region comparison: returns the same 3 focus indicators (policy
 * rate, 10Y yield, unemployment) for US / EZ / UK, each as its own panel
 * with three trend lines side by side (rendered by the /macro page).
 */
export const getMacroCompare = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  return buildComparePanels();
});

async function loadPoints(region: MacroRegion): Promise<{ byMetric: ByMetric; sourceName: string; regionLabel: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: source }, { data: indicators }] = await Promise.all([
    supabaseAdmin.from("data_sources").select("id, name").eq("provider_code", "fred").maybeSingle(),
    supabaseAdmin.from("economic_indicators").select("id, code, provider_series_code").not("provider_series_code", "is", null),
  ]);

  const wanted = new Set(FRED_SERIES.filter((s) => s.region === region).map((s) => s.seriesCode));
  const ids = (indicators ?? [])
    .filter((i) => i.provider_series_code && wanted.has(i.provider_series_code as string))
    .map((i) => i.id);

  const byMetric: ByMetric = new Map();
  if (ids.length === 0) {
    return { byMetric, sourceName: source?.name ?? "FRED", regionLabel: REGION_LABEL[region] };
  }

  const { data: points } = await supabaseAdmin
    .from("data_points")
    .select("metric_code, value_num, as_of")
    .in("subject_id", ids)
    .order("as_of", { ascending: true })
    .limit(20000);

  (points ?? []).forEach((p) => {
    if (p.value_num === null) return;
    const arr = byMetric.get(p.metric_code as string) ?? [];
    arr.push({ asOf: p.as_of as string, value: Number(p.value_num) });
    byMetric.set(p.metric_code as string, arr);
  });
  return { byMetric, sourceName: source?.name ?? "FRED", regionLabel: REGION_LABEL[region] };
}

const REGION_LABEL: Record<MacroRegion, string> = {
  US: "United States",
  EZ: "Euro area",
  UK: "United Kingdom",
};

async function buildRegionPanels(region: MacroRegion): Promise<PanelData[]> {
  const { checkAboveMovingAverage, checkSpreadSign, checkFreshness, pendingAiCheck } = await import("@/lib/verify/runners.server");
  const { getLatestVerifyChecksForPanel } = await import("@/lib/verify/executor.server");

  const { byMetric, sourceName, regionLabel } = await loadPoints(region);
  if (byMetric.size === 0) return placeholderPanels(region, regionLabel);

  const panels: PanelData[] = [];
  if (region === "US") {
    panels.push(usRatesPanel(byMetric, sourceName, checkAboveMovingAverage, checkSpreadSign, checkFreshness, pendingAiCheck));
    panels.push(inflationPanel(region, byMetric, sourceName, checkFreshness, pendingAiCheck));
    panels.push(laborPanel(region, byMetric, sourceName, checkFreshness, pendingAiCheck));
    panels.push(housingPanel(byMetric, sourceName, checkFreshness, pendingAiCheck));
    panels.push(creditPanel(byMetric, sourceName, checkFreshness, pendingAiCheck));
    panels.push(businessGrowthPanel(byMetric, sourceName, checkFreshness, pendingAiCheck));
  } else if (region === "EZ") {
    panels.push(genericRatesPanel(region, byMetric, sourceName, "ECBDFR", "IRLTLT01EZM156N", "ECB deposit rate", "EA 10Y yield", checkFreshness, pendingAiCheck));
    panels.push(inflationPanel(region, byMetric, sourceName, checkFreshness, pendingAiCheck));
    panels.push(laborPanel(region, byMetric, sourceName, checkFreshness, pendingAiCheck));
  } else {
    panels.push(genericRatesPanel(region, byMetric, sourceName, "IUDSOIA", "IRLTLT01GBM156N", "UK SONIA (BoE proxy)", "UK 10Y gilt", checkFreshness, pendingAiCheck));
    panels.push(inflationPanel(region, byMetric, sourceName, checkFreshness, pendingAiCheck));
    panels.push(laborPanel(region, byMetric, sourceName, checkFreshness, pendingAiCheck));
  }

  // Overlay any recorded verify_runs (algo/api/ai) per panel.
  const overlaid = await Promise.all(panels.map(async (p) => {
    const live = await getLatestVerifyChecksForPanel(p.id);
    if (live.length === 0) return p;
    const byId = new Map(live.map((c) => [c.id, c]));
    const merged: VerifyCheck[] = p.verifyNext.map((c) => byId.get(c.id) ?? c);
    live.forEach((c) => { if (!p.verifyNext.find((x) => x.id === c.id)) merged.push(c); });
    return { ...p, verifyNext: merged };
  }));
  return overlaid;
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function latest(arr?: Obs[]) { return arr && arr.length > 0 ? arr[arr.length - 1] : undefined; }
function toChartPoints(arr?: Obs[], tail = 120): { t: string; v: number }[] {
  return (arr ?? []).slice(-tail).map((p) => ({ t: p.asOf, v: p.value }));
}
function pctChangeYoY(arr?: Obs[]): number | null {
  if (!arr || arr.length < 13) return null;
  const cur = arr[arr.length - 1];
  const yoy = arr[arr.length - 13];
  if (!cur || !yoy || yoy.value === 0) return null;
  return ((cur.value - yoy.value) / yoy.value) * 100;
}
function tone(v: number, positiveIsUp = true): Metric["tone"] {
  if (Math.abs(v) < 1e-9) return "neutral";
  const up = v > 0;
  return up === positiveIsUp ? "positive" : "negative";
}
function fredEvidence(seriesCode: string, sourceName: string, asOf: string): Evidence {
  const ageSec = (Date.now() - new Date(asOf).getTime()) / 1000;
  return {
    id: `ev-${seriesCode}`,
    label: `FRED series ${seriesCode}`,
    sourceName,
    tier: "tier1_official",
    asOf,
    freshness: freshnessState(ageSec, DEFAULT_FRESHNESS.macro_release),
    agrees: true,
    url: `https://fred.stlouisfed.org/series/${seriesCode}`,
  };
}
function makeTrend(arr: Obs[] | undefined, opts: { format?: TrendSeries["format"]; zones?: ChartZone[]; project?: number; tail?: number }): TrendSeries | undefined {
  const pts = toChartPoints(arr, opts.tail ?? 120);
  if (pts.length === 0) return undefined;
  return {
    points: pts,
    projection: opts.project ? linearProjection(pts, opts.project) : undefined,
    zones: opts.zones,
    format: opts.format,
  };
}

// zone presets
const ZONE_UNRATE: ChartZone[] = [
  { from: 0,   to: 4.5, kind: "good", label: "Full employment" },
  { from: 4.5, to: 5.5, kind: "warn", label: "Softening" },
  { from: 5.5, to: 15,  kind: "bad",  label: "Recessionary" },
];
const ZONE_CPI_YOY: ChartZone[] = [
  { from: 1,  to: 3,  kind: "good", label: "Near target" },
  { from: 3,  to: 5,  kind: "warn", label: "Above target" },
  { from: 5,  to: 20, kind: "bad",  label: "Hot" },
  { from: -5, to: 1,  kind: "warn", label: "Below target" },
];
const ZONE_SPREAD: ChartZone[] = [
  { from: 0.5,  to: 5,  kind: "good", label: "Steep" },
  { from: 0,    to: 0.5,kind: "warn", label: "Flat" },
  { from: -5,   to: 0,  kind: "bad",  label: "Inverted" },
];
const ZONE_MORTGAGE: ChartZone[] = [
  { from: 0, to: 5, kind: "good" },
  { from: 5, to: 7, kind: "warn" },
  { from: 7, to: 15, kind: "bad" },
];
const ZONE_DELINQ: ChartZone[] = [
  { from: 0, to: 3, kind: "good" },
  { from: 3, to: 5, kind: "warn" },
  { from: 5, to: 20, kind: "bad" },
];

// ─────────────────────────────────────────────────────────────────────────────
// panels
// ─────────────────────────────────────────────────────────────────────────────

function usRatesPanel(
  byMetric: ByMetric,
  sourceName: string,
  checkMA: typeof import("@/lib/verify/runners.server").checkAboveMovingAverage,
  checkSpread: typeof import("@/lib/verify/runners.server").checkSpreadSign,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const ten = byMetric.get("DGS10"), two = byMetric.get("DGS2"), spread = byMetric.get("T10Y2Y"), dff = byMetric.get("DFF");
  const l10 = latest(ten), l2 = latest(two), lSpread = latest(spread), lDff = latest(dff);

  const evidence: Evidence[] = [];
  if (l10) evidence.push(fredEvidence("DGS10", sourceName, l10.asOf));
  if (l2) evidence.push(fredEvidence("DGS2", sourceName, l2.asOf));
  if (lSpread) evidence.push(fredEvidence("T10Y2Y", sourceName, lSpread.asOf));
  if (lDff) evidence.push(fredEvidence("DFF", sourceName, lDff.asOf));

  const ageSec = l10 ? (Date.now() - new Date(l10.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [], deductions = [];
  if (lSpread && lSpread.value < 0) deductions.push({ id: "curve-inv", label: "10Y − 2Y is inverted", detail: `${lSpread.value.toFixed(2)}pp` });
  if (lSpread && lSpread.value > 0) positives.push({ id: "curve-pos", label: "10Y − 2Y positive", detail: `${lSpread.value.toFixed(2)}pp` });
  if (l10 && lDff && l10.value > lDff.value) positives.push({ id: "10y-above-ff", label: "10Y trades above Fed Funds", detail: `${l10.value.toFixed(2)}% vs ${lDff.value.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (ten) verifyNext.push(checkMA("v-10y-ma", "10Y above 60-day moving average", ten.map((p) => ({ asOf: p.asOf, value: p.value })), 60));
  verifyNext.push(checkSpread("v-curve-sign", "Yield curve non-inverted", lSpread?.value ?? null, "positive"));
  if (l10) verifyNext.push(checkFresh("v-10y-fresh", "10Y freshness within policy", l10.asOf, DEFAULT_FRESHNESS.macro_release.maxAgeSeconds));
  verifyNext.push(pendingAi("v-10y-ai", "Explain 10Y move in context of recent Fed speak"));

  const chart = makeTrend(spread, { format: "percent", zones: ZONE_SPREAD, project: 6 });

  return {
    id: "macro-us-rates",
    title: "US rates & yield curve",
    purpose: "Policy rate, long-end pricing and the 10Y − 2Y term spread.",
    background: {
      overview: "The Fed Funds rate anchors the front end. The 10Y yield reflects growth, inflation and term premium expectations. Their difference — the yield curve — is one of the most historically reliable recession signals.",
      whatCauses: [
        "Fed policy path (hikes, cuts, pauses)",
        "Inflation surprises and inflation expectations",
        "Treasury supply and QT/QE",
        "Global safe-haven demand for USTs",
      ],
      assetsAffected: [
        { label: "Banks", note: "Steeper curve helps NIMs" },
        { label: "Long-duration tech / growth", note: "Sensitive to real yields" },
        { label: "Housing & REITs", note: "Mortgage rates track the 10Y" },
        { label: "USD & EM assets", note: "Rate differentials drive FX" },
      ],
      whatToWatch: ["Next FOMC dot plot", "10Y break-evens vs real yields", "T-bill supply pressure"],
    },
    metrics: [
      { label: "US 10Y",   value: l10 ? `${l10.value.toFixed(2)}%` : "—" },
      { label: "US 2Y",    value: l2 ? `${l2.value.toFixed(2)}%` : "—" },
      { label: "10Y − 2Y", value: lSpread ? `${lSpread.value.toFixed(2)}pp` : "—", tone: lSpread ? tone(lSpread.value, true) : "neutral" },
    ],
    chart,
    whatChanged: l10 ? `Latest 10Y print: ${l10.value.toFixed(2)}% (${new Date(l10.asOf).toLocaleDateString()}).` : "No 10Y observations yet.",
    whyItMatters: "Steepness and level of the curve drive equity duration risk, bank NIMs and credit spreads.",
    evidence, positives, deductions, verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
    calculation: {
      formula: "spread = DGS10 − DGS2",
      ...stampCalculation("macro.us_rates.v0.2", { DGS10: l10?.value ?? null, DGS2: l2?.value ?? null }),
      inputs: { DGS10: l10?.value ?? null, DGS2: l2?.value ?? null, DFF: lDff?.value ?? null },
    },
  };
}

function genericRatesPanel(
  region: MacroRegion,
  byMetric: ByMetric,
  sourceName: string,
  policyCode: string,
  tenCode: string,
  policyLabel: string,
  tenLabel: string,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const policy = byMetric.get(policyCode), ten = byMetric.get(tenCode);
  const lP = latest(policy), l10 = latest(ten);
  const spread = lP && l10 ? l10.value - lP.value : null;

  const evidence: Evidence[] = [];
  if (lP)  evidence.push(fredEvidence(policyCode, sourceName, lP.asOf));
  if (l10) evidence.push(fredEvidence(tenCode, sourceName, l10.asOf));

  const ageSec = l10 ? (Date.now() - new Date(l10.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const verifyNext: VerifyCheck[] = [];
  if (l10) verifyNext.push(checkFresh("v-10y-fresh", `${tenLabel} freshness within policy`, l10.asOf, DEFAULT_FRESHNESS.macro_release.maxAgeSeconds));
  verifyNext.push(pendingAi("v-rates-ai", `Interpret ${region} policy stance vs long-end pricing`));

  return {
    id: `macro-${region.toLowerCase()}-rates`,
    title: `${REGION_LABEL[region]} rates`,
    purpose: `Central bank policy rate and long-end yield for ${REGION_LABEL[region]}.`,
    background: {
      overview: `${policyLabel} sets the front end; ${tenLabel} prices growth and inflation expectations. The difference summarises the local yield curve stance.`,
      whatToWatch: ["Upcoming policy meeting", "Inflation print", "Sovereign spread vs Bunds/USTs"],
    },
    metrics: [
      { label: policyLabel, value: lP ? `${lP.value.toFixed(2)}%` : "—" },
      { label: tenLabel,    value: l10 ? `${l10.value.toFixed(2)}%` : "—" },
      { label: "10Y − policy", value: spread !== null ? `${spread.toFixed(2)}pp` : "—", tone: spread !== null ? tone(spread, true) : "neutral" },
    ],
    chart: makeTrend(ten, { format: "percent", project: 6 }),
    whatChanged: l10 ? `Latest ${tenLabel}: ${l10.value.toFixed(2)}% (${new Date(l10.asOf).toLocaleDateString()}).` : "No observations yet.",
    whyItMatters: "The policy path plus long-end yield drives local equity, credit and FX pricing.",
    evidence, positives: [], deductions: [], verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
  };
}

function inflationPanel(
  region: MacroRegion,
  byMetric: ByMetric,
  sourceName: string,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const cpiCode = region === "US" ? "CPIAUCSL" : region === "EZ" ? "CP0000EZ19M086NEST" : "CPALTT01GBM657N";
  const coreCode = region === "US" ? "CPILFESL" : undefined;
  const cpi = byMetric.get(cpiCode);
  const core = coreCode ? byMetric.get(coreCode) : undefined;

  // UK series is already YoY %; others are index → compute YoY.
  const isAlreadyYoY = region === "UK";
  const cpiYoY = isAlreadyYoY ? (latest(cpi)?.value ?? null) : pctChangeYoY(cpi);
  const coreYoY = pctChangeYoY(core);
  const lCpi = latest(cpi), lCore = latest(core);

  const evidence: Evidence[] = [];
  if (lCpi)  evidence.push(fredEvidence(cpiCode, sourceName, lCpi.asOf));
  if (lCore && coreCode) evidence.push(fredEvidence(coreCode, sourceName, lCore.asOf));

  const ageSec = lCpi ? (Date.now() - new Date(lCpi.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [], deductions = [];
  if (cpiYoY !== null && cpiYoY < 3) positives.push({ id: "cpi-cool", label: "CPI YoY under 3%", detail: `${cpiYoY.toFixed(2)}%` });
  if (cpiYoY !== null && cpiYoY > 4) deductions.push({ id: "cpi-hot", label: "CPI YoY above 4%", detail: `${cpiYoY.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (lCpi) verifyNext.push(checkFresh("v-cpi-fresh", "CPI print within policy window", lCpi.asOf, 60 * 60 * 24 * 40));
  verifyNext.push(pendingAi("v-cpi-ai", "Decompose CPI drivers (shelter, services, goods, energy)"));

  // Trend chart: prefer YoY series if we can compute one; else raw index.
  let chart: TrendSeries | undefined;
  if (!isAlreadyYoY && cpi && cpi.length > 13) {
    const yoy: Obs[] = [];
    for (let i = 12; i < cpi.length; i++) {
      const y = cpi[i - 12].value;
      if (y !== 0) yoy.push({ asOf: cpi[i].asOf, value: ((cpi[i].value - y) / y) * 100 });
    }
    chart = makeTrend(yoy, { format: "percent", zones: ZONE_CPI_YOY, project: 6 });
  } else {
    chart = makeTrend(cpi, { format: "percent", zones: ZONE_CPI_YOY, project: 6 });
  }

  return {
    id: `macro-${region.toLowerCase()}-inflation`,
    title: `${REGION_LABEL[region]} inflation`,
    purpose: "Headline (and where available core) CPI year-on-year vs the 2% target.",
    background: {
      overview: "Consumer price inflation, year-on-year, is the primary target of most major central banks. Persistence in core (ex food & energy) matters more than headline swings.",
      whatCauses: ["Energy price shocks", "Wage growth / services inflation", "Currency depreciation", "Fiscal impulse & tariffs"],
      assetsAffected: [{ label: "Rates & duration" }, { label: "Consumer discretionary" }, { label: "Precious metals" }],
      whatToWatch: ["Next CPI release", "Wage tracker prints", "Energy futures"],
    },
    metrics: [
      { label: "CPI YoY",     value: cpiYoY !== null ? `${cpiYoY.toFixed(2)}%` : "—", tone: cpiYoY !== null ? tone(cpiYoY - 2, false) : "neutral" },
      { label: "Core CPI YoY", value: coreYoY !== null ? `${coreYoY.toFixed(2)}%` : "—", tone: coreYoY !== null ? tone(coreYoY - 2, false) : "neutral" },
      { label: "Latest month", value: lCpi ? new Date(lCpi.asOf).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—" },
    ],
    chart,
    whatChanged: lCpi ? `Latest CPI print for ${new Date(lCpi.asOf).toLocaleDateString(undefined, { month: "long", year: "numeric" })}.` : "No CPI data yet.",
    whyItMatters: "Sticky inflation delays rate cuts, compresses valuation multiples and pressures long-duration assets.",
    evidence, positives, deductions, verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
  };
}

function laborPanel(
  region: MacroRegion,
  byMetric: ByMetric,
  sourceName: string,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const unCode = region === "US" ? "UNRATE" : region === "EZ" ? "LRHUTTTTEZM156S" : "LRHUTTTTGBM156S";
  const payCode = region === "US" ? "PAYEMS" : undefined;
  const unrate = byMetric.get(unCode);
  const payems = payCode ? byMetric.get(payCode) : undefined;
  const lUn = latest(unrate), lPay = latest(payems);
  const payChg = payems && payems.length >= 2 ? payems[payems.length - 1].value - payems[payems.length - 2].value : null;

  const evidence: Evidence[] = [];
  if (lUn)  evidence.push(fredEvidence(unCode, sourceName, lUn.asOf));
  if (lPay && payCode) evidence.push(fredEvidence(payCode, sourceName, lPay.asOf));

  const ageSec = lUn ? (Date.now() - new Date(lUn.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [], deductions = [];
  if (lUn && lUn.value < 4.5) positives.push({ id: "un-low", label: "Unemployment below 4.5%", detail: `${lUn.value.toFixed(2)}%` });
  if (lUn && lUn.value > 5.5) deductions.push({ id: "un-high", label: "Unemployment above 5.5%", detail: `${lUn.value.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (lUn) verifyNext.push(checkFresh("v-un-fresh", "Unemployment print fresh", lUn.asOf, 60 * 60 * 24 * 40));
  verifyNext.push(pendingAi("v-labor-ai", `Interpret ${region} labour data vs central-bank reaction function`));

  return {
    id: `macro-${region.toLowerCase()}-labor`,
    title: `${REGION_LABEL[region]} labour market`,
    purpose: "Unemployment rate" + (payCode ? " and nonfarm payrolls MoM change." : "."),
    background: {
      overview: "Labour tightness drives wage pressure, consumer resilience and central-bank reaction. Rapid rises historically precede recessions (Sahm rule).",
      whatToWatch: ["Next employment print", "Wage growth", "Job-openings trend"],
    },
    metrics: [
      { label: "Unemployment", value: lUn ? `${lUn.value.toFixed(2)}%` : "—", tone: lUn && lUn.value < 5 ? "positive" : "warning" },
      ...(payCode ? [{ label: "Payrolls Δ (MoM, k)", value: payChg !== null ? `${payChg > 0 ? "+" : ""}${payChg.toFixed(0)}` : "—", tone: (payChg !== null ? tone(payChg, true) : "neutral") as Metric["tone"] }] : []),
      { label: "Latest month", value: lUn ? new Date(lUn.asOf).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—" },
    ],
    chart: makeTrend(unrate, { format: "percent", zones: ZONE_UNRATE, project: 6 }),
    whatChanged: lPay ? `Latest payrolls: ${Math.round(lPay.value).toLocaleString()}k jobs.` : (lUn ? `Latest unemployment: ${lUn.value.toFixed(2)}%.` : "No data yet."),
    whyItMatters: "Labour tightness determines wage pressure, policy path and consumer resilience.",
    evidence, positives, deductions, verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
  };
}

function housingPanel(
  byMetric: ByMetric, sourceName: string,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const mort = byMetric.get("MORTGAGE30US"), starts = byMetric.get("HOUST"), mtgDel = byMetric.get("DRSFRMACBS");
  const lM = latest(mort), lS = latest(starts), lD = latest(mtgDel);

  const evidence: Evidence[] = [];
  if (lM) evidence.push(fredEvidence("MORTGAGE30US", sourceName, lM.asOf));
  if (lS) evidence.push(fredEvidence("HOUST", sourceName, lS.asOf));
  if (lD) evidence.push(fredEvidence("DRSFRMACBS", sourceName, lD.asOf));

  const ageSec = lM ? (Date.now() - new Date(lM.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [], deductions = [];
  if (lM && lM.value < 5) positives.push({ id: "mtg-low", label: "30Y mortgage rate below 5%", detail: `${lM.value.toFixed(2)}%` });
  if (lM && lM.value > 7) deductions.push({ id: "mtg-high", label: "30Y mortgage rate above 7%", detail: `${lM.value.toFixed(2)}%` });
  if (lD && lD.value > 4) deductions.push({ id: "mtg-del", label: "Mortgage delinquencies elevated", detail: `${lD.value.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (lM) verifyNext.push(checkFresh("v-mort-fresh", "30Y mortgage rate fresh", lM.asOf, DEFAULT_FRESHNESS.macro_release.maxAgeSeconds));
  verifyNext.push(pendingAi("v-housing-ai", "Cross-check affordability vs price index momentum"));

  return {
    id: "macro-us-housing",
    title: "US housing & mortgages",
    purpose: "30Y mortgage rate, housing starts and single-family mortgage delinquency.",
    background: {
      overview: "Housing is the single largest household balance-sheet item. Mortgage rates gate affordability, delinquencies flag stress, starts flag builder confidence.",
      whatCauses: ["Long-end Treasury yields", "MBS spreads", "Household income growth", "Regulation & underwriting standards"],
      assetsAffected: [{ label: "Homebuilders" }, { label: "REITs" }, { label: "Regional banks" }, { label: "Mortgage insurers" }],
      whatToWatch: ["Existing home sales", "Case-Shiller HPI", "Refi index"],
    },
    metrics: [
      { label: "30Y mortgage", value: lM ? `${lM.value.toFixed(2)}%` : "—", tone: lM && lM.value > 7 ? "negative" : lM && lM.value < 5 ? "positive" : "neutral" },
      { label: "Housing starts (k)", value: lS ? Math.round(lS.value).toLocaleString() : "—" },
      { label: "Mortgage delinq.", value: lD ? `${lD.value.toFixed(2)}%` : "—", tone: lD && lD.value > 4 ? "negative" : "neutral" },
    ],
    chart: makeTrend(mort, { format: "percent", zones: ZONE_MORTGAGE, project: 6 }),
    whatChanged: lM ? `30Y mortgage rate at ${lM.value.toFixed(2)}% (${new Date(lM.asOf).toLocaleDateString()}).` : "No mortgage data yet.",
    whyItMatters: "Affordability drives the housing cycle; delinquencies are an early credit-stress signal.",
    evidence, positives, deductions, verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
  };
}

function creditPanel(
  byMetric: ByMetric, sourceName: string,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const cc = byMetric.get("DRCCLACBS"), cons = byMetric.get("TOTALSL");
  const lCc = latest(cc), lCons = latest(cons);
  const consChgYoY = pctChangeYoY(cons);

  const evidence: Evidence[] = [];
  if (lCc)   evidence.push(fredEvidence("DRCCLACBS", sourceName, lCc.asOf));
  if (lCons) evidence.push(fredEvidence("TOTALSL", sourceName, lCons.asOf));

  const ageSec = lCc ? (Date.now() - new Date(lCc.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [], deductions = [];
  if (lCc && lCc.value < 3) positives.push({ id: "cc-low", label: "Credit-card delinquency contained", detail: `${lCc.value.toFixed(2)}%` });
  if (lCc && lCc.value > 4) deductions.push({ id: "cc-high", label: "Credit-card delinquency rising", detail: `${lCc.value.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (lCc) verifyNext.push(checkFresh("v-cc-fresh", "Credit card delinquency print fresh", lCc.asOf, 60 * 60 * 24 * 120));
  verifyNext.push(pendingAi("v-credit-ai", "Assess consumer credit stress vs labour market"));

  return {
    id: "macro-us-credit",
    title: "US household credit stress",
    purpose: "Credit-card delinquency, consumer credit outstanding and YoY growth.",
    background: {
      overview: "Household credit stress is where a slowdown shows up first. Rising delinquencies precede tightening lending standards and a broader credit contraction.",
      whatToWatch: ["SLOOS bank lending survey", "Auto loan delinquencies", "Charge-off rates"],
    },
    metrics: [
      { label: "Credit-card delinq.", value: lCc ? `${lCc.value.toFixed(2)}%` : "—", tone: lCc && lCc.value > 4 ? "negative" : "neutral" },
      { label: "Consumer credit ($bn)", value: lCons ? Math.round(lCons.value).toLocaleString() : "—" },
      { label: "Consumer credit YoY", value: consChgYoY !== null ? `${consChgYoY.toFixed(2)}%` : "—", tone: consChgYoY !== null ? tone(consChgYoY, true) : "neutral" },
    ],
    chart: makeTrend(cc, { format: "percent", zones: ZONE_DELINQ, project: 4 }),
    whatChanged: lCc ? `Credit-card delinquency at ${lCc.value.toFixed(2)}% (${new Date(lCc.asOf).toLocaleDateString()}).` : "No credit data yet.",
    whyItMatters: "Rising delinquencies flag consumer weakness before it shows in retail sales or payrolls.",
    evidence, positives, deductions, verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
  };
}

function businessGrowthPanel(
  byMetric: ByMetric, sourceName: string,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const bus = byMetric.get("BUSLOANS"), indpro = byMetric.get("INDPRO"), sent = byMetric.get("UMCSENT"), icsa = byMetric.get("ICSA");
  const lBus = latest(bus), lInd = latest(indpro), lSent = latest(sent), lIcsa = latest(icsa);
  const busYoY = pctChangeYoY(bus), indYoY = pctChangeYoY(indpro);

  const evidence: Evidence[] = [];
  if (lBus)  evidence.push(fredEvidence("BUSLOANS", sourceName, lBus.asOf));
  if (lInd)  evidence.push(fredEvidence("INDPRO", sourceName, lInd.asOf));
  if (lSent) evidence.push(fredEvidence("UMCSENT", sourceName, lSent.asOf));
  if (lIcsa) evidence.push(fredEvidence("ICSA", sourceName, lIcsa.asOf));

  const ageSec = lInd ? (Date.now() - new Date(lInd.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const verifyNext: VerifyCheck[] = [];
  if (lInd) verifyNext.push(checkFresh("v-ind-fresh", "Industrial production print fresh", lInd.asOf, 60 * 60 * 24 * 40));
  verifyNext.push(pendingAi("v-business-ai", "Cross-check business activity vs jobless claims trend"));

  return {
    id: "macro-us-business",
    title: "US business activity",
    purpose: "C&I loans, industrial production, consumer sentiment and initial jobless claims.",
    background: {
      overview: "Business lending, industrial output, sentiment and jobless claims form an early-warning composite for the real economy.",
      whatToWatch: ["SLOOS lending standards", "ISM Manufacturing", "Continuing claims"],
    },
    metrics: [
      { label: "C&I loans YoY", value: busYoY !== null ? `${busYoY.toFixed(2)}%` : "—", tone: busYoY !== null ? tone(busYoY, true) : "neutral" },
      { label: "Ind. production YoY", value: indYoY !== null ? `${indYoY.toFixed(2)}%` : "—", tone: indYoY !== null ? tone(indYoY, true) : "neutral" },
      { label: "Initial claims (k)", value: lIcsa ? Math.round(lIcsa.value / 1000).toLocaleString() : "—", tone: lIcsa && lIcsa.value > 300000 ? "negative" : "neutral" },
    ],
    chart: makeTrend(indpro, { format: "index", project: 4 }),
    whatChanged: lInd ? `Industrial production print for ${new Date(lInd.asOf).toLocaleDateString(undefined, { month: "long", year: "numeric" })}.` : "No data yet.",
    whyItMatters: "Business lending & activity trends lead earnings revisions by 1–2 quarters.",
    evidence, positives: [], deductions: [], verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
  };
}

async function buildComparePanels(): Promise<PanelData[]> {
  const [us, ez, uk] = await Promise.all([loadPoints("US"), loadPoints("EZ"), loadPoints("UK")]);

  const build = (title: string, purpose: string, series: Array<{ label: string; obs?: Obs[] }>, format: TrendSeries["format"], zones?: ChartZone[]): PanelData => {
    const base = series[0]?.obs;
    const chart: TrendSeries | undefined = base && base.length > 0 ? {
      points: toChartPoints(base, 120),
      compare: series[1]?.obs ? { label: series[1].label, points: toChartPoints(series[1].obs, 120) } : undefined,
      zones, format,
    } : undefined;

    const metrics: Metric[] = series.map((s) => {
      const l = latest(s.obs);
      return { label: s.label, value: l ? (format === "percent" ? `${l.value.toFixed(2)}%` : l.value.toLocaleString()) : "—" };
    });

    return {
      id: `macro-compare-${title.toLowerCase().replace(/\s+/g, "-")}`,
      title,
      purpose,
      metrics,
      chart,
      whatChanged: "Side-by-side comparison of US, Euro area and UK for this indicator.",
      whyItMatters: "Divergent regional dynamics create FX, rate-differential and cross-listed equity opportunities.",
      evidence: [],
      positives: [],
      deductions: [],
      verifyNext: [],
      confidence: { value: 60, penalties: [] },
    };
  };

  return [
    build("Policy rates", "Fed Funds vs ECB deposit rate vs BoE bank rate.", [
      { label: "US Fed Funds",  obs: us.byMetric.get("DFF") },
      { label: "EA ECB DFR",    obs: ez.byMetric.get("ECBDFR") },
      { label: "UK BoE rate",   obs: uk.byMetric.get("IUDBEDR") },
    ], "percent"),
    build("10Y sovereign yields", "US 10Y vs EA 10Y vs UK 10Y.", [
      { label: "US 10Y", obs: us.byMetric.get("DGS10") },
      { label: "EA 10Y", obs: ez.byMetric.get("IRLTLT01EZM156N") },
      { label: "UK 10Y", obs: uk.byMetric.get("IRLTLT01GBM156N") },
    ], "percent"),
    build("Unemployment", "US vs EA vs UK unemployment rate.", [
      { label: "US", obs: us.byMetric.get("UNRATE") },
      { label: "EA", obs: ez.byMetric.get("LRHUTTTTEZM156S") },
      { label: "UK", obs: uk.byMetric.get("LRHUTTTTGBM156S") },
    ], "percent", ZONE_UNRATE),
  ];
}

function placeholderPanels(region: MacroRegion, regionLabel: string): PanelData[] {
  return [{
    id: `macro-${region.toLowerCase()}-empty`,
    title: `${regionLabel} macro — standing by`,
    purpose: "The FRED ingester is wired but no observations have landed yet for this region.",
    metrics: [{ label: "Status", value: "no data", tone: "warning" }],
    whatChanged: "No data ingested yet.",
    whyItMatters: "Panels populate once ingestion runs. Hit /api/public/ingest/fred or wait for the scheduler.",
    evidence: [], positives: [],
    deductions: [{ id: "no-data", label: "No ingested observations", detail: "Confidence pinned to 0 until data arrives." }],
    verifyNext: [{ id: "manual-trigger", label: "POST /api/public/ingest/fred to backfill", verifier: "manual", status: "pending" }],
    confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: "No ingested observations yet." }] },
  }];
}