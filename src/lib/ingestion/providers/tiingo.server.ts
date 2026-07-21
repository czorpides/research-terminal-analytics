import { ProviderError, type PriceBar, type PriceProvider } from "./types";

export const tiingo: PriceProvider = {
  code: "tiingo", name: "Tiingo", dailyLimit: 1000, minMsBetweenCalls: 100, priority: 1,
  envKey: "TIINGO_API_KEY", tier: "tier2_regulated",
  isConfigured() { return !!process.env.TIINGO_API_KEY; },
  async ping() {
    const key = process.env.TIINGO_API_KEY;
    if (!key) return { ok: false, detail: "TIINGO_API_KEY missing" };
    const res = await fetch(`https://api.tiingo.com/api/test?token=${key}`);
    if (res.status === 401 || res.status === 403) return { ok: false, detail: `auth failed (${res.status})` };
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true, detail: await res.text() };
  },
  async fetchDaily(symbol, opts) {
    const key = process.env.TIINGO_API_KEY;
    if (!key) throw new ProviderError("no key", "auth");
    const url = new URL(`https://api.tiingo.com/tiingo/daily/${symbol.toLowerCase()}/prices`);
    if (opts.from) url.searchParams.set("startDate", opts.from);
    if (opts.to) url.searchParams.set("endDate", opts.to);
    url.searchParams.set("token", key);
    const res = await fetch(url.toString());
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "auth", res.status);
    if (res.status === 429) throw new ProviderError("rate", "rate_limit", 429);
    if (res.status === 404) throw new ProviderError("not found", "not_found", 404);
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, "bad_response", res.status);
    const json = await res.json() as Array<{ date: string; open: number; high: number; low: number; close: number; adjClose: number; volume: number }>;
    return json.map((r): PriceBar => ({
      date: r.date.slice(0, 10),
      open: r.open, high: r.high, low: r.low, close: r.close, adjClose: r.adjClose, volume: r.volume,
    }));
  },
};