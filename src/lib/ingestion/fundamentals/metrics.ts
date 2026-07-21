/**
 * Canonical fundamentals metric codes stored in `data_points`. Keep this
 * list in one place so the ingester, valuation/quality scorers and UI panels
 * all agree on shape and semantics.
 */
export const FUNDAMENTAL_METRICS = {
  pe:            "FUND_PE_TTM",
  pb:            "FUND_PB",
  ps:            "FUND_PS_TTM",
  evEbitda:      "FUND_EV_EBITDA_TTM",
  fcfYield:      "FUND_FCF_YIELD_TTM",
  roe:           "FUND_ROE_TTM",
  roic:          "FUND_ROIC_TTM",
  grossMargin:   "FUND_GROSS_MARGIN_TTM",
  netMargin:     "FUND_NET_MARGIN_TTM",
  debtEquity:    "FUND_DEBT_EQUITY",
  currentRatio:  "FUND_CURRENT_RATIO",
  marketCap:     "FUND_MARKET_CAP",
  beta:          "FUND_BETA",
} as const;

export type FundamentalKey = keyof typeof FUNDAMENTAL_METRICS;
export const FUND_CODES = Object.values(FUNDAMENTAL_METRICS);

/** Lower multiple = cheaper. Higher yield/ROE = better. */
export const VALUATION_LOWER_IS_BETTER: Array<{ code: string; label: string; direction: "low" | "high" }> = [
  { code: FUNDAMENTAL_METRICS.pe,        label: "P/E",         direction: "low" },
  { code: FUNDAMENTAL_METRICS.pb,        label: "P/B",         direction: "low" },
  { code: FUNDAMENTAL_METRICS.ps,        label: "P/S",         direction: "low" },
  { code: FUNDAMENTAL_METRICS.evEbitda,  label: "EV/EBITDA",   direction: "low" },
  { code: FUNDAMENTAL_METRICS.fcfYield,  label: "FCF yield",   direction: "high" },
];

export const QUALITY_METRICS: Array<{ code: string; label: string; direction: "low" | "high" }> = [
  { code: FUNDAMENTAL_METRICS.roe,          label: "ROE",           direction: "high" },
  { code: FUNDAMENTAL_METRICS.roic,         label: "ROIC",          direction: "high" },
  { code: FUNDAMENTAL_METRICS.grossMargin,  label: "Gross margin",  direction: "high" },
  { code: FUNDAMENTAL_METRICS.netMargin,    label: "Net margin",    direction: "high" },
  { code: FUNDAMENTAL_METRICS.debtEquity,   label: "Debt/Equity",   direction: "low" },
  { code: FUNDAMENTAL_METRICS.currentRatio, label: "Current ratio", direction: "high" },
];