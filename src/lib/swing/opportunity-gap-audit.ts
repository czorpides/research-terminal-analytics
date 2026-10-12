/**
 * Phase 3A — read-only swing opportunity funnel audit.
 * An absent ticker is NOT evidence of poor setup quality: the 3,000-name
 * universe, broad screen, 220-name deep scan and 140-name surfaced shortlist
 * are independent gates. No score adjustment, forced nomination, writes or
 * ticker/issuer alias guessing. Model signals reflect the same snapshot.
 */
export const SWING_GAP_AUDIT_VERSION = "swing.opportunity_gap.shadow.v1" as const;
export const SWING_GAP_WATCHLIST = [
  "AAOI", "INTC", "NBIS", "EOS.AX", "PENG", "BE",
] as const;
export type SwingGapWatchSymbol = (typeof SWING_GAP_WATCHLIST)[number];
export type SwingOpportunityGapStage =
  | "missing_managed_universe"
  | "ambiguous_symbol"
  | "missing_broad_evidence"
  | "not_nominated_for_deep_scan"
  | "insufficient_price_history"
  | "deep_scan_no_valid_setup"
  | "model_below_surfacing_floor"
  | "model_invalidated"
  | "shortlist_capacity"
  | "surfaced";
export interface SwingGapAuditAsset {
  assetId: string;
  symbol: string;
  name: string;
  hasBroadEvidence: boolean;
}
export interface SwingGapAuditEvaluation {
  usableBars: number;
  modelComputed: boolean;
  modelScore: number | null;
  setupLabel: string | null;
  entryState: string | null;
  reasons: string[];
  risks: string[];
}
export interface SwingOpportunityGapAudit {
  watchSymbol: SwingGapWatchSymbol;
  resolvedAssetId: string | null;
  resolvedSymbol: string | null;
  assetName: string | null;
  stage: SwingOpportunityGapStage;
  progress: string;
  hasBroadEvidence: boolean | null;
  deepScanned: boolean;
  usableBars: number | null;
  shadowSetupScore: number | null;
  shadowSetupName: string | null;
  shadowEntryState: string | null;
  observedReasons: string[];
  observedRisks: string[];
  screenQualityConclusion: "not_assessable" | "setup_observed";
  source: typeof SWING_GAP_AUDIT_VERSION;
  changesScores: false;
  eligibleForTradeExecution: false;
}
export interface SwingGapAuditSource {
  /** Fully loaded managed equities; the selected watchlist is NOT force-added. */
  assets: readonly SwingGapAuditAsset[];
  selectedAssetIds: ReadonlySet<string>;
  evaluations: ReadonlyMap<string, SwingGapAuditEvaluation>;
  shortlistedAssetIds: ReadonlySet<string>;
  watchlist?: readonly SwingGapWatchSymbol[];
}
const finish = (partial: Omit<SwingOpportunityGapAudit, "source"|"changesScores"|"eligibleForTradeExecution">):SwingOpportunityGapAudit=>({
  ...partial,source:SWING_GAP_AUDIT_VERSION,
  changesScores:false,eligibleForTradeExecution:false,
});
const base=(symbol:SwingGapWatchSymbol,asset:SwingGapAuditAsset|null)=>({
  watchSymbol:symbol,resolvedAssetId:asset?.assetId??null,
  resolvedSymbol:asset?.symbol??null,assetName:asset?.name??null,
  hasBroadEvidence:asset?.hasBroadEvidence??null,
  deepScanned:false,usableBars:null,shadowSetupScore:null,
  shadowSetupName:null,shadowEntryState:null,
  observedReasons:[] as string[],observedRisks:[] as string[],
  screenQualityConclusion:"not_assessable" as const,
});
export function buildSwingOpportunityGapAudit(source:SwingGapAuditSource):SwingOpportunityGapAudit[]{
 const watchlist=source.watchlist??SWING_GAP_WATCHLIST;
 if(new Set(watchlist).size!==watchlist.length||
    watchlist.some(s=>!SWING_GAP_WATCHLIST.includes(s)))
  throw new Error("Unsupported or duplicated swing quality watchlist ticker");
 const universe=new Map<string,SwingGapAuditAsset[]>();
 for(const asset of source.assets){
  if(!asset.assetId||!asset.symbol)continue;
  // Use EXACT symbol only: EOS.AX must never silently resolve to EOS US.
  const bucket=universe.get(asset.symbol.toUpperCase())??[];
  bucket.push(asset);
  universe.set(asset.symbol.toUpperCase(),bucket);
 }
 return watchlist.map(symbol=>{
  const matched=universe.get(symbol)??[];
  if(matched.length===0)return finish({
   ...base(symbol,null),stage:"missing_managed_universe",
   progress:"Ticker not found as an exact symbol among loaded active equities; listing coverage, exchange suffix or mapping must be inspected. No setup-quality conclusion.",
  });
  if(matched.length!==1)return finish({
   ...base(symbol,null),stage:"ambiguous_symbol",
   progress:"More than one managed equity maps to this exact ticker. Require an explicit exchange and asset ID before assessing quality.",
  });
  const asset=matched[0],common=base(symbol,asset);
  if(!asset.hasBroadEvidence)return finish({
   ...common,stage:"missing_broad_evidence",
   progress:"Managed equity exists, but the broad technical screen/eligible scored evidence is missing. Cannot call this a weak opportunity.",
  });
  if(!source.selectedAssetIds.has(asset.assetId))return finish({
   ...common,stage:"not_nominated_for_deep_scan",
   progress:"Available in broad screening but not allocated a deep-scan slot. This is a candidate-discovery/selection gap, not an observed low setup score.",
  });
  const reviewed=source.evaluations.get(asset.assetId);
  const partial={...common,deepScanned:true,usableBars:reviewed?.usableBars??null};
  if(!reviewed||!Number.isFinite(reviewed.usableBars)||reviewed.usableBars<45)
   return finish({...partial,stage:"insufficient_price_history",
    progress:"Deep-scan nominee has fewer than 45 usable split-adjusted OHLC bars (or bar retrieval not verified); setup quality unavailable.",
   });
  if(!reviewed.modelComputed||reviewed.modelScore===null)
   return finish({...partial,stage:"deep_scan_no_valid_setup",
    progress:"Enough bars were available, but the v2.1 model did not produce a candidate matching its entry-pattern definitions.",
   });
  if(!Number.isFinite(reviewed.modelScore)||reviewed.modelScore<0||reviewed.modelScore>100)
   throw new Error("Invalid swing raw setup score in funnel audit");
  const measured={...partial,shadowSetupScore:reviewed.modelScore,
   shadowSetupName:reviewed.setupLabel,shadowEntryState:reviewed.entryState,
   observedReasons:reviewed.reasons.slice(0,5),
   observedRisks:reviewed.risks.slice(0,5),
   screenQualityConclusion:"setup_observed" as const};
  if(reviewed.modelScore<42)return finish({
   ...measured,stage:"model_below_surfacing_floor",
   progress:"A v2.1 setup was calculated below the 42-point internal candidate-surfacing floor. Review evidence and realised outcomes; this is not the legacy Radar score.",
  });
  if(reviewed.entryState==="invalidated")return finish({
   ...measured,stage:"model_invalidated",
   progress:"Modelled entry setup is invalidated, so it is excluded from the shortlist regardless of an attractive narrative.",
  });
  if(!source.shortlistedAssetIds.has(asset.assetId))return finish({
   ...measured,stage:"shortlist_capacity",
   progress:"Setup passed the internal floor but did not make the capped surfaced shortlist. No bonus or forced promotion applied.",
  });
  return finish({...measured,stage:"surfaced",
   progress:"Ticker appears on the pre-hardening shadow shortlist. Final execution discipline and confirmed catalyst evidence must still be checked.",
  });
 });
}
