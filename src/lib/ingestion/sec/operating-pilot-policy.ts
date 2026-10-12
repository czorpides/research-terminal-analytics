/**
 * Phase 2J6. Arithmetic for independently sourced original SEC statements.
 * These concepts are illustrative accounting evidence, NEVER permission to
 * derive EBIT, enterprise value or live model/scoring input.
 */
export interface OriginalIssuerComponent{
  line:string;amount_usd:string;
}
export interface OriginalIssuerObservation{
  basis:"gaap_consolidated_operating_income"|"borrowings_excluding_leases";
  reported_usd:string;
  components:readonly OriginalIssuerComponent[];
}
const integer=/^(0|[1-9][0-9]*)$/;
export function verifyOriginalIssuerBridge(row:OriginalIssuerObservation):
  "matches"|"invalid"|"mismatch"{
  if(!integer.test(row.reported_usd) ||
     !Array.isArray(row.components) ||
     row.components.length < (row.basis==="borrowings_excluding_leases"?2:1) ||
     row.components.length>5 ||
     (row.basis==="gaap_consolidated_operating_income"&&row.components.length!==1) ||
     row.components.some(c=>!c.line||c.line.trim().length<3||!integer.test(c.amount_usd)))
    return "invalid";
  const sum=row.components.reduce((n,c)=>n+BigInt(c.amount_usd),0n);
  return sum===BigInt(row.reported_usd)?"matches":"mismatch";
}
export function canSupplyScoredEbitOrTotalDebt(
  _row:OriginalIssuerObservation,
):false{
  // An operating-income or borrowing-subset label does not establish EBIT,
  // interest adjustments, debt lease policy or sector-model comparability.
  return false;
}
export function assessPiotroskiShareCountEvidence(kind:
  "weighted_average_diluted"|"period_end_common_outstanding",
  isSplitAdjustedAsOfReport:boolean):"reject"|"requires_accounting_approval"{
  // Do NOT accept DEI cover-page shares observed after year-end as year-end
  // facts; a separate point-in-time/split review is still mandatory.
  return kind==="period_end_common_outstanding" && isSplitAdjustedAsOfReport?
    "requires_accounting_approval":"reject";
}
