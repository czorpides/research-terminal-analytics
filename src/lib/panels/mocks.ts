import { computeConfidence } from "@/lib/reliability/confidence";
import { stampCalculation } from "@/lib/reliability/version";
import type { PanelData, VerifyCheck } from "./contract";

type Section =
  | "command"
  | "macro"
  | "radar"
  | "screeners"
  | "history"
  | "alt-data"
  | "alerts"
  | "data-health";

function conf(
  tier: Parameters<typeof computeConfidence>[0]["tier"],
  category: Parameters<typeof computeConfidence>[0]["category"],
  ageSeconds: number,
  extras: Partial<Parameters<typeof computeConfidence>[0]> = {},
) {
  const r = computeConfidence({ tier, category, ageSeconds, ...extras });
  return { value: r.value, penalties: r.penalties };
}

/**
 * Deterministic hardcoded mocks so every route renders end-to-end
 * without any provider wired in. Everything is clearly marked MOCK.
 */
export function getPanelsForSection(section: Section): PanelData[] {
  switch (section) {
    case "command":
      return [
        {
          id: "cc-1",
          title: "Top research priority — US 10Y yield inflection",
          purpose: "Surface the single highest-ranked research candidate right now.",
          metrics: [
            { label: "US 10Y", value: "4.32%", delta: "+18bp / 5d", tone: "warning" },
            { label: "Priority score", value: "82 / 100", tone: "positive" },
            { label: "Cohort hit rate (5y)", value: "68%", tone: "neutral" },
          ],
          whatChanged:
            "10Y Treasury yield broke above its 60-day range with above-average volume in the futures market.",
          whyItMatters:
            "Historical episodes with a similar breakout have preceded rotation from long-duration equities into value and financials within 10 trading days.",
          evidence: mockEvidence(),
          positives: [
            { id: "p1", label: "Volume in TY futures 1.8× 30-day average", weight: 3 },
            { id: "p2", label: "Consistent signal across FRED and Treasury Direct", weight: 2 },
          ],
          deductions: [
            { id: "d1", label: "News API stale (>6h)", weight: -2, detail: "Confidence penalised for news freshness." },
          ],
          verifyNext: [
            {
              id: "v1",
              label: "Confirm move survives next US CPI print",
              verifier: "api",
              status: "pending",
              detail: "Will re-evaluate on next FRED CPIAUCSL release.",
            },
            {
              id: "v2",
              label: "Check MOVE index for corroborating vol regime",
              verifier: "algo",
              status: "pending",
              detail: "Deterministic cross-check once MOVE series is wired.",
            },
            {
              id: "v3",
              label: "Compare against real-yield decomposition (10Y − 10Y TIPS)",
              verifier: "ai",
              status: "unavailable",
              detail: "AI commentary layer arrives in a later phase.",
            },
          ],
          confidence: conf("tier1_official", "macro_release", 60 * 60 * 8, { crossSourceAgreement: 0.9 }),
          calculation: {
            formula: "priority = 0.4·anomaly + 0.3·breadth + 0.2·regime_fit + 0.1·recency",
            ...stampCalculation("radar.v0.1", { anomaly: 0.85, breadth: 0.7, regime_fit: 0.6, recency: 1 }),
            inputs: { anomaly: 0.85, breadth: 0.7, regime_fit: 0.6, recency: 1 },
            weights: { anomaly: 0.4, breadth: 0.3, regime_fit: 0.2, recency: 0.1 },
          },
        },
        panelStub("cc-2", "Regime today", "Deterministic classification of the current market environment.", [
          { label: "Regime", value: "Late-cycle / rising real yields", tone: "warning" },
          { label: "Confidence", value: "74", tone: "neutral" },
        ]),
        panelStub("cc-3", "Upcoming catalysts (7d)", "Scheduled events that could shift expectations.", [
          { label: "Macro releases", value: "6" },
          { label: "Earnings prints", value: "42" },
          { label: "Central bank speak", value: "3" },
        ]),
      ];
    case "macro":
      return [
        panelStub("m-1", "Growth pulse", "Composite from PMI, industrial production and jobless claims.", [
          { label: "US composite", value: "51.4", delta: "-0.6", tone: "warning" },
          { label: "EU composite", value: "48.9", delta: "+0.3", tone: "neutral" },
        ]),
        panelStub("m-2", "Inflation pulse", "Sticky vs headline CPI decomposition across regions.", [
          { label: "US CPI YoY", value: "3.1%", delta: "-0.2pp", tone: "positive" },
          { label: "US core", value: "3.6%", delta: "0.0pp", tone: "neutral" },
        ]),
        panelStub("m-3", "Release surprise monitor", "Actual vs consensus for the last 5 sessions.", [
          { label: "Positive surprises", value: "7" },
          { label: "Negative surprises", value: "3" },
        ]),
      ];
    case "radar":
      return [
        panelStub("r-1", "Opportunity radar — top 10", "Ranked research candidates with every deduction shown.", [
          { label: "Candidates ranked", value: "0 / 500", tone: "neutral" },
          { label: "Calc version", value: "radar.v0.1" },
        ]),
        panelStub("r-2", "Rejected but interesting", "Would-rank candidates blocked by a single deduction.", [
          { label: "Rejected", value: "0" },
        ]),
      ];
    case "screeners":
      return [
        panelStub("s-1", "Equity screener", "Filter equities across factors, fundamentals and sensitivity.", [
          { label: "Universe", value: "0 tickers loaded", tone: "warning" },
        ]),
        panelStub("s-2", "Industry / commodity / asset screeners", "Cross-asset filtering with visible penalties.", [
          { label: "Screeners available", value: "4" },
        ]),
      ];
    case "history":
      return [
        panelStub("h-1", "Historical event engine", "Similarity search across regimes with distribution of forward returns.", [
          { label: "Reference episodes", value: "0" },
        ]),
        panelStub("h-2", "Sensitivity matrix", "Beta and R² of subjects vs macro / commodity drivers.", [
          { label: "Drivers tracked", value: "0" },
        ]),
      ];
    case "alt-data":
      return [
        panelStub("a-1", "Alternative data signals", "Web, satellite, hiring, patents — each with a hard confidence penalty.", [
          { label: "Signals wired", value: "0" },
        ]),
      ];
    case "alerts":
      return [
        panelStub("al-1", "Alert rules", "Deterministic conditions on any tracked metric.", [
          { label: "Active rules", value: "0" },
        ]),
        panelStub("al-2", "Triggered alerts", "History of fired alerts with the exact evaluation that fired them.", [
          { label: "Last 30d", value: "0" },
        ]),
      ];
    case "data-health":
      return [
        panelStub("dh-1", "Sources", "Configured providers, tier and last successful ingestion.", [
          { label: "Providers", value: "4 seeded", tone: "positive" },
          { label: "Active", value: "0", tone: "warning" },
        ]),
        panelStub("dh-2", "Ingestion runs", "Recent runs, row counts and failures.", [
          { label: "Runs (24h)", value: "0" },
        ]),
        panelStub("dh-3", "Freshness policies", "Max-age / warn-age per data category driving the confidence penalty.", [
          { label: "Categories", value: "10 configured" },
        ]),
      ];
  }
}

function panelStub(id: string, title: string, purpose: string, metrics: PanelData["metrics"]): PanelData {
  return {
    id,
    title,
    purpose,
    metrics,
    whatChanged: "No live data wired yet — this panel is a scaffold following the universal panel contract.",
    whyItMatters:
      "The panel will explain the transmission mechanism once its data source is connected in a later phase.",
    evidence: [],
    positives: [],
    deductions: [
      { id: `${id}-mock`, label: "Panel is a scaffold (no provider)", weight: -100, detail: "Confidence is pinned to 0 until a source is wired." },
    ],
    verifyNext: [
      {
        id: `${id}-v0`,
        label: "Wire the data source for this panel in a later phase.",
        verifier: "manual",
        status: "pending",
      },
    ],
    confidence: { value: 0, penalties: [{ code: "no_source", points: 100, reason: "No provider wired for this panel yet." }] },
  };
}

function mockEvidence(): PanelData["evidence"] {
  return [
    {
      id: "e1",
      label: "US 10Y yield time series",
      sourceName: "FRED (Federal Reserve)",
      tier: "tier1_official",
      asOf: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      freshness: "warn",
      agrees: true,
      url: "https://fred.stlouisfed.org/series/DGS10",
    },
    {
      id: "e2",
      label: "TY futures volume",
      sourceName: "CME (mock)",
      tier: "tier2_regulated",
      asOf: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      freshness: "fresh",
      agrees: true,
    },
    {
      id: "e3",
      label: "Macro news wire",
      sourceName: "News aggregator (mock)",
      tier: "tier3_reputable",
      asOf: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
      freshness: "stale",
      agrees: false,
    },
  ];
}