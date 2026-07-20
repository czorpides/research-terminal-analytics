/**
 * Stamp every derived value with a calculation version, timestamp and
 * hash of its inputs so historical results are reproducible and auditable.
 */
export interface CalcStamp {
  calcVersion: string;
  computedAt: string; // ISO
  inputsHash: string;
}

export function stampCalculation(
  calcVersion: string,
  inputs: unknown,
): CalcStamp {
  return {
    calcVersion,
    computedAt: new Date().toISOString(),
    inputsHash: hashInputs(inputs),
  };
}

function hashInputs(inputs: unknown): string {
  const json = stableStringify(inputs);
  // Small non-cryptographic hash (FNV-1a) — reproducible + short.
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}