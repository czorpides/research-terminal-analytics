/**
 * Phase 2J8: deterministic, source-anchored accounting-note reconciliation.
 *
 * This checks arithmetic and EDGAR identity for evidence transcribed from an
 * original issuer 10-K. It does NOT fetch or independently verify that document;
 * an accurate URL is not proof that the transcribed amount is correct.
 *
 * No data writes, provider jobs, model inputs, valuation or scoring.
 */
export type SecNoteEvidence = {
  cik: number;
  accession: string;
  fiscalEnd: string;
  filedDate: string;
  original10kUrl: string;
  sector: "nonfinancial" | "financial" | "reit" | "utility" | "unclassified";
  operatingIncomeUsd: string;
  pretaxIncomeUsd: string;
  interestExpenseUsd: string; // positive magnitude of P&L interest expense
  currentBorrowingsUsd: string; // carrying value, excluding lease obligations
  noncurrentBorrowingsUsd: string; // carrying value, excluding lease obligations
  reportedBorrowingsUsd: string; // separate original-note total
  debtFaceUsd?: string;
  debtFaceAdjustments?: Array<{ label: string; signedUsd: string }>;
  otherNonoperatingItems?: Array<{ label: string; signedUsd: string }>;
  fiscalYearEndCommonShares?: string;
};

export type SecNoteReconciliation = {
  status: "arithmetic_consistent_source_only" | "rejected";
  accession: string;
  fiscalEnd: string;
  errors: string[];
  operatingIncomeUsd: string | null;
  pretaxPlusInterestUsd: string | null; // competing definition, never silently EBIT
  differenceFromOperatingIncomeUsd: string | null;
  borrowingsExcludingLeasesUsd: string | null;
  fiscalYearEndCommonShares: string | null;
  ebitPolicy: "definition_not_approved";
  debtPolicy: "borrowings_excluding_leases_not_enterprise_value_total_debt";
  sharePolicy: "fiscal_end_amount_not_split_adjusted_for_piotroski";
  evidencePolicy: "transcribed_source_requires_independent_document_review";
  modelEligible: false;
  scoringEligible: false;
};

const validIso = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;

const whole = (value: string, positiveOnly: boolean): bigint | null => {
  if (typeof value !== "string" || !/^-?(0|[1-9]\d*)$/.test(value)) return null;
  const n = BigInt(value);
  return positiveOnly && n < 0n ? null : n;
};

function validatedEdgarIdentity(e: SecNoteEvidence): boolean {
  if (!Number.isSafeInteger(e.cik) || e.cik < 1 ||
      !/^\d{10}-\d{2}-\d{6}$/.test(e.accession) ||
      !validIso(e.fiscalEnd) || !validIso(e.filedDate) ||
      e.filedDate < e.fiscalEnd) return false;
  try {
    const u = new URL(e.original10kUrl);
    const dir = e.accession.replaceAll("-", "");
    return u.protocol === "https:" && u.hostname === "www.sec.gov" &&
      u.search === "" && u.hash === "" &&
      new RegExp("^/Archives/edgar/data/" + e.cik + "/" + dir +
        "/[A-Za-z0-9_.-]+\\.htm$").test(u.pathname);
  } catch {
    return false;
  }
}

export function reconcileOriginalSecNote(e: SecNoteEvidence): SecNoteReconciliation {
  const errors: string[] = [];
  if (!validatedEdgarIdentity(e)) errors.push("Original 10-K issuer, date, accession or URL identity is invalid");
  if (e.sector !== "nonfinancial") errors.push("Industrial EBIT/debt policy requires independently classified nonfinancial issuer");

  const op = whole(e.operatingIncomeUsd, false);
  const pretax = whole(e.pretaxIncomeUsd, false);
  const interest = whole(e.interestExpenseUsd, true);
  const current = whole(e.currentBorrowingsUsd, true);
  const long = whole(e.noncurrentBorrowingsUsd, true);
  const reported = whole(e.reportedBorrowingsUsd, true);
  if ([op, pretax, interest, current, long, reported].some(x => x === null)) {
    errors.push("All reported financial figures must be exact whole-USD integers; debt and interest magnitudes nonnegative");
  }

  if (current !== null && long !== null && reported !== null &&
      current + long !== reported) {
    errors.push("Current and noncurrent debt do not reconcile to reported carrying-value borrowings");
  }

  if (e.debtFaceUsd !== undefined) {
    const face = whole(e.debtFaceUsd, true);
    if (face === null || !e.debtFaceAdjustments?.length) {
      errors.push("Gross debt face value requires signed, identifiable reconciliation adjustments");
    } else {
      const adjustments = e.debtFaceAdjustments.map(x =>
        x.label.trim() ? whole(x.signedUsd, false) : null);
      if (adjustments.some(x => x === null) || reported === null ||
          face + adjustments.reduce<bigint>((a, x) => a + (x ?? 0n), 0n) !== reported) {
        errors.push("Gross debt face value plus signed adjustments does not equal carrying value");
      }
    }
  } else if (e.debtFaceAdjustments?.length) {
    errors.push("Debt face adjustments cannot be supplied without a face value");
  }

  const bridge = op !== null && pretax !== null && interest !== null
    ? pretax + interest - op : null;
  if (e.otherNonoperatingItems !== undefined) {
    const values = e.otherNonoperatingItems.map(x =>
      x.label.trim() ? whole(x.signedUsd, false) : null);
    if (!values.length || values.some(x => x === null) || bridge === null ||
        values.reduce<bigint>((a, x) => a + (x ?? 0n), 0n) !== bridge) {
      errors.push("The disclosed noninterest, nonoperating bridge does not balance");
    }
  }

  let shares: bigint | null = null;
  if (e.fiscalYearEndCommonShares !== undefined) {
    shares = whole(e.fiscalYearEndCommonShares, true);
    if (shares === null || shares === 0n) {
      errors.push("Fiscal year-end shares must be a positive, exact count");
    }
  }

  const ok = errors.length === 0;
  return {
    status: ok ? "arithmetic_consistent_source_only" : "rejected",
    accession: e.accession,
    fiscalEnd: e.fiscalEnd,
    errors,
    operatingIncomeUsd: ok ? op!.toString() : null,
    pretaxPlusInterestUsd: ok ? (pretax! + interest!).toString() : null,
    differenceFromOperatingIncomeUsd: ok ? bridge!.toString() : null,
    borrowingsExcludingLeasesUsd: ok ? reported!.toString() : null,
    fiscalYearEndCommonShares: ok && shares !== null ? shares.toString() : null,
    ebitPolicy: "definition_not_approved",
    debtPolicy: "borrowings_excluding_leases_not_enterprise_value_total_debt",
    sharePolicy: "fiscal_end_amount_not_split_adjusted_for_piotroski",
    evidencePolicy: "transcribed_source_requires_independent_document_review",
    modelEligible: false,
    scoringEligible: false,
  };
}
