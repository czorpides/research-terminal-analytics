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

/**
 * External catalyst — a macro, commodity or alt-data event that plausibly
 * pressures or supports the asset. Deterministic detection; audit-visible
 * reasoning line; optional historical analogue.
 */
export type CatalystDirection = "pressure" | "tailwind";
export type CatalystKind = "macro" | "commodity" | "alt_data";

export interface Catalyst {
  id: string;
  kind: CatalystKind;
  direction: CatalystDirection;
  magnitude: 1 | 2 | 3;
  headline: string;
  source: string;
  asOf: string; // ISO
  reasoning: string;
  historicalNote?: string;
  evidenceUrl?: string;
}

/**
 * A verify-next check is a machine-checkable follow-up. `verifier` says who
 * runs it (deterministic algorithm, external API, LLM, or the user), and
 * `status` is the last result. Phase 1 pre-fills these; live phases wire
 * real checkers that update `status`, `checkedAt`, and `detail`.
 */
export type VerifyVerifier = "algo" | "api" | "ai" | "manual";
export type VerifyStatus = "pending" | "pass" | "fail" | "stale" | "unavailable";

export interface VerifyCheck {
  id: string;
  label: string;
  verifier: VerifyVerifier;
  status: VerifyStatus;
  detail?: string;
  checkedAt?: string; // ISO
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
  verifyNext: VerifyCheck[];
  catalysts?: Catalyst[];
  confidence: {
    value: number;
    penalties: ConfidencePenalty[];
  };
  calculation?: CalculationTrace;
}