import { createServerFn } from "@tanstack/react-start";

import type { OpportunityRadarWorkspace } from "./workspace.functions";

export interface CandidateTechnicalStructure {
  state: "confirmed" | "basing" | "markdown" | "insufficient";
  score: number | null;
  confidence: number;
  baseLow: number | null;
  baseLowDate: string | null;
  invalidation: number | null;
  liquiditySweep: boolean;
  liquiditySweepDate: string | null;
  chochConfirmed: boolean;
  chochLevel: number | null;
  chochDate: string | null;
  firstHigherLow: boolean;
  higherLow: number | null;
  higherLowDate: string | null;
  ma50Reclaimed: boolean;
  ma50Retest: boolean;
  rsiDivergence: boolean;
  volumeRatio: number | null;
  computedAt: string | null;
  calcVersion: string | null;
}

export interface Stage1StructureWorkspace {
  asOf: string;
  structures: Array<{ assetId: string; structure: CandidateTechnicalStructure }>;
}

interface ScoreRow {
  subject_id: string;
  value: number;
  confidence: number;
  inputs: Record<string, unknown> | null;
  computed_at: string;
  calc_version: string;
}

export const getStage1StructureWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<Stage1StructureWorkspace> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("latest_asset_scores")
      .select("subject_id,value,confidence,inputs,computed_at,calc_version")
      .eq("score_type", "stage1")
      .limit(3_000);
    if (error) throw error;

    const rows = (data ?? []) as unknown as ScoreRow[];
    const structures = rows.map((row) => ({
      assetId: String(row.subject_id),
      structure: parseStage1(row),
    }));
    const asOf = rows.map((row) => row.computed_at).filter(Boolean).sort().at(-1) ?? new Date().toISOString();
    return { asOf, structures };
  },
);

/**
 * Enrich the established Radar workspace at the route boundary. This keeps the
 * large discovery workspace stable while making persisted Stage-1 structure
 * available to the v0.2 timing gate and company-research presentation.
 */
export function applyStage1Structures(
  workspace: OpportunityRadarWorkspace,
  stage1: Stage1StructureWorkspace,
): OpportunityRadarWorkspace {
  const byAsset = new Map(stage1.structures.map((item) => [item.assetId, item.structure]));
  return {
    ...workspace,
    calcVersion: `${workspace.calcVersion}+stage1.v0.1`,
    candidates: workspace.candidates.map((candidate) => ({
      ...candidate,
      technicalStructure: byAsset.get(candidate.assetId) ?? insufficientStructure(),
    })),
    modelNote: `${workspace.modelNote} Persisted Stage-1 structure is attached separately so base lows and structural invalidation never alter the fundamental score.`,
  };
}

function parseStage1(row: ScoreRow): CandidateTechnicalStructure {
  const inputs = row.inputs ?? {};
  const stateValue = text(inputs.state);
  const state = isStage1State(stateValue) ? stateValue : "insufficient";
  return {
    state,
    score: finite(row.value),
    confidence: finite(row.confidence) ?? 0,
    baseLow: finite(inputs.base_low),
    baseLowDate: text(inputs.base_low_date),
    invalidation: finite(inputs.structural_invalidation),
    liquiditySweep: flag(inputs.liquidity_sweep),
    liquiditySweepDate: text(inputs.liquidity_sweep_date),
    chochConfirmed: flag(inputs.choch_confirmed),
    chochLevel: finite(inputs.choch_level),
    chochDate: text(inputs.choch_date),
    firstHigherLow: flag(inputs.first_higher_low),
    higherLow: finite(inputs.higher_low),
    higherLowDate: text(inputs.higher_low_date),
    ma50Reclaimed: flag(inputs.ma50_reclaimed),
    ma50Retest: flag(inputs.ma50_retest),
    rsiDivergence: flag(inputs.rsi_bullish_divergence),
    volumeRatio: finite(inputs.up_down_volume_ratio_20d),
    computedAt: row.computed_at ?? null,
    calcVersion: row.calc_version ?? null,
  };
}

function insufficientStructure(): CandidateTechnicalStructure {
  return {
    state: "insufficient",
    score: null,
    confidence: 0,
    baseLow: null,
    baseLowDate: null,
    invalidation: null,
    liquiditySweep: false,
    liquiditySweepDate: null,
    chochConfirmed: false,
    chochLevel: null,
    chochDate: null,
    firstHigherLow: false,
    higherLow: null,
    higherLowDate: null,
    ma50Reclaimed: false,
    ma50Retest: false,
    rsiDivergence: false,
    volumeRatio: null,
    computedAt: null,
    calcVersion: null,
  };
}

function isStage1State(value: string | null): value is CandidateTechnicalStructure["state"] {
  return value === "confirmed" || value === "basing" || value === "markdown" || value === "insufficient";
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
