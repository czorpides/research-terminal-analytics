import { STATEMENT_METRICS, type StatementMetricCode } from "../../opportunity/fundamental-models.ts";

export interface SecAnnualFiling {
  accession: string;
  periodEnd: string;
  filedDate: string;
  acceptanceLocal: string | null;
  primaryDocument: string | null;
  facts: SecAnnualFact[];
}
export interface SecAnnualFact {
  metricCode: StatementMetricCode;
  tag: string;
  value: number;
  unit: "currency" | "shares";
  accession: string;
  periodEnd: string;
}
type SecFact = {
  start?: string; end?: string; val?: number; accn?: string;
  fy?: number; fp?: string; form?: string; filed?: string; frame?: string;
};
type SecConcept = { units?: Record<string, SecFact[]> };
type SecSubmissions = {
  cik?: string | number; tickers?: string[];
  filings?: { recent?: Record<string, unknown> };
};
type SecCompanyFacts = {
  cik?: number; facts?: { "us-gaap"?: Record<string, SecConcept> };
};

/**
 * Only original SEC 10-K filings; amendments and historical comparatives are
 * deliberately excluded from this initial ingest. A fact must appear in the
 * exact accession, period end and annual duration of that filing.
 *
 * Currency is USD only; an issuer without direct US-GAAP concepts is unknown,
 * never filled with a substitute metric or a guessed annual figure.
 */
export function selectSecAnnualFilings(
  cik: number,
  ticker: string,
  submissionsInput: unknown,
  companyFactsInput: unknown,
  limit = 3,
  historicalRows: readonly unknown[] = [],
): SecAnnualFiling[] {
  if (!Number.isSafeInteger(cik) || cik <= 0) throw new Error("Invalid issuer CIK");
  const submissions = submissionsInput as SecSubmissions;
  const companyFacts = companyFactsInput as SecCompanyFacts;
  if (Number(submissions?.cik) !== cik || Number(companyFacts?.cik) !== cik)
    throw new Error("SEC issuer CIK does not match both official responses");
  if (!submissions.tickers?.some((item) => item.toUpperCase() === ticker.toUpperCase()))
    throw new Error("SEC submissions do not currently identify the requested stock ticker");
  const recent = submissions.filings?.recent;
  if (!recent) return [];
  const rows = [recent, ...historicalRows].map(parseSecFilingRows);

  const gaap = companyFacts.facts?.["us-gaap"];
  if (!gaap) return [];
  const seen = new Set<string>();
  const output: SecAnnualFiling[] = [];
  // Iterate official recent indexes first, then explicitly selected older
  // submissions files. The same period can appear in multiple files.
  // Never invent 10-K metadata that is absent from the corresponding index.
  for (const index of rows) {
    for (let i = 0; i < index.accesses.length; i++) {
      if (index.forms[i] !== "10-K" || !isoDate(index.periods[i]) || !isoDate(index.filed[i]))
        continue;
      const accn = index.accesses[i];
      if (!/^\d{10}-\d{2}-\d{6}$/.test(accn)) continue;
      if (seen.has(index.periods[i])) continue;
      const facts = extractAnnualFacts(gaap, accn, index.periods[i]);
      if (!facts.length) continue;
      const attachment = index.primary[i] ?? "";
      output.push({
        accession: accn,
        periodEnd: index.periods[i],
        filedDate: index.filed[i],
        acceptanceLocal: index.accepted[i] || null,
        primaryDocument: /^[a-zA-Z0-9_.-]+$/.test(attachment) ? attachment : null,
        facts,
      });
      seen.add(index.periods[i]);
    }
  }
  // Older historical SEC index files are not guaranteed to arrive in
  // reverse chronology. Select the three latest original report periods.
  output.sort((a,b) => b.periodEnd.localeCompare(a.periodEnd));
  output.splice(Math.max(1, Math.min(10, limit)));
  return output;
}

interface ParsedSecFilingRows {
  accesses: string[];
  forms: string[];
  periods: string[];
  filed: string[];
  accepted: string[];
  primary: string[];
}
function parseSecFilingRows(input: unknown): ParsedSecFilingRows {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Malformed SEC submissions filing index");
  const rows = input as Record<string, unknown>;
  const accesses = getStrings(rows.accessionNumber);
  const forms = getStrings(rows.form);
  const periods = getStrings(rows.reportDate);
  const filed = getStrings(rows.filingDate);
  if (!accesses.length || accesses.length !== forms.length ||
      accesses.length !== periods.length || accesses.length !== filed.length)
    throw new Error("Malformed SEC submissions columnar filing arrays");
  const accepted = getStrings(rows.acceptanceDateTime);
  const primary = getStrings(rows.primaryDocument);
  return { accesses, forms, periods, filed, accepted, primary };
}

const MAPPING: Array<{
  metricCode: StatementMetricCode;
  tags: string[];
  unit: "USD" | "shares";
  duration: boolean;
}> = [
  {metricCode: STATEMENT_METRICS.netIncome,
   tags: ["NetIncomeLoss"],unit:"USD",duration:true},
  {metricCode: STATEMENT_METRICS.operatingCashFlow,
   tags: ["NetCashProvidedByUsedInOperatingActivities"],unit:"USD",duration:true},
  {metricCode: STATEMENT_METRICS.totalAssets,
   tags: ["Assets"],unit:"USD",duration:false},
  {metricCode: STATEMENT_METRICS.longTermDebt,
   tags: ["LongTermDebtNoncurrent"],unit:"USD",duration:false},
  {metricCode: STATEMENT_METRICS.currentAssets,
   tags: ["AssetsCurrent"],unit:"USD",duration:false},
  {metricCode: STATEMENT_METRICS.currentLiabilities,
   tags: ["LiabilitiesCurrent"],unit:"USD",duration:false},
  {metricCode: STATEMENT_METRICS.sharesOutstanding,
   tags: ["WeightedAverageNumberOfDilutedSharesOutstanding"],unit:"shares",duration:true},
  {metricCode: STATEMENT_METRICS.revenue,
   tags: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"],
   unit:"USD",duration:true},
  {metricCode: STATEMENT_METRICS.grossProfit,
   tags: ["GrossProfit"],unit:"USD",duration:true},
  {metricCode: STATEMENT_METRICS.cashAndEquivalents,
   tags: ["CashAndCashEquivalentsAtCarryingValue"],unit:"USD",duration:false},
  {metricCode: STATEMENT_METRICS.netFixedAssets,
   tags: ["PropertyPlantAndEquipmentNet"],unit:"USD",duration:false},
  // No proxying OperatingIncomeLoss to EBIT or total liabilities to total
  // interest-bearing debt. These metrics stay absent unless sourced correctly.
];

/** Direct accession-matched, USD or shares, single-filing facts only. */
export function extractAnnualFacts(
  gaap: Record<string, SecConcept>,
  accession: string,
  periodEnd: string,
): SecAnnualFact[] {
  const out: SecAnnualFact[] = [];
  for (const item of MAPPING) {
    for (const tag of item.tags) {
      const concepts = gaap[tag]?.units?.[item.unit] ?? [];
      const eligible = concepts.filter((row) =>
        row.accn === accession &&
        row.form === "10-K" &&
        row.end === periodEnd &&
        Number.isFinite(row.val) &&
        (item.duration ? annualDuration(row.start, row.end) : !row.start),
      );
      // Same accession can contain duplicate extracted facts. If values
      // disagree there is no reliable choice; omit the metric.
      const unique = [...new Set(eligible.map((row) => row.val))];
      if (unique.length !== 1) continue;
      out.push({
        metricCode: item.metricCode,
        tag,
        value: unique[0]!,
        unit: item.unit === "shares" ? "shares" : "currency",
        accession,
        periodEnd,
      });
      break;
    }
  }
  return out;
}
function getStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : "") : [];
}
function isoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function annualDuration(start: string | undefined, end: string | undefined): boolean {
  if (!isoDate(start) || !isoDate(end)) return false;
  const days = (Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / 86_400_000;
  return days >= 330 && days <= 400;
}
