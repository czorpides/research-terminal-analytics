import type {
  SwingV2EntryState,
  SwingV2MacroContext,
  SwingV2SetupType,
} from "./model-v2.ts";

export const PERMANENT_SWING_PRIORITY_SYMBOLS = ["XAUUSD", "XAGUSD"] as const;
export type PermanentSwingPrioritySymbol = (typeof PERMANENT_SWING_PRIORITY_SYMBOLS)[number];

export interface SwingPriorityPatternTracking {
  mode: "event_conditioned";
  symbol: PermanentSwingPrioritySymbol;
  macroRegime: "supportive" | "mixed" | "headwind" | "unavailable";
  eventConditions: string[];
  patternKeys: string[];
}

export function isPermanentSwingPriorityAsset(symbol: string): symbol is PermanentSwingPrioritySymbol {
  return PERMANENT_SWING_PRIORITY_SYMBOLS.includes(symbol as PermanentSwingPrioritySymbol);
}

/**
 * Keep permanent priority assets inside a bounded surfaced list without
 * changing their ranking score or moving them ahead of higher-ranked assets.
 */
export function surfaceWithPermanentPriority<T extends { symbol: string }>(
  ranked: T[],
  limit: number,
): T[] {
  const cap = Math.max(0, Math.floor(limit));
  if (cap === 0 || ranked.length === 0) return [];
  const surfaced = ranked.slice(0, cap);
  const surfacedSet = new Set(surfaced);
  const missingPriority = ranked.filter(
    (row) => isPermanentSwingPriorityAsset(row.symbol) && !surfacedSet.has(row),
  );
  if (!missingPriority.length) return surfaced;

  for (const priority of missingPriority) {
    let replacement = -1;
    for (let index = surfaced.length - 1; index >= 0; index -= 1) {
      if (!isPermanentSwingPriorityAsset(surfaced[index].symbol)) {
        replacement = index;
        break;
      }
    }
    if (replacement >= 0) surfaced[replacement] = priority;
    else if (surfaced.length < cap) surfaced.push(priority);
  }

  const originalOrder = new Map(ranked.map((row, index) => [row, index]));
  surfaced.sort((left, right) =>
    (originalOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (originalOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
  return surfaced;
}

/**
 * Produce stable research keys for gold/silver outcome calibration. The keys
 * describe the observed setup and macro event conditions only. They do not
 * alter ranking, entry quality or entry state.
 */
export function priorityPatternTracking(
  symbol: string,
  setup: SwingV2SetupType,
  entryState: SwingV2EntryState,
  macro: SwingV2MacroContext | null | undefined,
): SwingPriorityPatternTracking | null {
  if (!isPermanentSwingPriorityAsset(symbol)) return null;
  const macroRegime = !macro?.available
    ? "unavailable"
    : macro.score >= 68
      ? "supportive"
      : macro.score <= 35
        ? "headwind"
        : "mixed";
  const eventConditions = unique((macro?.eventConditions ?? []).filter(Boolean)).sort();
  const base = `asset:${symbol}`;
  const patternKeys = [
    base,
    `${base}|setup:${setup}`,
    `${base}|state:${entryState}`,
    `${base}|macro:${macroRegime}`,
    ...eventConditions.map((condition) => `${base}|event:${condition}|setup:${setup}`),
  ];
  return {
    mode: "event_conditioned",
    symbol,
    macroRegime,
    eventConditions,
    patternKeys: unique(patternKeys),
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
