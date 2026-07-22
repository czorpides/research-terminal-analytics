export type EngineTone = "positive" | "negative" | "warning" | "neutral" | "primary";

export function toneForScore(value: number | null, positiveIsRisk = true): EngineTone {
  if (value == null || Math.abs(value) < 0.35) return "neutral";
  if (positiveIsRisk) return value > 0 ? "negative" : "positive";
  return value > 0 ? "positive" : "negative";
}
