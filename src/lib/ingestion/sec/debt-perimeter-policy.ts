/**
 * Phase 2J9: a shared, pure fail-closed SEC XBRL borrowing-subtotal policy.
 *
 * A direct-tag observed subset is NEVER complete EV debt and must not score.
 * `LongTermDebtAndCapitalLeaseObligations*` aggregates include finance leases:
 * they are indicators only and never substituted for lease-excluding debt.
 */
export type SecDebtProbe = {
  tag: string;
  status: "found"|"missing"|"ambiguous";
  value?: string|null;
};
export type SecBorrowingDecision = {
  status: "components_match"|"incomplete"|"ambiguous";
  subtotalUsd: string|null;
  componentTags: string[];
  caveats: string[];
  modelEligible: false;
  scoringEligible: false;
};

function exactValue(probe:SecDebtProbe):bigint|null {
  if(probe.status!=="found" || typeof probe.value!=="string" ||
     !/^(0|[1-9]\d*)$/.test(probe.value))return null;
  return BigInt(probe.value);
}

export function assessSecBorrowingSubset(
  current:SecDebtProbe,
  noncurrent:SecDebtProbe,
  optionalShortTerm:readonly SecDebtProbe[],
  leaseInclusiveIndicators:readonly SecDebtProbe[]=[],
):SecBorrowingDecision {
  const sources=[current,noncurrent,...optionalShortTerm];
  const componentTags=sources.filter(p=>p.status==="found").map(p=>p.tag);
  const invalid=sources.some(p=>p.status==="ambiguous"||
    (p.status==="found"&&exactValue(p)===null));
  // A positive additional short-term tag can overlap with current debt or
  // represent a separate facility. Neither alternative permits an unreviewed sum.
  const extraPositive=optionalShortTerm.some(p=>
    p.status==="found" && (exactValue(p)??0n)>0n);
  const missing=current.status==="missing"||noncurrent.status==="missing";
  const caveats=[
    "Only original direct LongTermDebtCurrent + LongTermDebtNoncurrent carrying-value observations are eligible for this preview subtotal",
    "The subset excludes finance and operating leases and does not certify full enterprise-value interest-bearing debt",
    "Parent LongTermDebt, lease-inclusive aggregates and contractual principal maturity tags cannot be added or substituted",
  ];
  if(leaseInclusiveIndicators.some(p=>p.status==="found"||
    p.status==="ambiguous")){
    caveats.push("Lease-inclusive SEC concept observed; verify debt and finance-lease perimeter in original 10-K");
  }
  if(extraPositive)caveats.push("Positive commercial paper/short borrowings may overlap with current debt or require an additional amount; original 10-K note reconciliation required");
  if(invalid || extraPositive){
    return {status:"ambiguous",subtotalUsd:null,componentTags,caveats,
      modelEligible:false,scoringEligible:false};
  }
  if(missing){
    caveats.push("Missing direct current or noncurrent debt component is not zero, even if parent or lease-inclusive concepts exist");
    return {status:"incomplete",subtotalUsd:null,componentTags,caveats,
      modelEligible:false,scoringEligible:false};
  }
  return {
    status:"components_match",
    subtotalUsd:(exactValue(current)!+exactValue(noncurrent)!).toString(),
    componentTags,caveats,modelEligible:false,scoringEligible:false,
  };
}
