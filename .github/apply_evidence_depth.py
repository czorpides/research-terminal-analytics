from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"expected source block not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    left = text.find(start)
    right = text.find(end, left)
    if left < 0 or right < 0:
        raise SystemExit(f"markers not found in {path}: {start!r} -> {end!r}")
    p.write_text(text[:left] + replacement + text[right:])


# 1) Deepen FMP annual history and retain historical key metrics alongside each filing.
path = "src/lib/ingestion/fundamentals/ingest.server.ts"
replace(path,
'''interface FmpCashFlowStatement extends FmpStatementBase {
  operatingCashFlow?: number;
  netCashProvidedByOperatingActivities?: number;
}

interface AnnualStatementBundle {
  income: FmpIncomeStatement[];
  balance: FmpBalanceSheet[];
  cashFlow: FmpCashFlowStatement[];
}
''',
'''interface FmpCashFlowStatement extends FmpStatementBase {
  operatingCashFlow?: number;
  netCashProvidedByOperatingActivities?: number;
}

interface FmpHistoricalKeyMetrics extends FmpStatementBase {
  marketCap?: number;
  enterpriseValue?: number;
  enterpriseValueOverEBITDA?: number;
  evToEBITDA?: number;
  evToSales?: number;
  enterpriseValueOverRevenue?: number;
  freeCashFlowYield?: number;
  [key: string]: unknown;
}

interface AnnualStatementBundle {
  income: FmpIncomeStatement[];
  balance: FmpBalanceSheet[];
  cashFlow: FmpCashFlowStatement[];
  keyMetrics: FmpHistoricalKeyMetrics[];
}
''')
replace(path, 'if (distinctPeriods.size >= 3 && !stale) {', 'if (distinctPeriods.size >= 8 && !stale) {')
replace(path,
'"At least three annual periods are stored and the latest statement check is under 90 days old."',
'"At least eight annual periods are stored and the latest statement check is under 90 days old."')
replace(path, 'const gate = await canUse("fmp", 250, 3);\n    if (!gate.ok) return emptyStatementResult', 'const gate = await canUse("fmp", 250, 4);\n    if (!gate.ok) return emptyStatementResult')
replace(path, 'period: "annual",\n        limit: "4",', 'period: "annual",\n        limit: "10",')
replace(path, 'period: "annual",\n        limit: "4",', 'period: "annual",\n        limit: "10",')
replace(path, 'period: "annual",\n        limit: "4",', 'period: "annual",\n        limit: "10",')
replace(path,
'''      const stored = await storeAnnualStatementHistory({
        assetId: input.assetId,
        symbol: input.symbol,
        sourceId: input.sourceId,
        bundle: { income: income ?? [], balance: balance ?? [], cashFlow: cashFlow ?? [] },
      });
''',
'''      let keyMetrics: FmpHistoricalKeyMetrics[] = [];
      try {
        keyMetrics =
          (await fmp<FmpHistoricalKeyMetrics>("key-metrics", input.symbol, input.apiKey, {
            period: "annual",
            limit: "10",
          })) ?? [];
      } catch (error) {
        // Historical valuation is additive evidence. A provider-plan or quota
        // limitation must not discard otherwise valid annual statements.
        if (!(error instanceof FmpQuotaError) && !(error instanceof FmpEntitlementError)) throw error;
      }
      const stored = await storeAnnualStatementHistory({
        assetId: input.assetId,
        symbol: input.symbol,
        sourceId: input.sourceId,
        bundle: {
          income: income ?? [],
          balance: balance ?? [],
          cashFlow: cashFlow ?? [],
          keyMetrics,
        },
      });
''')
replace(path,
'''  const incomeByDate = statementMap(input.bundle.income);
  const balanceByDate = statementMap(input.bundle.balance);
  const cashByDate = statementMap(input.bundle.cashFlow);
''',
'''  const incomeByDate = statementMap(input.bundle.income);
  const balanceByDate = statementMap(input.bundle.balance);
  const cashByDate = statementMap(input.bundle.cashFlow);
  const keyMetricsByDate = statementMap(input.bundle.keyMetrics);
''')
replace(path, '.slice(0, 4);\n  let filingsInserted', '.slice(0, 10);\n  let filingsInserted')
replace(path,
'''    const income = incomeByDate.get(periodEnd);
    const balance = balanceByDate.get(periodEnd);
    const cashFlow = cashByDate.get(periodEnd);
    const facts = statementFacts(income, balance, cashFlow);
''',
'''    const income = incomeByDate.get(periodEnd);
    const balance = balanceByDate.get(periodEnd);
    const cashFlow = cashByDate.get(periodEnd);
    const keyMetrics = historicalKeyMetricForPeriod(input.bundle.keyMetrics, keyMetricsByDate, periodEnd);
    const facts = statementFacts(income, balance, cashFlow);
''')
replace(path,
'const contentHash = createHash("sha256").update(JSON.stringify(facts)).digest("hex");',
'''const contentHash = createHash("sha256")
      .update(JSON.stringify({ facts, keyMetrics: keyMetrics ?? null }))
      .digest("hex");''')
replace(path,
'''    const raw = { symbol: input.symbol, income: income ?? null, balance: balance ?? null, cashFlow: cashFlow ?? null };
''',
'''    const raw = {
      symbol: input.symbol,
      income: income ?? null,
      balance: balance ?? null,
      cashFlow: cashFlow ?? null,
      keyMetrics: keyMetrics ?? null,
    };
''')
replace(path,
'''function statementFacts(
''',
'''function historicalKeyMetricForPeriod(
  rows: FmpHistoricalKeyMetrics[],
  byDate: Map<string, FmpHistoricalKeyMetrics>,
  periodEnd: string,
): FmpHistoricalKeyMetrics | undefined {
  const exact = byDate.get(periodEnd);
  if (exact) return exact;
  const year = periodEnd.slice(0, 4);
  return rows.find((row) => row.calendarYear === year || row.date?.slice(0, 4) === year);
}

function statementFacts(
''')

# 2) Let the downstream point-in-time models actually read the deeper history.
replace("src/lib/opportunity/fundamental-history.server.ts", ".limit(batch.length * 8);", ".limit(batch.length * 12);")
path = "src/lib/opportunity/institutional.functions.ts"
replace(path, "const MAX_PERIODS_PER_ASSET = 6;", "const MAX_PERIODS_PER_ASSET = 10;")
replace(path,
'''  const income = record(raw.income);
  const balance = record(raw.balance);
  const cashFlow = record(raw.cashFlow);
''',
'''  const income = record(raw.income);
  const balance = record(raw.balance);
  const cashFlow = record(raw.cashFlow);
  const keyMetrics = record(raw.keyMetrics);
''')
replace(path, '    netIncome: readNumber(income, ["netIncome"]),\n', '''    netIncome: readNumber(income, ["netIncome"]),
    netIncomeToCommon: readNumber(income, [
      "netIncomeAvailableToCommonShareholders",
      "netIncomeApplicableToCommonShares",
      "netIncomeCommonStockholders",
    ]),
''')
replace(path, '    totalEquity: readNumber(balance, ["totalStockholdersEquity", "totalEquity"]),\n', '''    totalEquity: readNumber(balance, ["totalStockholdersEquity", "totalEquity"]),
    preferredStock: readNumber(balance, [
      "preferredStock",
      "preferredStockEquity",
      "preferredStockAndOtherAdjustments",
    ]),
''')
replace(path,
'''    sellingGeneralAdministrative: readNumber(income, [
      "sellingGeneralAndAdministrativeExpenses",
      "sellingAndMarketingExpenses",
    ]),
''',
'''    sellingGeneralAdministrative: readNumber(income, [
      "sellingGeneralAndAdministrativeExpenses",
      "sellingAndMarketingExpenses",
    ]),
    historicalMarketCap: readNumber(keyMetrics, ["marketCap", "marketCapitalization"]),
    historicalEnterpriseValue: readNumber(keyMetrics, ["enterpriseValue"]),
    historicalEvEbitda: readNumber(keyMetrics, [
      "enterpriseValueOverEBITDA",
      "evToEBITDA",
      "evToEbitda",
    ]),
    historicalEvRevenue: readNumber(keyMetrics, [
      "evToSales",
      "enterpriseValueOverRevenue",
      "enterpriseValueToRevenue",
    ]),
    historicalFcfYield: readNumber(keyMetrics, ["freeCashFlowYield", "freeCashFlowYieldTTM"]),
''')

# 3) Derive historical-self, bank tangible-book and normalized-cycle evidence.
path = "src/lib/opportunity/institutional-model.ts"
replace(path, 'export const INSTITUTIONAL_CALC_VERSION = "opportunity.institutional.v0.1";', 'import { computeDeepValuationEvidence } from "./deep-valuation";\n\nexport const INSTITUTIONAL_CALC_VERSION = "opportunity.institutional.v0.2";')
replace(path, '  netIncome: number | null;\n', '  netIncome: number | null;\n  netIncomeToCommon: number | null;\n')
replace(path, '  totalEquity: number | null;\n', '  totalEquity: number | null;\n  preferredStock: number | null;\n')
replace(path, '  sellingGeneralAdministrative: number | null;\n}', '''  sellingGeneralAdministrative: number | null;
  historicalMarketCap: number | null;
  historicalEnterpriseValue: number | null;
  historicalEvEbitda: number | null;
  historicalEvRevenue: number | null;
  historicalFcfYield: number | null;
}''')
replace(path,
'''  const enterpriseValue =
    isNumber(marketCap) && isNumber(totalDebt) ? marketCap + totalDebt - cash : null;
  const costOfCapital = estimateCostOfCapital({
''',
'''  const enterpriseValue =
    isNumber(marketCap) && isNumber(totalDebt) ? marketCap + totalDebt - cash : null;
  const deepValuation = computeDeepValuationEvidence({
    periods,
    current: {
      marketCap: input.fundamentals.marketCap,
      evEbitda: input.fundamentals.evEbitda,
      fcfYield: input.fundamentals.fcfYield,
    },
    currentEnterpriseValue: enterpriseValue,
  });
  const costOfCapital = estimateCostOfCapital({
''')
replace(path,
'''  if (FINANCIAL_INDUSTRIES.has(input.industryCode ?? "")) {
    dataGaps.push("Financial companies use residual-income evidence, but regulatory capital, asset quality and funding-liquidity data are still required.");
  }
''',
'''  if (deepValuation.historyYears < 5) {
    dataGaps.push("Fewer than five comparable annual valuation observations are stored, so the self-history valuation lens remains inactive.");
  }
  if (FINANCIAL_INDUSTRIES.has(input.industryCode ?? "")) {
    if (!isNumber(deepValuation.priceToTangibleBook) || !isNumber(deepValuation.rotce)) {
      dataGaps.push("Financial valuation still lacks a usable P/TBV–ROTCE pair.");
    }
    dataGaps.push("Financial companies still require regulatory capital, asset quality and funding-liquidity data for full sector risk coverage.");
  }
  if ((input.industryCode === "SEC_ENE" || input.industryCode === "SEC_MAT") && deepValuation.cycleHistoryYears < 7) {
    dataGaps.push("Fewer than seven annual operating observations are stored, so normalized cyclical earnings remain provisional.");
  }
''')
replace(path,
'''      beneishMScore: beneish.score,
      misstatementRiskProxy,
''',
'''      beneishMScore: beneish.score,
      misstatementRiskProxy,
      historicalValuationYears: deepValuation.historyYears,
      currentEvRevenue: deepValuation.currentEvRevenue,
      selfEvEbitdaCheapness: deepValuation.selfEvEbitdaCheapness,
      selfEvRevenueCheapness: deepValuation.selfEvRevenueCheapness,
      selfFcfYieldCheapness: deepValuation.selfFcfYieldCheapness,
      priceToTangibleBook: deepValuation.priceToTangibleBook,
      rotce: deepValuation.rotce,
      rotceToPtbv: deepValuation.rotceToPtbv,
      rotceQuality: deepValuation.rotceQuality,
      selfPtbvCheapness: deepValuation.selfPtbvCheapness,
      normalizedEbitda: deepValuation.normalizedEbitda,
      normalizedEvEbitda: deepValuation.normalizedEvEbitda,
      normalizedFcf: deepValuation.normalizedFcf,
      normalizedFcfYield: deepValuation.normalizedFcfYield,
      cycleHistoryYears: deepValuation.cycleHistoryYears,
''')

# 4) Replace the valuation gate with the expert dual-lens/sector implementation.
path = "src/lib/opportunity/fundamental-timing.ts"
start = "function valuationGate(\n"
end = "function valueTrapGate(\n"
replacement = r'''function valuationGate(
  candidate: OpportunityCandidate,
  institutional: InstitutionalAnalysis | null,
): FundamentalGate {
  const peerValuation = finite(candidate.evidence.valuationCompression?.value);
  const fcfYield = metricValue(institutional, "valuation_expectations", "fcf_yield");
  const evEbitda = metricValue(institutional, "valuation_expectations", "ev_ebitda");
  const expectationGap = raw(institutional, "expectationGap");
  const revenueGrowth = raw(institutional, "revenueGrowth");
  const fcfMargin = raw(institutional, "fcfMargin");
  const residualIncome = raw(institutional, "residualIncome");
  const historyYears = raw(institutional, "historicalValuationYears");
  const selfEvEbitda = raw(institutional, "selfEvEbitdaCheapness");
  const selfEvRevenue = raw(institutional, "selfEvRevenueCheapness");
  const selfFcfYield = raw(institutional, "selfFcfYieldCheapness");
  const priceToTangibleBook = raw(institutional, "priceToTangibleBook");
  const rotce = raw(institutional, "rotce");
  const rotceToPtbv = raw(institutional, "rotceToPtbv");
  const rotceQuality = raw(institutional, "rotceQuality");
  const selfPtbv = raw(institutional, "selfPtbvCheapness");
  const currentEvRevenue = raw(institutional, "currentEvRevenue");
  const normalizedEvEbitda = raw(institutional, "normalizedEvEbitda");
  const normalizedFcfYield = raw(institutional, "normalizedFcfYield");
  const cycleHistoryYears = raw(institutional, "cycleHistoryYears");
  const industry = candidate.industryCode ?? "";
  const positives: string[] = [];
  const warnings: string[] = [];
  const parts: Array<{ value: number | null; weight: number }> = [];

  if (peerValuation !== null) {
    parts.push({ value: peerValuation, weight: 25 });
    if (peerValuation >= 62) positives.push("Current valuation is attractive relative to tracked peers.");
  }
  if ((historyYears ?? 0) < 5) {
    warnings.push("Fewer than five annual self-valuation observations are available; the historical lens is not scored.");
  }

  if (industry === "SEC_FIN") {
    parts.push({ value: scaleHigher(rotce, 0.05, 0.2), weight: 30 });
    parts.push({ value: scaleHigher(rotceToPtbv, 0.05, 0.16), weight: 30 });
    parts.push({ value: selfPtbv, weight: 15 });
    parts.push({ value: scaleHigher(residualIncome, -0.05, 0.12), weight: 10 });
    const score = weighted(parts);
    const completePair = priceToTangibleBook !== null && rotce !== null && rotceToPtbv !== null;
    const canPass = completePair && (rotceQuality ?? 0) >= 0.75 && rotce >= 0.1;
    if (completePair) {
      positives.push(`P/TBV is ${priceToTangibleBook.toFixed(2)}× against ROTCE of ${(rotce * 100).toFixed(1)}%.`);
    } else {
      warnings.push("A usable P/TBV–ROTCE pair is not yet available.");
    }
    warnings.push("Regulatory capital, asset quality and funding liquidity remain separate financial-sector risk requirements.");
    return gate(
      "valuation",
      "Sector-appropriate valuation",
      score === null ? "missing" : score < 35 ? "fail" : score >= 62 && canPass ? "pass" : "watch",
      score,
      parts,
      "Financials are judged on the return earned on tangible common equity relative to the price paid for that tangible book, not on low book value alone.",
      positives,
      warnings,
    );
  }

  if (industry === "SEC_TECH") {
    const ruleOf40 = revenueGrowth !== null && fcfMargin !== null ? revenueGrowth + fcfMargin : null;
    parts.push({ value: scaleHigher(ruleOf40, 0, 0.4), weight: 30 });
    parts.push({ value: selfEvRevenue, weight: 25 });
    parts.push({ value: scaleLower(currentEvRevenue, 12, 3), weight: 15 });
    parts.push({ value: scaleHigher(fcfYield, 0.01, 0.09), weight: 15 });
    parts.push({ value: scaleHigher(expectationGap, -0.08, 0.1), weight: 10 });
    if (ruleOf40 !== null && ruleOf40 >= 0.4) positives.push("Revenue growth plus FCF margin meets the Rule-of-40 threshold.");
    if (selfEvRevenue !== null && selfEvRevenue >= 70) positives.push("Current EV/revenue sits near the cheap end of the company's observed annual history.");
  } else if (CYCLICAL_INDUSTRIES.has(industry)) {
    parts.push({ value: scaleLower(normalizedEvEbitda, 14, 6), weight: 40 });
    parts.push({ value: scaleHigher(normalizedFcfYield, 0, 0.1), weight: 25 });
    parts.push({ value: selfEvEbitda, weight: 15 });
    parts.push({ value: scaleHigher(expectationGap, -0.1, 0.1), weight: 10 });
    if ((cycleHistoryYears ?? 0) < 7) {
      warnings.push("A seven-year operating history is not yet available, so low spot-cycle multiples cannot prove cheapness.");
    } else if (normalizedEvEbitda !== null) {
      positives.push(`Normalized EV/EBITDA is ${normalizedEvEbitda.toFixed(1)}× across the stored cycle rather than peak current earnings.`);
    }
  } else {
    parts.push({ value: scaleLower(evEbitda, 18, 7), weight: 25 });
    parts.push({ value: selfEvEbitda, weight: 20 });
    parts.push({ value: selfFcfYield, weight: 15 });
    parts.push({ value: scaleHigher(fcfYield, 0.01, 0.09), weight: 15 });
    parts.push({ value: scaleHigher(expectationGap, -0.08, 0.1), weight: 10 });
    if (evEbitda !== null && evEbitda <= 8) positives.push("EV/EBITDA is below 8×.");
    if (fcfYield !== null && fcfYield >= 0.06) positives.push("FCF yield provides cash-backed valuation support.");
    if (selfEvEbitda !== null && selfEvEbitda >= 70) positives.push("EV/EBITDA is near the cheap end of the company's own observed history.");
  }

  const score = weighted(parts);
  const sectorHistoryReady = !CYCLICAL_INDUSTRIES.has(industry) || (cycleHistoryYears ?? 0) >= 7;
  const state =
    score === null
      ? "missing"
      : score >= 62 && parts.filter((part) => part.value !== null).length >= 2 && sectorHistoryReady
        ? "pass"
        : score < 35
          ? "fail"
          : "watch";
  return gate(
    "valuation",
    "Sector-appropriate valuation",
    state,
    score,
    parts,
    "Combines peer-relative valuation with the company's own observed history and the sector-appropriate economic denominator.",
    positives,
    warnings,
  );
}

'''
replace_between(path, start, end, replacement)

print("evidence-depth transformation complete")
