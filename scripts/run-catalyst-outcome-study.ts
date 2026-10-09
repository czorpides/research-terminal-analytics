/**
 * Offline, source-auditable study of actual, pre-announcement hypotheses.
 * Usage:
 * node --experimental-strip-types scripts/run-catalyst-outcome-study.ts path/to/dated-research.json
 * Never import today's fundamentals as if they were known at historical dates.
 */
import {readFileSync} from "node:fs";
import {validateAnticipatoryHistory,
 type HistoricalCatalystCase} from "../src/lib/catalysts/outcome-study.ts";
import type {AnticipationHypothesis} from "../src/lib/catalysts/anticipatory-model.ts";
const file=process.argv[2];
if(!file){console.error("Provide a JSON evidence-case input path. No default/synthetic outcomes exist.");process.exit(2);}
try{
 const decoded:unknown=JSON.parse(readFileSync(file,"utf8"));
 if(!decoded||typeof decoded!=="object"||Array.isArray(decoded))throw Error("Expected object");
 const {cases,snapshots,studyAsOf}=decoded as {
   cases:HistoricalCatalystCase[];snapshots:AnticipationHypothesis[];studyAsOf:string;
 };
 if(!Array.isArray(cases)||!Array.isArray(snapshots)||typeof studyAsOf!=="string"||
    !Number.isFinite(Date.parse(studyAsOf)))throw Error("Expected cases, snapshots and explicit studyAsOf");
 const report=validateAnticipatoryHistory(cases,snapshots,new Date(studyAsOf));
 console.log(JSON.stringify(report,null,2));
 // A run with no labelled comparisons is not validation.
 if(report.labelled===0)process.exitCode=3;
}catch(error){
 console.error("Evidence study failed closed: "+(error instanceof Error?error.message:String(error)));
 process.exitCode=2;
}
