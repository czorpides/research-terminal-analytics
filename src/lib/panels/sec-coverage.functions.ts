import { createServerFn } from "@tanstack/react-start";
import { summarizeSecLedgerIntegrity, type SecLedgerAuditStatus } from "@/lib/ingestion/sec/quality-summary";

export interface SecEvidenceCoverageRow {
  symbol: string;
  filingYears: number;
  lastPeriodEnd: string | null;
  totalFacts: number;
  latestFactCount: number;
  latestCoreCount: number;
  threeYearHistory: boolean;
  latestCoreObserved: boolean;
  ledgerIssues: number | null;
  ledgerStatus: SecLedgerAuditStatus;
}
interface DbSecRow {
  asset_id: string;
  symbol: string;
  filing_years: number;
  last_period_end: string | null;
  total_fact_count: number;
  latest_fact_count: number;
  latest_core_count: number;
  three_year_history_available: boolean;
  latest_core_observed: boolean;
}
interface DbIntegrityRow {
  asset_id: string;
  checked_filings: number | null;
  invalid_metadata_filings: number | null;
  empty_filings: number | null;
  duplicate_metrics: number | null;
  inconsistent_fact_rows: number | null;
}

/** Source diagnostics only: an intact ledger does not prove numerical accuracy. */
export const getSecEvidenceCoverage = createServerFn({ method: "GET" })
  .handler(async (): Promise<{
    rows: SecEvidenceCoverageRow[];
    completeThreeYears: number;
    latestCoreObserved: number;
    incompleteHistory: number;
    integrityReviewIssuers: number;
    integrityUnavailableIssuers: number;
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [coverage, integrity] = await Promise.all([
      supabaseAdmin
        .from("sec_original_10k_coverage" as "assets")
        .select("*")
        .limit(500),
      supabaseAdmin
        .from("sec_original_10k_integrity" as "assets")
        .select("*")
        .limit(500),
    ]);
    if (coverage.error)
      throw new Error("SEC evidence coverage telemetry unavailable: " + coverage.error.message);
    if (integrity.error)
      throw new Error("SEC evidence integrity audit unavailable: " + integrity.error.message);
    const audits = new Map(
      (integrity.data as unknown as DbIntegrityRow[]).map(row => [row.asset_id, row]),
    );
    const rows = (coverage.data as unknown as DbSecRow[]).map((row) => {
      const audit = summarizeSecLedgerIntegrity(audits.get(row.asset_id));
      return {
        symbol: row.symbol,
        filingYears: Number(row.filing_years ?? 0),
        lastPeriodEnd: row.last_period_end,
        totalFacts: Number(row.total_fact_count ?? 0),
        latestFactCount: Number(row.latest_fact_count ?? 0),
        latestCoreCount: Number(row.latest_core_count ?? 0),
        threeYearHistory: row.three_year_history_available === true,
        latestCoreObserved: row.latest_core_observed === true,
        ledgerIssues: audit.issues,
        ledgerStatus: audit.status,
      };
    }).sort((a,b) => a.filingYears-b.filingYears ||
      a.latestCoreCount-b.latestCoreCount || a.symbol.localeCompare(b.symbol));
    return {
      rows,
      completeThreeYears: rows.filter(x => x.threeYearHistory).length,
      latestCoreObserved: rows.filter(x => x.latestCoreObserved).length,
      incompleteHistory: rows.filter(x => !x.threeYearHistory).length,
      integrityReviewIssuers: rows.filter(x => x.ledgerStatus === "review").length,
      integrityUnavailableIssuers: rows.filter(x => x.ledgerStatus === "unavailable").length,
    };
  });
