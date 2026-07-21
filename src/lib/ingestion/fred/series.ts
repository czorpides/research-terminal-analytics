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
  category: "rates" | "inflation" | "labor" | "growth" | "sentiment" | "housing" | "credit" | "business";
  region: "US" | "EZ" | "UK";
  label: string;
}

export const FRED_SERIES: FredSeriesSpec[] = [
  // ── United States ──
  { seriesCode: "DGS10",       indicatorCode: "US_10Y",         cadence: "daily",   region: "US", category: "rates",     label: "US 10Y" },
  { seriesCode: "DGS2",        indicatorCode: "US_2Y",          cadence: "daily",   region: "US", category: "rates",     label: "US 2Y" },
  { seriesCode: "DGS3MO",      indicatorCode: "US_3M",          cadence: "daily",   region: "US", category: "rates",     label: "US 3M" },
  { seriesCode: "DFII10",      indicatorCode: "US_10Y_REAL",    cadence: "daily",   region: "US", category: "rates",     label: "US 10Y real" },
  { seriesCode: "T10Y2Y",      indicatorCode: "US_T10Y2Y",      cadence: "daily",   region: "US", category: "rates",     label: "10Y − 2Y" },
  { seriesCode: "DFF",         indicatorCode: "US_DFF",         cadence: "daily",   region: "US", category: "rates",     label: "Fed Funds" },
  { seriesCode: "CPIAUCSL",    indicatorCode: "US_CPI",         cadence: "monthly", region: "US", category: "inflation", label: "US CPI" },
  { seriesCode: "CPILFESL",    indicatorCode: "US_CORE_CPI",    cadence: "monthly", region: "US", category: "inflation", label: "US Core CPI" },
  { seriesCode: "UNRATE",      indicatorCode: "US_UNRATE",      cadence: "monthly", region: "US", category: "labor",     label: "Unemployment" },
  { seriesCode: "PAYEMS",      indicatorCode: "US_PAYEMS",      cadence: "monthly", region: "US", category: "labor",     label: "Nonfarm Payrolls" },
  { seriesCode: "ICSA",        indicatorCode: "US_ICSA",        cadence: "monthly", region: "US", category: "labor",     label: "Initial Jobless Claims" },
  { seriesCode: "INDPRO",      indicatorCode: "US_INDPRO",      cadence: "monthly", region: "US", category: "growth",    label: "Industrial Production" },
  { seriesCode: "UMCSENT",     indicatorCode: "US_UMCSENT",     cadence: "monthly", region: "US", category: "sentiment", label: "UMich Sentiment" },
  { seriesCode: "MORTGAGE30US",indicatorCode: "US_MORTGAGE30",  cadence: "monthly", region: "US", category: "housing",   label: "30Y Mortgage Rate" },
  { seriesCode: "HOUST",       indicatorCode: "US_HOUST",       cadence: "monthly", region: "US", category: "housing",   label: "Housing Starts" },
  { seriesCode: "DRCCLACBS",   indicatorCode: "US_CC_DELINQ",   cadence: "monthly", region: "US", category: "credit",    label: "Credit Card Delinquency" },
  { seriesCode: "DRSFRMACBS",  indicatorCode: "US_MTG_DELINQ",  cadence: "monthly", region: "US", category: "credit",    label: "Mortgage Delinquency" },
  { seriesCode: "TOTALSL",     indicatorCode: "US_CONS_CREDIT", cadence: "monthly", region: "US", category: "credit",    label: "Consumer Credit" },
  { seriesCode: "BUSLOANS",    indicatorCode: "US_BUSLOANS",    cadence: "monthly", region: "US", category: "business",  label: "C&I Loans" },

  // ── Euro area ──
  { seriesCode: "ECBDFR",             indicatorCode: "EZ_DFR",    cadence: "daily",   region: "EZ", category: "rates",     label: "ECB Deposit Rate" },
  { seriesCode: "IRLTLT01EZM156N",    indicatorCode: "EZ_10Y",    cadence: "monthly", region: "EZ", category: "rates",     label: "EA 10Y Yield" },
  { seriesCode: "CP0000EZ19M086NEST", indicatorCode: "EZ_CPI",    cadence: "monthly", region: "EZ", category: "inflation", label: "EA HICP" },
  { seriesCode: "LRHUTTTTEZM156S",    indicatorCode: "EZ_UNRATE", cadence: "monthly", region: "EZ", category: "labor",     label: "EA Unemployment" },

  // ── United Kingdom ──
  { seriesCode: "IUDSOIA",         indicatorCode: "UK_BANK_RATE", cadence: "daily",   region: "UK", category: "rates",     label: "UK SONIA (BoE proxy)" },
  { seriesCode: "IRLTLT01GBM156N", indicatorCode: "UK_10Y",       cadence: "monthly", region: "UK", category: "rates",     label: "UK 10Y Gilt" },
  { seriesCode: "CPALTT01GBM657N", indicatorCode: "UK_CPI",       cadence: "monthly", region: "UK", category: "inflation", label: "UK CPI YoY" },
  { seriesCode: "LRHUTTTTGBM156S", indicatorCode: "UK_UNRATE",    cadence: "monthly", region: "UK", category: "labor",     label: "UK Unemployment" },
];

export function findSeries(seriesCode: string): FredSeriesSpec | undefined {
  return FRED_SERIES.find((s) => s.seriesCode === seriesCode);
}