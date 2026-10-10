import { createFileRoute } from "@tanstack/react-router";

/**
 * Fetch an official S&P DJI RSS announcement feed into the UNMAPPED
 * source-document inbox. No symbols are guessed and no trading scores change.
 */
export const Route=createFileRoute("/api/public/catalysts/poll-sp-index")({
 server:{handlers:{POST:async({request})=>{
   const {authorizeInternalJobRequest}=await import("@/lib/security/internal-job-auth.server");
   if(!authorizeInternalJobRequest(request))return new Response("Unauthorized",{status:401});
   const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
   // Additive schema not yet represented in generated Supabase Database types.
   // eslint-disable-next-line @typescript-eslint/no-explicit-any
   const db=supabaseAdmin as any;
   const {data:log}=await db.from("catalyst_poll_runs")
     .insert({source:"sp_dji_index_news",status:"running"})
     .select("id").single();
   try {
     const {fetchSPIndexAnnouncementFeed}=await import("@/lib/catalysts/providers/sp-index-feed.server");
     const fetched=await fetchSPIndexAnnouncementFeed();
     const {error}=await db.from("catalyst_source_documents")
       .upsert(fetched.documents,{onConflict:"source_url",ignoreDuplicates:true});
     if(error)throw new Error("Official index document inbox unavailable");
     const warning=fetched.documents.length===0
       ? "No matching constituent announcements in current feed; no event was inferred." : null;
     if(log?.id)await db.from("catalyst_poll_runs").update({
       finished_at:new Date().toISOString(),status:"ok",observed:fetched.documents.length,
       submitted:fetched.documents.length,warning,
     }).eq("id",log.id);
     return Response.json({ok:true,provider:"S&P Dow Jones Indices — official index RSS",
       observed:fetched.documents.length,submitted:fetched.documents.length,
       skipped:fetched.skipped,reviewRequired:true,sourceState:"unmapped",
       note:"Announcements require source review and explicit ticker matching before becoming catalyst events."});
   }catch(error){
     const msg=error instanceof Error?error.message:"Unknown source error";
     console.error("[catalyst-sp-index] poll failed",msg);
     if(log?.id)await db.from("catalyst_poll_runs").update({
       finished_at:new Date().toISOString(),status:"error",warning:msg.slice(0,450),
     }).eq("id",log.id);
     return Response.json({ok:false,error:"Index announcement polling unavailable; nothing verified"},{status:503});
   }
 }}},
});
