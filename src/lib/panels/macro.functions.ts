import { createServerFn } from "@tanstack/react-start";
import { computeConfidence } from "@/lib/reliability/confidence";
import { freshnessState, DEFAULT_FRESHNESS } from "@/lib/reliability/freshness";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, Evidence, VerifyCheck } from "./contract";

/**
 * Server function returning the live Macro section panels, sourced from
 * data_points populated by the FRED ingester.
 */
export const getMacroPanels = createServerFn({ method: "GET" }).handler(async (): Promise<PanelData[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { checkAboveMovingAverage, checkSpreadSign, checkFreshness, pendingAiCheck } = await import("@/lib/verify/runners.server");

  // Load FRED source id + indicators
  const [{ data: source }, { data: indicators }] = await Promise.all([
    supabaseAdmin.from("data_sources").select("id, name").eq("provider_code", "fred").maybeSingle(),
    supabaseAdmin.from("economic_indicators").select("id, code, name, provider_series_code, category").not("provider_series_code", "is", null),
  ]);
  if (!source || !indicators) return placeholderPanels("FRED source not registered.");

  const byCode = new Map(indicators.map((i) => [i.code, i]));

  // Pull last ~120 days for every relevant series in one query
  const codes = ["DGS10", "DGS2", "T10Y2Y", "DFF", "CPIAUCSL", "CPILFESL", "UNRATE", "PAYEMS", "INDPRO"];
  const indicatorIds = codes.map((c) => byCode.get(indicatorCodeFor(c))?.id).filter((x): x is string => !!x);
  const { data: points } = await supabaseAdmin
    .from("data_points")
    .select("subject_id, metric_code, value_num, as_of")
    .in("subject_id", indicatorIds)
    .order("as_of", { ascending: true })
    .limit(5000);

  const byMetric = new Map<string, Array<{ asOf: string; value: number }>>();
  (points ?? []).forEach((p) => {
    if (p.value_num === null) return;
    const arr = byMetric.get(p.metric_code as string) ?? [];
    arr.push({ asOf: p.as_of as string, value: Number(p.value_num) });
    byMetric.set(p.metric_code as string, arr);
  });

  if (byMetric.size === 0) {
    return placeholderPanels("No FRED data ingested yet. Trigger /api/public/ingest/fred to backfill.");
  }

  return [
    yieldCurvePanel(byMetric, source.name, checkAboveMovingAverage, checkSpreadSign, checkFreshness, pendingAiCheck),
    inflationPanel(byMetric, source.name, checkAboveMovingAverage, checkFreshness, pendingAiCheck),
    laborPanel(byMetric, source.name, checkFreshness, pendingAiCheck),
  ];
});

function indicatorCodeFor(seriesCode: string): string {
  const map: Record<string, string> = {
    DGS10: "US_10Y", DGS2: "US_2Y", DGS3MO: "US_3M", DFII10: "US_10Y_REAL",
    T10Y2Y: "US_T10Y2Y", DFF: "US_DFF", CPIAUCSL: "US_CPI", CPILFESL: "US_CORE_CPI",
    UNRATE: "US_UNRATE", PAYEMS: "US_PAYEMS", INDPRO: "US_INDPRO", UMCSENT: "US_UMCSENT",
  };
  return map[seriesCode];
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

function latest(arr?: Array<{ asOf: string; value: number }>) {
  return arr && arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function pctChangeYoY(arr?: Array<{ asOf: string; value: number }>): number | null {
  if (!arr || arr.length < 13) return null;
  const cur = arr[arr.length - 1];
  const yoy = arr[arr.length - 13];
  if (!cur || !yoy || yoy.value === 0) return null;
  return ((cur.value - yoy.value) / yoy.value) * 100;
}

function tone(v: number, positiveIsUp = true): "positive" | "negative" | "neutral" {
  if (Math.abs(v) < 1e-9) return "neutral";
  const up = v > 0;
  return up === positiveIsUp ? "positive" : "negative";
}

function yieldCurvePanel(
  byMetric: Map<string, Array<{ asOf: string; value: number }>>,
  sourceName: string,
  checkMA: typeof import("@/lib/verify/runners.server").checkAboveMovingAverage,
  checkSpread: typeof import("@/lib/verify/runners.server").checkSpreadSign,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const ten = byMetric.get("DGS10");
  const two = byMetric.get("DGS2");
  const spread = byMetric.get("T10Y2Y");
  const dff = byMetric.get("DFF");
  const l10 = latest(ten), l2 = latest(two), lSpread = latest(spread), lDff = latest(dff);

  const evidence: Evidence[] = [];
  if (l10)    evidence.push(fredEvidence("DGS10",  sourceName, l10.asOf));
  if (l2)     evidence.push(fredEvidence("DGS2",   sourceName, l2.asOf));
  if (lSpread) evidence.push(fredEvidence("T10Y2Y", sourceName, lSpread.asOf));
  if (lDff)   evidence.push(fredEvidence("DFF",    sourceName, lDff.asOf));

  const ageSec = l10 ? (Date.now() - new Date(l10.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [];
  const deductions = [];
  if (lSpread && lSpread.value < 0) deductions.push({ id: "curve-inv", label: "10Y − 2Y is inverted", detail: `${lSpread.value.toFixed(2)}pp` });
  if (lSpread && lSpread.value > 0) positives.push({ id: "curve-pos", label: "10Y − 2Y positive", detail: `${lSpread.value.toFixed(2)}pp` });
  if (l10 && l2 && lDff && l10.value > lDff.value) positives.push({ id: "10y-above-ff", label: "10Y trades above Fed Funds", detail: `${l10.value.toFixed(2)}% vs ${lDff.value.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (ten) verifyNext.push(checkMA("v-10y-ma", "10Y above 60-day moving average", ten, 60));
  verifyNext.push(checkSpread("v-curve-sign", "Yield curve non-inverted", lSpread?.value ?? null, "positive"));
  if (l10) verifyNext.push(checkFresh("v-10y-fresh", "10Y freshness within policy", l10.asOf, DEFAULT_FRESHNESS.macro_release.maxAgeSeconds));
  verifyNext.push(pendingAi("v-10y-ai", "Explain 10Y move in context of recent Fed speak"));

  return {
    id: "macro-curve",
    title: "Rates & yield curve",
    purpose: "Front-end policy rate, long-end pricing, and the 10Y−2Y term spread.",
    metrics: [
      { label: "US 10Y",    value: l10 ? `${l10.value.toFixed(2)}%` : "—", tone: "neutral" },
      { label: "US 2Y",     value: l2  ? `${l2.value.toFixed(2)}%` : "—", tone: "neutral" },
      { label: "10Y − 2Y",  value: lSpread ? `${lSpread.value.toFixed(2)}pp` : "—", tone: lSpread ? tone(lSpread.value, true) : "neutral" },
    ],
    whatChanged: l10 ? `Latest 10Y print: ${l10.value.toFixed(2)}% (${new Date(l10.asOf).toLocaleDateString()}).` : "No 10Y observations yet.",
    whyItMatters: "Steepness and level of the curve drive equity duration risk, bank NIMs and credit spreads.",
    evidence,
    positives,
    deductions,
    verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
    calculation: {
      formula: "spread = DGS10 − DGS2",
      ...stampCalculation("macro.curve.v0.1", { DGS10: l10?.value ?? null, DGS2: l2?.value ?? null }),
      inputs: { DGS10: l10?.value ?? null, DGS2: l2?.value ?? null, DFF: lDff?.value ?? null },
    },
  };
}

function inflationPanel(
  byMetric: Map<string, Array<{ asOf: string; value: number }>>,
  sourceName: string,
  checkMA: typeof import("@/lib/verify/runners.server").checkAboveMovingAverage,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const cpi = byMetric.get("CPIAUCSL");
  const core = byMetric.get("CPILFESL");
  const cpiYoY = pctChangeYoY(cpi);
  const coreYoY = pctChangeYoY(core);
  const lCpi = latest(cpi), lCore = latest(core);

  const evidence: Evidence[] = [];
  if (lCpi)  evidence.push(fredEvidence("CPIAUCSL", sourceName, lCpi.asOf));
  if (lCore) evidence.push(fredEvidence("CPILFESL", sourceName, lCore.asOf));

  const ageSec = lCpi ? (Date.now() - new Date(lCpi.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [];
  const deductions = [];
  if (coreYoY !== null && coreYoY < 3) positives.push({ id: "core-cool", label: "Core CPI YoY under 3%", detail: `${coreYoY.toFixed(2)}%` });
  if (coreYoY !== null && coreYoY > 3.5) deductions.push({ id: "core-hot", label: "Core CPI YoY still hot", detail: `${coreYoY.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (core) verifyNext.push(checkMA("v-core-ma", "Core CPI below 12-month MA", core.map((p) => ({ asOf: p.asOf, value: -p.value })), 12));
  if (lCpi) verifyNext.push(checkFresh("v-cpi-fresh", "CPI print within policy window", lCpi.asOf, 60 * 60 * 24 * 40));
  verifyNext.push(pendingAi("v-cpi-ai", "Decompose CPI drivers (shelter, services, goods)"));

  return {
    id: "macro-inflation",
    title: "Inflation pulse",
    purpose: "Headline and core CPI, YoY change vs the Fed's 2% target.",
    metrics: [
      { label: "CPI YoY",     value: cpiYoY  !== null ? `${cpiYoY.toFixed(2)}%`  : "—", tone: cpiYoY  !== null ? tone(cpiYoY - 2, false) : "neutral" },
      { label: "Core CPI YoY", value: coreYoY !== null ? `${coreYoY.toFixed(2)}%` : "—", tone: coreYoY !== null ? tone(coreYoY - 2, false) : "neutral" },
      { label: "Latest month", value: lCpi ? new Date(lCpi.asOf).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—" },
    ],
    whatChanged: lCpi ? `Latest CPI print for ${new Date(lCpi.asOf).toLocaleDateString(undefined, { month: "long", year: "numeric" })}.` : "No CPI data yet.",
    whyItMatters: "Sticky inflation delays rate cuts, compresses valuation multiples and pressures long-duration assets.",
    evidence,
    positives,
    deductions,
    verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
    calculation: {
      formula: "yoy = (level_t / level_{t-12} − 1) × 100",
      ...stampCalculation("macro.inflation.v0.1", { cpi: lCpi?.value ?? null, core: lCore?.value ?? null }),
      inputs: { cpi_level: lCpi?.value ?? null, core_level: lCore?.value ?? null, cpi_yoy: cpiYoY, core_yoy: coreYoY },
    },
  };
}

function laborPanel(
  byMetric: Map<string, Array<{ asOf: string; value: number }>>,
  sourceName: string,
  checkFresh: typeof import("@/lib/verify/runners.server").checkFreshness,
  pendingAi: typeof import("@/lib/verify/runners.server").pendingAiCheck,
): PanelData {
  const unrate = byMetric.get("UNRATE");
  const payems = byMetric.get("PAYEMS");
  const lUn = latest(unrate), lPay = latest(payems);
  const payemsChange = payems && payems.length >= 2 ? payems[payems.length - 1].value - payems[payems.length - 2].value : null;

  const evidence: Evidence[] = [];
  if (lUn)  evidence.push(fredEvidence("UNRATE", sourceName, lUn.asOf));
  if (lPay) evidence.push(fredEvidence("PAYEMS", sourceName, lPay.asOf));

  const ageSec = lUn ? (Date.now() - new Date(lUn.asOf).getTime()) / 1000 : Number.MAX_SAFE_INTEGER;
  const conf = computeConfidence({ tier: "tier1_official", category: "macro_release", ageSeconds: ageSec });

  const positives = [];
  const deductions = [];
  if (lUn && lUn.value < 4.5) positives.push({ id: "un-low", label: "Unemployment below 4.5%", detail: `${lUn.value.toFixed(2)}%` });
  if (lUn && lUn.value > 5)   deductions.push({ id: "un-high", label: "Unemployment above 5%", detail: `${lUn.value.toFixed(2)}%` });

  const verifyNext: VerifyCheck[] = [];
  if (lUn)  verifyNext.push(checkFresh("v-un-fresh", "Unemployment print fresh", lUn.asOf, 60 * 60 * 24 * 40));
  if (lPay) verifyNext.push(checkFresh("v-pay-fresh", "Payrolls print fresh", lPay.asOf, 60 * 60 * 24 * 40));
  verifyNext.push(pendingAi("v-labor-ai", "Cross-check payrolls with household survey"));

  return {
    id: "macro-labor",
    title: "Labor market",
    purpose: "Unemployment rate and nonfarm payrolls month-over-month change.",
    metrics: [
      { label: "Unemployment", value: lUn ? `${lUn.value.toFixed(2)}%` : "—", tone: lUn && lUn.value < 5 ? "positive" : "warning" },
      { label: "Payrolls Δ (MoM, k)", value: payemsChange !== null ? `${payemsChange > 0 ? "+" : ""}${payemsChange.toFixed(0)}` : "—", tone: payemsChange !== null ? tone(payemsChange, true) : "neutral" },
      { label: "Latest month", value: lUn ? new Date(lUn.asOf).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—" },
    ],
    whatChanged: lPay ? `Latest payrolls: ${Math.round(lPay.value).toLocaleString()}k jobs (${new Date(lPay.asOf).toLocaleDateString()}).` : "No payrolls data yet.",
    whyItMatters: "Labor tightness determines wage pressure, Fed policy path and consumer resilience.",
    evidence,
    positives,
    deductions,
    verifyNext,
    confidence: { value: conf.value, penalties: conf.penalties },
    calculation: {
      formula: "Δpayrolls = payems_t − payems_{t-1}",
      ...stampCalculation("macro.labor.v0.1", { unrate: lUn?.value ?? null, payems: lPay?.value ?? null }),
      inputs: { unemployment: lUn?.value ?? null, payrolls: lPay?.value ?? null, payrolls_change: payemsChange },
    },
  };
}

function placeholderPanels(message: string): PanelData[] {
  return [{
    id: "macro-empty",
    title: "Macro pipeline standing by",
    purpose: "The FRED ingester is wired but no observations have landed yet.",
    metrics: [{ label: "Status", value: "no data", tone: "warning" }],
    whatChanged: message,
    whyItMatters: "Panels will populate once ingestion runs — hit the public endpoint or wait for pg_cron.",
    evidence: [],
    positives: [],
    deductions: [{ id: "no-data", label: "No ingested observations", detail: "Confidence pinned to 0 until data arrives." }],
    verifyNext: [
      { id: "manual-trigger", label: "POST /api/public/ingest/fred to backfill", verifier: "manual", status: "pending" },
    ],
    confidence: { value: 0, penalties: [{ code: "no_data", points: 100, reason: "No ingested observations yet." }] },
  }];
}