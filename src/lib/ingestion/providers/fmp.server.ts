import { ProviderError, type PriceBar, type PriceProvider } from "./types";

export const fmp: PriceProvider = {
  code: "fmp", name: "Financial Modeling Prep", dailyLimit: 250, minMsBetweenCalls: 250, priority: 3,
  envKey: "FMP_API_KEY", tier: "tier2_regulated",
  isConfigured() { return !!process.env.FMP_API_KEY; },
  async ping() {
    const key = process.env.FMP_API_KEY;
    if (!key) return { ok: false, detail: "FMP_API_KEY missing" };
    const res = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=${key}`);
    if (res.status === 401 || res.status === 403) return { ok: false, detail: `auth failed (${res.status})` };
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const j = await res.json() as unknown;
    if (Array.isArray(j) && j.length === 0) return { ok: false, detail: "empty response — key likely invalid" };
    if (typeof j === "object" && j !== null && "Error Message" in j) return { ok: false, detail: String((j as { "Error Message": string })["Error Message"]) };
    return { ok: true, detail: "ok" };
  },
  async fetchDaily(symbol, opts) {
    const key = process.env.FMP_API_KEY;
    if (!key) throw new ProviderError("no key", "auth");
    const url = new URL(`https://financialmodelingprep.com/stable/historical-price-eod/full`);
    url.searchParams.set("symbol", symbol);
    if (opts.from) url.searchParams.set("from", opts.from);
    if (opts.to) url.searchParams.set("to", opts.to);
    url.searchParams.set("apikey", key);
    const res = await fetch(url.toString());
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "auth", res.status);
    if (res.status === 429 || res.status === 402) throw new ProviderError("rate", "rate_limit", res.status);
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, "bad_response", res.status);
    const j = await res.json() as unknown;
    const arr = Array.isArray(j)
      ? j as Array<{ date: string; open: number; high: number; low: number; close: number; adjClose?: number; volume?: number }>
      : (j as { historical?: Array<{ date: string; open: number; high: number; low: number; close: number; adjClose?: number; volume?: number }> }).historical ?? [];
    return arr.map((r): PriceBar => ({
      date: r.date, open: r.open, high: r.high, low: r.low, close: r.close,
      adjClose: r.adjClose ?? null, volume: r.volume ?? null,
    })).sort((a, b) => a.date.localeCompare(b.date));
  },
};