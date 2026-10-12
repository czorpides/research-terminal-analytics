/**
 * Bounded, read-only Supabase RPC caller for Swing deep-history.
 *
 * The historical 20-name × 300-bar JSONB RPC repeatedly timed out (57014)
 * in Railway staging. Use smaller read groups, at most two concurrent calls,
 * and split only timed-out groups without rerunning successful groups.
 * No fallback provider or stored price mutation.
 */
export interface SwingPriceRpcPage<T> {
  data: T[] | null;
  error: { code?: string; message: string } | null;
}
export const SWING_PRICE_RPC_BATCH_SIZE=8;
export const SWING_PRICE_RPC_MAX_CONCURRENCY=2;
const IS_RETRYABLE=(error:SwingPriceRpcPage<unknown>["error"])=>
 error?.code==="57014" ||
 /statement timeout|canceling statement due to statement timeout/i.test(error?.message??"");

export async function getSwingPricePagesWithTimeoutSplit<T>(
 assetIds:readonly string[],
 rpc:(assets:string[])=>Promise<SwingPriceRpcPage<T>>,
):Promise<SwingPriceRpcPage<T>[]> {
 if(assetIds.length>250)throw Error("Swing price scan exceeds bounded 250-asset cap");
 const list=assetIds.filter(x=>x.length>0);
 if(list.length!==assetIds.length||new Set(list).size!==list.length)
  throw Error("Swing price requests require unique nonblank asset identities");
 const slices:string[][]=[];
 for(let i=0;i<list.length;i+=SWING_PRICE_RPC_BATCH_SIZE)
  slices.push(list.slice(i,i+SWING_PRICE_RPC_BATCH_SIZE));
 const fetchOne=async (chunk:string[]):Promise<SwingPriceRpcPage<T>[]>=>{
  const result=await rpc(chunk);
  if(!result.error)return [result];
  if(!IS_RETRYABLE(result.error)||chunk.length===1)return [result];
  const mid=Math.floor(chunk.length/2);
  // Split recursively and sequentially to avoid multiplying DB load when
  // the database is already under statement-timeout pressure.
  return [...await fetchOne(chunk.slice(0,mid)),...await fetchOne(chunk.slice(mid))];
 };
 const pages:SwingPriceRpcPage<T>[]=[];
 for(let i=0;i<slices.length;i+=SWING_PRICE_RPC_MAX_CONCURRENCY){
  const wave=await Promise.all(slices.slice(i,i+SWING_PRICE_RPC_MAX_CONCURRENCY).map(fetchOne));
  pages.push(...wave.flat());
  if(pages.some(p=>p.error))break;
 }
 return pages;
}
