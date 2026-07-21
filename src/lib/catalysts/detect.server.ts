import type { Catalyst } from "@/lib/panels/contract";
import { MACRO_RULES, COMMODITY_RULES, ALT_DATA_RULES, CATALYST_MAPPINGS_VERSION } from "./mappings";

/**
 * Deterministic catalyst detector. Given an industry, returns the currently
 * active macro / commodity / alt-data events plausibly pressuring or
 * supporting assets in that industry. Every catalyst is auditable — see
 * `reasoning` + `asOf`. Version: catalyst.detect.v0.1
 */
export interface DetectCatalystsArgs { industryCode: string | null; }

export async function detectCatalystsForIndustry({ industryCode }: DetectCatalystsArgs): Promise<Catalyst[]> {
  if (!industryCode) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: Catalyst[] = [];
  const now = Date.now();
  const ninetyDaysAgo = new Date(now - 90 * 86_400_000).toISOString();
  const sixtyDaysAgo = new Date(now - 60 * 86_400_000).toISOString();

  // Macro
  const macroRules = MACRO_RULES.filter((r) => r.industryCode === industryCode);
  if (macroRules.length > 0) {
    const codes = [...new Set(macroRules.map((r) => r.indicatorCode))];
    const { data: indicators } = await supabaseAdmin.from("economic_indicators").select("id, code").in("code", codes);
    const idByCode = new Map<string, string>();
    for (const i of indicators ?? []) idByCode.set(i.code as string, i.id as string);
    if (idByCode.size > 0) {
      const { data: releases } = await supabaseAdmin
        .from("economic_releases").select("indicator_id, release_time, actual")
        .in("indicator_id", [...idByCode.values()])
        .gte("release_time", sixtyDaysAgo).order("release_time", { ascending: false });
      const byInd = new Map<string, Array<{ ts: string; actual: number }>>();
      for (const r of releases ?? []) {
        if (r.actual == null) continue;
        const arr = byInd.get(r.indicator_id as string) ?? [];
        arr.push({ ts: r.release_time as string, actual: Number(r.actual) });
        byInd.set(r.indicator_id as string, arr);
      }
      for (const rule of macroRules) {
        const id = idByCode.get(rule.indicatorCode);
        if (!id) continue;
        const s = byInd.get(id);
        if (!s || s.length < 2) continue;
        const latest = s[0]; const prior = s[s.length - 1];
        if (prior.actual === 0) continue;
        const pct = ((latest.actual - prior.actual) / Math.abs(prior.actual)) * 100;
        const abs = Math.abs(pct);
        if (abs < 2) continue;
        const magnitude: 1 | 2 | 3 = abs >= 10 ? 3 : abs >= 5 ? 2 : 1;
        const rising = pct > 0;
        const helps = (rising && rule.sign === 1) || (!rising && rule.sign === -1);
        out.push({
          id: `cat-macro-${rule.indicatorCode}-${rule.industryCode}`,
          kind: "macro",
          direction: helps ? "tailwind" : "pressure",
          magnitude,
          headline: `${rule.seriesLabel} ${rising ? "↑" : "↓"} ${pct.toFixed(1)}% vs ~30d ago`,
          source: "FRED",
          asOf: latest.ts,
          reasoning: rising ? rule.reasoningUp : rule.reasoningDown,
          historicalNote: rule.historicalNote,
        });
      }
    }
  }

  // Commodities
  const commodityRules = COMMODITY_RULES.filter((r) => r.industryCode === industryCode);
  if (commodityRules.length > 0) {
    const codes = [...new Set(commodityRules.map((r) => r.commodityCode))];
    const { data: commodities } = await supabaseAdmin.from("commodities").select("id, code").in("code", codes);
    const idByCode = new Map<string, string>();
    for (const c of commodities ?? []) idByCode.set(c.code as string, c.id as string);
    if (idByCode.size > 0) {
      const { data: prices } = await supabaseAdmin
        .from("commodity_prices").select("commodity_id, ts, price")
        .in("commodity_id", [...idByCode.values()])
        .gte("ts", sixtyDaysAgo).order("ts", { ascending: false });
      const byCom = new Map<string, Array<{ ts: string; price: number }>>();
      for (const p of prices ?? []) {
        const arr = byCom.get(p.commodity_id as string) ?? [];
        arr.push({ ts: p.ts as string, price: Number(p.price) });
        byCom.set(p.commodity_id as string, arr);
      }
      for (const rule of commodityRules) {
        const id = idByCode.get(rule.commodityCode);
        if (!id) continue;
        const s = byCom.get(id);
        if (!s || s.length < 2) continue;
        const latest = s[0];
        const cutoff = now - 28 * 86_400_000;
        const prior = s.find((p) => new Date(p.ts).getTime() <= cutoff) ?? s[s.length - 1];
        if (prior.price === 0) continue;
        const pct = ((latest.price - prior.price) / Math.abs(prior.price)) * 100;
        const abs = Math.abs(pct);
        if (abs < 5) continue;
        const magnitude: 1 | 2 | 3 = abs >= 20 ? 3 : abs >= 10 ? 2 : 1;
        const rising = pct > 0;
        const helps = (rising && rule.sign === 1) || (!rising && rule.sign === -1);
        out.push({
          id: `cat-com-${rule.commodityCode}-${rule.industryCode}`,
          kind: "commodity",
          direction: helps ? "tailwind" : "pressure",
          magnitude,
          headline: `${rule.commodityName} ${rising ? "↑" : "↓"} ${pct.toFixed(1)}% over ~4 weeks`,
          source: "Commodity spot pool",
          asOf: latest.ts,
          reasoning: rising ? rule.reasoningUp : rule.reasoningDown,
          historicalNote: rule.historicalNote,
        });
      }
    }
  }

  // Alt-data
  const altRules = ALT_DATA_RULES.filter((r) => r.industryCode === industryCode);
  if (altRules.length > 0) {
    const { data: industry } = await supabaseAdmin.from("industries").select("id").eq("code", industryCode).maybeSingle();
    if (industry?.id) {
      const codes = [...new Set(altRules.map((r) => r.signalCode))];
      const { data: signals } = await supabaseAdmin
        .from("alt_data_signals").select("signal_code, ts, meta")
        .eq("subject_type", "industry").eq("subject_id", industry.id)
        .in("signal_code", codes).gte("ts", ninetyDaysAgo).order("ts", { ascending: false });
      const seen = new Set<string>();
      for (const sig of signals ?? []) {
        const rule = altRules.find((r) => r.signalCode === sig.signal_code);
        if (!rule || seen.has(rule.signalCode)) continue;
        seen.add(rule.signalCode);
        out.push({
          id: `cat-alt-${rule.signalCode}-${rule.industryCode}`,
          kind: "alt_data",
          direction: rule.direction,
          magnitude: rule.magnitude,
          headline: rule.signalLabel,
          source: "Alt-data ledger",
          asOf: sig.ts as string,
          reasoning: rule.reasoning,
          historicalNote: rule.historicalNote,
        });
      }
    }
  }

  out.sort((a, b) => b.magnitude - a.magnitude || new Date(b.asOf).getTime() - new Date(a.asOf).getTime());
  return out.slice(0, 6);
}

export const CATALYST_DETECT_VERSION = `catalyst.detect.v0.1 · ${CATALYST_MAPPINGS_VERSION}`;