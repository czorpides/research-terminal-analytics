import assert from "node:assert/strict";
import test from "node:test";
import {verifyBankRevenueBridges} from "./reconciliation-policy.ts";
const row=(symbol:string,basis:string,value:string)=>({
 symbol,periodEnd:"2025-12-31",basis,value,
});
test("PNC, WFC and GS original 2025 bank revenue bridges reconcile exactly",()=>{
 const rows=[
  row("PNC","bank_issuer_total_revenue","23099000000"),
  row("PNC","bank_net_interest_income","14410000000"),
  row("PNC","bank_noninterest_income","8689000000"),
  row("WFC","bank_issuer_total_revenue","83699000000"),
  row("WFC","bank_net_interest_income","47484000000"),
  row("WFC","bank_noninterest_income","36215000000"),
  row("GS","bank_issuer_total_revenue","58283000000"),
  row("GS","bank_net_interest_income","13559000000"),
  row("GS","bank_noninterest_income","44724000000"),
 ];
 assert.deepEqual(verifyBankRevenueBridges(rows).map(v=>v.status),
  ["matches","matches","matches"]);
});
test("MS without reported components is incomplete, not guessed from totals",()=>{
 const r=verifyBankRevenueBridges([row("MS","bank_issuer_total_revenue","70645000000")]);
 assert.equal(r[0]?.status,"incomplete");
});
test("misclassified gross interest revenue cannot silently reconcile",()=>{
 const r=verifyBankRevenueBridges([
  row("PNC","bank_issuer_total_revenue","23099000000"),
  row("PNC","bank_net_interest_income","17000000000"),
  row("PNC","bank_noninterest_income","8689000000")
 ]);
 assert.equal(r[0]?.status,"mismatch");
});
test("large dollar integers remain exact and conflicting repeated lines fail",()=>{
 const rows=[
  row("X","bank_issuer_total_revenue","9007199254740993"),
  row("X","bank_net_interest_income","9007199254740992"),
  row("X","bank_noninterest_income","1"),
 ];
 assert.equal(verifyBankRevenueBridges(rows)[0]?.status,"matches");
 assert.equal(verifyBankRevenueBridges([...rows,
  row("X","bank_net_interest_income","9007199254740994")])[0]?.status,"incomplete");
});
