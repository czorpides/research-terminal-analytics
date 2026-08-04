import { getSwingTradesWorkspace } from "./workspace.functions";
import { persistSwingSignals, runSwingIntradayMonitor } from "./tracker.functions";

/**
 * Scheduled swing monitor entry point. Capture today's actionable setup snapshot
 * before evaluating older signals and requesting live quotes. This means the
 * outcome ledger keeps growing even when nobody has the Radar tab open.
 */
export async function runScheduledSwingMonitor() {
  const workspace = await getSwingTradesWorkspace();
  const captured = await persistSwingSignals(workspace.candidates, workspace.modelVersion);
  const monitor = await runSwingIntradayMonitor();
  return {
    captured,
    workspaceAsOf: workspace.asOf,
    screened: workspace.universe.scoreScreened,
    deepScanned: workspace.universe.deepScanned,
    surfaced: workspace.universe.surfaced,
    ...monitor,
  };
}
