import { runFredEngineIngest } from "./engine-ingest.server";

export function runUsLabourFredIngest(
  options: { yearsBack?: number; conceptCodes?: string[] } = {},
) {
  return runFredEngineIngest({ engine: "labour", ...options });
}
