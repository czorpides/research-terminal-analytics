/**
 * SEC EDGAR submissions intake for reported-results announcements only.
 *
 * Form 8-K item 2.02 indicates results were furnished/reported. It DOES NOT
 * establish positive earnings surprise, upside, or guidance. All generated
 * events remain 'candidate' until independently verified with actual figures.
 *
 * SEC fair-access limits: named app/contact User-Agent required; <= 10 req/s.
 * A slow sequential poll of at most eight tickers stays well below this limit.
 */
export const SEC_EDGAR_PROVIDER_VERSION = "sec.edgar.earnings.v0.1";

export interface SecTickerIndexEntry {
  cik_str: number;
  ticker: string;
  title: string;
}
export interface SecFilingRecent {
  form?: unknown;
  accessionNumber?: unknown;
  primaryDocument?: unknown;
  filingDate?: unknown;
  acceptanceDateTime?: unknown;
  items?: unknown;
}
export interface SecSubmissions {
  cik?: number | string;
  filings?: { recent?: Record<string, unknown> };
}
export interface SecEarningsCandidate {
  symbol: string;
  event_key: string;
  event_type: "earnings_result";
  headline: string;
  summary: string;
  direction: "uncertain";
  source_name: string;
  source_url: string;
  source_tier: "official";
  source_published_at: string;
  known_at: string;
  effective_at: null;
  expires_at: null;
  materiality: null;
  novelty: null;
  evidence_confidence: null;
  evidence: Record<string, unknown>;
}

export function parseTickerIndex(raw: unknown): Map<string, SecTickerIndexEntry> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Malformed SEC company ticker index.");
  const out=new Map<string,SecTickerIndexEntry>();
  for (const value of Object.values(raw)) {
    if (!value || typeof value !== "object") continue;
    const row=value as Partial<SecTickerIndexEntry>;
    if (typeof row.ticker !== "string" || typeof row.cik_str !== "number" ||
        !Number.isSafeInteger(row.cik_str) || row.cik_str <= 0 ||
        typeof row.title !== "string") continue;
    const symbol=row.ticker.trim().toUpperCase();
    if (/^[A-Z0-9.-]{1,22}$/.test(symbol)) out.set(symbol,{cik_str:row.cik_str,ticker:symbol,title:row.title});
  }
  return out;
}

export function zipRecentFilings(recent: Record<string, unknown>): SecFilingRecent[] {
  const arrays=["form","accessionNumber","primaryDocument","filingDate","acceptanceDateTime","items"]
    .map(name=>[name,Array.isArray(recent[name])?recent[name] as unknown[]:[]] as const);
  const forms=arrays[0][1];
  if(forms.length>1500) throw new Error("Unexpected SEC filing batch size.");
  return forms.map((_,i)=>Object.fromEntries(arrays.map(([k,values])=>[k,values[i]])) as SecFilingRecent);
}

export function extractSecEarningsCandidates(
  symbol:string,cik:number,filings:SecFilingRecent[],since:Date,
  asOf:Date=new Date(),
):SecEarningsCandidate[] {
  const out:SecEarningsCandidate[]=[];
  for(const filing of filings){
    if(filing.form!=="8-K" || typeof filing.items!=="string" ||
       !/(?:^|[,;\s])2\.02(?:$|[,;\s])/.test(filing.items)) continue;
    if(typeof filing.accessionNumber!=="string" ||
       !/^\d{10}-\d{2}-\d{6}$/.test(filing.accessionNumber)) continue;
    if(typeof filing.primaryDocument!=="string" ||
       !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,180}$/.test(filing.primaryDocument) ||
       filing.primaryDocument.includes("..")) continue;
    const accepted=typeof filing.acceptanceDateTime==="string"
      ? Date.parse(filing.acceptanceDateTime):NaN;
    // Never substitute midnight 'filingDate' for a missing publication timestamp.
    if(!Number.isFinite(accepted)||accepted<since.getTime()||accepted>asOf.getTime()+60_000)continue;
    const published=new Date(accepted).toISOString();
    const acc=filing.accessionNumber;
    const accessionClean=acc.replaceAll("-","");
    out.push({
      symbol,event_key:`sec:earnings:${accessionClean}`,event_type:"earnings_result",
      headline:`${symbol}: results announcement filed on SEC Form 8-K`,
      summary:"Form 8-K Item 2.02 announces operating results. Earnings surprise, guidance and materiality remain unverified.",
      direction:"uncertain",source_name:"SEC EDGAR · Form 8-K Item 2.02",
      source_url:`https://www.sec.gov/Archives/edgar/data/${cik}/${accessionClean}/${filing.primaryDocument}`,
      source_tier:"official",source_published_at:published,known_at:published,
      effective_at:null,expires_at:null,materiality:null,novelty:null,
      evidence_confidence:null,
      evidence:{form:"8-K",items:filing.items,accessionNumber:acc,cik,filingDate:filing.filingDate??null,
        providerVersion:SEC_EDGAR_PROVIDER_VERSION, classification:"results_disclosure_not_earnings_surprise"},
    });
  }
  return out;
}

export function verifySecUserAgent(value:string | undefined):string{
  const ua=value?.trim() ?? "";
  if(ua.length<18||ua.length>180||!/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(ua)||
      ua.includes("\n")||ua.includes("\r"))throw new Error("SEC_EDGAR_USER_AGENT must identify your application and a real contact email (SEC fair-access requirement).");
  return ua;
}

async function secFetch<T>(url:string,userAgent:string):Promise<T>{
  // Hosts and paths are constructed internally from validated ticker/CIK data.
  const address=new URL(url);
  if(address.protocol!=="https:"||!["www.sec.gov","data.sec.gov"].includes(address.hostname)) throw new Error("Invalid SEC host");
  const resp=await fetch(url,{
    signal:AbortSignal.timeout(15000),
    headers:{"User-Agent":userAgent,"Accept":"application/json"},
    redirect:"error",
  });
  if(!resp.ok)throw new Error(`SEC EDGAR returned HTTP ${resp.status} for ${address.hostname}; no data committed.`);
  return await resp.json() as T;
}

export interface SecPollResult {
  symbolsRequested:string[];
  tickersFound:string[];
  unmatchedTickers:string[];
  candidates:SecEarningsCandidate[];
  warnings:string[];
}

export async function fetchSecEarningsCandidates(args:{
  symbols:string[];lookbackDays:number;userAgent:string;
  fetcher?:<T>(url:string,userAgent:string)=>Promise<T>;
  wait?: (ms:number)=>Promise<void>;
  now?:Date;
}):Promise<SecPollResult>{
  const userAgent=verifySecUserAgent(args.userAgent);
  if(args.symbols.length<1||args.symbols.length>8)throw new Error("SEC poll supports 1–8 symbols per run.");
  if(!Number.isInteger(args.lookbackDays)||args.lookbackDays<1||args.lookbackDays>90)throw new Error("SEC lookback must be 1–90 days.");
  const symbols=[...new Set(args.symbols.map(s=>s.toUpperCase()))];
  if(symbols.some(s=>!/^[A-Z0-9.-]{1,22}$/.test(s)))throw new Error("Malformed equity symbol.");
  const fetchJson=args.fetcher??secFetch;
  const wait=args.wait??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const now=args.now??new Date(),since=new Date(now.getTime()-args.lookbackDays*86_400_000);
  const index=parseTickerIndex(await fetchJson("https://www.sec.gov/files/company_tickers.json",userAgent));
  const found:string[]=[];const missing:string[]=[];const candidates:SecEarningsCandidate[]=[];const warnings:string[]=[];
  for(const symbol of symbols){
    const entry=index.get(symbol);
    if(!entry){missing.push(symbol);continue;}
    found.push(symbol);
    await wait(650);
    const cik=String(entry.cik_str).padStart(10,"0");
    try{
      const submissions=await fetchJson<SecSubmissions>(`https://data.sec.gov/submissions/CIK${cik}.json`,userAgent);
      if(!submissions.filings?.recent || typeof submissions.filings.recent !== "object"){
        warnings.push(`${symbol}: missing SEC recent filing history`);continue;
      }
      candidates.push(...extractSecEarningsCandidates(symbol,entry.cik_str,zipRecentFilings(submissions.filings.recent),since,now));
    }catch(error){warnings.push(`${symbol}: ${error instanceof Error?error.message:"SEC API unavailable"}`);}
  }
  return {symbolsRequested:symbols,tickersFound:found,unmatchedTickers:missing,candidates,warnings};
}
