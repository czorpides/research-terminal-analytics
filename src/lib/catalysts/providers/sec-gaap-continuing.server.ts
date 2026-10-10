/** SEC data.sec.gov XBRL reader: named real contact, bounded serial requests. */
import {parseTickerIndex,zipRecentFilings,verifySecUserAgent,
 type SecSubmissions} from "./sec-edgar.server.ts";
import {extractSecGaapContinuingIncome,
 type SecCompanyFacts,type SecGaapProfitability} from "./sec-gaap-continuing.ts";

const MAX_RESPONSE_BYTES=12_000_000;
async function getSecJson<T>(address:string,userAgent:string):Promise<T>{
 const url=new URL(address);
 if(url.protocol!=="https:"||!["www.sec.gov","data.sec.gov"].includes(url.hostname))
   throw new Error("SEC host not allowed.");
 const response=await fetch(url,{
  headers:{"Accept":"application/json","User-Agent":userAgent},
  redirect:"error",signal:AbortSignal.timeout(20000),
 });
 if(!response.ok)throw new Error("SEC returned HTTP "+response.status+" for "+url.hostname);
 if(Number(response.headers.get("content-length")??0)>MAX_RESPONSE_BYTES)
   throw new Error("SEC response exceeds size cap.");
 const text=await response.text();
 if(Buffer.byteLength(text,"utf8")>MAX_RESPONSE_BYTES)throw new Error("SEC response exceeds size cap.");
 return JSON.parse(text) as T;
}
export interface SecGaapCompanyObservation {
 symbol:string;
 cik:number|null;
 retrievedAt:string;
 asOf:string;
 sourceUrl:string|null;
 evidence:SecGaapProfitability|null;
 warning:string|null;
 /** Retroactive public data is NOT our actual historical first-seen record. */
 retrospectivelyReconstructed:boolean;
}
export async function fetchSecContinuingProfitability(args:{
 symbols:string[];userAgent:string;
 asOf?:Date;now?:Date;
 fetchJson?:<T>(url:string,ua:string)=>Promise<T>;
 wait?:(ms:number)=>Promise<void>;
}):Promise<SecGaapCompanyObservation[]>{
 const agent=verifySecUserAgent(args.userAgent);
 if(args.symbols.length<1||args.symbols.length>4 ||
    args.symbols.some(s=>!/^[A-Z0-9.-]{1,22}$/.test(s)))
   throw new Error("SEC profitability probe is limited to 1-4 uppercase stock symbols.");
 const now=args.now??new Date(),asOf=args.asOf??now;
 if(!Number.isFinite(asOf.getTime())||asOf.getTime()>now.getTime()||
    asOf.getTime()<Date.parse("2020-01-01T00:00:00Z"))
   throw new Error("Invalid historical cutoff.");
 const getJson=args.fetchJson??getSecJson;
 const sleep=args.wait??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 const tickers=parseTickerIndex(await getJson("https://www.sec.gov/files/company_tickers.json",agent));
 const result:SecGaapCompanyObservation[]=[];
 for(const symbol of [...new Set(args.symbols)]){
  const info=tickers.get(symbol);
  const base:SecGaapCompanyObservation={symbol,cik:info?.cik_str??null,
   retrievedAt:now.toISOString(),asOf:asOf.toISOString(),sourceUrl:null,evidence:null,
   warning:null,retrospectivelyReconstructed:asOf.getTime()<now.getTime()-60_000};
  if(!info){result.push({...base,warning:"SEC symbol / CIK not found"});continue;}
  const cik=String(info.cik_str).padStart(10,"0");
  const submissionsUrl="https://data.sec.gov/submissions/CIK"+cik+".json";
  const factsUrl="https://data.sec.gov/api/xbrl/companyfacts/CIK"+cik+".json";
  try{
   await sleep(650);
   const submissions=await getJson<SecSubmissions>(submissionsUrl,agent);
   if(!submissions.filings?.recent||typeof submissions.filings.recent!=="object"){
    result.push({...base,warning:"SEC submissions accession acceptance data unavailable"});continue;
   }
   const acceptance:Record<string,string>={};
   for(const filing of zipRecentFilings(submissions.filings.recent)){
    if(typeof filing.accessionNumber==="string"&&
       typeof filing.acceptanceDateTime==="string")
      acceptance[filing.accessionNumber]=filing.acceptanceDateTime;
   }
   await sleep(650);
   const facts=await getJson<SecCompanyFacts>(factsUrl,agent);
   if(Number(facts.cik)!==info.cik_str){
    result.push({...base,warning:"SEC companyfacts CIK does not match ticker identity"});continue;
   }
   const evidence=extractSecGaapContinuingIncome(facts,acceptance,asOf);
   result.push({...base,sourceUrl:factsUrl,evidence});
  }catch(error){
   result.push({...base,warning:error instanceof Error?error.message:"SEC availability failed"});
  }
 }
 return result;
}
