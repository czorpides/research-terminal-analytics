/**
 * Curated equity universe wired into Phase 3. Every symbol here must also
 * exist in the `assets` table (seeded via migration).
 */
export interface StooqSpec {
  symbol: string;
  category: "etf" | "equity";
}

export const STOOQ_UNIVERSE: StooqSpec[] = [
  // ETFs
  { symbol: "SPY", category: "etf" }, { symbol: "QQQ", category: "etf" },
  { symbol: "IWM", category: "etf" }, { symbol: "DIA", category: "etf" },
  { symbol: "VTI", category: "etf" }, { symbol: "EFA", category: "etf" },
  { symbol: "EEM", category: "etf" }, { symbol: "TLT", category: "etf" },
  { symbol: "GLD", category: "etf" }, { symbol: "USO", category: "etf" },
  // Technology
  { symbol: "AAPL", category: "equity" }, { symbol: "MSFT", category: "equity" },
  { symbol: "NVDA", category: "equity" }, { symbol: "AVGO", category: "equity" },
  { symbol: "ORCL", category: "equity" }, { symbol: "CRM", category: "equity" },
  { symbol: "AMD", category: "equity" }, { symbol: "ADBE", category: "equity" },
  { symbol: "INTC", category: "equity" }, { symbol: "CSCO", category: "equity" },
  { symbol: "QCOM", category: "equity" },
  // Communication Services
  { symbol: "GOOGL", category: "equity" }, { symbol: "META", category: "equity" },
  { symbol: "NFLX", category: "equity" }, { symbol: "DIS", category: "equity" },
  { symbol: "T", category: "equity" }, { symbol: "VZ", category: "equity" },
  // Consumer Discretionary
  { symbol: "AMZN", category: "equity" }, { symbol: "TSLA", category: "equity" },
  { symbol: "HD", category: "equity" }, { symbol: "MCD", category: "equity" },
  { symbol: "NKE", category: "equity" }, { symbol: "LOW", category: "equity" },
  { symbol: "SBUX", category: "equity" },
  // Consumer Staples
  { symbol: "WMT", category: "equity" }, { symbol: "PG", category: "equity" },
  { symbol: "KO", category: "equity" }, { symbol: "PEP", category: "equity" },
  { symbol: "COST", category: "equity" },
  // Financials
  { symbol: "JPM", category: "equity" }, { symbol: "BAC", category: "equity" },
  { symbol: "WFC", category: "equity" }, { symbol: "GS", category: "equity" },
  { symbol: "MS", category: "equity" }, { symbol: "BLK", category: "equity" },
  { symbol: "V", category: "equity" }, { symbol: "MA", category: "equity" },
  { symbol: "BRK-B", category: "equity" },
  // Health Care
  { symbol: "UNH", category: "equity" }, { symbol: "JNJ", category: "equity" },
  { symbol: "LLY", category: "equity" }, { symbol: "PFE", category: "equity" },
  { symbol: "MRK", category: "equity" }, { symbol: "ABBV", category: "equity" },
  { symbol: "TMO", category: "equity" },
  // Industrials
  { symbol: "BA", category: "equity" }, { symbol: "CAT", category: "equity" },
  { symbol: "GE", category: "equity" }, { symbol: "HON", category: "equity" },
  { symbol: "UPS", category: "equity" },
  // Energy
  { symbol: "XOM", category: "equity" }, { symbol: "CVX", category: "equity" },
  { symbol: "COP", category: "equity" },
  // Materials
  { symbol: "LIN", category: "equity" }, { symbol: "FCX", category: "equity" },
  // Utilities
  { symbol: "NEE", category: "equity" }, { symbol: "DUK", category: "equity" },
  // Real Estate
  { symbol: "AMT", category: "equity" }, { symbol: "PLD", category: "equity" },
];

/** Stooq uses lowercase and dots; BRK-B → brk-b.us */
export function toStooqSymbol(symbol: string): string {
  return `${symbol.toLowerCase()}.us`;
}