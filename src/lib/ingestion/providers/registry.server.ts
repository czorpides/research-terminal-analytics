import { tiingo } from "./tiingo.server";
import { twelvedata } from "./twelvedata.server";
import { fmp } from "./fmp.server";
import { alphavantage } from "./alphavantage.server";
import { canUse, recordCall } from "./quota.server";
import type { PriceBar, PriceProvider, ProviderCode } from "./types";
import { ProviderError } from "./types";

export const ALL_PROVIDERS: PriceProvider[] = [tiingo, twelvedata, fmp, alphavantage];

export function getProvider(code: ProviderCode): PriceProvider {
  const p = ALL_PROVIDERS.find((x) => x.code === code);
  if (!p) throw new Error(`Unknown provider ${code}`);
  return p;
}

/** Pick the highest-priority configured provider with remaining quota. */
export async function pickProvider(exclude: ProviderCode[] = []): Promise<PriceProvider | null> {
  const sorted = [...ALL_PROVIDERS].sort((a, b) => a.priority - b.priority);
  for (const p of sorted) {
    if (exclude.includes(p.code) || !p.isConfigured()) continue;
    const { ok } = await canUse(p.code, p.dailyLimit);
    if (ok) return p;
  }
  return null;
}

/** Fetch bars via preferred provider; fail over to the next on auth/rate/network errors. */
export async function fetchWithFailover(symbol: string, opts: { from?: string; to?: string } = {}): Promise<{ provider: ProviderCode; bars: PriceBar[]; attempts: Array<{ provider: ProviderCode; error: string }> }> {
  const attempts: Array<{ provider: ProviderCode; error: string }> = [];
  const excluded: ProviderCode[] = [];
  for (let i = 0; i < ALL_PROVIDERS.length; i++) {
    const p = await pickProvider(excluded);
    if (!p) break;
    try {
      const bars = await p.fetchDaily(symbol, opts);
      await recordCall(p.code, "ok");
      return { provider: p.code, bars, attempts };
    } catch (e) {
      const err = e as ProviderError;
      const status = err.code === "rate_limit" ? "rate_limit" : err.code === "auth" ? "auth" : "error";
      await recordCall(p.code, status, err.message);
      attempts.push({ provider: p.code, error: `${err.code}: ${err.message}` });
      excluded.push(p.code);
    }
  }
  throw new Error(`All providers failed for ${symbol}: ${JSON.stringify(attempts)}`);
}

/** Cross-check the latest close using a different provider. */
export async function crossVerifyLatest(symbol: string, primary: ProviderCode, expectedClose: number, expectedDate: string): Promise<{ verifier: ProviderCode | null; agrees: boolean; delta?: number; detail: string }> {
  const candidates = ALL_PROVIDERS
    .filter((p) => p.code !== primary && p.isConfigured())
    .sort((a, b) => a.priority - b.priority);
  for (const p of candidates) {
    const { ok } = await canUse(p.code, p.dailyLimit);
    if (!ok) continue;
    try {
      const bars = await p.fetchDaily(symbol, { from: expectedDate, to: expectedDate });
      await recordCall(p.code, "ok");
      const bar = bars.find((b) => b.date === expectedDate) ?? bars[bars.length - 1];
      if (!bar) return { verifier: p.code, agrees: false, detail: `${p.name}: no bar for ${expectedDate}` };
      const delta = Math.abs((bar.close - expectedClose) / expectedClose);
      const agrees = delta <= 0.005;
      return { verifier: p.code, agrees, delta, detail: `${p.name}: ${bar.close.toFixed(2)} vs ${expectedClose.toFixed(2)} (${(delta * 100).toFixed(2)}%)` };
    } catch (e) {
      const err = e as ProviderError;
      await recordCall(p.code, err.code === "rate_limit" ? "rate_limit" : err.code === "auth" ? "auth" : "error", err.message);
    }
  }
  return { verifier: null, agrees: false, detail: "no verifier available" };
}

export async function pingAll(): Promise<Array<{ code: ProviderCode; name: string; configured: boolean; ok: boolean; detail: string }>> {
  const out: Array<{ code: ProviderCode; name: string; configured: boolean; ok: boolean; detail: string }> = [];
  for (const p of ALL_PROVIDERS) {
    if (!p.isConfigured()) { out.push({ code: p.code, name: p.name, configured: false, ok: false, detail: `missing ${p.envKey}` }); continue; }
    try {
      const r = await p.ping();
      out.push({ code: p.code, name: p.name, configured: true, ok: r.ok, detail: r.detail.slice(0, 300) });
    } catch (e) {
      out.push({ code: p.code, name: p.name, configured: true, ok: false, detail: (e as Error).message });
    }
  }
  return out;
}