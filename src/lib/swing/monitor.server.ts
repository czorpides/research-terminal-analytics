import { getSwingTradesWorkspace } from "./workspace.functions";
import { persistSwingSignals, runSwingIntradayMonitor } from "./tracker.functions";
import { refreshSwingExpectationEvidence } from "./expectations.functions";

/**
 * Scheduled swing monitor entry point. Capture today's actionable setup snapshot
 * before evaluating older signals and requesting live quotes. Analyst expectation
 * evidence is refreshed for the highest-priority stale candidates through the
 * same quota-aware job, so the revision layer stays current even when nobody has
 * the Radar tab open.
 */
export async function runScheduledSwingMonitor() {
  const workspace = await getSwingTradesWorkspace();
  const captured = await persistSwingSignals(workspace.candidates, workspace.modelVersion);
  const expectations = await refreshSwingExpectationEvidence(workspace.candidates);
  const monitor = await runSwingIntradayMonitor();
  return {
    captured,
    expectations,
    workspaceAsOf: workspace.asOf,
    screened: workspace.universe.scoreScreened,
    deepScanned: workspace.universe.deepScanned,
    surfaced: workspace.universe.surfaced,
    ...monitor,
  };
}
