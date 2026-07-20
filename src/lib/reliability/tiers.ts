// Source hierarchy — Tier 1 is highest authority.
// See spec §19 Data-source strategy and reliability hierarchy.
export type SourceTier =
  | "tier1_official"
  | "tier2_regulated"
  | "tier3_reputable"
  | "tier4_alternative";

export const SOURCE_TIER_META: Record<
  SourceTier,
  { label: string; weight: number; description: string }
> = {
  tier1_official: {
    label: "Tier 1 — Official",
    weight: 1.0,
    description: "Central banks, statistical agencies, exchanges, filings.",
  },
  tier2_regulated: {
    label: "Tier 2 — Regulated aggregator",
    weight: 0.85,
    description: "Regulated market-data vendors, index providers.",
  },
  tier3_reputable: {
    label: "Tier 3 — Reputable secondary",
    weight: 0.65,
    description: "Established financial publishers, broker research.",
  },
  tier4_alternative: {
    label: "Tier 4 — Alternative / social",
    weight: 0.35,
    description: "Alt-data, scraped, social, unverified.",
  },
};

export function tierWeight(tier: SourceTier): number {
  return SOURCE_TIER_META[tier].weight;
}