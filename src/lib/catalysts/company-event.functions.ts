import { createServerFn } from "@tanstack/react-start";
import { assessCatalyst, CATALYST_MODEL_VERSION, type CatalystAssessment, type CatalystEvidence } from "./company-event-model";

export interface CompanyCatalystRow {
  id: string;
  eventKey: string;
  symbol: string;
  companyName: string;
  eventType: CatalystEvidence["event_type"];
  headline: string;
  summary: string;
  direction: CatalystEvidence["direction"];
  status: CatalystEvidence["status"];
  knownAt: string;
  effectiveAt: string | null;
  sourceName: string;
  sourceUrl: string;
  sourceTier: CatalystEvidence["source_tier"];
  assessment: CatalystAssessment;
}

export interface OfficialIndexDocument {
  id:string;
  title:string;
  sourceUrl:string;
  publishedAt:string;
  firstObservedAt:string;
  state:"unmapped" | "reviewed" | "dismissed";
  collectionMethod:"automatic_feed"|"manual_official";
  publishedTimePrecision:"exact"|"date_only_conservative";
}
export interface PollHealth {
  startedAt:string;
  status:"running"|"ok"|"error"|"skipped";
  observed:number;
  warning:string|null;
}
export interface CompanyCatalystWorkspace {
  asOf: string;
  modelVersion: string;
  mode: "shadow";
  secEdgarConfigured: boolean;
  scheduledRefreshConfigured: boolean;
  events: CompanyCatalystRow[];
  indexDocuments:OfficialIndexDocument[];
  lastIndexPoll:PollHealth|null;
  verified: number;
  pendingReview: number;
  activeSignals: number;
  unknownOrExpired: number;
  latestKnownAt: string | null;
  note: string;
}

export const getCompanyCatalystWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<CompanyCatalystWorkspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Additive schema is separate from legacy generated Supabase Database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabaseAdmin as any;
    const { data, error } = await db.from("catalyst_events")
      .select("id,asset_id,event_key,event_type,headline,summary,direction,status,source_name,source_url,source_tier,source_published_at,known_at,effective_at,expires_at,materiality,novelty,evidence_confidence,evidence,verified_at")
      .order("known_at",{ascending:false}).limit(300);
    if (error) throw new Error(`Catalyst ledger unavailable: ${error.message}`);
    const events = (data ?? []) as CatalystEvidence[];
    const ids = [...new Set(events.map(e => e.asset_id))];
    const { data: assets, error: assetError } = ids.length
      ? await db.from("assets").select("id,symbol,name").in("id",ids)
      : { data: [], error: null };
    if (assetError) throw new Error(`Catalyst asset index unavailable: ${assetError.message}`);
    const names = new Map<string,{symbol:string;name:string}>(
      ((assets ?? []) as Array<{id:string;symbol:string;name:string}>)
        .map(a => [a.id,{symbol:a.symbol,name:a.name}]),
    );
    const [sourceRows,runRows]=await Promise.all([
      db.from("catalyst_source_documents")
        .select("id,title,source_url,source_published_at,first_observed_at,status,collection_method,published_time_precision")
        .eq("provider","sp_dji_index_news")
        .order("first_observed_at",{ascending:false})
        .limit(60),
      db.from("catalyst_poll_runs")
        .select("started_at,status,observed,warning")
        .eq("source","sp_dji_index_news")
        .order("started_at",{ascending:false})
        .limit(1),
    ]);
    if(sourceRows.error)throw new Error("Official index announcement inbox unavailable: "+sourceRows.error.message);
    if(runRows.error)throw new Error("Source polling diagnostics unavailable: "+runRows.error.message);
    const indexDocuments:OfficialIndexDocument[]=((sourceRows.data??[]) as Array<{
      id:string;title:string;source_url:string;source_published_at:string;
      first_observed_at:string;status:"unmapped"|"reviewed"|"dismissed";
      collection_method:"automatic_feed"|"manual_official";
      published_time_precision:"exact"|"date_only_conservative";
    }>).map(d=>({
      id:d.id,title:d.title,sourceUrl:d.source_url,publishedAt:d.source_published_at,
      firstObservedAt:d.first_observed_at,state:d.status,
      collectionMethod:d.collection_method,
      publishedTimePrecision:d.published_time_precision,
    }));
    const lastRun=(runRows.data??[])[0] as {
      started_at:string;status:PollHealth["status"];observed:number;warning:string|null;
    } | undefined;
    const lastIndexPoll:PollHealth|null=lastRun?{
      startedAt:lastRun.started_at,status:lastRun.status,
      observed:lastRun.observed,warning:lastRun.warning,
    }:null;
    const now=new Date();
    const rows: CompanyCatalystRow[] = events.map(event => {
      const asset = names.get(event.asset_id);
      return {
        id:event.id,eventKey:event.event_key,
        symbol:asset?.symbol ?? "UNMAPPED",
        companyName:asset?.name ?? "Unknown instrument",
        eventType:event.event_type, headline:event.headline, summary:event.summary,
        direction:event.direction, status:event.status,
        knownAt:event.known_at,effectiveAt:event.effective_at,
        sourceName:event.source_name,sourceUrl:event.source_url,sourceTier:event.source_tier,
        assessment:assessCatalyst(event,now),
      };
    });
    rows.sort((a,b) => (b.assessment.priorityScore ?? -1) - (a.assessment.priorityScore ?? -1)
      || b.knownAt.localeCompare(a.knownAt));
    return {
      asOf:now.toISOString(),modelVersion:CATALYST_MODEL_VERSION,mode:"shadow",
      secEdgarConfigured:Boolean(process.env.SEC_EDGAR_USER_AGENT),
      scheduledRefreshConfigured:false,
      events:rows,indexDocuments,lastIndexPoll,verified:events.filter(e=>e.status==="verified").length,
      pendingReview:events.filter(e=>e.status==="candidate").length,
      activeSignals:rows.filter(r=>r.assessment.state==="active").length,
      unknownOrExpired:rows.filter(r=>r.assessment.state!=="active").length,
      latestKnownAt:events.reduce<string|null>((max,e)=>!max||e.known_at>max?e.known_at:max,null),
      note:"Catalyst scores are exploratory only. No automatic bonus is applied to Swing or Opportunity Radar rankings. Missing evidence stays unknown.",
    };
  },
);
