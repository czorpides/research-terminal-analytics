import { createServerFn } from "@tanstack/react-start";

export interface SecEvidenceCoverageRow {
  symbol: string;
  filingYears: number;
  lastPeriodEnd: string | null;
  totalFacts: number;
  latestFactCount: number;
  latestCoreCount: number;
  threeYearHistory: boolean;
  latestCoreObserved: boolean;
}
interface DbSecRow {
  symbol: string;
  filing_years: number;
  last_period_end: string | null;
  total_fact_count: number;
  latest_fact_count: number;
  latest_core_count: number;
  three_year_history_available: boolean;
  latest_core_observed: boolean;
}
/** Quality diagnostics only, not trading-factor availability or score input. */
export const getSecEvidenceCoverage = createServerFn({ method: "GET" })
  .handler(async (): Promise<{
    rows: SecEvidenceCoverageRow[];
    completeThreeYears: number;
    latestCoreObserved: number;
    incompleteHistory: number;
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {data,error} = await supabaseAdmin
      .from("sec_original_10k_coverage" as "assets")
      .select("*")
      .limit(500);
    if(error) throw new Error("SEC evidence coverage telemetry unavailable: " + error.message);
    const rows = (data as unknown as DbSecRow[]).map((row)=>({
      symbol: row.symbol,
      filingYears: Number(row.filing_years??0),
      lastPeriodEnd:row.last_period_end,
      totalFacts:Number(row.total_fact_count??0),
      latestFactCount:Number(row.latest_fact_count??0),
      latestCoreCount:Number(row.latest_core_count??0),
      threeYearHistory:row.three_year_history_available===true,
      latestCoreObserved:row.latest_core_observed===true,
    })).sort((a,b)=>a.filingYears-b.filingYears || a.latestCoreCount-b.latestCoreCount ||
      a.symbol.localeCompare(b.symbol));
    return {
      rows,
      completeThreeYears:rows.filter(x=>x.threeYearHistory).length,
      latestCoreObserved:rows.filter(x=>x.latestCoreObserved).length,
      incompleteHistory:rows.filter(x=>!x.threeYearHistory).length,
    };
  });
