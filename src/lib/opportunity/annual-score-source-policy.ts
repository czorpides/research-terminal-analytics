/**
 * Explicit legacy allowlist for pre-SEC annual statement score inputs.
 *
 * The SEC recovery programme collects RAW original filing evidence only.
 * No SEC-backed annual period can enter Piotroski or Magic Formula until a
 * separately reviewed semantic model and explicit scored-source release.
 *
 * Do not broaden this list when adding an ingestion provider.
 */
export const LEGACY_SCORED_ANNUAL_PROVIDER_CODES = ["fmp"] as const;

export function eligibleAnnualScoreSourceIds(
  providers: readonly {id:string;provider_code:string|null}[],
):string[] {
  const allowed = new Set<string>(LEGACY_SCORED_ANNUAL_PROVIDER_CODES);
  return [...new Set(providers.filter(p=>allowed.has(p.provider_code) &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(p.id)).map(p=>p.id))];
}
