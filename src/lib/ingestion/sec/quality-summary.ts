/** No structural flags is NOT equivalent to verified financial statements. */
export interface SecIntegrityCounts {
  checked_filings: number | null;
  invalid_metadata_filings: number | null;
  empty_filings: number | null;
  duplicate_metrics: number | null;
  inconsistent_fact_rows: number | null;
}

export type SecLedgerAuditStatus = "review" | "no_structural_flags" | "unavailable";

export function summarizeSecLedgerIntegrity(row: SecIntegrityCounts | undefined): {
  issues: number | null;
  status: SecLedgerAuditStatus;
} {
  if (!row) return { issues: null, status: "unavailable" };
  const values = [
    row.checked_filings, row.invalid_metadata_filings, row.empty_filings,
    row.duplicate_metrics, row.inconsistent_fact_rows,
  ];
  if (values.some(value => typeof value !== "number" ||
      !Number.isSafeInteger(value) || value < 0)) {
    return { issues: null, status: "unavailable" };
  }
  const checked = row.checked_filings!;
  const issues = row.invalid_metadata_filings! + row.empty_filings! +
    row.duplicate_metrics! + row.inconsistent_fact_rows!;
  if (checked === 0) return { issues: null, status: "unavailable" };
  return { issues, status: issues > 0 ? "review" : "no_structural_flags" };
}
