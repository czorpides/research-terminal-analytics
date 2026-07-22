import { runFredEngineIngest } from "./engine-ingest.server";

export function runUsMarketFredIngest(
  options: { yearsBack?: number; conceptCodes?: string[] } = {},
) {
  return runFredEngineIngest({ engine: "market", ...options });
}
