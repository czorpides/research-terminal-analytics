/**
 * Plain-English definitions for every fingerprint dimension and shared metric
 * on the history / radar panels. Rendered as tooltips and as the
 * "How to read this panel" strip.
 */
export interface GlossaryEntry {
  term: string;
  plain: string;   // one-sentence plain English
  whyItMatters: string;
  buckets?: Record<string, string>; // enum → meaning
}

export const HISTORY_GLOSSARY: Record<string, GlossaryEntry> = {
  rate_level: {
    term: "Rate level",
    plain: "Where the Fed's policy rate sits versus its own long-run history.",
    whyItMatters: "High rates tighten credit; low rates fuel risk-taking. Same shock plays out very differently at 0.5% vs 5%.",
    buckets: { low: "< 2%", mid: "2%–4%", high: "> 4%" },
  },
  rate_direction: {
    term: "Rate direction",
    plain: "Whether policy rates are rising, falling, or holding.",
    whyItMatters: "Direction changes lead the economy by 6–18 months. It is the single strongest cross-cycle signal.",
    buckets: { rising: "hikes underway", falling: "cuts underway", stable: "on hold" },
  },
  curve: {
    term: "Yield curve",
    plain: "10-year Treasury yield minus 2-year Treasury yield.",
    whyItMatters: "Inversion has preceded every US recession since 1970. Steepening usually marks the bottom.",
    buckets: { inverted: "10Y below 2Y — recession signal", flat: "≈0 — late cycle", steep: "10Y well above 2Y — early cycle" },
  },
  inflation: {
    term: "Inflation regime",
    plain: "Headline CPI year-over-year, bucketed.",
    whyItMatters: "High/moderate/low inflation changes what asset classes work. Value beats growth in high-inflation regimes; the opposite in low.",
    buckets: { low: "< 2%", moderate: "2%–4%", high: "> 4%" },
  },
  oil: {
    term: "Oil regime",
    plain: "WTI crude versus its 5-year normal range.",
    whyItMatters: "Oil spikes tax consumers; oil crashes squeeze producers and credit. Both have started recessions.",
    buckets: { low: "well below normal", normal: "in range", elevated: "above range", spike: "sharp acute move higher" },
  },
  unemployment_dir: {
    term: "Unemployment direction",
    plain: "Whether the US unemployment rate is trending up, down or flat.",
    whyItMatters: "Rising unemployment (Sahm rule) has flagged every US recession — but only after the fact. Direction matters more than the level.",
    buckets: { rising: "labour softening", falling: "labour tightening", stable: "flat" },
  },
  match_pct: {
    term: "Match %",
    plain: "Weighted overlap between today's macro fingerprint and the historical event's fingerprint.",
    whyItMatters: "50%+ means the setup rhymes on the dimensions that matter most for markets. 70%+ is a strong analog.",
  },
  coverage: {
    term: "Fingerprint coverage",
    plain: "How many of the six macro dimensions we currently have live data for.",
    whyItMatters: "Thicker coverage = more reliable match. Below 66% and the closest analog may be an artefact.",
  },
};

export function glossaryFor(term: string): GlossaryEntry | undefined {
  return HISTORY_GLOSSARY[term];
}