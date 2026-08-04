import { getSwingTradesWorkspace } from "./workspace.functions";
import { persistSwingSignals, runSwingIntradayMonitor } from "./tracker.functions";
import { refreshSwingExpectationEvidence } from "./expectations.functions";
import {
  beginSwingMonitorRun,
  completeSwingMonitorRun,
  type SwingMonitorRunUpdate,
  type SwingMonitorSource,
} from "./runtime.server";

/**
 * Scheduled/manual swing monitor entry point. Capture today's actionable setup
 * snapshot before evaluating older signals and requesting live quotes. Every run
 * writes a durable heartbeat so the UI can prove that the scheduler actually ran
 * and succeeded rather than assuming that a configured cron job is healthy.
 */
export async function runScheduledSwingMonitor(source: SwingMonitorSource = "scheduled") {
  const runId = await beginSwingMonitorRun(source);
  const health: SwingMonitorRunUpdate = {};
  try {
    const workspace = await getSwingTradesWorkspace();
    health.workspaceAsOf = workspace.asOf;
    health.screened = workspace.universe.scoreScreened;
    health.deepScanned = workspace.universe.deepScanned;
    health.surfaced = workspace.universe.surfaced;

    const captured = await persistSwingSignals(workspace.candidates, workspace.modelVersion);
    health.captured = captured;
    const expectations = await refreshSwingExpectationEvidence(workspace.candidates);
    const monitor = await runSwingIntradayMonitor();
    health.evaluated = monitor.evaluated;
    health.quotesUpdated = monitor.quotesUpdated;
    health.failures = monitor.failures;
    health.providers = monitor.providers;

    await completeSwingMonitorRun(runId, "success", health);
    return {
      captured,
      expectations,
      workspaceAsOf: workspace.asOf,
      screened: workspace.universe.scoreScreened,
      deepScanned: workspace.universe.deepScanned,
      surfaced: workspace.universe.surfaced,
      ...monitor,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completeSwingMonitorRun(runId, "failed", health, message);
    throw error;
  }
}
