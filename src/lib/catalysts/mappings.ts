/**
 * Hand-curated mapping tables driving the deterministic catalyst engine.
 * Everything is versioned so downstream verifiers can pin the ruleset used.
 */
export const CATALYST_MAPPINGS_VERSION = "catalyst.mappings.v0.1";

/** FRED series → industry code impact. `sign` = +1 if series↑ helps industry, −1 if series↑ hurts. */
export interface MacroRule {
  indicatorCode: string;   // economic_indicators.code (e.g. "US_10Y")
  seriesLabel: string;
  industryCode: string;    // industries.code
  sign: 1 | -1;
  reasoningUp: string;     // used when the series is rising
  reasoningDown: string;   // used when the series is falling
  historicalNote?: string;
}

export const MACRO_RULES: MacroRule[] = [
  { indicatorCode: "US_10Y", seriesLabel: "US 10Y Treasury yield", industryCode: "SEC_UTL",
    sign: -1,
    reasoningUp: "Rising long-end yields raise Utilities' cost of capital and compress bond-proxy multiples.",
    reasoningDown: "Falling long-end yields expand Utilities' relative dividend appeal.",
    historicalNote: "Utilities drew down ~12% during the 2022 yield spike from 1.7% to 4.2%." },
  { indicatorCode: "US_10Y", seriesLabel: "US 10Y Treasury yield", industryCode: "SEC_RE",
    sign: -1,
    reasoningUp: "Rising 10Y yields raise cap rates and mortgage costs, pressuring REIT NAVs.",
    reasoningDown: "Falling 10Y yields lower cap rates and re-rate REITs higher.",
    historicalNote: "REITs fell ~28% in 2022 as 10Y rose from 1.5% to 4%." },
  { indicatorCode: "US_DFF", seriesLabel: "Fed Funds rate", industryCode: "SEC_FIN",
    sign: 1,
    reasoningUp: "Higher policy rates lift net interest margins for banks.",
    reasoningDown: "Rate cuts compress bank NIMs and slow loan repricing." },
  { indicatorCode: "US_CPI", seriesLabel: "CPI (headline)", industryCode: "SEC_CS",
    sign: -1,
    reasoningUp: "Sticky CPI erodes real disposable income and pressures Consumer Staples volumes.",
    reasoningDown: "Cooling CPI restores real income and eases Staples demand." },
  { indicatorCode: "US_CPI", seriesLabel: "CPI (headline)", industryCode: "SEC_CD",
    sign: -1,
    reasoningUp: "Rising CPI squeezes discretionary spend on autos, apparel, leisure.",
    reasoningDown: "Disinflation is a tailwind for Consumer Discretionary." },
  { indicatorCode: "US_UNRATE", seriesLabel: "US unemployment rate", industryCode: "SEC_CD",
    sign: -1,
    reasoningUp: "Rising unemployment historically leads discretionary spending downturns.",
    reasoningDown: "Tight labour market supports discretionary demand." },
  { indicatorCode: "US_T10Y2Y", seriesLabel: "10Y − 2Y spread", industryCode: "SEC_FIN",
    sign: 1,
    reasoningUp: "A steepening curve lifts bank net interest margins.",
    reasoningDown: "Curve inversion signals recession risk and compresses bank margins." },
  { indicatorCode: "US_INDPRO", seriesLabel: "US Industrial Production", industryCode: "SEC_IND",
    sign: 1,
    reasoningUp: "Rising industrial production directly feeds Industrials volumes.",
    reasoningDown: "Contracting IP historically precedes Industrials earnings downgrades." },
];

/** Commodity code → industry code impact. */
export interface CommodityRule {
  commodityCode: string;
  commodityName: string;
  industryCode: string;
  sign: 1 | -1;
  reasoningUp: string;
  reasoningDown: string;
  historicalNote?: string;
}

export const COMMODITY_RULES: CommodityRule[] = [
  { commodityCode: "WTI", commodityName: "Crude Oil (WTI)", industryCode: "SEC_ENE",
    sign: 1,
    reasoningUp: "Rising crude directly lifts upstream Energy revenue per barrel.",
    reasoningDown: "Falling crude compresses Energy upstream margins.",
    historicalNote: "Energy sector +65% during 2021–2022 oil rally from $40 to $120." },
  { commodityCode: "WTI", commodityName: "Crude Oil (WTI)", industryCode: "SEC_IND",
    sign: -1,
    reasoningUp: "Higher jet fuel and diesel raise Industrials' input and freight costs.",
    reasoningDown: "Falling crude lowers freight and manufacturing input costs." },
  { commodityCode: "NG", commodityName: "Natural Gas", industryCode: "SEC_UTL",
    sign: -1,
    reasoningUp: "Higher gas prices raise generation costs at fossil-heavy utilities.",
    reasoningDown: "Lower gas prices improve utility margins." },
  { commodityCode: "COPPER", commodityName: "Copper", industryCode: "SEC_MAT",
    sign: 1,
    reasoningUp: "Rising copper signals industrial demand and lifts Materials earnings.",
    reasoningDown: "Falling copper flags weakening industrial demand." },
  { commodityCode: "GOLD", commodityName: "Gold", industryCode: "SEC_MAT",
    sign: 1,
    reasoningUp: "Rising gold prices lift miner cash flows.",
    reasoningDown: "Falling gold pressures miner margins." },
  { commodityCode: "WHEAT", commodityName: "Wheat", industryCode: "SEC_CS",
    sign: -1,
    reasoningUp: "Higher grain prices raise Staples input costs (baked goods, cereals).",
    reasoningDown: "Softer grains ease Staples margin pressure." },
  { commodityCode: "CORN", commodityName: "Corn", industryCode: "SEC_CS",
    sign: -1,
    reasoningUp: "Higher corn feeds through to protein and packaged food costs.",
    reasoningDown: "Lower corn eases packaged food input costs." },
];

/**
 * Alt-data signal → industry impact. Alt data rows are seeded manually
 * (tariffs, tax changes, regulatory action) tagged with a signal_code.
 */
export interface AltDataRule {
  signalCode: string;
  signalLabel: string;
  industryCode: string;
  direction: "pressure" | "tailwind";
  magnitude: 1 | 2 | 3;
  reasoning: string;
  historicalNote?: string;
}

export const ALT_DATA_RULES: AltDataRule[] = [
  { signalCode: "TARIFF_STEEL_25",  signalLabel: "25% steel import tariff",
    industryCode: "SEC_MAT", direction: "tailwind", magnitude: 2,
    reasoning: "Steel tariffs protect domestic Materials pricing power.",
    historicalNote: "2018 Section 232 tariffs preceded a 15% domestic steel-price rally." },
  { signalCode: "TARIFF_STEEL_25",  signalLabel: "25% steel import tariff",
    industryCode: "SEC_IND", direction: "pressure", magnitude: 2,
    reasoning: "Steel tariffs raise input costs for autos, machinery, construction.",
    historicalNote: "2018 tariffs compressed Industrials margins by ~150bps." },
  { signalCode: "TARIFF_CHINA_TECH", signalLabel: "China tech import tariff",
    industryCode: "SEC_TECH", direction: "pressure", magnitude: 3,
    reasoning: "Tariffs on China-manufactured electronics compress hardware gross margins.",
    historicalNote: "2018–2019 Section 301 rounds drove ~10% de-rating in hardware peers." },
  { signalCode: "CORP_TAX_HIKE",    signalLabel: "Corporate tax hike proposal",
    industryCode: "SEC_TECH", direction: "pressure", magnitude: 2,
    reasoning: "US corporate tax hike disproportionately hits high-margin domestic-profit Tech." },
  { signalCode: "CORP_TAX_CUT",     signalLabel: "Corporate tax cut",
    industryCode: "SEC_FIN", direction: "tailwind", magnitude: 2,
    reasoning: "Tax cuts flow directly to Financials' domestic-heavy earnings." },
  { signalCode: "EV_SUBSIDY_BOOST", signalLabel: "EV consumer subsidy expansion",
    industryCode: "SEC_CD",  direction: "tailwind", magnitude: 2,
    reasoning: "Subsidies pull forward EV demand across Consumer Discretionary autos." },
];