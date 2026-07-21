/**
 * Native macro series catalogue. Each entry pairs a native provider
 * series code with the `economic_indicators.code` row we seeded in the
 * migration, plus enough context for the ingest runner and the macro
 * panels to prefer native data when it's available.
 *
 * We keep the FRED series alive as fallback — the macro panel loader
 * transparently swaps the native metric_code in when data is present.
 */
export type NativeProvider = "ecb" | "ons" | "boe" | "hmrc";
export type NativeCadence  = "daily" | "monthly";

export interface NativeSeriesSpec {
  provider: NativeProvider;
  seriesCode: string;      // provider-native id, verbatim
  indicatorCode: string;   // economic_indicators.code
  cadence: NativeCadence;
  region: "EZ" | "UK";
  category: "rates" | "inflation" | "labor" | "business";
  label: string;
  /** Optional FRED series code this native series can override on the panel. */
  fredFallback?: string;
}

export const NATIVE_SERIES: NativeSeriesSpec[] = [
  // ── ECB SDW (Euro area) ──
  { provider: "ecb", seriesCode: "FM.D.U2.EUR.4F.KR.DFR.LEV", indicatorCode: "EZ_DFR_NATIVE",    cadence: "daily",   region: "EZ", category: "rates",     label: "ECB Deposit Facility Rate", fredFallback: "ECBDFR" },
  { provider: "ecb", seriesCode: "FM.M.U2.EUR.4F.BB.U2_10Y.YLD", indicatorCode: "EZ_10Y_NATIVE", cadence: "monthly", region: "EZ", category: "rates",     label: "EA 10Y Government Bond Yield", fredFallback: "IRLTLT01EZM156N" },
  { provider: "ecb", seriesCode: "ICP.M.U2.N.000000.4.ANR",  indicatorCode: "EZ_CPI_NATIVE",    cadence: "monthly", region: "EZ", category: "inflation", label: "EA HICP YoY", fredFallback: "CP0000EZ19M086NEST" },
  { provider: "ecb", seriesCode: "STS.M.I8.S.UNEH.RTT000.4.000", indicatorCode: "EZ_UNRATE_NATIVE", cadence: "monthly", region: "EZ", category: "labor", label: "EA Unemployment Rate", fredFallback: "LRHUTTTTEZM156S" },

  // ── BoE IADB (UK) ──
  { provider: "boe", seriesCode: "IUDBEDR", indicatorCode: "UK_BANK_RATE_NATIVE", cadence: "daily",   region: "UK", category: "rates", label: "UK Bank Rate" },
  { provider: "boe", seriesCode: "IUDMNZC", indicatorCode: "UK_10Y_NATIVE",       cadence: "daily",   region: "UK", category: "rates", label: "UK 10Y Gilt Yield", fredFallback: "IRLTLT01GBM156N" },
  { provider: "boe", seriesCode: "IUDSOIA", indicatorCode: "UK_SONIA_NATIVE",     cadence: "daily",   region: "UK", category: "rates", label: "UK SONIA", fredFallback: "IUDSOIA" },

  // ── ONS (UK) ──
  { provider: "ons", seriesCode: "cpih01/l55o", indicatorCode: "UK_CPI_NATIVE",    cadence: "monthly", region: "UK", category: "inflation", label: "UK CPIH YoY", fredFallback: "CPALTT01GBM657N" },
  { provider: "ons", seriesCode: "lms/mgsx",    indicatorCode: "UK_UNRATE_NATIVE", cadence: "monthly", region: "UK", category: "labor",     label: "UK Unemployment Rate", fredFallback: "LRHUTTTTGBM156S" },

  // ── HMRC ──
  { provider: "hmrc", seriesCode: "hmrc-tax-and-nics-receipts/vat",     indicatorCode: "UK_VAT_RECEIPTS",  cadence: "monthly", region: "UK", category: "business", label: "UK VAT Receipts (£m)" },
  { provider: "hmrc", seriesCode: "hmrc-tax-and-nics-receipts/paye_it", indicatorCode: "UK_PAYE_RECEIPTS", cadence: "monthly", region: "UK", category: "business", label: "UK PAYE Income Tax Receipts (£m)" },
  { provider: "hmrc", seriesCode: "hmrc-tax-and-nics-receipts/sa_it",   indicatorCode: "UK_SA_RECEIPTS",   cadence: "monthly", region: "UK", category: "business", label: "UK Self-Assessment Receipts (£m)" },
];

export function findNativeSeries(code: string): NativeSeriesSpec | undefined {
  return NATIVE_SERIES.find((s) => s.seriesCode === code || s.indicatorCode === code);
}

/** Reverse map: FRED series code → native override metric_code (if any). */
export function nativeOverrideForFred(fredCode: string): string | undefined {
  return NATIVE_SERIES.find((s) => s.fredFallback === fredCode)?.seriesCode;
}