import type { ConfidencePenalty } from "@/lib/reliability/confidence";
import type { SourceTier } from "@/lib/reliability/tiers";
import type { FreshnessState } from "@/lib/reliability/freshness";

/**
 * Universal panel contract. Every panel — now and forever — renders
 * something that satisfies this shape. See spec §6 Universal panel contract.
 */
export interface Evidence {
  id: string;
  label: string;
  sourceName: string;
  tier: SourceTier;
  asOf: string; // ISO
  freshness: FreshnessState;
  agrees: boolean;
  url?: string;
}

export interface Point {
  id: string;
  label: string;
  weight?: number;
  detail?: string;
}

export interface CalculationTrace {
  formula: string;
  calcVersion: string;
  computedAt: string;
  inputs: Record<string, number | string | null>;
  weights?: Record<string, number>;
}

export interface Metric {
  label: string;
  value: string;
  delta?: string;
  tone?: "positive" | "negative" | "neutral" | "warning";
}

export interface PanelData {
  id: string;
  title: string;
  purpose: string;
  metrics: Metric[];
  whatChanged: string;
  whyItMatters: string;
  evidence: Evidence[];
  positives: Point[];
  deductions: Point[];
  verifyNext: string[];
  confidence: {
    value: number;
    penalties: ConfidencePenalty[];
  };
  calculation?: CalculationTrace;
}