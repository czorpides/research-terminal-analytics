/**
 * Curated FRED series wired into Phase 2. Each entry maps a FRED series
 * code to the economic_indicators.code we inserted in the migration.
 * Cadence drives the pg_cron schedule.
 */
export type FredCadence = "daily" | "monthly";

export interface FredSeriesSpec {
  seriesCode: string;      // FRED series id, e.g. "DGS10"
  indicatorCode: string;   // economic_indicators.code, e.g. "US_10Y"
  cadence: FredCadence;
  category: "rates" | "inflation" | "labor" | "growth" | "sentiment";
  label: string;
}

export const FRED_SERIES: FredSeriesSpec[] = [
  { seriesCode: "DGS10",    indicatorCode: "US_10Y",      cadence: "daily",   category: "rates",     label: "US 10Y" },
  { seriesCode: "DGS2",     indicatorCode: "US_2Y",       cadence: "daily",   category: "rates",     label: "US 2Y" },
  { seriesCode: "DGS3MO",   indicatorCode: "US_3M",       cadence: "daily",   category: "rates",     label: "US 3M" },
  { seriesCode: "DFII10",   indicatorCode: "US_10Y_REAL", cadence: "daily",   category: "rates",     label: "US 10Y real" },
  { seriesCode: "T10Y2Y",   indicatorCode: "US_T10Y2Y",   cadence: "daily",   category: "rates",     label: "10Y − 2Y" },
  { seriesCode: "DFF",      indicatorCode: "US_DFF",      cadence: "daily",   category: "rates",     label: "Fed Funds" },
  { seriesCode: "CPIAUCSL", indicatorCode: "US_CPI",      cadence: "monthly", category: "inflation", label: "US CPI" },
  { seriesCode: "CPILFESL", indicatorCode: "US_CORE_CPI", cadence: "monthly", category: "inflation", label: "US Core CPI" },
  { seriesCode: "UNRATE",   indicatorCode: "US_UNRATE",   cadence: "monthly", category: "labor",     label: "Unemployment" },
  { seriesCode: "PAYEMS",   indicatorCode: "US_PAYEMS",   cadence: "monthly", category: "labor",     label: "Nonfarm Payrolls" },
  { seriesCode: "INDPRO",   indicatorCode: "US_INDPRO",   cadence: "monthly", category: "growth",    label: "Industrial Production" },
  { seriesCode: "UMCSENT",  indicatorCode: "US_UMCSENT",  cadence: "monthly", category: "sentiment", label: "UMich Sentiment" },
];

export function findSeries(seriesCode: string): FredSeriesSpec | undefined {
  return FRED_SERIES.find((s) => s.seriesCode === seriesCode);
}