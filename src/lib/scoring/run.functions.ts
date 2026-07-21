import { createServerFn } from "@tanstack/react-start";

export const runAllScores = createServerFn({ method: "POST" }).handler(async () => {
  const { runScoresForAllAssets } = await import("./run.server");
  return runScoresForAllAssets();
});