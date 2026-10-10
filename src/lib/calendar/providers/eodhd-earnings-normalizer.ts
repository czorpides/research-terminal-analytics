export interface EodhdEarningsEvent {
  ticker: string;
  exchangeCode: string;
  reportDate: string;
  timing: "pre_market" | "post_market" | "unspecified";
  actualEps: number | null;
  estimatedEps: number | null;
  surprisePercent: number | null;
  currency: string | null;
  datePrecision: "date";
}
function numeric(input:unknown):number|null {
  if(input===null || input===undefined || input==="" || input==="-")return null;
  const n=Number(input);
  return Number.isFinite(n)?n:null;
}
function date(input:unknown):input is string {
  return typeof input==="string" && /^\d{4}-\d{2}-\d{2}$/.test(input) &&
    !Number.isNaN(Date.parse(input+"T00:00:00Z"));
}
/**
 * Only normalize evidence returned by an explicitly licensed EODHD earnings
 * endpoint. A calendar date is NEVER converted to a fabricated exact time.
 * This pure parser neither requests data nor persists events.
 */
export function parseEodhdEarnings(payload:unknown,limit=3000):EodhdEarningsEvent[] {
  if(!payload || typeof payload!=="object")throw new Error("EODHD calendar response is not an object");
  const top=payload as Record<string,unknown>;
  if(!Array.isArray(top.earnings))throw new Error("EODHD calendar earnings array absent");
  const out:EodhdEarningsEvent[]=[];
  const keys=new Set<string>();
  for(const input of top.earnings.slice(0,Math.min(3000,Math.max(1,limit)))) {
    if(!input || typeof input!=="object")continue;
    const row=input as Record<string,unknown>;
    const code=typeof row.code==="string"?row.code.toUpperCase():"";
    const parts=/^([A-Z0-9.-]+)\.([A-Z0-9]+)$/.exec(code);
    const reportDate=row.report_date ?? row.date;
    if(!parts || !date(reportDate) || !["US","LSE","ASX"].includes(parts[2]))continue;
    const key=code+":"+reportDate;
    if(keys.has(key))continue;
    const beforeAfter=String(row.before_after_market??"").toLowerCase();
    const timing=beforeAfter.includes("before")?"pre_market":
      beforeAfter.includes("after")?"post_market":"unspecified";
    const estimatedEps=numeric(row.estimate),actualEps=numeric(row.actual);
    const providerSurprise=numeric(row.percent);
    // Never invent analyst consensus. Provider surprise is only meaningful
    // when both actual and estimate are independently present.
    const surprisePercent=actualEps!==null && estimatedEps!==null
      ? providerSurprise : null;
    out.push({
      ticker:parts[1],exchangeCode:parts[2],reportDate,timing,
      actualEps,estimatedEps,surprisePercent,
      currency:typeof row.currency==="string"?row.currency:null,
      datePrecision:"date"
    });
    keys.add(key);
  }
  return out;
}
