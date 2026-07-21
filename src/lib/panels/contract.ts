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
  /** Optional inline sparkline for this metric. */
  trend?: TrendSeries;
}

/**
 * Chart primitives — deterministic point series used to render trend
 * charts and sparklines across panels. Zones colour bands drive the
 * "goldilocks / warning / danger" shading; projection is a dotted
 * forward path (linear or otherwise pre-computed server-side).
 */
export interface ChartPoint { t: string; v: number }
export type ChartZoneKind = "good" | "warn" | "bad";
export interface ChartZone {
  from?: number;
  to?: number;
  kind: ChartZoneKind;
  label?: string;
}
export type ChartFormat = "percent" | "number" | "index" | "bp";
export interface TrendSeries {
  points: ChartPoint[];
  projection?: ChartPoint[];
  zones?: ChartZone[];
  yLabel?: string;
  format?: ChartFormat;
  /** Optional secondary comparison series (e.g. peer / target line). */
  compare?: { label: string; points: ChartPoint[] };
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
  /**
   * Long-form background surfaced only in the expanded sheet. Explains what
   * the panel is measuring, the historical context behind it, which
   * assets/industries are typically affected, and what to watch next.
   */
  background?: {
    overview: string;
    historicalContext?: string;
    whatCauses?: string[];
    assetsAffected?: Array<{ label: string; note?: string }>;
    whatToWatch?: string[];
    examples?: Array<{ label: string; note?: string }>;
  };
  /**
   * 4–5 short forward-looking research bullets. Deterministically built
   * from current score components, active catalysts, and upcoming macro/
   * commodity/alt-data trends. Rendered under "Why it matters".
   */
  whyBullets?: string[];
  evidence: Evidence[];
  positives: Point[];
  deductions: Point[];
  verifyNext: VerifyCheck[];
  catalysts?: Catalyst[];
  /** Optional larger trend chart rendered under the metrics grid. */
  chart?: TrendSeries;
  confidence: {
    value: number;
    penalties: ConfidencePenalty[];
  };
  calculation?: CalculationTrace;
}