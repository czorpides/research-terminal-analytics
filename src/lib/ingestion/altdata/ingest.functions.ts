import { createServerFn } from "@tanstack/react-start";

export const runAltDataIngestFn = createServerFn({ method: "POST" }).handler(async () => {
  const { runAltDataIngest } = await import("./ingest.server");
  return runAltDataIngest();
});