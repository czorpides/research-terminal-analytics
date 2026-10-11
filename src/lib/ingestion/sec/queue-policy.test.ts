import test from "node:test";
import assert from "node:assert/strict";
import {retryableSecError,shouldTreatSecAsComplete} from "./queue-policy.ts";

test("only intermittent source failures are eligible for limited queue retries",()=>{
 for(const value of ["SEC HTTP 429","SEC HTTP 503","fetch failed","Network timeout"]){
   assert.equal(retryableSecError(value),true,value);
 }
 for(const value of ["No unambiguous SEC ticker-to-CIK identification",
   "SEC 10-K lacks accession-matched FY facts",
   "SEC ledger integrity flagged after import", "SEC HTTP 403",
   "Unsupported annual report"]){
   assert.equal(retryableSecError(value),false,value);
 }
});
test("queue never equates a file import or incomplete QA with complete history",()=>{
 assert.equal(shouldTreatSecAsComplete({originalThreeYears:true,structuralFlags:[0,0,0,0]}),true);
 assert.equal(shouldTreatSecAsComplete({originalThreeYears:false,structuralFlags:[0,0,0,0]}),false);
 assert.equal(shouldTreatSecAsComplete({originalThreeYears:null,structuralFlags:[0,0,0,0]}),false);
 assert.equal(shouldTreatSecAsComplete({originalThreeYears:true,structuralFlags:[0,null,0,0]}),false);
 assert.equal(shouldTreatSecAsComplete({originalThreeYears:true,structuralFlags:[0,0,1,0]}),false);
 assert.equal(shouldTreatSecAsComplete({originalThreeYears:true,structuralFlags:[0,0,0]}),false);
});
