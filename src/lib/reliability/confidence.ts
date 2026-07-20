import { SOURCE_TIER_META, type SourceTier } from "./tiers";
import {
  DEFAULT_FRESHNESS,
  freshnessScore,
  type DataCategory,
} from "./freshness";

export interface ConfidenceInput {
  tier: SourceTier;
  category: DataCategory;
  ageSeconds: number;
  /** 0..1, 1 = all corroborating sources agree */
  crossSourceAgreement?: number;
  /** array of critical field names that were missing in raw payload */
  missingFields?: string[];
}

export interface ConfidencePenalty {
  code: string;
  points: number; // positive number, subtracted from 100
  reason: string;
}

export interface ConfidenceResult {
  value: number; // 0..100
  penalties: ConfidencePenalty[];
  inputs: ConfidenceInput;
}

/**
 * Deterministic, auditable confidence score. Every deduction is
 * emitted as a ConfidencePenalty so the UI can render "why 82 not 100".
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  const penalties: ConfidencePenalty[] = [];

  // Source tier
  const tierW = SOURCE_TIER_META[input.tier].weight;
  const tierDeduction = Math.round((1 - tierW) * 40);
  if (tierDeduction > 0) {
    penalties.push({
      code: "source_tier",
      points: tierDeduction,
      reason: `Source is ${SOURCE_TIER_META[input.tier].label} (weight ${tierW.toFixed(2)}).`,
    });
  }

  // Freshness
  const policy = DEFAULT_FRESHNESS[input.category];
  const fresh = freshnessScore(input.ageSeconds, policy);
  const freshDeduction = Math.round((1 - fresh) * 35);
  if (freshDeduction > 0) {
    penalties.push({
      code: "freshness",
      points: freshDeduction,
      reason: `Data age ${formatAge(input.ageSeconds)} exceeds fresh window for ${input.category}.`,
    });
  }

  // Cross-source agreement
  const agreement = input.crossSourceAgreement ?? 1;
  const agreementDeduction = Math.round((1 - agreement) * 20);
  if (agreementDeduction > 0) {
    penalties.push({
      code: "cross_source_disagreement",
      points: agreementDeduction,
      reason: `Corroborating sources agree ${(agreement * 100).toFixed(0)}%.`,
    });
  }

  // Missing fields
  const missing = input.missingFields ?? [];
  if (missing.length > 0) {
    penalties.push({
      code: "missing_fields",
      points: Math.min(missing.length * 5, 20),
      reason: `Missing critical field(s): ${missing.join(", ")}.`,
    });
  }

  const totalDeduction = penalties.reduce((s, p) => s + p.points, 0);
  const value = Math.max(0, Math.min(100, 100 - totalDeduction));
  return { value, penalties, inputs: input };
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}