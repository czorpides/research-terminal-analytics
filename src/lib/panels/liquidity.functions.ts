import { createServerFn } from "@tanstack/react-start";
import { loadUsEngineSeries } from "@/lib/macro/engine-data.server";
import { scoreFinancialConditions, type FinancialConditionsScore } from "@/lib/scoring/financial-conditions.server";

export interface LiquidityEnginePayload { score: FinancialConditionsScore; indicators: Array<{ concept: string; label: string; series: string; frequency: string; latest: number | null; date: string | null; change1m: number | null; history: Array<{ date: string; value: number }> }>; note: string }
const META: Record<string, { label: string; family: "rates" | "credit" | "liquidity"; higherIsTighter: boolean; weight: number }> = {
  fed_funds:{label:"Federal funds rate",family:"rates",higherIsTighter:true,weight:.15}, treasury_2y:{label:"2Y Treasury yield",family:"rates",higherIsTighter:true,weight:.10}, treasury_10y:{label:"10Y Treasury yield",family:"rates",higherIsTighter:true,weight:.05}, yield_curve_10y2y:{label:"10Y–2Y curve",family:"rates",higherIsTighter:false,weight:.10}, bbb_credit_spread:{label:"BBB credit spread",family:"credit",higherIsTighter:true,weight:.15}, high_yield_spread:{label:"High-yield spread",family:"credit",higherIsTighter:true,weight:.20}, financial_stress:{label:"St. Louis Fed stress",family:"credit",higherIsTighter:true,weight:.15}, broad_money_m2:{label:"M2 money stock",family:"liquidity",higherIsTighter:false,weight:.03}, bank_credit:{label:"Bank credit",family:"liquidity",higherIsTighter:false,weight:.04}, reserve_balances:{label:"Reserve balances",family:"liquidity",higherIsTighter:false,weight:.03},
};
export const getLiquidityEngine = createServerFn({ method: "GET" }).handler(async (): Promise<LiquidityEnginePayload> => {
 const series=await loadUsEngineSeries("liquidity");
 const indicators=series.map((r)=>{const history=r.history;const latest=history.at(-1)??null, prior=history.at(-2)??null, meta=META[r.concept];return {concept:r.concept,label:meta?.label??r.concept,series:r.seriesCode,frequency:r.frequency,latest:latest?.value??null,date:latest?.date??null,change1m:latest&&prior?latest.value-prior.value:null,history};});
 const score=scoreFinancialConditions(indicators.filter((x)=>META[x.concept]).map((x)=>({...META[x.concept],key:x.concept,values:x.history.map((p)=>p.value),current:x.latest})));
 return {score,indicators,note:"Stage 3 uses a transparent, direction-adjusted z-score composite. It is a financial-conditions monitor, not a credit forecast or a validated PCA factor."};
});
