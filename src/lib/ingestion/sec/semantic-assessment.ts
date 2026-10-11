/**
 * SEC 10-K source semantic diagnostics are evidence checks, never an approval
 * to use the values in Radar, earnings models or DCF. Explicit human review
 * is required to establish the accounting basis and numerical reconciliation.
 */
export interface SecSemanticAuditRow {
  symbol:string;
  filing_years:number;
  inspected_years:number;
  three_year_history_available:boolean;
  revenue_years:number;
  net_income_years:number;
  assets_years:number;
  operating_cash_years:number;
  diluted_shares_years:number;
  latest_revenue_tag:string|null;
  latest_income_tag:string|null;
  revenue_tag_count:number;
  significant_share_scale_change:boolean;
  invalid_share_values:boolean;
  structural_issue_count:number;
  structural_audit_available:boolean;
  diagnostic_flag_count:number;
  numerical_values_reconciled:boolean;
  accounting_bases_reconciled:boolean;
  model_ready:boolean;
}
export type SecSemanticReviewStatus =
  "source_incomplete"|"missing_metrics"|"comparability_review"|
  "awaiting_reconciliation"|"unavailable";
export interface SecSemanticAssessment {
  symbol:string;
  status:SecSemanticReviewStatus;
  diagnostics:string[];
  latestRevenueTag:string|null;
  latestIncomeTag:string|null;
  sourceYears:number;
  coreYears:number;
  modelReady:false;
}
const coreCodes=[
  ["revenue_years","Revenue"],
  ["net_income_years","Net income"],
  ["assets_years","Total assets"],
  ["operating_cash_years","Operating cash flow"],
] as const;

export function assessSecSemanticQuality(row:SecSemanticAuditRow):SecSemanticAssessment {
  const base={
    symbol:row.symbol,
    sourceYears:row.inspected_years,
    coreYears:Math.min(row.revenue_years,row.net_income_years,
      row.assets_years,row.operating_cash_years),
    latestRevenueTag:row.latest_revenue_tag,
    latestIncomeTag:row.latest_income_tag,
    modelReady:false as const,
  };
  const counts=[row.filing_years,row.inspected_years,row.revenue_years,
    row.net_income_years,row.assets_years,row.operating_cash_years,
    row.diluted_shares_years,row.revenue_tag_count,
    row.structural_issue_count,row.diagnostic_flag_count];
  if(!row.symbol || counts.some(n=>!Number.isSafeInteger(n)||n<0) ||
     typeof row.three_year_history_available!=="boolean" ||
     typeof row.structural_audit_available!=="boolean" ||
     typeof row.significant_share_scale_change!=="boolean" ||
     typeof row.invalid_share_values!=="boolean" ||
     row.model_ready!==false || row.accounting_bases_reconciled!==false ||
     row.numerical_values_reconciled!==false)
    return {...base,status:"unavailable",diagnostics:["Incomplete or invalid semantic audit output"]};
  const diagnostics:string[]=[];
  if(!row.structural_audit_available || row.structural_issue_count>0)
    diagnostics.push("Structural ledger audit unavailable or flagged");
  if(!row.three_year_history_available || row.inspected_years!==3)
    diagnostics.push("Three consecutive original fiscal years not observed");
  for(const [field,label] of coreCodes){
    if(row[field]!==3) diagnostics.push(label+": "+row[field]+"/3 annual source observations");
  }
  if(row.revenue_tag_count>1)
    diagnostics.push("Revenue SEC tag changed between annual filings");
  if(row.significant_share_scale_change)
    diagnostics.push("Diluted shares differ by at least 3x across observed years; investigate splits, acquisitions or share bases");
  if(row.invalid_share_values)
    diagnostics.push("Zero or negative diluted share count");
  // Missing shares is not equivalent to invalid shares; it is an additional
  // observation because per-share valuation needs verified split-aware units.
  if(row.diluted_shares_years!==3)
    diagnostics.push("Diluted shares: "+row.diluted_shares_years+"/3 annual source observations");
  if(row.latest_revenue_tag==="RevenueFromContractWithCustomerExcludingAssessedTax" ||
     row.latest_revenue_tag==="SalesRevenueNet")
    diagnostics.push("Revenue tag may represent contract sales or net sales, not issuer total revenues");
  if(row.latest_income_tag==="NetIncomeLoss")
    diagnostics.push("Net income requires consolidated-versus-parent-attributable basis review");

  const status:SecSemanticReviewStatus=
    !row.structural_audit_available || row.structural_issue_count>0 ||
    !row.three_year_history_available || row.inspected_years!==3 ?
      "source_incomplete" :
    coreCodes.some(([field])=>row[field]!==3) ?
      "missing_metrics" :
    row.revenue_tag_count>1 || row.significant_share_scale_change ||
      row.invalid_share_values || row.diluted_shares_years!==3 ?
      "comparability_review" : "awaiting_reconciliation";

  return {...base,status,diagnostics};
}
