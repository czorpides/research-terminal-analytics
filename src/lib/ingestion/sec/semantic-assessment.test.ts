import assert from "node:assert/strict";
import test from "node:test";
import {assessSecSemanticQuality,type SecSemanticAuditRow} from "./semantic-assessment.ts";
const clean:SecSemanticAuditRow={
  symbol:"TEST",filing_years:3,inspected_years:3,
  three_year_history_available:true,revenue_years:3,net_income_years:3,
  assets_years:3,operating_cash_years:3,diluted_shares_years:3,
  latest_revenue_tag:"Revenues",latest_income_tag:"NetIncomeLoss",
  revenue_tag_count:1,significant_share_scale_change:false,
  invalid_share_values:false,structural_issue_count:0,
  structural_audit_available:true,diagnostic_flag_count:0,
  numerical_values_reconciled:false,accounting_bases_reconciled:false,model_ready:false,
};
test("three annual periods and four core metrics do not imply accounting comparability",()=>{
  const a=assessSecSemanticQuality(clean);
  assert.equal(a.status,"awaiting_reconciliation");
  assert.equal(a.modelReady,false);
  assert.ok(a.diagnostics.some(s=>s.includes("consolidated-versus-parent")));
});
test("PNC missing original annual net income is explicitly detected",()=>{
  const a=assessSecSemanticQuality({...clean,symbol:"PNC",net_income_years:0,latest_income_tag:null,diagnostic_flag_count:1});
  assert.equal(a.status,"missing_metrics");
  assert.ok(a.diagnostics.some(s=>s==="Net income: 0/3 annual source observations"));
});
test("BLK/SPGI incomplete, even if 3 nonconsecutive reports exist",()=>{
  for(const row of [
    {...clean,symbol:"BLK",filing_years:2,inspected_years:2,three_year_history_available:false},
    {...clean,symbol:"SPGI",filing_years:3,three_year_history_available:false},
  ]) {
    assert.equal(assessSecSemanticQuality(row).status,"source_incomplete");
  }
});
test("AVGO share-split scale change is reviewed, not silently corrected",()=>{
  const a=assessSecSemanticQuality({...clean,symbol:"AVGO",
    significant_share_scale_change:true,diagnostic_flag_count:1});
  assert.equal(a.status,"comparability_review");
  assert.equal(a.modelReady,false);
});
test("Walmart net-sales source tag carries an explicit revenue basis caveat",()=>{
  const a=assessSecSemanticQuality({...clean,symbol:"WMT",
    latest_revenue_tag:"RevenueFromContractWithCustomerExcludingAssessedTax"});
  assert.ok(a.diagnostics.some(s=>s.includes("not issuer total revenues")));
  assert.equal(a.modelReady,false);
});
test("unknown malformed audit flags can never produce clean modelling status",()=>{
  const a=assessSecSemanticQuality({...clean,structural_issue_count:null as unknown as number});
  assert.equal(a.status,"unavailable");
  assert.equal(a.modelReady,false);
});
test("missing cash flows in one year are distinguished from missing full reports",()=>{
 const a=assessSecSemanticQuality({...clean,operating_cash_years:2,diagnostic_flag_count:1});
 assert.equal(a.status,"missing_metrics");
 assert.ok(a.diagnostics.some(s=>s.includes("Operating cash flow: 2/3")));
});
