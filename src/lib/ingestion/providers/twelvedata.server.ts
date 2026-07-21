import { ProviderError, type PriceBar, type PriceProvider } from "./types";

function toTd(sym: string): string { return sym.replace("-", "."); }

export const twelvedata: PriceProvider = {
  code: "twelvedata", name: "Twelve Data", dailyLimit: 800, minMsBetweenCalls: 8000, priority: 2,
  envKey: "TWELVEDATA_API_KEY", tier: "tier3_reputable",
  isConfigured() { return !!process.env.TWELVEDATA_API_KEY; },
  async ping() {
    const key = process.env.TWELVEDATA_API_KEY;
    if (!key) return { ok: false, detail: "TWELVEDATA_API_KEY missing" };
    const res = await fetch(`https://api.twelvedata.com/api_usage?apikey=${key}`);
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const j = await res.json() as { status?: string; code?: number; message?: string };
    if (j.status === "error") return { ok: false, detail: j.message ?? "error" };
    return { ok: true, detail: JSON.stringify(j) };
  },
  async fetchDaily(symbol, opts) {
    const key = process.env.TWELVEDATA_API_KEY;
    if (!key) throw new ProviderError("no key", "auth");
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("symbol", toTd(symbol));
    url.searchParams.set("interval", "1day");
    url.searchParams.set("outputsize", "5000");
    if (opts.from) url.searchParams.set("start_date", opts.from);
    if (opts.to) url.searchParams.set("end_date", opts.to);
    url.searchParams.set("apikey", key);
    const res = await fetch(url.toString());
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, "bad_response", res.status);
    const j = await res.json() as { status?: string; code?: number; message?: string; values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }> };
    if (j.status === "error") {
      if (j.code === 401 || j.code === 403) throw new ProviderError(j.message ?? "auth", "auth", j.code);
      if (j.code === 429) throw new ProviderError(j.message ?? "rate", "rate_limit", 429);
      throw new ProviderError(j.message ?? "error", "bad_response", j.code);
    }
    const rows = (j.values ?? []).map((r): PriceBar => ({
      date: r.datetime.slice(0, 10),
      open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close),
      volume: r.volume ? Number(r.volume) : null,
    })).reverse();
    return rows;
  },
};