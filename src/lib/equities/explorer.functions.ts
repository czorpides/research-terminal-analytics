import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type EquityExplorerMode = "master" | "screener" | "undervalued" | "overvalued";
export type EquitySortKey =
  | "symbol"
  | "name"
  | "country"
  | "market"
  | "lastClose"
  | "momentum"
  | "trend"
  | "volatility"
  | "valuation"
  | "quality"
  | "composite"
  | "valueSetup"
  | "riskSetup"
  | "confidence";

export interface EquityExplorerRow {
  assetId: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  countryCode: string;
  country: string;
  market: "US" | "UK" | "EU" | "Other";
  industryCode: string | null;
  industry: string | null;
  lastClose: number | null;
  scoreAsOf: string | null;
  momentum: number | null;
  trend: number | null;
  volatility: number | null;
  valuation: number | null;
  quality: number | null;
  piotroski: number | null;
  magicFormulaPercentile: number | null;
  composite: number | null;
  valueSetup: number | null;
  riskSetup: number | null;
  confidence: number;
  technicalCoverage: boolean;
  fundamentalCoverage: boolean;
}

export interface EquityExplorerResult {
  rows: EquityExplorerRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  universeSize: number;
  summary: {
    technicalCoverage: number;
    fundamentalCoverage: number;
    fullyScored: number;
    us: number;
    uk: number;
    eu: number;
    other: number;
  };
  facets: {
    countries: Array<{ code: string; name: string; count: number }>;
    industries: Array<{ code: string; name: string; count: number }>;
  };
}

const inputSchema = z.object({
  mode: z.enum(["master", "screener", "undervalued", "overvalued"]).default("master"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(25).max(200).default(50),
  search: z.string().max(80).optional(),
  markets: z.array(z.enum(["US", "UK", "EU", "Other"])).optional(),
  countries: z.array(z.string().max(3)).optional(),
  industries: z.array(z.string().max(32)).optional(),
  minMomentum: z.number().min(0).max(100).optional(),
  maxMomentum: z.number().min(0).max(100).optional(),
  minTrend: z.number().min(0).max(100).optional(),
  maxTrend: z.number().min(0).max(100).optional(),
  minValuation: z.number().min(0).max(100).optional(),
  maxValuation: z.number().min(0).max(100).optional(),
  minQuality: z.number().min(0).max(100).optional(),
  maxQuality: z.number().min(0).max(100).optional(),
  minComposite: z.number().min(0).max(100).optional(),
  maxComposite: z.number().min(0).max(100).optional(),
  coverage: z.enum(["all", "technical", "fundamental", "complete", "missing"]).default("all"),
  sort: z
    .enum([
      "symbol",
      "name",
      "country",
      "market",
      "lastClose",
      "momentum",
      "trend",
      "volatility",
      "valuation",
      "quality",
      "composite",
      "valueSetup",
      "riskSetup",
      "confidence",
    ])
    .default("composite"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type EquityExplorerInput = z.infer<typeof inputSchema>;

interface AssetRow {
  id: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  industry_id: string | null;
  country_id: string | null;
}

interface ScoreRow {
  subject_id: string;
  score_type: string;
  value: number;
  confidence: number;
  inputs: Record<string, unknown> | null;
  computed_at: string;
}

export const getEquityExplorer = createServerFn({ method: "POST" })
  .inputValidator((input: EquityExplorerInput) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<EquityExplorerResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: assetData, error: assetError } = await supabaseAdmin
      .from("assets")
      .select("id,symbol,name,exchange,currency,industry_id,country_id")
      .eq("active", true)
      .eq("asset_class", "equity")
      .order("symbol", { ascending: true })
      .limit(3_500);
    if (assetError) throw assetError;

    const assets = (assetData ?? []) as AssetRow[];
    if (assets.length === 0) return emptyResult(data.page, data.pageSize);

    const assetIds = assets.map((asset) => asset.id);
    const countryIds = unique(assets.map((asset) => asset.country_id).filter(Boolean) as string[]);
    const industryIds = unique(assets.map((asset) => asset.industry_id).filter(Boolean) as string[]);
    const batches = chunk(assetIds, 100);

    const [scorePages, countryResult, industryResult] = await Promise.all([
      Promise.all(
        batches.map((batch) =>
          supabaseAdmin
            .from("latest_asset_scores")
            .select("subject_id,score_type,value,confidence,inputs,computed_at")
            .in("subject_id", batch)
            .in("score_type", [
              "momentum",
              "trend",
              "volatility",
              "valuation",
              "quality",
              "piotroski",
              "magic_formula",
            ])
            .limit(batch.length * 7),
        ),
      ),
      countryIds.length
        ? supabaseAdmin.from("countries").select("id,iso2,name").in("id", countryIds)
        : Promise.resolve({ data: [], error: null }),
      industryIds.length
        ? supabaseAdmin.from("industries").select("id,code,name").in("id", industryIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const scoreError = scorePages.find((page) => page.error)?.error;
    if (scoreError) throw scoreError;
    if (countryResult.error) throw countryResult.error;
    if (industryResult.error) throw industryResult.error;

    const countries = new Map(
      (countryResult.data ?? []).map((country) => [
        String(country.id),
        { code: String(country.iso2), name: String(country.name) },
      ]),
    );
    const industries = new Map(
      (industryResult.data ?? []).map((industry) => [
        String(industry.id),
        { code: String(industry.code), name: String(industry.name) },
      ]),
    );
    const scores = latestScores(
      scorePages.flatMap((page) => page.data ?? []) as unknown as ScoreRow[],
    );

    const allRows = assets.map((asset) => buildRow(asset, scores.get(asset.id) ?? {}, countries, industries));
    const preset = applyModePreset(data);
    const filtered = allRows.filter((row) => matches(row, preset));
    filtered.sort((left, right) => compareRows(left, right, preset.sort, preset.direction));

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / data.pageSize));
    const page = Math.min(data.page, totalPages);
    const start = (page - 1) * data.pageSize;
    const rows = filtered.slice(start, start + data.pageSize);

    return {
      rows,
      page,
      pageSize: data.pageSize,
      total,
      totalPages,
      universeSize: allRows.length,
      summary: summarise(allRows),
      facets: buildFacets(allRows),
    };
  });

function buildRow(
  asset: AssetRow,
  scoreBag: Record<string, ScoreRow>,
  countries: Map<string, { code: string; name: string }>,
  industries: Map<string, { code: string; name: string }>,
): EquityExplorerRow {
  const country = asset.country_id ? countries.get(asset.country_id) : null;
  const industry = asset.industry_id ? industries.get(asset.industry_id) : null;
  const momentum = scoreValue(scoreBag.momentum);
  const trend = scoreValue(scoreBag.trend);
  const volatility = scoreValue(scoreBag.volatility);
  const valuation = scoreValue(scoreBag.valuation);
  const quality = scoreValue(scoreBag.quality);
  const piotroski = finite(scoreBag.piotroski?.inputs?.raw_score);
  const magicFormulaPercentile = finite(scoreBag.magic_formula?.inputs?.universe_percentile);
  const technicalCoverage = momentum !== null || trend !== null || volatility !== null;
  const fundamentalCoverage = valuation !== null || quality !== null || piotroski !== null;
  const composite = weightedAverage([
    [momentum, 0.22],
    [trend, 0.22],
    [volatility, 0.16],
    [valuation, 0.22],
    [quality, 0.18],
  ]);
  const valueSetup = weightedAverage([
    [valuation, 0.45],
    [quality, 0.3],
    [trend, 0.15],
    [momentum, 0.1],
  ]);
  const riskSetup = weightedAverage([
    [invert(valuation), 0.4],
    [invert(quality), 0.2],
    [invert(trend), 0.18],
    [invert(momentum), 0.12],
    [invert(volatility), 0.1],
  ]);
  const confidenceValues = Object.values(scoreBag)
    .map((score) => finite(score.confidence))
    .filter((value): value is number => value !== null);
  const scoreDates = Object.values(scoreBag).map((score) => score.computed_at).filter(Boolean).sort();

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    exchange: asset.exchange,
    currency: asset.currency,
    countryCode: country?.code ?? "—",
    country: country?.name ?? "Unmapped",
    market: marketForCountry(country?.code ?? null),
    industryCode: industry?.code ?? null,
    industry: industry?.name ?? null,
    lastClose: finite(scoreBag.trend?.inputs?.cur),
    scoreAsOf: scoreDates.at(-1) ?? null,
    momentum,
    trend,
    volatility,
    valuation,
    quality,
    piotroski,
    magicFormulaPercentile,
    composite,
    valueSetup,
    riskSetup,
    confidence: confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0,
    technicalCoverage,
    fundamentalCoverage,
  };
}

function applyModePreset(input: EquityExplorerInput): EquityExplorerInput {
  if (input.mode === "undervalued") {
    return {
      ...input,
      minValuation: input.minValuation ?? 60,
      minQuality: input.minQuality ?? 45,
      sort: input.sort === "composite" ? "valueSetup" : input.sort,
    };
  }
  if (input.mode === "overvalued") {
    return {
      ...input,
      maxValuation: input.maxValuation ?? 40,
      sort: input.sort === "composite" ? "riskSetup" : input.sort,
    };
  }
  return input;
}

function matches(row: EquityExplorerRow, input: EquityExplorerInput): boolean {
  const search = input.search?.trim().toLowerCase();
  if (search && !`${row.symbol} ${row.name} ${row.country} ${row.industry ?? ""}`.toLowerCase().includes(search)) return false;
  if (input.markets?.length && !input.markets.includes(row.market)) return false;
  if (input.countries?.length && !input.countries.includes(row.countryCode)) return false;
  if (input.industries?.length && (!row.industryCode || !input.industries.includes(row.industryCode))) return false;
  if (!within(row.momentum, input.minMomentum, input.maxMomentum)) return false;
  if (!within(row.trend, input.minTrend, input.maxTrend)) return false;
  if (!within(row.valuation, input.minValuation, input.maxValuation)) return false;
  if (!within(row.quality, input.minQuality, input.maxQuality)) return false;
  if (!within(row.composite, input.minComposite, input.maxComposite)) return false;
  if (input.coverage === "technical" && !row.technicalCoverage) return false;
  if (input.coverage === "fundamental" && !row.fundamentalCoverage) return false;
  if (input.coverage === "complete" && (!row.technicalCoverage || !row.fundamentalCoverage)) return false;
  if (input.coverage === "missing" && row.technicalCoverage && row.fundamentalCoverage) return false;
  return true;
}

function compareRows(
  left: EquityExplorerRow,
  right: EquityExplorerRow,
  sort: EquitySortKey,
  direction: "asc" | "desc",
): number {
  const factor = direction === "asc" ? 1 : -1;
  const leftValue = left[sort];
  const rightValue = right[sort];
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return factor * String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
  }
  const leftNumber = finite(leftValue) ?? (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const rightNumber = finite(rightValue) ?? (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  return factor * (leftNumber - rightNumber) || left.symbol.localeCompare(right.symbol);
}

function latestScores(rows: ScoreRow[]): Map<string, Record<string, ScoreRow>> {
  const result = new Map<string, Record<string, ScoreRow>>();
  for (const row of rows) {
    const bag = result.get(row.subject_id) ?? {};
    if (!bag[row.score_type]) bag[row.score_type] = row;
    result.set(row.subject_id, bag);
  }
  return result;
}

function summarise(rows: EquityExplorerRow[]): EquityExplorerResult["summary"] {
  return rows.reduce(
    (summary, row) => {
      if (row.technicalCoverage) summary.technicalCoverage += 1;
      if (row.fundamentalCoverage) summary.fundamentalCoverage += 1;
      if (row.technicalCoverage && row.fundamentalCoverage) summary.fullyScored += 1;
      if (row.market === "US") summary.us += 1;
      else if (row.market === "UK") summary.uk += 1;
      else if (row.market === "EU") summary.eu += 1;
      else summary.other += 1;
      return summary;
    },
    { technicalCoverage: 0, fundamentalCoverage: 0, fullyScored: 0, us: 0, uk: 0, eu: 0, other: 0 },
  );
}

function buildFacets(rows: EquityExplorerRow[]): EquityExplorerResult["facets"] {
  const countryCounts = new Map<string, { name: string; count: number }>();
  const industryCounts = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const country = countryCounts.get(row.countryCode) ?? { name: row.country, count: 0 };
    country.count += 1;
    countryCounts.set(row.countryCode, country);
    if (row.industryCode) {
      const industry = industryCounts.get(row.industryCode) ?? { name: row.industry ?? row.industryCode, count: 0 };
      industry.count += 1;
      industryCounts.set(row.industryCode, industry);
    }
  }
  return {
    countries: [...countryCounts.entries()]
      .map(([code, value]) => ({ code, ...value }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    industries: [...industryCounts.entries()]
      .map(([code, value]) => ({ code, ...value }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
  };
}

function marketForCountry(code: string | null): EquityExplorerRow["market"] {
  if (code === "US") return "US";
  if (code === "GB") return "UK";
  if (code && ["DE", "FR", "NL", "BE", "PT", "IT", "ES", "SE", "DK", "FI", "PL", "AT", "IE", "CZ"].includes(code)) return "EU";
  return "Other";
}

function within(value: number | null, minimum?: number, maximum?: number): boolean {
  if (minimum === undefined && maximum === undefined) return true;
  if (value === null) return false;
  if (minimum !== undefined && value < minimum) return false;
  if (maximum !== undefined && value > maximum) return false;
  return true;
}

function scoreValue(score?: ScoreRow): number | null {
  return finite(score?.value);
}

function invert(value: number | null): number | null {
  return value === null ? null : 100 - value;
}

function weightedAverage(values: Array<[number | null, number]>): number | null {
  const usable = values.filter((entry): entry is [number, number] => entry[0] !== null);
  if (usable.length === 0) return null;
  const denominator = usable.reduce((sum, [, weight]) => sum + weight, 0);
  return usable.reduce((sum, [value, weight]) => sum + value * weight, 0) / denominator;
}

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < values.length; start += size) result.push(values.slice(start, start + size));
  return result;
}

function emptyResult(page: number, pageSize: number): EquityExplorerResult {
  return {
    rows: [],
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    universeSize: 0,
    summary: { technicalCoverage: 0, fundamentalCoverage: 0, fullyScored: 0, us: 0, uk: 0, eu: 0, other: 0 },
    facets: { countries: [], industries: [] },
  };
}
