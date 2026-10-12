/** Exact integer arithmetic on SEC issuer-statement USD amounts.
 * No floats, implicit financial scope mapping or scored data production.
 */
export interface ReconciliationBasisRow {
 symbol:string;periodEnd:string;basis:string;value:string;
}
export interface BankRevenueBridge {
 symbol:string;periodEnd:string;status:"matches"|"incomplete"|"mismatch";
 explanation:string;
}
const fields=["bank_issuer_total_revenue","bank_net_interest_income","bank_noninterest_income"] as const;
export function verifyBankRevenueBridges(
 rows:readonly ReconciliationBasisRow[],
):BankRevenueBridge[]{
 const keyed=new Map<string,Map<string,string>>();
 for(const row of rows){
  if(!fields.some(f=>f===row.basis))continue;
  const key=row.symbol+"|"+row.periodEnd;
  const m=keyed.get(key)??new Map<string,string>();
  if(m.has(row.basis)&&m.get(row.basis)!==row.value)
   m.set(row.basis,"__conflicting_values__");
  else if(!m.has(row.basis))m.set(row.basis,row.value);
  keyed.set(key,m);
 }
 const results:BankRevenueBridge[]=[];
 for(const [key,values] of keyed){
  const [symbol,periodEnd]=key.split("|");
  let status:BankRevenueBridge["status"]="incomplete";
  let explanation="Missing issuer-defined total revenue or net interest/noninterest component.";
  const parts=fields.map(f=>values.get(f));
  if(parts.every((v):v is string=>typeof v==="string"&&/^-?\d+$/.test(v))){
   const [total,netInterest,noninterest]=parts.map(v=>BigInt(v!));
   status=netInterest+noninterest===total?"matches":"mismatch";
   explanation=status==="matches"?"Net interest plus noninterest matches issuer total revenue.":
     "Issuer income-statement components do not sum to total revenue.";
  }
  results.push({symbol,periodEnd,status,explanation});
 }
 return results.sort((a,b)=>a.symbol.localeCompare(b.symbol)||
   b.periodEnd.localeCompare(a.periodEnd));
}
