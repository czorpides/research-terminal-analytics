import { ProviderError, type PriceBar, type PriceProvider } from "./types";

export const alphavantage: PriceProvider = {
  code: "alphavantage", name: "Alpha Vantage", dailyLimit: 25, minMsBetweenCalls: 15000, priority: 4,
  envKey: "ALPHAVANTAGE_API_KEY", tier: "tier3_reputable",
  isConfigured() { return !!process.env.ALPHAVANTAGE_API_KEY; },
  async ping() {
    const key = process.env.ALPHAVANTAGE_API_KEY;
    if (!key) return { ok: false, detail: "ALPHAVANTAGE_API_KEY missing" };
    const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${key}`);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const j = await res.json() as Record<string, unknown>;
    if (j["Error Message"]) return { ok: false, detail: String(j["Error Message"]) };
    if (j["Note"]) return { ok: false, detail: String(j["Note"]) };
    if (j["Information"]) return { ok: false, detail: String(j["Information"]) };
    if (!j["Global Quote"]) return { ok: false, detail: "no data returned" };
    return { ok: true, detail: "ok" };
  },
  async fetchDaily(symbol, opts) {
    const key = process.env.ALPHAVANTAGE_API_KEY;
    if (!key) throw new ProviderError("no key", "auth");
    const size = opts.from && new Date(opts.from) > new Date(Date.now() - 100 * 86400_000) ? "compact" : "full";
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=${size}&apikey=${key}`;
    const res = await fetch(url);
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, "bad_response", res.status);
    const j = await res.json() as Record<string, unknown>;
    if (j["Error Message"]) throw new ProviderError(String(j["Error Message"]), "not_found");
    if (j["Note"] || j["Information"]) throw new ProviderError(String(j["Note"] ?? j["Information"]), "rate_limit", 429);
    const series = j["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined;
    if (!series) throw new ProviderError("no series", "bad_response");
    const rows: PriceBar[] = Object.entries(series).map(([date, v]) => ({
      date,
      open: Number(v["1. open"]),
      high: Number(v["2. high"]),
      low: Number(v["3. low"]),
      close: Number(v["4. close"]),
      adjClose: v["5. adjusted close"] ? Number(v["5. adjusted close"]) : null,
      volume: v["6. volume"] ? Number(v["6. volume"]) : null,
    })).sort((a, b) => a.date.localeCompare(b.date));
    return opts.from ? rows.filter((r) => r.date >= opts.from!) : rows;
  },
};